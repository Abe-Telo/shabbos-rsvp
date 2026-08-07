import { useEffect, useState } from 'react'
import {
  clearAdminSession,
  getAdminSession,
  getSponsorships,
  storageMode,
  unlockAdmin,
} from '../lib/api'
import { currentSunday, formatWeekLabel } from '../lib/week'

const CONTRIB_LABELS = {
  money: 'Contribute money (PayPal / Venmo)',
  food: 'Bring a special dish',
  not_this_week: 'Not this week — maybe next',
  setup: 'Help with setup / cleanup',
  other: 'Other',
  // legacy
  cant: "Can't afford this week",
  other_ways: 'Other ways',
}

export default function AdminPage() {
  const [password, setPassword] = useState('')
  const [unlocked, setUnlocked] = useState(Boolean(getAdminSession()))
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const week = currentSunday()

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await getSponsorships()
      setRows(data)
      setUnlocked(true)
    } catch (e) {
      clearAdminSession()
      setUnlocked(false)
      setError(e.message || 'Could not load private data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (getAdminSession()) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function onUnlock(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await unlockAdmin(password)
      setPassword('')
      await load()
    } catch (err) {
      setError(err.message || 'Incorrect password')
    } finally {
      setLoading(false)
    }
  }

  function lock() {
    clearAdminSession()
    setUnlocked(false)
    setRows([])
  }

  const thisWeek = rows.filter((r) => r.week_start === week)
  const past = rows.filter((r) => r.week_start !== week)

  return (
    <>
      <section className="hero">
        <h1>Admin</h1>
        <p>
          Sponsorship and money answers are private. Unlock with the master
          password.
        </p>
      </section>

      {!unlocked && (
        <div className="panel">
          <h2>
            Unlock private data
            <span className="private-badge">Private</span>
          </h2>
          <p className="hint">
            {storageMode() === 'demo'
              ? 'Demo password is in .env.example (default: shabbos-admin).'
              : 'Password is the ADMIN_PASSWORD secret on your Supabase Edge Function.'}
          </p>
          {error && <div className="banner banner-err">{error}</div>}
          <form onSubmit={onUnlock}>
            <div className="field">
              <label>Master password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading || !password}
              >
                {loading ? 'Checking…' : 'Unlock'}
              </button>
            </div>
          </form>
        </div>
      )}

      {unlocked && (
        <>
          <div className="actions" style={{ marginBottom: '1rem' }}>
            <button type="button" className="btn btn-ghost" onClick={lock}>
              Lock
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={load}
              disabled={loading}
            >
              Refresh
            </button>
          </div>

          {error && <div className="banner banner-err">{error}</div>}

          <div className="panel">
            <h2>This week — {formatWeekLabel(week)}</h2>
            <p className="hint">Sponsorship responses for the current Sunday week.</p>
            {loading && <p className="meta">Loading…</p>}
            {!loading && thisWeek.length === 0 && (
              <div className="empty">No sponsorship answers this week.</div>
            )}
            <div className="list">
              {thisWeek.map((s) => (
                <SponsorshipRow key={s.id} s={s} />
              ))}
            </div>
          </div>

          {past.length > 0 && (
            <div className="panel" style={{ marginTop: '1rem' }}>
              <h2>Past weeks</h2>
              <div className="list">
                {past.map((s) => (
                  <SponsorshipRow key={s.id} s={s} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}

function SponsorshipRow({ s }) {
  return (
    <div className="rsvp-row">
      <strong>{s.full_name}</strong>
      <div className="meta">
        {s.phone || 'No phone'} · week {s.week_start}
      </div>
      <div className="tags">
        {(s.contributions || []).map((c) => (
          <span className="tag tag-warn" key={c}>
            {CONTRIB_LABELS[c] || c}
          </span>
        ))}
      </div>
      {s.potluck_contribution && (
        <div className="meta">Contribution: {s.potluck_contribution}</div>
      )}
      {s.notes && <div className="meta">Notes: {s.notes}</div>}
    </div>
  )
}
