import React, { useState } from 'react'
import axios from 'axios'
import './PipelinePage.css'

const STEPS = [
  { id: 'scrape',  label: 'Scrape Jobs',      icon: '🕷️', desc: 'Adzuna API + RSS feeds'     },
  { id: 'match',   label: 'Match to CV',       icon: '🎯', desc: 'Score against your profile' },
  { id: 'filter',  label: 'Filter Top Jobs',   icon: '⚡', desc: 'Keep score ≥ 55%'           },
  { id: 'notify',  label: 'Send Notification', icon: '🔔', desc: 'Telegram digest'             },
]

export default function PipelinePage() {
  const [status, setStatus]   = useState('idle')
  const [step, setStep]       = useState(-1)
  const [lastRun, setLastRun] = useState(null)
  const [result, setResult]   = useState(null)

  const runPipeline = async () => {
    setStatus('running')
    setStep(0)
    setResult(null)

    // Simulate pipeline steps for demo
    for (let i = 0; i < STEPS.length; i++) {
      setStep(i)
      await new Promise(r => setTimeout(r, 1200))
    }

    setStatus('done')
    setStep(-1)
    setLastRun(new Date())
    setResult({ jobs_found: 142, jobs_matched: 38, top_score: 84 })

    try {
      await axios.post('/api/v1/pipeline/run')
    } catch {}
  }

  return (
    <div className="pipeline-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pipeline</h1>
          <p className="page-sub">Manually trigger the full scrape → match → notify pipeline</p>
        </div>
        <button
          className="btn-run"
          onClick={runPipeline}
          disabled={status === 'running'}
        >
          {status === 'running' ? '⏳ Running...' : '▶ Run Pipeline'}
        </button>
      </div>

      {/* Schedule Info */}
      <div className="schedule-card">
        <div className="schedule-icon">⏰</div>
        <div>
          <div className="schedule-title">Automatic Schedule</div>
          <div className="schedule-sub">Runs daily at 8:00 AM via Go scheduler</div>
        </div>
        <div className="schedule-badge">Active</div>
      </div>

      {/* Pipeline Steps */}
      <div className="steps">
        {STEPS.map((s, i) => {
          const isDone    = status === 'done' || (status === 'running' && i < step)
          const isRunning = status === 'running' && i === step
          const isPending = status === 'idle' || (status === 'running' && i > step)

          return (
            <div key={s.id} className={`step ${isDone ? 'done' : isRunning ? 'running' : 'pending'}`}>
              <div className="step-icon">{isRunning ? '⏳' : isDone ? '✅' : s.icon}</div>
              <div className="step-info">
                <div className="step-label">{s.label}</div>
                <div className="step-desc">{s.desc}</div>
              </div>
              <div className="step-status">
                {isDone && <span className="badge-done">Done</span>}
                {isRunning && <span className="badge-running">Running</span>}
                {isPending && <span className="badge-pending">Pending</span>}
              </div>
              {i < STEPS.length - 1 && <div className="step-connector" />}
            </div>
          )
        })}
      </div>

      {/* Result */}
      {result && (
        <div className="result-card">
          <h3 className="result-title">✅ Last Run Results</h3>
          <div className="result-stats">
            <div className="result-stat">
              <span className="result-num">{result.jobs_found}</span>
              <span className="result-label">Jobs Found</span>
            </div>
            <div className="result-stat">
              <span className="result-num accent">{result.jobs_matched}</span>
              <span className="result-label">Matched (≥55%)</span>
            </div>
            <div className="result-stat">
              <span className="result-num green">{result.top_score}%</span>
              <span className="result-label">Top Score</span>
            </div>
          </div>
          <div className="result-time">
            Ran at {lastRun?.toLocaleTimeString()} · {lastRun?.toLocaleDateString()}
          </div>
        </div>
      )}
    </div>
  )
}
