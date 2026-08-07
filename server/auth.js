import crypto from 'crypto'

const MAX_PHOTO_CHARS = 450_000 // ~337KB binary as base64 data URL

export function normalizeUsername(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
  if (s.includes('@')) {
    return s.replace(/[^a-z0-9.@_+-]/g, '')
  }
  return s.replace(/[^a-z0-9_]/g, '')
}

export function validateUsername(username) {
  if (!username) return 'Username or email is required'
  if (username.includes('@')) {
    if (username.length < 5 || username.length > 64) {
      return 'Email must be 5–64 characters'
    }
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(username)) {
      return 'Enter a valid email, or a username (letters, numbers, _)'
    }
    return ''
  }
  if (username.length < 3 || username.length > 24) {
    return 'Username must be 3–24 letters, numbers, or _'
  }
  return ''
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex')
  return { salt, hash }
}

export function verifyPassword(password, salt, hash) {
  if (!salt || !hash) return false
  const next = crypto.scryptSync(String(password), salt, 64)
  const prev = Buffer.from(hash, 'hex')
  if (prev.length !== next.length) return false
  return crypto.timingSafeEqual(prev, next)
}

export function publicUser(user) {
  if (!user) return null
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    phone: user.phone || null,
    photo_url: user.photo_url || null,
    bio: user.bio || null,
    city: user.city || null,
    shul: user.shul || null,
    person_id: user.person_id || null,
    created_at: user.created_at,
  }
}

/** Public card shown to everyone — no phone. */
export function publicProfile(user) {
  if (!user) return null
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    photo_url: user.photo_url || null,
    bio: user.bio || null,
    city: user.city || null,
    shul: user.shul || null,
    person_id: user.person_id || null,
    created_at: user.created_at,
  }
}

export function sanitizePhoto(photoUrl, photoData) {
  const data = String(photoData || '').trim()
  if (data) {
    if (!data.startsWith('data:image/')) {
      throw new Error('Photo upload must be an image')
    }
    if (data.length > MAX_PHOTO_CHARS) {
      throw new Error('Photo is too large — try a smaller image or a URL')
    }
    return data
  }
  const url = String(photoUrl || '').trim()
  if (!url) return null
  if (!/^https?:\/\//i.test(url) && !url.startsWith('data:image/')) {
    throw new Error('Photo URL must start with http:// or https://')
  }
  if (url.length > MAX_PHOTO_CHARS) {
    throw new Error('Photo URL / data is too large')
  }
  return url
}

export function cleanExpiredSessions(db) {
  const now = Date.now()
  db.user_sessions = (db.user_sessions || []).filter(
    (s) => new Date(s.expires_at).getTime() > now,
  )
}

export function findUserByToken(db, token) {
  if (!token) return null
  cleanExpiredSessions(db)
  const session = (db.user_sessions || []).find((s) => s.token === token)
  if (!session) return null
  return (db.users || []).find((u) => u.id === session.user_id) || null
}
