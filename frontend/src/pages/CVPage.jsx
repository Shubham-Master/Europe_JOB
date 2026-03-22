import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { getCVHistory, profileSignature, removeCVSnapshot, saveCVSnapshot } from '../lib/storage'
import './CVPage.css'

export default function CVPage({ onActiveProfileChange }) {
  const [profile, setProfile]   = useState(null)
  const [history, setHistory]   = useState(() => getCVHistory())
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [uploaded, setUploaded] = useState(false)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [error, setError]       = useState('')
  const [activatingSignature, setActivatingSignature] = useState('')
  const [deletingSignature, setDeletingSignature] = useState('')
  const [activeSignature, setActiveSignature] = useState('')
  const fileRef = useRef()
  const navigate = useNavigate()

  const fetchProfile = async () => {
    const res = await api.get('/api/v1/cv/profile', {
      validateStatus: (status) => status === 200 || status === 404,
    })

    if (res.status === 404 || !res.data?.data) {
      setProfile(null)
      onActiveProfileChange?.('default')
      return null
    }

    setProfile(res.data.data)
    setUploaded(true)
    const signature = profileSignature(res.data.data)
    setActiveSignature(signature)
    onActiveProfileChange?.(signature)
    setHistory(saveCVSnapshot(res.data.data))
    return res.data.data
  }

  useEffect(() => {
    const loadProfile = async () => {
      setLoadingProfile(true)
      try {
        await fetchProfile()
      } catch (err) {
        setError(err.response?.data?.error || 'Could not load your saved CV profile.')
      }
      setLoadingProfile(false)
    }

    loadProfile()
  }, [])

  const handleFile = async (file) => {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      alert('Please upload a PDF file')
      return
    }

    setUploading(true)
    setError('')
    const form = new FormData()
    form.append('cv', file)

    try {
      const res = await api.post('/api/v1/cv/parse', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      setUploaded(true)

      const profileData = res.data?.data?.profile
      if (profileData) {
        setProfile(profileData)
        const signature = profileSignature(profileData)
        setActiveSignature(signature)
        onActiveProfileChange?.(signature)
        setHistory(saveCVSnapshot(profileData, file.name))
      } else {
        await fetchProfile()
      }
    } catch (err) {
      setUploaded(false)
      setError(err.response?.data?.error || 'Could not parse the CV. Check your Gemini API key and try again.')
    }
    setUploading(false)
  }

  const activateHistoryItem = async (item) => {
    if (!item?.profile) return

    const nextSignature = profileSignature(item.profile)
    setActivatingSignature(nextSignature)
    setError('')

    try {
      const res = await api.post('/api/v1/cv/activate', {
        filename: item.filename || '',
        profile: item.profile,
      })

      const activeProfile = res.data?.data || item.profile
      setProfile(activeProfile)
      setUploaded(true)
      const signature = profileSignature(activeProfile)
      setActiveSignature(signature)
      onActiveProfileChange?.(signature)
      setHistory(saveCVSnapshot(activeProfile, item.filename || ''))
    } catch (err) {
      setError(err.response?.data?.error || 'Could not activate this CV. Please try again.')
    }

    setActivatingSignature('')
  }

  const deleteHistoryItem = async (item) => {
    if (!item?.profile) return

    const itemSignature = item._signature || profileSignature(item.profile)
    const deletingActive = activeSignature === itemSignature
    const confirmed = window.confirm(
      deletingActive
        ? 'Delete this active CV? This will remove the current live CV from your workspace until you activate or upload another one.'
        : 'Delete this CV snapshot from this browser?'
    )

    if (!confirmed) return

    setDeletingSignature(itemSignature)
    setError('')

    try {
      if (deletingActive) {
        await api.delete('/api/v1/cv/profile')
      }

      const nextHistory = removeCVSnapshot(itemSignature)
      setHistory(nextHistory)

      const currentPreviewSignature = profile ? profileSignature(profile) : ''
      if (deletingActive) {
        setProfile(null)
        setUploaded(false)
        setActiveSignature('default')
        onActiveProfileChange?.('default')
      } else if (currentPreviewSignature === itemSignature) {
        const activeItem = nextHistory.find((entry) => (
          (entry._signature || profileSignature(entry.profile)) === activeSignature
        ))
        setProfile(activeItem?.profile || null)
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Could not delete this CV right now.')
    }

    setDeletingSignature('')
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    handleFile(e.dataTransfer.files[0])
  }

  return (
    <div className="cv-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">My CV</h1>
          <p className="page-sub">Upload your CV to update your job matching profile</p>
        </div>
        {(profile || history.length > 0) && (
          <button
            type="button"
            className="cv-pipeline-btn"
            onClick={() => navigate('/pipeline')}
          >
            ▶ Run Pipeline
          </button>
        )}
      </div>

      {/* Upload Zone */}
      <div
        className={`upload-zone ${dragOver ? 'drag-over' : ''} ${uploading ? 'uploading' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pdf"
          style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files[0])}
        />
        <div className="upload-icon">{uploading ? '⏳' : uploaded ? '✅' : '📄'}</div>
        <div className="upload-text">
          {uploading ? 'Parsing CV and enriching your profile...' :
           uploaded  ? 'CV uploaded & parsed!' :
           'Drop your CV here or click to upload'}
        </div>
        <div className="upload-sub">PDF only · Our CV parser extracts your skills profile and uses Gemini to enrich the result</div>
      </div>

      {error && <div className="page-error">{error}</div>}

      {!loadingProfile && !profile && (
        <div className="empty-card">
          <div className="empty-title">No CV parsed yet</div>
          <div className="empty-copy">
            Upload your latest PDF CV to create a real skills profile. Nothing should appear here until a CV is actually parsed.
          </div>
        </div>
      )}

      {/* Profile Preview */}
      {profile && (
        <div className="profile-card">
          <div className="profile-header">
            <div className="profile-avatar">{profile.full_name?.[0] || 'S'}</div>
            <div>
              <h2 className="profile-name">{profile.full_name}</h2>
              <div className="profile-title">{profile.current_title}</div>
              <div className="profile-meta">
                <span className="badge-seniority">{profile.seniority_level}</span>
                <span className="profile-exp">{profile.years_of_experience} years exp</span>
              </div>
            </div>
          </div>

          <div className="profile-sections">
            <Section title="💻 Technical Skills" items={profile.technical_skills} color="accent" />
            <Section title="🔧 Languages"         items={profile.programming_languages} color="accent2" />
            <Section title="🛠️ Frameworks"        items={profile.frameworks_and_tools} color="text2" />
            <Section title="🎯 Target Roles"      items={profile.target_roles} color="green" />
            <Section title="🔑 Top Keywords"      items={profile.top_keywords} color="warn" />
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="history-card">
          <div className="history-header">
            <div>
              <h3 className="history-title">Recent CV Snapshots</h3>
              <p className="history-sub">Use these to preview older parsed versions in this browser.</p>
            </div>
          </div>
          <div className="history-list">
            {history.map(item => {
              const itemSignature = item._signature || profileSignature(item.profile)
              return (
              <div
                key={item.id}
                className="history-item"
              >
                <button
                  className="history-preview"
                  onClick={() => setProfile(item.profile)}
                >
                  <span className="history-name">{item.profile?.full_name || 'CV snapshot'}</span>
                  {item.filename && (
                    <span className="history-file">{item.filename}</span>
                  )}
                  <span className="history-meta">
                    {item.profile?.current_title || 'Untitled profile'} · {new Date(item.saved_at).toLocaleString()}
                  </span>
                </button>
                <div className="history-actions">
                  {activeSignature === itemSignature ? (
                    <>
                      <span className="history-badge">Active CV</span>
                      <button
                        type="button"
                        className="history-delete"
                        onClick={() => deleteHistoryItem(item)}
                        disabled={deletingSignature === itemSignature}
                      >
                        {deletingSignature === itemSignature ? 'Deleting...' : 'Delete'}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="history-activate"
                        onClick={() => activateHistoryItem(item)}
                        disabled={activatingSignature === itemSignature}
                      >
                        {activatingSignature === itemSignature ? 'Activating...' : 'Use this CV'}
                      </button>
                      <button
                        type="button"
                        className="history-delete"
                        onClick={() => deleteHistoryItem(item)}
                        disabled={deletingSignature === itemSignature}
                      >
                        {deletingSignature === itemSignature ? 'Deleting...' : 'Delete'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )})}
          </div>
          <div className="history-tip">
            Need to adapt your CV for a specific role? Select a job and use the tailored bullets in the Cover Letter tab.
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, items, color }) {
  if (!items?.length) return null
  return (
    <div className="profile-section">
      <div className="section-title">{title}</div>
      <div className="tags">
        {items.map((item, i) => (
          <span key={i} className={`tag tag-${color}`}>{item}</span>
        ))}
      </div>
    </div>
  )
}
