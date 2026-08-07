import {
  ATTENDING_VALUES,
  comingOptionLabel,
  emptyForm,
  mealStartLabel,
  mealStyleLabel,
} from './formConfig'
import { adminUnlockUrl, isSupabaseConfigured, supabase } from './supabase'
import { currentSunday, previousSunday } from './week'
import {
  loadLastSubmissionAny,
  loadLastSubmissionThisWeek,
  saveLastSubmission,
} from './localProfile'


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
  if (form.mealStartTime) {
    parts.push(
      `Start: ${
        form.mealStartTime === 'other'
          ? form.mealStartOther || 'Other'
          : mealStartLabel(form.mealStartTime)
      }`,
    )
  }
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
    meal_start_time: form.mealStartTime || null,
    meal_start_other: form.mealStartOther || null,
    food_likes: form.foodLikes || [],
    food_likes_other: form.foodLikesOther || null,
    bringing_dish:
      (form.bringingDish || form.potluckContribution || '').trim() || null,
    food_photos: Array.isArray(form.foodPhotos) ? form.foodPhotos : [],
    food_comment: String(form.foodComment || '').trim() || null,
    potluck: form.mealStyle || null,
    bringing: form.foodLikes || [],
    bringing_other: form.foodLikesOther || null,
    dietary_notes: null,
    guest_names: form.guestNames || null,
    guest_count:
      form.guestCount === '' ||
      form.guestCount === null ||
      form.guestCount === undefined
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
    newcomer_notes:
      [form.heardAbout, form.invitedBy, form.knowByWhen, form.socialArrivalTime]
        .filter(Boolean)
        .join(' · ') || null,
    feedback: form.feedback || null,
    feedback_notes: form.feedbackNotes || null,
    created_at: new Date().toISOString(),
  }
}

/* ---------- Shared HTTP API ---------- */

async function api(path, options = {}) {
  const { headers: extraHeaders, ...rest } = options
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(extraHeaders || {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`)
  return body
}

function publicRsvp(row) {
  if (!row) return row
  const { phone, ...rest } = row
  return rest
}

function publicPerson(row) {
  if (!row) return row
  const { phone, phone_digits, ...rest } = row
  return rest
}

async function submitApi(form) {
  return api('/rsvps', {
    method: 'POST',
    body: JSON.stringify({ ...form, weekStart: currentSunday() }),
  })
}

async function getWeekRsvpsApi(weekStart = currentSunday()) {
  const data = await api(`/rsvps?week=${encodeURIComponent(weekStart)}`)
  return (data.rsvps || []).map(publicRsvp)
}

async function getPeopleApi() {
  const data = await api('/people')
  return (data.people || []).map(publicPerson)
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
  return body
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
  let result
  if (API_URL) result = await submitApi(form)
  else if (isSupabaseConfigured) result = await submitSupabase(form)
  else result = await submitLocal(form)
  saveLastSubmission(form)
  return result
}

/** Map a saved RSVP (+ optional sponsorship) back into form fields. */
export function rsvpToForm(rsvp, sponsorship = null) {
  const form = emptyForm()
  if (!rsvp) return form
  form.fullName = rsvp.full_name || ''
  form.phone = rsvp.phone || ''
  form.coming = rsvp.coming || ''
  form.mealStyle = rsvp.meal_style || rsvp.potluck || ''
  form.mealStyleOther = rsvp.meal_style_other || ''
  form.mealStartTime = rsvp.meal_start_time || ''
  form.mealStartOther = rsvp.meal_start_other || ''
  form.foodLikes = rsvp.food_likes || rsvp.bringing || []
  form.foodLikesOther = rsvp.food_likes_other || rsvp.bringing_other || ''
  form.bringingDish = rsvp.bringing_dish || ''
  form.foodPhotos = Array.isArray(rsvp.food_photos) ? rsvp.food_photos : []
  form.foodComment = rsvp.food_comment || ''
  form.heardAbout = rsvp.heard_about || ''
  form.invitedBy = rsvp.invited_by || ''
  form.bringingMoreGuests = rsvp.bringing_more_guests || ''
  form.guestNames = rsvp.guest_names || ''
  form.guestCount =
    rsvp.guest_count === null || rsvp.guest_count === undefined
      ? ''
      : String(rsvp.guest_count)
  form.guestOvernight = rsvp.guest_overnight || ''
  form.guestWillFillForm = rsvp.guest_will_fill_form || ''
  form.knowByWhen = rsvp.know_by_when || ''
  form.socialArrivalTime = rsvp.social_arrival_time || ''
  form.socialNotes = rsvp.social_notes || ''
  form.feedback = rsvp.feedback || ''
  form.feedbackNotes = rsvp.feedback_notes || ''
  if (sponsorship) {
    form.sponsorship = sponsorship.contributions || []
    form.sponsorshipNotes = sponsorship.notes || ''
    form.potluckContribution = sponsorship.potluck_contribution || ''
    if (!form.bringingDish && sponsorship.potluck_contribution) {
      form.bringingDish = sponsorship.potluck_contribution
    }
  }
  return form
}

export async function findMyRsvpForWeek(weekStart, { fullName, phone } = {}) {
  const week = weekStart || currentSunday()
  if (API_URL) {
    const params = new URLSearchParams({ week })
    if (phone) params.set('phone', phone)
    if (fullName) params.set('name', fullName)
    const data = await api(`/rsvps/mine?${params}`)
    if (!data.rsvp) return null
    return {
      form: rsvpToForm(data.rsvp, data.sponsorship),
      rsvp: data.rsvp,
      sponsorship: data.sponsorship,
      week_start: week,
    }
  }

  if (week === currentSunday()) {
    const last = loadLastSubmissionThisWeek()
    if (last?.form) {
      const phoneKey = normalizePhone(phone || last.form.phone)
      const name = (fullName || last.form.fullName || '').trim().toLowerCase()
      const samePhone =
        phoneKey && normalizePhone(last.form.phone) === phoneKey
      const sameName =
        name && last.form.fullName.trim().toLowerCase() === name
      if (samePhone || sameName || (!phone && !fullName)) {
        return {
          form: { ...emptyForm(), ...last.form },
          rsvp: null,
          sponsorship: null,
          week_start: week,
        }
      }
    }
  } else {
    const last = loadLastSubmissionAny()
    if (last?.form && last.week_start === week) {
      const phoneKey = normalizePhone(phone || last.form.phone)
      const name = (fullName || last.form.fullName || '').trim().toLowerCase()
      const samePhone =
        phoneKey && normalizePhone(last.form.phone) === phoneKey
      const sameName =
        name && last.form.fullName.trim().toLowerCase() === name
      if (samePhone || sameName || (!phone && !fullName)) {
        return {
          form: { ...emptyForm(), ...last.form },
          rsvp: null,
          sponsorship: null,
          week_start: week,
        }
      }
    }
  }

  const data = loadLocal()
  const phoneKey = normalizePhone(phone)
  const name = (fullName || '').trim().toLowerCase()
  const rsvp = data.rsvps
    .filter((r) => r.week_start === week)
    .find(
      (r) =>
        (phoneKey && normalizePhone(r.phone) === phoneKey) ||
        (name && r.full_name.toLowerCase() === name),
    )
  if (!rsvp) return null
  const sponsorship =
    data.sponsorships.find((s) => s.rsvp_id === rsvp.id) || null
  return {
    form: rsvpToForm(rsvp, sponsorship),
    rsvp,
    sponsorship,
    week_start: week,
  }
}

export async function findMyRsvpThisWeek(opts) {
  return findMyRsvpForWeek(currentSunday(), opts)
}

export async function findMyRsvpLastWeek(opts) {
  return findMyRsvpForWeek(previousSunday(), opts)
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
  if (isSupabaseConfigured) {
    return { sponsorships: await getSponsorshipsSupabase(token) }
  }
  const data = loadLocal()
  return {
    sponsorships: await getSponsorshipsLocal(),
    people: data.people,
    rsvps: data.rsvps,
  }
}

export async function updateAdminRsvp(id, patch) {
  const token = getAdminSession()
  if (!token) throw new Error('Not unlocked')
  if (API_URL) {
    return api(`/admin/rsvps/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(patch),
    })
  }
  const data = loadLocal()
  const rsvp = data.rsvps.find((r) => r.id === id)
  if (!rsvp) throw new Error('RSVP not found')
  Object.assign(rsvp, {
    full_name: patch.full_name ?? patch.fullName ?? rsvp.full_name,
    phone: patch.phone ?? rsvp.phone,
    coming: patch.coming ?? rsvp.coming,
    meal_style: patch.meal_style ?? patch.mealStyle ?? rsvp.meal_style,
    meal_start_time:
      patch.meal_start_time ?? patch.mealStartTime ?? rsvp.meal_start_time,
    bringing_dish: patch.bringing_dish ?? patch.bringingDish ?? rsvp.bringing_dish,
    guest_names: patch.guest_names ?? patch.guestNames ?? rsvp.guest_names,
    guest_count:
      patch.guest_count !== undefined || patch.guestCount !== undefined
        ? patch.guest_count ?? patch.guestCount
        : rsvp.guest_count,
    food_comment:
      patch.food_comment !== undefined || patch.foodComment !== undefined
        ? patch.food_comment ?? patch.foodComment
        : rsvp.food_comment,
    food_photos:
      patch.food_photos !== undefined || patch.foodPhotos !== undefined
        ? patch.food_photos ?? patch.foodPhotos
        : rsvp.food_photos,
  })
  if (
    patch.sponsorship_notes !== undefined ||
    patch.sponsorshipNotes !== undefined ||
    patch.sponsorship !== undefined
  ) {
    let s = data.sponsorships.find((x) => x.rsvp_id === id)
    if (!s) {
      s = {
        id: uid(),
        rsvp_id: id,
        person_id: rsvp.person_id,
        week_start: rsvp.week_start,
        full_name: rsvp.full_name,
        phone: rsvp.phone,
        contributions: [],
        notes: null,
        potluck_contribution: rsvp.bringing_dish,
        created_at: new Date().toISOString(),
      }
      data.sponsorships.push(s)
    }
    if (patch.sponsorship_notes !== undefined || patch.sponsorshipNotes !== undefined) {
      s.notes = patch.sponsorship_notes ?? patch.sponsorshipNotes
    }
    if (patch.sponsorship !== undefined) {
      s.contributions = Array.isArray(patch.sponsorship)
        ? patch.sponsorship
        : String(patch.sponsorship || '')
            .split(/;|,/)
            .map((x) => x.trim())
            .filter(Boolean)
    }
  }
  saveLocal(data)
  return { rsvp }
}

export async function updateRsvpFood(id, patch) {
  if (API_URL) {
    return api(`/rsvps/${encodeURIComponent(id)}/food`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  }
  const data = loadLocal()
  const rsvp = data.rsvps.find((r) => r.id === id)
  if (!rsvp) throw new Error('RSVP not found')
  if (patch.reply || patch.add_reply) {
    const text = String(patch.reply || patch.add_reply || '').trim()
    rsvp.food_replies = [
      ...(rsvp.food_replies || []),
      {
        id: uid(),
        author_name: patch.fullName || patch.full_name || 'Guest',
        text,
        created_at: new Date().toISOString(),
      },
    ]
  } else {
    if (patch.bringing_dish !== undefined || patch.bringingDish !== undefined) {
      rsvp.bringing_dish = patch.bringing_dish ?? patch.bringingDish
    }
    if (patch.food_comment !== undefined || patch.foodComment !== undefined) {
      rsvp.food_comment = patch.food_comment ?? patch.foodComment
    }
    if (patch.food_photos !== undefined || patch.foodPhotos !== undefined) {
      rsvp.food_photos = patch.food_photos ?? patch.foodPhotos
    } else if (patch.add_photos || patch.addPhotos) {
      rsvp.food_photos = [
        ...(rsvp.food_photos || []),
        ...(patch.add_photos || patch.addPhotos || []),
      ].slice(0, 8)
    }
  }
  saveLocal(data)
  return { rsvp }
}

export function comingLabel(value) {
  return comingOptionLabel(value) || value
}
