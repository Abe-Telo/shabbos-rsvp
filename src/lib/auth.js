const TOKEN_KEY = 'shabbos-user-token'
const DEMO_USERS_KEY = 'shabbos-demo-users-v1'
const DEMO_SESSION_KEY = 'shabbos-demo-user-session-v1'

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

function uid() {
  return crypto.randomUUID()
}

function isDemo() {
  return !API_URL
}

export function getUserToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setUserToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

async function apiAuth(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }
  const token = getUserToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${API_URL}${path}`, { ...options, headers })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`)
  return body
}

function loadDemoUsers() {
  try {
    return JSON.parse(localStorage.getItem(DEMO_USERS_KEY) || '[]')
  } catch {
    return []
  }
}

function saveDemoUsers(users) {
  localStorage.setItem(DEMO_USERS_KEY, JSON.stringify(users))
}

function publicDemoUser(u) {
  if (!u) return null
  return {
    id: u.id,
    username: u.username,
    full_name: u.full_name,
    phone: u.phone || null,
    photo_url: u.photo_url || null,
    person_id: u.person_id || null,
    created_at: u.created_at,
  }
}

function normalizeUsername(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
  if (s.includes('@')) {
    return s.replace(/[^a-z0-9.@_+-]/g, '')
  }
  return s.replace(/[^a-z0-9_]/g, '')
}

function validateUsername(username) {
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

async function registerDemo(payload) {
  const username = normalizeUsername(payload.username)
  const password = String(payload.password || '')
  const fullName = String(payload.fullName || '').trim()
  const usernameError = validateUsername(username)
  if (usernameError) throw new Error(usernameError)
  if (password.length < 6) throw new Error('Password must be at least 6 characters')
  if (!fullName) throw new Error('Name is required')

  const users = loadDemoUsers()
  if (users.some((u) => u.username === username)) {
    throw new Error('That username is taken')
  }
  const user = {
    id: uid(),
    username,
    password,
    full_name: fullName,
    phone: payload.phone || null,
    photo_url: payload.photoData || payload.photoUrl || null,
    person_id: payload.personId || null,
    created_at: new Date().toISOString(),
  }
  users.push(user)
  saveDemoUsers(users)
  const token = uid()
  localStorage.setItem(
    DEMO_SESSION_KEY,
    JSON.stringify({ token, user_id: user.id }),
  )
  setUserToken(token)
  return { user: publicDemoUser(user), token }
}

async function loginDemo(payload) {
  const username = normalizeUsername(payload.username)
  const password = String(payload.password || '')
  const user = loadDemoUsers().find((u) => u.username === username)
  if (!user || user.password !== password) {
    throw new Error('Incorrect username or password')
  }
  const token = uid()
  localStorage.setItem(
    DEMO_SESSION_KEY,
    JSON.stringify({ token, user_id: user.id }),
  )
  setUserToken(token)
  return { user: publicDemoUser(user), token }
}

async function meDemo() {
  const token = getUserToken()
  if (!token) return null
  try {
    const session = JSON.parse(localStorage.getItem(DEMO_SESSION_KEY) || 'null')
    if (!session || session.token !== token) return null
    const user = loadDemoUsers().find((u) => u.id === session.user_id)
    return publicDemoUser(user)
  } catch {
    return null
  }
}

async function logoutDemo() {
  localStorage.removeItem(DEMO_SESSION_KEY)
  setUserToken('')
}

async function updateDemo(patch) {
  const token = getUserToken()
  const session = JSON.parse(localStorage.getItem(DEMO_SESSION_KEY) || 'null')
  if (!session || session.token !== token) throw new Error('Not logged in')
  const users = loadDemoUsers()
  const idx = users.findIndex((u) => u.id === session.user_id)
  if (idx < 0) throw new Error('Not logged in')
  const u = users[idx]
  if (patch.fullName) u.full_name = patch.fullName.trim()
  if (patch.phone !== undefined) u.phone = patch.phone || null
  if (patch.photoData || patch.photoUrl !== undefined) {
    u.photo_url = patch.photoData || patch.photoUrl || null
  }
  users[idx] = u
  saveDemoUsers(users)
  return publicDemoUser(u)
}

export async function registerProfile(payload) {
  if (isDemo()) return registerDemo(payload)
  const body = await apiAuth('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  setUserToken(body.token)
  return body
}

export async function loginProfile(payload) {
  if (isDemo()) return loginDemo(payload)
  const body = await apiAuth('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  setUserToken(body.token)
  return body
}

export async function fetchCurrentUser() {
  if (!getUserToken()) return null
  if (isDemo()) return meDemo()
  try {
    const body = await apiAuth('/auth/me')
    return body.user
  } catch {
    setUserToken('')
    return null
  }
}

export async function logoutProfile() {
  if (isDemo()) {
    await logoutDemo()
    return
  }
  try {
    await apiAuth('/auth/logout', { method: 'POST', body: '{}' })
  } catch {
    /* ignore */
  }
  setUserToken('')
}

export async function updateProfile(patch) {
  if (isDemo()) return updateDemo(patch)
  const body = await apiAuth('/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return body.user
}

/** Read a file into a compressed-ish data URL (max ~400KB string). */
export function fileToPhotoData(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Please choose an image file'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      if (dataUrl.length > 450_000) {
        reject(new Error('Photo is too large — try a smaller image or paste a URL'))
        return
      }
      resolve(dataUrl)
    }
    reader.onerror = () => reject(new Error('Could not read that image'))
    reader.readAsDataURL(file)
  })
}
