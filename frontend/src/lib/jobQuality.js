const SOURCE_LABELS = {
  adzuna: 'Adzuna',
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  remotive: 'Remotive',
  indeed_rss: 'Indeed RSS',
  eurojobs_rss: 'EuroJobs RSS',
}

const RISK_ORDER = { low: 0, medium: 1, high: 2 }
const RISK_PENALTY = { low: 0, medium: 2.5, high: 8 }

function getHostname(rawUrl) {
  try {
    return new URL(rawUrl).hostname.toLowerCase()
  } catch {
    return ''
  }
}

export function getGeoRiskLevel(job) {
  const source = (job?.source || '').toLowerCase()
  const hostname = getHostname(job?.url || '')

  if (source === 'greenhouse' || source === 'lever') return 'low'
  if (source === 'remotive') {
    return hostname.includes('remotive.com') ? 'medium' : 'low'
  }
  if (source === 'indeed_rss' || source === 'eurojobs_rss') return 'medium'
  if (source === 'adzuna') return 'high'
  return 'medium'
}

export function isLikelyGeoLocked(job) {
  return getGeoRiskLevel(job) === 'high'
}

export function compareJobs(a, b, sortBy) {
  if (sortBy === 'latest') {
    const aTime = a.posted_at ? new Date(a.posted_at).getTime() : 0
    const bTime = b.posted_at ? new Date(b.posted_at).getTime() : 0
    return bTime - aTime
  }

  const aAdjusted = (a.match_score || 0) - RISK_PENALTY[getGeoRiskLevel(a)]
  const bAdjusted = (b.match_score || 0) - RISK_PENALTY[getGeoRiskLevel(b)]
  if (bAdjusted !== aAdjusted) return bAdjusted - aAdjusted

  const riskDelta = RISK_ORDER[getGeoRiskLevel(a)] - RISK_ORDER[getGeoRiskLevel(b)]
  if (riskDelta !== 0) return riskDelta

  return (b.match_score || 0) - (a.match_score || 0)
}

export function buildSourceBreakdown(jobs) {
  const counts = new Map()

  for (const job of jobs || []) {
    const source = (job?.source || 'unknown').toLowerCase()
    counts.set(source, (counts.get(source) || 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([source, count]) => ({
      source,
      label: SOURCE_LABELS[source] || source,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

export function geoRiskLabel(job) {
  const risk = getGeoRiskLevel(job)
  if (risk === 'high') return 'High geo risk'
  if (risk === 'medium') return 'Medium geo risk'
  return 'Direct apply'
}
