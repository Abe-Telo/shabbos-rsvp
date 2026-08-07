import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PersonAvatar from './PersonAvatar'
import { updateRsvpFood } from '../lib/api'
import { fileToFoodPhotoData } from '../lib/auth'

/**
 * One person's food section on Food this week.
 * Owner unlocks with RSVP name+phone, then posts via + (photos) and chat box.
 */
export default function FoodSectionCard({
  dish,
  isMine,
  identity,
  onClaim,
  onSaved,
}) {
  const [commentDraft, setCommentDraft] = useState('')
  const [photos, setPhotos] = useState(dish.food_photos || [])
  const [mainComment, setMainComment] = useState(dish.food_comment || '')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [claimOpen, setClaimOpen] = useState(false)
  const [claimName, setClaimName] = useState(identity?.fullName || dish.name || '')
  const [claimPhone, setClaimPhone] = useState(identity?.phone || '')
  const [claiming, setClaiming] = useState(false)

  useEffect(() => {
    setPhotos(dish.food_photos || [])
    setMainComment(dish.food_comment || '')
  }, [dish.id, dish.food_comment, dish.food_photos])

  useEffect(() => {
    setClaimName(identity?.fullName || dish.name || '')
    setClaimPhone(identity?.phone || '')
  }, [identity?.fullName, identity?.phone, dish.name])

  async function persist(nextPhotos, nextComment) {
    if (!isMine || !identity?.fullName || !identity?.phone) {
      throw new Error('Unlock this section with your RSVP name and phone first')
    }
    await updateRsvpFood(dish.id, {
      fullName: identity.fullName,
      phone: identity.phone,
      foodPhotos: nextPhotos,
      foodComment: nextComment,
      bringingDish: dish.dish || undefined,
    })
    onSaved?.()
  }

  async function addPhotos(files) {
    if (!files?.length) return
    if (!isMine) {
      setClaimOpen(true)
      return
    }
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
      await persist(next, mainComment)
    } catch (e) {
      setError(e.message || 'Could not add photo')
    } finally {
      setBusy(false)
    }
  }

  async function postComment(e) {
    e?.preventDefault()
    const text = commentDraft.trim()
    if (!text) return
    if (!isMine) {
      setClaimOpen(true)
      return
    }
    setSaving(true)
    setError('')
    try {
      const next = mainComment ? `${mainComment}\n\n${text}` : text
      setMainComment(next)
      setCommentDraft('')
      await persist(photos, next)
    } catch (err) {
      setError(err.message || 'Could not post')
    } finally {
      setSaving(false)
    }
  }

  async function submitClaim(e) {
    e?.preventDefault()
    setClaiming(true)
    setError('')
    try {
      await onClaim?.({
        fullName: claimName.trim(),
        phone: claimPhone.trim(),
        rsvpId: dish.id,
      })
      setClaimOpen(false)
    } catch (err) {
      setError(err.message || 'Could not unlock')
    } finally {
      setClaiming(false)
    }
  }

  function PhotoPlus({ className = '' }) {
    return (
      <label
        className={`food-add-btn ${className}`}
        title={isMine ? 'Add photos' : 'Unlock to add photos'}
        aria-label="Add photos"
      >
        <span aria-hidden="true">+</span>
        <input
          type="file"
          accept="image/*"
          multiple
          hidden
          disabled={busy || (isMine && photos.length >= 8)}
          onChange={(e) => {
            addPhotos([...(e.target.files || [])])
            e.target.value = ''
          }}
        />
      </label>
    )
  }

  return (
    <article
      className={`food-card ${isMine ? 'food-card-mine' : ''}`}
      data-rsvp-id={dish.id}
    >
      <div className="food-card-head">
        <PersonAvatar name={dish.name} photoUrl={dish.photo_url} size={56} />
        <div className="food-card-meta">
          {dish.profile_username ? (
            <Link
              className="person-name-link"
              to={`/u/${encodeURIComponent(dish.profile_username)}`}
            >
              <strong>{dish.name}</strong>
            </Link>
          ) : (
            <strong>{dish.name}</strong>
          )}
          <div className="meta">
            {dish.coming ? dish.coming : 'Coming'}
            {isMine ? ' · your section' : ''}
          </div>
          {dish.dish ? (
            <div className="food-card-dish">{dish.dish}</div>
          ) : (
            <div className="meta">No dish listed yet</div>
          )}
        </div>
        <PhotoPlus />
      </div>

      {mainComment && (
        <div className="food-chat">
          {mainComment.split(/\n\n+/).filter(Boolean).map((chunk, i) => (
            <p className="food-chat-bubble" key={`${dish.id}-c-${i}`}>
              {chunk}
            </p>
          ))}
        </div>
      )}

      {(photos.length > 0 || isMine) && (
        <div className="food-card-gallery">
          {photos.map((p) => (
            <figure className="food-card-shot" key={p.id || p.url}>
              <a href={p.url} target="_blank" rel="noreferrer">
                <img src={p.url} alt={p.caption || dish.dish || 'Food'} />
              </a>
              {p.caption && <figcaption>{p.caption}</figcaption>}
            </figure>
          ))}
          {isMine && photos.length < 8 && (
            <PhotoPlus className="food-add-tile" />
          )}
        </div>
      )}

      <form className="food-composer" onSubmit={postComment}>
        <label
          className="food-composer-attach"
          title={isMine ? 'Add a photo' : 'Unlock to add a photo'}
          aria-label="Attach photo"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M9 3h6l1.5 2H20a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3.5L9 3zm3 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 2.2A2.8 2.8 0 1 1 12 16a2.8 2.8 0 0 1 0-5.8z"
            />
          </svg>
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            disabled={busy || (isMine && photos.length >= 8)}
            onChange={(e) => {
              addPhotos([...(e.target.files || [])])
              e.target.value = ''
            }}
          />
        </label>
        <input
          type="text"
          value={commentDraft}
          onChange={(e) => setCommentDraft(e.target.value)}
          placeholder={
            isMine
              ? 'Write a comment about your dish…'
              : 'Comment (unlock your section first)…'
          }
          aria-label="Comment"
          onFocus={() => {
            if (!isMine) setClaimOpen(true)
          }}
        />
        <button
          type="submit"
          className="btn btn-primary food-composer-send"
          disabled={saving || !commentDraft.trim()}
        >
          {saving ? '…' : 'Send'}
        </button>
      </form>

      {!isMine && claimOpen && (
        <form className="food-claim-form" onSubmit={submitClaim}>
          <p className="hint" style={{ margin: 0 }}>
            This is your section? Confirm with the name and phone from your RSVP
            to post here.
          </p>
          <input
            type="text"
            value={claimName}
            onChange={(e) => setClaimName(e.target.value)}
            placeholder="Your name"
            required
          />
          <input
            type="tel"
            value={claimPhone}
            onChange={(e) => setClaimPhone(e.target.value)}
            placeholder="Phone"
            required
          />
          <div className="actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={claiming}
            >
              {claiming ? 'Checking…' : 'Unlock my section'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setClaimOpen(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && <div className="banner banner-err">{error}</div>}
    </article>
  )
}
