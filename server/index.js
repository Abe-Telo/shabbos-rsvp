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
  foodThreadFor,
  normalizeFoodComment,
  normalizeFoodReplies,
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
const MEAL_SEATS = new Set([
  'yes',
  'yes_guest',
  'yes_new',
  'probably',
  'social',
  'unsure',
])

function seatsForRsvp(rsvp) {
  if (!MEAL_SEATS.has(rsvp?.coming)) return 0
  return 1 + (Number(rsvp.guest_count) || 0)
}

function parseGuestLimit(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return null
  return Math.min(500, Math.floor(n))
}

function weekGuestLimit(db, week) {
  return parseGuestLimit(db.week_settings?.[week]?.guest_limit)
}

function weekSeatCount(db, week, excludePersonId = null) {
  return (db.rsvps || []).reduce((n, r) => {
    if (r.week_start !== week) return n
    if (excludePersonId && r.person_id === excludePersonId) return n
    return n + seatsForRsvp(r)
  }, 0)
}

function capacityPayload(db, week) {
  const guest_limit = weekGuestLimit(db, week)
  const seat_count = weekSeatCount(db, week)
  return {
    week_start: week,
    guest_limit,
    seat_count,
    spots_left: guest_limit == null ? null : Math.max(0, guest_limit - seat_count),
  }
}

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

function photoUrlOf(p) {
  return typeof p === 'string' ? p : String(p?.url || '')
}

function earlierPhotoUrls(db, personId, weekStart) {
  const urls = new Set()
  if (!personId) return urls
  for (const r of db.rsvps || []) {
    if (r.person_id !== personId) continue
    if (String(r.week_start || '') >= String(weekStart || '')) continue
    for (const p of r.food_photos || []) {
      const u = photoUrlOf(p)
      if (u) urls.add(u)
    }
  }
  return urls
}

function earlierComments(db, personId, weekStart) {
  const set = new Set()
  if (!personId) return set
  for (const r of db.rsvps || []) {
    if (r.person_id !== personId) continue
    if (String(r.week_start || '') >= String(weekStart || '')) continue
    const c = String(r.food_comment || '').trim().toLowerCase()
    if (c) set.add(c)
  }
  return set
}

/** Drop photos/comments that already belong to an earlier Shabbos for this person. */
function thisWeekOnlyMedia(row, db) {
  const urls = earlierPhotoUrls(db, row.person_id, row.week_start)
  const comments = earlierComments(db, row.person_id, row.week_start)
  const food_photos = (row.food_photos || []).filter((p) => !urls.has(photoUrlOf(p)))
  const raw = String(row.food_comment || '').trim()
  const food_comment = raw && comments.has(raw.toLowerCase()) ? null : raw || null
  return { food_photos, food_comment }
}

function mapRsvpPublic(row, db) {
  if (!row) return null
  const { phone, ...rest } = row
  const linked = findLinkedUser(db, {
    personId: row.person_id,
    phone: row.phone,
    name: row.full_name,
  })
  const media = thisWeekOnlyMedia(row, db)
  const display = { ...row, ...media }
  return {
    ...rest,
    ...media,
    bringing: row.food_likes || [],
    bringing_other: row.food_likes_other || null,
    potluck: row.meal_style || null,
    photo_url: linked?.photo_url || null,
    profile_username: linked?.username || null,
    food_thread: foodThreadFor(display),
    food_replies: normalizeFoodReplies(row.food_replies),
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
      food_comment: r.food_comment || null,
      food_photos: Array.isArray(r.food_photos) ? r.food_photos : [],
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
          food_comment: r.food_comment || null,
          food_photos: Array.isArray(r.food_photos) ? r.food_photos : [],
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
  res.json({ week_start: week, rsvps: rows, ...capacityPayload(db, week) })
})

app.get('/food-history', (_req, res) => {
  const before = currentSunday()
  const db = loadDb()
  const byWeek = new Map()
  for (const r of db.rsvps || []) {
    if (String(r.week_start || '') >= before) continue
    const photos = Array.isArray(r.food_photos) ? r.food_photos : []
    const comment = String(r.food_comment || '').trim()
    if (!photos.length && !comment) continue
    const linked = findLinkedUser(db, {
      personId: r.person_id,
      phone: r.phone,
      name: r.full_name,
    })
    const entry = {
      id: r.id,
      name: r.full_name,
      dish: r.bringing_dish || '',
      food_comment: comment || null,
      food_photos: photos,
      photo_url: linked?.photo_url || null,
      profile_username: linked?.username || null,
    }
    const list = byWeek.get(r.week_start) || []
    list.push(entry)
    byWeek.set(r.week_start, list)
  }
  const weeks = [...byWeek.entries()]
    .sort((a, b) => String(b[0]).localeCompare(String(a[0])))
    .map(([week_start, dishes]) => ({ week_start, dishes }))
  res.json({ weeks })
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

const DEFAULT_HOLIDAY_STATEMENT =
  'Yom Tov meals take a lot of time and money to prepare. Please help however you can — a donation, bringing a potluck dish, or helping clean up after the meal. Every bit makes hosting possible.'

function normalizeHolidayEvent(raw) {
  const base = {
    enabled: false,
    holiday_id: null,
    title: '',
    statement: DEFAULT_HOLIDAY_STATEMENT,
    meals: [],
  }
  if (!raw || typeof raw !== 'object') return base
  const meals = Array.isArray(raw.meals)
    ? raw.meals.map((m, i) => ({
        id: String(m.id || `m${i + 1}`),
        label: String(m.label || '').trim() || `Meal ${i + 1}`,
        date: String(m.date || '').trim() || null,
        period: m.period === 'day' ? 'day' : 'night',
        hosted: m.hosted !== false,
        host_name: String(m.host_name || m.hostName || '').trim(),
        address: String(m.address || '').trim(),
        notes: String(m.notes || '').trim(),
        date_label: String(m.date_label || m.dateLabel || '').trim() || null,
      }))
    : []
  return {
    enabled: Boolean(raw.enabled),
    holiday_id: raw.holiday_id || raw.holidayId || null,
    title: String(raw.title || '').trim(),
    statement:
      String(raw.statement || '').trim() || DEFAULT_HOLIDAY_STATEMENT,
    meals,
  }
}

function publicHolidayEvent(event) {
  const e = normalizeHolidayEvent(event)
  return {
    enabled: e.enabled,
    holiday_id: e.holiday_id,
    title: e.title,
    statement: e.statement,
    meals: e.meals
      .filter((m) => m.hosted)
      .map(({ address, ...rest }) => rest),
  }
}

function mealAddressesForIds(event, mealIds) {
  const e = normalizeHolidayEvent(event)
  const want = new Set((mealIds || []).map(String))
  return e.meals
    .filter((m) => want.has(m.id) && m.hosted)
    .map((m) => ({
      id: m.id,
      label: m.label,
      date: m.date,
      period: m.period,
      date_label: m.date_label,
      host_name: m.host_name || null,
      address: m.address || null,
      notes: m.notes || null,
    }))
    .filter((m) => m.host_name || m.address || m.notes)
}

function holidaySeatSummary(db, holidayId) {
  const event = normalizeHolidayEvent(db.holiday_event)
  const rows = (db.holiday_rsvps || []).filter(
    (r) => !holidayId || r.holiday_id === holidayId,
  )
  const byMeal = {}
  for (const m of event.meals.filter((x) => x.hosted)) {
    byMeal[m.id] = {
      meal_id: m.id,
      label: m.label,
      date: m.date,
      period: m.period,
      date_label: m.date_label,
      self_count: 0,
      guest_count: 0,
      total: 0,
      people: [],
    }
  }
  for (const r of rows) {
    for (const mid of r.meals || []) {
      const bucket = byMeal[mid]
      if (!bucket) continue
      bucket.self_count += 1
      bucket.total += 1
      bucket.people.push({
        name: r.full_name,
        kind: 'self',
        guests: 0,
      })
    }
    for (const g of r.guests || []) {
      const count = Math.max(0, Number(g.count) || 0)
      if (!count) continue
      for (const mid of g.meals || []) {
        const bucket = byMeal[mid]
        if (!bucket) continue
        bucket.guest_count += count
        bucket.total += count
        bucket.people.push({
          name: g.name || 'Guest',
          kind: 'guest',
          guests: count,
          with: r.full_name,
        })
      }
    }
  }
  return {
    holiday_id: event.holiday_id,
    title: event.title,
    enabled: event.enabled,
    meals: Object.values(byMeal),
    rsvp_count: rows.length,
    people: rows.map((r) => {
      const guestByMeal = {}
      for (const g of r.guests || []) {
        const count = Math.max(0, Number(g.count) || 0)
        for (const mid of g.meals || []) {
          guestByMeal[mid] = (guestByMeal[mid] || 0) + count
        }
      }
      const guestCounts = Object.values(guestByMeal)
      const guests = guestCounts.length ? Math.max(...guestCounts) : 0
      return {
        id: r.id,
        name: r.full_name,
        number: 1,
        guests,
        total: 1 + guests,
        meals: r.meals || [],
        guest_details: r.guests || [],
        help: r.help || null,
      }
    }),
    totals: {
      number: rows.length,
      guests: rows.reduce((n, r) => {
        const guestByMeal = {}
        for (const g of r.guests || []) {
          const count = Math.max(0, Number(g.count) || 0)
          for (const mid of g.meals || []) {
            guestByMeal[mid] = (guestByMeal[mid] || 0) + count
          }
        }
        const vals = Object.values(guestByMeal)
        return n + (vals.length ? Math.max(...vals) : 0)
      }, 0),
      total: 0,
    },
  }
}

function publicHolidayRsvp(row) {
  if (!row) return null
  const { phone, ...rest } = row
  return rest
}

function holidayFoodFor(db, holidayId, mealId) {
  return (db.holiday_food_items || [])
    .filter(
      (it) =>
        it.holiday_id === holidayId &&
        (!mealId || it.meal_id === mealId),
    )
    .sort((a, b) => {
      const byName = String(a.item_name || '').localeCompare(
        String(b.item_name || ''),
        undefined,
        { sensitivity: 'base' },
      )
      if (byName !== 0) return byName
      return String(a.created_at || '').localeCompare(String(b.created_at || ''))
    })
    .map(({ phone, ...rest }) => rest)
}

app.get('/holiday', (_req, res) => {
  const db = loadDb()
  res.json({ holiday: publicHolidayEvent(db.holiday_event) })
})

app.get('/holiday/rsvps', (_req, res) => {
  const db = loadDb()
  const event = normalizeHolidayEvent(db.holiday_event)
  const summary = holidaySeatSummary(db, event.holiday_id)
  summary.totals.total = summary.totals.number + summary.totals.guests
  if (!event.enabled) {
    return res.json({
      enabled: false,
      summary,
      rsvps: [],
    })
  }
  const rows = (db.holiday_rsvps || [])
    .filter((r) => r.holiday_id === event.holiday_id)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map(publicHolidayRsvp)
  res.json({
    enabled: true,
    summary,
    rsvps: rows,
  })
})

/** Lookup own holiday RSVP (phone preferred; name fallback). */
app.get('/holiday/rsvps/mine', (req, res) => {
  const phoneKey = digits(req.query.phone)
  const name = String(req.query.name || '')
    .trim()
    .toLowerCase()
  if (!phoneKey && !name) {
    return res.status(400).json({ error: 'phone or name required' })
  }
  const db = loadDb()
  const event = normalizeHolidayEvent(db.holiday_event)
  if (!event.holiday_id) {
    return res.json({ rsvp: null, addresses: [], holiday_id: null })
  }
  const matches = (db.holiday_rsvps || []).filter((r) => {
    if (r.holiday_id !== event.holiday_id) return false
    if (phoneKey && digits(r.phone) === phoneKey) return true
    if (name && String(r.full_name || '').trim().toLowerCase() === name) {
      return true
    }
    return false
  })
  const rsvp = matches.sort((a, b) => {
    const aPhone = phoneKey && digits(a.phone) === phoneKey ? 1 : 0
    const bPhone = phoneKey && digits(b.phone) === phoneKey ? 1 : 0
    if (aPhone !== bPhone) return bPhone - aPhone
    return String(b.created_at || '').localeCompare(String(a.created_at || ''))
  })[0]
  if (!rsvp) {
    return res.json({
      rsvp: null,
      addresses: [],
      holiday_id: event.holiday_id,
    })
  }
  const allMealIds = [
    ...(rsvp.meals || []),
    ...(rsvp.guests || []).flatMap((g) => g.meals || []),
  ]
  res.json({
    rsvp,
    addresses: mealAddressesForIds(event, allMealIds),
    holiday_id: event.holiday_id,
  })
})

app.get('/holiday/food', (req, res) => {
  const db = loadDb()
  const event = normalizeHolidayEvent(db.holiday_event)
  const mealId = req.query.meal ? String(req.query.meal) : null
  res.json({
    enabled: event.enabled,
    holiday_id: event.holiday_id,
    meal_id: mealId,
    items: event.holiday_id
      ? holidayFoodFor(db, event.holiday_id, mealId)
      : [],
  })
})

app.post('/holiday/food', (req, res) => {
  try {
    const body = req.body || {}
    const itemName = String(body.item_name || body.itemName || '').trim()
    const coveredBy = String(body.covered_by || body.coveredBy || '').trim()
    const mealId = String(body.meal_id || body.mealId || '').trim()
    if (!itemName) return res.status(400).json({ error: 'Item name is required' })
    if (!mealId) return res.status(400).json({ error: 'Meal is required' })
    const db = loadDb()
    const event = normalizeHolidayEvent(db.holiday_event)
    if (!event.enabled || !event.holiday_id) {
      return res.status(400).json({ error: 'Holiday RSVP is not open' })
    }
    const hosted = event.meals.some((m) => m.id === mealId && m.hosted)
    if (!hosted) return res.status(400).json({ error: 'Unknown meal' })

    db.holiday_food_items = db.holiday_food_items || []
    // If same item already exists for meal (case-insensitive), claim/update it
    const existing = db.holiday_food_items.find(
      (it) =>
        it.holiday_id === event.holiday_id &&
        it.meal_id === mealId &&
        String(it.item_name || '').toLowerCase() === itemName.toLowerCase(),
    )
    if (existing) {
      if (coveredBy) existing.covered_by = coveredBy
      if (body.phone !== undefined) existing.phone = String(body.phone || '').trim() || null
      if (body.notes !== undefined) {
        existing.notes = String(body.notes || '').trim() || null
      }
      saveDb(db)
      const { phone, ...pub } = existing
      return res.json({ item: pub, items: holidayFoodFor(db, event.holiday_id, mealId) })
    }

    const item = {
      id: uuid(),
      holiday_id: event.holiday_id,
      meal_id: mealId,
      item_name: itemName,
      covered_by: coveredBy || null,
      phone: String(body.phone || '').trim() || null,
      notes: String(body.notes || '').trim() || null,
      created_at: new Date().toISOString(),
    }
    db.holiday_food_items.push(item)
    saveDb(db)
    const { phone, ...pub } = item
    res.json({ item: pub, items: holidayFoodFor(db, event.holiday_id, mealId) })
  } catch (e) {
    console.error(e)
    res.status(400).json({ error: e.message || 'Could not save food item' })
  }
})

app.patch('/holiday/food/:id', (req, res) => {
  try {
    const db = loadDb()
    const item = (db.holiday_food_items || []).find((it) => it.id === req.params.id)
    if (!item) return res.status(404).json({ error: 'Item not found' })
    const body = req.body || {}
    if (body.item_name !== undefined || body.itemName !== undefined) {
      item.item_name =
        String(body.item_name ?? body.itemName ?? '').trim() || item.item_name
    }
    if (body.covered_by !== undefined || body.coveredBy !== undefined) {
      item.covered_by =
        String(body.covered_by ?? body.coveredBy ?? '').trim() || null
    }
    if (body.phone !== undefined) {
      item.phone = String(body.phone || '').trim() || null
    }
    if (body.notes !== undefined) {
      item.notes = String(body.notes || '').trim() || null
    }
    if (body.clear_cover || body.clearCover) {
      item.covered_by = null
      item.phone = null
    }
    saveDb(db)
    const { phone, ...pub } = item
    res.json({
      item: pub,
      items: holidayFoodFor(db, item.holiday_id, item.meal_id),
    })
  } catch (e) {
    console.error(e)
    res.status(400).json({ error: e.message || 'Update failed' })
  }
})

app.post('/holiday/rsvps', (req, res) => {
  try {
    const body = req.body || {}
    const fullName = String(body.fullName || body.full_name || '').trim()
    const phone = String(body.phone || '').trim()
    if (!fullName || !phone) {
      return res.status(400).json({ error: 'Name and phone are required' })
    }
    const db = loadDb()
    const event = normalizeHolidayEvent(db.holiday_event)
    if (!event.enabled) {
      return res.status(400).json({ error: 'Holiday RSVP is not open right now' })
    }
    const hostedIds = new Set(event.meals.filter((m) => m.hosted).map((m) => m.id))
    const meals = Array.isArray(body.meals)
      ? [...new Set(body.meals.map(String))].filter((id) => hostedIds.has(id))
      : []
    if (!meals.length) {
      return res.status(400).json({ error: 'Select at least one meal' })
    }

    const guests = Array.isArray(body.guests)
      ? body.guests
          .map((g) => ({
            name: String(g.name || '').trim(),
            count: Math.max(0, Number(g.count) || 0),
            meals: Array.isArray(g.meals)
              ? [...new Set(g.meals.map(String))].filter((id) => hostedIds.has(id))
              : [],
          }))
          .filter((g) => g.count > 0 && g.meals.length > 0)
      : []

    const helpRaw = body.help || {}
    const help = {
      donate: Boolean(helpRaw.donate),
      potluck: Boolean(helpRaw.potluck),
      clean: Boolean(helpRaw.clean),
      amount: String(helpRaw.amount || '').trim() || null,
      notes: String(helpRaw.notes || '').trim() || null,
    }

    const person = upsertPerson(db, {
      fullName,
      phone,
      coming: 'yes',
      weekStart: currentSunday(),
      foodLikes: [],
    })

    db.holiday_rsvps = db.holiday_rsvps || []
    const old = db.holiday_rsvps.filter(
      (r) =>
        r.holiday_id === event.holiday_id &&
        (r.person_id === person.id || digits(r.phone) === digits(phone)),
    )
    const oldIds = new Set(old.map((r) => r.id))
    db.holiday_rsvps = db.holiday_rsvps.filter((r) => !oldIds.has(r.id))

    const allMealIds = [
      ...meals,
      ...guests.flatMap((g) => g.meals),
    ]

    const rsvp = {
      id: uuid(),
      person_id: person.id,
      holiday_id: event.holiday_id,
      full_name: fullName,
      phone,
      meals,
      guests,
      help,
      created_at: new Date().toISOString(),
    }
    db.holiday_rsvps.push(rsvp)
    saveDb(db)

    res.json({
      rsvp: publicHolidayRsvp(rsvp),
      person: { id: person.id, name: person.name },
      addresses: mealAddressesForIds(event, allMealIds),
      holiday: publicHolidayEvent(event),
    })
  } catch (e) {
    console.error(e)
    res.status(400).json({ error: e.message || 'Could not save holiday RSVP' })
  }
})

app.patch('/admin/holiday', (req, res) => {
  try {
    const db = requireAdmin(req, res)
    if (!db) return
    const body = req.body || {}
    const next = normalizeHolidayEvent({
      ...normalizeHolidayEvent(db.holiday_event),
      ...(body.holiday || body),
    })
    if (body.enabled !== undefined) next.enabled = Boolean(body.enabled)
    if (body.holiday_id !== undefined || body.holidayId !== undefined) {
      next.holiday_id = body.holiday_id ?? body.holidayId
    }
    if (body.title !== undefined) next.title = String(body.title || '').trim()
    if (body.statement !== undefined) {
      next.statement =
        String(body.statement || '').trim() || DEFAULT_HOLIDAY_STATEMENT
    }
    if (Array.isArray(body.meals)) {
      next.meals = normalizeHolidayEvent({ meals: body.meals }).meals
    }
    db.holiday_event = next
    saveDb(db)
    res.json({
      holiday: next,
      summary: holidaySeatSummary(db, next.holiday_id),
    })
  } catch (e) {
    console.error(e)
    res.status(400).json({ error: e.message || 'Update failed' })
  }
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

    const guestCount =
      form.guestCount === '' || form.guestCount === null || form.guestCount === undefined
        ? null
        : Number(form.guestCount)
    const nextSeats = seatsForRsvp({ coming: form.coming, guest_count: guestCount })
    const limit = weekGuestLimit(db, weekStart)
    if (limit != null && nextSeats > 0) {
      const used = weekSeatCount(db, weekStart, person.id)
      if (used + nextSeats > limit) {
        const left = Math.max(0, limit - used)
        return res.status(400).json({
          error:
            left === 0
              ? `This week is full (${limit} people). Ask the host if a spot opens.`
              : `Only ${left} spot${left === 1 ? '' : 's'} left this week (limit ${limit}).`,
          guest_limit: limit,
          seat_count: used,
          spots_left: left,
        })
      }
    }

    const oldRows = db.rsvps.filter(
      (r) => r.person_id === person.id && r.week_start === weekStart,
    )
    const oldIds = oldRows.map((r) => r.id)
    const previousFoodPhotos = oldRows[0]?.food_photos || []
    const previousFoodComment = oldRows[0]?.food_comment || null
    const previousFoodReplies = oldRows[0]?.food_replies || []
    db.rsvps = db.rsvps.filter((r) => !oldIds.includes(r.id))
    db.sponsorships = db.sponsorships.filter((s) => !oldIds.includes(s.rsvp_id))

    const dish =
      String(form.bringingDish || form.potluckContribution || '').trim() || null

    const sentPhotos = form.foodPhotos || form.food_photos
    const rawPhotos =
      sentPhotos === undefined
        ? previousFoodPhotos
        : persistFoodPhotos(sentPhotos || [])
    const olderUrls = earlierPhotoUrls(db, person.id, weekStart)
    const olderComments = earlierComments(db, person.id, weekStart)
    const food_photos = (rawPhotos || []).filter((p) => !olderUrls.has(photoUrlOf(p)))
    let food_comment =
      form.foodComment === undefined && form.food_comment === undefined
        ? previousFoodComment
        : normalizeFoodComment(form.foodComment ?? form.food_comment ?? '')
    if (
      food_comment &&
      olderComments.has(String(food_comment).trim().toLowerCase())
    ) {
      food_comment = null
    }
    const food_replies = previousFoodReplies

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
      food_replies,
      guest_names: form.guestNames || null,
      guest_count: guestCount,
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
      week_settings: db.week_settings || {},
      capacity: capacityPayload(db, currentSunday()),
      holiday_event: normalizeHolidayEvent(db.holiday_event),
      holiday_rsvps: [...(db.holiday_rsvps || [])].sort((a, b) =>
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
    week_settings: db.week_settings || {},
    capacity: capacityPayload(db, currentSunday()),
    holiday_event: normalizeHolidayEvent(db.holiday_event),
    holiday_rsvps: [...(db.holiday_rsvps || [])].sort((a, b) =>
      a.created_at < b.created_at ? 1 : -1,
    ),
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

app.patch('/admin/settings', (req, res) => {
  try {
    const db = requireAdmin(req, res)
    if (!db) return
    const body = req.body || {}
    const week = body.week_start || body.weekStart || currentSunday()
    db.week_settings = db.week_settings || {}
    const prev = db.week_settings[week] || {}
    if (body.guest_limit !== undefined || body.guestLimit !== undefined) {
      prev.guest_limit = parseGuestLimit(body.guest_limit ?? body.guestLimit)
    }
    db.week_settings[week] = prev
    saveDb(db)
    res.json({
      week_start: week,
      settings: prev,
      capacity: capacityPayload(db, week),
    })
  } catch (e) {
    console.error(e)
    res.status(400).json({ error: e.message || 'Update failed' })
  }
})

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

/** Owner updates photos/comments; other RSVP'd guests can reply on active sections. */
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
    const matchesOwnerPhone = phoneKey && digits(rsvp.phone) === phoneKey
    const matchesOwnerName = name && rsvpName === name
    const isOwner = matchesOwnerPhone || matchesOwnerName
    const adminOk = validSession(db, bearerToken(req))

    const knownGuest = (db.rsvps || []).some((r) => {
      if (r.week_start !== rsvp.week_start) return false
      if (phoneKey && digits(r.phone) === phoneKey) return true
      const p = db.people.find((x) => x.id === r.person_id)
      const n = String(r.full_name || p?.name || '')
        .trim()
        .toLowerCase()
      return name && n === name
    })

    const replyText = String(body.reply || body.add_reply || '').trim()
    const wantsOwnerEdit =
      body.bringing_dish !== undefined ||
      body.bringingDish !== undefined ||
      body.food_comment !== undefined ||
      body.foodComment !== undefined ||
      body.food_photos !== undefined ||
      body.foodPhotos !== undefined ||
      body.add_photos !== undefined ||
      body.addPhotos !== undefined

    if (replyText) {
      if (!adminOk && !isOwner && !knownGuest) {
        return res
          .status(403)
          .json({ error: 'Sign in or use your RSVP name/phone to reply' })
      }
      const hasActivity =
        (rsvp.food_photos || []).length > 0 ||
        Boolean(String(rsvp.food_comment || '').trim()) ||
        (rsvp.food_replies || []).length > 0
      if (!hasActivity && !isOwner && !adminOk) {
        return res.status(400).json({
          error: 'Replies open after someone posts a photo or comment here',
        })
      }
      const author =
        String(body.fullName || body.full_name || '').trim() ||
        (isOwner ? rsvp.full_name : 'Guest')
      rsvp.food_replies = normalizeFoodReplies([
        ...(rsvp.food_replies || []),
        {
          id: uuid(),
          author_name: author,
          text: replyText.slice(0, 1000),
          created_at: new Date().toISOString(),
        },
      ])
    } else if (wantsOwnerEdit) {
      if (!adminOk && !isOwner) {
        return res.status(403).json({
          error: 'Only the person who RSVP’d can edit photos on this section',
        })
      }
      if (body.bringing_dish !== undefined || body.bringingDish !== undefined) {
        rsvp.bringing_dish =
          String(body.bringing_dish ?? body.bringingDish ?? '').trim() || null
      }
      const olderUrls = earlierPhotoUrls(db, rsvp.person_id, rsvp.week_start)
      const olderComments = earlierComments(db, rsvp.person_id, rsvp.week_start)
      if (body.food_comment !== undefined || body.foodComment !== undefined) {
        const nextComment = normalizeFoodComment(
          body.food_comment ?? body.foodComment ?? '',
        )
        rsvp.food_comment =
          nextComment && olderComments.has(String(nextComment).trim().toLowerCase())
            ? null
            : nextComment
      }
      if (body.food_photos !== undefined || body.foodPhotos !== undefined) {
        rsvp.food_photos = persistFoodPhotos(
          body.food_photos ?? body.foodPhotos ?? [],
        ).filter((p) => !olderUrls.has(photoUrlOf(p)))
      } else if (Array.isArray(body.add_photos) || Array.isArray(body.addPhotos)) {
        const extra = persistFoodPhotos(body.add_photos || body.addPhotos || []).filter(
          (p) => !olderUrls.has(photoUrlOf(p)),
        )
        const kept = (rsvp.food_photos || []).filter((p) => !olderUrls.has(photoUrlOf(p)))
        rsvp.food_photos = [...kept, ...extra].slice(0, 8)
      }
    } else {
      return res.status(400).json({ error: 'Nothing to update' })
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
