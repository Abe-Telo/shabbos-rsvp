import fs from 'fs'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { foodPhotosDir } from './db.js'

const PUBLIC_BASE = (
  process.env.SHABBOS_PUBLIC_BASE || 'https://keys.orderassistnow.com/shabbos-api'
).replace(/\/$/, '')

const MAX_FOOD_PHOTO_CHARS = 900_000
const MAX_FOOD_PHOTOS = 8

export function foodPhotoPublicUrl(filename) {
  return `${PUBLIC_BASE}/food-photos/${filename}`
}

/**
 * Normalize incoming food photo list. Data URLs are written to disk.
 * Accepts [{ id?, url, caption? }] or string URLs.
 */
export function persistFoodPhotos(photos) {
  const list = Array.isArray(photos) ? photos : []
  const out = []
  for (const raw of list) {
    if (out.length >= MAX_FOOD_PHOTOS) break
    if (!raw) continue
    const caption =
      typeof raw === 'object' ? String(raw.caption || '').trim().slice(0, 240) : ''
    let url = typeof raw === 'string' ? raw : String(raw.url || '').trim()
    if (!url) continue

    if (url.startsWith('data:image/')) {
      const m = /^data:image\/([\w+.-]+);base64,(.+)$/i.exec(url)
      if (!m) throw new Error('Invalid food photo data')
      if (url.length > MAX_FOOD_PHOTO_CHARS) {
        throw new Error('Food photo is too large — try a smaller image')
      }
      let ext = m[1].toLowerCase().replace('jpeg', 'jpg')
      if (ext === 'svg+xml') ext = 'svg'
      if (!['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) ext = 'jpg'
      if (ext === 'jpeg') ext = 'jpg'
      const id = uuid()
      const filename = `${id}.${ext}`
      fs.writeFileSync(path.join(foodPhotosDir, filename), Buffer.from(m[2], 'base64'))
      url = foodPhotoPublicUrl(filename)
    } else if (/^https?:\/\//i.test(url)) {
      if (url.length > MAX_FOOD_PHOTO_CHARS) {
        throw new Error('Food photo URL is too large')
      }
    } else if (url.startsWith('/food-photos/')) {
      url = foodPhotoPublicUrl(url.replace(/^\/food-photos\//, ''))
    } else {
      throw new Error('Food photo must be an image upload or http(s) URL')
    }

    out.push({
      id: (typeof raw === 'object' && raw.id) || uuid(),
      url,
      caption,
    })
  }
  return out
}

export function normalizeFoodComment(value) {
  const s = String(value || '').trim()
  return s ? s.slice(0, 1000) : null
}

export function normalizeFoodReplies(list) {
  if (!Array.isArray(list)) return []
  return list
    .filter((r) => r && String(r.text || '').trim())
    .map((r) => ({
      id: r.id || null,
      author_name: String(r.author_name || r.authorName || 'Guest').trim().slice(0, 80),
      text: String(r.text || '').trim().slice(0, 1000),
      created_at: r.created_at || null,
    }))
}

/** Public thread: legacy owner comment + replies. */
export function foodThreadFor(rsvp) {
  const out = []
  const legacy = String(rsvp?.food_comment || '').trim()
  if (legacy) {
    for (const chunk of legacy.split(/\n\n+/).filter(Boolean)) {
      out.push({
        id: `legacy-${out.length}`,
        author_name: rsvp.full_name || 'Host guest',
        text: chunk,
        kind: 'owner',
        created_at: rsvp.created_at || null,
      })
    }
  }
  for (const r of normalizeFoodReplies(rsvp?.food_replies)) {
    out.push({
      ...r,
      id: r.id || `reply-${out.length}`,
      kind: 'reply',
    })
  }
  return out
}
