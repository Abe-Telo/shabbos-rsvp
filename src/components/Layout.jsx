import { NavLink, Outlet } from 'react-router-dom'
import { storageMode } from '../lib/api'
import {
  currentSunday,
  formatCountdown,
  formatWeekLabel,
  msUntilNextSunday,
} from '../lib/week'
import { useEffect, useState } from 'react'

export default function Layout() {
  const [countdown, setCountdown] = useState(formatCountdown(msUntilNextSunday()))
  const week = currentSunday()
  const demo = storageMode() === 'demo'

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown(formatCountdown(msUntilNextSunday()))
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="site-header-inner">
          <NavLink to="/" className="brand">
            Shabbos RSVP
          </NavLink>
          <nav className="nav">
            <NavLink to="/" end>
              Form
            </NavLink>
            <NavLink to="/board">This week</NavLink>
            <NavLink to="/people">People</NavLink>
            <NavLink to="/admin">Admin</NavLink>
          </nav>
        </div>
      </header>

      <main className="main">
        {demo && (
          <div className="banner banner-demo">
            Demo mode — data stays in this browser until a shared database is
            connected.
          </div>
        )}
        <div className="week-chip" style={{ marginBottom: '1rem' }}>
          Week of {formatWeekLabel(week)} · resets in {countdown}
        </div>
        <Outlet />
      </main>

      <footer className="site-footer">
        Weekly Shabbos RSVP · answers public · sponsorship admin-only
      </footer>
    </div>
  )
}
