import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase, supabaseConfigError } from '../lib/supabase'

const AuthContext = createContext(null)

function cleanOAuthParams() {
  const url = new URL(window.location.href)
  const oauthKeys = ['code', 'state', 'error', 'error_code', 'error_description']
  const hadOAuthParams = oauthKeys.some((key) => url.searchParams.has(key))

  if (!hadOAuthParams) {
    return
  }

  oauthKeys.forEach((key) => url.searchParams.delete(key))
  const nextPath = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState({}, document.title, nextPath)
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setError(supabaseConfigError)
      setLoading(false)
      return undefined
    }

    let active = true

    supabase.auth.getSession()
      .then(({ data, error: sessionError }) => {
        if (!active) {
          return
        }

        if (sessionError) {
          setError(sessionError.message || 'Could not restore your session.')
          setSession(null)
          return
        }

        setSession(data.session || null)
        setError('')
        if (data.session) {
          cleanOAuthParams()
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null)
      if (nextSession) {
        setError('')
        cleanOAuthParams()
      }
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const signInWithGoogle = async () => {
    if (!isSupabaseConfigured || !supabase) {
      setError(supabaseConfigError)
      return
    }

    setError('')

    const { data, error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    })

    if (signInError) {
      setError(signInError.message || 'Could not start Google sign-in.')
      return
    }

    if (data?.url) {
      window.location.assign(data.url)
    }
  }

  const signOut = async () => {
    if (!supabase) {
      setSession(null)
      return
    }

    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) {
      setError(signOutError.message || 'Could not sign out cleanly.')
      return
    }

    setSession(null)
  }

  const value = useMemo(() => ({
    session,
    user: session?.user || null,
    loading,
    error,
    canSignIn: isSupabaseConfigured,
    isAuthenticated: Boolean(session?.access_token),
    signInWithGoogle,
    signOut,
  }), [error, loading, session])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const value = useContext(AuthContext)

  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider')
  }

  return value
}
