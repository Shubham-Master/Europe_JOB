import React, { useState } from 'react'
import Sidebar from './components/Sidebar.jsx'
import JobsPage from './pages/JobsPage.jsx'
import CoverLetterPage from './pages/CoverLetterPage.jsx'
import PipelinePage from './pages/PipelinePage.jsx'
import CVPage from './pages/CVPage.jsx'
import './App.css'

export default function App() {
  const [page, setPage] = useState('jobs')
  const [selectedJob, setSelectedJob] = useState(null)

  const handleJobSelect = (job) => {
    setSelectedJob(job)
    setPage('coverletter')
  }

  return (
    <div className="app">
      <Sidebar page={page} setPage={setPage} />
      <main className="main">
        {page === 'jobs'        && <JobsPage onJobSelect={handleJobSelect} />}
        {page === 'coverletter' && <CoverLetterPage job={selectedJob} />}
        {page === 'pipeline'    && <PipelinePage />}
        {page === 'cv'          && <CVPage />}
      </main>
    </div>
  )
}
