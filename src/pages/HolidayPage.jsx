import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getHolidayEvent,
  getHolidayRsvps,
  submitHolidayRsvp,
} from '../lib/api'
import { HOST_PAYMENT } from '../lib/formConfig'
import { formatMealLabel } from '../lib/jewishHolidays'
import { loadRememberedForm, saveRememberedForm } from '../lib/localProfile'
import { useAuth } from '../lib/AuthContext'

const STEPS = {
  loading: 'loading',
  closed: 'closed',
  meals: 'meals',
  guests: 'guests',
  help: 'help',
  done: 'done',
}

function PaymentBlock() {
  return (
    <div className="holiday-pay">
      <strong>Send a donation here</strong>
      <p className="hint" style={{ marginBottom: '0.5rem' }}>
        {HOST_PAYMENT.note}
      </p>
      {HOST_PAYMENT.zelle && (
        <div className="meta">Zelle: {HOST_PAYMENT.zelle}</div>
      )}
      {HOST_PAYMENT.venmo && (
        <div className="meta">Venmo: {HOST_PAYMENT.venmo}</div>
      )}
      {HOST_PAYMENT.paypal && (
        <div className="meta">PayPal: {HOST_PAYMENT.paypal}</div>
      )}
    </div>
  )
}

function WhosComing({ summary }) {
  const meals = summary?.meals || []
  if (!meals.length) {
    return <div className="empty">No meal counts yet.</div>
  }
  return (
    <div className="list">
      {meals.map((m) => (
        <div className="rsvp-row" key={m.meal_id}>
          <strong>
            {m.label}
            {m.date_label ? ` · ${m.date_label}` : ''}
          </strong>
          <div className="meta">
            {m.total} seat{m.total === 1 ? '' : 's'} ({m.self_count} RSVP
            {m.self_count === 1 ? '' : 's'}
            {m.guest_count ? ` + ${m.guest_count} guest seats` : ''})
          </div>
          {m.people?.length > 0 && (
            <div className="tags" style={{ marginTop: '0.35rem' }}>
              {m.people.slice(0, 12).map((p, i) => (
                <span className="tag" key={`${p.name}-${i}`}>
                  {p.kind === 'guest'
                    ? `${p.name}${p.guests > 1 ? ` ×${p.guests}` : ''} (with ${p.with})`
                    : p.name}
                </span>
              ))}
              {m.people.length > 12 && (
                <span className="tag">+{m.people.length - 12} more</span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default function HolidayPage() {
  const { user } = useAuth()
  const remembered = loadRememberedForm()
  const [holiday, setHoliday] = useState(null)
  const [summary, setSummary] = useState(null)
  const [step, setStep] = useState(STEPS.loading)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [addresses, setAddresses] = useState([])
  const [fullName, setFullName] = useState(
    remembered.fullName || user?.full_name || '',
  )
  const [phone, setPhone] = useState(remembered.phone || user?.phone || '')
  const [selectedMeals, setSelectedMeals] = useState([])
  const [bringingGuests, setBringingGuests] = useState('No')
  const [guestName, setGuestName] = useState('')
  const [guestCount, setGuestCount] = useState('1')
  const [guestMeals, setGuestMeals] = useState([])
  const [help, setHelp] = useState({
    donate: false,
    potluck: false,
    clean: false,
    notes: '',
  })

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
        setStep(h?.enabled ? STEPS.meals : STEPS.closed)
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
  }, [])

  useEffect(() => {
    if (!user) return
    setFullName((prev) => prev.trim() || user.full_name || '')
    setPhone((prev) => prev.trim() || user.phone || '')
  }, [user])

  const hostedMeals = useMemo(
    () => (holiday?.meals || []).filter((m) => m.hosted !== false),
    [holiday],
  )

  function toggleId(id, setList) {
    setList((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function goGuests() {
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
    setGuestMeals((prev) => (prev.length ? prev : [...selectedMeals]))
    setStep(STEPS.guests)
  }

  function goHelp() {
    if (bringingGuests === 'Yes') {
      const count = Number(guestCount)
      if (!Number.isFinite(count) || count < 1) {
        setError('How many guests are you bringing?')
        return
      }
      if (!guestName.trim()) {
        setError('Please add a name for your guest(s).')
        return
      }
      if (!guestMeals.length) {
        setError('Which meals do your guests need?')
        return
      }
    }
    setError('')
    setStep(STEPS.help)
  }

  async function finish() {
    setSaving(true)
    setError('')
    try {
      const guests =
        bringingGuests === 'Yes'
          ? [
              {
                name: guestName.trim(),
                count: Number(guestCount) || 1,
                meals: guestMeals,
              },
            ]
          : []
      const result = await submitHolidayRsvp({
        fullName: fullName.trim(),
        phone: phone.trim(),
        meals: selectedMeals,
        guests,
        help,
      })
      saveRememberedForm({
        ...remembered,
        fullName: fullName.trim(),
        phone: phone.trim(),
      })
      setAddresses(result.addresses || [])
      setStep(STEPS.done)
      try {
        const board = await getHolidayRsvps()
        setSummary(board.summary || null)
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
            ? 'Tell us which meals you need, add guests, and help make Yom Tov possible.'
            : 'Holiday RSVP opens when the host turns it on in Admin.'}
        </p>
      </section>

      {error && <div className="banner banner-err">{error}</div>}

      {step === STEPS.closed && (
        <div className="panel">
          <h2>No holiday RSVP open</h2>
          <p className="hint">
            The regular Shabbos form is still available. When the host enables a
            holiday (like Rosh Hashanah), you&apos;ll RSVP for night and day
            meals here.
          </p>
          <div className="actions">
            <Link className="btn btn-primary" to="/">
              Go to Shabbos form
            </Link>
          </div>
        </div>
      )}

      {step === STEPS.meals && (
        <div className="panel">
          <h2>Your meals</h2>
          <p className="hint">
            Step 1 of 3 — which night / day meals do you need?
          </p>
          <div className="field">
            <label>
              Your full name <span className="req">*</span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
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
            <button type="button" className="btn btn-primary" onClick={goGuests}>
              Continue
            </button>
          </div>
        </div>
      )}

      {step === STEPS.guests && (
        <div className="panel">
          <h2>Guests</h2>
          <p className="hint">
            Step 2 of 3 — guest name, how many, and which meals they need.
          </p>
          <div className="field">
            <label>Are you bringing guests?</label>
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
            <>
              <div className="field">
                <label>
                  Guest name(s) <span className="req">*</span>
                </label>
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="e.g. Sarah & family"
                />
              </div>
              <div className="field">
                <label>
                  How many guests? <span className="req">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={guestCount}
                  onChange={(e) => setGuestCount(e.target.value)}
                />
              </div>
              <div className="field">
                <label>
                  Which meals do they need? <span className="req">*</span>
                </label>
                <div className="choices">
                  {hostedMeals.map((m) => (
                    <label className="choice" key={m.id}>
                      <input
                        type="checkbox"
                        checked={guestMeals.includes(m.id)}
                        onChange={() => toggleId(m.id, setGuestMeals)}
                      />
                      <span>{formatMealLabel(m)}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
          <div className="actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStep(STEPS.meals)}
            >
              Back
            </button>
            <button type="button" className="btn btn-primary" onClick={goHelp}>
              Continue
            </button>
          </div>
        </div>
      )}

      {step === STEPS.help && (
        <div className="panel">
          <h2>Help with Yom Tov</h2>
          <p className="hint">Step 3 of 3 — donation, potluck, or cleanup</p>
          <div className="banner banner-ok" style={{ whiteSpace: 'pre-wrap' }}>
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
                    setHelp((h) => ({ ...h, donate: e.target.checked }))
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
          {help.donate && <PaymentBlock />}
          <div className="field">
            <label>Notes (optional)</label>
            <textarea
              value={help.notes}
              onChange={(e) =>
                setHelp((h) => ({ ...h, notes: e.target.value }))
              }
              placeholder="What you might bring, amount, timing…"
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
              {saving ? 'Saving…' : 'Submit holiday RSVP'}
            </button>
          </div>
        </div>
      )}

      {step === STEPS.done && (
        <div className="panel">
          <div className="banner banner-ok">You&apos;re on the holiday list.</div>
          <h2>Addresses & hosts</h2>
          {addresses.length === 0 ? (
            <p className="hint">
              Addresses will show here once the host adds them in Admin. Your
              meal choices are saved.
            </p>
          ) : (
            <div className="list">
              {addresses.map((a) => (
                <div className="rsvp-row" key={a.id}>
                  <strong>{formatMealLabel(a)}</strong>
                  {a.host_name && (
                    <div className="meta">Host: {a.host_name}</div>
                  )}
                  {a.address && (
                    <div className="meta" style={{ whiteSpace: 'pre-wrap' }}>
                      {a.address}
                    </div>
                  )}
                  {a.notes && <div className="meta">{a.notes}</div>}
                </div>
              ))}
            </div>
          )}
          <div className="actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setSelectedMeals([])
                setBringingGuests('No')
                setGuestName('')
                setGuestCount('1')
                setGuestMeals([])
                setHelp({
                  donate: false,
                  potluck: false,
                  clean: false,
                  notes: '',
                })
                setAddresses([])
                setStep(STEPS.meals)
              }}
            >
              Edit / submit again
            </button>
            <Link className="btn btn-primary" to="/board">
              This week (Shabbos)
            </Link>
          </div>
        </div>
      )}

      {holiday?.enabled && (
        <div className="panel" style={{ marginTop: '1rem' }}>
          <h2>Who&apos;s coming (by meal)</h2>
          <p className="hint">Public headcounts — phones stay private.</p>
          <WhosComing summary={summary} />
        </div>
      )}
    </>
  )
}
