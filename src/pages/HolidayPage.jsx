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
import { HOST_PAYMENT } from '../lib/formConfig'
import { formatMealLabel } from '../lib/jewishHolidays'
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
    { date: '2026-09-25', label: 'Fri 25', kind: 'yomtov', note: 'Erev Sukkos', mealIds: ['n1'] },
    { date: '2026-09-26', label: 'Sat 26', kind: 'yomtov', note: 'Sukkos 1 / Shabbos', mealIds: ['d1', 'n2'] },
    { date: '2026-09-27', label: 'Sun 27', kind: 'yomtov', note: 'Sukkos 2', mealIds: ['d2'] },
    { date: '2026-09-28', label: 'Mon 28', kind: 'chol', note: 'Chol Hamoed', mealIds: [] },
    { date: '2026-09-29', label: 'Tue 29', kind: 'chol', note: 'Chol Hamoed', mealIds: [] },
    { date: '2026-09-30', label: 'Wed 30', kind: 'chol', note: 'Chol Hamoed', mealIds: [] },
    { date: '2026-10-01', label: 'Thu 1', kind: 'chol', note: 'Chol Hamoed', mealIds: [] },
    { date: '2026-10-02', label: 'Fri 2', kind: 'yomtov', note: 'Hoshana Rabbah / SA night', mealIds: ['sh-n1'] },
    { date: '2026-10-03', label: 'Sat 3', kind: 'yomtov', note: 'Shemini Atzeres / ST night', mealIds: ['sh-d1', 'sh-n2'] },
    { date: '2026-10-04', label: 'Sun 4', kind: 'yomtov', note: 'Simchas Torah', mealIds: ['sh-d2'] },
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

function dayCounts(day, summary, hostedMeals) {
  const ids = new Set(
    day.mealIds ||
      (hostedMeals || [])
        .filter((m) => m.date === day.date)
        .map((m) => m.id),
  )
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

function CalendarTab({ holiday, summary, hostedMeals }) {
  const showSukkot =
    String(holiday?.holiday_id || '').includes('sukkot') ||
    /sukko/i.test(holiday?.title || '')
  const cal = showSukkot ? SUKKOT_5787_CALENDAR : null

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
        Day counts are unique people (same as Who&apos;s coming). Lunch and
        dinner on the same date are not added together.
      </p>

      <div className="holiday-cal-strip" aria-label="Sukkos calendar">
        {cal.days.map((d) => {
          const counts = dayCounts(d, summary, hostedMeals)
          const hasMeals = (d.mealIds || []).length > 0
          return (
            <div
              key={d.date}
              className={`holiday-summary-card holiday-cal-card ${
                d.kind === 'yomtov' && hasMeals ? 'is-coming' : 'is-out'
              }`}
            >
              <div className="holiday-summary-when">{d.label}</div>
              <strong>{d.note}</strong>
              <CalendarCounts {...counts} />
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
        Times are for Brooklyn, NY. Light before the listed time on Friday.
        Saturday night is after Shabbos.
      </p>
    </div>
  )
}

function AttendanceTab({ summary, hostedMeals }) {
  const people = summary?.people || []
  const totals = summary?.totals || { number: 0, guests: 0, total: 0 }
  const meals = summary?.meals || []

  return (
    <div className="panel">
      <h2>Who&apos;s coming</h2>
      <p className="hint">
        Guests = most extras at any one meal for that person. Meal breakdown
        below shows exact seats per night/day.
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
                    {(p.meals || [])
                      .map(
                        (id) =>
                          hostedMeals.find((m) => m.id === id)?.label || id,
                      )
                      .join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
            <strong>
              {m.label}
              {m.date_label ? ` · ${m.date_label}` : ''}
            </strong>
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

      <div className="nav holiday-food-meal-nav" style={{ marginBottom: '1rem' }}>
        {hostedMeals.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`btn ${
              (foodMealId || hostedMeals[0]?.id) === m.id
                ? 'btn-primary'
                : 'btn-ghost'
            }`}
            onClick={() => setFoodMealId(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="meta" style={{ marginBottom: '0.75rem' }}>
        {activeMeal ? formatMealLabel(activeMeal) : ''}
      </div>

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
          <div className="rsvp-row holiday-food-row" key={it.id}>
            <div>
              <strong>{it.item_name}</strong>
              <div className="meta">
                {it.covered_by
                  ? `Covered by ${it.covered_by}`
                  : 'Still needed'}
              </div>
            </div>
            <div className="holiday-food-actions">
              {!it.covered_by ? (
                <button
                  type="button"
                  className="btn btn-accent"
                  disabled={Boolean(busy)}
                  onClick={() => claim(it.item_name, it.id)}
                >
                  {busy === it.item_name || busy === it.id
                    ? 'Saving…'
                    : "I'll cover"}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={Boolean(busy)}
                  onClick={() => clearCover(it.id)}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

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
              <div className="rsvp-row holiday-food-row" key={name}>
                <div>
                  <strong>{name}</strong>
                  <div className="meta">Not claimed yet</div>
                </div>
                <button
                  type="button"
                  className="btn btn-accent"
                  disabled={Boolean(busy)}
                  onClick={() => claim(name)}
                >
                  {busy === name ? 'Saving…' : "I'll cover"}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

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

function HolidaySubmissionSummary({ rsvp, hostedMeals, addresses = [] }) {
  if (!rsvp) return null
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
    setSelectedMeals([...(rsvp.meals || [])])
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
    setList((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
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

  async function goGuests() {
    if (!fullName.trim() || !phone.trim()) {
      setError('Please enter your name and phone.')
      return
    }
    if (!selectedMeals.length) {
      setError('Pick at least one meal you need (night or day).')
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
        <AttendanceTab summary={summary} hostedMeals={hostedMeals} />
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
              </div>
            </div>
          )}

          {step === STEPS.all_set && (
            <div className="panel">
              <div className="banner banner-ok">
                Your holiday RSVP is on file.
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
                <div className="choices">
                  {hostedMeals.map((m) => (
                    <label className="choice" key={m.id}>
                      <input
                        type="checkbox"
                        checked={selectedMeals.includes(m.id)}
                        onChange={() => toggleId(m.id, setSelectedMeals)}
                      />
                      <span>{formatMealLabel(m)}</span>
                    </label>
                  ))}
                </div>
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
                >
                  Continue
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
              <div className="banner banner-ok">
                {existing
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
