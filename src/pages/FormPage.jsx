import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { submitRsvp } from '../lib/api'
import {
  BRINGING_OPTIONS,
  COMING_OPTIONS,
  emptyForm,
  FEEDBACK_OPTIONS,
  POTLUCK_OPTIONS,
  SPONSORSHIP_OPTIONS,
} from '../lib/formConfig'

const STEPS = {
  basics: 'basics',
  basics_more: 'basics_more',
  newcomer: 'newcomer',
  guests: 'guests',
  sponsorship: 'sponsorship',
  feedback: 'feedback',
  done: 'done',
}

function nextFromComing(coming) {
  const opt = COMING_OPTIONS.find((o) => o.value === coming)
  return opt?.next || 'basics_more'
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

  function goAfterBasics() {
    if (!form.fullName.trim() || !form.phone.trim() || !form.coming) {
      setError('Please fill name, phone, and whether you are coming.')
      return
    }
    setError('')
    const next = nextFromComing(form.coming)
    if (next === 'submit') {
      finish()
      return
    }
    if (next === 'basics_more') {
      setStep(STEPS.basics_more)
      return
    }
    if (next === 'newcomer') {
      setStep(STEPS.newcomer)
      return
    }
    if (next === 'guests') {
      setStep(STEPS.guests)
      return
    }
    if (next === 'sponsorship') {
      setStep(STEPS.sponsorship)
    }
  }

  function goAfterBasicsMore() {
    // Branching mirrors the Google Form “go to section” rules after meal questions.
    if (form.coming === 'yes_guest' || form.coming === 'social') {
      setStep(STEPS.guests)
    } else if (form.coming === 'yes_new') {
      setStep(STEPS.newcomer)
    } else {
      // yes, probably, unsure, help → sponsorship (private)
      setStep(STEPS.sponsorship)
    }
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
          Fill this out to RSVP and coordinate for our upcoming Shabbos
          gathering. The form adapts based on your answers.
        </p>
      </section>

      {error && <div className="banner banner-err">{error}</div>}

      {step === STEPS.basics && (
        <div className="panel">
          <h2>Basic information & RSVP</h2>
          <p className="hint">Required fields marked with *</p>

          <div className="field">
            <label>
              Full Name <span className="req">*</span>
            </label>
            <input
              type="text"
              value={form.fullName}
              onChange={(e) => setField('fullName', e.target.value)}
              autoComplete="name"
              required
            />
          </div>

          <div className="field">
            <label>
              Phone Number <span className="req">*</span>
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setField('phone', e.target.value)}
              autoComplete="tel"
              required
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

      {step === STEPS.basics_more && (
        <div className="panel">
          <h2>Meal plan & what you&apos;re bringing</h2>
          <p className="hint">Helps us coordinate food and supplies.</p>

          <div className="field">
            <label>Are you part of a potluck or meal-plan?</label>
            <div className="choices">
              {POTLUCK_OPTIONS.map((opt) => (
                <label className="choice" key={opt.value}>
                  <input
                    type="radio"
                    name="potluck"
                    checked={form.potluck === opt.value}
                    onChange={() => setField('potluck', opt.value)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label>What are you bringing?</label>
            <div className="checkbox-grid">
              {BRINGING_OPTIONS.map((item) => (
                <label className="choice" key={item}>
                  <input
                    type="checkbox"
                    checked={form.bringing.includes(item)}
                    onChange={() => toggleArray('bringing', item)}
                  />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          </div>

          {form.bringing.includes('Other (Please specify)') && (
            <div className="field">
              <label>Other — please specify</label>
              <input
                type="text"
                value={form.bringingOther}
                onChange={(e) => setField('bringingOther', e.target.value)}
              />
            </div>
          )}

          <div className="field">
            <label>Dietary preferences / what you like eating</label>
            <textarea
              value={form.dietaryNotes}
              onChange={(e) => setField('dietaryNotes', e.target.value)}
              placeholder="e.g. vegetarian, loves cholent, no nuts…"
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
              onClick={goAfterBasicsMore}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === STEPS.newcomer && (
        <div className="panel">
          <h2>Welcome — invite list</h2>
          <p className="hint">
            Glad you&apos;re joining. Anything helpful for the host to know?
          </p>
          <div className="field">
            <label>Notes for the host (optional)</label>
            <textarea
              value={form.newcomerNotes}
              onChange={(e) => setField('newcomerNotes', e.target.value)}
              placeholder="How you heard about us, who invited you…"
            />
          </div>

          <div className="field">
            <label>Are you part of a potluck or meal-plan?</label>
            <div className="choices">
              {POTLUCK_OPTIONS.map((opt) => (
                <label className="choice" key={opt.value}>
                  <input
                    type="radio"
                    name="potluck"
                    checked={form.potluck === opt.value}
                    onChange={() => setField('potluck', opt.value)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label>What are you bringing?</label>
            <div className="checkbox-grid">
              {BRINGING_OPTIONS.map((item) => (
                <label className="choice" key={item}>
                  <input
                    type="checkbox"
                    checked={form.bringing.includes(item)}
                    onChange={() => toggleArray('bringing', item)}
                  />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Dietary preferences / what you like eating</label>
            <textarea
              value={form.dietaryNotes}
              onChange={(e) => setField('dietaryNotes', e.target.value)}
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
              onClick={() => setStep(STEPS.sponsorship)}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === STEPS.guests && (
        <div className="panel">
          <h2>Guest list options</h2>
          <p className="hint">How many guests are joining?</p>

          <div className="field">
            <label>
              If you are bringing a guest, who would it be (to help keep track)
            </label>
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

          <div className="field">
            <label>Are you part of a potluck or meal-plan?</label>
            <div className="choices">
              {POTLUCK_OPTIONS.map((opt) => (
                <label className="choice" key={opt.value}>
                  <input
                    type="radio"
                    name="potluck"
                    checked={form.potluck === opt.value}
                    onChange={() => setField('potluck', opt.value)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label>What are you bringing?</label>
            <div className="checkbox-grid">
              {BRINGING_OPTIONS.map((item) => (
                <label className="choice" key={item}>
                  <input
                    type="checkbox"
                    checked={form.bringing.includes(item)}
                    onChange={() => toggleArray('bringing', item)}
                  />
                  <span>{item}</span>
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
              onClick={() => setStep(STEPS.sponsorship)}
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
            Optional but helpful. Money-related answers are never shown on the
            public board — only the host can see them after unlocking Admin.
          </p>

          <div className="field">
            <label>Would you like to contribute or sponsor this week?</label>
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
            <label>Potluck contribution item / amount notes</label>
            <input
              type="text"
              value={form.potluckContribution}
              onChange={(e) => setField('potluckContribution', e.target.value)}
              placeholder="e.g. $20, or challah for 12"
            />
          </div>

          <div className="field">
            <label>Anything else private for the host?</label>
            <textarea
              value={form.sponsorshipNotes}
              onChange={(e) => setField('sponsorshipNotes', e.target.value)}
            />
          </div>

          <div className="actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                if (form.coming === 'yes_guest' || form.coming === 'social') {
                  setStep(STEPS.guests)
                } else if (form.coming === 'yes_new') {
                  setStep(STEPS.newcomer)
                } else if (
                  form.coming === 'probably' ||
                  form.coming === 'unsure'
                ) {
                  setStep(STEPS.basics_more)
                } else {
                  setStep(STEPS.basics)
                }
              }}
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

      {step === STEPS.feedback && (
        <div className="panel">
          <h2>Quick feedback</h2>
          <p className="hint">
            Do you enjoy this form over a WhatsApp call? How should we improve?
          </p>

          <div className="field">
            <label>Preferred coordination</label>
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

          <div className="field">
            <label>Comments</label>
            <textarea
              value={form.feedbackNotes}
              onChange={(e) => setField('feedbackNotes', e.target.value)}
            />
          </div>

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
