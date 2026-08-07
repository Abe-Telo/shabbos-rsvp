import cors from 'cors'
import express from 'express'
import { v4 as uuid } from 'uuid'
import {
  findUserByToken,
  hashPassword,
  normalizeUsername,
  publicUser,
  sanitizePhoto,
  verifyPassword,
} from './auth.js'
import { loadDb, saveDb } from './db.js'

const PORT = Number(process.env.PORT || 3055)
const ADMIN_PASSWORD = process.env.SHABBOS_ADMIN_PASSWORD || 'shabbos-admin'
const ATTENDING = new Set([
  'yes',
  'yes_guest',
  'yes_new',
  'probably',
  'social',
  'unsure',
  'help',
])

const app = express()
app.use(
  cors({
    origin: [
      'https://abe-telo.github.io',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:4173',
    ],
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
)
app.use(express.json({ limit: '2mb' }))

function digits(phone) {
  return String(phone || '').replace(/\D/g, '')
}

function bearerToken(req) {
  const h = req.headers.authorization || ''
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m ? m[1].trim() : String(req.body?.token || req.query?.token || '').trim()
}

function createUserSession(db, userId) {
  const token = uuid()
  const expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  db.user_sessions = db.user_sessions || []
  db.user_sessions.push({ token, user_id: userId, expires_at })
  return { token, expires_at }
}

function foodPrefs(form) {
  const parts = [...(form.foodLikes || [])]
  if (form.foodLikesOther) parts.push(form.foodLikesOther)
  if (form.bringingDish) parts.push(`Bringing: ${form.bringingDish}`)
  if (form.mealStyle) parts.push(`Style: ${form.mealStyle}`)
  if (form.mealStyleOther) parts.push(form.mealStyleOther)
  if (form.mealStartTime) {
    const start =
      form.mealStartTime === 'other'
        ? form.mealStartOther || 'Other'
        : form.mealStartTime
    parts.push(`Start: ${start}`)
  }
  return parts.join(', ')
}

function currentSunday(date = new Date()) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function mapRsvpPublic(row) {
  if (!row) return null
  const { phone, ...rest } = row
  return {
    ...rest,
    bringing: row.food_likes || [],
    bringing_other: row.food_likes_other || null,
    potluck: row.meal_style || null,
  }
}

function mapPersonPublic(row) {
  if (!row) return null
  const { phone, phone_digits, ...rest } = row
  return rest
}

function upsertPerson(db, form) {
  const phoneKey = digits(form.phone)
  const name = String(form.fullName || '').trim()
  const now = new Date().toISOString()
  const week = form.weekStart || currentSunday()
  const attending = ATTENDING.has(form.coming)
  const prefs = foodPrefs(form)

  let person =
    (phoneKey &&
      db.people.find((p) => digits(p.phone) === phoneKey || p.phone_digits === phoneKey)) ||
    db.people.find((p) => p.name.toLowerCase() === name.toLowerCase())

  const already = person
    ? db.rsvps.some(
        (r) =>
          r.person_id === person.id &&
          r.week_start === week &&
          ATTENDING.has(r.coming),
      )
    : false

  if (person) {
    person.name = name
    person.phone = form.phone.trim()
    person.phone_digits = phoneKey || null
    person.last_seen = now
    if (prefs) {
      person.food_prefs = [person.food_prefs, prefs].filter(Boolean).join(' | ')
    }
    if (attending && !already) {
      person.times_attended = (person.times_attended || 0) + 1
    }
    return person
  }

  person = {
    id: uuid(),
    name,
    phone: form.phone.trim(),
    phone_digits: phoneKey || null,
    times_attended: attending ? 1 : 0,
    food_prefs: prefs || null,
    first_seen: now,
    last_seen: now,
  }
  db.people.push(person)
  return person
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'shabbos-rsvp-api' })
})

app.post('/auth/register', (req, res) => {
  try {
    const body = req.body || {}
    const username = normalizeUsername(body.username)
    const password = String(body.password || '')
    const fullName = String(body.fullName || body.full_name || '').trim()
    const phone = String(body.phone || '').trim()

    if (username.length < 3 || username.length > 24) {
      return res.status(400).json({ error: 'Username must be 3–24 letters, numbers, or _' })
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' })
    }
    if (!fullName) {
      return res.status(400).json({ error: 'Name is required' })
    }

    let photo_url = null
    try {
      photo_url = sanitizePhoto(body.photoUrl || body.photo_url, body.photoData)
    } catch (e) {
      return res.status(400).json({ error: e.message })
    }

    const db = loadDb()
    db.users = db.users || []
    db.user_sessions = db.user_sessions || []

    if (db.users.some((u) => u.username === username)) {
      return res.status(409).json({ error: 'That username is taken' })
    }

    const phoneKey = digits(phone)
    let person =
      (body.personId && db.people.find((p) => p.id === body.personId)) ||
      (phoneKey &&
        db.people.find(
          (p) => digits(p.phone) === phoneKey || p.phone_digits === phoneKey,
        )) ||
      db.people.find((p) => p.name.toLowerCase() === fullName.toLowerCase())

    const { salt, hash } = hashPassword(password)
    const now = new Date().toISOString()
    const user = {
      id: uuid(),
      username,
      password_salt: salt,
      password_hash: hash,
      full_name: fullName,
      phone: phone || null,
      phone_digits: phoneKey || null,
      photo_url,
      person_id: person?.id || null,
      created_at: now,
    }
    db.users.push(user)
    const session = createUserSession(db, user.id)
    saveDb(db)
    res.json({ user: publicUser(user), token: session.token, expires_at: session.expires_at })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message || 'Server error' })
  }
})

app.post('/auth/login', (req, res) => {
  try {
    const username = normalizeUsername(req.body?.username)
    const password = String(req.body?.password || '')
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' })
    }
    const db = loadDb()
    const user = (db.users || []).find((u) => u.username === username)
    if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
      return res.status(401).json({ error: 'Incorrect username or password' })
    }
    const session = createUserSession(db, user.id)
    saveDb(db)
    res.json({ user: publicUser(user), token: session.token, expires_at: session.expires_at })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message || 'Server error' })
  }
})

app.get('/auth/me', (req, res) => {
  const db = loadDb()
  const user = findUserByToken(db, bearerToken(req))
  if (!user) return res.status(401).json({ error: 'Not logged in' })
  res.json({ user: publicUser(user) })
})

app.patch('/auth/me', (req, res) => {
  try {
    const db = loadDb()
    const user = findUserByToken(db, bearerToken(req))
    if (!user) return res.status(401).json({ error: 'Not logged in' })

    const body = req.body || {}
    if (body.fullName || body.full_name) {
      user.full_name = String(body.fullName || body.full_name).trim() || user.full_name
    }
    if (body.phone !== undefined) {
      user.phone = String(body.phone || '').trim() || null
      user.phone_digits = digits(user.phone) || null
    }
    if (body.photoUrl !== undefined || body.photo_url !== undefined || body.photoData) {
      try {
        user.photo_url = sanitizePhoto(
          body.photoUrl ?? body.photo_url,
          body.photoData,
        )
      } catch (e) {
        return res.status(400).json({ error: e.message })
      }
    }
    saveDb(db)
    res.json({ user: publicUser(user) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message || 'Server error' })
  }
})

app.post('/auth/logout', (req, res) => {
  const token = bearerToken(req)
  const db = loadDb()
  db.user_sessions = (db.user_sessions || []).filter((s) => s.token !== token)
  saveDb(db)
  res.json({ ok: true })
})

app.get('/rsvps', (req, res) => {
  const week = req.query.week || currentSunday()
  const db = loadDb()
  const rows = db.rsvps
    .filter((r) => r.week_start === week)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map(mapRsvpPublic)
  res.json({ week_start: week, rsvps: rows })
})

/** Lookup own submission for this week (requires phone match). */
app.get('/rsvps/mine', (req, res) => {
  const phoneKey = digits(req.query.phone)
  const name = String(req.query.name || '')
    .trim()
    .toLowerCase()
  const week = req.query.week || currentSunday()
  if (!phoneKey && !name) {
    return res.status(400).json({ error: 'phone or name required' })
  }
  const db = loadDb()
  const matches = db.rsvps.filter((r) => {
    if (r.week_start !== week) return false
    if (phoneKey && digits(r.phone) === phoneKey) return true
    if (name && String(r.full_name || '').toLowerCase() === name) return true
    return false
  })
  const rsvp = matches.sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1,
  )[0]
  if (!rsvp) return res.json({ rsvp: null, sponsorship: null })
  const sponsorship =
    db.sponsorships.find((s) => s.rsvp_id === rsvp.id) || null
  res.json({ rsvp, sponsorship })
})

app.get('/people', (_req, res) => {
  const db = loadDb()
  const people = [...db.people]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .map(mapPersonPublic)
  res.json({ people })
})

app.post('/rsvps', (req, res) => {
  try {
    const form = req.body || {}
    if (!form.fullName?.trim() || !form.phone?.trim() || !form.coming) {
      return res.status(400).json({ error: 'Name, phone, and coming are required' })
    }
    const weekStart = form.weekStart || currentSunday()
    const db = loadDb()
    const person = upsertPerson(db, { ...form, weekStart })

    const oldIds = db.rsvps
      .filter((r) => r.person_id === person.id && r.week_start === weekStart)
      .map((r) => r.id)
    db.rsvps = db.rsvps.filter((r) => !oldIds.includes(r.id))
    db.sponsorships = db.sponsorships.filter((s) => !oldIds.includes(s.rsvp_id))

    const dish =
      String(form.bringingDish || form.potluckContribution || '').trim() || null

    const rsvpId = uuid()
    const now = new Date().toISOString()
    const rsvp = {
      id: rsvpId,
      person_id: person.id,
      week_start: weekStart,
      full_name: form.fullName.trim(),
      phone: form.phone.trim(),
      coming: form.coming,
      meal_style: form.mealStyle || null,
      meal_style_other: form.mealStyleOther || null,
      meal_start_time: form.mealStartTime || null,
      meal_start_other: form.mealStartOther || null,
      food_likes: form.foodLikes || [],
      food_likes_other: form.foodLikesOther || null,
      bringing_dish: dish,
      guest_names: form.guestNames || null,
      guest_count: form.guestCount ? Number(form.guestCount) : null,
      guest_overnight: form.guestOvernight || null,
      heard_about: form.heardAbout || null,
      invited_by: form.invitedBy || null,
      bringing_more_guests: form.bringingMoreGuests || null,
      guest_will_fill_form: form.guestWillFillForm || null,
      know_by_when: form.knowByWhen || null,
      social_arrival_time: form.socialArrivalTime || null,
      social_notes: form.socialNotes || null,
      feedback: form.feedback || null,
      feedback_notes: form.feedbackNotes || null,
      created_at: now,
    }
    db.rsvps.push(rsvp)

    if (form.sponsorship?.length || form.sponsorshipNotes) {
      db.sponsorships.push({
        id: uuid(),
        rsvp_id: rsvpId,
        person_id: person.id,
        week_start: weekStart,
        full_name: form.fullName.trim(),
        phone: form.phone.trim(),
        contributions: form.sponsorship || [],
        notes: form.sponsorshipNotes || null,
        potluck_contribution: dish,
        created_at: now,
      })
    }

    saveDb(db)
    res.json({ rsvp: mapRsvpPublic(rsvp), person: mapPersonPublic(person) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message || 'Server error' })
  }
})

function validSession(db, token) {
  if (!token) return false
  const row = db.admin_sessions.find((s) => s.token === token)
  if (!row) return false
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.admin_sessions = db.admin_sessions.filter((s) => s.token !== token)
    saveDb(db)
    return false
  }
  return true
}

app.post('/admin/unlock', (req, res) => {
  const { password, token, action } = req.body || {}
  const db = loadDb()

  if (action === 'list') {
    if (!validSession(db, token)) {
      return res.status(401).json({ error: 'Session expired' })
    }
    return res.json({
      sponsorships: [...db.sponsorships].sort((a, b) =>
        a.created_at < b.created_at ? 1 : -1,
      ),
      people: [...db.people].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      ),
      rsvps: [...db.rsvps].sort((a, b) =>
        a.created_at < b.created_at ? 1 : -1,
      ),
    })
  }

  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect password' })
  }

  const sessionToken = uuid()
  const expires = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
  db.admin_sessions.push({ token: sessionToken, expires_at: expires })
  saveDb(db)

  res.json({
    token: sessionToken,
    expires_at: expires,
    sponsorships: [...db.sponsorships].sort((a, b) =>
      a.created_at < b.created_at ? 1 : -1,
    ),
    people: [...db.people].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    ),
    rsvps: [...db.rsvps].sort((a, b) =>
      a.created_at < b.created_at ? 1 : -1,
    ),
  })
})

app.listen(PORT, '127.0.0.1', () => {
  console.log(`shabbos-rsvp-api listening on 127.0.0.1:${PORT}`)
})
