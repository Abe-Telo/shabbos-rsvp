import { useState } from 'react'
import { findMyRsvpThisWeek, updateRsvpFood } from '../lib/api'
import { fileToFoodPhotoData } from '../lib/auth'
import { loadRememberedForm } from '../lib/localProfile'

export default function MyFoodUpdate({ onSaved }) {
  const remembered = loadRememberedForm()
  const [fullName, setFullName] = useState(remembered.fullName || '')
  const [phone, setPhone] = useState(remembered.phone || '')
  const [rsvpId, setRsvpId] = useState(null)
  const [dish, setDish] = useState('')
  const [comment, setComment] = useState('')
  const [photos, setPhotos] = useState([])
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [open, setOpen] = useState(true)

  async function findMine() {
    setBusy(true)
    setError('')
    setOk('')
    try {
      const mine = await findMyRsvpThisWeek({
        fullName: fullName.trim(),
        phone: phone.trim(),
      })
      if (!mine?.rsvp) {
        setRsvpId(null)
        setError(
          'No RSVP found for that name/phone this week. Double-check spelling, or RSVP on the form first.',
        )
        return
      }
      setRsvpId(mine.rsvp.id)
      setDish(mine.form?.bringingDish || mine.rsvp.bringing_dish || '')
      setComment(mine.form?.foodComment || mine.rsvp.food_comment || '')
      setPhotos(
        Array.isArray(mine.form?.foodPhotos)
          ? mine.form.foodPhotos
          : Array.isArray(mine.rsvp.food_photos)
            ? mine.rsvp.food_photos
            : [],
      )
    } catch (e) {
      setError(e.message || 'Could not find your RSVP')
      setRsvpId(null)
    } finally {
      setBusy(false)
    }
  }

  async function onPickFiles(e) {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    if (!files.length) return
    setBusy(true)
    setError('')
    try {
      const next = [...photos]
      for (const file of files) {
        if (next.length >= 8) break
        const url = await fileToFoodPhotoData(file)
        next.push({ id: crypto.randomUUID(), url, caption: '' })
      }
      setPhotos(next)
    } catch (ex) {
      setError(ex.message || 'Could not add photo')
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!rsvpId) {
      setError('Find your RSVP first with your name and phone.')
      return
    }
    setSaving(true)
    setError('')
    setOk('')
    try {
      await updateRsvpFood(rsvpId, {
        fullName: fullName.trim(),
        phone: phone.trim(),
        bringingDish: dish,
        foodComment: comment,
        foodPhotos: photos,
      })
      setOk('Saved — your food photos and comment are on the board.')
      onSaved?.()
    } catch (e) {
      setError(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <div className="panel" style={{ marginBottom: '1rem' }}>
        <button
          type="button"
          className="btn btn-accent"
          onClick={() => setOpen(true)}
        >
          Add / update your food photos &amp; comment
        </button>
      </div>
    )
  }

  return (
    <div className="panel" id="my-food" style={{ marginBottom: '1rem' }}>
      <h2>Your food this week</h2>
      <p className="hint">
        Already RSVP&apos;d? Add photos and a comment here — no need to redo the
        whole form. Use the same name and phone you submitted with.
      </p>
      <div className="field">
        <label>Your name</label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="As on your RSVP"
        />
      </div>
      <div className="field">
        <label>Phone</label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Same phone as your RSVP"
        />
      </div>
      <div className="actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || (!fullName.trim() && !phone.trim())}
          onClick={findMine}
        >
          {busy ? 'Looking…' : rsvpId ? 'Reload my RSVP' : 'Find my RSVP'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setOpen(false)}
        >
          Hide
        </button>
      </div>
      {rsvpId && (
        <>
          <div className="banner banner-ok" style={{ margin: '0.75rem 0' }}>
            Found your RSVP — add photos below.
          </div>
          <div className="field">
            <label>What you&apos;re bringing</label>
            <input
              type="text"
              value={dish}
              onChange={(e) => setDish(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Comment</label>
            <textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Anything about the dish…"
            />
          </div>
          <div className="actions">
            <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
              {busy ? 'Adding…' : 'Add food photos'}
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                disabled={busy || photos.length >= 8}
                onChange={onPickFiles}
              />
            </label>
          </div>
          {photos.length > 0 && (
            <div className="food-photo-edit-grid">
              {photos.map((p) => (
                <div className="food-photo-edit" key={p.id || p.url}>
                  <img src={p.url} alt="" />
                  <input
                    type="text"
                    value={p.caption || ''}
                    onChange={(e) =>
                      setPhotos((prev) =>
                        prev.map((x) =>
                          (x.id || x.url) === (p.id || p.url)
                            ? { ...x, caption: e.target.value }
                            : x,
                        ),
                      )
                    }
                    placeholder="Caption (optional)"
                  />
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() =>
                      setPhotos((prev) =>
                        prev.filter((x) => (x.id || x.url) !== (p.id || p.url)),
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="actions" style={{ marginTop: '0.85rem' }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving}
              onClick={save}
            >
              {saving ? 'Saving…' : 'Save to Food this week'}
            </button>
          </div>
        </>
      )}
      {ok && <div className="banner banner-ok">{ok}</div>}
      {error && <div className="banner banner-err">{error}</div>}
    </div>
  )
}
