import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AuthModal, ProfileMenu } from './AuthModals'
import { useAuth } from '../lib/AuthContext'
import { storageMode } from '../lib/api'
import {
  currentSunday,
  formatCountdown,
  formatWeekLabel,
  msUntilNextSunday,
} from '../lib/week'

const PRIMARY_LINKS = [
  { to: '/', end: true, label: 'Form' },
  { to: '/board', label: 'This week' },
  { to: '/food', label: 'Food' },
  { to: '/people', label: 'Past people' },
]

const ALL_LINKS = [
  ...PRIMARY_LINKS,
  { to: '/admin', label: 'Admin' },
]

function MobileMenu({ open, onClose }) {
  const { user, openLogin, logout } = useAuth()

  if (!open) return null

  return (
    <>
      <button
        type="button"
        className="mobile-menu-scrim"
        aria-label="Close menu"
        onClick={onClose}
      />
      <div className="mobile-menu-panel" role="dialog" aria-label="Menu">
        <div className="mobile-menu-head">
          <strong>Menu</strong>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <nav className="mobile-menu-nav">
          {ALL_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className="mobile-menu-link"
              onClick={onClose}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="mobile-menu-auth">
          {user ? (
            <>
              <NavLink
                to="/profile"
                className="mobile-menu-link"
                onClick={onClose}
              >
                Profile
              </NavLink>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={async () => {
                  onClose()
                  await logout?.()
                }}
              >
                Log out
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                onClose()
                openLogin()
              }}
            >
              Login
            </button>
          )}
        </div>
      </div>
    </>
  )
}

export default function Layout() {
  const location = useLocation()
  const [countdown, setCountdown] = useState(formatCountdown(msUntilNextSunday()))
  const [menuOpen, setMenuOpen] = useState(false)
  const week = currentSunday()
  const demo = storageMode() === 'demo'
  const wide = location.pathname.startsWith('/admin')

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown(formatCountdown(msUntilNextSunday()))
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  return (
    <div className={`app-shell${wide ? ' app-shell-wide' : ''}`}>
      <header className="site-header">
        <div className="site-header-inner">
          <div className="header-top-row">
            <NavLink to="/" className="brand">
              Shabbos RSVP
            </NavLink>
            <button
              type="button"
              className={`hamburger-btn${menuOpen ? ' is-open' : ''}`}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>

          <NavLink to="/" className="brand brand-desktop">
            Shabbos RSVP
          </NavLink>

          <div className="header-right">
            <nav className="nav nav-primary" aria-label="Primary">
              {PRIMARY_LINKS.map((link) => (
                <NavLink key={link.to} to={link.to} end={link.end}>
                  {link.label}
                </NavLink>
              ))}
            </nav>
            <nav className="nav nav-desktop-extra" aria-label="More">
              <NavLink to="/admin">Admin</NavLink>
            </nav>
            <div className="header-desktop-profile">
              <ProfileMenu />
            </div>
          </div>
        </div>
        <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      </header>

      <main className={`main${wide ? ' main-wide' : ''}`}>
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

      <AuthModal />
    </div>
  )
}
