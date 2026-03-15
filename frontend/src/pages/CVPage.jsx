import React, { useState, useRef } from 'react'
import axios from 'axios'
import './CVPage.css'

const MOCK_PROFILE = {
  full_name: 'Shubham Kumar',
  current_title: 'Software Engineer',
  seniority_level: 'mid',
  years_of_experience: 3,
  technical_skills: ['Python', 'Go', 'REST APIs', 'PostgreSQL', 'Docker', 'Redis'],
  programming_languages: ['Python', 'Go', 'JavaScript', 'SQL'],
  frameworks_and_tools: ['FastAPI', 'Gin', 'React', 'Docker', 'GitHub Actions'],
  domains: ['backend', 'api development', 'cloud'],
  top_keywords: ['Python', 'Go', 'API', 'Backend', 'Microservices', 'Docker'],
  target_roles: ['Backend Engineer', 'Software Engineer', 'Python Developer'],
}

export default function CVPage() {
  const [profile, setProfile]   = useState(MOCK_PROFILE)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [uploaded, setUploaded] = useState(false)
  const fileRef = useRef()

  const handleFile = async (file) => {
    if (!file || !file.name.endsWith('.pdf')) {
      alert('Please upload a PDF file')
      return
    }

    setUploading(true)
    const form = new FormData()
    form.append('cv', file)

    try {
      const res = await axios.post('/api/v1/cv/parse', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setUploaded(true)
      // Fetch updated profile
      const profileRes = await axios.get('/api/v1/cv/profile')
      if (profileRes.data.data) setProfile(profileRes.data.data)
    } catch {
      // Demo mode
      setUploaded(true)
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
          {uploading ? 'Parsing CV with Claude AI...' :
           uploaded  ? 'CV uploaded & parsed!' :
           'Drop your CV here or click to upload'}
        </div>
        <div className="upload-sub">PDF only · Claude AI will extract your skills profile</div>
      </div>

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
