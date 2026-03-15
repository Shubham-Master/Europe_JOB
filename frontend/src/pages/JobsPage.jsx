import React, { useState, useEffect } from 'react'
import axios from 'axios'
import './JobsPage.css'

const COUNTRIES = ['All', 'Germany', 'Netherlands', 'France', 'United Kingdom', 'Belgium', 'Switzerland']

const MOCK_JOBS = [
  { id: '1', title: 'Senior Backend Engineer', company: 'Zalando', location: 'Berlin, Germany', country: 'Germany', match_score: 84, salary: '€80,000 - €110,000', source: 'adzuna', url: '#', seen: false },
  { id: '2', title: 'Python Developer', company: 'ING Bank', location: 'Amsterdam, Netherlands', country: 'Netherlands', match_score: 71, salary: '€65,000 - €85,000', source: 'adzuna', url: '#', seen: false },
  { id: '3', title: 'Full Stack Engineer', company: 'N26', location: 'Berlin, Germany', country: 'Germany', match_score: 66, salary: '€70,000 - €95,000', source: 'rss', url: '#', seen: true },
  { id: '4', title: 'Software Engineer', company: 'Spotify', location: 'Stockholm, Sweden', country: 'Sweden', match_score: 58, salary: '€75,000 - €100,000', source: 'adzuna', url: '#', seen: false },
  { id: '5', title: 'Java Developer', company: 'SAP', location: 'Munich, Germany', country: 'Germany', match_score: 32, salary: '€60,000 - €80,000', source: 'rss', url: '#', seen: false },
  { id: '6', title: 'DevOps Engineer', company: 'Adyen', location: 'Amsterdam, Netherlands', country: 'Netherlands', match_score: 61, salary: '€70,000 - €90,000', source: 'adzuna', url: '#', seen: false },
  { id: '7', title: 'Data Engineer', company: 'Booking.com', location: 'Amsterdam, Netherlands', country: 'Netherlands', match_score: 75, salary: '€72,000 - €95,000', source: 'adzuna', url: '#', seen: false },
]

function ScoreBadge({ score }) {
  const cls = score >= 75 ? 'excellent' : score >= 55 ? 'good' : score >= 35 ? 'fair' : 'low'
  const label = score >= 75 ? '🟢' : score >= 55 ? '🟡' : score >= 35 ? '🟠' : '🔴'
  return <span className={`score-badge ${cls}`}>{label} {score}%</span>
}

export default function JobsPage({ onJobSelect }) {
  const [jobs, setJobs]           = useState(MOCK_JOBS)
  const [country, setCountry]     = useState('All')
  const [minScore, setMinScore]   = useState(0)
  const [loading, setLoading]     = useState(false)
  const [search, setSearch]       = useState('')

  const filtered = jobs.filter(j => {
    if (country !== 'All' && j.country !== country) return false
    if (j.match_score < minScore) return false
    if (search && !j.title.toLowerCase().includes(search.toLowerCase()) &&
        !j.company.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const stats = {
    total: jobs.length,
    excellent: jobs.filter(j => j.match_score >= 75).length,
    good: jobs.filter(j => j.match_score >= 55 && j.match_score < 75).length,
    unseen: jobs.filter(j => !j.seen).length,
  }

  return (
    <div className="jobs-page">
      {/* Header */}
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
        </div>
      </div>

      {/* Filters */}
      <div className="filters">
        <input
          className="search-input"
          placeholder="🔍  Search title or company..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="filter-select" value={country} onChange={e => setCountry(e.target.value)}>
          {COUNTRIES.map(c => <option key={c}>{c}</option>)}
        </select>
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

      {/* Job List */}
      <div className="jobs-list">
        {filtered.length === 0 && (
          <div className="empty-state">No jobs match your filters</div>
        )}
        {filtered.map(job => (
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
                  </div>
                </div>
                <ScoreBadge score={job.match_score} />
              </div>
              {job.salary && <div className="job-salary">💰 {job.salary}</div>}
            </div>
            <div className="job-actions">
              <button className="btn-ghost" onClick={() => window.open(job.url, '_blank')}>
                View Job ↗
              </button>
              <button className="btn-primary" onClick={() => onJobSelect(job)}>
                ✍️ Generate Cover Letter
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
