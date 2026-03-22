import React, { useEffect, useState } from 'react'
import api from '../lib/api'
import { buildSourceBreakdown, compareJobs, geoRiskLabel, isLikelyGeoLocked } from '../lib/jobQuality'
import './JobsPage.css'

function ScoreBadge({ score }) {
  const cls = score >= 75 ? 'excellent' : score >= 55 ? 'good' : score >= 35 ? 'fair' : 'low'
  const label = score >= 75 ? '🟢' : score >= 55 ? '🟡' : score >= 35 ? '🟠' : '🔴'
  return <span className={`score-badge ${cls}`}>{label} {score}%</span>
}

export default function JobsPage({ onJobSelect, onSceneChange }) {
  const [jobs, setJobs]       = useState([])
  const [country, setCountry] = useState('All')
  const [source, setSource]   = useState('All')
  const [hideGeoLocked, setHideGeoLocked] = useState(false)
  const [savedOnly, setSavedOnly] = useState(false)
  const [minScore, setMinScore] = useState(0)
  const [sortBy, setSortBy]   = useState('score')
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [error, setError]     = useState('')

  useEffect(() => {
    fetchJobs()
  }, [])

  useEffect(() => {
    onSceneChange?.(country)
  }, [country, onSceneChange])

  const fetchJobs = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/api/v1/jobs')
      setJobs(Array.isArray(res.data.data) ? res.data.data : [])
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load jobs. Run the pipeline and try again.')
    }
    setLoading(false)
  }

  const markSeen = async (jobId) => {
    try {
      await api.put(`/api/v1/jobs/${jobId}/seen`)
    } catch {}
  }

  const updateSaved = async (jobId, saved) => {
    try {
      await api.put(`/api/v1/jobs/${jobId}/save`, { saved })
    } catch (err) {
      setError(err.response?.data?.error || 'Could not update this saved job.')
      setJobs((current) => current.map((job) => (
        job.id === jobId ? { ...job, saved: !saved } : job
      )))
    }
  }

  const updateSeenLocally = (jobId) => {
    setJobs(current => current.map(job => (
      job.id === jobId ? { ...job, seen: true } : job
    )))
  }

  const toggleSaved = (job) => {
    const nextSaved = !job.saved
    setJobs((current) => current.map((item) => (
      item.id === job.id ? { ...item, saved: nextSaved } : item
    )))
    updateSaved(job.id, nextSaved)
  }

  const openJob = (job) => {
    markSeen(job.id)
    updateSeenLocally(job.id)
    window.open(job.url, '_blank', 'noopener,noreferrer')
  }

  const searchCompanyCareers = (job) => {
    markSeen(job.id)
    updateSeenLocally(job.id)
    const query = encodeURIComponent(`${job.company} ${job.title} careers ${job.country || ''}`.trim())
    window.open(`https://www.google.com/search?q=${query}`, '_blank', 'noopener,noreferrer')
  }

  const selectJob = (job) => {
    markSeen(job.id)
    updateSeenLocally(job.id)
    onJobSelect({ ...job, seen: true })
  }

  const countries = ['All', ...new Set(jobs.map(job => job.country).filter(Boolean))]
  const sourceScopedJobs = jobs.filter(job => {
    if (country !== 'All' && job.country !== country) return false
    if (savedOnly && !job.saved) return false
    if (job.match_score < minScore) return false
    if (search &&
        !job.title.toLowerCase().includes(search.toLowerCase()) &&
        !job.company.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })
  const sourceOptions = [
    { value: 'All', label: `All (${sourceScopedJobs.length})` },
    ...buildSourceBreakdown(sourceScopedJobs).map((item) => ({
      value: item.source,
      label: `${item.label} (${item.count})`,
    })),
  ]

  useEffect(() => {
    if (source === 'All') return
    if (!sourceOptions.some((item) => item.value === source)) {
      setSource('All')
    }
  }, [source, sourceOptions])

  const baseFiltered = jobs.filter(job => {
    if (country !== 'All' && job.country !== country) return false
    if (source !== 'All' && job.source !== source) return false
    if (savedOnly && !job.saved) return false
    if (job.match_score < minScore) return false
    if (search &&
        !job.title.toLowerCase().includes(search.toLowerCase()) &&
        !job.company.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const geoLockedMatches = baseFiltered.filter(isLikelyGeoLocked).length

  const filtered = baseFiltered.filter(job => {
    if (hideGeoLocked && isLikelyGeoLocked(job)) return false
    return true
  }).sort((a, b) => compareJobs(a, b, sortBy))

  const stats = {
    total: jobs.length,
    excellent: jobs.filter(job => job.match_score >= 75).length,
    good: jobs.filter(job => job.match_score >= 55 && job.match_score < 75).length,
    unseen: jobs.filter(job => !job.seen).length,
    saved: jobs.filter(job => job.saved).length,
  }

  return (
    <div className="jobs-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Job Matches</h1>
          <p className="page-sub">Scraped & ranked against your CV profile</p>
        </div>
        <div className="stats-row">
          <div className="stat"><span className="stat-num">{stats.total}</span><span className="stat-label">Total</span></div>
          <div className="stat excellent"><span className="stat-num">{stats.excellent}</span><span className="stat-label">Excellent</span></div>
          <div className="stat good"><span className="stat-num">{stats.good}</span><span className="stat-label">Good</span></div>
          <div className="stat unseen"><span className="stat-num">{stats.unseen}</span><span className="stat-label">Unseen</span></div>
          <div className="stat saved"><span className="stat-num">{stats.saved}</span><span className="stat-label">Saved</span></div>
        </div>
      </div>

      <div className="filters">
        <input
          className="search-input"
          placeholder="🔍  Search title or company..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="filter-select" value={country} onChange={e => setCountry(e.target.value)}>
          {countries.map(item => <option key={item}>{item}</option>)}
        </select>
        <select className="filter-select" value={source} onChange={e => setSource(e.target.value)}>
          {sourceOptions.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
        <select className="filter-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="score">Best Match</option>
          <option value="latest">Latest Posted</option>
        </select>
        <label className="filter-toggle">
          <input
            type="checkbox"
            checked={hideGeoLocked}
            onChange={e => setHideGeoLocked(e.target.checked)}
          />
          <span>Hide geo-restricted</span>
        </label>
        <label className="filter-toggle">
          <input
            type="checkbox"
            checked={savedOnly}
            onChange={e => setSavedOnly(e.target.checked)}
          />
          <span>Saved only</span>
        </label>
        <div className="score-filter">
          <span className="filter-label">Min Score</span>
          <input
            type="range" min="0" max="90" step="5"
            value={minScore}
            onChange={e => setMinScore(+e.target.value)}
          />
          <span className="score-val">{minScore}%</span>
        </div>
      </div>

      {error && <div className="page-error">{error}</div>}

      <div className="jobs-list">
        {loading && (
          <div className="empty-state">Loading matched jobs...</div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="empty-state">
            {jobs.length === 0
              ? 'No matched jobs yet. Run the pipeline after uploading your CV.'
              : hideGeoLocked && geoLockedMatches > 0
                ? `All ${geoLockedMatches} jobs in the current filter look geo-restricted from your region. Turn this toggle off to review them.`
                : 'No jobs match your filters'}
          </div>
        )}

        {!loading && filtered.map(job => (
          <div key={job.id} className={`job-card ${job.seen ? 'seen' : ''}`}>
            <div className="job-main">
              <div className="job-top">
                <div>
                  <h3 className="job-title">{job.title}</h3>
                  <div className="job-meta">
                    <span className="company">{job.company}</span>
                    <span className="dot">·</span>
                    <span className="location">📍 {job.location}</span>
                    <span className="dot">·</span>
                    <span className="source">{job.source}</span>
                    <span className={`risk-pill ${isLikelyGeoLocked(job) ? 'high' : 'normal'}`}>{geoRiskLabel(job)}</span>
                    {job.posted_at && (
                      <>
                        <span className="dot">·</span>
                        <span className="posted">🕒 {formatPostedTime(job.posted_at)}</span>
                      </>
                    )}
                  </div>
                </div>
                <ScoreBadge score={job.match_score} />
              </div>
              {job.salary && <div className="job-salary">💰 {job.salary}</div>}
              <button
                className={`job-save ${job.saved ? 'active' : ''}`}
                type="button"
                onClick={() => toggleSaved(job)}
              >
                {job.saved ? '★ Saved job' : '☆ Save job'}
              </button>
              {isLikelyGeoLocked(job) && (
                <div className="job-warning">
                  This detail page may be geo-restricted. If it blocks you, use the company careers search fallback.
                </div>
              )}
            </div>
            <div className="job-actions">
              <button className="btn-ghost" onClick={() => openJob(job)}>
                View Job ↗
              </button>
              {isLikelyGeoLocked(job) && (
                <button className="btn-ghost" onClick={() => searchCompanyCareers(job)}>
                  Find Company Careers
                </button>
              )}
              <button className="btn-primary" onClick={() => selectJob(job)}>
                ✍️ Generate Cover Letter
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatPostedTime(value) {
  const postedAt = new Date(value)
  if (Number.isNaN(postedAt.getTime())) return 'Date unavailable'

  const diffHours = Math.max(0, Math.floor((Date.now() - postedAt.getTime()) / 3600000))
  if (diffHours < 1) return 'Just now'
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`

  return postedAt.toLocaleDateString()
}
