import React, { useEffect, useState } from 'react'
import api from '../lib/api'
import { getCoverLetterHistory, getLatestCoverLetter, saveCoverLetterResult } from '../lib/storage'
import './CoverLetterPage.css'

const DEFAULT_AI_SETTINGS = {
  tone: 'confident',
  length: 'medium',
  focus: 'skills match',
  notes: '',
}

function buildCVDraft(result) {
  if (!result) return ''

  const activeJob = result?.job || {}
  const bullets = Array.isArray(result?.tailored_bullets) ? result.tailored_bullets : []
  const missing = Array.isArray(result?.missing_skills) ? result.missing_skills : []
  const keywords = Array.isArray(result?.keywords_to_add) ? result.keywords_to_add : []

  const sections = [
    `TARGET ROLE\n${activeJob?.title || 'Target role'}${activeJob?.company ? ` @ ${activeJob.company}` : ''}`,
    `SUMMARY FOCUS\nRewrite your top summary lines around measurable impact, the employer's stack, and why your background fits this role.`,
    bullets.length > 0
      ? `EXPERIENCE BULLETS TO ADAPT\n${bullets.map((bullet) => `- ${bullet}`).join('\n')}`
      : '',
    keywords.length > 0
      ? `KEYWORDS TO REFLECT\n${keywords.map((keyword) => `- ${keyword}`).join('\n')}`
      : '',
    missing.length > 0
      ? `ONLY ADD IF TRUE IN YOUR EXPERIENCE\n${missing.map((skill) => `- ${skill}`).join('\n')}`
      : '',
    'FINAL CHECK\nKeep every line truthful. Quantify outcomes where you can, and remove any bullet that does not match your real work.',
  ].filter(Boolean)

  return sections.join('\n\n')
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function openPrintableDocument({ title, subtitle, content }) {
  const safeContent = escapeHtml(content)
  const safeTitle = escapeHtml(title)
  const safeSubtitle = escapeHtml(subtitle)
  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${safeTitle}</title>
        <style>
          @page { size: A4; margin: 18mm; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: "Inter", "Segoe UI", sans-serif;
            color: #132033;
            background: #eef3f8;
          }
          .sheet {
            min-height: 100vh;
            padding: 28px 32px 32px;
            background:
              radial-gradient(circle at top right, rgba(0, 190, 170, 0.10), transparent 28%),
              linear-gradient(180deg, #ffffff, #f4f8fb);
          }
          .eyebrow {
            color: #127f74;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.14em;
            text-transform: uppercase;
            margin-bottom: 12px;
          }
          h1 {
            margin: 0 0 8px;
            font-size: 28px;
            line-height: 1.2;
          }
          .subtitle {
            margin: 0 0 22px;
            color: #4d637d;
            font-size: 14px;
          }
          .body {
            border: 1px solid rgba(18, 127, 116, 0.14);
            border-radius: 18px;
            padding: 22px 24px;
            background: rgba(255, 255, 255, 0.92);
            white-space: pre-wrap;
            font-size: 14px;
            line-height: 1.75;
          }
          .footer {
            margin-top: 18px;
            color: #6b7f97;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="eyebrow">EuroJobs Export</div>
          <h1>${safeTitle}</h1>
          <p class="subtitle">${safeSubtitle}</p>
          <div class="body">${safeContent}</div>
          <div class="footer">Tip: In the browser print dialog, choose "Save as PDF" to download this layout.</div>
        </div>
        <script>
          window.onload = function () {
            setTimeout(function () {
              window.focus();
              window.print();
            }, 250);
          };
        </script>
      </body>
    </html>
  `

  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const printWindow = window.open(url, '_blank')
  if (!printWindow) {
    URL.revokeObjectURL(url)
    return false
  }

  const cleanup = () => URL.revokeObjectURL(url)
  printWindow.addEventListener('beforeunload', cleanup, { once: true })
  return true
}

function normalizeCoverLetterError(err) {
  const raw = err?.response?.data?.error || ''
  const lower = raw.toLowerCase()

  if (
    lower.includes('quota exceeded') ||
    lower.includes('rate limit') ||
    lower.includes('you exceeded your current quota')
  ) {
    return 'Gemini free-tier limit reached for now. New AI generation is temporarily unavailable. Use a saved cover letter below or try again later.'
  }

  return raw || 'Could not generate the cover letter. Please upload your CV and check the API key.'
}

function buildCoverLetterPayload(job, extras = {}) {
  return {
    job_id: job.id,
    job_title: job.title,
    company: job.company,
    location: job.location,
    job_url: job.url,
    job_description: job.description || '',
    match_score: job.match_score || 0,
    ...extras,
  }
}

function generationModeLabel(mode) {
  return mode === 'ai' ? 'AI version' : 'Draft ready'
}

export default function CoverLetterPage({ job, onJobChange }) {
  const [result, setResult] = useState(null)
  const [history, setHistory] = useState(() => getCoverLetterHistory())
  const [loading, setLoading] = useState(false)
  const [loadingAction, setLoadingAction] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [cvDraft, setCvDraft] = useState('')
  const [activeTab, setActiveTab] = useState('letter')
  const [showAISettings, setShowAISettings] = useState(false)
  const [aiSettings, setAiSettings] = useState(DEFAULT_AI_SETTINGS)

  useEffect(() => {
    const items = getCoverLetterHistory()
    setHistory(items)

    if (!job?.id) {
      setResult(null)
      setCvDraft('')
      setActiveTab('letter')
      return
    }

    const saved = getLatestCoverLetter(job.id)
    setResult(saved)
    setCvDraft(saved ? buildCVDraft(saved) : '')
    setActiveTab('letter')
  }, [job?.id])

  const consumePendingRequest = () => {
    if (!job?.cover_letter_request_id || !onJobChange) return
    onJobChange((current) => {
      if (!current || current.id !== job.id) return current
      return {
        ...current,
        cover_letter_request_id: null,
      }
    })
  }

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
      keywords_to_add: Array.isArray(payload?.keywords_to_add) ? payload.keywords_to_add : [],
      generation_mode: payload?.generation_mode || 'draft',
      generation_preferences: payload?.generation_preferences || {},
    }
  }

  const applyResult = (payload) => {
    const next = hydrateResult(payload)
    setResult(next)
    setCvDraft(buildCVDraft(next))
    setHistory(saveCoverLetterResult(next))
    setActiveTab('letter')
  }

  const generateDraft = async ({ consume = false } = {}) => {
    if (!job) return

    setLoading(true)
    setLoadingAction('draft')
    setError('')

    try {
      const res = await api.post('/api/v1/cover-letter', buildCoverLetterPayload(job, {
        generation_mode: 'draft',
      }))
      applyResult(res.data.data || {})
    } catch (err) {
      setError(normalizeCoverLetterError(err))
    } finally {
      if (consume) consumePendingRequest()
      setLoading(false)
      setLoadingAction('')
    }
  }

  const generateWithAI = async () => {
    if (!job) return

    setLoading(true)
    setLoadingAction('ai')
    setError('')

    try {
      const res = await api.post('/api/v1/cover-letter', buildCoverLetterPayload(job, {
        generation_mode: 'ai',
        tone: aiSettings.tone,
        length: aiSettings.length,
        focus: aiSettings.focus,
        notes: aiSettings.notes,
      }))
      applyResult(res.data.data || {})
      setShowAISettings(false)
    } catch (err) {
      setError(normalizeCoverLetterError(err))
    } finally {
      setLoading(false)
      setLoadingAction('')
    }
  }

  useEffect(() => {
    if (!job?.id || !job?.cover_letter_request_id) return
    generateDraft({ consume: true })
  }, [job?.cover_letter_request_id, job?.id])

  const copy = () => {
    const textToCopy = activeTab === 'draft' ? cvDraft : result?.cover_letter
    if (!textToCopy) return
    navigator.clipboard.writeText(textToCopy)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const download = () => {
    const isDraft = activeTab === 'draft'
    const content = isDraft ? cvDraft : result?.cover_letter
    if (!content) return

    const title = isDraft ? 'Tailored CV Draft' : 'Cover Letter'
    const activeJob = job || result?.job
    const subtitle = activeJob
      ? `${activeJob.title || 'Selected role'}${activeJob.company ? ` @ ${activeJob.company}` : ''}`
      : 'EuroJobs export'

    openPrintableDocument({ title, subtitle, content })
  }

  const generated = Boolean(result?.cover_letter)
  const activeJob = job || result?.job
  const bullets = result?.tailored_bullets || []
  const missing = result?.missing_skills || []
  const keywords = result?.keywords_to_add || []
  const coverLetterText = result?.cover_letter || ''
  const wordCount = coverLetterText.trim() ? coverLetterText.trim().split(/\s+/).length : 0
  const draftWordCount = cvDraft.trim() ? cvDraft.trim().split(/\s+/).length : 0
  const generationMode = result?.generation_mode || 'draft'

  return (
    <div className="cl-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Cover Letter</h1>
          <p className="page-sub">
            {activeJob ? `${activeJob.title} @ ${activeJob.company} · ${activeJob.match_score || 0}% match` : 'Select a job from Jobs tab'}
          </p>
        </div>

        {activeJob && !generated && (
          <button className="btn-primary-lg" onClick={() => generateDraft()} disabled={loading}>
            {loading && loadingAction === 'draft' ? '⏳ Building draft...' : '✍️ Generate Cover Letter'}
          </button>
        )}

        {generated && (
          <div className="action-row">
            <span className={`generation-pill ${generationMode}`}>{generationModeLabel(generationMode)}</span>
            <button className="btn-ghost-sm" onClick={() => setShowAISettings(true)} disabled={loading}>
              {loading && loadingAction === 'ai' ? '⏳ Regenerating...' : '✨ Regenerate with AI'}
            </button>
            <button className="btn-ghost-sm" onClick={copy}>
              {copied ? '✅ Copied!' : '📋 Copy'}
            </button>
            <button className="btn-primary-sm" onClick={download}>
              ⬇️ Save PDF
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
                  setCvDraft(buildCVDraft(item))
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
          <div className="tabs">
            <button className={`tab ${activeTab === 'letter' ? 'active' : ''}`} onClick={() => setActiveTab('letter')}>
              📝 Cover Letter
            </button>
            <button className={`tab ${activeTab === 'draft' ? 'active' : ''}`} onClick={() => setActiveTab('draft')}>
              🎯 CV Draft
            </button>
            {missing.length > 0 && (
              <button className={`tab ${activeTab === 'gaps' ? 'active' : ''}`} onClick={() => setActiveTab('gaps')}>
                ⚠️ Skill Gaps ({missing.length})
              </button>
            )}
          </div>

          {activeTab === 'letter' && (
            <div className="editor-wrap">
              <div className="editor-header">
                <span className="editor-label">EDITABLE · ~{wordCount} words</span>
                <span className="editor-hint">Click anywhere to edit</span>
              </div>
              <textarea
                className="cover-letter-editor"
                value={coverLetterText}
                onChange={(e) => setResult((current) => current ? { ...current, cover_letter: e.target.value } : current)}
                rows={16}
              />
            </div>
          )}

          {activeTab === 'draft' && (
            <div className="bullets-wrap">
              <p className="bullets-info">
                This tab is now your working CV workspace. Start from the tailored bullets, then edit the draft below before saving it as PDF.
              </p>
              <div className="bullets-list">
                {bullets.length === 0 && (
                  <div className="empty-inline">No tailored bullets were generated for this result yet.</div>
                )}
                {bullets.map((b, i) => (
                  <div key={i} className="bullet-item">
                    <span className="bullet-text">{b}</span>
                    <button className="bullet-copy" onClick={() => navigator.clipboard.writeText(b)}>Copy</button>
                  </div>
                ))}
              </div>

              {(keywords.length > 0 || missing.length > 0) && (
                <div className="draft-signals">
                  {keywords.map((keyword) => (
                    <span key={`keyword-${keyword}`} className="draft-signal">Keyword: {keyword}</span>
                  ))}
                  {missing.map((skill) => (
                    <span key={`missing-${skill}`} className="draft-signal warning">Only add if true: {skill}</span>
                  ))}
                </div>
              )}

              <div className="editor-wrap">
                <div className="editor-header">
                  <span className="editor-label">ROLE-TAILORED CV DRAFT · ~{draftWordCount} words</span>
                  <span className="editor-hint">Edit this draft before sending it anywhere</span>
                </div>
                <textarea
                  className="cover-letter-editor"
                  value={cvDraft}
                  onChange={(e) => setCvDraft(e.target.value)}
                  rows={14}
                />
              </div>
            </div>
          )}

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

      <AISettingsModal
        open={showAISettings}
        settings={aiSettings}
        loading={loading && loadingAction === 'ai'}
        onClose={() => setShowAISettings(false)}
        onChange={(next) => setAiSettings(next)}
        onSubmit={generateWithAI}
      />
    </div>
  )
}

function AISettingsModal({ open, settings, loading, onClose, onChange, onSubmit }) {
  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 className="modal-title">Regenerate with AI</h3>
            <p className="modal-sub">Answer these once and we will frame the Gemini prompt around them.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-grid">
          <label className="modal-field">
            <span>Tone</span>
            <select value={settings.tone} onChange={(e) => onChange({ ...settings, tone: e.target.value })}>
              <option value="formal">Formal</option>
              <option value="confident">Confident</option>
              <option value="concise">Concise</option>
              <option value="warm">Warm</option>
              <option value="adaptive">Adaptive</option>
            </select>
          </label>

          <label className="modal-field">
            <span>Length</span>
            <select value={settings.length} onChange={(e) => onChange({ ...settings, length: e.target.value })}>
              <option value="short">Short</option>
              <option value="medium">Medium</option>
              <option value="detailed">Detailed</option>
            </select>
          </label>

          <label className="modal-field modal-field-wide">
            <span>Focus</span>
            <select value={settings.focus} onChange={(e) => onChange({ ...settings, focus: e.target.value })}>
              <option value="skills match">Skills match</option>
              <option value="achievements">Achievements</option>
              <option value="motivation">Motivation</option>
              <option value="leadership">Leadership</option>
            </select>
          </label>

          <label className="modal-field modal-field-wide">
            <span>Extra instructions</span>
            <textarea
              rows={5}
              placeholder="Mention relocation, visa, joining timeline, or anything to avoid."
              value={settings.notes}
              onChange={(e) => onChange({ ...settings, notes: e.target.value })}
            />
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-ghost-sm" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary-sm" onClick={onSubmit} disabled={loading}>
            {loading ? '⏳ Generating...' : '✨ Generate with AI'}
          </button>
        </div>
      </div>
    </div>
  )
}
