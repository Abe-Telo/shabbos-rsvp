import cors from 'cors'
import express from 'express'
import { v4 as uuid } from 'uuid'
import {
  findUserByToken,
  hashPassword,
  normalizeUsername,
  publicProfile,
  publicUser,
  sanitizePhoto,
  validateUsername,
  verifyPassword,
} from './auth.js'
import { foodPhotosDir, loadDb, saveDb } from './db.js'
import {
  normalizeFoodComment,
  persistFoodPhotos,
} from './foodPhotos.js'

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
app.use(express.json({ limit: '8mb' }))
app.use('/food-photos', express.static(foodPhotosDir, { maxAge: '7d' }))

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

function mapRsvpPublic(row, db) {
  if (!row) return null
  const { phone, ...rest } = row
  const linked = findLinkedUser(db, {
    personId: row.person_id,
    phone: row.phone,
    name: row.full_name,
  })
  return {
    ...rest,
    bringing: row.food_likes || [],
    bringing_other: row.food_likes_other || null,
    potluck: row.meal_style || null,
    photo_url: linked?.photo_url || null,
    profile_username: linked?.username || null,
  }
}

function mapPersonPublic(row, db) {
  if (!row) return null
  const { phone, phone_digits, food_prefs, ...rest } = row
  const linked = findLinkedUser(db, {
    personId: row.id,
    phone: row.phone,
    name: row.name,
  })
  const pastMap = new Map()
  for (const r of db.rsvps || []) {
    if (r.person_id !== row.id) continue
    const prev = pastMap.get(r.week_start)
    if (!prev || String(r.created_at || '') > String(prev.created_at || '')) {
      pastMap.set(r.week_start, r)
    }
  }
  const past = [...pastMap.values()]
    .sort((a, b) => String(b.week_start || '').localeCompare(String(a.week_start || '')))
    .map((r) => ({
      week_start: r.week_start,
      coming: r.coming,
      bringing_dish: r.bringing_dish || null,
      meal_style: r.meal_style || null,
      meal_start_time:
        r.meal_start_time === 'other'
          ? r.meal_start_other || 'Other'
          : r.meal_start_time || null,
      food_likes: uniqueStrings(r.food_likes || []),
    }))

  return {
    ...rest,
    photo_url: linked?.photo_url || row.photo_url || null,
    profile_username: linked?.username || null,
    past,
    // keep a short unique summary for search only
    highlights: uniqueStrings(parsePrefChunks(food_prefs)),
  }
}

function uniqueStrings(list) {
  const seen = new Set()
  const out = []
  for (const raw of list || []) {
    const s = String(raw || '').trim()
    if (!s) continue
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}

function parsePrefChunks(foodPrefs) {
  if (!foodPrefs) return []
  const chunks = String(foodPrefs)
    .split(/\s*\|\s*/)
    .flatMap((chunk) => chunk.split(/,\s*(?=Bringing:|Style:|Start:|Sponsor:)/))
  return chunks.map((c) => c.trim()).filter(Boolean)
}

function mergeFoodPrefs(existing, next) {
  return uniqueStrings([
    ...parsePrefChunks(existing),
    ...parsePrefChunks(next),
  ]).join(' | ') || null
}

function findLinkedUser(db, { personId, phone, name }) {
  const users = db?.users || []
  if (!users.length) return null
  if (personId) {
    const hits = users.filter((u) => u.person_id === personId)
    const withPhoto = hits.find((u) => u.photo_url)
    if (withPhoto) return withPhoto
    if (hits[0]) return hits[0]
  }
  const phoneKey = digits(phone)
  if (phoneKey) {
    const hits = users.filter(
      (u) =>
        digits(u.phone) === phoneKey || digits(u.phone_digits) === phoneKey,
    )
    const withPhoto = hits.find((u) => u.photo_url)
    if (withPhoto) return withPhoto
    if (hits[0]) return hits[0]
  }
  if (name) {
    const n = String(name).toLowerCase()
    const hits = users.filter(
      (u) => String(u.full_name || '').toLowerCase() === n,
    )
    const withPhoto = hits.find((u) => u.photo_url)
    if (withPhoto) return withPhoto
    if (hits[0]) return hits[0]
  }
  return null
}

function findUserPhoto(db, opts) {
  return findLinkedUser(db, opts)?.photo_url || null
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
      person.food_prefs = mergeFoodPrefs(person.food_prefs, prefs)
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

    const usernameError = validateUsername(username)
    if (usernameError) {
      return res.status(400).json({ error: usernameError })
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
    if (body.bio !== undefined) {
      user.bio = String(body.bio || '').trim().slice(0, 2000) || null
    }
    if (body.city !== undefined) {
      user.city = String(body.city || '').trim().slice(0, 120) || null
    }
    if (body.shul !== undefined) {
      user.shul = String(body.shul || '').trim().slice(0, 120) || null
    }
    if (body.newPassword) {
      const current = String(body.currentPassword || body.password || '')
      const nextPass = String(body.newPassword)
      if (!verifyPassword(current, user.password_salt, user.password_hash)) {
        return res.status(401).json({ error: 'Current password is incorrect' })
      }
      if (nextPass.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' })
      }
      const { salt, hash } = hashPassword(nextPass)
      user.password_salt = salt
      user.password_hash = hash
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

app.get('/profiles/:username', (req, res) => {
  const username = normalizeUsername(req.params.username)
  const db = loadDb()
  const user = (db.users || []).find((u) => u.username === username)
  if (!user) return res.status(404).json({ error: 'Profile not found' })

  const person =
    (user.person_id && db.people.find((p) => p.id === user.person_id)) ||
    (user.phone &&
      db.people.find(
        (p) =>
          digits(p.phone) === digits(user.phone) ||
          p.phone_digits === digits(user.phone),
      )) ||
    db.people.find(
      (p) => p.name.toLowerCase() === String(user.full_name || '').toLowerCase(),
    )

  const history = person
    ? db.rsvps
        .filter((r) => r.person_id === person.id)
        .sort((a, b) => String(b.week_start || '').localeCompare(String(a.week_start || '')))
        .map((r) => ({
          id: r.id,
          week_start: r.week_start,
          coming: r.coming,
          bringing_dish: r.bringing_dish || null,
          meal_style: r.meal_style || null,
          created_at: r.created_at,
        }))
    : []

  res.json({
    profile: publicProfile(user),
    stats: {
      times_attended: person?.times_attended || 0,
      first_seen: person?.first_seen || user.created_at,
      last_seen: person?.last_seen || user.created_at,
    },
    history,
  })
})

app.get('/rsvps', (req, res) => {
  const week = req.query.week || currentSunday()
  const db = loadDb()
  const rows = db.rsvps
    .filter((r) => r.week_start === week)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map((r) => mapRsvpPublic(r, db))
  res.json({ week_start: week, rsvps: rows })
})

/** Lookup own submission for this week (requires phone match). */
app.get('/rsvps/mine', (req, res) => {
  const phoneKey = digits(req.query.phone)
  const name = String(req.query.name || '')
    .trim()
    .toLowerCase()
  const wantPrior = req.query.prior === '1' || req.query.latest === '1'
  const week = req.query.week || currentSunday()
  if (!phoneKey && !name) {
    return res.status(400).json({ error: 'phone or name required' })
  }
  const db = loadDb()
  const peopleById = Object.fromEntries((db.people || []).map((p) => [p.id, p]))
  const matches = db.rsvps.filter((r) => {
    if (wantPrior) {
      if (String(r.week_start || '') >= String(week)) return false
    } else if (r.week_start !== week) {
      return false
    }
    if (phoneKey && digits(r.phone) === phoneKey) return true
    const personName = peopleById[r.person_id]?.name || ''
    const rsvpName = String(r.full_name || personName || '').toLowerCase()
    if (name && rsvpName === name) return true
    return false
  })
  const rsvp = matches.sort((a, b) => {
    if (a.week_start !== b.week_start) {
      return a.week_start < b.week_start ? 1 : -1
    }
    return a.created_at < b.created_at ? 1 : -1
  })[0]
  if (!rsvp) return res.json({ rsvp: null, sponsorship: null, week_start: null })
  const sponsorship =
    db.sponsorships.find((s) => s.rsvp_id === rsvp.id) || null
  res.json({ rsvp, sponsorship, week_start: rsvp.week_start })
})

app.get('/people', (_req, res) => {
  const db = loadDb()
  const people = [...db.people]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .map((p) => mapPersonPublic(p, db))
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

    const oldRows = db.rsvps.filter(
      (r) => r.person_id === person.id && r.week_start === weekStart,
    )
    const oldIds = oldRows.map((r) => r.id)
    const previousFoodPhotos = oldRows[0]?.food_photos || []
    const previousFoodComment = oldRows[0]?.food_comment || null
    db.rsvps = db.rsvps.filter((r) => !oldIds.includes(r.id))
    db.sponsorships = db.sponsorships.filter((s) => !oldIds.includes(s.rsvp_id))

    const dish =
      String(form.bringingDish || form.potluckContribution || '').trim() || null

    const sentPhotos = form.foodPhotos || form.food_photos
    const food_photos =
      sentPhotos === undefined
        ? previousFoodPhotos
        : persistFoodPhotos(sentPhotos || [])
    const food_comment =
      form.foodComment === undefined && form.food_comment === undefined
        ? previousFoodComment
        : normalizeFoodComment(form.foodComment ?? form.food_comment ?? '')

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
      food_photos,
      food_comment,
      guest_names: form.guestNames || null,
      guest_count:
        form.guestCount === '' || form.guestCount === null || form.guestCount === undefined
          ? null
          : Number(form.guestCount),
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
    res.json({
      rsvp: mapRsvpPublic(rsvp, db),
      person: mapPersonPublic(person, db),
    })
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
      people: [...db.people]
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
        )
        .map((p) => ({
          ...p,
          photo_url: findUserPhoto(db, {
            personId: p.id,
            phone: p.phone,
            name: p.name,
          }),
        })),
      rsvps: [...db.rsvps]
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .map((r) => ({
          ...r,
          photo_url: findUserPhoto(db, {
            personId: r.person_id,
            phone: r.phone,
            name: r.full_name,
          }),
        })),
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
    people: [...db.people]
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      )
      .map((p) => ({
        ...p,
        photo_url: findUserPhoto(db, {
          personId: p.id,
          phone: p.phone,
          name: p.name,
        }),
      })),
    rsvps: [...db.rsvps]
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .map((r) => ({
        ...r,
        photo_url: findUserPhoto(db, {
          personId: r.person_id,
          phone: r.phone,
          name: r.full_name,
        }),
      })),
  })
})

function requireAdmin(req, res) {
  const token = bearerToken(req)
  const db = loadDb()
  if (!validSession(db, token)) {
    res.status(401).json({ error: 'Session expired' })
    return null
  }
  return db
}

app.patch('/admin/rsvps/:id', (req, res) => {
  try {
    const db = requireAdmin(req, res)
    if (!db) return
    const rsvp = db.rsvps.find((r) => r.id === req.params.id)
    if (!rsvp) return res.status(404).json({ error: 'RSVP not found' })

    const body = req.body || {}
    const str = (v) => (v === undefined ? undefined : String(v ?? '').trim() || null)
    if (body.full_name !== undefined || body.fullName !== undefined) {
      rsvp.full_name = str(body.full_name ?? body.fullName) || rsvp.full_name
    }
    if (body.phone !== undefined) rsvp.phone = str(body.phone) || rsvp.phone
    if (body.coming !== undefined) rsvp.coming = str(body.coming) || rsvp.coming
    if (body.meal_style !== undefined || body.mealStyle !== undefined) {
      rsvp.meal_style = str(body.meal_style ?? body.mealStyle)
    }
    if (body.meal_start_time !== undefined || body.mealStartTime !== undefined) {
      rsvp.meal_start_time = str(body.meal_start_time ?? body.mealStartTime)
    }
    if (body.meal_start_other !== undefined || body.mealStartOther !== undefined) {
      rsvp.meal_start_other = str(body.meal_start_other ?? body.mealStartOther)
    }
    if (body.bringing_dish !== undefined || body.bringingDish !== undefined) {
      rsvp.bringing_dish = str(body.bringing_dish ?? body.bringingDish)
    }
    if (body.guest_names !== undefined || body.guestNames !== undefined) {
      rsvp.guest_names = str(body.guest_names ?? body.guestNames)
    }
    if (body.guest_count !== undefined || body.guestCount !== undefined) {
      const raw = body.guest_count ?? body.guestCount
      rsvp.guest_count =
        raw === '' || raw === null || raw === undefined ? null : Number(raw)
    }
    if (body.bringing_more_guests !== undefined || body.bringingMoreGuests !== undefined) {
      rsvp.bringing_more_guests = str(
        body.bringing_more_guests ?? body.bringingMoreGuests,
      )
    }
    if (body.food_likes !== undefined || body.foodLikes !== undefined) {
      const likes = body.food_likes ?? body.foodLikes
      rsvp.food_likes = Array.isArray(likes)
        ? likes
        : String(likes || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
    }
    if (body.food_comment !== undefined || body.foodComment !== undefined) {
      rsvp.food_comment = normalizeFoodComment(
        body.food_comment ?? body.foodComment ?? '',
      )
    }
    if (body.food_photos !== undefined || body.foodPhotos !== undefined) {
      rsvp.food_photos = persistFoodPhotos(body.food_photos ?? body.foodPhotos ?? [])
    }

    // Keep linked person name/phone in sync when edited
    const person = db.people.find((p) => p.id === rsvp.person_id)
    if (person) {
      if (body.full_name !== undefined || body.fullName !== undefined) {
        person.name = rsvp.full_name
      }
      if (body.phone !== undefined) {
        person.phone = rsvp.phone
        person.phone_digits = digits(rsvp.phone)
      }
      person.last_seen = new Date().toISOString()
    }

    // Optional sponsorship fields on same patch
    if (
      body.sponsorship_notes !== undefined ||
      body.sponsorshipNotes !== undefined ||
      body.sponsorship !== undefined ||
      body.contributions !== undefined
    ) {
      let s = db.sponsorships.find((x) => x.rsvp_id === rsvp.id)
      if (!s) {
        s = {
          id: uuid(),
          rsvp_id: rsvp.id,
          person_id: rsvp.person_id,
          week_start: rsvp.week_start,
          full_name: rsvp.full_name,
          phone: rsvp.phone,
          contributions: [],
          notes: null,
          potluck_contribution: rsvp.bringing_dish,
          created_at: new Date().toISOString(),
        }
        db.sponsorships.push(s)
      }
      if (body.sponsorship_notes !== undefined || body.sponsorshipNotes !== undefined) {
        s.notes = str(body.sponsorship_notes ?? body.sponsorshipNotes)
      }
      if (body.sponsorship !== undefined || body.contributions !== undefined) {
        const c = body.sponsorship ?? body.contributions
        s.contributions = Array.isArray(c)
          ? c
          : String(c || '')
              .split(/;|,/)
              .map((x) => x.trim())
              .filter(Boolean)
      }
      s.full_name = rsvp.full_name
      s.phone = rsvp.phone
      s.potluck_contribution = rsvp.bringing_dish
    }

    saveDb(db)
    res.json({
      rsvp: {
        ...rsvp,
        photo_url: findUserPhoto(db, {
          personId: rsvp.person_id,
          phone: rsvp.phone,
          name: rsvp.full_name,
        }),
      },
    })
  } catch (e) {
    console.error(e)
    res.status(400).json({ error: e.message || 'Update failed' })
  }
})

/** Guests who already RSVP'd can add/update food photos + comments. */
app.patch('/rsvps/:id/food', (req, res) => {
  try {
    const db = loadDb()
    const rsvp = db.rsvps.find((r) => r.id === req.params.id)
    if (!rsvp) return res.status(404).json({ error: 'RSVP not found' })

    const body = req.body || {}
    const phoneKey = digits(body.phone || '')
    const name = String(body.fullName || body.full_name || '')
      .trim()
      .toLowerCase()
    const person = db.people.find((p) => p.id === rsvp.person_id)
    const rsvpName = String(rsvp.full_name || person?.name || '')
      .trim()
      .toLowerCase()
    const matchesPhone = phoneKey && digits(rsvp.phone) === phoneKey
    const matchesName = name && rsvpName === name
    const adminOk = validSession(db, bearerToken(req))
    if (!adminOk && !matchesPhone && !matchesName) {
      return res.status(403).json({ error: 'Name or phone must match this RSVP' })
    }

    if (body.bringing_dish !== undefined || body.bringingDish !== undefined) {
      rsvp.bringing_dish =
        String(body.bringing_dish ?? body.bringingDish ?? '').trim() || null
    }
    if (body.food_comment !== undefined || body.foodComment !== undefined) {
      rsvp.food_comment = normalizeFoodComment(
        body.food_comment ?? body.foodComment ?? '',
      )
    }
    if (body.food_photos !== undefined || body.foodPhotos !== undefined) {
      rsvp.food_photos = persistFoodPhotos(body.food_photos ?? body.foodPhotos ?? [])
    } else if (Array.isArray(body.add_photos) || Array.isArray(body.addPhotos)) {
      const extra = persistFoodPhotos(body.add_photos || body.addPhotos || [])
      rsvp.food_photos = [...(rsvp.food_photos || []), ...extra].slice(0, 8)
    }

    saveDb(db)
    res.json({ rsvp: mapRsvpPublic(rsvp, db) })
  } catch (e) {
    console.error(e)
    res.status(400).json({ error: e.message || 'Update failed' })
  }
})

app.listen(PORT, '127.0.0.1', () => {
  console.log(`shabbos-rsvp-api listening on 127.0.0.1:${PORT}`)
})
