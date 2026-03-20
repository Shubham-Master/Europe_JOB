import React from 'react'
import { NavLink } from 'react-router-dom'
import './Sidebar.css'

const NAV = [
  { to: '/jobs',         icon: '⚡', label: 'Jobs' },
  { to: '/cover-letter', icon: '✍️', label: 'Cover Letter' },
  { to: '/cv',           icon: '📄', label: 'My CV' },
  { to: '/pipeline',     icon: '🔄', label: 'Pipeline' },
]

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-mark" aria-hidden="true">
          <span className="logo-orb" />
          <span className="logo-ring logo-ring-one" />
          <span className="logo-ring logo-ring-two" />
          <span className="logo-spark" />
        </div>
        <div className="logo-copy">
          <div className="logo-title-row">
            <div className="logo-title">EuroJobs</div>
            <span className="logo-badge">beta</span>
          </div>
          <div className="logo-sub">Europe roles, one dashboard</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
            <span className="nav-dot" />
          </NavLink>
        ))}
      </nav>

    </aside>
  )
}
