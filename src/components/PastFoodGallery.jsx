import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PersonAvatar from './PersonAvatar'
import { getFoodHistory } from '../lib/api'
import { formatWeekLabel } from '../lib/week'

function photoSrc(p) {
  return typeof p === 'string' ? p : String(p?.url || '')
}

function photoCaption(p) {
  return typeof p === 'object' ? p?.caption || '' : ''
}

export default function PastFoodGallery() {
  const [weeks, setWeeks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const rows = await getFoodHistory()
        if (!cancelled) setWeeks(rows)
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

  return (
    <div className="panel">
      <h2>Past Shabbos food</h2>
      <p className="hint">
        Photos and comments from earlier weeks. This week&apos;s dishes stay on{' '}
        <Link to="/food">Food this week</Link>.
      </p>
      {loading && <p className="meta">Loading…</p>}
      {error && <div className="banner banner-err">{error}</div>}
      {!loading && !error && weeks.length === 0 && (
        <div className="empty">No past food photos yet.</div>
      )}
      {weeks.map((week) => (
        <div key={week.week_start} className="past-food-week">
          <h3 className="past-food-week-title">
            {formatWeekLabel(week.week_start)}
            <span className="tag" style={{ marginLeft: '0.5rem' }}>
              {week.dishes.length}
            </span>
          </h3>
          <div className="list food-week-list">
            {week.dishes.map((d) => {
              const photos = (d.food_photos || []).filter(photoSrc)
              return (
                <article className="food-card" key={d.id}>
                  <div className="food-card-head">
                    <PersonAvatar name={d.name} photoUrl={d.photo_url} />
                    <div className="food-card-meta">
                      {d.profile_username ? (
                        <Link
                          className="person-name-link"
                          to={`/u/${encodeURIComponent(d.profile_username)}`}
                        >
                          <strong>{d.name}</strong>
                        </Link>
                      ) : (
                        <strong>{d.name}</strong>
                      )}
                      {d.dish ? (
                        <div className="food-card-dish">{d.dish}</div>
                      ) : (
                        <div className="meta">Brought food</div>
                      )}
                    </div>
                  </div>
                  {d.food_comment && (
                    <p className="food-card-comment">{d.food_comment}</p>
                  )}
                  {photos.length > 0 && (
                    <div className="food-card-gallery">
                      {photos.map((p, i) => (
                        <figure className="food-card-shot" key={photoSrc(p) + i}>
                          <img src={photoSrc(p)} alt="" />
                          {photoCaption(p) ? (
                            <figcaption>{photoCaption(p)}</figcaption>
                          ) : null}
                        </figure>
                      ))}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
