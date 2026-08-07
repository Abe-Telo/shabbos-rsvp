import { useEffect, useState } from 'react'
import { getPeople } from '../lib/api'

export default function PeoplePage() {
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

  const filtered = people.filter((p) => {
    const hay = `${p.name} ${p.phone} ${p.food_prefs || ''}`.toLowerCase()
    return hay.includes(q.trim().toLowerCase())
  })

  return (
    <>
      <section className="hero">
        <h1>People log</h1>
        <p>
          Everyone who has ever joined — contact info, how many times they came,
          and what they like eating. This list does not reset on Sunday.
        </p>
      </section>

      {error && <div className="banner banner-err">{error}</div>}

      <div className="panel">
        <div className="field">
          <label>Search</label>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, phone, food…"
          />
        </div>

        {loading && <p className="meta">Loading…</p>}
        {!loading && filtered.length === 0 && (
          <div className="empty">No people yet — submit the form to start the log.</div>
        )}

        <div className="list">
          {filtered.map((p) => (
            <div className="person-row" key={p.id}>
              <strong>{p.name}</strong>
              <div className="meta">
                {p.phone || 'No phone'} · attended {p.times_attended || 0} time
                {(p.times_attended || 0) === 1 ? '' : 's'}
              </div>
              {p.food_prefs && (
                <div className="meta">Likes / bringing history: {p.food_prefs}</div>
              )}
              <div className="meta">
                First seen{' '}
                {p.first_seen
                  ? new Date(p.first_seen).toLocaleDateString()
                  : '—'}
                {p.last_seen
                  ? ` · last ${new Date(p.last_seen).toLocaleDateString()}`
                  : ''}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
