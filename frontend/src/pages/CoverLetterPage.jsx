import React, { useState } from 'react'
import api from '../lib/api'
import './CoverLetterPage.css'

const MOCK_COVER_LETTER = `Dear Hiring Team at Zalando,

Zalando's engineering culture — particularly your commitment to microservices at scale and developer autonomy — is exactly the environment where I thrive. As someone who has built and maintained distributed backend systems, I'm genuinely excited about the Senior Backend Engineer role.

Over the past 4 years, I've led backend development using Python and Go, delivering APIs that handle 50K+ requests/minute with 99.9% uptime. At my current role, I reduced system latency by 40% through query optimization and caching strategies — the kind of impact I'm eager to replicate at Zalando's scale.

I'm fully open to relocating to Berlin and am available to start within 4 weeks. I'd love the opportunity to discuss how my experience aligns with your team's goals.

Best regards,
Shubham`

export default function CoverLetterPage({ job }) {
  const [coverLetter, setCoverLetter]   = useState(job ? '' : MOCK_COVER_LETTER)
  const [bullets, setBullets]           = useState([])
  const [missing, setMissing]           = useState([])
  const [loading, setLoading]           = useState(false)
  const [generated, setGenerated]       = useState(!job)
  const [error, setError]               = useState('')
  const [copied, setCopied]             = useState(false)
  const [activeTab, setActiveTab]       = useState('letter')

  const generate = async () => {
    if (!job) return
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/api/v1/cover-letter', {
        job_id: job.id,
        job_title: job.title,
        company: job.company,
        location: job.location,
        job_url: job.url,
        job_description: job.description || '',
        match_score: job.match_score || 0,
      })
      setCoverLetter(res.data.data?.cover_letter || MOCK_COVER_LETTER)
      setBullets(res.data.data?.tailored_bullets || [])
      setMissing(res.data.data?.missing_skills || [])
      setGenerated(true)
    } catch (err) {
      setGenerated(false)
      setError(err.response?.data?.error || 'Could not generate the cover letter. Please upload your CV and check the API key.')
    }
    setLoading(false)
  }

  const copy = () => {
    navigator.clipboard.writeText(coverLetter)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const download = () => {
    const blob = new Blob([coverLetter], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `cover_letter_${job?.company || 'job'}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="cl-page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Cover Letter</h1>
          <p className="page-sub">
            {job ? `${job.title} @ ${job.company} · ${job.match_score}% match` : 'Select a job from Jobs tab'}
          </p>
        </div>
        {job && !generated && (
          <button className="btn-primary-lg" onClick={generate} disabled={loading}>
            {loading ? '⏳ Generating...' : '✨ Generate with AI'}
          </button>
        )}
        {generated && (
          <div className="action-row">
            <button className="btn-ghost-sm" onClick={generate} disabled={loading}>
              🔄 Regenerate
            </button>
            <button className="btn-ghost-sm" onClick={copy}>
              {copied ? '✅ Copied!' : '📋 Copy'}
            </button>
            <button className="btn-primary-sm" onClick={download}>
              ⬇️ Download
            </button>
          </div>
        )}
      </div>

      {!job && !generated && (
        <div className="no-job-state">
          <div className="no-job-icon">✍️</div>
          <h3>No job selected</h3>
          <p>Go to the Jobs tab, find a match, and click "Generate Cover Letter"</p>
        </div>
      )}

      {error && <div className="page-error">{error}</div>}

      {generated && (
        <>
          {/* Tabs */}
          <div className="tabs">
            <button className={`tab ${activeTab === 'letter' ? 'active' : ''}`} onClick={() => setActiveTab('letter')}>
              📝 Cover Letter
            </button>
            <button className={`tab ${activeTab === 'bullets' ? 'active' : ''}`} onClick={() => setActiveTab('bullets')}>
              🎯 Tailored CV Bullets
            </button>
            {missing.length > 0 && (
              <button className={`tab ${activeTab === 'gaps' ? 'active' : ''}`} onClick={() => setActiveTab('gaps')}>
                ⚠️ Skill Gaps ({missing.length})
              </button>
            )}
          </div>

          {/* Cover Letter Editor */}
          {activeTab === 'letter' && (
            <div className="editor-wrap">
              <div className="editor-header">
                <span className="editor-label">EDITABLE · ~{coverLetter.split(' ').length} words</span>
                <span className="editor-hint">Click anywhere to edit</span>
              </div>
              <textarea
                className="cover-letter-editor"
                value={coverLetter}
                onChange={e => setCoverLetter(e.target.value)}
                rows={16}
              />
            </div>
          )}

          {/* Tailored Bullets */}
          {activeTab === 'bullets' && (
            <div className="bullets-wrap">
              <p className="bullets-info">
                Paste these into your CV for this specific application. They're rewritten to match the job's keywords.
              </p>
              <div className="bullets-list">
                {bullets.map((b, i) => (
                  <div key={i} className="bullet-item">
                    <span className="bullet-text">{b}</span>
                    <button className="bullet-copy" onClick={() => navigator.clipboard.writeText(b)}>Copy</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Skill Gaps */}
          {activeTab === 'gaps' && (
            <div className="gaps-wrap">
              <p className="gaps-info">These skills appear in the JD but not in your CV. Consider adding them if you have experience.</p>
              <div className="gaps-list">
                {missing.map((s, i) => (
                  <span key={i} className="gap-tag">⚠️ {s}</span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
