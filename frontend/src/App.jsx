import React, { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './auth/AuthContext.jsx'
import AuthScreen from './components/AuthScreen.jsx'
import Sidebar from './components/Sidebar.jsx'
import ScenicBackdrop from './components/ScenicBackdrop.jsx'
import GuideBot from './components/GuideBot.jsx'
import JobsPage from './pages/JobsPage.jsx'
import CoverLetterPage from './pages/CoverLetterPage.jsx'
import PipelinePage from './pages/PipelinePage.jsx'
import CVPage from './pages/CVPage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import api from './lib/api'
import { loadSelectedJob, profileSignature, saveSelectedJob, setActiveCVScope, setStorageScope } from './lib/storage'
import { sceneForCountry, sceneForPath } from './lib/scenes'
import './App.css'

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const { canSignIn, error: authError, isAuthenticated, loading: authLoading, signInWithGoogle, signOut, user } = useAuth()
  const [activeCVSignature, setActiveCVSignature] = useState('default')
  const [selectedJob, setSelectedJob] = useState(null)
  const [jobsCountry, setJobsCountry] = useState('All')

  setStorageScope(user?.id || 'anonymous')
  setActiveCVScope(activeCVSignature)

  useEffect(() => {
    let cancelled = false

    const syncActiveCV = async () => {
      if (!isAuthenticated || !user?.id) {
        setActiveCVSignature('default')
        return
      }

      try {
        const res = await api.get('/api/v1/cv/profile', {
          validateStatus: (status) => status === 200 || status === 404,
        })

        if (cancelled) return

        if (res.status === 404 || !res.data?.data) {
          setActiveCVSignature('default')
          return
        }

        setActiveCVSignature(profileSignature(res.data.data))
      } catch {
        if (!cancelled) {
          setActiveCVSignature('default')
        }
      }
    }

    syncActiveCV()
    return () => { cancelled = true }
  }, [isAuthenticated, user?.id])

  useEffect(() => {
    setSelectedJob(loadSelectedJob())
  }, [activeCVSignature, user?.id])

  const handleJobSelect = (job) => {
    setSelectedJob({
      ...job,
      cv_signature: activeCVSignature,
      cover_letter_request_id: Date.now(),
    })
    navigate('/cover-letter')
  }

  useEffect(() => {
    saveSelectedJob(selectedJob)
  }, [selectedJob])

  const scenicKey = location.pathname.startsWith('/jobs')
    ? sceneForCountry(jobsCountry)
    : sceneForPath(location.pathname)

  if (!isAuthenticated) {
    return (
      <div className="app auth-shell">
        <ScenicBackdrop sceneKey={scenicKey} />
        <main className="main auth-main">
          <AuthScreen
            canSignIn={canSignIn}
            loading={authLoading}
            error={authError}
            onSignIn={signInWithGoogle}
          />
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      <ScenicBackdrop sceneKey={scenicKey} />
      <Sidebar user={user} onSignOut={signOut} />
      <main className="main">
        <div className="content-shell">
          <Routes>
            <Route path="/" element={<Navigate to="/jobs" replace />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/jobs" element={<JobsPage onJobSelect={handleJobSelect} onSceneChange={setJobsCountry} />} />
            <Route path="/cover-letter" element={<CoverLetterPage job={selectedJob} onJobChange={setSelectedJob} />} />
            <Route path="/pipeline" element={<PipelinePage />} />
            <Route path="/cv" element={<CVPage onActiveProfileChange={setActiveCVSignature} />} />
            <Route path="*" element={<Navigate to="/jobs" replace />} />
          </Routes>
        </div>
      </main>
      <GuideBot
        currentPath={location.pathname}
        hasSelectedJob={Boolean(selectedJob)}
        countryFilter={jobsCountry}
        onNavigate={navigate}
      />
    </div>
  )
}
