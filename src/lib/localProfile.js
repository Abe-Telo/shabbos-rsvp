import { emptyForm } from './formConfig'
import { currentSunday } from './week'

const PROFILE_KEY = 'shabbos-rsvp-profile-v1'
const LAST_SUBMISSION_KEY = 'shabbos-rsvp-last-submission-v1'

/** Fields remembered across weeks so guests can click through quickly. */
const REMEMBERED = [
  'fullName',
  'phone',
  'mealStyle',
  'mealStyleOther',
  'foodLikes',
  'foodLikesOther',
  'heardAbout',
  'invitedBy',
  'guestNames',
  'guestCount',
  'guestOvernight',
]

export function loadRememberedForm() {
  const base = emptyForm()
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return base
    const saved = JSON.parse(raw)
    for (const key of REMEMBERED) {
      if (saved[key] !== undefined && saved[key] !== null) {
        base[key] = saved[key]
      }
    }
  } catch {
    /* ignore corrupt profile */
  }
  return base
}

export function saveRememberedForm(form) {
  try {
    const profile = {}
    for (const key of REMEMBERED) {
      profile[key] = form[key]
    }
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
  } catch {
    /* private mode / quota */
  }
}

/** Keep profile, clear this-week answers (coming, sponsorship, feedback). */
export function formForNewWeek() {
  return loadRememberedForm()
}

export function saveLastSubmission(form) {
  try {
    localStorage.setItem(
      LAST_SUBMISSION_KEY,
      JSON.stringify({
        week_start: currentSunday(),
        form: { ...form },
        saved_at: new Date().toISOString(),
      }),
    )
  } catch {
    /* ignore */
  }
}

export function loadLastSubmissionThisWeek() {
  try {
    const raw = localStorage.getItem(LAST_SUBMISSION_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw)
    if (saved.week_start !== currentSunday()) return null
    return saved
  } catch {
    return null
  }
}
