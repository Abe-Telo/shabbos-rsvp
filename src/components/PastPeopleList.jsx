import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PersonAvatar from './PersonAvatar'
import { getPeople } from '../lib/api'
import {
  comingOptionLabel,
  foodIconFor,
  mealStartLabel,
  mealStyleLabel,
} from '../lib/formConfig'
import { formatWeekLabel } from '../lib/week'

function dishIcon(dish) {
  if (!dish) return '🍽️'
  const lower = dish.toLowerCase()
  if (lower.includes('wine') || lower.includes('drink')) return '🍷'
  if (lower.includes('challah') || lower.includes('bread')) return '🍞'
  if (lower.includes('salmon') || lower.includes('fish') || lower.includes('sushi'))
    return '🐟'
  if (lower.includes('chicken') || lower.includes('meat') || lower.includes('beef'))
    return '🍗'
  if (lower.includes('salad') || lower.includes('broccoli') || lower.includes('green'))
    return '🥗'
  if (lower.includes('rice') || lower.includes('kugel') || lower.includes('potato'))
    return '🍚'
  if (lower.includes('soup')) return '🍲'
  return foodIconFor(dish) || '🧺'
}

function PastWeekRow({ week }) {
  const coming = comingOptionLabel(week.coming) || week.coming
  const style = mealStyleLabel(week.meal_style) || week.meal_style
  const start =
    week.meal_start_time &&
    (mealStartLabel(week.meal_start_time) || week.meal_start_time)
  const dish = (week.bringing_dish || '').trim()
  const likes = week.food_likes || []

  return (
    <div className="past-week-row">
      <div className="past-week-main">
        <span className="past-week-icon" aria-hidden="true">
          📅
        </span>
        <div>
          <strong>{formatWeekLabel(week.week_start)}</strong>
          <div className="meta">{coming}</div>
        </div>
      </div>
      <div className="past-week-tags">
        {dish && (
          <span className="tag">
            <span className="food-icon" aria-hidden="true">
              {dishIcon(dish)}
            </span>{' '}
            {dish}
          </span>
        )}
        {style && (
          <span className="tag">
            <span className="food-icon" aria-hidden="true">
              👨‍🍳
            </span>{' '}
            {style}
          </span>
        )}
        {start && (
          <span className="tag">
            <span className="food-icon" aria-hidden="true">
              ⏰
            </span>{' '}
            {start}
          </span>
        )}
        {likes.slice(0, 4).map((like) => (
          <span className="tag" key={like}>
            <span className="food-icon" aria-hidden="true">
              {foodIconFor(like)}
            </span>{' '}
            {like}
          </span>
        ))}
      </div>
    </div>
  )
}

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
      const pastText = (p.past || [])
        .map(
          (w) =>
            `${w.week_start} ${w.coming} ${w.bringing_dish || ''} ${(w.food_likes || []).join(' ')}`,
        )
        .join(' ')
      const hay = `${p.name} ${pastText} ${(p.highlights || []).join(' ')}`.toLowerCase()
      return hay.includes(needle)
    })
  }, [people, q])

  return (
    <div className="panel">
      {!compact && <h2>Past people</h2>}
      <p className="hint">
        One row per past week — what they said and brought. No phones here.
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
        {filtered.map((p) => {
          const past = p.past || []
          return (
            <div className="person-row" key={p.id}>
              <div className="person-heading">
                <PersonAvatar name={p.name} photoUrl={p.photo_url} />
                <div>
                  {p.profile_username ? (
                    <Link
                      className="person-name-link"
                      to={`/u/${encodeURIComponent(p.profile_username)}`}
                    >
                      <strong>{p.name}</strong>
                    </Link>
                  ) : (
                    <strong>{p.name}</strong>
                  )}
                  <div className="meta">
                    Attended {p.times_attended || 0} time
                    {(p.times_attended || 0) === 1 ? '' : 's'}
                    {p.last_seen
                      ? ` · last ${new Date(p.last_seen).toLocaleDateString()}`
                      : ''}
                  </div>
                </div>
              </div>

              {past.length === 0 ? (
                <div className="meta">No weekly history yet.</div>
              ) : (
                <div className="past-week-list">
                  {past.map((week) => (
                    <PastWeekRow key={week.week_start} week={week} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
