/**
 * Jewish holiday catalog (Diaspora) via Hebcal + meal-slot templates.
 * https://www.hebcal.com/home/195/jewish-calendar-rest-api
 */

const CACHE_KEY = 'shabbos-jewish-holidays-v3'
const CACHE_MS = 7 * 24 * 60 * 60 * 1000

const DEFAULT_STATEMENT =
  'Yom Tov meals take a lot of time and money to prepare. Please help however you can — a donation, bringing a potluck dish, or helping clean up after the meal. Every bit makes hosting possible.'

function addDays(isoDate, delta) {
  const d = new Date(`${isoDate}T12:00:00`)
  d.setDate(d.getDate() + delta)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatShort(isoDate) {
  try {
    return new Date(`${isoDate}T12:00:00`).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return isoDate
  }
}

function meal(id, label, date, period) {
  return {
    id,
    label,
    date,
    period,
    hosted: true,
    host_name: '',
    address: '',
    notes: '',
    start_time: '',
    date_label: formatShort(date),
  }
}

/** Build night/day slots from Hebcal day dates (first day = day1). */
function slotsForDays(dayDates, { nights = true } = {}) {
  const meals = []
  dayDates.forEach((dayDate, i) => {
    const n = i + 1
    if (nights) {
      const nightDate = i === 0 ? addDays(dayDate, -1) : dayDates[i - 1]
      meals.push(
        meal(`n${n}`, `Night ${n}`, nightDate, 'night'),
      )
    }
    meals.push(meal(`d${n}`, `Day ${n}`, dayDate, 'day'))
  })
  return meals
}

function holidayKey(slug, year) {
  return `${slug}-${year}`
}

/**
 * Group Hebcal yomtov items into selectable holiday packages.
 * Each occurrence (per year) is its own package — never merge 10 years of RH into one meal list.
 */
export function buildHolidayPackages(items) {
  const list = (items || []).filter(
    (it) => it.category === 'holiday' && it.yomtov,
  )
  const packages = []
  const used = new Set()

  function markUsed(itemsIn) {
    for (const it of itemsIn) used.add(it.date + it.title)
  }

  function unusedMatching(pred) {
    return list
      .filter((it) => !used.has(it.date + it.title) && pred(it))
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  /** Split sorted items into clusters of nearby dates (same holiday occurrence). */
  function clusterNearby(itemsIn, maxGapDays = 2) {
    const clusters = []
    let current = []
    for (const it of itemsIn) {
      if (!current.length) {
        current = [it]
        continue
      }
      const prev = current[current.length - 1]
      const gap =
        (new Date(`${it.date}T12:00:00`).getTime() -
          new Date(`${prev.date}T12:00:00`).getTime()) /
        (24 * 60 * 60 * 1000)
      if (gap <= maxGapDays) current.push(it)
      else {
        clusters.push(current)
        current = [it]
      }
    }
    if (current.length) clusters.push(current)
    return clusters
  }

  function hebrewYearOf(it) {
    return it.hdate?.match(/\d{4}/)?.[0] || it.date.slice(0, 4)
  }

  function pushDayNightPackage({
    cluster,
    slug,
    kind,
    titleFor,
  }) {
    markUsed(cluster)
    const days = cluster.map((it) => it.date)
    const year = days[0].slice(0, 4)
    const hy = hebrewYearOf(cluster[0])
    packages.push({
      id: holidayKey(slug, year),
      slug,
      title: titleFor(hy, year, cluster),
      hebrew_year: cluster[0].hdate || '',
      start_date: addDays(days[0], -1),
      end_date: days[days.length - 1],
      kind,
      meals: slotsForDays(days, { nights: true }),
    })
  }

  // Rosh Hashana — 2 days per year → Night1/Day1/Night2/Day2
  for (const cluster of clusterNearby(
    unusedMatching((it) => /^Rosh Hashana/i.test(it.title)),
    2,
  )) {
    pushDayNightPackage({
      cluster,
      slug: 'rosh-hashana',
      kind: 'rosh-hashana',
      titleFor: (hy) => `Rosh Hashanah ${hy}`,
    })
  }

  // Yom Kippur — one day each year
  for (const it of unusedMatching((it) => /^Yom Kippur$/i.test(it.title))) {
    markUsed([it])
    const year = it.date.slice(0, 4)
    const hy = hebrewYearOf(it)
    packages.push({
      id: holidayKey('yom-kippur', year),
      slug: 'yom-kippur',
      title: `Yom Kippur ${hy}`,
      hebrew_year: it.hdate || '',
      start_date: addDays(it.date, -1),
      end_date: it.date,
      kind: 'yom-kippur',
      meals: [
        meal('n1', 'Erev / Night', addDays(it.date, -1), 'night'),
        meal('d1', 'Day (break-fast optional)', it.date, 'day'),
      ],
    })
  }

  // Sukkot first half (I+II) and second half (Shmini Atzeret / Simchat Torah)
  const sukkotFirstClusters = clusterNearby(
    unusedMatching((it) => /^Sukkot (I|II)$/i.test(it.title)),
    2,
  )
  const sukkotLastClusters = clusterNearby(
    unusedMatching((it) => /Shmini Atzeret|Simchat Torah/i.test(it.title)),
    2,
  )
  const sukkotLastByYear = Object.fromEntries(
    sukkotLastClusters.map((cluster) => [cluster[0].date.slice(0, 4), cluster]),
  )
  for (const first of sukkotFirstClusters) {
    const year = first[0].date.slice(0, 4)
    const last = sukkotLastByYear[year]
    const hy = hebrewYearOf(first[0])
    markUsed(first)
    if (last) markUsed(last)

    const firstDays = first.map((it) => it.date)
    const lastDays = last ? last.map((it) => it.date) : []
    const firstMeals = slotsForDays(firstDays, { nights: true })
    const lastMeals = slotsForDays(lastDays, { nights: true }).map((m) => ({
      ...m,
      id: `sh-${m.id}`,
      label: `Second half · ${m.label}`,
    }))

    if (last) {
      packages.push({
        id: holidayKey('sukkot', year),
        slug: 'sukkot',
        title: `Sukkot ${hy} (first + second half)`,
        hebrew_year: first[0].hdate || '',
        start_date: addDays(firstDays[0], -1),
        end_date: lastDays[lastDays.length - 1],
        kind: 'sukkot',
        meals: [
          ...firstMeals.map((m) => ({
            ...m,
            label: `First half · ${m.label}`,
          })),
          ...lastMeals,
        ],
      })
    }

    packages.push({
      id: holidayKey('sukkot-first', year),
      slug: 'sukkot-first',
      title: `Sukkot (first half) ${hy}`,
      hebrew_year: first[0].hdate || '',
      start_date: addDays(firstDays[0], -1),
      end_date: firstDays[firstDays.length - 1],
      kind: 'sukkot',
      meals: firstMeals,
    })

    if (last) {
      packages.push({
        id: holidayKey('sukkot-last', year),
        slug: 'sukkot-last',
        title: `Sukkot (second half) ${hy}`,
        hebrew_year: last[0].hdate || '',
        start_date: addDays(lastDays[0], -1),
        end_date: lastDays[lastDays.length - 1],
        kind: 'sukkot',
        meals: lastMeals,
      })
    }
  }

  // Pesach first days (I+II)
  for (const cluster of clusterNearby(
    unusedMatching((it) => /^Pesach (I|II)$/i.test(it.title)),
    2,
  )) {
    pushDayNightPackage({
      cluster,
      slug: 'pesach-first',
      kind: 'pesach',
      titleFor: (_hy, year) => `Pesach (first days) ${year}`,
    })
  }

  // Pesach last days (VII+VIII)
  for (const cluster of clusterNearby(
    unusedMatching((it) => /^Pesach (VII|VIII)$/i.test(it.title)),
    2,
  )) {
    pushDayNightPackage({
      cluster,
      slug: 'pesach-last',
      kind: 'pesach',
      titleFor: (_hy, year) => `Pesach (last days) ${year}`,
    })
  }

  // Shavuot
  for (const cluster of clusterNearby(
    unusedMatching((it) => /^Shavuot/i.test(it.title)),
    2,
  )) {
    pushDayNightPackage({
      cluster,
      slug: 'shavuot',
      kind: 'shavuot',
      titleFor: (_hy, year) => `Shavuot ${year}`,
    })
  }

  // Fallback: remaining major yomtov days
  for (const it of list) {
    const key = it.date + it.title
    if (used.has(key)) continue
    used.add(key)
    const year = it.date.slice(0, 4)
    const slug = String(it.title || 'holiday')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    packages.push({
      id: holidayKey(slug, year),
      slug,
      title: it.title,
      hebrew_year: it.hdate || '',
      start_date: addDays(it.date, -1),
      end_date: it.date,
      kind: 'other',
      meals: slotsForDays([it.date], { nights: true }),
    })
  }

  return packages.sort((a, b) => a.start_date.localeCompare(b.start_date))
}

export function defaultHolidayStatement() {
  return DEFAULT_STATEMENT
}

export function emptyHolidayEvent() {
  return {
    enabled: false,
    holiday_id: null,
    title: '',
    statement: DEFAULT_STATEMENT,
    start_date: null,
    end_date: null,
    meals: [],
  }
}

export function eventFromPackage(pkg) {
  return {
    enabled: true,
    holiday_id: pkg.id,
    title: pkg.title,
    statement: DEFAULT_STATEMENT,
    start_date: pkg.start_date || null,
    end_date: pkg.end_date || null,
    meals: (pkg.meals || []).map((m) => ({ ...m })),
  }
}

export function mealDateRange(meals) {
  const dates = (meals || [])
    .map((m) => String(m?.date || '').trim())
    .filter(Boolean)
    .sort()
  return {
    start_date: dates[0] || null,
    end_date: dates[dates.length - 1] || null,
  }
}

export function todayIso(fromDate = new Date()) {
  const y = fromDate.getFullYear()
  const m = String(fromDate.getMonth() + 1).padStart(2, '0')
  const day = String(fromDate.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function holidayHasEnded(event, fromDate = new Date()) {
  const end =
    event?.end_date || mealDateRange(event?.meals || []).end_date || ''
  return Boolean(end) && String(end) < todayIso(fromDate)
}

export function titleFromHolidayId(holidayId) {
  const id = String(holidayId || '')
  if (!id) return 'Past holiday'
  const [slug, year] = id.split(/-(?=\d{4}$)/)
  const names = {
    'rosh-hashana': 'Rosh Hashanah',
    'yom-kippur': 'Yom Kippur',
    sukkot: 'Sukkot',
    'sukkot-first': 'Sukkot (first half)',
    'sukkot-last': 'Sukkot (second half)',
    'shmini-simchat': 'Shmini Atzeret / Simchat Torah',
    'pesach-first': 'Pesach (first days)',
    'pesach-last': 'Pesach (last days)',
    shavuot: 'Shavuot',
  }
  const name = names[slug] || slug.replace(/-/g, ' ')
  return year ? `${name} ${year}` : name
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.fetched_at || !Array.isArray(parsed.packages)) return null
    if (Date.now() - parsed.fetched_at > CACHE_MS) return null
    return parsed.packages
  } catch {
    return null
  }
}

function saveCache(packages) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ fetched_at: Date.now(), packages }),
    )
  } catch {
    /* ignore */
  }
}

/**
 * Fetch major Yom Tov for `years` Gregorian years starting at `startYear`.
 */
export async function fetchHolidayCatalog({
  startYear = new Date().getFullYear(),
  years = 10,
  force = false,
} = {}) {
  if (!force) {
    const cached = loadCache()
    if (cached?.length) return cached
  }

  const url = `https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&yto=on&year=${startYear}&ny=${years}&lg=s`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not load Jewish calendar (${res.status})`)
  const body = await res.json()
  const packages = buildHolidayPackages(body.items || [])
  saveCache(packages)
  return packages
}

export function upcomingPackages(packages, fromDate = new Date()) {
  const today = todayIso(fromDate)
  return (packages || []).filter((p) => String(p.end_date || '') >= today)
}

function formatDateLocal(d) {
  return todayIso(d)
}

export function mealPublicView(meal) {
  if (!meal) return null
  const { address, ...rest } = meal
  return rest
}

export function formatMealLabel(meal) {
  if (!meal) return ''
  const when = meal.date_label || formatShort(meal.date)
  return `${meal.label} · ${when}`
}

export const SUKKOT_MEAL_OCCASIONS = {
  n1: 'Erev Sukkos',
  d1: 'Sukkos 1 / Shabbos',
  n2: 'Second night of Sukkos',
  d2: 'Sukkos 2',
  'sh-n1': 'Shemini Atzeres night',
  'sh-d1': 'Shemini Atzeres / Shabbos',
  'sh-n2': 'Simchas Torah night',
  'sh-d2': 'Simchas Torah',
}

export function mealPeriodOf(id, meal) {
  if (meal?.period === 'night' || meal?.period === 'day') return meal.period
  const s = String(id || meal?.id || '')
  if (/(^|-)n\d+$/i.test(s)) return 'night'
  if (/(^|-)d\d+$/i.test(s)) return 'day'
  return null
}

export function mealNumberOf(id, meals) {
  const idx = (meals || []).findIndex((m) => m.id === id)
  return idx >= 0 ? idx + 1 : ''
}

export function occasionNameForMeal(meal, holidayTitle) {
  const id = String(meal?.id || meal?.meal_id || '')
  if (SUKKOT_MEAL_OCCASIONS[id]) return SUKKOT_MEAL_OCCASIONS[id]
  return holidayTitle || meal?.label || 'Holiday meal'
}

export function formatClockTime(raw) {
  const s = String(raw || '').trim()
  if (!s) return ''
  if (/[ap]m/i.test(s)) return s.replace(/\s+/g, ' ')
  const iso = Date.parse(s)
  if (!Number.isNaN(iso) && /T/.test(s)) {
    return new Date(s).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })
  }
  const m = /^(\d{1,2}):(\d{2})/.exec(s)
  if (!m) return s
  let h = Number(m[1])
  const min = m[2]
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${min} ${ap}`
}

const ZMANIM_CACHE = 'shabbos-brooklyn-zmanim-v1'
const BROOKLYN_GEONAME = 5110302

function emptyZmanimDay() {
  return { candles: '', havdalah: '' }
}

export async function fetchBrooklynZmanim(startDate, endDate) {
  const start = String(startDate || '').slice(0, 10)
  const end = String(endDate || '').slice(0, 10)
  if (!start || !end) return {}
  const key = `${start}:${end}`
  try {
    const cached = JSON.parse(sessionStorage.getItem(ZMANIM_CACHE) || '{}')
    if (cached[key]) return cached[key]
  } catch {
    /* ignore */
  }

  const url =
    `https://www.hebcal.com/hebcal?v=1&cfg=json&c=on&b=18&M=on` +
    `&geo=geoname&geonameid=${BROOKLYN_GEONAME}` +
    `&start=${start}&end=${end}` +
    `&maj=off&min=off&mod=off&nx=off&ss=off&mf=off`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not load zmanim (${res.status})`)
  const body = await res.json()
  const byDate = {}
  for (const it of body.items || []) {
    const iso = String(it.date || '')
    const day = iso.slice(0, 10)
    if (!day) continue
    const time = formatClockTime(iso)
    if (!byDate[day]) byDate[day] = emptyZmanimDay()
    if (it.category === 'candles') byDate[day].candles = time
    if (it.category === 'havdalah') byDate[day].havdalah = time
  }
  try {
    const cached = JSON.parse(sessionStorage.getItem(ZMANIM_CACHE) || '{}')
    cached[key] = byDate
    sessionStorage.setItem(ZMANIM_CACHE, JSON.stringify(cached))
  } catch {
    /* ignore */
  }
  return byDate
}
