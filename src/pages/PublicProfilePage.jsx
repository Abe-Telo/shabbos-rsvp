import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PersonAvatar from '../components/PersonAvatar'
import { comingOptionLabel, mealStyleLabel } from '../lib/formConfig'
import { getPublicProfile } from '../lib/auth'
import { useAuth } from '../lib/AuthContext'
import { formatWeekLabel } from '../lib/week'

export default function PublicProfilePage() {
  const { username } = useParams()
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const body = await getPublicProfile(username)
        if (!cancelled) setData(body)
      } catch (e) {
        if (!cancelled) setError(e.message || 'Profile not found')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [username])

  const profile = data?.profile
  const isOwn = user && profile && user.username === profile.username

  return (
    <>
      <section className="hero">
        <h1>Guest profile</h1>
        <p>Public info this person chose to share.</p>
      </section>

      {loading && (
        <div className="panel">
          <p className="meta">Loading…</p>
        </div>
      )}
      {error && <div className="banner banner-err">{error}</div>}

      {!loading && profile && (
        <div className="panel">
          <div className="person-heading" style={{ marginBottom: '1rem' }}>
            <PersonAvatar
              name={profile.full_name || profile.username}
              photoUrl={profile.photo_url}
              size={72}
            />
            <div>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-display)' }}>
                {profile.full_name || profile.username}
              </h2>
              <div className="meta">{profile.username}</div>
              {isOwn && (
                <Link className="linkish" to="/profile">
                  Edit your profile
                </Link>
              )}
            </div>
          </div>

          {(profile.city || profile.shul) && (
            <div className="meta" style={{ marginBottom: '0.75rem' }}>
              {[profile.city, profile.shul].filter(Boolean).join(' · ')}
            </div>
          )}

          {profile.bio ? (
            <p style={{ whiteSpace: 'pre-wrap', marginTop: 0 }}>{profile.bio}</p>
          ) : (
            <p className="hint">No bio yet.</p>
          )}

          {data.stats && (
            <div className="meta" style={{ marginTop: '1rem' }}>
              Attended {data.stats.times_attended || 0} time
              {(data.stats.times_attended || 0) === 1 ? '' : 's'}
              {data.stats.first_seen
                ? ` · first ${new Date(data.stats.first_seen).toLocaleDateString()}`
                : ''}
            </div>
          )}

          {data.history?.length > 0 && (
            <>
              <h3
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.05rem',
                  margin: '1.25rem 0 0.55rem',
                }}
              >
                Public Shabbos history
              </h3>
              <div className="list">
                {data.history.map((r) => (
                  <div className="rsvp-row" key={r.id}>
                    <strong>{formatWeekLabel(r.week_start)}</strong>
                    <div className="meta">
                      {comingOptionLabel(r.coming) || r.coming}
                      {r.meal_style
                        ? ` · ${mealStyleLabel(r.meal_style) || r.meal_style}`
                        : ''}
                    </div>
                    {r.bringing_dish && (
                      <div className="meta">Brought: {r.bringing_dish}</div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="actions">
            <Link className="btn btn-ghost" to="/board">
              Back to this week
            </Link>
          </div>
        </div>
      )}
    </>
  )
}
