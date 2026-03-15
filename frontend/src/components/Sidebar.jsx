import React from 'react'
import './Sidebar.css'

const NAV = [
  { id: 'jobs',        icon: '⚡', label: 'Jobs'         },
  { id: 'coverletter', icon: '✍️', label: 'Cover Letter' },
  { id: 'cv',          icon: '📄', label: 'My CV'        },
  { id: 'pipeline',    icon: '🔄', label: 'Pipeline'     },
]

export default function Sidebar({ page, setPage }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-icon">🌍</span>
        <div>
          <div className="logo-title">EuroJobs</div>
          <div className="logo-sub">Hunter v0.1</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV.map(item => (
          <button
            key={item.id}
            className={`nav-item ${page === item.id ? 'active' : ''}`}
            onClick={() => setPage(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
            {page === item.id && <span className="nav-dot" />}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="status-dot online" />
        <span>API Connected</span>
      </div>
    </aside>
  )
}
