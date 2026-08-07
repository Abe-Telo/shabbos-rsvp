import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { comingLabel, findMyRsvpThisWeek, submitRsvp } from '../lib/api'
import {
  COMING_OPTIONS,
  FEEDBACK_OPTIONS,
  FOOD_LIKE_OPTIONS,
  foodIconFor,
  GUEST_FILL_OPTIONS,
  HOST_PAYMENT,
  MEAL_STYLE_OPTIONS,
  SPONSORSHIP_OPTIONS,
  mealStyleLabel,
} from '../lib/formConfig'
import {
  formForNewWeek,
  loadRememberedForm,
  saveRememberedForm,
} from '../lib/localProfile'

const STEPS = {
  checking: 'checking',
  returning: 'returning',
  all_set: 'all_set',
  basics: 'basics',
  prefs: 'prefs',
  guests: 'guests',
  newcomer: 'newcomer',
  probably: 'probably',
  social: 'social',
  unsure: 'unsure',
  declined: 'declined',
  sponsorship: 'sponsorship',
  sponsor_only: 'sponsor_only',
  feedback: 'feedback',
  done: 'done',
}

function nextFromComing(coming) {
  return COMING_OPTIONS.find((o) => o.value === coming)?.next || 'prefs'
}

function SubmissionSummary({ form }) {
  return (
    <div className="list" style={{ marginTop: '0.75rem' }}>
      <div className="rsvp-row">
        <strong>{form.fullName || '—'}</strong>
        <div className="meta">
          {comingLabel(form.coming)}
          {form.phone ? ` · ${form.phone}` : ''}
        </div>
        {form.mealStyle && (
          <div className="meta">Meal: {mealStyleLabel(form.mealStyle)}</div>
        )}
        {form.bringingDish && (
          <div className="meta">Bringing: {form.bringingDish}</div>
        )}
        {form.foodLikes?.length > 0 && (
          <div className="tags">
            {form.foodLikes.map((f) => (
              <span className="tag" key={f}>
                <span className="food-icon" aria-hidden="true">
                  {foodIconFor(f)}
                </span>{' '}
                {f}
              </span>
            ))}
          </div>
        )}
        {form.guestNames && (
          <div className="meta">Guests: {form.guestNames}</div>
        )}
        {form.guestCount && (
          <div className="meta">Guest count: {form.guestCount}</div>
        )}
        {form.knowByWhen && (
          <div className="meta">Will know by: {form.knowByWhen}</div>
        )}
        {form.socialArrivalTime && (
          <div className="meta">Arrival: {form.socialArrivalTime}</div>
        )}
        {form.sponsorship?.length > 0 && (
          <div className="meta">
            Sponsorship noted (private): {form.sponsorship.join(', ')}
          </div>
        )}
      </div>
    </div>
  )
}

function MealPrefsFields({ form, setField, toggleArray }) {
  return (
    <>
      <div className="field">
        <label>
          Do you prefer potluck or host cook? <span className="req">*</span>
        </label>
        <div className="choices">
          {MEAL_STYLE_OPTIONS.map((opt) => (
            <label className="choice" key={opt.value}>
              <input
                type="radio"
                name="mealStyle"
                checked={form.mealStyle === opt.value}
                onChange={() => setField('mealStyle', opt.value)}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {form.mealStyle === 'other' && (
        <div className="field">
          <label>Please explain</label>
          <input
            type="text"
            value={form.mealStyleOther}
            onChange={(e) => setField('mealStyleOther', e.target.value)}
          />
        </div>
      )}

      <div className="field">
        <label>What do you like to eat? Choose only what you would eat.</label>
        <div className="checkbox-grid">
          {FOOD_LIKE_OPTIONS.map((item) => (
            <label className="choice choice-food" key={item.label}>
              <input
                type="checkbox"
                checked={form.foodLikes.includes(item.label)}
                onChange={() => toggleArray('foodLikes', item.label)}
              />
              <span className="food-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </label>
          ))}
        </div>
      </div>

      {form.foodLikes.includes('Other') && (
        <div className="field">
          <label>Other foods you like</label>
          <input
            type="text"
            value={form.foodLikesOther}
            onChange={(e) => setField('foodLikesOther', e.target.value)}
          />
        </div>
      )}

      <div className="field">
        <label>What are you bringing this week?</label>
        <input
          type="text"
          value={form.bringingDish}
          onChange={(e) => setField('bringingDish', e.target.value)}
          placeholder="e.g. Flo rice, challah, salad…"
        />
        <p className="hint" style={{ marginTop: '0.4rem', marginBottom: 0 }}>
          Shows on the public “Food this week” list.
        </p>
      </div>
    </>
  )
}

function PaymentInfo() {
  return (
    <div className="panel" style={{ marginBottom: '1rem', boxShadow: 'none' }}>
      <h2 style={{ fontSize: '1.1rem' }}>Send sponsorship here</h2>
      <p className="hint">{HOST_PAYMENT.note}</p>
      <div className="list">
        {HOST_PAYMENT.zelle && (
          <div className="rsvp-row">
            <strong>Zelle</strong>
            <div className="meta">{HOST_PAYMENT.zelle}</div>
          </div>
        )}
        {HOST_PAYMENT.venmo && (
          <div className="rsvp-row">
            <strong>Venmo</strong>
            <div className="meta">{HOST_PAYMENT.venmo}</div>
          </div>
        )}
        {HOST_PAYMENT.paypal && (
          <div className="rsvp-row">
            <strong>PayPal</strong>
            <div className="meta">{HOST_PAYMENT.paypal}</div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function FormPage() {
  const rememberedSeed = loadRememberedForm()
  const [form, setForm] = useState(rememberedSeed)
  const [step, setStep] = useState(STEPS.checking)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [existing, setExisting] = useState(null)
  const remembered =
    Boolean(form.fullName?.trim()) || Boolean(form.phone?.trim())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const seed = loadRememberedForm()
      if (!seed.fullName?.trim() && !seed.phone?.trim()) {
        if (!cancelled) setStep(STEPS.basics)
        return
      }
      try {
        const mine = await findMyRsvpThisWeek({
          fullName: seed.fullName,
          phone: seed.phone,
        })
        if (cancelled) return
        if (mine?.form) {
          setExisting(mine)
          setForm(mine.form)
          setStep(STEPS.returning)
        } else {
          setStep(STEPS.basics)
        }
      } catch {
        if (!cancelled) setStep(STEPS.basics)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (step === STEPS.checking) return
    saveRememberedForm(form)
  }, [form, step])

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function toggleArray(key, value) {
    setForm((f) => {
      const list = f[key] || []
      return {
        ...f,
        [key]: list.includes(value)
          ? list.filter((v) => v !== value)
          : [...list, value],
      }
    })
  }

  function startEdit() {
    setForm(existing?.form || form)
    setStep(STEPS.basics)
  }

  async function finish() {
    setSaving(true)
    setError('')
    try {
      saveRememberedForm(form)
      await submitRsvp(form)
      setExisting({ form: { ...form }, week_start: existing?.week_start })
      setStep(STEPS.done)
    } catch (e) {
      setError(e.message || 'Could not save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  function goAfterBasics() {
    if (!form.fullName.trim() || !form.phone.trim() || !form.coming) {
      setError('Please fill your name, phone, and whether you are coming.')
      return
    }
    setError('')
    const next = nextFromComing(form.coming)
    setStep(STEPS[next] || STEPS.prefs)
  }

  function goAfterPrefs() {
    if (!form.mealStyle) {
      setError('Please choose whether you prefer host-cooked, potluck, or hybrid.')
      return
    }
    setError('')
    // Regular coming paths get optional sponsorship, then feedback
    if (form.coming === 'help') {
      setStep(STEPS.sponsor_only)
      return
    }
    setStep(STEPS.sponsorship)
  }

  function resetForm() {
    setForm(formForNewWeek())
    setStep(STEPS.basics)
    setError('')
  }

  const doneMessage =
    form.coming === 'no'
      ? 'Thanks for letting us know — that really helps with planning.'
      : form.coming === 'help'
        ? 'Thanks for helping / sponsoring.'
        : "Thanks — you're on the list for this week."

  if (step === STEPS.done) {
    return (
      <>
        <section className="hero">
          <h1>Shabbos RSVP</h1>
          <p>{doneMessage}</p>
        </section>
        <div className="panel">
          <div className="banner banner-ok">Response saved.</div>
          <div className="actions">
            <Link className="btn btn-primary" to="/board">
              View this week
            </Link>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setExisting({ form: { ...form } })
                setStep(STEPS.returning)
              }}
            >
              Need to change something?
            </button>
          </div>
        </div>
      </>
    )
  }

  if (step === STEPS.checking) {
    return (
      <>
        <section className="hero">
          <h1>Shabbos RSVP</h1>
          <p>Checking for your RSVP this week…</p>
        </section>
        <div className="panel">
          <p className="meta">One moment…</p>
        </div>
      </>
    )
  }

  if (step === STEPS.all_set) {
    return (
      <>
        <section className="hero">
          <h1>You&apos;re all set</h1>
          <p>No changes needed — see you for Shabbos.</p>
        </section>
        <div className="panel">
          <div className="banner banner-ok">Your RSVP for this week is on file.</div>
          {existing?.form && <SubmissionSummary form={existing.form} />}
          <div className="actions">
            <Link className="btn btn-primary" to="/board">
              View this week
            </Link>
            <button type="button" className="btn btn-ghost" onClick={startEdit}>
              Actually, I need to change something
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <section className="hero">
        <h1>Shabbos RSVP</h1>
        <p>
          Weekly Shabbos gathering — RSVP so we know who&apos;s coming and what
          you like to eat.
        </p>
      </section>

      {error && <div className="banner banner-err">{error}</div>}

      {step === STEPS.returning && (
        <div className="panel">
          <h2>Welcome back</h2>
          <p className="hint">
            We already have your RSVP for this week. Do you need to make a change
            to your submission?
          </p>
          {existing?.form && <SubmissionSummary form={existing.form} />}
          <div className="actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStep(STEPS.all_set)}
            >
              No, I&apos;m all set
            </button>
            <button type="button" className="btn btn-accent" onClick={startEdit}>
              Yes, I need to change it
            </button>
          </div>
        </div>
      )}

      {step === STEPS.basics && (
        <div className="panel">
          <h2>Weekly Shabbos RSVP & coordination</h2>
          <p className="hint">
            {existing
              ? 'Edit anything below, then continue through the form and submit again.'
              : 'Required fields marked with *'}
            {!existing && remembered
              ? ' Your name and phone are remembered on this device for next week.'
              : ''}
          </p>

          <div className="field">
            <label>
              Your full name <span className="req">*</span>
            </label>
            <input
              type="text"
              value={form.fullName}
              onChange={(e) => setField('fullName', e.target.value)}
              autoComplete="name"
            />
          </div>

          <div className="field">
            <label>
              Your phone number <span className="req">*</span>
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setField('phone', e.target.value)}
              autoComplete="tel"
            />
          </div>

          <div className="field">
            <label>
              Are you coming this week? <span className="req">*</span>
            </label>
            <div className="choices">
              {COMING_OPTIONS.map((opt) => (
                <label className="choice" key={opt.value}>
                  <input
                    type="radio"
                    name="coming"
                    checked={form.coming === opt.value}
                    onChange={() => setField('coming', opt.value)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={goAfterBasics}
              disabled={saving}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === STEPS.guests && (
        <div className="panel">
          <h2>Guest info</h2>
          <p className="hint">
            Tell us about the guests you&apos;re bringing.
          </p>

          <div className="field">
            <label>Guest names</label>
            <input
              type="text"
              value={form.guestNames}
              onChange={(e) => setField('guestNames', e.target.value)}
              placeholder="Names"
            />
          </div>

          <div className="field">
            <label>How many additional guests?</label>
            <input
              type="number"
              min="1"
              value={form.guestCount}
              onChange={(e) => setField('guestCount', e.target.value)}
            />
          </div>

          <div className="field">
            <label>Will any guest stay overnight?</label>
            <div className="choices">
              {['Yes', 'No', 'Not sure'].map((v) => (
                <label className="choice" key={v}>
                  <input
                    type="radio"
                    name="overnight"
                    checked={form.guestOvernight === v}
                    onChange={() => setField('guestOvernight', v)}
                  />
                  <span>{v}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label>
              Do your guests plan to fill out this form themselves?
            </label>
            <div className="choices">
              {GUEST_FILL_OPTIONS.map((opt) => (
                <label className="choice" key={opt.value}>
                  <input
                    type="radio"
                    name="guestWillFillForm"
                    checked={form.guestWillFillForm === opt.value}
                    onChange={() => setField('guestWillFillForm', opt.value)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStep(STEPS.basics)}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStep(STEPS.prefs)}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === STEPS.newcomer && (
        <div className="panel">
          <h2>Welcome!</h2>
          <div className="banner banner-ok">
            We have a WhatsApp group for the address and updates — please join
            so you get the info: {HOST_PAYMENT.whatsapp}
          </div>

          <div className="field">
            <label>Who invited you? (so we can say thanks!)</label>
            <input
              type="text"
              value={form.invitedBy}
              onChange={(e) => setField('invitedBy', e.target.value)}
            />
          </div>

          <div className="field">
            <label>How did you hear about us?</label>
            <input
              type="text"
              value={form.heardAbout}
              onChange={(e) => setField('heardAbout', e.target.value)}
            />
          </div>

          <div className="field">
            <label>Are you bringing more guests?</label>
            <div className="choices">
              {['Yes', 'No', 'Not sure'].map((v) => (
                <label className="choice" key={v}>
                  <input
                    type="radio"
                    name="bringingMoreGuests"
                    checked={form.bringingMoreGuests === v}
                    onChange={() => setField('bringingMoreGuests', v)}
                  />
                  <span>{v}</span>
                </label>
              ))}
            </div>
          </div>

          {form.bringingMoreGuests === 'Yes' && (
            <>
              <div className="field">
                <label>Guest names</label>
                <input
                  type="text"
                  value={form.guestNames}
                  onChange={(e) => setField('guestNames', e.target.value)}
                />
              </div>
              <div className="field">
                <label>How many additional guests?</label>
                <input
                  type="number"
                  min="1"
                  value={form.guestCount}
                  onChange={(e) => setField('guestCount', e.target.value)}
                />
              </div>
            </>
          )}

          <div className="actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStep(STEPS.basics)}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStep(STEPS.prefs)}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === STEPS.probably && (
        <div className="panel">
          <h2>Probably yes</h2>
          <p className="hint">
            If you need to cancel later, just come back to this form and update
            your answer — that helps us plan.
          </p>
          <div className="field">
            <label>When will you know for sure?</label>
            <input
              type="text"
              value={form.knowByWhen}
              onChange={(e) => setField('knowByWhen', e.target.value)}
              placeholder="e.g. Thursday evening, Friday morning…"
            />
          </div>
          <div className="actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStep(STEPS.basics)}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStep(STEPS.prefs)}
            >
              Continue with the form
            </button>
          </div>
        </div>
      )}

      {step === STEPS.social && (
        <div className="panel">
          <h2>Coming later to socialize</h2>
          <p className="hint">A few details help us expect you.</p>
          <div className="field">
            <label>About what time will you come?</label>
            <input
              type="text"
              value={form.socialArrivalTime}
              onChange={(e) => setField('socialArrivalTime', e.target.value)}
              placeholder="e.g. after 9pm, for dessert…"
            />
          </div>
          <div className="field">
            <label>Anything else we should know?</label>
            <textarea
              value={form.socialNotes}
              onChange={(e) => setField('socialNotes', e.target.value)}
              placeholder="Bringing someone, only staying briefly…"
            />
          </div>
          <div className="actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStep(STEPS.basics)}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStep(STEPS.feedback)}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === STEPS.unsure && (
        <div className="panel">
          <h2>Not sure yet</h2>
          <p className="hint">
            No problem. When you know, come back to this form and update —
            whether yes or no helps us plan.
          </p>
          <div className="field">
            <label>When do you expect to confirm?</label>
            <input
              type="text"
              value={form.knowByWhen}
              onChange={(e) => setField('knowByWhen', e.target.value)}
              placeholder="e.g. by Thursday…"
            />
          </div>
          <div className="actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStep(STEPS.basics)}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStep(STEPS.feedback)}
            >
              Continue to feedback
            </button>
          </div>
        </div>
      )}

      {step === STEPS.declined && (
        <div className="panel">
          <h2>Thanks for letting us know</h2>
          <div className="banner banner-ok">
            This is helpful — knowing who is coming and who is not makes planning
            much easier.
          </div>
          <p className="hint">One quick feedback question, then you&apos;re done.</p>
          <div className="actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStep(STEPS.basics)}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStep(STEPS.feedback)}
            >
              Continue to feedback
            </button>
          </div>
        </div>
      )}

      {step === STEPS.prefs && (
        <div className="panel">
          <h2>How you like Shabbos meals</h2>
          <p className="hint">
            Helps the host plan — potluck vs cooking, and what you like to eat.
          </p>
          <MealPrefsFields
            form={form}
            setField={setField}
            toggleArray={toggleArray}
          />
          <div className="actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                const n = nextFromComing(form.coming)
                if (n === 'prefs') setStep(STEPS.basics)
                else setStep(STEPS[n] || STEPS.basics)
              }}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={goAfterPrefs}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === STEPS.sponsorship && (
        <div className="panel">
          <h2>
            Sponsorship
            <span className="private-badge">Admin only</span>
          </h2>
          <p className="hint">
            Optional. Money answers stay private for the host.
          </p>
          <PaymentInfo />
          <div className="field">
            <label>Would you like to contribute or sponsor? (optional)</label>
            <div className="choices">
              {SPONSORSHIP_OPTIONS.map((opt) => (
                <label className="choice" key={opt.value}>
                  <input
                    type="checkbox"
                    checked={form.sponsorship.includes(opt.value)}
                    onChange={() => toggleArray('sponsorship', opt.value)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
          {form.sponsorship.includes('money') && (
            <div className="field">
              <label>Amount / notes (private)</label>
              <input
                type="text"
                value={form.sponsorshipNotes}
                onChange={(e) => setField('sponsorshipNotes', e.target.value)}
                placeholder="e.g. $20 via Zelle"
              />
            </div>
          )}
          <div className="actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStep(STEPS.prefs)}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStep(STEPS.feedback)}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === STEPS.sponsor_only && (
        <div className="panel">
          <h2>
            Help / sponsor
            <span className="private-badge">Admin only</span>
          </h2>
          <p className="hint">
            Thanks for helping. Use the payment info below if you&apos;re
            sponsoring, then submit.
          </p>
          <PaymentInfo />
          <div className="field">
            <label>How are you helping?</label>
            <div className="choices">
              {SPONSORSHIP_OPTIONS.map((opt) => (
                <label className="choice" key={opt.value}>
                  <input
                    type="checkbox"
                    checked={form.sponsorship.includes(opt.value)}
                    onChange={() => toggleArray('sponsorship', opt.value)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Amount / notes for the host (private)</label>
            <input
              type="text"
              value={form.sponsorshipNotes}
              onChange={(e) => setField('sponsorshipNotes', e.target.value)}
              placeholder="e.g. $36 Zelle, or helping with cleanup"
            />
          </div>
          <div className="actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStep(STEPS.basics)}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn-accent"
              onClick={finish}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Submit'}
            </button>
          </div>
        </div>
      )}

      {step === STEPS.feedback && (
        <div className="panel">
          <h2>Quick feedback</h2>
          <p className="hint">
            Do you enjoy this form for Shabbos gatherings? How should we improve?
          </p>
          <div className="field">
            <label>Feedback</label>
            <div className="choices">
              {FEEDBACK_OPTIONS.map((opt) => (
                <label className="choice" key={opt.value}>
                  <input
                    type="radio"
                    name="feedback"
                    checked={form.feedback === opt.value}
                    onChange={() => setField('feedback', opt.value)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
          {(form.feedback === 'other' || form.feedback === 'meh') && (
            <div className="field">
              <label>Comments</label>
              <textarea
                value={form.feedbackNotes}
                onChange={(e) => setField('feedbackNotes', e.target.value)}
              />
            </div>
          )}
          <div className="actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                if (form.coming === 'no') setStep(STEPS.declined)
                else if (form.coming === 'social') setStep(STEPS.social)
                else if (form.coming === 'unsure') setStep(STEPS.unsure)
                else setStep(STEPS.sponsorship)
              }}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn-accent"
              onClick={finish}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Submit RSVP'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
