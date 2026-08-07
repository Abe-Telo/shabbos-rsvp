import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import PastPeopleList from '../components/PastPeopleList'
import PersonAvatar from '../components/PersonAvatar'
import { comingLabel, getWeekRsvps } from '../lib/api'
import {
  comingOptionLabel,
  foodIconFor,
  mealStartLabel,
  mealStyleLabel,
  PUBLIC_COMING_VALUES,
} from '../lib/formConfig'
import { currentSunday, formatWeekLabel } from '../lib/week'

function tabFromPath(pathname, defaultTab) {
  if (defaultTab === 'food' || pathname.endsWith('/food')) return 'food'
  if (defaultTab === 'past' || pathname.endsWith('/people')) return 'past'
  if (defaultTab === 'sheet' || pathname.endsWith('/sheet')) return 'sheet'
  return 'coming'
}

export default function BoardPage({ defaultTab = 'coming' }) {
  const location = useLocation()
  const navigate = useNavigate()
  const week = currentSunday()
  const [rsvps, setRsvps] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState(() =>
    tabFromPath(location.pathname, defaultTab),
  )

  useEffect(() => {
    setTab(tabFromPath(location.pathname, defaultTab))
  }, [location.pathname, defaultTab])

  function selectTab(next) {
    setTab(next)
    if (next === 'food') navigate('/food')
    else if (next === 'past') navigate('/people')
    else if (next === 'sheet') navigate('/sheet')
    else navigate('/board')
  }

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

  const publicRsvps = useMemo(
    () => rsvps.filter((r) => PUBLIC_COMING_VALUES.includes(r.coming)),
    [rsvps],
  )

  const grouped = useMemo(() => {
    return PUBLIC_COMING_VALUES.map((value) => ({
      value,
      label: comingOptionLabel(value),
      rows: publicRsvps.filter((r) => r.coming === value),
    })).filter((g) => g.rows.length > 0)
  }, [publicRsvps])

  const stats = useMemo(() => {
    const guests = publicRsvps.reduce(
      (n, r) => n + (Number(r.guest_count) || 0),
      0,
    )
    const dishes = publicRsvps
      .map((r) => ({
        name: r.full_name,
        dish: (r.bringing_dish || r.potluck_contribution || '').trim(),
        coming: comingLabel(r.coming),
      }))
      .filter((r) => r.dish)
    return { coming: publicRsvps.length, guests, dishes }
  }, [publicRsvps])

  const sheetRows = useMemo(() => {
    return [...publicRsvps]
      .sort((a, b) =>
        String(a.full_name || '').localeCompare(String(b.full_name || ''), undefined, {
          sensitivity: 'base',
        }),
      )
      .map((r) => {
        const likes = [...(r.food_likes || r.bringing || [])]
        const other = r.food_likes_other || r.bringing_other
        if (other) likes.push(other)
        const start =
          r.meal_start_time === 'other'
            ? r.meal_start_other || 'Other'
            : mealStartLabel(r.meal_start_time) || r.meal_start_time || ''
        return {
          id: r.id,
          name: r.full_name || '',
          coming: comingLabel(r.coming),
          style: mealStyleLabel(r.meal_style || r.potluck) || '',
          start,
          bringing: (r.bringing_dish || '').trim(),
          likes: likes.join(', '),
          guests: r.guest_names || '',
          guestCount: r.guest_count ? String(r.guest_count) : '',
        }
      })
  }, [publicRsvps])

  return (
    <>
      <section className="hero">
        <h1>
          {tab === 'food'
            ? 'Food this week'
            : tab === 'past'
              ? 'Past people'
              : tab === 'sheet'
                ? 'Sheet view'
                : 'This week'}
        </h1>
        <p>
          {tab === 'food'
            ? `Dishes people are bringing for ${formatWeekLabel(week)}.`
            : tab === 'past'
              ? 'Everyone who has ever joined — all weeks, attendance counts, and food history.'
              : tab === 'sheet'
                ? `Spreadsheet of public RSVPs for ${formatWeekLabel(week)}. Phones and sponsorship stay private.`
                : `Public RSVPs for ${formatWeekLabel(week)} — who selected each coming answer. Phones and sponsorship stay private.`}
        </p>
      </section>

      {error && tab !== 'past' && (
        <div className="banner banner-err">{error}</div>
      )}

      {tab !== 'past' && (
        <div className="stats">
          <div className="stat">
            <span className="n">{stats.coming}</span>
            <span className="l">Public RSVPs</span>
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
      )}

      <div className="nav" style={{ marginBottom: '1rem' }}>
        <button
          type="button"
          className={`btn ${tab === 'coming' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => selectTab('coming')}
        >
          Who&apos;s coming
        </button>
        <button
          type="button"
          className={`btn ${tab === 'food' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => selectTab('food')}
        >
          Food this week
        </button>
        <button
          type="button"
          className={`btn ${tab === 'past' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => selectTab('past')}
        >
          Past people
        </button>
        <button
          type="button"
          className={`btn ${tab === 'sheet' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => selectTab('sheet')}
        >
          Sheet view
        </button>
      </div>

      {tab === 'past' && <PastPeopleList compact />}

      {tab === 'sheet' && (
        <div className="panel">
          <h2>This week — sheet</h2>
          <p className="hint">
            Public columns only (no phones or sponsorship). Scroll sideways on
            small screens.
          </p>
          {loading && <p className="meta">Loading…</p>}
          {!loading && sheetRows.length === 0 && (
            <div className="empty">No public RSVPs yet this week.</div>
          )}
          {sheetRows.length > 0 && (
            <div className="sheet-wrap">
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Name</th>
                    <th>Coming</th>
                    <th>Meal style</th>
                    <th>Start</th>
                    <th>Bringing</th>
                    <th>Food likes</th>
                    <th>Guests</th>
                    <th>#</th>
                  </tr>
                </thead>
                <tbody>
                  {sheetRows.map((row) => {
                    const photo = publicRsvps.find((r) => r.id === row.id)?.photo_url
                    return (
                      <tr key={row.id}>
                        <td>
                          <PersonAvatar
                            name={row.name}
                            photoUrl={photo}
                            size={28}
                          />
                        </td>
                        <td title={row.name}>
                          {publicRsvps.find((r) => r.id === row.id)
                            ?.profile_username ? (
                            <Link
                              className="person-name-link"
                              to={`/u/${encodeURIComponent(
                                publicRsvps.find((r) => r.id === row.id)
                                  .profile_username,
                              )}`}
                            >
                              {row.name}
                            </Link>
                          ) : (
                            row.name
                          )}
                        </td>
                        <td title={row.coming}>{row.coming}</td>
                        <td title={row.style}>{row.style}</td>
                        <td title={row.start}>{row.start}</td>
                        <td title={row.bringing}>{row.bringing}</td>
                        <td title={row.likes}>{row.likes}</td>
                        <td title={row.guests}>{row.guests}</td>
                        <td title={row.guestCount}>{row.guestCount}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'food' && (
        <div className="panel">
          <h2>Food people are bringing</h2>
          <p className="hint">
            From people who RSVP&apos;d publicly this week. Resets each Sunday.
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
                <div className="meta person-heading" style={{ marginTop: '0.25rem' }}>
                  <PersonAvatar
                    name={d.name}
                    photoUrl={
                      publicRsvps.find((r) => r.full_name === d.name)?.photo_url
                    }
                    size={28}
                  />
                  <span>
                    Brought by {d.name}
                    {d.coming ? ` · ${d.coming}` : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'coming' && (
        <div className="panel">
          <h2>Who&apos;s coming</h2>
          <p className="hint">
            Grouped by what they selected for “Are you coming this week?” —
            public answers only.
          </p>
          {loading && <p className="meta">Loading…</p>}
          {!loading && publicRsvps.length === 0 && (
            <div className="empty">No public RSVPs yet this week.</div>
          )}

          {grouped.map((group) => (
            <div key={group.value} style={{ marginTop: '1.25rem' }}>
              <h3
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.05rem',
                  margin: '0 0 0.55rem',
                }}
              >
                {group.label}
                <span className="tag" style={{ marginLeft: '0.5rem' }}>
                  {group.rows.length}
                </span>
              </h3>
              <div className="list">
                {group.rows.map((r) => {
                  const likes = r.food_likes || r.bringing || []
                  const other = r.food_likes_other || r.bringing_other
                  const style = r.meal_style || r.potluck
                  const dish = (r.bringing_dish || '').trim()
                  return (
                    <div className="rsvp-row" key={r.id}>
                      <div className="person-heading">
                        <PersonAvatar
                          name={r.full_name}
                          photoUrl={r.photo_url}
                        />
                        {r.profile_username ? (
                          <Link
                            className="person-name-link"
                            to={`/u/${encodeURIComponent(r.profile_username)}`}
                          >
                            <strong>{r.full_name}</strong>
                          </Link>
                        ) : (
                          <strong>{r.full_name}</strong>
                        )}
                      </div>
                      <div className="tags">
                        <span className="tag tag-warn">{comingLabel(r.coming)}</span>
                        {r.guest_count ? (
                          <span className="tag">
                            {r.guest_count} guest
                            {r.guest_count == 1 ? '' : 's'}
                          </span>
                        ) : null}
                      </div>
                      {style && (
                        <div className="meta">
                          Prefers: {mealStyleLabel(style) || style}
                        </div>
                      )}
                      {(r.meal_start_time || r.meal_start_other) && (
                        <div className="meta">
                          Start:{' '}
                          {r.meal_start_time === 'other'
                            ? r.meal_start_other || 'Other'
                            : mealStartLabel(r.meal_start_time)}
                        </div>
                      )}
                      {dish && (
                        <div className="meta">Bringing: {dish}</div>
                      )}
                      {r.guest_names && (
                        <div className="meta">Guests: {r.guest_names}</div>
                      )}
                      {(likes.length > 0 || other) && (
                        <div className="tags">
                          {likes.map((b) => (
                            <span className="tag" key={b}>
                              <span className="food-icon" aria-hidden="true">
                                {foodIconFor(b)}
                              </span>{' '}
                              {b}
                            </span>
                          ))}
                          {other && (
                            <span className="tag">
                              <span className="food-icon" aria-hidden="true">
                                ✨
                              </span>{' '}
                              {other}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
