import { ATTENDING_VALUES, mealStyleLabel } from './formConfig'
import { adminUnlockUrl, isSupabaseConfigured, supabase } from './supabase'
import { currentSunday } from './week'

const LS_KEY = 'shabbos-rsvp-data-v1'
const ADMIN_SESSION_KEY = 'shabbos-admin-session'

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

export function storageMode() {
  if (API_URL) return 'api'
  if (isSupabaseConfigured) return 'supabase'
  return 'demo'
}

function uid() {
  return crypto.randomUUID()
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return { people: [], rsvps: [], sponsorships: [] }
}

function saveLocal(data) {
  localStorage.setItem(LS_KEY, JSON.stringify(data))
}

function normalizePhone(phone) {
  return (phone || '').replace(/\D/g, '')
}

function foodPrefsFromForm(form) {
  const parts = [...(form.foodLikes || [])]
  if (form.foodLikesOther) parts.push(form.foodLikesOther)
  if (form.mealStyle) {
    parts.push(`Style: ${mealStyleLabel(form.mealStyle)}`)
  }
  if (form.mealStyleOther) parts.push(form.mealStyleOther)
  return parts.join(', ')
}

function isAttending(coming) {
  return ATTENDING_VALUES.has(coming)
}

function rsvpPayload(form, personId, weekStart, id) {
  return {
    id,
    person_id: personId,
    week_start: weekStart,
    full_name: form.fullName.trim(),
    phone: form.phone.trim(),
    coming: form.coming,
    meal_style: form.mealStyle || null,
    meal_style_other: form.mealStyleOther || null,
    food_likes: form.foodLikes || [],
    food_likes_other: form.foodLikesOther || null,
    potluck: form.mealStyle || null,
    bringing: form.foodLikes || [],
    bringing_other: form.foodLikesOther || null,
    dietary_notes: null,
    guest_names: form.guestNames || null,
    guest_count: form.guestCount ? Number(form.guestCount) : null,
    guest_overnight: form.guestOvernight || null,
    heard_about: form.heardAbout || null,
    invited_by: form.invitedBy || null,
    newcomer_notes:
      [form.heardAbout, form.invitedBy].filter(Boolean).join(' · ') || null,
    feedback: form.feedback || null,
    feedback_notes: form.feedbackNotes || null,
    created_at: new Date().toISOString(),
  }
}

/* ---------- Shared HTTP API ---------- */

async function api(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`)
  return body
}

async function submitApi(form) {
  return api('/rsvps', {
    method: 'POST',
    body: JSON.stringify({ ...form, weekStart: currentSunday() }),
  })
}

async function getWeekRsvpsApi(weekStart = currentSunday()) {
  const data = await api(`/rsvps?week=${encodeURIComponent(weekStart)}`)
  return data.rsvps || []
}

async function getPeopleApi() {
  const data = await api('/people')
  return data.people || []
}

async function unlockAdminApi(password) {
  const body = await api('/admin/unlock', {
    method: 'POST',
    body: JSON.stringify({ password }),
  })
  sessionStorage.setItem(ADMIN_SESSION_KEY, body.token)
  return body
}

async function getSponsorshipsApi(token) {
  const body = await api('/admin/unlock', {
    method: 'POST',
    body: JSON.stringify({ token, action: 'list' }),
  })
  return body.sponsorships || []
}

/* ---------- Local / demo mode ---------- */

async function upsertPersonLocal(form) {
  const data = loadLocal()
  const phoneKey = normalizePhone(form.phone)
  const weekStart = currentSunday()
  let person = data.people.find(
    (p) =>
      (phoneKey && normalizePhone(p.phone) === phoneKey) ||
      p.name.toLowerCase() === form.fullName.trim().toLowerCase(),
  )

  const prefs = foodPrefsFromForm(form)
  const now = new Date().toISOString()
  const attending = isAttending(form.coming)

  const alreadyCounted =
    person &&
    data.rsvps.some(
      (r) =>
        r.person_id === person.id &&
        r.week_start === weekStart &&
        isAttending(r.coming),
    )

  if (person) {
    person.name = form.fullName.trim()
    person.phone = form.phone.trim()
    person.last_seen = now
    if (prefs) {
      person.food_prefs = [person.food_prefs, prefs].filter(Boolean).join(' | ')
    }
    if (attending && !alreadyCounted) {
      person.times_attended = (person.times_attended || 0) + 1
    }
  } else {
    person = {
      id: uid(),
      name: form.fullName.trim(),
      phone: form.phone.trim(),
      times_attended: attending ? 1 : 0,
      food_prefs: prefs,
      first_seen: now,
      last_seen: now,
    }
    data.people.push(person)
  }

  saveLocal(data)
  return person
}

async function submitLocal(form) {
  const weekStart = currentSunday()
  const person = await upsertPersonLocal(form)
  const data = loadLocal()

  const oldIds = data.rsvps
    .filter((r) => r.person_id === person.id && r.week_start === weekStart)
    .map((r) => r.id)
  data.rsvps = data.rsvps.filter((r) => !oldIds.includes(r.id))
  data.sponsorships = data.sponsorships.filter((s) => !oldIds.includes(s.rsvp_id))

  const rsvpId = uid()
  const rsvp = rsvpPayload(form, person.id, weekStart, rsvpId)
  data.rsvps.push(rsvp)

  if (form.sponsorship?.length || form.sponsorshipNotes || form.potluckContribution) {
    data.sponsorships.push({
      id: uid(),
      rsvp_id: rsvpId,
      person_id: person.id,
      week_start: weekStart,
      full_name: form.fullName.trim(),
      phone: form.phone.trim(),
      contributions: form.sponsorship || [],
      notes: form.sponsorshipNotes || null,
      potluck_contribution: form.potluckContribution || null,
      created_at: new Date().toISOString(),
    })
  }

  saveLocal(data)
  return { rsvp, person }
}

async function getWeekRsvpsLocal(weekStart = currentSunday()) {
  const data = loadLocal()
  return data.rsvps
    .filter((r) => r.week_start === weekStart)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
}

async function getPeopleLocal() {
  const data = loadLocal()
  return [...data.people].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )
}

async function unlockAdminLocal(password) {
  const expected =
    import.meta.env.VITE_DEMO_ADMIN_PASSWORD || 'shabbos-admin'
  if (password !== expected) {
    throw new Error('Incorrect password')
  }
  const token = `demo:${Date.now()}`
  sessionStorage.setItem(ADMIN_SESSION_KEY, token)
  return { token, mode: 'demo' }
}

async function getSponsorshipsLocal() {
  const data = loadLocal()
  return [...data.sponsorships].sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1,
  )
}

/* ---------- Supabase (optional) ---------- */

async function findOrCreatePerson(form) {
  const phoneKey = normalizePhone(form.phone)
  const name = form.fullName.trim()
  const prefs = foodPrefsFromForm(form)
  const attending = isAttending(form.coming)
  const now = new Date().toISOString()
  const weekStart = currentSunday()

  let person = null
  if (phoneKey) {
    const { data } = await supabase
      .from('people')
      .select('*')
      .eq('phone_digits', phoneKey)
      .maybeSingle()
    person = data
  }
  if (!person) {
    const { data } = await supabase
      .from('people')
      .select('*')
      .ilike('name', name)
      .maybeSingle()
    person = data
  }

  let alreadyCounted = false
  if (person) {
    const { data: prior } = await supabase
      .from('rsvps')
      .select('coming')
      .eq('person_id', person.id)
      .eq('week_start', weekStart)
    alreadyCounted = (prior || []).some((r) => isAttending(r.coming))
  }

  if (person) {
    const updates = {
      name,
      phone: form.phone.trim(),
      phone_digits: phoneKey,
      last_seen: now,
      food_prefs: [person.food_prefs, prefs].filter(Boolean).join(' | ') || null,
    }
    if (attending && !alreadyCounted) {
      updates.times_attended = (person.times_attended || 0) + 1
    }
    const { data, error } = await supabase
      .from('people')
      .update(updates)
      .eq('id', person.id)
      .select()
      .single()
    if (error) throw error
    return data
  }

  const { data, error } = await supabase
    .from('people')
    .insert({
      name,
      phone: form.phone.trim(),
      phone_digits: phoneKey || null,
      times_attended: attending ? 1 : 0,
      food_prefs: prefs || null,
      first_seen: now,
      last_seen: now,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

async function submitSupabase(form) {
  const weekStart = currentSunday()
  const person = await findOrCreatePerson(form)

  const { data: existing } = await supabase
    .from('rsvps')
    .select('id')
    .eq('person_id', person.id)
    .eq('week_start', weekStart)

  if (existing?.length) {
    const ids = existing.map((r) => r.id)
    await supabase.from('sponsorships').delete().in('rsvp_id', ids)
    await supabase.from('rsvps').delete().in('id', ids)
  }

  const { data: rsvp, error } = await supabase
    .from('rsvps')
    .insert({
      person_id: person.id,
      week_start: weekStart,
      full_name: form.fullName.trim(),
      phone: form.phone.trim(),
      coming: form.coming,
      potluck: form.mealStyle || null,
      bringing: form.foodLikes || [],
      bringing_other: form.foodLikesOther || null,
      dietary_notes: form.mealStyleOther || null,
      guest_names: form.guestNames || null,
      guest_count: form.guestCount ? Number(form.guestCount) : null,
      guest_overnight: form.guestOvernight || null,
      newcomer_notes:
        [form.heardAbout, form.invitedBy].filter(Boolean).join(' · ') || null,
      feedback: form.feedback || null,
      feedback_notes: form.feedbackNotes || null,
    })
    .select()
    .single()
  if (error) throw error

  if (form.sponsorship?.length || form.sponsorshipNotes || form.potluckContribution) {
    const { error: sErr } = await supabase.from('sponsorships').insert({
      rsvp_id: rsvp.id,
      person_id: person.id,
      week_start: weekStart,
      full_name: form.fullName.trim(),
      phone: form.phone.trim(),
      contributions: form.sponsorship || [],
      notes: form.sponsorshipNotes || null,
      potluck_contribution: form.potluckContribution || null,
    })
    if (sErr) throw sErr
  }

  return { rsvp, person }
}

async function getWeekRsvpsSupabase(weekStart = currentSunday()) {
  const { data, error } = await supabase
    .from('rsvps')
    .select('*')
    .eq('week_start', weekStart)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

async function getPeopleSupabase() {
  const { data, error } = await supabase
    .from('people')
    .select('*')
    .order('name', { ascending: true })
  if (error) throw error
  return data || []
}

async function unlockAdminSupabase(password) {
  const url = adminUnlockUrl()
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ password }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || 'Incorrect password')
  }
  sessionStorage.setItem(ADMIN_SESSION_KEY, body.token)
  return body
}

async function getSponsorshipsSupabase(token) {
  const url = adminUnlockUrl()
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ token, action: 'list' }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || 'Session expired')
  }
  return body.sponsorships || []
}

/* ---------- Public API ---------- */

export async function submitRsvp(form) {
  if (API_URL) return submitApi(form)
  if (isSupabaseConfigured) return submitSupabase(form)
  return submitLocal(form)
}

export async function getWeekRsvps(weekStart) {
  if (API_URL) return getWeekRsvpsApi(weekStart)
  if (isSupabaseConfigured) return getWeekRsvpsSupabase(weekStart)
  return getWeekRsvpsLocal(weekStart)
}

export async function getPeople() {
  if (API_URL) return getPeopleApi()
  if (isSupabaseConfigured) return getPeopleSupabase()
  return getPeopleLocal()
}

export async function unlockAdmin(password) {
  if (API_URL) return unlockAdminApi(password)
  if (isSupabaseConfigured) return unlockAdminSupabase(password)
  return unlockAdminLocal(password)
}

export function getAdminSession() {
  return sessionStorage.getItem(ADMIN_SESSION_KEY)
}

export function clearAdminSession() {
  sessionStorage.removeItem(ADMIN_SESSION_KEY)
}

export async function getSponsorships() {
  const token = getAdminSession()
  if (!token) throw new Error('Not unlocked')
  if (API_URL) return getSponsorshipsApi(token)
  if (isSupabaseConfigured) return getSponsorshipsSupabase(token)
  return getSponsorshipsLocal()
}

export function comingLabel(value) {
  const map = {
    yes: 'Coming',
    yes_guest: 'Coming + guest',
    yes_new: 'Newcomer',
    probably: 'Probably yes',
    social: 'Social / hang out',
    unsure: 'Not sure yet',
    no: "Can't make it",
    help: 'Helping / sponsoring',
  }
  return map[value] || value
}
