import React from 'react'
import { NavLink } from 'react-router-dom'
import './Sidebar.css'

const NAV = [
  { to: '/profile',      icon: '🧭', label: 'My Profile' },
  { to: '/jobs',         icon: '⚡', label: 'Jobs' },
  { to: '/cover-letter', icon: '✍️', label: 'Cover Letter' },
  { to: '/cv',           icon: '📄', label: 'My CV' },
  { to: '/pipeline',     icon: '🔄', label: 'Pipeline' },
]

function Sidebar({ user, onSignOut }) {
  const accountName = user?.user_metadata?.full_name || 'My account'

  return (
    <aside className="sidebar">
      <NavLink to="/" className="sidebar-logo" aria-label="Go to main page">
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
      </NavLink>

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
        <NavLink to="/profile" className="account-card account-link" aria-label="Open workspace profile">
          <div className="account-avatar">
            {(accountName[0] || 'U').toUpperCase()}
          </div>
          <div className="account-copy">
            <div className="account-label">Workspace profile</div>
            <div className="account-email" title={accountName}>{accountName}</div>
            <div className="account-subtle">Manage personal details in My Profile</div>
          </div>
        </NavLink>
        <button type="button" className="signout-button" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </aside>
  )
}

export default React.memo(Sidebar)
