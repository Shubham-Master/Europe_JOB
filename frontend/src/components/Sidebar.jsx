import React from 'react'
import { NavLink } from 'react-router-dom'
import './Sidebar.css'

const NAV = [
  { to: '/jobs',         icon: '⚡', label: 'Jobs' },
  { to: '/cover-letter', icon: '✍️', label: 'Cover Letter' },
  { to: '/cv',           icon: '📄', label: 'My CV' },
  { to: '/pipeline',     icon: '🔄', label: 'Pipeline' },
]

export default function Sidebar({ user, onSignOut }) {
  const userEmail = user?.email || 'Signed in'

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

      <div className="sidebar-footer">
        <div className="account-card">
          <div className="account-avatar">
            {(userEmail[0] || 'U').toUpperCase()}
          </div>
          <div className="account-copy">
            <div className="account-label">Signed in</div>
            <div className="account-email" title={userEmail}>{userEmail}</div>
          </div>
        </div>
        <button type="button" className="signout-button" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </aside>
  )
}
