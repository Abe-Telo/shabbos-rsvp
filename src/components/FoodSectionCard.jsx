import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PersonAvatar from './PersonAvatar'
import { updateRsvpFood } from '../lib/api'
import { fileToFoodPhotoData } from '../lib/auth'

/**
 * One person's food section on Food this week.
 * Owner: + photos (header right) + comments.
 * Other known guests: reply when the section already has activity.
 */
export default function FoodSectionCard({
  dish,
  isMine,
  identity,
  known,
  onClaim,
  onSaved,
}) {
  const [commentDraft, setCommentDraft] = useState('')
  const [photos, setPhotos] = useState(dish.food_photos || [])
  const [thread, setThread] = useState(dish.food_thread || [])
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [claimOpen, setClaimOpen] = useState(false)
  const [claimName, setClaimName] = useState(identity?.fullName || '')
  const [claimPhone, setClaimPhone] = useState(identity?.phone || '')
  const [claiming, setClaiming] = useState(false)

  const hasActivity =
    photos.length > 0 || thread.length > 0
  const canReply = Boolean(known || isMine) && (hasActivity || isMine)
  const canOwnPhotos = Boolean(isMine)

  useEffect(() => {
    setPhotos(dish.food_photos || [])
    setThread(
      Array.isArray(dish.food_thread) && dish.food_thread.length
        ? dish.food_thread
        : dish.food_comment
          ? [{ id: 'legacy', author_name: dish.name, text: dish.food_comment, kind: 'owner' }]
          : [],
    )
  }, [dish.id, dish.food_comment, dish.food_photos, dish.food_thread, dish.name])

  useEffect(() => {
    if (identity?.fullName) setClaimName(identity.fullName)
    if (identity?.phone) setClaimPhone(identity.phone)
  }, [identity?.fullName, identity?.phone])

  function ensureIdentity() {
    if (known || isMine) return true
    // Already signed in / remembered — claim YOUR section, don't bind to this card
    if (identity?.fullName?.trim() && identity?.phone?.trim()) {
      onClaim?.({
        fullName: identity.fullName.trim(),
        phone: identity.phone.trim(),
      })
      return true
    }
    setClaimOpen(true)
    return false
  }

  async function addPhotos(files) {
    if (!files?.length) return
    if (!canOwnPhotos) {
      ensureIdentity()
      setError('Photos can only be added on your own section')
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
      await updateRsvpFood(dish.id, {
        fullName: identity.fullName,
        phone: identity.phone,
        foodPhotos: next,
        bringingDish: dish.dish || undefined,
      })
      onSaved?.()
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

    if (isMine) {
      setSaving(true)
      setError('')
      try {
        const legacy = thread
          .filter((m) => m.kind === 'owner' || !m.kind)
          .map((m) => m.text)
          .join('\n\n')
        const nextComment = legacy ? `${legacy}\n\n${text}` : text
        await updateRsvpFood(dish.id, {
          fullName: identity.fullName,
          phone: identity.phone,
          foodComment: nextComment,
          foodPhotos: photos,
          bringingDish: dish.dish || undefined,
        })
        setCommentDraft('')
        onSaved?.()
      } catch (err) {
        setError(err.message || 'Could not post')
      } finally {
        setSaving(false)
      }
      return
    }

    if (!known) {
      if (identity?.fullName?.trim() && identity?.phone?.trim()) {
        try {
          await onClaim?.({
            fullName: identity.fullName.trim(),
            phone: identity.phone.trim(),
          })
        } catch (err) {
          setError(err.message || 'Could not verify you')
          setClaimOpen(true)
          return
        }
      } else {
        setClaimOpen(true)
        return
      }
    }

    if (!hasActivity) {
      setError('Replies open after someone posts a photo or comment here')
      return
    }

    setSaving(true)
    setError('')
    try {
      await updateRsvpFood(dish.id, {
        fullName: identity.fullName,
        phone: identity.phone,
        reply: text,
      })
      setCommentDraft('')
      onSaved?.()
    } catch (err) {
      setError(err.message || 'Could not reply')
    } finally {
      setSaving(false)
    }
  }

  async function submitClaim(e) {
    e?.preventDefault()
    setClaiming(true)
    setError('')
    try {
      // Unlock YOUR section (ignore which card you tapped)
      await onClaim?.({
        fullName: claimName.trim(),
        phone: claimPhone.trim(),
      })
      setClaimOpen(false)
    } catch (err) {
      setError(err.message || 'Could not unlock')
    } finally {
      setClaiming(false)
    }
  }

  return (
    <article
      className={`food-card ${isMine ? 'food-card-mine' : ''}`}
      data-rsvp-id={dish.id}
      id={isMine ? 'my-food-section' : undefined}
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
        {canOwnPhotos && (
          <label
            className="food-add-btn"
            title="Add photos"
            aria-label="Add photos"
          >
            <span aria-hidden="true">+</span>
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              disabled={busy || photos.length >= 8}
              onChange={(e) => {
                addPhotos([...(e.target.files || [])])
                e.target.value = ''
              }}
            />
          </label>
        )}
      </div>

      {thread.length > 0 && (
        <div className="food-chat">
          {thread.map((m) => (
            <div
              className={`food-chat-bubble ${m.kind === 'reply' ? 'food-chat-reply' : ''}`}
              key={m.id || `${m.author_name}-${m.text.slice(0, 12)}`}
            >
              {m.kind === 'reply' && (
                <div className="food-chat-author">{m.author_name}</div>
              )}
              <p>{m.text}</p>
            </div>
          ))}
        </div>
      )}

      {photos.length > 0 && (
        <div className="food-card-gallery">
          {photos.map((p) => (
            <figure className="food-card-shot" key={p.id || p.url}>
              <a href={p.url} target="_blank" rel="noreferrer">
                <img src={p.url} alt={p.caption || dish.dish || 'Food'} />
              </a>
              {p.caption && <figcaption>{p.caption}</figcaption>}
            </figure>
          ))}
        </div>
      )}

      {(canOwnPhotos || canReply || hasActivity) && (
        <form className="food-composer" onSubmit={postComment}>
          {canOwnPhotos ? (
            <label
              className="food-composer-attach"
              title="Add a photo"
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
                disabled={busy || photos.length >= 8}
                onChange={(e) => {
                  addPhotos([...(e.target.files || [])])
                  e.target.value = ''
                }}
              />
            </label>
          ) : (
            <span className="food-composer-attach food-composer-attach-disabled" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M9 3h6l1.5 2H20a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3.5L9 3zm3 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 2.2A2.8 2.8 0 1 1 12 16a2.8 2.8 0 0 1 0-5.8z"
                />
              </svg>
            </span>
          )}
          <input
            type="text"
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            placeholder={
              isMine
                ? 'Write a comment about your dish…'
                : hasActivity
                  ? known
                    ? 'Reply…'
                    : 'Reply (uses your signed-in / RSVP identity)…'
                  : 'Replies open after a photo or comment is posted…'
            }
            aria-label="Comment"
            disabled={!isMine && !hasActivity && !known}
          />
          <button
            type="submit"
            className="btn btn-primary food-composer-send"
            disabled={saving || !commentDraft.trim()}
          >
            {saving ? '…' : 'Send'}
          </button>
        </form>
      )}

      {claimOpen && !known && (
        <form className="food-claim-form" onSubmit={submitClaim}>
          <p className="hint" style={{ margin: 0 }}>
            Confirm once with your RSVP name and phone (saved on this device).
            If you&apos;re signed in, we use your profile instead.
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
              {claiming ? 'Checking…' : 'Continue'}
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
