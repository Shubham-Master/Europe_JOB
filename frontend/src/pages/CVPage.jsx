import React, { useEffect, useRef, useState } from 'react'
import api from '../lib/api'
import { getCVHistory, saveCVSnapshot } from '../lib/storage'
import './CVPage.css'

export default function CVPage() {
  const [profile, setProfile]   = useState(null)
  const [history, setHistory]   = useState(() => getCVHistory())
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [uploaded, setUploaded] = useState(false)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [error, setError]       = useState('')
  const fileRef = useRef()

  useEffect(() => {
    const fetchProfile = async () => {
      setLoadingProfile(true)
      try {
        const res = await api.get('/api/v1/cv/profile')
        if (res.data.data) {
          setProfile(res.data.data)
          setUploaded(true)
          setHistory(saveCVSnapshot(res.data.data))
        }
      } catch (err) {
        if (err.response?.status !== 404) {
          setError(err.response?.data?.error || 'Could not load your saved CV profile.')
        }
      }
      setLoadingProfile(false)
    }

    fetchProfile()
  }, [])

  const handleFile = async (file) => {
    if (!file || !file.name.endsWith('.pdf')) {
      alert('Please upload a PDF file')
      return
    }

    setUploading(true)
    setError('')
    const form = new FormData()
    form.append('cv', file)

    try {
      await api.post('/api/v1/cv/parse', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setUploaded(true)
      // Fetch updated profile
      const profileRes = await api.get('/api/v1/cv/profile')
      if (profileRes.data.data) {
        setProfile(profileRes.data.data)
        setHistory(saveCVSnapshot(profileRes.data.data, file.name))
      }
    } catch (err) {
      setUploaded(false)
      setError(err.response?.data?.error || 'Could not parse the CV. Check your Gemini API key and try again.')
    }
    setUploading(false)
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
          {uploading ? 'Parsing CV with Gemini...' :
           uploaded  ? 'CV uploaded & parsed!' :
           'Drop your CV here or click to upload'}
        </div>
        <div className="upload-sub">PDF only · Gemini will extract your skills profile</div>
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
            {history.map(item => (
              <button
                key={item.id}
                className="history-item"
                onClick={() => setProfile(item.profile)}
              >
                <span className="history-name">{item.filename || item.profile?.full_name || 'CV snapshot'}</span>
                <span className="history-meta">
                  {item.profile?.current_title || 'Untitled profile'} · {new Date(item.saved_at).toLocaleString()}
                </span>
              </button>
            ))}
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
