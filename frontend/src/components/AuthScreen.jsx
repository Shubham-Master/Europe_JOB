import React from 'react'
import './AuthScreen.css'

export default function AuthScreen({ canSignIn, loading, error, onSignIn }) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-eyebrow">Private workspace</div>
        <h1 className="auth-title">Sign in to your EuroJobs dashboard</h1>
        <p className="auth-copy">
          Your CV, matched jobs, cover letters, and pipeline history stay scoped to your own account.
        </p>

        {error && (
          <div className="auth-error">{error}</div>
        )}

        <button
          className="auth-button"
          type="button"
          onClick={onSignIn}
          disabled={loading || !canSignIn}
        >
          <span className="auth-button-icon">G</span>
          <span>
            {loading
              ? 'Checking session...'
              : canSignIn
                ? 'Continue with Google'
                : 'Supabase auth is not configured'}
          </span>
        </button>

        <div className="auth-tip">
          Sign in with the Google account you want linked to this workspace.
        </div>
      </div>
    </div>
  )
}
