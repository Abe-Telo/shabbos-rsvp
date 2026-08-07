import { useEffect, useMemo, useState } from 'react'
import {
  clearAdminSession,
  getAdminSession,
  getSponsorships,
  storageMode,
  unlockAdmin,
} from '../lib/api'
import {
  comingOptionLabel,
  mealStartLabel,
  mealStyleLabel,
} from '../lib/formConfig'
import { currentSunday, formatWeekLabel } from '../lib/week'

const CONTRIB_LABELS = {
  money: 'Contribute money (PayPal / Venmo)',
  food: 'Bring a special dish',
  not_this_week: 'Not this week — maybe next',
  setup: 'Help with setup / cleanup',
  other: 'Other',
  cant: "Can't afford this week",
  other_ways: 'Other ways',
}

function csvEscape(value) {
  const s = String(value ?? '')
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function downloadCsv(filename, rows) {
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function mealStartDisplay(r) {
  if (!r?.meal_start_time && !r?.meal_start_other) return ''
  if (r.meal_start_time === 'other') return r.meal_start_other || 'Other'
  return mealStartLabel(r.meal_start_time) || r.meal_start_time || ''
}

function latestPrefs(foodPrefs) {
  if (!foodPrefs) return ''
  const parts = String(foodPrefs)
    .split(' | ')
    .map((p) => p.trim())
    .filter(Boolean)
  return parts[parts.length - 1] || ''
}

function SheetTable({ columns, rows, empty }) {
  if (!rows.length) {
    return <div className="empty">{empty || 'No rows.'}</div>
  }
  return (
    <div className="sheet-wrap">
      <table className="sheet-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((c) => (
                <td key={c.key} title={String(row[c.key] ?? '')}>
                  {row[c.key] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function AdminPage() {
  const [password, setPassword] = useState('')
  const [unlocked, setUnlocked] = useState(Boolean(getAdminSession()))
  const [rows, setRows] = useState([])
  const [people, setPeople] = useState([])
  const [rsvps, setRsvps] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState('sheet')
  const week = currentSunday()

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await getSponsorships()
      const list = Array.isArray(data) ? data : data.sponsorships || []
      setRows(list)
      setPeople(data.people || [])
      setRsvps(data.rsvps || [])
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
    setPeople([])
    setRsvps([])
  }

  function exportPrivateSheet() {
    const header = [
      'week_start',
      'full_name',
      'phone',
      'coming',
      'meal_style',
      'meal_start_time',
      'bringing_dish',
      'food_likes',
      'sponsorship',
      'sponsorship_notes',
      'guest_names',
      'guest_count',
      'created_at',
    ]
    const byId = Object.fromEntries(rows.map((s) => [s.rsvp_id, s]))
    const lines = [header.join(',')]
    const source = rsvps.length
      ? rsvps
      : rows.map((s) => ({
          week_start: s.week_start,
          full_name: s.full_name,
          phone: s.phone,
          coming: '',
          meal_style: '',
          meal_start_time: '',
          bringing_dish: s.potluck_contribution,
          food_likes: [],
          guest_names: '',
          guest_count: '',
          created_at: s.created_at,
          id: s.rsvp_id,
        }))

    for (const r of source) {
      const s = byId[r.id] || {}
      lines.push(
        [
          r.week_start,
          r.full_name,
          r.phone,
          r.coming,
          r.meal_style || r.potluck,
          r.meal_start_time === 'other'
            ? r.meal_start_other || 'Other'
            : r.meal_start_time || '',
          r.bringing_dish || s.potluck_contribution,
          (r.food_likes || r.bringing || []).join('; '),
          (s.contributions || []).join('; '),
          s.notes || '',
          r.guest_names,
          r.guest_count,
          r.created_at,
        ]
          .map(csvEscape)
          .join(','),
      )
    }
    downloadCsv(`shabbos-private-${week}.csv`, lines)
  }

  const thisWeekSponsors = rows.filter((r) => r.week_start === week)
  const pastSponsors = rows.filter((r) => r.week_start !== week)

  const sponsorByRsvp = useMemo(
    () => Object.fromEntries(rows.map((s) => [s.rsvp_id, s])),
    [rows],
  )

  const weekRsvpSheet = useMemo(() => {
    return [...rsvps]
      .filter((r) => r.week_start === week)
      .sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || '')))
      .map((r) => {
        const s = sponsorByRsvp[r.id] || {}
        return {
          id: r.id,
          name: r.full_name || '',
          phone: r.phone || '',
          coming: comingOptionLabel(r.coming) || r.coming || '',
          style: mealStyleLabel(r.meal_style || r.potluck) || r.meal_style || '',
          start: mealStartDisplay(r),
          bringing: r.bringing_dish || s.potluck_contribution || '',
          likes: (r.food_likes || r.bringing || []).join(', '),
          guests: r.guest_names || '',
          guestCount: r.guest_count ?? '',
          sponsorship: (s.contributions || [])
            .map((c) => CONTRIB_LABELS[c] || c)
            .join('; '),
          notes: s.notes || '',
        }
      })
  }, [rsvps, sponsorByRsvp, week])

  const contactsSheet = useMemo(() => {
    return [...people]
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
      .map((p) => ({
        id: p.id,
        name: p.name || '',
        phone: p.phone || '',
        attended: p.times_attended || 0,
        first: p.first_seen ? new Date(p.first_seen).toLocaleDateString() : '',
        last: p.last_seen ? new Date(p.last_seen).toLocaleDateString() : '',
        prefs: latestPrefs(p.food_prefs),
      }))
  }, [people])

  const sponsorshipSheet = useMemo(() => {
    return [...rows]
      .sort((a, b) => String(b.week_start).localeCompare(String(a.week_start)))
      .map((s) => ({
        id: s.id,
        week: s.week_start || '',
        name: s.full_name || '',
        phone: s.phone || '',
        sponsorship: (s.contributions || [])
          .map((c) => CONTRIB_LABELS[c] || c)
          .join('; '),
        dish: s.potluck_contribution || '',
        notes: s.notes || '',
      }))
  }, [rows])

  const weekRsvpColumns = [
    { key: 'name', label: 'Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'coming', label: 'Coming' },
    { key: 'style', label: 'Meal style' },
    { key: 'start', label: 'Start time' },
    { key: 'bringing', label: 'Bringing' },
    { key: 'likes', label: 'Food likes' },
    { key: 'guests', label: 'Guests' },
    { key: 'guestCount', label: '#' },
    { key: 'sponsorship', label: 'Sponsorship' },
    { key: 'notes', label: 'Notes' },
  ]

  const contactColumns = [
    { key: 'name', label: 'Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'attended', label: 'Attended' },
    { key: 'first', label: 'First seen' },
    { key: 'last', label: 'Last seen' },
    { key: 'prefs', label: 'Latest prefs' },
  ]

  const sponsorColumns = [
    { key: 'week', label: 'Week' },
    { key: 'name', label: 'Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'sponsorship', label: 'Sponsorship' },
    { key: 'dish', label: 'Dish / help' },
    { key: 'notes', label: 'Notes' },
  ]

  return (
    <>
      <section className="hero">
        <h1>Admin</h1>
        <p>
          Private host view — phones, sponsorship, and money. Not shown on the
          public board. Export CSV to paste into your Google Sheet.
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
              : 'Use the host master password for private sponsorship data.'}
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
            <button
              type="button"
              className="btn btn-accent"
              onClick={exportPrivateSheet}
            >
              Download Google Sheet CSV
            </button>
          </div>

          <div className="nav" style={{ marginBottom: '1rem' }}>
            <button
              type="button"
              className={`btn ${view === 'sheet' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setView('sheet')}
            >
              Sheet view
            </button>
            <button
              type="button"
              className={`btn ${view === 'cards' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setView('cards')}
            >
              Cards
            </button>
          </div>

          {error && <div className="banner banner-err">{error}</div>}
          {loading && <p className="meta">Loading…</p>}

          {view === 'sheet' && (
            <>
              <div className="panel">
                <h2>This week RSVPs — {formatWeekLabel(week)}</h2>
                <p className="hint">
                  Spreadsheet view of this week’s private answers.
                </p>
                <SheetTable
                  columns={weekRsvpColumns}
                  rows={weekRsvpSheet}
                  empty="No RSVPs this week."
                />
              </div>

              <div className="panel" style={{ marginTop: '1rem' }}>
                <h2>Contacts (private)</h2>
                <p className="hint">All-time people log with phones.</p>
                <SheetTable
                  columns={contactColumns}
                  rows={contactsSheet}
                  empty="No contacts yet."
                />
              </div>

              <div className="panel" style={{ marginTop: '1rem' }}>
                <h2>Sponsorship</h2>
                <p className="hint">Money / help answers across weeks.</p>
                <SheetTable
                  columns={sponsorColumns}
                  rows={sponsorshipSheet}
                  empty="No sponsorship answers yet."
                />
              </div>
            </>
          )}

          {view === 'cards' && (
            <>
              <div className="panel">
                <h2>Contacts (private)</h2>
                <p className="hint">
                  Phone numbers — host only, not on the public site.
                </p>
                {people.length === 0 && (
                  <div className="empty">No contacts yet.</div>
                )}
                <div className="list">
                  {people.map((p) => (
                    <div className="person-row" key={p.id}>
                      <strong>{p.name}</strong>
                      <div className="meta">
                        {p.phone || 'No phone'} · attended{' '}
                        {p.times_attended || 0} time
                        {(p.times_attended || 0) === 1 ? '' : 's'}
                      </div>
                      {p.food_prefs && (
                        <div className="meta">{latestPrefs(p.food_prefs)}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel" style={{ marginTop: '1rem' }}>
                <h2>Sponsorship — {formatWeekLabel(week)}</h2>
                <p className="hint">Money and private notes for this week.</p>
                {!loading && thisWeekSponsors.length === 0 && (
                  <div className="empty">No sponsorship answers this week.</div>
                )}
                <div className="list">
                  {thisWeekSponsors.map((s) => (
                    <SponsorshipRow key={s.id} s={s} />
                  ))}
                </div>
              </div>

              {pastSponsors.length > 0 && (
                <div className="panel" style={{ marginTop: '1rem' }}>
                  <h2>Past sponsorship</h2>
                  <div className="list">
                    {pastSponsors.map((s) => (
                      <SponsorshipRow key={s.id} s={s} />
                    ))}
                  </div>
                </div>
              )}
            </>
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
