import React, { useEffect, useState } from 'react'
import api from '../lib/api'
import './PipelinePage.css'

const STEPS = [
  { id: 'scrape', label: 'Scrape Jobs', icon: '🕷️', desc: 'Adzuna API + RSS feeds' },
  { id: 'match', label: 'Match to CV', icon: '🎯', desc: 'Score against your profile' },
  { id: 'filter', label: 'Filter Top Jobs', icon: '⚡', desc: 'Prepare ranked matches' },
  { id: 'notify', label: 'Send Notification', icon: '🔔', desc: 'Telegram digest when configured' },
]

function getStepIndex(status) {
  if (status === 'scrape') return 0
  if (status === 'match') return 1
  if (status === 'filter') return 2
  if (status === 'notify') return 3
  return -1
}

export default function PipelinePage() {
  const [pipeline, setPipeline] = useState({
    status: 'idle',
    current_step: 'idle',
    last_run: null,
    jobs_found: 0,
    jobs_matched: 0,
    top_score: 0,
    message: 'Pipeline has not run yet',
  })
  const [error, setError] = useState('')

  useEffect(() => {
    fetchStatus()
  }, [])

  useEffect(() => {
    if (pipeline.status !== 'running') return undefined

    const timer = setInterval(() => {
      fetchStatus()
    }, 2000)

    return () => clearInterval(timer)
  }, [pipeline.status])

  const fetchStatus = async () => {
    try {
      const res = await api.get('/api/v1/pipeline/status')
      if (res.data.data) setPipeline(res.data.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load pipeline status.')
    }
  }

  const runPipeline = async () => {
    setError('')
    try {
      await api.post('/api/v1/pipeline/run')
      fetchStatus()
    } catch (err) {
      setError(err.response?.data?.error || 'Could not start the pipeline.')
    }
  }

  const step = getStepIndex(pipeline.current_step)
  const hasRealLastRun = Boolean(
    pipeline.last_run &&
    typeof pipeline.last_run === 'string' &&
    !pipeline.last_run.startsWith('0001-01-01')
  )
  const lastRun = hasRealLastRun ? new Date(pipeline.last_run) : null
  const isDone = pipeline.status === 'done'
  const hasRun = pipeline.status !== 'idle' || hasRealLastRun

  return (
    <div className="pipeline-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pipeline</h1>
          <p className="page-sub">Run the full scrape → match → notify flow against your uploaded CV</p>
        </div>
        <button
          className="btn-run"
          onClick={runPipeline}
          disabled={pipeline.status === 'running'}
        >
          {pipeline.status === 'running' ? '⏳ Running...' : '▶ Run Pipeline'}
        </button>
      </div>

      <div className="schedule-card">
        <div className="schedule-icon">⏰</div>
        <div>
          <div className="schedule-title">Automatic Schedule</div>
          <div className="schedule-sub">Manual trigger is live now. Scheduler still needs final production wiring.</div>
        </div>
        <div className={`schedule-badge ${pipeline.status}`}>{pipeline.status}</div>
      </div>

      {error && <div className="page-error">{error}</div>}

      <div className="status-banner">
        <div className="status-title">Current Status</div>
        <div className="status-text">{pipeline.message || 'Waiting to run...'}</div>
      </div>

      <div className="steps">
        {STEPS.map((item, index) => {
          const done = isDone || (pipeline.status === 'running' && index < step)
          const running = pipeline.status === 'running' && index === step
          const failed = pipeline.status === 'error' && index === step
          const pending = !done && !running && !failed

          return (
            <div key={item.id} className={`step ${done ? 'done' : running ? 'running' : failed ? 'failed' : 'pending'}`}>
              <div className="step-icon">{running ? '⏳' : done ? '✅' : failed ? '⚠️' : item.icon}</div>
              <div className="step-info">
                <div className="step-label">{item.label}</div>
                <div className="step-desc">{item.desc}</div>
              </div>
              <div className="step-status">
                {done && <span className="badge-done">Done</span>}
                {running && <span className="badge-running">Running</span>}
                {failed && <span className="badge-error">Failed</span>}
                {pending && <span className="badge-pending">Pending</span>}
              </div>
            </div>
          )
        })}
      </div>

      {hasRun && (
        <div className="result-card">
          <h3 className="result-title">{pipeline.status === 'error' ? '⚠ Last Run State' : '✅ Last Run Results'}</h3>
          <div className="result-stats">
            <div className="result-stat">
              <span className="result-num">{pipeline.jobs_found}</span>
              <span className="result-label">Jobs Found</span>
            </div>
            <div className="result-stat">
              <span className="result-num accent">{pipeline.jobs_matched}</span>
              <span className="result-label">Matched</span>
            </div>
            <div className="result-stat">
              <span className="result-num green">{pipeline.top_score || 0}%</span>
              <span className="result-label">Top Score</span>
            </div>
          </div>
          {lastRun && (
            <div className="result-time">
              Ran at {lastRun.toLocaleTimeString()} · {lastRun.toLocaleDateString()}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
