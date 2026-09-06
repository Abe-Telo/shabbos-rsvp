import { useEffect, useMemo, useState } from 'react'
import PersonAvatar from '../components/PersonAvatar'
import {
  clearAdminSession,
  getAdminSession,
  getSponsorships,
  storageMode,
  unlockAdmin,
  updateAdminHoliday,
  updateAdminRsvp,
  updateAdminSettings,
} from '../lib/api'
import {
  COMING_OPTIONS,
  comingOptionLabel,
  mealStartLabel,
  mealStyleLabel,
  seatsForRsvp,
} from '../lib/formConfig'
import {
  defaultHolidayStatement,
  eventFromPackage,
  fetchHolidayCatalog,
  formatMealLabel,
  upcomingPackages,
} from '../lib/jewishHolidays'
import { currentSunday, formatWeekLabel } from '../lib/week'
import { fileToFoodPhotoData } from '../lib/auth'

const CONTRIB_LABELS = {
  money: 'Contribute money (PayPal / Venmo)',
  food: 'Bring a special dish',
  not_this_week: 'Not this week — maybe next',
  setup: 'Help with setup / cleanup',
  other: 'Other',
  cant: "Can't afford this week",
  other_ways: 'Other ways',
}

function csvEscape(value) {
  const s = String(value ?? '')
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function downloadCsv(filename, rows) {
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function mealStartDisplay(r) {
  if (!r?.meal_start_time && !r?.meal_start_other) return ''
  if (r.meal_start_time === 'other') return r.meal_start_other || 'Other'
  return mealStartLabel(r.meal_start_time) || r.meal_start_time || ''
}

function latestPrefs(foodPrefs) {
  if (!foodPrefs) return ''
  const parts = String(foodPrefs)
    .split(' | ')
    .map((p) => p.trim())
    .filter(Boolean)
  return parts[parts.length - 1] || ''
}

function SheetTable({ columns, rows, empty, onRowClick }) {
  if (!rows.length) {
    return <div className="empty">{empty || 'No rows.'}</div>
  }
  return (
    <div className="sheet-wrap">
      <table className="sheet-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={onRowClick ? 'sheet-row-click' : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} title={String(row[c.key] ?? '')}>
                  {c.key === 'name' ? (
                    <span className="person-heading">
                      <PersonAvatar
                        name={row.name}
                        photoUrl={row.photo_url}
                        size={28}
                      />
                      <span>{row.name}</span>
                    </span>
                  ) : (
                    row[c.key] ?? ''
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EditableRsvpSheet({ rows, empty, onSaved, onOpenHistory }) {
  const [drafts, setDrafts] = useState({})
  const [savingId, setSavingId] = useState(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    const next = {}
    for (const r of rows) {
      next[r.id] = {
        full_name: r.name || '',
        phone: r.phone || '',
        coming: r.comingValue || '',
        bringing_dish: r.bringing || '',
        guest_names: r.guests || '',
        guest_count: r.guestCount === '' || r.guestCount == null ? '' : String(r.guestCount),
        sponsorship_notes: r.notes || '',
        food_comment: r.food_comment || '',
        food_photos: Array.isArray(r.food_photos) ? r.food_photos : [],
      }
    }
    setDrafts(next)
  }, [rows])

  function setDraft(id, key, value) {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], [key]: value },
    }))
  }

  async function saveRow(id) {
    const draft = drafts[id]
    if (!draft) return
    setSavingId(id)
    setErr('')
    setMsg('')
    try {
      await updateAdminRsvp(id, {
        full_name: draft.full_name,
        phone: draft.phone,
        coming: draft.coming,
        bringing_dish: draft.bringing_dish,
        guest_names: draft.guest_names,
        guest_count: draft.guest_count === '' ? null : Number(draft.guest_count),
        sponsorship_notes: draft.sponsorship_notes,
        food_comment: draft.food_comment,
        food_photos: draft.food_photos,
      })
      setMsg('Saved.')
      await onSaved?.()
    } catch (e) {
      setErr(e.message || 'Save failed')
    } finally {
      setSavingId(null)
    }
  }

  async function addPhotos(id, files) {
    if (!files?.length) return
    setErr('')
    try {
      const added = []
      for (const file of files) {
        const url = await fileToFoodPhotoData(file)
        added.push({ id: crypto.randomUUID(), url, caption: '' })
      }
      setDrafts((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          food_photos: [...(prev[id]?.food_photos || []), ...added].slice(0, 8),
        },
      }))
    } catch (e) {
      setErr(e.message || 'Could not add photo')
    }
  }

  if (!rows.length) {
    return <div className="empty">{empty || 'No rows.'}</div>
  }

  return (
    <div>
      <p className="hint">
        Edit cells, add food photos, then click Save on that row. Changes go
        straight into the database.
      </p>
      {msg && <div className="banner banner-ok">{msg}</div>}
      {err && <div className="banner banner-err">{err}</div>}
      <div className="sheet-wrap">
        <table className="sheet-table sheet-table-edit">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Coming</th>
              <th>Bringing</th>
              <th>Food comment</th>
              <th>Photos</th>
              <th>Guests</th>
              <th>#</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const d = drafts[row.id] || {}
              return (
                <tr key={row.id}>
                  <td>
                    <span className="person-heading">
                      <PersonAvatar
                        name={d.full_name || row.name}
                        photoUrl={row.photo_url}
                        size={28}
                      />
                      <input
                        className="sheet-input"
                        value={d.full_name || ''}
                        onChange={(e) =>
                          setDraft(row.id, 'full_name', e.target.value)
                        }
                      />
                    </span>
                  </td>
                  <td>
                    <input
                      className="sheet-input"
                      value={d.phone || ''}
                      onChange={(e) => setDraft(row.id, 'phone', e.target.value)}
                    />
                  </td>
                  <td>
                    <select
                      className="sheet-input"
                      value={d.coming || ''}
                      onChange={(e) => setDraft(row.id, 'coming', e.target.value)}
                    >
                      {COMING_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="sheet-input"
                      value={d.bringing_dish || ''}
                      onChange={(e) =>
                        setDraft(row.id, 'bringing_dish', e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <textarea
                      className="sheet-input sheet-textarea"
                      rows={2}
                      value={d.food_comment || ''}
                      onChange={(e) =>
                        setDraft(row.id, 'food_comment', e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <div className="admin-food-thumbs">
                      {(d.food_photos || []).map((p) => (
                        <img key={p.id || p.url} src={p.url} alt="" />
                      ))}
                    </div>
                    <label className="btn btn-ghost" style={{ cursor: 'pointer', fontSize: '0.8rem' }}>
                      Add
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        hidden
                        onChange={(e) => {
                          addPhotos(row.id, [...(e.target.files || [])])
                          e.target.value = ''
                        }}
                      />
                    </label>
                  </td>
                  <td>
                    <input
                      className="sheet-input"
                      value={d.guest_names || ''}
                      onChange={(e) =>
                        setDraft(row.id, 'guest_names', e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="sheet-input"
                      style={{ width: '3.5rem' }}
                      value={d.guest_count || ''}
                      onChange={(e) =>
                        setDraft(row.id, 'guest_count', e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="sheet-input"
                      value={d.sponsorship_notes || ''}
                      onChange={(e) =>
                        setDraft(row.id, 'sponsorship_notes', e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <div className="actions" style={{ flexDirection: 'column', gap: '0.35rem' }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={savingId === row.id}
                        onClick={() => saveRow(row.id)}
                      >
                        {savingId === row.id ? '…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => onOpenHistory?.(row)}
                      >
                        History
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}


function PersonHistoryModal({ person, rsvps, sponsorships, onClose }) {
  if (!person) return null
  const history = [...rsvps]
    .filter(
      (r) =>
        r.person_id === person.id ||
        (person.phone && r.phone && String(r.phone).replace(/\D/g, '') === String(person.phone).replace(/\D/g, '')) ||
        String(r.full_name || '').toLowerCase() === String(person.name || '').toLowerCase(),
    )
    .sort((a, b) => String(b.week_start || '').localeCompare(String(a.week_start || '')))

  const byRsvp = Object.fromEntries(sponsorships.map((s) => [s.rsvp_id, s]))

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        style={{ width: 'min(640px, 100%)' }}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="person-heading" style={{ marginBottom: '0.75rem' }}>
          <PersonAvatar name={person.name} photoUrl={person.photo_url} size={48} />
          <div>
            <h2 style={{ margin: 0 }}>{person.name}</h2>
            <div className="meta">
              {person.phone || 'No phone'} · attended {person.times_attended || 0}{' '}
              time{(person.times_attended || 0) === 1 ? '' : 's'}
            </div>
          </div>
        </div>
        <p className="hint">Full RSVP history across weeks.</p>
        {history.length === 0 && <div className="empty">No RSVP history.</div>}
        <div className="list">
          {history.map((r) => {
            const s = byRsvp[r.id]
            return (
              <div className="rsvp-row" key={r.id}>
                <strong>Week of {r.week_start}</strong>
                <div className="meta">
                  {comingOptionLabel(r.coming) || r.coming}
                  {r.meal_style
                    ? ` · ${mealStyleLabel(r.meal_style) || r.meal_style}`
                    : ''}
                  {mealStartDisplay(r) ? ` · start ${mealStartDisplay(r)}` : ''}
                </div>
                {r.bringing_dish && (
                  <div className="meta">Bringing: {r.bringing_dish}</div>
                )}
                {(r.food_likes || []).length > 0 && (
                  <div className="meta">
                    Likes: {(r.food_likes || []).join(', ')}
                  </div>
                )}
                {r.guest_names && (
                  <div className="meta">Guests: {r.guest_names}</div>
                )}
                {s && (
                  <div className="meta">
                    Sponsorship:{' '}
                    {(s.contributions || [])
                      .map((c) => CONTRIB_LABELS[c] || c)
                      .join('; ') || '—'}
                    {s.notes ? ` · ${s.notes}` : ''}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminPage() {
  const [password, setPassword] = useState('')
  const [unlocked, setUnlocked] = useState(Boolean(getAdminSession()))
  const [rows, setRows] = useState([])
  const [people, setPeople] = useState([])
  const [rsvps, setRsvps] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState('sheet')
  const [historyPerson, setHistoryPerson] = useState(null)
  const [guestLimitDraft, setGuestLimitDraft] = useState('')
  const [settingsMsg, setSettingsMsg] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)
  const [holidayDraft, setHolidayDraft] = useState({
    enabled: false,
    holiday_id: null,
    title: '',
    statement: defaultHolidayStatement(),
    meals: [],
  })
  const [holidayRsvps, setHolidayRsvps] = useState([])
  const [holidayCatalog, setHolidayCatalog] = useState([])
  const [holidayMsg, setHolidayMsg] = useState('')
  const [savingHoliday, setSavingHoliday] = useState(false)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const week = currentSunday()

  function openHistory(personOrRow) {
    if (!personOrRow) return
    const match =
      people.find((p) => p.id === personOrRow.id || p.id === personOrRow.person_id) ||
      people.find(
        (p) =>
          String(p.name || '').toLowerCase() ===
          String(personOrRow.name || personOrRow.full_name || '').toLowerCase(),
      ) ||
      {
        id: personOrRow.person_id || personOrRow.id,
        name: personOrRow.name || personOrRow.full_name,
        phone: personOrRow.phone,
        photo_url: personOrRow.photo_url,
        times_attended: personOrRow.attended || personOrRow.times_attended,
      }
    setHistoryPerson(match)
  }

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await getSponsorships()
      const list = Array.isArray(data) ? data : data.sponsorships || []
      setRows(list)
      setPeople(data.people || [])
      setRsvps(data.rsvps || [])
      const limit =
        data.capacity?.guest_limit ??
        data.week_settings?.[week]?.guest_limit ??
        null
      setGuestLimitDraft(limit == null ? '' : String(limit))
      const he = data.holiday_event || {
        enabled: false,
        holiday_id: null,
        title: '',
        statement: defaultHolidayStatement(),
        meals: [],
      }
      setHolidayDraft({
        enabled: Boolean(he.enabled),
        holiday_id: he.holiday_id || null,
        title: he.title || '',
        statement: he.statement || defaultHolidayStatement(),
        meals: Array.isArray(he.meals) ? he.meals : [],
      })
      setHolidayRsvps(data.holiday_rsvps || [])
      setUnlocked(true)
    } catch (e) {
      clearAdminSession()
      setUnlocked(false)
      setError(e.message || 'Could not load private data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (getAdminSession()) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!unlocked) return
    let cancelled = false
    ;(async () => {
      setCatalogLoading(true)
      try {
        // force:true clears the bad v1 cache that merged 10 years of RH into one list
        const packages = await fetchHolidayCatalog({ force: true })
        if (!cancelled) setHolidayCatalog(upcomingPackages(packages))
      } catch {
        if (!cancelled) setHolidayCatalog([])
      } finally {
        if (!cancelled) setCatalogLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [unlocked])

  async function onUnlock(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await unlockAdmin(password)
      setPassword('')
      await load()
    } catch (err) {
      setError(err.message || 'Incorrect password')
    } finally {
      setLoading(false)
    }
  }

  function lock() {
    clearAdminSession()
    setUnlocked(false)
    setRows([])
    setPeople([])
    setRsvps([])
    setGuestLimitDraft('')
    setSettingsMsg('')
    setHolidayDraft({
      enabled: false,
      holiday_id: null,
      title: '',
      statement: defaultHolidayStatement(),
      meals: [],
    })
    setHolidayRsvps([])
    setHolidayMsg('')
  }

  async function saveGuestLimit(e) {
    e.preventDefault()
    setSavingSettings(true)
    setSettingsMsg('')
    setError('')
    try {
      const raw = guestLimitDraft.trim()
      const body = await updateAdminSettings({
        week_start: week,
        guest_limit: raw === '' ? null : Number(raw),
      })
      const saved = body.capacity?.guest_limit ?? body.settings?.guest_limit ?? null
      setGuestLimitDraft(saved == null ? '' : String(saved))
      setSettingsMsg(
        saved == null
          ? 'No guest limit this week — RSVPs are open.'
          : `Guest limit set to ${saved} for this week.`,
      )
    } catch (err) {
      setError(err.message || 'Could not save settings')
    } finally {
      setSavingSettings(false)
    }
  }

  function applyHolidayPackage(packageId) {
    const pkg = holidayCatalog.find((p) => p.id === packageId)
    if (!pkg) return
    const next = eventFromPackage(pkg)
    setHolidayDraft((prev) => ({
      ...next,
      enabled: prev.enabled,
      // Keep custom statement if they already edited it for this save session
      statement:
        prev.holiday_id === next.holiday_id && prev.statement
          ? prev.statement
          : next.statement,
      // Always take the package meal list (4 for RH) — don't keep leftover old slots
      meals: next.meals.map((m) => {
        const old = (prev.meals || []).find((x) => x.id === m.id)
        if (!old) return m
        return {
          ...m,
          hosted: old.hosted !== false,
          host_name: old.host_name || '',
          address: old.address || '',
          notes: old.notes || '',
        }
      }),
    }))
  }

  function updateMeal(idx, patch) {
    setHolidayDraft((prev) => ({
      ...prev,
      meals: prev.meals.map((m, i) => (i === idx ? { ...m, ...patch } : m)),
    }))
  }

  async function saveHoliday(e) {
    e?.preventDefault?.()
    setSavingHoliday(true)
    setHolidayMsg('')
    setError('')
    try {
      const body = await updateAdminHoliday({
        enabled: holidayDraft.enabled,
        holiday_id: holidayDraft.holiday_id,
        title: holidayDraft.title,
        statement: holidayDraft.statement,
        meals: holidayDraft.meals,
      })
      const he = body.holiday || holidayDraft
      setHolidayDraft({
        enabled: Boolean(he.enabled),
        holiday_id: he.holiday_id || null,
        title: he.title || '',
        statement: he.statement || defaultHolidayStatement(),
        meals: Array.isArray(he.meals) ? he.meals : [],
      })
      setHolidayMsg(
        he.enabled
          ? `Holiday mode ON — ${he.title || 'event'} is live on the Holiday tab.`
          : 'Holiday mode OFF — Holiday tab shows closed message.',
      )
      await load()
    } catch (err) {
      setError(err.message || 'Could not save holiday settings')
    } finally {
      setSavingHoliday(false)
    }
  }

  function exportHolidayCsv() {
    const header = [
      'holiday_id',
      'full_name',
      'phone',
      'meals',
      'guest_names',
      'guest_count',
      'guest_meals',
      'donate',
      'donate_amount',
      'potluck',
      'clean',
      'help_notes',
      'created_at',
    ]
    const lines = [header.join(',')]
    for (const r of holidayRsvps) {
      const guests = r.guests || []
      lines.push(
        [
          r.holiday_id,
          r.full_name,
          r.phone,
          (r.meals || []).join('; '),
          guests
            .map((g) => `${(g.meals || []).join('/')}:${g.name}`)
            .join('; '),
          guests.reduce((n, g) => n + (Number(g.count) || 0), 0),
          guests
            .map((g) => `${(g.meals || []).join('/')}:×${g.count}`)
            .join('; '),
          r.help?.donate ? 'yes' : '',
          r.help?.amount || '',
          r.help?.potluck ? 'yes' : '',
          r.help?.clean ? 'yes' : '',
          r.help?.notes || '',
          r.created_at,
        ]
          .map(csvEscape)
          .join(','),
      )
    }
    downloadCsv(`holiday-rsvps-${holidayDraft.holiday_id || 'event'}.csv`, lines)
  }

  const thisWeekSeatCount = useMemo(
    () =>
      rsvps
        .filter((r) => r.week_start === week)
        .reduce((n, r) => n + seatsForRsvp(r), 0),
    [rsvps, week],
  )

  function exportPrivateSheet() {
    const header = [
      'week_start',
      'full_name',
      'phone',
      'coming',
      'meal_style',
      'meal_start_time',
      'bringing_dish',
      'food_likes',
      'sponsorship',
      'sponsorship_notes',
      'guest_names',
      'guest_count',
      'created_at',
    ]
    const byId = Object.fromEntries(rows.map((s) => [s.rsvp_id, s]))
    const lines = [header.join(',')]
    const source = rsvps.length
      ? rsvps
      : rows.map((s) => ({
          week_start: s.week_start,
          full_name: s.full_name,
          phone: s.phone,
          coming: '',
          meal_style: '',
          meal_start_time: '',
          bringing_dish: s.potluck_contribution,
          food_likes: [],
          guest_names: '',
          guest_count: '',
          created_at: s.created_at,
          id: s.rsvp_id,
        }))

    for (const r of source) {
      const s = byId[r.id] || {}
      lines.push(
        [
          r.week_start,
          r.full_name,
          r.phone,
          r.coming,
          r.meal_style || r.potluck,
          r.meal_start_time === 'other'
            ? r.meal_start_other || 'Other'
            : r.meal_start_time || '',
          r.bringing_dish || s.potluck_contribution,
          (r.food_likes || r.bringing || []).join('; '),
          (s.contributions || []).join('; '),
          s.notes || '',
          r.guest_names,
          r.guest_count,
          r.created_at,
        ]
          .map(csvEscape)
          .join(','),
      )
    }
    downloadCsv(`shabbos-private-${week}.csv`, lines)
  }

  const thisWeekSponsors = rows.filter((r) => r.week_start === week)
  const pastSponsors = rows.filter((r) => r.week_start !== week)

  const sponsorByRsvp = useMemo(
    () => Object.fromEntries(rows.map((s) => [s.rsvp_id, s])),
    [rows],
  )

  const weekRsvpSheet = useMemo(() => {
    return [...rsvps]
      .filter((r) => r.week_start === week)
      .sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || '')))
      .map((r) => {
        const s = sponsorByRsvp[r.id] || {}
        return {
          id: r.id,
          person_id: r.person_id,
          photo_url: r.photo_url,
          name: r.full_name || '',
          phone: r.phone || '',
          comingValue: r.coming || '',
          coming: comingOptionLabel(r.coming) || r.coming || '',
          style: mealStyleLabel(r.meal_style || r.potluck) || r.meal_style || '',
          start: mealStartDisplay(r),
          bringing: r.bringing_dish || s.potluck_contribution || '',
          likes: (r.food_likes || r.bringing || []).join(', '),
          guests: r.guest_names || '',
          guestCount: r.guest_count ?? '',
          sponsorship: (s.contributions || [])
            .map((c) => CONTRIB_LABELS[c] || c)
            .join('; '),
          notes: s.notes || '',
          food_comment: r.food_comment || '',
          food_photos: Array.isArray(r.food_photos) ? r.food_photos : [],
        }
      })
  }, [rsvps, sponsorByRsvp, week])

  const contactsSheet = useMemo(() => {
    return [...people]
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
      .map((p) => ({
        id: p.id,
        photo_url: p.photo_url,
        name: p.name || '',
        phone: p.phone || '',
        attended: p.times_attended || 0,
        first: p.first_seen ? new Date(p.first_seen).toLocaleDateString() : '',
        last: p.last_seen ? new Date(p.last_seen).toLocaleDateString() : '',
        prefs: latestPrefs(p.food_prefs),
      }))
  }, [people])

  const sponsorshipSheet = useMemo(() => {
    return [...rows]
      .sort((a, b) => String(b.week_start).localeCompare(String(a.week_start)))
      .map((s) => ({
        id: s.id,
        week: s.week_start || '',
        name: s.full_name || '',
        phone: s.phone || '',
        sponsorship: (s.contributions || [])
          .map((c) => CONTRIB_LABELS[c] || c)
          .join('; '),
        dish: s.potluck_contribution || '',
        notes: s.notes || '',
      }))
  }, [rows])

  const contactColumns = [
    { key: 'name', label: 'Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'attended', label: 'Attended' },
    { key: 'first', label: 'First seen' },
    { key: 'last', label: 'Last seen' },
    { key: 'prefs', label: 'Latest prefs' },
  ]

  const sponsorColumns = [
    { key: 'week', label: 'Week' },
    { key: 'name', label: 'Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'sponsorship', label: 'Sponsorship' },
    { key: 'dish', label: 'Dish / help' },
    { key: 'notes', label: 'Notes' },
  ]

  return (
    <>
      <section className="hero">
        <h1>Admin</h1>
        <p>
          Private host view — phones, sponsorship, and money. Not shown on the
          public board. Export CSV to paste into your Google Sheet.
        </p>
      </section>

      {!unlocked && (
        <div className="panel">
          <h2>
            Unlock private data
            <span className="private-badge">Private</span>
          </h2>
          <p className="hint">
            {storageMode() === 'demo'
              ? 'Demo password is in .env.example (default: shabbos-admin).'
              : 'Use the host master password for private sponsorship data.'}
          </p>
          {error && <div className="banner banner-err">{error}</div>}
          <form onSubmit={onUnlock}>
            <div className="field">
              <label>Master password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading || !password}
              >
                {loading ? 'Checking…' : 'Unlock'}
              </button>
            </div>
          </form>
        </div>
      )}

      {unlocked && (
        <>
          <div className="actions" style={{ marginBottom: '1rem' }}>
            <button type="button" className="btn btn-ghost" onClick={lock}>
              Lock
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={load}
              disabled={loading}
            >
              Refresh
            </button>
            <button
              type="button"
              className="btn btn-accent"
              onClick={exportPrivateSheet}
            >
              Download Google Sheet CSV
            </button>
          </div>

          <div className="nav" style={{ marginBottom: '1rem' }}>
            <button
              type="button"
              className={`btn ${view === 'sheet' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setView('sheet')}
            >
              Sheet view
            </button>
            <button
              type="button"
              className={`btn ${view === 'cards' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setView('cards')}
            >
              Cards
            </button>
          </div>

          {error && <div className="banner banner-err">{error}</div>}
          {loading && <p className="meta">Loading…</p>}

          <div className="panel" style={{ marginBottom: '1rem' }}>
            <h2>This week settings</h2>
            <p className="hint">
              Optional cap for {formatWeekLabel(week)}. Counts each meal RSVP plus
              extra guests they list. Leave blank for no limit. Resets with the
              week on Sunday.
            </p>
            <form onSubmit={saveGuestLimit}>
              <div className="field">
                <label>Guest limit</label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  inputMode="numeric"
                  placeholder="No limit"
                  value={guestLimitDraft}
                  onChange={(e) => setGuestLimitDraft(e.target.value)}
                />
                <p className="hint" style={{ marginTop: '0.4rem', marginBottom: 0 }}>
                  Currently {thisWeekSeatCount} seat
                  {thisWeekSeatCount === 1 ? '' : 's'} filled
                  {guestLimitDraft.trim()
                    ? ` of ${guestLimitDraft.trim()}`
                    : ''}
                  .
                </p>
              </div>
              {settingsMsg && <div className="banner banner-ok">{settingsMsg}</div>}
              <div className="actions">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingSettings}
                >
                  {savingSettings ? 'Saving…' : 'Save limit'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={savingSettings || guestLimitDraft === ''}
                  onClick={async () => {
                    setGuestLimitDraft('')
                    setSavingSettings(true)
                    setSettingsMsg('')
                    setError('')
                    try {
                      await updateAdminSettings({
                        week_start: week,
                        guest_limit: null,
                      })
                      setSettingsMsg('No guest limit this week — RSVPs are open.')
                    } catch (err) {
                      setError(err.message || 'Could not save settings')
                    } finally {
                      setSavingSettings(false)
                    }
                  }}
                >
                  Clear
                </button>
              </div>
            </form>
          </div>

          <div className="panel" style={{ marginBottom: '1rem' }}>
            <h2>Holiday mode</h2>
            <p className="hint">
              Turns on the <strong>Holiday</strong> tab. Guests pick night/day
              meals; addresses stay hidden until after they submit. Calendar
              from Hebcal (next 10 years).
            </p>

            <div className="field">
              <label className="choice">
                <input
                  type="checkbox"
                  checked={holidayDraft.enabled}
                  onChange={(e) =>
                    setHolidayDraft((h) => ({ ...h, enabled: e.target.checked }))
                  }
                />
                <span>Enable holiday RSVP (show on Holiday tab)</span>
              </label>
            </div>

            <div className="field">
              <label>Pick holiday</label>
              <select
                className="sheet-input"
                value={holidayDraft.holiday_id || ''}
                disabled={catalogLoading}
                onChange={(e) => applyHolidayPackage(e.target.value)}
              >
                <option value="">
                  {catalogLoading ? 'Loading calendar…' : 'Select a holiday…'}
                </option>
                {holidayCatalog.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({p.start_date} → {p.end_date})
                  </option>
                ))}
              </select>
              {!catalogLoading && holidayCatalog.length === 0 && (
                <p className="hint" style={{ marginTop: '0.4rem' }}>
                  Could not load Hebcal. You can still edit meals manually below
                  if an event was already saved.
                </p>
              )}
            </div>

            <div className="field">
              <label>Title shown to guests</label>
              <input
                type="text"
                value={holidayDraft.title}
                onChange={(e) =>
                  setHolidayDraft((h) => ({ ...h, title: e.target.value }))
                }
                placeholder="e.g. Rosh Hashanah 5787"
              />
            </div>

            <div className="field">
              <label>Yom Tov help statement</label>
              <textarea
                value={holidayDraft.statement}
                onChange={(e) =>
                  setHolidayDraft((h) => ({ ...h, statement: e.target.value }))
                }
                rows={4}
              />
            </div>

            <h3
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.05rem',
                margin: '0.5rem 0 0.75rem',
              }}
            >
              Meals (night / day)
            </h3>
            {holidayDraft.meals.length === 0 && (
              <div className="empty">Pick a holiday to load meal slots.</div>
            )}
            {holidayDraft.meals.map((m, idx) => (
              <div
                key={m.id}
                className="rsvp-row"
                style={{ marginBottom: '0.75rem' }}
              >
                <div className="field" style={{ marginBottom: '0.5rem' }}>
                  <label className="choice">
                    <input
                      type="checkbox"
                      checked={m.hosted !== false}
                      onChange={(e) =>
                        updateMeal(idx, { hosted: e.target.checked })
                      }
                    />
                    <span>
                      Hosting {formatMealLabel(m)} ({m.period})
                    </span>
                  </label>
                </div>
                {m.hosted !== false && (
                  <>
                    <div className="field">
                      <label>Label</label>
                      <input
                        type="text"
                        value={m.label || ''}
                        onChange={(e) =>
                          updateMeal(idx, { label: e.target.value })
                        }
                      />
                    </div>
                    <div className="field">
                      <label>Host name</label>
                      <input
                        type="text"
                        value={m.host_name || ''}
                        onChange={(e) =>
                          updateMeal(idx, { host_name: e.target.value })
                        }
                        placeholder="Who is hosting this meal"
                      />
                    </div>
                    <div className="field">
                      <label>Address (shown after guest submits)</label>
                      <textarea
                        value={m.address || ''}
                        onChange={(e) =>
                          updateMeal(idx, { address: e.target.value })
                        }
                        rows={2}
                        placeholder="Street, city…"
                      />
                    </div>
                    <div className="field">
                      <label>Notes</label>
                      <input
                        type="text"
                        value={m.notes || ''}
                        onChange={(e) =>
                          updateMeal(idx, { notes: e.target.value })
                        }
                        placeholder="Optional timing / parking"
                      />
                    </div>
                  </>
                )}
              </div>
            ))}

            {holidayMsg && <div className="banner banner-ok">{holidayMsg}</div>}
            <div className="actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={savingHoliday}
                onClick={saveHoliday}
              >
                {savingHoliday ? 'Saving…' : 'Save holiday settings'}
              </button>
            </div>

            <h3
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.05rem',
                margin: '1.25rem 0 0.55rem',
              }}
            >
              Holiday RSVPs ({holidayRsvps.length})
            </h3>
            {holidayRsvps.length === 0 ? (
              <div className="empty">No holiday RSVPs yet.</div>
            ) : (
              <>
                <div className="list">
                  {holidayRsvps.slice(0, 40).map((r) => (
                    <div className="rsvp-row" key={r.id}>
                      <strong>{r.full_name}</strong>
                      <div className="meta">{r.phone}</div>
                      <div className="meta">
                        Meals:{' '}
                        {(r.meals || [])
                          .map(
                            (id) =>
                              holidayDraft.meals.find((m) => m.id === id)
                                ?.label || id,
                          )
                          .join(', ')}
                      </div>
                      {(r.guests || []).length > 0 && (
                        <div className="meta">
                          Guests by meal:{' '}
                          {r.guests
                            .map((g) => {
                              const mealLabels = (g.meals || [])
                                .map(
                                  (id) =>
                                    holidayDraft.meals.find((m) => m.id === id)
                                      ?.label || id,
                                )
                                .join('/')
                              return `${mealLabels}: ${g.name || 'Guest'} ×${g.count}`
                            })
                            .join(' · ')}
                        </div>
                      )}
                      <div className="tags">
                        {r.help?.donate && (
                          <span className="tag">
                            Donate{r.help?.amount ? ` ${r.help.amount}` : ''}
                          </span>
                        )}
                        {r.help?.potluck && <span className="tag">Potluck</span>}
                        {r.help?.clean && <span className="tag">Clean</span>}
                      </div>
                      {r.help?.notes && (
                        <div className="meta">{r.help.notes}</div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={exportHolidayCsv}
                  >
                    Export holiday CSV
                  </button>
                </div>
              </>
            )}
          </div>

          {view === 'sheet' && (
            <>
              <div className="panel">
                <h2>This week RSVPs — {formatWeekLabel(week)}</h2>
                <p className="hint">
                  Editable spreadsheet of this week’s private answers.
                </p>
                <EditableRsvpSheet
                  rows={weekRsvpSheet}
                  empty="No RSVPs this week."
                  onSaved={load}
                  onOpenHistory={openHistory}
                />
              </div>

              <div className="panel" style={{ marginTop: '1rem' }}>
                <h2>Contacts (private)</h2>
                <p className="hint">
                  All-time people log with phones. Click a row for history.
                </p>
                <SheetTable
                  columns={contactColumns}
                  rows={contactsSheet}
                  empty="No contacts yet."
                  onRowClick={openHistory}
                />
              </div>

              <div className="panel" style={{ marginTop: '1rem' }}>
                <h2>Sponsorship</h2>
                <p className="hint">Money / help answers across weeks.</p>
                <SheetTable
                  columns={sponsorColumns}
                  rows={sponsorshipSheet}
                  empty="No sponsorship answers yet."
                  onRowClick={(row) =>
                    openHistory({
                      name: row.name,
                      phone: row.phone,
                      full_name: row.name,
                    })
                  }
                />
              </div>
            </>
          )}

          {view === 'cards' && (
            <>
              <div className="panel">
                <h2>Contacts (private)</h2>
                <p className="hint">
                  Phone numbers — host only. Click a person to see history.
                </p>
                {people.length === 0 && (
                  <div className="empty">No contacts yet.</div>
                )}
                <div className="list">
                  {people.map((p) => (
                    <button
                      type="button"
                      className="person-row person-row-btn"
                      key={p.id}
                      onClick={() => openHistory(p)}
                    >
                      <div className="person-heading">
                        <PersonAvatar name={p.name} photoUrl={p.photo_url} />
                        <strong>{p.name}</strong>
                      </div>
                      <div className="meta">
                        {p.phone || 'No phone'} · attended{' '}
                        {p.times_attended || 0} time
                        {(p.times_attended || 0) === 1 ? '' : 's'}
                      </div>
                      {p.food_prefs && (
                        <div className="meta">{latestPrefs(p.food_prefs)}</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="panel" style={{ marginTop: '1rem' }}>
                <h2>Sponsorship — {formatWeekLabel(week)}</h2>
                <p className="hint">Money and private notes for this week.</p>
                {!loading && thisWeekSponsors.length === 0 && (
                  <div className="empty">No sponsorship answers this week.</div>
                )}
                <div className="list">
                  {thisWeekSponsors.map((s) => (
                    <SponsorshipRow key={s.id} s={s} />
                  ))}
                </div>
              </div>

              {pastSponsors.length > 0 && (
                <div className="panel" style={{ marginTop: '1rem' }}>
                  <h2>Past sponsorship</h2>
                  <div className="list">
                    {pastSponsors.map((s) => (
                      <SponsorshipRow key={s.id} s={s} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <PersonHistoryModal
            person={historyPerson}
            rsvps={rsvps}
            sponsorships={rows}
            onClose={() => setHistoryPerson(null)}
          />
        </>
      )}
    </>
  )
}

function SponsorshipRow({ s }) {
  return (
    <div className="rsvp-row">
      <strong>{s.full_name}</strong>
      <div className="meta">
        {s.phone || 'No phone'} · week {s.week_start}
      </div>
      <div className="tags">
        {(s.contributions || []).map((c) => (
          <span className="tag tag-warn" key={c}>
            {CONTRIB_LABELS[c] || c}
          </span>
        ))}
      </div>
      {s.potluck_contribution && (
        <div className="meta">Contribution: {s.potluck_contribution}</div>
      )}
      {s.notes && <div className="meta">Notes: {s.notes}</div>}
    </div>
  )
}
