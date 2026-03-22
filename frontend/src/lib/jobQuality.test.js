import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildSourceBreakdown,
  compareJobs,
  geoRiskLabel,
  getGeoRiskLevel,
  isLikelyGeoLocked,
} from './jobQuality.js'

test('getGeoRiskLevel classifies supported sources', () => {
  assert.equal(getGeoRiskLevel({ source: 'greenhouse', url: 'https://boards.greenhouse.io/example/jobs/1' }), 'low')
  assert.equal(getGeoRiskLevel({ source: 'lever', url: 'https://jobs.lever.co/example/1' }), 'low')
  assert.equal(getGeoRiskLevel({ source: 'remotive', url: 'https://remotive.com/remote-jobs/software-dev/example' }), 'medium')
  assert.equal(getGeoRiskLevel({ source: 'remotive', url: 'https://jobs.example.com/openings/123' }), 'low')
  assert.equal(getGeoRiskLevel({ source: 'indeed_rss', url: 'https://www.indeed.com/viewjob?jk=123' }), 'medium')
  assert.equal(getGeoRiskLevel({ source: 'adzuna', url: 'https://www.adzuna.com/details/123' }), 'high')
})

test('isLikelyGeoLocked only flags high risk jobs', () => {
  assert.equal(isLikelyGeoLocked({ source: 'adzuna', url: 'https://www.adzuna.com/details/123' }), true)
  assert.equal(isLikelyGeoLocked({ source: 'greenhouse', url: 'https://boards.greenhouse.io/example/jobs/1' }), false)
})

test('compareJobs slightly deprioritizes higher risk jobs', () => {
  const lowRisk = { source: 'greenhouse', url: 'https://boards.greenhouse.io/example/jobs/1', match_score: 70 }
  const highRisk = { source: 'adzuna', url: 'https://www.adzuna.com/details/123', match_score: 70 }
  assert.ok(compareJobs(lowRisk, highRisk, 'score') < 0)
})

test('buildSourceBreakdown returns readable grouped counts', () => {
  const breakdown = buildSourceBreakdown([
    { source: 'greenhouse' },
    { source: 'greenhouse' },
    { source: 'remotive' },
  ])

  assert.deepEqual(breakdown, [
    { source: 'greenhouse', label: 'Greenhouse', count: 2 },
    { source: 'remotive', label: 'Remotive', count: 1 },
  ])
})

test('geoRiskLabel returns stable user-facing text', () => {
  assert.equal(geoRiskLabel({ source: 'greenhouse', url: 'https://boards.greenhouse.io/example/jobs/1' }), 'Direct apply')
  assert.equal(geoRiskLabel({ source: 'indeed_rss', url: 'https://www.indeed.com/viewjob?jk=123' }), 'Medium geo risk')
  assert.equal(geoRiskLabel({ source: 'adzuna', url: 'https://www.adzuna.com/details/123' }), 'High geo risk')
})
