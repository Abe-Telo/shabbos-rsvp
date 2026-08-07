import { useEffect, useMemo, useState } from 'react'
import { getPeople } from '../lib/api'

export default function PastPeopleList({ compact = false }) {
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const rows = await getPeople()
        if (!cancelled) setPeople(rows)
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const rows = [...people].sort((a, b) => {
      const byAttend = (b.times_attended || 0) - (a.times_attended || 0)
      if (byAttend !== 0) return byAttend
      const bySeen = String(b.last_seen || '').localeCompare(String(a.last_seen || ''))
      if (bySeen !== 0) return bySeen
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, {
        sensitivity: 'base',
      })
    })
    if (!needle) return rows
    return rows.filter((p) => {
      const hay = `${p.name} ${p.food_prefs || ''}`.toLowerCase()
      return hay.includes(needle)
    })
  }, [people, q])

  return (
    <div className="panel">
      {!compact && <h2>Past people</h2>}
      <p className="hint">
        Everyone who has ever RSVP&apos;d — all weeks, not just this one. Phone
        numbers stay private (Admin only).
      </p>

      {error && <div className="banner banner-err">{error}</div>}

      <div className="field">
        <label>Search</label>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name or food…"
        />
      </div>

      {!loading && !error && (
        <p className="meta" style={{ marginTop: 0 }}>
          {filtered.length} of {people.length} people
        </p>
      )}

      {loading && <p className="meta">Loading…</p>}
      {!loading && filtered.length === 0 && (
        <div className="empty">No people yet — submit the form to start the log.</div>
      )}

      <div className="list">
        {filtered.map((p) => (
          <div className="person-row" key={p.id}>
            <strong>{p.name}</strong>
            <div className="meta">
              Attended {p.times_attended || 0} time
              {(p.times_attended || 0) === 1 ? '' : 's'}
            </div>
            {p.food_prefs && (
              <div className="meta">Likes / bringing history: {p.food_prefs}</div>
            )}
            <div className="meta">
              First seen{' '}
              {p.first_seen ? new Date(p.first_seen).toLocaleDateString() : '—'}
              {p.last_seen
                ? ` · last ${new Date(p.last_seen).toLocaleDateString()}`
                : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
