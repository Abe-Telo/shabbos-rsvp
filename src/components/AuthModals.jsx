import { useEffect, useState } from 'react'
import { fileToPhotoData } from '../lib/auth'
import { useAuth } from '../lib/AuthContext'

function PhotoFields({ photoUrl, setPhotoUrl, photoData, setPhotoData }) {
  const [err, setErr] = useState('')

  async function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setErr('')
    try {
      const data = await fileToPhotoData(file)
      setPhotoData(data)
      setPhotoUrl('')
    } catch (ex) {
      setErr(ex.message || 'Could not use that image')
    }
  }

  const preview = photoData || photoUrl

  return (
    <>
      <div className="field">
        <label>Profile photo URL (optional)</label>
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
        <p className="hint" style={{ marginTop: '0.35rem', marginBottom: 0 }}>
          Keep it small (under ~300KB). You can skip this and add one later.
        </p>
      </div>
      {err && <div className="banner banner-err">{err}</div>}
      {preview && (
        <div className="profile-preview">
          <img src={preview} alt="Profile preview" />
        </div>
      )}
    </>
  )
}

export function AuthModal() {
  const {
    authOpen,
    registerSeed,
    closeAuth,
    login,
    register,
    openLogin,
    openRegister,
  } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [photoData, setPhotoData] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!authOpen) return
    setError('')
    setUsername('')
    setPassword('')
    setPhotoUrl('')
    setPhotoData('')
    setFullName(registerSeed?.fullName || '')
    setPhone(registerSeed?.phone || '')
  }, [authOpen, registerSeed])

  if (!authOpen) return null

  const isRegister = authOpen === 'register'

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      if (isRegister) {
        await register({
          username,
          password,
          fullName: fullName || registerSeed?.fullName || '',
          phone: phone || registerSeed?.phone || '',
          photoUrl: photoUrl.trim() || undefined,
          photoData: photoData || undefined,
          personId: registerSeed?.personId || undefined,
        })
      } else {
        await login({ username, password })
      }
    } catch (ex) {
      setError(ex.message || 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={closeAuth}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="auth-modal-title">
          {isRegister ? 'Create a profile' : 'Log in'}
        </h2>
        <p className="hint">
          {isRegister
            ? 'Optional — saves your name and photo for next time. You can still RSVP without an account.'
            : 'Optional login. RSVPs work without signing in.'}
        </p>

        {error && <div className="banner banner-err">{error}</div>}

        <form onSubmit={onSubmit}>
          {isRegister && (
            <>
              <div className="field">
                <label>Your name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label>Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="field">
            <label>Username</label>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={24}
              pattern="[A-Za-z0-9_]+"
              placeholder="letters, numbers, _"
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          {isRegister && (
            <PhotoFields
              photoUrl={photoUrl}
              setPhotoUrl={setPhotoUrl}
              photoData={photoData}
              setPhotoData={setPhotoData}
            />
          )}

          <div className="actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving
                ? 'Saving…'
                : isRegister
                  ? 'Create profile'
                  : 'Log in'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={closeAuth}>
              Cancel
            </button>
          </div>
        </form>

        <p className="meta" style={{ marginTop: '1rem', marginBottom: 0 }}>
          {isRegister ? (
            <>
              Already have a profile?{' '}
              <button type="button" className="linkish" onClick={openLogin}>
                Log in
              </button>
            </>
          ) : (
            <>
              New here?{' '}
              <button
                type="button"
                className="linkish"
                onClick={() => openRegister(registerSeed)}
              >
                Create a profile
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}

export function ProfileMenu() {
  const { user, loading, openLogin, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  if (loading) {
    return <div className="profile-chip profile-chip-loading" aria-hidden="true" />
  }

  if (!user) {
    return (
      <button
        type="button"
        className="btn btn-ghost profile-login-btn"
        onClick={openLogin}
      >
        Login
      </button>
    )
  }

  const initial = (user.full_name || user.username || '?').charAt(0).toUpperCase()

  return (
    <div className="profile-menu">
      <button
        type="button"
        className="profile-chip"
        aria-label={`Profile menu for ${user.username}`}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
      >
        {user.photo_url ? (
          <img src={user.photo_url} alt="" />
        ) : (
          <span className="profile-initial">{initial}</span>
        )}
      </button>
      {menuOpen && (
        <>
          <button
            type="button"
            className="profile-menu-scrim"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <div className="profile-dropdown">
            <div className="profile-dropdown-head">
              <strong>{user.full_name || user.username}</strong>
              <div className="meta">@{user.username}</div>
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ width: '100%' }}
              onClick={async () => {
                setMenuOpen(false)
                await logout()
              }}
            >
              Log out
            </button>
          </div>
        </>
      )}
    </div>
  )
}
