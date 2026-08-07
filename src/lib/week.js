/** Current Shabbos week starts each Sunday (local time). */
export function currentSunday(date = new Date()) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() // 0 = Sunday
  d.setDate(d.getDate() - day)
  return formatDate(d)
}

export function formatDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatWeekLabel(weekStart) {
  const start = new Date(`${weekStart}T12:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const opts = { month: 'short', day: 'numeric' }
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, { ...opts, year: 'numeric' })}`
}

/** Milliseconds until next Sunday midnight (local). */
export function msUntilNextSunday() {
  const now = new Date()
  const next = new Date(now)
  next.setHours(0, 0, 0, 0)
  const daysUntil = (7 - next.getDay()) % 7 || 7
  next.setDate(next.getDate() + daysUntil)
  return next.getTime() - now.getTime()
}

export function formatCountdown(ms) {
  if (ms <= 0) return '0d 0h'
  const days = Math.floor(ms / (24 * 60 * 60 * 1000))
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
  return `${days}d ${hours}h`
}
