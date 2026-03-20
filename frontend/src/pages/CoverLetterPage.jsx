import React, { useEffect, useState } from 'react'
import api from '../lib/api'
import { getCoverLetterHistory, getLatestCoverLetter, saveCoverLetterResult } from '../lib/storage'
import './CoverLetterPage.css'

export default function CoverLetterPage({ job }) {
  const [result, setResult]             = useState(null)
  const [history, setHistory]           = useState(() => getCoverLetterHistory())
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')
  const [copied, setCopied]             = useState(false)
  const [activeTab, setActiveTab]       = useState('letter')

  useEffect(() => {
    const items = getCoverLetterHistory()
    setHistory(items)

    if (job?.id) {
      setResult(getLatestCoverLetter(job.id))
      return
    }

    setResult(items[0] || null)
  }, [job])

  const hydrateResult = (payload) => {
    const safeJob = payload?.job || (job ? {
      id: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      url: job.url,
      match_score: job.match_score || 0,
    } : null)

    return {
      ...payload,
      job: safeJob,
      tailored_bullets: Array.isArray(payload?.tailored_bullets) ? payload.tailored_bullets : [],
      missing_skills: Array.isArray(payload?.missing_skills) ? payload.missing_skills : [],
    }
  }

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
      const next = hydrateResult(res.data.data || {})
      setResult(next)
      setHistory(saveCoverLetterResult(next))
      setActiveTab('letter')
    } catch (err) {
      setError(err.response?.data?.error || 'Could not generate the cover letter. Please upload your CV and check the API key.')
    }
    setLoading(false)
  }

  const copy = () => {
    if (!result?.cover_letter) return
    navigator.clipboard.writeText(result.cover_letter)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const download = () => {
    if (!result?.cover_letter) return
    const blob = new Blob([result.cover_letter], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `cover_letter_${result?.job?.company || job?.company || 'job'}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const generated = Boolean(result?.cover_letter)
  const activeJob = job || result?.job
  const bullets = result?.tailored_bullets || []
  const missing = result?.missing_skills || []
  const coverLetterText = result?.cover_letter || ''
  const wordCount = coverLetterText.trim() ? coverLetterText.trim().split(/\s+/).length : 0

  return (
    <div className="cl-page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Cover Letter</h1>
          <p className="page-sub">
            {activeJob ? `${activeJob.title} @ ${activeJob.company} · ${activeJob.match_score || 0}% match` : 'Select a job from Jobs tab'}
          </p>
        </div>
        {job && !generated && (
          <button className="btn-primary-lg" onClick={generate} disabled={loading}>
            {loading ? '⏳ Generating...' : '✨ Generate with AI'}
          </button>
        )}
        {generated && (
          <div className="action-row">
            {job && (
              <button className="btn-ghost-sm" onClick={generate} disabled={loading}>
                🔄 Regenerate
              </button>
            )}
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

      {!generated && history.length > 0 && (
        <div className="history-panel">
          <div className="history-panel-title">Recent Cover Letters</div>
          <div className="history-panel-sub">Open a previous result without regenerating it.</div>
          <div className="history-panel-list">
            {history.map((item, index) => (
              <button
                key={`${item?.job?.id || 'manual'}-${item?.saved_at || index}`}
                className="history-entry"
                onClick={() => {
                  setResult(item)
                  setActiveTab('letter')
                }}
              >
                <span className="history-entry-title">{item?.job?.title || 'Saved letter'} @ {item?.job?.company || 'Unknown company'}</span>
                <span className="history-entry-meta">{new Date(item.saved_at || item.generated_at || Date.now()).toLocaleString()}</span>
              </button>
            ))}
          </div>
        </div>
      )}

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
                <span className="editor-label">EDITABLE · ~{wordCount} words</span>
                <span className="editor-hint">Click anywhere to edit</span>
              </div>
              <textarea
                className="cover-letter-editor"
                value={coverLetterText}
                onChange={e => setResult(current => current ? { ...current, cover_letter: e.target.value } : current)}
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
                {bullets.length === 0 && (
                  <div className="empty-inline">No tailored bullets saved for this result yet.</div>
                )}
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
                {missing.length === 0 && <div className="empty-inline">No major skill gaps were flagged for this saved result.</div>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
