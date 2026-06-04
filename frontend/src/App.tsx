import { useEffect, useState } from 'react'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import PublicFiles from './pages/PublicFiles'
import * as api from './lib/api'

export type AuthUser = { id: string; name: string; role?: string }
export type Theme = 'dark' | 'light'

function App() {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/'
  const isPublicPage = pathname.startsWith('/shared')
  const isLegacyPublicPage = pathname.startsWith('/public')
  const isAuthPage = pathname === '/' || pathname.startsWith('/auth')

  const [user, setUser] = useState<AuthUser | null>(null)
  const [booting, setBooting] = useState(true)
  const [authNotice, setAuthNotice] = useState('')
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('theme') as Theme) ?? 'dark'
  })

  useEffect(() => {
    if (isLegacyPublicPage) {
      if (typeof window !== 'undefined') {
        window.location.replace('/shared')
      }
      return
    }

    if (isPublicPage) {
      setBooting(false)
      return
    }

    if (!isAuthPage) {
      if (typeof window !== 'undefined') {
        window.location.replace('/')
      }
      return
    }

    let cancelled = false
    api.fetchSession()
      .then((sessionUser) => {
        if (!cancelled) setUser(sessionUser)
      })
      .finally(() => {
        if (!cancelled) setBooting(false)
      })
    return () => {
      cancelled = true
    }
  }, [isAuthPage, isLegacyPublicPage, isPublicPage])

  useEffect(() => {
    const onUnauthorized = () => {
      setAuthNotice('Your session has expired. Please sign in again.')
      setUser(null)
    }
    window.addEventListener(api.unauthorizedEventName(), onUnauthorized)
    return () => {
      window.removeEventListener(api.unauthorizedEventName(), onUnauthorized)
    }
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  function toggleTheme() {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }

  async function handleSignOut() {
    try {
      await api.logout()
    } finally {
      setAuthNotice('')
      setUser(null)
    }
  }

  function handleLoginSuccess(nextUser: AuthUser) {
    setAuthNotice('')
    setUser(nextUser)
  }

  if (isPublicPage) {
    return <PublicFiles theme={theme} onToggleTheme={toggleTheme} />
  }

  if (booting) {
    return null
  }

  if (!user) {
    return <Login onSuccess={handleLoginSuccess} notice={authNotice} theme={theme} onToggleTheme={toggleTheme} />
  }

  return <Dashboard user={user} onSignOut={handleSignOut} theme={theme} onToggleTheme={toggleTheme} />
}

export default App
