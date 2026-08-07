import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { submitRsvp } from '../lib/api'
import {
  COMING_OPTIONS,
  emptyForm,
  FEEDBACK_OPTIONS,
  FOOD_LIKE_OPTIONS,
  MEAL_STYLE_OPTIONS,
  SPONSORSHIP_OPTIONS,
} from '../lib/formConfig'

const STEPS = {
  basics: 'basics',
  prefs: 'prefs',
  invite: 'invite',
  guests: 'guests',
  sponsorship: 'sponsorship',
  feedback: 'feedback',
  done: 'done',
}

function nextFromComing(coming) {
  return COMING_OPTIONS.find((o) => o.value === coming)?.next || 'prefs'
}

export default function FormPage() {
  const [form, setForm] = useState(emptyForm)
  const [step, setStep] = useState(STEPS.basics)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const comingOpt = useMemo(
    () => COMING_OPTIONS.find((o) => o.value === form.coming),
    [form.coming],
  )

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

  async function finish() {
    setSaving(true)
    setError('')
    try {
      await submitRsvp(form)
      setStep(STEPS.done)
    } catch (e) {
      setError(e.message || 'Could not save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  /** After name / phone / coming — branch like the Google Form. */
  function goAfterBasics() {
    if (!form.fullName.trim() || !form.phone.trim() || !form.coming) {
      setError('Please fill your name, phone, and whether you are coming.')
      return
    }
    setError('')
    const next = nextFromComing(form.coming)
    if (next === 'submit') {
      finish()
      return
    }
    // Everyone who continues first shares meal style + food likes
    setStep(STEPS.prefs)
  }

  /** After food prefs — go to invite, guests, or sponsorship. */
  function goAfterPrefs() {
    if (!form.mealStyle) {
      setError('Please choose whether you prefer host-cooked, potluck, or hybrid.')
      return
    }
    setError('')
    const next = nextFromComing(form.coming)
    if (next === 'guests') setStep(STEPS.guests)
    else if (next === 'invite') setStep(STEPS.invite)
    else setStep(STEPS.sponsorship)
  }

  function backFromSponsorship() {
    const next = nextFromComing(form.coming)
    if (next === 'guests') setStep(STEPS.guests)
    else if (next === 'invite') setStep(STEPS.invite)
    else setStep(STEPS.prefs)
  }

  function resetForm() {
    setForm(emptyForm())
    setStep(STEPS.basics)
    setError('')
  }

  if (step === STEPS.done) {
    return (
      <>
        <section className="hero">
          <h1>Shabbos RSVP</h1>
          <p>Thanks — you&apos;re on the list for this week.</p>
        </section>
        <div className="panel">
          <div className="banner banner-ok">Response saved.</div>
          <p className="meta">
            Public answers appear on This Week. Sponsorship details stay private
            for the host.
          </p>
          <div className="actions">
            <Link className="btn btn-primary" to="/board">
              View this week
            </Link>
            <button type="button" className="btn btn-ghost" onClick={resetForm}>
              Submit another
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
          Weekly Shabbos gathering — please RSVP so we know who&apos;s coming,
          what you like to eat, and whether you prefer potluck or host cooking.
        </p>
      </section>

      {error && <div className="banner banner-err">{error}</div>}

      {step === STEPS.basics && (
        <div className="panel">
          <h2>Weekly Shabbos RSVP & coordination</h2>
          <p className="hint">
            Fill this out for our upcoming Shabbos. Required fields marked with *
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
              {comingOpt?.next === 'submit'
                ? saving
                  ? 'Saving…'
                  : 'Submit'
                : 'Continue'}
            </button>
          </div>
        </div>
      )}

      {step === STEPS.prefs && (
        <div className="panel">
          <h2>How you like Shabbos meals</h2>
          <p className="hint">
            Helps the host plan — potluck vs cooking for everyone, and what you
            actually like to eat.
          </p>

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
            <label>
              What do you like to eat? Choose only what you would eat.
            </label>
            <div className="checkbox-grid">
              {FOOD_LIKE_OPTIONS.map((item) => (
                <label className="choice" key={item}>
                  <input
                    type="checkbox"
                    checked={form.foodLikes.includes(item)}
                    onChange={() => toggleArray('foodLikes', item)}
                  />
                  <span>{item}</span>
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

          <div className="actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStep(STEPS.basics)}
            >
              Back
            </button>
            <button type="button" className="btn btn-primary" onClick={goAfterPrefs}>
              Continue
            </button>
          </div>
        </div>
      )}

      {step === STEPS.invite && (
        <div className="panel">
          <h2>Invite list</h2>
          <p className="hint">Optional — helps us say thank you and grow the group.</p>

          <div className="field">
            <label>How did you hear about us?</label>
            <input
              type="text"
              value={form.heardAbout}
              onChange={(e) => setField('heardAbout', e.target.value)}
            />
          </div>

          <div className="field">
            <label>If someone invited you, who was it? (so we can say thanks!)</label>
            <input
              type="text"
              value={form.invitedBy}
              onChange={(e) => setField('invitedBy', e.target.value)}
            />
          </div>

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
              onClick={() => setStep(STEPS.sponsorship)}
            >
              Continue to sponsorship
            </button>
          </div>
        </div>
      )}

      {step === STEPS.guests && (
        <div className="panel">
          <h2>Guest list options</h2>
          <p className="hint">Please tell us how many other guests you are bringing.</p>

          <div className="field">
            <label>Guest names (to help keep track)</label>
            <input
              type="text"
              value={form.guestNames}
              onChange={(e) => setField('guestNames', e.target.value)}
              placeholder="Names"
            />
          </div>

          <div className="field">
            <label>How many additional guests are you bringing?</label>
            <input
              type="number"
              min="0"
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
              onClick={() => setStep(STEPS.sponsorship)}
            >
              Continue to sponsorship
            </button>
          </div>
        </div>
      )}

      {step === STEPS.sponsorship && (
        <div className="panel">
          <h2>
            Go above and beyond
            <span className="private-badge">Admin only</span>
          </h2>
          <p className="hint">
            Optional — help make our Shabbos gathering beautiful and special.
            Money answers stay private for the host only.
          </p>

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

          {(form.sponsorship.includes('food') ||
            form.mealStyle === 'potluck' ||
            form.mealStyle === 'hybrid') && (
            <div className="field">
              <label>Potluck dish description</label>
              <input
                type="text"
                value={form.potluckContribution}
                onChange={(e) => setField('potluckContribution', e.target.value)}
                placeholder="What dish will you bring?"
              />
            </div>
          )}

          {form.sponsorship.includes('money') && (
            <div className="field">
              <label>Amount / notes for the host (private)</label>
              <input
                type="text"
                value={form.sponsorshipNotes}
                onChange={(e) => setField('sponsorshipNotes', e.target.value)}
                placeholder="e.g. $20 via Venmo"
              />
            </div>
          )}

          {form.sponsorship.includes('other') && !form.sponsorship.includes('money') && (
            <div className="field">
              <label>Please explain</label>
              <textarea
                value={form.sponsorshipNotes}
                onChange={(e) => setField('sponsorshipNotes', e.target.value)}
              />
            </div>
          )}

          <div className="actions">
            <button type="button" className="btn btn-ghost" onClick={backFromSponsorship}>
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
              onClick={() => setStep(STEPS.sponsorship)}
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
