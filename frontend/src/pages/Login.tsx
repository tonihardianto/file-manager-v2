import { useState } from 'react'
import type { AuthUser, Theme } from '../App'
import * as api from '../lib/api'

interface Props {
  onSuccess: (user: AuthUser) => void
  notice?: string
  theme: Theme
  onToggleTheme: () => void
}

export default function Login({ onSuccess, notice, theme, onToggleTheme }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password.trim()) {
      setError('Username and password are required.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const user = await api.login(username.trim(), password)
      onSuccess(user)
    } catch {
      setError('Invalid credentials. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 16,
        background: 'var(--c-bg-page-grad)',
        transition: 'background 0.3s',
      }}
    >
      {/* Glow blobs — only visible in dark */}
      {theme === 'dark' && (
        <>
          <div style={{
            pointerEvents: 'none', position: 'fixed',
            top: '-120px', left: '50%', transform: 'translateX(-50%)',
            width: '600px', height: '400px',
            background: 'radial-gradient(ellipse, rgba(124,58,237,0.15) 0%, transparent 70%)',
            borderRadius: '50%', filter: 'blur(40px)',
          }} />
          <div style={{
            pointerEvents: 'none', position: 'fixed',
            bottom: '-80px', right: '-80px',
            width: '400px', height: '400px',
            background: 'radial-gradient(ellipse, rgba(59,130,246,0.08) 0%, transparent 70%)',
            borderRadius: '50%', filter: 'blur(40px)',
          }} />
        </>
      )}

      {/* Theme toggle — top right */}
      <button
        onClick={onToggleTheme}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        style={{
          position: 'fixed', top: 16, right: 16,
          width: 36, height: 36, borderRadius: 9,
          border: '1px solid var(--c-border)',
          background: 'var(--c-panel)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--c-text-4)', transition: 'all 0.15s',
          backdropFilter: 'blur(8px)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(124,58,237,0.5)'; e.currentTarget.style.color = '#a78bfa' }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--c-border)'; e.currentTarget.style.color = 'var(--c-text-4)' }}
      >
        {theme === 'dark' ? (
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="5" />
            <path strokeLinecap="round" d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        ) : (
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
          </svg>
        )}
      </button>

      <div style={{ position: 'relative', width: '100%', maxWidth: 360 }}>
        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, marginBottom: 16,
            background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
            boxShadow: '0 0 32px rgba(124,58,237,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--c-text-bright)', letterSpacing: '-0.02em' }}>
            FileManager
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--c-text-4)' }}>
            Internal access · secure storage
          </p>
        </div>

        {/* Card */}
        <div style={{
          borderRadius: 18, padding: 32,
          background: 'var(--c-panel)',
          border: '1px solid var(--c-border)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 25px 50px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.03)',
          transition: 'background 0.2s, border-color 0.2s',
        }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 600, color: 'var(--c-text-bright)' }}>
            Sign in
          </h2>
          <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--c-text-4)' }}>
            Use your company credentials
          </p>

          {notice && (
            <div style={{
              marginBottom: 12, padding: '10px 14px', borderRadius: 10, fontSize: 13,
              background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.28)', color: '#60a5fa',
            }}>
              {notice}
            </div>
          )}

          {error && (
            <div style={{
              marginBottom: 20, padding: '10px 14px', borderRadius: 10, fontSize: 13,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171',
            }}>
              {error}
            </div>
          )}

          <form onSubmit={submit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 6, color: 'var(--c-text-3)' }}>
                Username
              </label>
              <input
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. john.doe"
                style={{
                  display: 'block', width: '100%', padding: '10px 14px', borderRadius: 10,
                  background: 'var(--c-input-bg)',
                  border: '1px solid var(--c-border)',
                  color: 'var(--c-text)', fontSize: 14, outline: 'none',
                  transition: 'border-color 0.15s',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(124,58,237,0.8)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--c-border)')}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 6, color: 'var(--c-text-3)' }}>
                Password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  display: 'block', width: '100%', padding: '10px 14px', borderRadius: 10,
                  background: 'var(--c-input-bg)',
                  border: '1px solid var(--c-border)',
                  color: 'var(--c-text)', fontSize: 14, outline: 'none',
                  transition: 'border-color 0.15s',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(124,58,237,0.8)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--c-border)')}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                display: 'block', width: '100%', padding: 11, borderRadius: 10,
                background: loading ? 'rgba(124,58,237,0.5)' : 'linear-gradient(135deg,#7c3aed,#6d28d9)',
                border: 'none', color: 'white',
                fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: loading ? 'none' : '0 4px 20px rgba(124,58,237,0.35)',
                transition: 'all 0.2s',
              }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, marginTop: 24, color: 'var(--c-text-6)' }}>
          © {new Date().getFullYear()} Internal FileManager · All rights reserved
        </p>
      </div>
    </div>
  )
}
