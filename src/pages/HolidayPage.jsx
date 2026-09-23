import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  findMyHolidayRsvp,
  getHolidayEvent,
  getHolidayFood,
  getHolidayRsvps,
  saveHolidayFoodItem,
  submitHolidayRsvp,
  updateHolidayFoodItem,
} from '../lib/api'
import { fileToFoodPhotoData } from '../lib/auth'
import { HOST_PAYMENT } from '../lib/formConfig'
import {
  fetchBrooklynZmanim,
  formatClockTime,
  formatMealLabel,
} from '../lib/jewishHolidays'
import { loadRememberedForm, saveRememberedForm } from '../lib/localProfile'
import { useAuth } from '../lib/AuthContext'

const STEPS = {
  loading: 'loading',
  closed: 'closed',
  returning: 'returning',
  all_set: 'all_set',
  meals: 'meals',
  guests: 'guests',
  help: 'help',
  done: 'done',
}

const MAIN_TABS = [
  { id: 'form', label: 'Form' },
  { id: 'coming', label: "Who's coming" },
  { id: 'food', label: 'Food' },
  { id: 'calendar', label: 'Calendar' },
]

const SUKKOT_5787_CALENDAR = {
  title: 'Sukkos & Simchas Torah Calendar 2026',
  place: 'Brooklyn, NY · 5787',
  intro:
    'The upcoming Yom Tov begins Friday evening, September 25, and ends Sunday night, October 4, 2026. For hosting, there are two halves of Yom Tov, each with four main meals.',
  days: [
    { date: '2026-09-25', label: 'Fri 25', kind: 'yomtov', note: 'Erev Sukkos', mealIds: ['n1'], zmanim: ['shabbos-start'] },
    { date: '2026-09-26', label: 'Sat 26', kind: 'yomtov', note: 'Sukkos 1 / Shabbos', mealIds: ['d1', 'n2'], zmanim: ['shabbos-end'] },
    { date: '2026-09-27', label: 'Sun 27', kind: 'yomtov', note: 'Sukkos 2', mealIds: ['d2'], zmanim: ['chag-end'] },
    { date: '2026-09-28', label: 'Mon 28', kind: 'chol', note: 'Chol Hamoed', mealIds: [] },
    { date: '2026-09-29', label: 'Tue 29', kind: 'chol', note: 'Chol Hamoed', mealIds: [] },
    { date: '2026-09-30', label: 'Wed 30', kind: 'chol', note: 'Chol Hamoed', mealIds: [] },
    { date: '2026-10-01', label: 'Thu 1', kind: 'chol', note: 'Chol Hamoed', mealIds: [] },
    { date: '2026-10-02', label: 'Fri 2', kind: 'yomtov', note: 'Hoshana Rabbah / SA night', mealIds: ['sh-n1'], zmanim: ['shabbos-start'] },
    { date: '2026-10-03', label: 'Sat 3', kind: 'yomtov', note: 'Shemini Atzeres / ST night', mealIds: ['sh-d1', 'sh-n2'], zmanim: ['shabbos-end'] },
    { date: '2026-10-04', label: 'Sun 4', kind: 'yomtov', note: 'Simchas Torah', mealIds: ['sh-d2'], zmanim: ['chag-end'] },
  ],
  halves: [
    {
      id: 'first',
      title: 'First half: Sukkos',
      when: 'September 25–27',
      meals: '4 meals',
      rows: [
        ['Fri, Sep 25', 'Erev Sukkos', 'Friday night dinner'],
        ['Sat, Sep 26', 'Sukkos Day 1 / Shabbos', 'Lunch'],
        ['Sat, Sep 26', 'Second night of Sukkos', 'Dinner'],
        ['Sun, Sep 27', 'Sukkos Day 2', 'Lunch'],
      ],
    },
    {
      id: 'chol',
      title: 'Chol Hamoed',
      when: 'September 28 – October 1',
      meals: 'No Yom Tov meals',
      note: 'Monday–Thursday, then Hoshana Rabbah on Friday, October 2.',
      rows: [],
    },
    {
      id: 'second',
      title: 'Second half: Shemini Atzeres & Simchas Torah',
      when: 'October 2–4',
      meals: '4 meals',
      rows: [
        ['Fri, Oct 2', 'Shemini Atzeres begins', 'Friday night dinner'],
        ['Sat, Oct 3', 'Shemini Atzeres / Shabbos', 'Lunch'],
        ['Sat, Oct 3', 'Simchas Torah begins', 'Dinner'],
        ['Sun, Oct 4', 'Simchas Torah', 'Lunch'],
      ],
    },
  ],
  candles: [
    ['Fri, Sep 25', '6:29 PM'],
    ['Sat, Sep 26', 'After Shabbos ends'],
    ['Fri, Oct 2', '6:18 PM'],
    ['Sat, Oct 3', 'After Shabbos ends'],
  ],
}

const DEFAULT_FOOD_SUGGESTIONS = [
  'Challah',
  'Wine / grape juice',
  'Fish',
  'Chicken / meat',
  'Salad',
  'Kugel / side',
  'Dessert',
  'Drinks',
]

function PaymentBlock() {
  const zelle = HOST_PAYMENT.zelle || 'Abe@bigtechservices.com'
  return (
    <div className="holiday-pay">
      <strong>Send your donation by Zelle</strong>
      <div className="meta" style={{ marginTop: '0.35rem', fontSize: '1.05rem' }}>
        {zelle}
      </div>
      <p className="hint" style={{ marginBottom: 0, marginTop: '0.4rem' }}>
        Please include your name in the Zelle memo. Thank you!
      </p>
    </div>
  )
}

function mealOrderKey(id) {
  const s = String(id || '')
  const half = s.startsWith('sh-') ? 1 : 0
  const raw = s.replace(/^sh-/, '')
  const m = raw.match(/^([nd])(\d+)$/i)
  if (!m) return [half, 99, 99, s]
  const n = Number(m[2])
  const period = m[1].toLowerCase() === 'n' ? 0 : 1
  return [half, n, period, s]
}

function sortMealsByHosted(ids, hostedMeals) {
  const order = new Map((hostedMeals || []).map((m, i) => [m.id, i]))
  return [...(ids || [])].sort((a, b) => {
    const ia = order.has(a) ? order.get(a) : 999
    const ib = order.has(b) ? order.get(b) : 999
    if (ia !== ib) return ia - ib
    const ka = mealOrderKey(a)
    const kb = mealOrderKey(b)
    for (let i = 0; i < ka.length; i += 1) {
      if (ka[i] < kb[i]) return -1
      if (ka[i] > kb[i]) return 1
    }
    return 0
  })
}

function mealNumber(id, hostedMeals) {
  const idx = (hostedMeals || []).findIndex((m) => m.id === id)
  if (idx >= 0) return idx + 1
  const sorted = sortMealsByHosted(
    (hostedMeals || []).map((m) => m.id).concat(id),
    hostedMeals,
  )
  const fallback = sorted.indexOf(id)
  return fallback >= 0 ? fallback + 1 : ''
}

function mealPeriod(id, hostedMeals) {
  const match = (hostedMeals || []).find((m) => m.id === id)
  if (match?.period === 'night' || match?.period === 'day') return match.period
  const s = String(id || '')
  if (/(^|-)n\d+$/i.test(s)) return 'night'
  if (/(^|-)d\d+$/i.test(s)) return 'day'
  return null
}

function dayMealIds(day, hostedMeals) {
  return (
    day.mealIds ||
    (hostedMeals || [])
      .filter((m) => m.date === day.date)
      .map((m) => m.id)
  )
}

function dayCounts(mealIds, summary) {
  const ids = new Set(mealIds || [])
  let registered = 0
  let guests = 0
  for (const p of summary?.people || []) {
    const coming = (p.meals || []).some((id) => ids.has(id))
    if (!coming) continue
    registered += 1
    let peak = 0
    for (const g of p.guest_details || []) {
      const onDay = (g.meals || []).some((id) => ids.has(id))
      if (!onDay) continue
      peak = Math.max(peak, Math.max(0, Number(g.count) || 0))
    }
    guests += peak
  }
  return { registered, guests, total: registered + guests }
}

function SunIcon({ size = 18 }) {
  return (
    <svg
      className="holiday-cal-icon sun"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      >
        <path d="M12 2.6v2.4M12 19v2.4M2.6 12h2.4M19 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M5.2 18.8l1.7-1.7M17.1 6.9l1.7-1.7" />
      </g>
    </svg>
  )
}

function NightIcon({ size = 18 }) {
  return (
    <svg
      className="holiday-cal-icon night"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M15.1 3.4a8.4 8.4 0 1 0 5.5 14.6 8.8 8.8 0 0 1-5.5-14.6z"
      />
    </svg>
  )
}

function CalendarMealIcons({ hasDay, hasNight }) {
  if (!hasDay && !hasNight) return null
  const label = hasDay && hasNight ? 'Day and night meals' : hasDay ? 'Day meal' : 'Night meal'
  return (
    <div className="holiday-cal-icons" aria-label={label} title={label}>
      {hasDay && <SunIcon />}
      {hasNight && <NightIcon />}
    </div>
  )
}

function CalendarCounts({ registered, guests, total }) {
  return (
    <div className="holiday-cal-counts">
      <span>
        <em>{registered}</em>
        Reg
      </span>
      <span>
        <em>{guests}</em>
        Guests
      </span>
      <span>
        <em>{total}</em>
        Total
      </span>
    </div>
  )
}

const ZMANIM_FALLBACK = {
  '2026-09-25': { candles: '6:29 PM' },
  '2026-10-02': { candles: '6:18 PM' },
}

function zmanimLines(day, times, hostedMeals) {
  const t = times || {}
  const lines = []
  for (const kind of day.zmanim || []) {
    if (kind === 'shabbos-start' && t.candles) {
      lines.push({ label: 'Shabbos starts', time: t.candles })
    }
    if (kind === 'chag-start' && t.candles) {
      lines.push({ label: 'Chag starts', time: t.candles })
    }
    if (kind === 'shabbos-end' && t.havdalah) {
      lines.push({ label: 'Shabbos ends', time: t.havdalah })
    }
    if (kind === 'chag-end' && t.havdalah) {
      lines.push({ label: 'Chag ends', time: t.havdalah })
    }
  }
  const meals = (hostedMeals || []).filter((m) =>
    (day.mealIds || []).includes(m.id),
  )
  for (const m of meals) {
    const time = formatClockTime(m.start_time)
    if (!time) continue
    const period = mealPeriod(m.id, hostedMeals)
    lines.push({
      label: 'Meal starts',
      time,
      period,
    })
  }
  return lines
}

function CalendarTab({ holiday, summary, hostedMeals }) {
  const [zmanim, setZmanim] = useState(ZMANIM_FALLBACK)
  const showSukkot =
    String(holiday?.holiday_id || '').includes('sukkot') ||
    /sukko/i.test(holiday?.title || '')
  const cal = showSukkot ? SUKKOT_5787_CALENDAR : null

  useEffect(() => {
    if (!cal?.days?.length) return
    const start = cal.days[0].date
    const end = cal.days[cal.days.length - 1].date
    let alive = true
    fetchBrooklynZmanim(start, end)
      .then((times) => {
        if (alive && times && Object.keys(times).length) {
          setZmanim({ ...ZMANIM_FALLBACK, ...times })
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [cal])

  if (!cal) {
    const meals = (holiday?.meals || []).filter((m) => m.hosted !== false)
    return (
      <div className="panel">
        <h2>{holiday?.title || 'Holiday calendar'}</h2>
        <p className="hint">Meal dates the host is offering this holiday.</p>
        {meals.length === 0 ? (
          <div className="empty">No hosted meals yet.</div>
        ) : (
          <div className="sheet-wrap">
            <table className="sheet-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Meal</th>
                </tr>
              </thead>
              <tbody>
                {meals.map((m) => (
                  <tr key={m.id}>
                    <td>{m.date_label || m.date}</td>
                    <td>{formatMealLabel(m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="panel">
      <h2>{cal.title}</h2>
      <p className="hint">{cal.place}</p>
      <p>{cal.intro}</p>

      <p className="hint">
        Sun is a day meal. Moon is a night meal. Days with lunch and dinner
        show both icons, with a count for each sitting.
      </p>

      <div className="holiday-cal-strip" aria-label="Sukkos calendar">
        {cal.days.map((d) => {
          const ids = dayMealIds(d, hostedMeals)
          const dayIds = ids.filter((id) => mealPeriod(id, hostedMeals) === 'day')
          const nightIds = ids.filter(
            (id) => mealPeriod(id, hostedMeals) === 'night',
          )
          const hasDay = dayIds.length > 0
          const hasNight = nightIds.length > 0
          const hasBoth = hasDay && hasNight
          const hasMeals = ids.length > 0
          const uniqueCounts = dayCounts(ids, summary)
          const sittingDay = hasDay ? dayCounts(dayIds, summary) : null
          const sittingNight = hasNight ? dayCounts(nightIds, summary) : null
          const times = zmanimLines(d, zmanim[d.date], hostedMeals)
          return (
            <div
              key={d.date}
              className={`holiday-summary-card holiday-cal-card ${
                d.kind === 'yomtov' && hasMeals ? 'is-coming' : 'is-out'
              }${hasBoth ? ' has-both' : ''}`}
            >
              <div className="holiday-cal-card-head">
                <div className="holiday-summary-when">{d.label}</div>
                <CalendarMealIcons hasDay={hasDay} hasNight={hasNight} />
              </div>
              <strong>{d.note}</strong>
              {times.length > 0 && (
                <div className="holiday-cal-zmanim">
                  {times.map((line, i) => (
                    <div key={`${d.date}-${line.label}-${i}`}>
                      {line.period === 'night' ? (
                        <NightIcon size={12} />
                      ) : line.period === 'day' ? (
                        <SunIcon size={12} />
                      ) : null}
                      <span>
                        {line.label}
                        {line.time ? ` · ${line.time}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {hasBoth ? (
                <div className="holiday-cal-sittings">
                  <div className="holiday-cal-sitting">
                    <SunIcon size={14} />
                    <CalendarCounts {...sittingDay} />
                  </div>
                  <div className="holiday-cal-sitting">
                    <NightIcon size={14} />
                    <CalendarCounts {...sittingNight} />
                  </div>
                </div>
              ) : (
                <CalendarCounts {...uniqueCounts} />
              )}
            </div>
          )
        })}
      </div>

      {cal.halves.map((half) => (
        <div key={half.id} className="holiday-cal-half">
          <h3>{half.title}</h3>
          <p className="meta">
            {half.when} · {half.meals}
          </p>
          {half.note && <p className="hint">{half.note}</p>}
          {half.rows.length > 0 && (
            <div className="sheet-wrap">
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Occasion</th>
                    <th>Meal</th>
                  </tr>
                </thead>
                <tbody>
                  {half.rows.map((row, i) => (
                    <tr key={`${half.id}-${i}`}>
                      <td>{row[0]}</td>
                      <td className="sheet-cell-wrap">{row[1]}</td>
                      <td>{row[2]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      <h3>Candle-lighting times in Brooklyn</h3>
      <div className="sheet-wrap">
        <table className="sheet-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {cal.candles.map((row) => (
              <tr key={row[0]}>
                <td>{row[0]}</td>
                <td>{row[1]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint" style={{ marginBottom: 0 }}>
        Times are Brooklyn zmanim from Hebcal. Light candles before the Friday
        time. Meal starts only shows when the host sets a time in Admin.
      </p>
    </div>
  )
}

function AttendanceTab({ summary, hostedMeals, holiday }) {
  const people = summary?.people || []
  const declined = summary?.declined || []
  const totals = summary?.totals || { number: 0, guests: 0, total: 0 }
  const meals = summary?.meals || []
  const holidayTitle = holiday?.title || 'Holiday'

  return (
    <div className="panel">
      <h2>Who&apos;s coming</h2>
      <p className="holiday-coming-name">{holidayTitle}</p>
      <p className="hint">
        Guests = most extras at any one meal for that person. Meal breakdown
        below shows exact seats per night/day. Sun is day, moon is night.
      </p>
      <div className="stats">
        <div className="stat">
          <span className="n">{totals.number}</span>
          <span className="l">Number (RSVPs)</span>
        </div>
        <div className="stat">
          <span className="n">{totals.guests}</span>
          <span className="l">Guests they bring</span>
        </div>
        <div className="stat">
          <span className="n">{totals.total}</span>
          <span className="l">Total</span>
        </div>
      </div>

      {people.length === 0 ? (
        <div className="empty">No holiday RSVPs yet.</div>
      ) : (
        <div className="sheet-wrap" style={{ marginTop: '0.75rem' }}>
          <table className="sheet-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Number</th>
                <th>Guests</th>
                <th>Total</th>
                <th>Meals</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td title={p.name}>{p.name}</td>
                  <td>{p.number}</td>
                  <td>{p.guests}</td>
                  <td>{p.total}</td>
                  <td title={(p.meals || []).join(', ')}>
                    <span className="coming-meal-pills">
                      {sortMealsByHosted(p.meals, hostedMeals).map((id) => {
                        const hosted = hostedMeals.find((m) => m.id === id)
                        const period = mealPeriod(id, hostedMeals)
                        return (
                          <span className="coming-meal-pill" key={id}>
                            <span className="coming-meal-num">
                              {mealNumber(id, hostedMeals)}
                            </span>
                            {period === 'night' ? (
                              <NightIcon size={13} />
                            ) : (
                              <SunIcon size={13} />
                            )}
                            {occasionNameForMeal(hosted || { id }, holidayTitle)}
                          </span>
                        )
                      })}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {declined.length > 0 && (
        <p className="meta" style={{ marginTop: '0.85rem' }}>
          Can&apos;t make it: {declined.map((p) => p.name).join(', ')}
        </p>
      )}

      <h3
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.05rem',
          margin: '1.25rem 0 0.55rem',
        }}
      >
        By meal
      </h3>
      <div className="list">
        {meals.map((m) => (
          <div className="rsvp-row" key={m.meal_id}>
            <MealSittingHeading
              meal={m}
              hostedMeals={hostedMeals}
              holidayTitle={holidayTitle}
            />
            <div className="meta">
              {m.self_count} coming · {m.guest_count} guest seats · {m.total}{' '}
              total
            </div>
            {m.people?.length > 0 && (
              <div className="tags" style={{ marginTop: '0.35rem' }}>
                {m.people.map((p, i) => (
                  <span className="tag" key={`${p.name}-${i}`}>
                    {p.kind === 'guest'
                      ? `${p.name}${p.guests > 1 ? ` ×${p.guests}` : ''} (with ${p.with})`
                      : p.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function foodPhotoSrc(p) {
  if (!p) return ''
  return typeof p === 'string' ? p : p.url || ''
}

function voteScore(votes) {
  return (votes || []).reduce((n, v) => n + (Number(v.value) === -1 ? -1 : Number(v.value) === 1 ? 1 : 0), 0)
}

function CameraIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M9 3h6l1.5 2H20a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3.5L9 3zm3 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 2.2A2.8 2.8 0 1 1 12 16a2.8 2.8 0 0 1 0-5.8z"
      />
    </svg>
  )
}

function ChevronUpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M7.4 15.4 12 10.8l4.6 4.6L18 14l-6-6-6 6z" />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z" />
    </svg>
  )
}

function HolidayFoodRow({
  item,
  suggestionName,
  coverName,
  busy,
  onClaim,
  onClear,
  onVote,
  onAddPhotos,
  votersOpen,
  onToggleVoters,
}) {
  const name = item?.item_name || suggestionName
  const votes = item?.votes || []
  const photos = (item?.photos || []).filter(foodPhotoSrc)
  const covered = Boolean(item?.covered_by)
  const score = voteScore(votes)
  const myName = String(coverName || '').trim().toLowerCase()
  const mine = votes.find((v) => String(v.name || '').toLowerCase() === myName)
  const ups = votes.filter((v) => Number(v.value) === 1)
  const downs = votes.filter((v) => Number(v.value) === -1)

  return (
    <div className="rsvp-row holiday-food-row">
      <div className="holiday-food-copy">
        <strong>{name}</strong>
        <div className="meta">
          {covered
            ? `Covered by ${item.covered_by}`
            : item
              ? 'Still needed'
              : 'Not claimed yet'}
        </div>
        {photos.length > 0 && (
          <div className="holiday-food-thumbs">
            {photos.map((p, i) => (
              <img
                key={p.id || foodPhotoSrc(p) || i}
                src={foodPhotoSrc(p)}
                alt=""
              />
            ))}
          </div>
        )}
        {votersOpen && (
          <div className="holiday-food-voters">
            <div>
              <strong>Like</strong>
              {ups.length
                ? ups.map((v) => <span key={`up-${v.name}`}>{v.name}</span>)
                : <em>No likes yet</em>}
            </div>
            <div>
              <strong>Not for me</strong>
              {downs.length
                ? downs.map((v) => <span key={`down-${v.name}`}>{v.name}</span>)
                : <em>No down votes</em>}
            </div>
          </div>
        )}
      </div>
      <div className="holiday-food-actions">
        {covered ? (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={Boolean(busy)}
            onClick={onClear}
          >
            Clear
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-accent"
            disabled={Boolean(busy)}
            onClick={onClaim}
          >
            {busy === name || busy === item?.id ? 'Saving…' : "I'll cover"}
          </button>
        )}
        {covered && (
          <label
            className="food-icon-btn"
            title="Add a photo"
            aria-label="Add a photo"
          >
            <CameraIcon />
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              disabled={Boolean(busy) || photos.length >= 8}
              onChange={(e) => {
                onAddPhotos([...(e.target.files || [])])
                e.target.value = ''
              }}
            />
          </label>
        )}
        <div className="holiday-food-votes">
          <button
            type="button"
            className={`food-icon-btn${mine?.value === 1 ? ' is-on' : ''}`}
            title="I like this"
            aria-label="Vote up"
            disabled={Boolean(busy)}
            onClick={() => onVote(1)}
          >
            <ChevronUpIcon />
          </button>
          <button
            type="button"
            className="holiday-food-score"
            title="See who voted"
            onClick={onToggleVoters}
          >
            {score}
          </button>
          <button
            type="button"
            className={`food-icon-btn${mine?.value === -1 ? ' is-on' : ''}`}
            title="Not for me"
            aria-label="Vote down"
            disabled={Boolean(busy)}
            onClick={() => onVote(-1)}
          >
            <ChevronDownIcon />
          </button>
        </div>
      </div>
    </div>
  )
}

function FoodTab({
  hostedMeals,
  foodMealId,
  setFoodMealId,
  foodItems,
  defaultName,
  onRefresh,
}) {
  const [newItem, setNewItem] = useState('')
  const [coverName, setCoverName] = useState(defaultName || '')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [votersOpen, setVotersOpen] = useState('')

  useEffect(() => {
    if (defaultName) setCoverName((prev) => prev.trim() || defaultName)
  }, [defaultName])

  const activeMeal =
    hostedMeals.find((m) => m.id === foodMealId) || hostedMeals[0]

  const savedNames = new Set(
    (foodItems || []).map((it) => String(it.item_name || '').toLowerCase()),
  )
  const suggestions = DEFAULT_FOOD_SUGGESTIONS.filter(
    (name) => !savedNames.has(name.toLowerCase()),
  )

  async function claim(itemName, existingId) {
    const who = coverName.trim()
    if (!who) {
      setError('Enter your name to cover an item.')
      return
    }
    setBusy(itemName)
    setError('')
    try {
      if (existingId) {
        await updateHolidayFoodItem(existingId, { covered_by: who })
      } else {
        await saveHolidayFoodItem({
          meal_id: activeMeal.id,
          item_name: itemName,
          covered_by: who,
        })
      }
      await onRefresh(activeMeal.id)
    } catch (e) {
      setError(e.message || 'Could not update')
    } finally {
      setBusy('')
    }
  }

  async function addCustom(e) {
    e.preventDefault()
    const name = newItem.trim()
    if (!name) return
    await claim(name)
    setNewItem('')
  }

  async function clearCover(id) {
    setBusy(id)
    setError('')
    try {
      await updateHolidayFoodItem(id, { clear_cover: true })
      await onRefresh(activeMeal.id)
    } catch (e) {
      setError(e.message || 'Could not clear')
    } finally {
      setBusy('')
    }
  }

  async function ensureItem(item, itemName) {
    if (item?.id) return item
    const result = await saveHolidayFoodItem({
      meal_id: activeMeal.id,
      item_name: itemName,
      covered_by: '',
    })
    return result.item
  }

  async function voteOn(item, itemName, value) {
    const who = coverName.trim()
    if (!who) {
      setError('Enter your name to vote.')
      return
    }
    setBusy(item?.id || itemName)
    setError('')
    try {
      const saved = await ensureItem(item, itemName)
      await updateHolidayFoodItem(saved.id, { vote: { name: who, value } })
      await onRefresh(activeMeal.id)
    } catch (e) {
      setError(e.message || 'Could not vote')
    } finally {
      setBusy('')
    }
  }

  async function addPhotos(item, files) {
    if (!files?.length || !item?.id) return
    setBusy(item.id)
    setError('')
    try {
      const added = []
      for (const file of files) {
        if (added.length + (item.photos || []).length >= 8) break
        const url = await fileToFoodPhotoData(file)
        added.push({ id: crypto.randomUUID(), url, caption: '' })
      }
      if (added.length) {
        await updateHolidayFoodItem(item.id, { add_photos: added })
        await onRefresh(activeMeal.id)
      }
    } catch (e) {
      setError(e.message || 'Could not add photo')
    } finally {
      setBusy('')
    }
  }

  if (!hostedMeals.length) {
    return (
      <div className="panel">
        <h2>Food</h2>
        <div className="empty">No hosted meals yet.</div>
      </div>
    )
  }

  return (
    <div className="panel">
      <h2>Food by meal</h2>
      <p className="hint">
        Pick a day, claim what you&apos;ll bring, or add an item that isn&apos;t
        listed.
      </p>

      <MealCalendarNav
        meals={hostedMeals}
        selectedId={foodMealId || hostedMeals[0]?.id}
        onSelect={setFoodMealId}
      />

      {activeMeal && (
        <div className="holiday-food-selected">
          <MealSittingHeading meal={activeMeal} hostedMeals={hostedMeals} />
        </div>
      )}

      <div className="field">
        <label>Your name (for covering items)</label>
        <input
          type="text"
          value={coverName}
          onChange={(e) => setCoverName(e.target.value)}
          placeholder="Your name"
        />
      </div>

      {error && <div className="banner banner-err">{error}</div>}

      <div className="list">
        {(foodItems || []).map((it) => (
          <HolidayFoodRow
            key={it.id}
            item={it}
            coverName={coverName}
            busy={busy}
            onClaim={() => claim(it.item_name, it.id)}
            onClear={() => clearCover(it.id)}
            onVote={(value) => voteOn(it, it.item_name, value)}
            onAddPhotos={(files) => addPhotos(it, files)}
            votersOpen={votersOpen === it.id}
            onToggleVoters={() =>
              setVotersOpen((prev) => (prev === it.id ? '' : it.id))
            }
          />
        ))}
      </div>

      <form onSubmit={addCustom} style={{ marginTop: '1.1rem' }}>
        <div className="field">
          <label>Add another item</label>
          <div className="holiday-food-add">
            <input
              type="text"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder="e.g. Honey cake, soup…"
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={Boolean(busy) || !newItem.trim()}
            >
              Add &amp; cover
            </button>
          </div>
        </div>
      </form>

      {suggestions.length > 0 && (
        <>
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.05rem',
              margin: '1.1rem 0 0.55rem',
            }}
          >
            Suggested items
          </h3>
          <div className="list">
            {suggestions.map((name) => (
              <HolidayFoodRow
                key={name}
                suggestionName={name}
                coverName={coverName}
                busy={busy}
                onClaim={() => claim(name)}
                onVote={(value) => voteOn(null, name, value)}
                onAddPhotos={() => {}}
                votersOpen={votersOpen === name}
                onToggleVoters={() =>
                  setVotersOpen((prev) => (prev === name ? '' : name))
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function mealHalfKey(meal) {
  const id = String(meal?.id || '')
  const label = String(meal?.label || '')
  if (id.startsWith('sh-') || /second half/i.test(label)) return 'second'
  if (/first half/i.test(label)) return 'first'
  return 'all'
}

function shortMealName(meal) {
  const raw = String(meal?.label || '').replace(
    /^(First half|Second half)\s*[·•\-]\s*/i,
    '',
  )
  if (/^night\s*\d*$/i.test(raw)) return raw.replace(/night/i, 'Night')
  if (/^day\s*\d*$/i.test(raw)) return raw.replace(/day/i, 'Day')
  return raw || 'Meal'
}

function calendarDayParts(iso, fallback = '') {
  try {
    const d = new Date(`${iso}T12:00:00`)
    if (Number.isNaN(d.getTime())) throw new Error('bad date')
    return {
      dow: d.toLocaleDateString(undefined, { weekday: 'short' }),
      day: String(d.getDate()),
      month: d.toLocaleDateString(undefined, { month: 'short' }),
    }
  } catch {
    const bits = String(fallback).split(/[,\s]+/).filter(Boolean)
    return { dow: bits[0] || '', day: bits[bits.length - 1] || '', month: bits[1] || '' }
  }
}

function occasionForDate(iso) {
  return SUKKOT_5787_CALENDAR.days.find((d) => d.date === iso)?.note || ''
}

const SUKKOT_MEAL_OCCASIONS = {
  n1: 'Erev Sukkos',
  d1: 'Sukkos 1 / Shabbos',
  n2: 'Second night of Sukkos',
  d2: 'Sukkos 2',
  'sh-n1': 'Shemini Atzeres night',
  'sh-d1': 'Shemini Atzeres / Shabbos',
  'sh-n2': 'Simchas Torah night',
  'sh-d2': 'Simchas Torah',
}

function occasionNameForMeal(meal, holidayTitle) {
  const id = String(meal?.id || meal?.meal_id || '')
  if (SUKKOT_MEAL_OCCASIONS[id]) return SUKKOT_MEAL_OCCASIONS[id]
  return (
    occasionForDate(meal?.date) ||
    holidayTitle ||
    shortMealName(meal) ||
    'Holiday meal'
  )
}

function MealSittingHeading({ meal, hostedMeals, holidayTitle }) {
  const hosted =
    (hostedMeals || []).find((m) => m.id === (meal?.id || meal?.meal_id)) ||
    meal ||
    {}
  const period = mealPeriod(hosted.id || meal?.meal_id, hostedMeals)
  const occasion = occasionNameForMeal(hosted, holidayTitle)
  const sitting = period === 'night' ? 'Night' : period === 'day' ? 'Day' : ''
  const when = hosted.date_label || meal?.date_label || ''
  return (
    <span className="meal-sitting-head">
      <span className={`meal-cal-opt-icon ${period || 'day'}`}>
        {period === 'night' ? <NightIcon size={16} /> : <SunIcon size={16} />}
      </span>
      <span className="meal-sitting-copy">
        <strong>{occasion}</strong>
        <span className="meta">
          {[sitting, when].filter(Boolean).join(' · ')}
        </span>
      </span>
    </span>
  )
}

function groupMealsForCalendar(meals) {
  const halves = [
    { id: 'first', title: 'First half' },
    { id: 'second', title: 'Second half' },
    { id: 'all', title: '' },
  ]
  return halves
    .map((half) => {
      const inHalf = (meals || []).filter((m) => mealHalfKey(m) === half.id)
      const byDate = new Map()
      for (const m of inHalf) {
        const key = m.date || m.id
        if (!byDate.has(key)) byDate.set(key, [])
        byDate.get(key).push(m)
      }
      const days = [...byDate.entries()]
        .sort(([a], [b]) => String(a).localeCompare(String(b)))
        .map(([date, items]) => {
          const sorted = [...items].sort((a, b) => {
            const pa = mealPeriod(a.id, meals) === 'night' ? 1 : 0
            const pb = mealPeriod(b.id, meals) === 'night' ? 1 : 0
            return pa - pb
          })
          return { date, meals: sorted }
        })
      return { ...half, days }
    })
    .filter((half) => half.days.length)
}

function MealCalendarPicker({
  meals,
  selectedMeals,
  cantMakeIt,
  onToggle,
  onCantMakeIt,
}) {
  const groups = groupMealsForCalendar(meals)
  return (
    <div className="meal-cal">
      <label className={`meal-cal-skip${cantMakeIt ? ' is-on' : ''}`}>
        <input
          type="checkbox"
          checked={cantMakeIt}
          onChange={(e) => onCantMakeIt(e.target.checked)}
        />
        <span>
          <strong>Can&apos;t make it</strong>
          <em>Cancel after already RSVPing</em>
        </span>
      </label>

      {groups.map((group) => (
        <div key={group.id} className="meal-cal-half">
          {group.title && <h3>{group.title}</h3>}
          <div
            className="meal-cal-week"
            aria-label={group.title || 'Meal days'}
          >
            {group.days.map((day) => {
              const parts = calendarDayParts(
                day.date,
                day.meals[0]?.date_label || '',
              )
              const note = occasionForDate(day.date)
              const picked = day.meals.some((m) => selectedMeals.includes(m.id))
              const both = day.meals.length > 1
              return (
                <div
                  key={day.date}
                  className={`meal-cal-day${both ? ' has-both' : ''}${
                    picked && !cantMakeIt ? ' is-picked' : ''
                  }${cantMakeIt ? ' is-dim' : ''}`}
                >
                  <div className="meal-cal-day-head">
                    <div className="meal-cal-when">
                      <span className="meal-cal-dow">{parts.dow}</span>
                      <span className="meal-cal-num">{parts.day}</span>
                      <span className="meal-cal-mon">{parts.month}</span>
                    </div>
                    {note && <strong>{note}</strong>}
                  </div>
                  <div className="meal-cal-options">
                    {day.meals.map((m) => {
                      const period = mealPeriod(m.id, meals) || 'day'
                      const checked =
                        !cantMakeIt && selectedMeals.includes(m.id)
                      return (
                        <label
                          key={m.id}
                          className={`meal-cal-opt ${period}${
                            checked ? ' is-on' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={cantMakeIt}
                            onChange={() => onToggle(m.id)}
                          />
                          <span className={`meal-cal-opt-icon ${period}`}>
                            {period === 'night' ? (
                              <NightIcon size={16} />
                            ) : (
                              <SunIcon size={16} />
                            )}
                          </span>
                          <span className="meal-cal-opt-text">
                            {shortMealName(m)}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function MealCalendarNav({ meals, selectedId, onSelect }) {
  const groups = groupMealsForCalendar(meals)
  return (
    <div className="meal-cal meal-cal-nav">
      {groups.map((group) => (
        <div key={group.id} className="meal-cal-half">
          {group.title && <h3>{group.title}</h3>}
          <div
            className="meal-cal-week"
            aria-label={group.title || 'Meal days'}
          >
            {group.days.map((day) => {
              const parts = calendarDayParts(
                day.date,
                day.meals[0]?.date_label || '',
              )
              const note = occasionForDate(day.date)
              const both = day.meals.length > 1
              const picked = day.meals.some((m) => m.id === selectedId)
              return (
                <div
                  key={day.date}
                  className={`meal-cal-day${both ? ' has-both' : ''}${
                    picked ? ' is-picked' : ''
                  }`}
                >
                  <div className="meal-cal-day-head">
                    <div className="meal-cal-when">
                      <span className="meal-cal-dow">{parts.dow}</span>
                      <span className="meal-cal-num">{parts.day}</span>
                      <span className="meal-cal-mon">{parts.month}</span>
                    </div>
                    {note && <strong>{note}</strong>}
                  </div>
                  <div className="meal-cal-options">
                    {day.meals.map((m) => {
                      const period = mealPeriod(m.id, meals) || 'day'
                      const on = selectedId === m.id
                      return (
                        <button
                          key={m.id}
                          type="button"
                          className={`meal-cal-opt ${period}${on ? ' is-on' : ''}`}
                          aria-pressed={on}
                          onClick={() => onSelect(m.id)}
                        >
                          <span className="coming-meal-num">
                            {mealNumber(m.id, meals)}
                          </span>
                          <span className={`meal-cal-opt-icon ${period}`}>
                            {period === 'night' ? (
                              <NightIcon size={14} />
                            ) : (
                              <SunIcon size={14} />
                            )}
                          </span>
                          <span className="meal-cal-opt-text">
                            {period === 'night' ? 'Night' : 'Day'}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function HolidaySubmissionSummary({ rsvp, hostedMeals, addresses = [] }) {
  if (!rsvp) return null
  const declined = rsvp.coming === 'no' || !(rsvp.meals || []).length
  const coming = new Set(rsvp.meals || [])
  const help = rsvp.help || {}
  const addrById = Object.fromEntries((addresses || []).map((a) => [a.id, a]))
  const groups = [
    { id: 'first', title: 'First half' },
    { id: 'second', title: 'Second half' },
    { id: 'all', title: 'Your meals' },
  ]
    .map((g) => ({
      ...g,
      meals: hostedMeals.filter((m) => mealHalfKey(m) === g.id),
    }))
    .filter((g) => g.meals.length)

  return (
    <div className="holiday-summary">
      <div className="holiday-summary-who">
        <strong>{rsvp.full_name}</strong>
        {rsvp.phone && <div className="meta">{rsvp.phone}</div>}
        {declined && (
          <div className="banner banner-err" style={{ marginTop: '0.65rem' }}>
            Can&apos;t make it — you are not on the meal list.
          </div>
        )}
      </div>

      {groups.map((group) => (
        <div key={group.id} className="holiday-summary-group">
          {groups.length > 1 && <h3>{group.title}</h3>}
          <div className="holiday-summary-grid">
            {group.meals.map((m) => {
              const yes = coming.has(m.id)
              const extras = (rsvp.guests || []).filter((g) =>
                (g.meals || []).includes(m.id),
              )
              const guestCount = extras.reduce(
                (n, g) => n + Math.max(0, Number(g.count) || 0),
                0,
              )
              const guestNames = extras
                .map((g) => g.name)
                .filter(Boolean)
                .join(', ')
              const addr = addrById[m.id]
              return (
                <div
                  key={m.id}
                  className={`holiday-summary-card ${
                    yes ? 'is-coming' : 'is-out'
                  }`}
                >
                  <div className="holiday-summary-when">
                    {m.date_label || m.date || ''}
                  </div>
                  <strong>{m.label}</strong>
                  <div className={`holiday-summary-status ${yes ? 'yes' : 'no'}`}>
                    {yes ? 'You are coming' : 'Not this meal'}
                  </div>
                  {yes && (
                    <div className="meta">
                      {guestCount
                        ? `Guests: ${guestCount}${guestNames ? ` · ${guestNames}` : ''}`
                        : 'No extra guests'}
                    </div>
                  )}
                  {yes && addr?.host_name && (
                    <div className="meta">Host: {addr.host_name}</div>
                  )}
                  {yes && addr?.address && (
                    <div className="meta" style={{ whiteSpace: 'pre-wrap' }}>
                      {addr.address}
                    </div>
                  )}
                  {yes && addr?.notes && (
                    <div className="meta">{addr.notes}</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <div className="holiday-summary-help">
        <h3>Help</h3>
        <div className="holiday-summary-grid holiday-summary-help-grid">
          <div className="holiday-summary-card">
            <strong>Donate</strong>
            <div className="meta">
              {help.donate
                ? help.amount
                  ? `Yes · ${help.amount}`
                  : 'Yes'
                : 'No'}
            </div>
          </div>
          <div className="holiday-summary-card">
            <strong>Potluck</strong>
            <div className="meta">{help.potluck ? 'Yes' : 'No'}</div>
          </div>
          <div className="holiday-summary-card">
            <strong>Clean</strong>
            <div className="meta">{help.clean ? 'Yes' : 'No'}</div>
          </div>
        </div>
        {help.notes && (
          <div className="holiday-summary-notes">{help.notes}</div>
        )}
      </div>
    </div>
  )
}

export default function HolidayPage() {
  const { user } = useAuth()
  const remembered = loadRememberedForm()
  const [holiday, setHoliday] = useState(null)
  const [summary, setSummary] = useState(null)
  const [mainTab, setMainTab] = useState('form')
  const [step, setStep] = useState(STEPS.loading)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [addresses, setAddresses] = useState([])
  const [existing, setExisting] = useState(null)
  const [fullName, setFullName] = useState(
    remembered.fullName || user?.full_name || '',
  )
  const [phone, setPhone] = useState(remembered.phone || user?.phone || '')
  const [selectedMeals, setSelectedMeals] = useState([])
  const [cantMakeIt, setCantMakeIt] = useState(false)
  const [bringingGuests, setBringingGuests] = useState('No')
  const [guestByMeal, setGuestByMeal] = useState({})
  const [help, setHelp] = useState({
    donate: false,
    potluck: false,
    clean: false,
    amount: '',
    notes: '',
  })
  const [foodMealId, setFoodMealId] = useState(null)
  const [foodItems, setFoodItems] = useState([])

  const hostedMeals = useMemo(
    () => (holiday?.meals || []).filter((m) => m.hosted !== false),
    [holiday],
  )

  function applyRsvpToForm(rsvp, phoneFallback = '') {
    if (!rsvp) return
    setFullName(rsvp.full_name || '')
    setPhone(rsvp.phone || phoneFallback || '')
    const declined = rsvp.coming === 'no' || !(rsvp.meals || []).length
    setCantMakeIt(declined)
    setSelectedMeals(declined ? [] : [...(rsvp.meals || [])])
    const byMeal = {}
    let anyGuests = false
    for (const g of rsvp.guests || []) {
      for (const mid of g.meals || []) {
        anyGuests = true
        byMeal[mid] = {
          count: String(g.count ?? ''),
          names: g.name || '',
        }
      }
    }
    setBringingGuests(anyGuests ? 'Yes' : 'No')
    setGuestByMeal(byMeal)
    setHelp({
      donate: Boolean(rsvp.help?.donate),
      potluck: Boolean(rsvp.help?.potluck),
      clean: Boolean(rsvp.help?.clean),
      amount: rsvp.help?.amount || '',
      notes: rsvp.help?.notes || '',
    })
  }

  async function refreshBoard() {
    const board = await getHolidayRsvps()
    setSummary(board.summary || null)
    return board
  }

  async function refreshFood(mealId) {
    const id = mealId || foodMealId || hostedMeals[0]?.id
    if (!id) {
      setFoodItems([])
      return
    }
    const data = await getHolidayFood(id)
    setFoodItems(data.items || [])
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [h, board] = await Promise.all([
          getHolidayEvent(),
          getHolidayRsvps(),
        ])
        if (cancelled) return
        setHoliday(h)
        setSummary(board.summary || null)
        const firstMeal = (h?.meals || []).find((m) => m.hosted !== false)
        if (firstMeal) setFoodMealId(firstMeal.id)
        if (!h?.enabled) {
          setStep(STEPS.closed)
          return
        }
        const seedName =
          remembered.fullName || user?.full_name || fullName || ''
        const seedPhone = remembered.phone || user?.phone || phone || ''
        if (seedName.trim() || seedPhone.trim()) {
          try {
            const mine = await findMyHolidayRsvp({
              fullName: seedName,
              phone: seedPhone,
            })
            if (cancelled) return
            if (mine?.rsvp) {
              applyRsvpToForm(mine.rsvp, seedPhone)
              setAddresses(mine.addresses || [])
              setExisting(mine.rsvp)
              setStep(STEPS.returning)
              return
            }
          } catch {
            /* fall through to blank form */
          }
        }
        setStep(STEPS.meals)
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'Could not load holiday RSVP')
          setStep(STEPS.closed)
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!user) return
    setFullName((prev) => prev.trim() || user.full_name || '')
    setPhone((prev) => prev.trim() || user.phone || '')
  }, [user])

  useEffect(() => {
    if (!holiday?.enabled || !foodMealId) return
    let cancelled = false
    ;(async () => {
      try {
        const data = await getHolidayFood(foodMealId)
        if (!cancelled) setFoodItems(data.items || [])
      } catch {
        if (!cancelled) setFoodItems([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [foodMealId, holiday?.enabled])

  function toggleId(id, setList) {
    setCantMakeIt(false)
    setList((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function chooseCantMakeIt() {
    setCantMakeIt(true)
    setSelectedMeals([])
    setBringingGuests('No')
    setGuestByMeal({})
  }

  function setGuestField(mealId, field, value) {
    setGuestByMeal((prev) => ({
      ...prev,
      [mealId]: {
        count: prev[mealId]?.count ?? '',
        names: prev[mealId]?.names ?? '',
        ...prev[mealId],
        [field]: value,
      },
    }))
  }

  function copyGuestsFromMeal(fromMealId, { belowOnly = false } = {}) {
    const source = guestByMeal[fromMealId] || { count: '', names: '' }
    const fromIdx = hostedMeals.findIndex((m) => m.id === fromMealId)
    if (fromIdx < 0) return
    setGuestByMeal((prev) => {
      const next = { ...prev }
      hostedMeals.forEach((m, idx) => {
        if (m.id === fromMealId) return
        if (belowOnly && idx <= fromIdx) return
        next[m.id] = {
          count: source.count ?? '',
          names: source.names ?? '',
        }
      })
      return next
    })
  }

  function guestsPayload() {
    if (bringingGuests !== 'Yes') return []
    return hostedMeals
      .map((m) => {
        const g = guestByMeal[m.id] || {}
        const count = Math.max(0, Number(g.count) || 0)
        if (count < 1) return null
        return {
          name: String(g.names || '').trim() || 'Guests',
          count,
          meals: [m.id],
        }
      })
      .filter(Boolean)
  }

  function startEdit() {
    if (existing) applyRsvpToForm(existing, phone)
    setMainTab('form')
    setStep(STEPS.meals)
  }

  async function lookupOnIdentityBlur() {
    const nameVal = fullName.trim()
    const phoneVal = phone.trim()
    if (!nameVal && !phoneVal) return
    try {
      const mine = await findMyHolidayRsvp({
        fullName: nameVal,
        phone: phoneVal,
      })
      if (!mine?.rsvp) return
      // Don't clobber in-progress edits unless this is a fresh match
      if (existing?.id === mine.rsvp.id && selectedMeals.length > 0) return
      applyRsvpToForm(mine.rsvp, phoneVal)
      setAddresses(mine.addresses || [])
      setExisting(mine.rsvp)
    } catch {
      /* ignore */
    }
  }

  async function submitCantMakeIt() {
    if (!fullName.trim() || !phone.trim()) {
      setError('Please enter your name and phone.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const result = await submitHolidayRsvp({
        fullName: fullName.trim(),
        phone: phone.trim(),
        coming: 'no',
        cantMakeIt: true,
        meals: [],
        guests: [],
        help: {
          donate: false,
          potluck: false,
          clean: false,
          amount: '',
          notes: help.notes || '',
        },
      })
      saveRememberedForm({
        ...remembered,
        fullName: fullName.trim(),
        phone: phone.trim(),
      })
      setCantMakeIt(true)
      setSelectedMeals([])
      setAddresses(result.addresses || [])
      if (result.rsvp) setExisting(result.rsvp)
      setStep(STEPS.done)
      try {
        await refreshBoard()
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(e.message || 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  async function goGuests() {
    if (!fullName.trim() || !phone.trim()) {
      setError('Please enter your name and phone.')
      return
    }
    if (cantMakeIt) {
      await submitCantMakeIt()
      return
    }
    if (!selectedMeals.length) {
      setError('Pick at least one meal, or choose Can’t make it.')
      return
    }
    setError('')
    saveRememberedForm({
      ...remembered,
      fullName: fullName.trim(),
      phone: phone.trim(),
    })
    setGuestByMeal((prev) => {
      const next = { ...prev }
      for (const id of selectedMeals) {
        if (!next[id]) next[id] = { count: '', names: '' }
      }
      return next
    })
    setStep(STEPS.guests)
  }

  function goHelp() {
    if (bringingGuests === 'Yes') {
      const rows = guestsPayload()
      if (!rows.length) {
        setError(
          'Enter how many guests for at least one meal (leave other meals blank or 0).',
        )
        return
      }
      for (const m of hostedMeals) {
        const g = guestByMeal[m.id] || {}
        const count = Math.max(0, Number(g.count) || 0)
        if (count > 0 && !String(g.names || '').trim()) {
          setError(
            `Add guest name(s) for ${formatMealLabel(m)} (or set count to 0).`,
          )
          return
        }
      }
    }
    setError('')
    setStep(STEPS.help)
  }

  async function finish() {
    if (help.donate && !String(help.amount || '').trim()) {
      setError('Please enter how much you can donate.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const result = await submitHolidayRsvp({
        fullName: fullName.trim(),
        phone: phone.trim(),
        coming: 'yes',
        meals: selectedMeals,
        guests: guestsPayload(),
        help: {
          ...help,
          amount: String(help.amount || '').trim(),
        },
      })
      saveRememberedForm({
        ...remembered,
        fullName: fullName.trim(),
        phone: phone.trim(),
      })
      setAddresses(result.addresses || [])
      if (result.rsvp) setExisting(result.rsvp)
      setStep(STEPS.done)
      try {
        await refreshBoard()
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(e.message || 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  if (step === STEPS.loading) {
    return (
      <section className="hero">
        <h1>Holiday</h1>
        <p>Loading holiday RSVP…</p>
      </section>
    )
  }

  return (
    <>
      <section className="hero">
        <h1>{holiday?.title || 'Holiday'}</h1>
        <p>
          {holiday?.enabled
            ? 'RSVP for meals, see who is coming, and claim food for each day.'
            : 'Holiday RSVP opens when the host turns it on in Admin.'}
        </p>
      </section>

      {holiday?.enabled && (
        <div className="nav" style={{ marginBottom: '1rem' }}>
          {MAIN_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`btn ${mainTab === t.id ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setMainTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {error && mainTab === 'form' && (
        <div className="banner banner-err">{error}</div>
      )}

      {mainTab === 'coming' && holiday?.enabled && (
        <AttendanceTab
          summary={summary}
          hostedMeals={hostedMeals}
          holiday={holiday}
        />
      )}

      {mainTab === 'calendar' && holiday?.enabled && (
        <CalendarTab
          holiday={holiday}
          summary={summary}
          hostedMeals={hostedMeals}
        />
      )}

      {mainTab === 'food' && holiday?.enabled && (
        <FoodTab
          hostedMeals={hostedMeals}
          foodMealId={foodMealId || hostedMeals[0]?.id}
          setFoodMealId={setFoodMealId}
          foodItems={foodItems}
          defaultName={fullName}
          onRefresh={refreshFood}
        />
      )}

      {mainTab === 'form' && (
        <>
          {step === STEPS.closed && (
            <div className="panel">
              <h2>
                {holiday?.ended
                  ? `${holiday.title || 'This holiday'} has ended`
                  : 'No holiday RSVP open'}
              </h2>
              <p className="hint">
                {holiday?.ended
                  ? 'RSVPs reset after each holiday. The host will open the next one (for Sukkot: first half, second half, or both) in Admin.'
                  : 'The regular Shabbos form is still available. When the host enables a holiday, you will RSVP for night and day meals here.'}
              </p>
              <div className="actions">
                <Link className="btn btn-primary" to="/">
                  Go to Shabbos form
                </Link>
              </div>
            </div>
          )}

          {step === STEPS.returning && (
            <div className="panel">
              <h2>Welcome back</h2>
              <p className="hint">
                We already have your holiday RSVP. Need to change meals, guests,
                or help?
              </p>
              <HolidaySubmissionSummary
                rsvp={existing}
                hostedMeals={hostedMeals}
                addresses={addresses}
              />
              <div className="actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setStep(STEPS.all_set)}
                >
                  No, I&apos;m all set
                </button>
                <button
                  type="button"
                  className="btn btn-accent"
                  onClick={() => setMainTab('coming')}
                >
                  See who&apos;s coming
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={startEdit}
                >
                  Yes, I need to change it
                </button>
                {existing?.coming !== 'no' && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={saving}
                    onClick={submitCantMakeIt}
                  >
                    {saving ? 'Saving…' : "Can't make it"}
                  </button>
                )}
              </div>
            </div>
          )}

          {step === STEPS.all_set && (
            <div className="panel">
              <div
                className={`banner ${
                  existing?.coming === 'no' ? 'banner-err' : 'banner-ok'
                }`}
              >
                {existing?.coming === 'no'
                  ? "You're marked as can't make it."
                  : 'Your holiday RSVP is on file.'}
              </div>
              <HolidaySubmissionSummary
                rsvp={existing}
                hostedMeals={hostedMeals}
                addresses={addresses}
              />
              {addresses.length === 0 && (
                <p className="hint">
                  Host names and addresses will show on each meal box once the
                  host adds them in Admin.
                </p>
              )}
              <div className="actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={startEdit}
                >
                  Change my RSVP
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setMainTab('coming')}
                >
                  See who&apos;s coming
                </button>
              </div>
            </div>
          )}

          {step === STEPS.meals && (
            <div className="panel">
              <h2>{existing ? 'Change your meals' : 'Your meals'}</h2>
              <p className="hint">
                {existing
                  ? 'Update any meal, then continue through guests and help to save.'
                  : 'Step 1 of 3 — which night / day meals do you need?'}
              </p>
              {existing && (
                <div className="banner banner-ok" style={{ marginBottom: '1rem' }}>
                  Editing your saved holiday RSVP — your previous answers are
                  filled in below.
                </div>
              )}
              <div className="field">
                <label>
                  Your full name <span className="req">*</span>
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  onBlur={lookupOnIdentityBlur}
                  autoComplete="name"
                />
              </div>
              <div className="field">
                <label>
                  Phone <span className="req">*</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={lookupOnIdentityBlur}
                  autoComplete="tel"
                />
              </div>
              <div className="field">
                <label>
                  Meals <span className="req">*</span>
                </label>
                <MealCalendarPicker
                  meals={hostedMeals}
                  selectedMeals={selectedMeals}
                  cantMakeIt={cantMakeIt}
                  onToggle={(id) => toggleId(id, setSelectedMeals)}
                  onCantMakeIt={(on) => {
                    if (on) chooseCantMakeIt()
                    else setCantMakeIt(false)
                  }}
                />
                <p className="hint" style={{ marginTop: '0.55rem' }}>
                  Sun is day / lunch. Moon is night / dinner. Saturday boxes
                  hold both sittings.
                </p>
              </div>
              {!hostedMeals.length && (
                <div className="empty">No hosted meals are set up yet.</div>
              )}
              <div className="actions">
                {existing && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setStep(STEPS.returning)}
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={goGuests}
                  disabled={saving}
                >
                  {saving
                    ? 'Saving…'
                    : cantMakeIt
                      ? 'Save — can’t make it'
                      : 'Continue'}
                </button>
              </div>
            </div>
          )}

          {step === STEPS.guests && (
            <div className="panel">
              <h2>Guests per meal</h2>
              <p className="hint">
                Step 2 of 3 — for each date, how many guests and their names.
                Leave a meal at 0 if nobody extra is coming that meal.
              </p>
              <div className="field">
                <label>Are you bringing guests to any meal?</label>
                <div className="choices">
                  {['No', 'Yes'].map((v) => (
                    <label className="choice" key={v}>
                      <input
                        type="radio"
                        name="bringingGuests"
                        checked={bringingGuests === v}
                        onChange={() => setBringingGuests(v)}
                      />
                      <span>{v}</span>
                    </label>
                  ))}
                </div>
              </div>
              {bringingGuests === 'Yes' && (
                <div className="holiday-guest-meals">
                  {hostedMeals[0] && (
                    <div className="actions" style={{ marginBottom: '0.25rem' }}>
                      <button
                        type="button"
                        className="btn btn-accent"
                        onClick={() => copyGuestsFromMeal(hostedMeals[0].id)}
                      >
                        Copy first meal to all days
                      </button>
                    </div>
                  )}
                  {hostedMeals.map((m, idx) => {
                    const g = guestByMeal[m.id] || { count: '', names: '' }
                    const hasBelow = idx < hostedMeals.length - 1
                    return (
                      <div className="holiday-guest-meal" key={m.id}>
                        <div className="holiday-guest-meal-head">
                          <strong>{formatMealLabel(m)}</strong>
                          {hasBelow && (
                            <button
                              type="button"
                              className="btn btn-ghost holiday-copy-btn"
                              onClick={() =>
                                copyGuestsFromMeal(m.id, { belowOnly: true })
                              }
                            >
                              Copy to all below
                            </button>
                          )}
                        </div>
                        <div className="field" style={{ marginTop: '0.65rem' }}>
                          <label>How many guests?</label>
                          <input
                            type="number"
                            min="0"
                            inputMode="numeric"
                            value={g.count}
                            onChange={(e) =>
                              setGuestField(m.id, 'count', e.target.value)
                            }
                            placeholder="0"
                          />
                        </div>
                        <div className="field" style={{ marginBottom: 0 }}>
                          <label>
                            Guest name(s)
                            {Number(g.count) > 0 ? (
                              <>
                                {' '}
                                <span className="req">*</span>
                              </>
                            ) : null}
                          </label>
                          <input
                            type="text"
                            value={g.names}
                            onChange={(e) =>
                              setGuestField(m.id, 'names', e.target.value)
                            }
                            placeholder="e.g. Sarah Cohen, Dovid Levy"
                            disabled={!g.count || Number(g.count) < 1}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setStep(STEPS.meals)}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={goHelp}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === STEPS.help && (
            <div className="panel">
              <h2>Help with Yom Tov</h2>
              <p className="hint">Step 3 of 3 — donation, potluck, or cleanup</p>
              <div
                className="banner banner-ok"
                style={{ whiteSpace: 'pre-wrap' }}
              >
                {holiday?.statement ||
                  'Yom Tov is costly and time-consuming to host. Please help with a donation, potluck, or cleanup if you can.'}
              </div>
              <div className="field">
                <label>How can you help?</label>
                <div className="choices">
                  <label className="choice">
                    <input
                      type="checkbox"
                      checked={help.donate}
                      onChange={(e) =>
                        setHelp((h) => ({
                          ...h,
                          donate: e.target.checked,
                          amount: e.target.checked ? h.amount : '',
                        }))
                      }
                    />
                    <span>I can donate / contribute money</span>
                  </label>
                  <label className="choice">
                    <input
                      type="checkbox"
                      checked={help.potluck}
                      onChange={(e) =>
                        setHelp((h) => ({ ...h, potluck: e.target.checked }))
                      }
                    />
                    <span>I will bring a potluck dish</span>
                  </label>
                  <label className="choice">
                    <input
                      type="checkbox"
                      checked={help.clean}
                      onChange={(e) =>
                        setHelp((h) => ({ ...h, clean: e.target.checked }))
                      }
                    />
                    <span>I will help clean</span>
                  </label>
                </div>
              </div>
              {help.donate && (
                <div className="field">
                  <label>
                    How much can you donate? <span className="req">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={help.amount}
                    onChange={(e) =>
                      setHelp((h) => ({ ...h, amount: e.target.value }))
                    }
                    placeholder="e.g. $36"
                  />
                </div>
              )}
              {help.donate && String(help.amount || '').trim() && (
                <PaymentBlock />
              )}
              <div className="field">
                <label>Notes (optional)</label>
                <textarea
                  value={help.notes}
                  onChange={(e) =>
                    setHelp((h) => ({ ...h, notes: e.target.value }))
                  }
                  placeholder="What you might bring, timing…"
                />
              </div>
              <div className="actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setStep(STEPS.guests)}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={saving}
                  onClick={finish}
                >
                  {saving
                    ? 'Saving…'
                    : existing
                      ? 'Update holiday RSVP'
                      : 'Submit holiday RSVP'}
                </button>
              </div>
            </div>
          )}

          {step === STEPS.done && (
            <div className="panel">
              <div
                className={`banner ${
                  existing?.coming === 'no' ? 'banner-err' : 'banner-ok'
                }`}
              >
                {existing?.coming === 'no'
                  ? "Saved — you can't make it."
                  : existing
                    ? 'Your holiday RSVP was updated.'
                    : "You're on the holiday list."}
              </div>
              <HolidaySubmissionSummary
                rsvp={existing}
                hostedMeals={hostedMeals}
                addresses={addresses}
              />
              {addresses.length === 0 && (
                <p className="hint">
                  Host names and addresses will show on each meal box once the
                  host adds them in Admin.
                </p>
              )}
              <div className="actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={startEdit}
                >
                  Change my RSVP
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setMainTab('coming')}
                >
                  See who&apos;s coming
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}
