import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { comingLabel, getWeekRsvps } from '../lib/api'
import { mealStyleLabel } from '../lib/formConfig'
import { currentSunday, formatWeekLabel } from '../lib/week'

export default function BoardPage({ defaultTab = 'coming' }) {
  const location = useLocation()
  const week = currentSunday()
  const [rsvps, setRsvps] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState(
    defaultTab === 'food' || location.pathname.endsWith('/food')
      ? 'food'
      : 'coming',
  )

  useEffect(() => {
    setTab(
      defaultTab === 'food' || location.pathname.endsWith('/food')
        ? 'food'
        : 'coming',
    )
  }, [location.pathname, defaultTab])

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
      [
        'yes',
        'yes_guest',
        'yes_new',
        'probably',
        'social',
        'unsure',
        'help',
      ].includes(r.coming),
    )
    const guests = rsvps.reduce((n, r) => n + (Number(r.guest_count) || 0), 0)
    const dishes = rsvps
      .map((r) => ({
        name: r.full_name,
        dish: (r.bringing_dish || r.potluck_contribution || '').trim(),
      }))
      .filter((r) => r.dish)
    return { coming: coming.length, guests, dishes }
  }, [rsvps])

  return (
    <>
      <section className="hero">
        <h1>{tab === 'food' ? 'Food this week' : 'This week'}</h1>
        <p>
          {tab === 'food'
            ? `Dishes people are bringing for ${formatWeekLabel(week)}.`
            : `Public RSVPs for ${formatWeekLabel(week)}. Phones and sponsorship stay private.`}
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
          <span className="n">{stats.dishes.length}</span>
          <span className="l">Dishes listed</span>
        </div>
      </div>

      <div className="nav" style={{ marginBottom: '1rem' }}>
        <button
          type="button"
          className={`btn ${tab === 'coming' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setTab('coming')}
        >
          Who&apos;s coming
        </button>
        <button
          type="button"
          className={`btn ${tab === 'food' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setTab('food')}
        >
          Food this week
        </button>
      </div>

      {tab === 'food' && (
        <div className="panel">
          <h2>Food people are bringing</h2>
          <p className="hint">
            Whatever guests typed (e.g. Flo rice). Resets each Sunday with the
            week.
          </p>
          {loading && <p className="meta">Loading…</p>}
          {!loading && stats.dishes.length === 0 && (
            <div className="empty">
              No dishes listed yet. Guests can answer “What are you bringing this
              week?” on the form.
            </div>
          )}
          <div className="list">
            {stats.dishes.map((d, i) => (
              <div className="rsvp-row" key={`${d.name}-${d.dish}-${i}`}>
                <strong>{d.dish}</strong>
                <div className="meta">Brought by {d.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'coming' && (
        <div className="panel">
          <h2>Who&apos;s coming</h2>
          <p className="hint">Names and meal preferences only — no phone numbers.</p>
          {loading && <p className="meta">Loading…</p>}
          {!loading && rsvps.length === 0 && (
            <div className="empty">No RSVPs yet this week. Be the first!</div>
          )}
          <div className="list">
            {rsvps.map((r) => {
              const likes = r.food_likes || r.bringing || []
              const other = r.food_likes_other || r.bringing_other
              const style = r.meal_style || r.potluck
              const dish = (r.bringing_dish || '').trim()
              return (
                <div className="rsvp-row" key={r.id}>
                  <strong>{r.full_name}</strong>
                  <div className="meta">
                    {comingLabel(r.coming)}
                    {r.guest_count
                      ? ` · ${r.guest_count} guest${
                          r.guest_count == 1 ? '' : 's'
                        }`
                      : ''}
                  </div>
                  {style && (
                    <div className="meta">
                      Prefers: {mealStyleLabel(style) || style}
                    </div>
                  )}
                  {dish && (
                    <div className="tags">
                      <span className="tag tag-warn">Bringing: {dish}</span>
                    </div>
                  )}
                  {r.guest_names && (
                    <div className="meta">Guests: {r.guest_names}</div>
                  )}
                  {(likes.length > 0 || other) && (
                    <div className="tags">
                      {likes.map((b) => (
                        <span className="tag" key={b}>
                          Likes {b}
                        </span>
                      ))}
                      {other && <span className="tag">Likes {other}</span>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
