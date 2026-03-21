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
import { loadSelectedJob, saveSelectedJob } from './lib/storage'
import { sceneForCountry, sceneForPath } from './lib/scenes'
import './App.css'

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const { canSignIn, error: authError, isAuthenticated, loading: authLoading, signInWithGoogle, signOut, user } = useAuth()
  const [selectedJob, setSelectedJob] = useState(() => loadSelectedJob())
  const [jobsCountry, setJobsCountry] = useState('All')

  const handleJobSelect = (job) => {
    setSelectedJob(job)
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
            <Route path="/jobs" element={<JobsPage onJobSelect={handleJobSelect} onSceneChange={setJobsCountry} />} />
            <Route path="/cover-letter" element={<CoverLetterPage job={selectedJob} />} />
            <Route path="/pipeline" element={<PipelinePage />} />
            <Route path="/cv" element={<CVPage />} />
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
