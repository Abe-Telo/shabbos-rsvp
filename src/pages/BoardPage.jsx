import { useEffect, useMemo, useState } from 'react'
import { comingLabel, getWeekRsvps } from '../lib/api'
import { mealStyleLabel } from '../lib/formConfig'
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
      ['yes', 'yes_guest', 'yes_new', 'probably', 'social', 'unsure', 'help'].includes(
        r.coming,
      ),
    )
    const guests = rsvps.reduce(
      (n, r) => n + (Number(r.guest_count) || 0),
      0,
    )
    const foods = new Map()
    const styles = new Map()
    for (const r of rsvps) {
      const likes = r.food_likes || r.bringing || []
      for (const item of likes) {
        foods.set(item, (foods.get(item) || 0) + 1)
      }
      if (r.food_likes_other || r.bringing_other) {
        const o = r.food_likes_other || r.bringing_other
        foods.set(o, (foods.get(o) || 0) + 1)
      }
      const style = r.meal_style || r.potluck
      if (style) styles.set(style, (styles.get(style) || 0) + 1)
    }
    return { coming: coming.length, guests, foods, styles }
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

      {stats.styles.size > 0 && (
        <div className="panel" style={{ marginBottom: '1rem' }}>
          <h2>Meal style preference</h2>
          <div className="tags">
            {[...stats.styles.entries()].map(([style, n]) => (
              <span className="tag" key={style}>
                {mealStyleLabel(style) || style} ×{n}
              </span>
            ))}
          </div>
        </div>
      )}

      {stats.foods.size > 0 && (
        <div className="panel" style={{ marginBottom: '1rem' }}>
          <h2>What people like to eat</h2>
          <div className="tags">
            {[...stats.foods.entries()].map(([item, n]) => (
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
          {rsvps.map((r) => {
            const likes = r.food_likes || r.bringing || []
            const other = r.food_likes_other || r.bringing_other
            const style = r.meal_style || r.potluck
            return (
              <div className="rsvp-row" key={r.id}>
                <strong>{r.full_name}</strong>
                <div className="meta">
                  {comingLabel(r.coming)}
                  {r.phone ? ` · ${r.phone}` : ''}
                  {r.guest_count
                    ? ` · ${r.guest_count} guest${r.guest_count == 1 ? '' : 's'}`
                    : ''}
                </div>
                {style && (
                  <div className="meta">
                    Prefers: {mealStyleLabel(style) || style}
                    {r.meal_style_other || r.dietary_notes
                      ? ` (${r.meal_style_other || r.dietary_notes})`
                      : ''}
                  </div>
                )}
                {r.guest_names && (
                  <div className="meta">Guests: {r.guest_names}</div>
                )}
                {(likes.length > 0 || other) && (
                  <div className="tags">
                    {likes.map((b) => (
                      <span className="tag" key={b}>
                        {b}
                      </span>
                    ))}
                    {other && <span className="tag">{other}</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
