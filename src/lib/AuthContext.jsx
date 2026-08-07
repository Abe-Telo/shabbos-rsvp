import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  fetchCurrentUser,
  loginProfile,
  logoutProfile,
  registerProfile,
  updateProfile,
} from './auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authOpen, setAuthOpen] = useState(null) // 'login' | 'register' | null
  const [registerSeed, setRegisterSeed] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const me = await fetchCurrentUser()
        if (!cancelled) setUser(me)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const openLogin = useCallback(() => {
    setRegisterSeed(null)
    setAuthOpen('login')
  }, [])

  const openRegister = useCallback((seed = null) => {
    setRegisterSeed(seed)
    setAuthOpen('register')
  }, [])

  const closeAuth = useCallback(() => {
    setAuthOpen(null)
    setRegisterSeed(null)
  }, [])

  const login = useCallback(async (payload) => {
    const body = await loginProfile(payload)
    setUser(body.user)
    closeAuth()
    return body.user
  }, [closeAuth])

  const register = useCallback(async (payload) => {
    const body = await registerProfile(payload)
    setUser(body.user)
    closeAuth()
    return body.user
  }, [closeAuth])

  const logout = useCallback(async () => {
    await logoutProfile()
    setUser(null)
  }, [])

  const saveProfile = useCallback(async (patch) => {
    const next = await updateProfile(patch)
    setUser(next)
    return next
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      authOpen,
      registerSeed,
      openLogin,
      openRegister,
      closeAuth,
      login,
      register,
      logout,
      saveProfile,
    }),
    [
      user,
      loading,
      authOpen,
      registerSeed,
      openLogin,
      openRegister,
      closeAuth,
      login,
      register,
      logout,
      saveProfile,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
