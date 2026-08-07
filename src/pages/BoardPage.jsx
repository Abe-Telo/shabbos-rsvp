import { useEffect, useMemo, useState } from 'react'
import { comingLabel, getWeekRsvps } from '../lib/api'
import { currentSunday, formatWeekLabel } from '../lib/week'

export default function BoardPage() {
  const week = currentSunday()
  const [rsvps, setRsvps] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const rows = await getWeekRsvps(week)
        if (!cancelled) setRsvps(rows)
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [week])

  const stats = useMemo(() => {
    const coming = rsvps.filter((r) =>
      ['yes', 'yes_guest', 'yes_new', 'probably', 'social', 'help'].includes(
        r.coming,
      ),
    )
    const guests = rsvps.reduce(
      (n, r) => n + (Number(r.guest_count) || 0),
      0,
    )
    const bringing = new Map()
    for (const r of rsvps) {
      for (const item of r.bringing || []) {
        bringing.set(item, (bringing.get(item) || 0) + 1)
      }
    }
    return { coming: coming.length, guests, bringing }
  }, [rsvps])

  return (
    <>
      <section className="hero">
        <h1>This week</h1>
        <p>
          Public RSVPs for {formatWeekLabel(week)}. Sponsorship and money
          answers are not shown here.
        </p>
      </section>

      {error && <div className="banner banner-err">{error}</div>}

      <div className="stats">
        <div className="stat">
          <span className="n">{stats.coming}</span>
          <span className="l">Likely coming</span>
        </div>
        <div className="stat">
          <span className="n">{stats.guests}</span>
          <span className="l">Extra guests</span>
        </div>
        <div className="stat">
          <span className="n">{rsvps.length}</span>
          <span className="l">Responses</span>
        </div>
      </div>

      {stats.bringing.size > 0 && (
        <div className="panel" style={{ marginBottom: '1rem' }}>
          <h2>What&apos;s being brought</h2>
          <div className="tags">
            {[...stats.bringing.entries()].map(([item, n]) => (
              <span className="tag" key={item}>
                {item} ×{n}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <h2>Responses</h2>
        <p className="hint">Refreshes when you open this page. Resets each Sunday.</p>
        {loading && <p className="meta">Loading…</p>}
        {!loading && rsvps.length === 0 && (
          <div className="empty">No RSVPs yet this week. Be the first!</div>
        )}
        <div className="list">
          {rsvps.map((r) => (
            <div className="rsvp-row" key={r.id}>
              <strong>{r.full_name}</strong>
              <div className="meta">
                {comingLabel(r.coming)}
                {r.phone ? ` · ${r.phone}` : ''}
                {r.guest_count
                  ? ` · ${r.guest_count} guest${r.guest_count == 1 ? '' : 's'}`
                  : ''}
              </div>
              {r.guest_names && (
                <div className="meta">Guests: {r.guest_names}</div>
              )}
              {(r.bringing?.length > 0 || r.bringing_other) && (
                <div className="tags">
                  {(r.bringing || []).map((b) => (
                    <span className="tag" key={b}>
                      {b}
                    </span>
                  ))}
                  {r.bringing_other && (
                    <span className="tag">{r.bringing_other}</span>
                  )}
                </div>
              )}
              {r.dietary_notes && (
                <div className="meta">Likes / diet: {r.dietary_notes}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
