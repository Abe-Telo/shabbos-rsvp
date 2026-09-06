/**
 * Jewish holiday catalog (Diaspora) via Hebcal + meal-slot templates.
 * https://www.hebcal.com/home/195/jewish-calendar-rest-api
 */

const CACHE_KEY = 'shabbos-jewish-holidays-v1'
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
 */
export function buildHolidayPackages(items) {
  const list = (items || []).filter(
    (it) => it.category === 'holiday' && it.yomtov,
  )
  const packages = []
  const used = new Set()

  function takeMatching(pred) {
    return list.filter((it) => {
      if (used.has(it.date + it.title)) return false
      return pred(it)
    })
  }

  // Rosh Hashana (I + II)
  const rh = takeMatching((it) => /^Rosh Hashana/i.test(it.title)).sort((a, b) =>
    a.date.localeCompare(b.date),
  )
  if (rh.length) {
    rh.forEach((it) => used.add(it.date + it.title))
    const year = rh[0].date.slice(0, 4)
    const days = rh.map((it) => it.date)
    packages.push({
      id: holidayKey('rosh-hashana', year),
      slug: 'rosh-hashana',
      title: `Rosh Hashanah ${rh[0].hdate?.match(/\d{4}/)?.[0] || year}`,
      hebrew_year: rh[0].hdate || '',
      start_date: addDays(days[0], -1),
      end_date: days[days.length - 1],
      kind: 'rosh-hashana',
      meals: slotsForDays(days, { nights: true }),
    })
  }

  // Yom Kippur — erev night + break-fast often; offer Night (erev) + Day
  const yk = takeMatching((it) => /^Yom Kippur$/i.test(it.title))
  yk.forEach((it) => {
    used.add(it.date + it.title)
    const year = it.date.slice(0, 4)
    packages.push({
      id: holidayKey('yom-kippur', year),
      slug: 'yom-kippur',
      title: `Yom Kippur ${it.hdate?.match(/\d{4}/)?.[0] || year}`,
      hebrew_year: it.hdate || '',
      start_date: addDays(it.date, -1),
      end_date: it.date,
      kind: 'yom-kippur',
      meals: [
        meal('n1', 'Erev / Night', addDays(it.date, -1), 'night'),
        meal('d1', 'Day (break-fast optional)', it.date, 'day'),
      ],
    })
  })

  // Sukkot I+II
  const sukkot = takeMatching((it) => /^Sukkot (I|II)$/i.test(it.title)).sort(
    (a, b) => a.date.localeCompare(b.date),
  )
  if (sukkot.length) {
    sukkot.forEach((it) => used.add(it.date + it.title))
    const year = sukkot[0].date.slice(0, 4)
    const days = sukkot.map((it) => it.date)
    packages.push({
      id: holidayKey('sukkot', year),
      slug: 'sukkot',
      title: `Sukkot ${sukkot[0].hdate?.match(/\d{4}/)?.[0] || year}`,
      hebrew_year: sukkot[0].hdate || '',
      start_date: addDays(days[0], -1),
      end_date: days[days.length - 1],
      kind: 'sukkot',
      meals: slotsForDays(days, { nights: true }),
    })
  }

  // Shmini Atzeret / Simchat Torah
  const shmini = takeMatching((it) =>
    /Shmini Atzeret|Simchat Torah/i.test(it.title),
  ).sort((a, b) => a.date.localeCompare(b.date))
  if (shmini.length) {
    shmini.forEach((it) => used.add(it.date + it.title))
    const year = shmini[0].date.slice(0, 4)
    const days = shmini.map((it) => it.date)
    packages.push({
      id: holidayKey('shmini-simchat', year),
      slug: 'shmini-simchat',
      title: `Shmini Atzeret / Simchat Torah ${year}`,
      hebrew_year: shmini[0].hdate || '',
      start_date: addDays(days[0], -1),
      end_date: days[days.length - 1],
      kind: 'shmini-simchat',
      meals: slotsForDays(days, { nights: true }),
    })
  }

  // Pesach — first days (I+II) and last days (VII+VIII) as two packages
  const pesachFirst = takeMatching((it) => /^Pesach (I|II)$/i.test(it.title)).sort(
    (a, b) => a.date.localeCompare(b.date),
  )
  if (pesachFirst.length) {
    pesachFirst.forEach((it) => used.add(it.date + it.title))
    const year = pesachFirst[0].date.slice(0, 4)
    const days = pesachFirst.map((it) => it.date)
    packages.push({
      id: holidayKey('pesach-first', year),
      slug: 'pesach-first',
      title: `Pesach (first days) ${year}`,
      hebrew_year: pesachFirst[0].hdate || '',
      start_date: addDays(days[0], -1),
      end_date: days[days.length - 1],
      kind: 'pesach',
      meals: slotsForDays(days, { nights: true }),
    })
  }
  const pesachLast = takeMatching((it) =>
    /^Pesach (VII|VIII)$/i.test(it.title),
  ).sort((a, b) => a.date.localeCompare(b.date))
  if (pesachLast.length) {
    pesachLast.forEach((it) => used.add(it.date + it.title))
    const year = pesachLast[0].date.slice(0, 4)
    const days = pesachLast.map((it) => it.date)
    packages.push({
      id: holidayKey('pesach-last', year),
      slug: 'pesach-last',
      title: `Pesach (last days) ${year}`,
      hebrew_year: pesachLast[0].hdate || '',
      start_date: addDays(days[0], -1),
      end_date: days[days.length - 1],
      kind: 'pesach',
      meals: slotsForDays(days, { nights: true }),
    })
  }

  // Shavuot
  const shavuot = takeMatching((it) => /^Shavuot/i.test(it.title)).sort((a, b) =>
    a.date.localeCompare(b.date),
  )
  if (shavuot.length) {
    shavuot.forEach((it) => used.add(it.date + it.title))
    const year = shavuot[0].date.slice(0, 4)
    const days = shavuot.map((it) => it.date)
    packages.push({
      id: holidayKey('shavuot', year),
      slug: 'shavuot',
      title: `Shavuot ${year}`,
      hebrew_year: shavuot[0].hdate || '',
      start_date: addDays(days[0], -1),
      end_date: days[days.length - 1],
      kind: 'shavuot',
      meals: slotsForDays(days, { nights: true }),
    })
  }

  // Fallback: any remaining major yomtov day as single-day package
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
    meals: [],
  }
}

export function eventFromPackage(pkg) {
  return {
    enabled: true,
    holiday_id: pkg.id,
    title: pkg.title,
    statement: DEFAULT_STATEMENT,
    meals: (pkg.meals || []).map((m) => ({ ...m })),
  }
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
  const today = formatDateLocal(fromDate)
  return (packages || []).filter((p) => String(p.end_date || '') >= today)
}

function formatDateLocal(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
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
