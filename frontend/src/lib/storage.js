const SELECTED_JOB_KEY = 'eurojobs:selected-job'
const COVER_HISTORY_KEY = 'eurojobs:cover-history'
const CV_HISTORY_KEY = 'eurojobs:cv-history'

let storageScope = 'anonymous'
let activeCVScope = 'default'

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

function readJSON(key, fallback) {
  if (!canUseStorage()) return fallback

  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJSON(key, value) {
  if (!canUseStorage()) return

  window.localStorage.setItem(key, JSON.stringify(value))
}

function scopedKey(key) {
  return `${key}:${storageScope}`
}

function cvScopedKey(key) {
  return `${scopedKey(key)}:${activeCVScope}`
}

export function setStorageScope(scope) {
  storageScope = scope && String(scope).trim() ? String(scope).trim() : 'anonymous'
}

export function setActiveCVScope(signature) {
  activeCVScope = signature && String(signature).trim() ? String(signature).trim() : 'default'
}

export function profileSignature(profile) {
  return JSON.stringify({
    full_name: profile?.full_name || '',
    current_title: profile?.current_title || '',
    years_of_experience: profile?.years_of_experience || 0,
    technical_skills: profile?.technical_skills || [],
    programming_languages: profile?.programming_languages || [],
    frameworks_and_tools: profile?.frameworks_and_tools || [],
    target_roles: profile?.target_roles || [],
    top_keywords: profile?.top_keywords || [],
  })
}

function coverResultSignature(result) {
  return JSON.stringify({
    job_id: result?.job?.id || result?.job_id || '',
    company: result?.job?.company || result?.company || '',
    title: result?.job?.title || result?.job_title || '',
    generated_at: result?.generated_at || '',
    cover_letter: result?.cover_letter || '',
  })
}

export function loadSelectedJob() {
  return readJSON(cvScopedKey(SELECTED_JOB_KEY), null)
}

export function saveSelectedJob(job) {
  if (!canUseStorage()) return

  if (!job) {
    window.localStorage.removeItem(cvScopedKey(SELECTED_JOB_KEY))
    return
  }

  writeJSON(cvScopedKey(SELECTED_JOB_KEY), job)
}

export function getCoverLetterHistory() {
  return readJSON(cvScopedKey(COVER_HISTORY_KEY), [])
}

export function saveCoverLetterResult(result) {
  const entry = {
    ...result,
    saved_at: result?.saved_at || new Date().toISOString(),
    _signature: coverResultSignature(result),
  }

  const next = [
    entry,
    ...getCoverLetterHistory().filter(item => item?._signature !== entry._signature),
  ].slice(0, 25)

  writeJSON(cvScopedKey(COVER_HISTORY_KEY), next)
  return next
}

export function getLatestCoverLetter(jobId) {
  return getCoverLetterHistory().find(item => item?.job?.id === jobId) || null
}

export function getCVHistory() {
  return readJSON(scopedKey(CV_HISTORY_KEY), [])
}

export function saveCVSnapshot(profile, filename = '') {
  if (!profile) return getCVHistory()

  const entry = {
    id: `${Date.now()}`,
    filename,
    saved_at: new Date().toISOString(),
    profile,
    _signature: profileSignature(profile),
  }

  const next = [
    entry,
    ...getCVHistory().filter(item => item?._signature !== entry._signature),
  ].slice(0, 10)

  writeJSON(scopedKey(CV_HISTORY_KEY), next)
  return next
}

export function removeCVSnapshot(signature) {
  if (!signature) return getCVHistory()

  const next = getCVHistory().filter((item) => item?._signature !== signature)
  writeJSON(scopedKey(CV_HISTORY_KEY), next)
  return next
}
