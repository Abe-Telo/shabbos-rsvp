import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PersonAvatar from '../components/PersonAvatar'
import { useAuth } from '../lib/AuthContext'
import { fileToPhotoData } from '../lib/auth'

export default function ProfilePage() {
  const { user, loading, saveProfile, openLogin } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [bio, setBio] = useState('')
  const [city, setCity] = useState('')
  const [shul, setShul] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [photoData, setPhotoData] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) return
    setFullName(user.full_name || '')
    setPhone(user.phone || '')
    setBio(user.bio || '')
    setCity(user.city || '')
    setShul(user.shul || '')
    setPhotoUrl('')
    setPhotoData('')
  }, [user])

  if (loading) {
    return (
      <div className="panel">
        <p className="meta">Loading profile…</p>
      </div>
    )
  }

  if (!user) {
    return (
      <>
        <section className="hero">
          <h1>Your profile</h1>
          <p>Log in to edit your account and public bio.</p>
        </section>
        <div className="panel">
          <button type="button" className="btn btn-primary" onClick={openLogin}>
            Log in
          </button>
        </div>
      </>
    )
  }

  async function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    try {
      const data = await fileToPhotoData(file)
      setPhotoData(data)
      setPhotoUrl('')
    } catch (ex) {
      setError(ex.message || 'Could not use that image')
    }
  }

  async function saveAccount(e) {
    e.preventDefault()
    setError('')
    setMessage('')
    setSaving(true)
    try {
      const patch = {
        fullName,
        phone,
        bio,
        city,
        shul,
      }
      if (photoData) patch.photoData = photoData
      else if (photoUrl.trim()) patch.photoUrl = photoUrl.trim()
      await saveProfile(patch)
      setPhotoData('')
      setPhotoUrl('')
      setMessage('Profile saved.')
    } catch (ex) {
      setError(ex.message || 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  async function savePassword(e) {
    e.preventDefault()
    setError('')
    setMessage('')
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }
    setSaving(true)
    try {
      await saveProfile({ currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setMessage('Password updated.')
    } catch (ex) {
      setError(ex.message || 'Could not change password')
    } finally {
      setSaving(false)
    }
  }

  const preview = photoData || photoUrl || user.photo_url

  return (
    <>
      <section className="hero">
        <h1>Your profile</h1>
        <p>
          Account details stay private except your public name, photo, and bio.
          Others can open your public page from the board.
        </p>
      </section>

      {error && <div className="banner banner-err">{error}</div>}
      {message && <div className="banner banner-ok">{message}</div>}

      <div className="panel">
        <div className="person-heading" style={{ marginBottom: '1rem' }}>
          <PersonAvatar name={fullName || user.username} photoUrl={preview} size={64} />
          <div>
            <strong>{fullName || user.username}</strong>
            <div className="meta">{user.username}</div>
            <Link className="linkish" to={`/u/${encodeURIComponent(user.username)}`}>
              View public profile
            </Link>
          </div>
        </div>

        <form onSubmit={saveAccount}>
          <h2 style={{ fontSize: '1.15rem' }}>Public info</h2>
          <div className="field">
            <label>Display name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>About you</label>
            <textarea
              rows={4}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A little about yourself, family, interests…"
              maxLength={2000}
            />
          </div>
          <div className="field">
            <label>City / neighborhood</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              maxLength={120}
            />
          </div>
          <div className="field">
            <label>Shul / community</label>
            <input
              type="text"
              value={shul}
              onChange={(e) => setShul(e.target.value)}
              maxLength={120}
            />
          </div>
          <div className="field">
            <label>Photo URL</label>
            <input
              type="url"
              value={photoUrl}
              onChange={(e) => {
                setPhotoUrl(e.target.value)
                if (e.target.value.trim()) setPhotoData('')
              }}
              placeholder="https://…"
            />
          </div>
          <div className="field">
            <label>Or upload a photo</label>
            <input type="file" accept="image/*" onChange={onFile} />
          </div>

          <h2 style={{ fontSize: '1.15rem', marginTop: '1.25rem' }}>Private account</h2>
          <div className="field">
            <label>Phone (private)</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Username</label>
            <input type="text" value={user.username} disabled />
            <p className="hint" style={{ marginTop: '0.35rem', marginBottom: 0 }}>
              Username can&apos;t be changed.
            </p>
          </div>

          <div className="actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save profile'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => navigate('/board')}
            >
              Back to board
            </button>
          </div>
        </form>
      </div>

      <div className="panel" style={{ marginTop: '1rem' }}>
        <h2 style={{ fontSize: '1.15rem' }}>Change password</h2>
        <form onSubmit={savePassword}>
          <div className="field">
            <label>Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <div className="field">
            <label>New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <div className="field">
            <label>Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <div className="actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              Update password
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
