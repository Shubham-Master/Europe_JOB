import React, { useEffect, useState } from 'react'
import api from '../lib/api'
import { DEFAULT_TARGET_COUNTRIES, EUROPE_COUNTRY_OPTIONS, countryLabelFromCode } from '../lib/europeCountries'
import './ProfilePage.css'

function normalizeProfile(payload) {
  return {
    full_name: payload?.full_name || '',
    whatsapp_number: payload?.whatsapp_number || '',
    target_countries: Array.isArray(payload?.target_countries) && payload.target_countries.length > 0
      ? payload.target_countries
      : DEFAULT_TARGET_COUNTRIES,
  }
}

export default function ProfilePage() {
  const [form, setForm] = useState(() => normalizeProfile(null))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError('')

      try {
        const res = await api.get('/api/v1/profile')
        setForm(normalizeProfile(res.data?.data))
      } catch (err) {
        setError(err.response?.data?.error || 'Could not load your profile.')
      }

      setLoading(false)
    }

    load()
  }, [])

  const toggleCountry = (code) => {
    setForm((current) => {
      const next = current.target_countries.includes(code)
        ? current.target_countries.filter((item) => item !== code)
        : [...current.target_countries, code]

      return {
        ...current,
        target_countries: next,
      }
    })
  }

  const selectAllCountries = () => {
    setForm((current) => ({
      ...current,
      target_countries: EUROPE_COUNTRY_OPTIONS.map((country) => country.code),
    }))
  }

  const clearCountries = () => {
    setForm((current) => ({
      ...current,
      target_countries: [],
    }))
  }

  const saveProfile = async () => {
    setSaving(true)
    setError('')
    setMessage('')

    if (form.target_countries.length === 0) {
      setSaving(false)
      setError('Select at least one Europe or UK country before saving your profile.')
      return
    }

    try {
      const payload = {
        ...form,
        target_countries: form.target_countries,
      }
      const res = await api.put('/api/v1/profile', payload)
      setForm(normalizeProfile(res.data?.data))
      setMessage('Profile saved. Future pipeline runs will use these target countries.')
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save your profile.')
    }

    setSaving(false)
  }

  return (
    <div className="profile-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Profile</h1>
          <p className="page-sub">Save your contact details and choose which Europe or UK markets the pipeline should target.</p>
        </div>
      </div>

      {error && <div className="page-error">{error}</div>}
      {message && <div className="page-success">{message}</div>}

      <div className="profile-layout">
        <section className="profile-panel">
          <h2 className="panel-title">Personal Details</h2>
          <div className="profile-form">
            <label className="profile-field">
              <span>Full name</span>
              <input
                value={form.full_name}
                onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))}
                placeholder="Your name"
              />
            </label>

            <label className="profile-field">
              <span>WhatsApp number</span>
              <input
                value={form.whatsapp_number}
                onChange={(event) => setForm((current) => ({ ...current, whatsapp_number: event.target.value }))}
                placeholder="+44 7..."
              />
            </label>
          </div>
        </section>

        <section className="profile-panel">
          <div className="panel-heading">
            <div>
              <h2 className="panel-title">Target Countries</h2>
              <p className="panel-sub">These are the countries the job pipeline will scrape on your behalf.</p>
            </div>
            <div className="country-tools">
              <button type="button" className="country-tool-button" onClick={selectAllCountries}>
                Select all
              </button>
              <button type="button" className="country-tool-button secondary" onClick={clearCountries}>
                Clear all
              </button>
              <div className="country-count">{form.target_countries.length} selected</div>
            </div>
          </div>

          <div className="country-grid">
            {EUROPE_COUNTRY_OPTIONS.map((country) => {
              const checked = form.target_countries.includes(country.code)
              return (
                <label key={country.code} className={`country-chip ${checked ? 'selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleCountry(country.code)}
                  />
                  <span>{country.label}</span>
                </label>
              )
            })}
          </div>
        </section>
      </div>

      <section className="profile-panel summary-panel">
        <h2 className="panel-title">Current Scrape Scope</h2>
        <p className="panel-sub">Pipeline runs will currently search:</p>
        <div className="selected-countries">
          {form.target_countries.length > 0 ? (
            form.target_countries.map((code) => (
              <span key={code} className="selected-country">{countryLabelFromCode(code)}</span>
            ))
          ) : (
            <span className="selected-country empty">No countries selected yet</span>
          )}
        </div>
      </section>

      <div className="profile-actions">
        <button className="profile-save-button" type="button" onClick={saveProfile} disabled={loading || saving}>
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </div>
    </div>
  )
}
