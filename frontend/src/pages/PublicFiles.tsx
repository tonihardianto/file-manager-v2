import { useEffect, useMemo, useState } from 'react'
import type { Theme } from '../App'
import * as api from '../lib/api'
import type { FileMeta } from '../components/FileList'
import { Download } from 'lucide-react'

interface Props {
  theme: Theme
  onToggleTheme: () => void
}

export default function PublicFiles({ theme, onToggleTheme }: Props) {
  const [loading, setLoading] = useState(true)
  const [files, setFiles] = useState<FileMeta[]>([])
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [view, setView] = useState<'list' | 'grid'>('list')

  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError('')
      try {
        const list = await api.fetchPublicFiles()
        if (!cancelled) setFiles(list)
      } catch {
        if (!cancelled) setError('Failed to load public files')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const shownFiles = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return files
    return files.filter((f) => f.originalName.toLowerCase().includes(query))
  }, [files, search])

  const effectiveView = isMobile ? 'grid' : view

  async function handleDownload(systemName: string) {
    try {
      const url = await api.generatePublicLink(systemName)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.rel = 'noopener noreferrer'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    } catch {
      setError('Failed to generate download link')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg-page-grad)', color: 'var(--c-text)' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--c-border-subtle)', background: 'var(--c-topbar)', backdropFilter: 'blur(8px)' }}>
        <div>
          <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c-text-5)', fontWeight: 700 }}>Public Files</p>
          <h1 style={{ margin: '2px 0 0', fontSize: 18, color: 'var(--c-text-bright)' }}>Shared Files</h1>
        </div>
        <button onClick={onToggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid var(--c-border)', background: 'var(--c-panel)', cursor: 'pointer', color: 'var(--c-text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {theme === 'dark' ? (
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="5" /><path strokeLinecap="round" d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
          ) : (
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" /></svg>
          )}
        </button>
      </header>

      <main style={{ maxWidth: 1320, margin: '0 auto', padding: '16px 12px 28px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search public files"
          style={{ width: '100%', padding: '10px 12px', borderRadius: 25, border: '1px solid var(--c-border)', background: 'var(--c-panel)', color: 'var(--c-text-2)', fontSize: 13, outline: 'none' }}
        />

        {error && (
          <div style={{ borderRadius: 10, border: '1px solid rgba(220,38,38,0.35)', background: 'rgba(220,38,38,0.12)', color: '#ef4444', padding: '10px 12px', fontSize: 12 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ borderRadius: 12, border: '1px solid var(--c-border)', background: 'var(--c-panel)', padding: 20, fontSize: 13, color: 'var(--c-text-4)' }}>
            Loading public files...
          </div>
        ) : shownFiles.length === 0 ? (
          <div style={{ borderRadius: 12, border: '1px dashed var(--c-border)', background: 'var(--c-panel-subtle)', padding: 20, fontSize: 13, color: 'var(--c-text-4)', textAlign: 'center' }}>
            No public files available.
          </div>
        ) : (
          <div style={{ borderRadius: 18, border: '1px solid var(--c-border)', background: 'var(--c-panel)', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c-text-5)' }}>
                Public Files
                <span style={{ padding: '2px 8px', borderRadius: 999, background: 'rgba(66,133,244,0.15)', color: '#4285f4', fontSize: 11 }}>{shownFiles.length}</span>
              </div>

              <div style={{ display: 'inline-flex', gap: 4, padding: 3, borderRadius: 999, border: '1px solid var(--c-border)', background: 'var(--c-view-toggle)' }}>
                {(isMobile ? (['grid'] as const) : (['list', 'grid'] as const)).map((v) => (
                  <button key={v} onClick={() => setView(v)} style={{ border: 'none', borderRadius: 999, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: effectiveView === v ? 'var(--c-view-active)' : 'transparent', color: effectiveView === v ? '#1a73e8' : 'var(--c-text-4)' }}>
                    {v === 'list' ? 'List' : 'Grid'}
                  </button>
                ))}
              </div>
            </div>

            {effectiveView === 'list' ? (
              <>

              <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--c-border)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px 110px 140px 90px', gap: 12, padding: '10px 16px', background: 'var(--c-topbar)', borderBottom: '1px solid var(--c-border)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--c-text-5)' }}>
                  <span>Name</span>
                  <span>MIME Type</span>
                  <span>Size</span>
                  <span>Uploaded</span>
                  <span style={{ textAlign: 'right' }}>Action</span>
                </div>

                {shownFiles.map((file, index) => (
                  <div key={file.systemName} style={{ display: 'grid', gridTemplateColumns: '1fr 220px 110px 140px 90px', gap: 12, padding: '12px 16px', alignItems: 'center', borderBottom: index === shownFiles.length - 1 ? 'none' : '1px solid var(--c-border-subtle)', background: index % 2 === 0 ? 'var(--c-panel)' : 'var(--c-panel-subtle)' }}>
                    <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
                      <FileTypeBadge name={file.originalName} mime={file.mimeType} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, color: 'var(--c-text-2)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.originalName}>{file.originalName}</div>
                      </div>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--c-text-5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.mimeType || '-'}</span>
                    <span style={{ fontSize: 13, color: 'var(--c-text-4)' }}>{formatBytes(file.size)}</span>
                    <span style={{ fontSize: 13, color: 'var(--c-text-4)' }}>{formatDate(file.uploadedAt)}</span>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button onClick={() => void handleDownload(file.systemName)} title="Download" style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--c-border)', background: 'var(--c-panel)', color: '#4285f4', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <Download size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              </>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {shownFiles.map((file) => (
                <article key={file.systemName} style={{ borderRadius: 12, border: '1px solid var(--c-border)', background: 'var(--c-panel)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <FileTypeBadge name={file.originalName} mime={file.mimeType} />
                      <h2 style={{ margin: 0, fontSize: 13, color: 'var(--c-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={file.originalName}>
                        {file.originalName}
                      </h2>
                    </div>
                    <button onClick={() => void handleDownload(file.systemName)} title="Download" style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-panel-subtle)', color: '#4285f4', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                      <Download size={14} />
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--c-text-5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.mimeType}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--c-text-4)' }}>
                    <span>{formatBytes(file.size)}</span>
                    <span>{formatDate(file.uploadedAt)}</span>
                  </div>
                </article>
              ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

function fileExt(name: string): string {
  return name.split('.').pop()?.toUpperCase().slice(0, 4) ?? 'FILE'
}

function extColors(mime: string): { bg: string; color: string } {
  if (mime.startsWith('image/')) return { bg: 'rgba(16,185,129,0.15)', color: '#34d399' }
  if (mime === 'application/pdf') return { bg: 'rgba(239,68,68,0.15)', color: '#f87171' }
  if (mime.includes('zip') || mime.includes('tar') || mime.includes('gzip')) return { bg: 'rgba(251,146,60,0.15)', color: '#fb923c' }
  if (mime.startsWith('text/')) return { bg: 'rgba(96,165,250,0.15)', color: '#60a5fa' }
  if (mime.includes('spreadsheet') || mime.includes('excel')) return { bg: 'rgba(52,211,153,0.15)', color: '#34d399' }
  if (mime.includes('word') || mime.includes('document')) return { bg: 'rgba(129,140,248,0.15)', color: '#818cf8' }
  return { bg: 'rgba(148,163,184,0.1)', color: '#94a3b8' }
}

function FileTypeBadge({ name, mime }: { name: string; mime: string }) {
  const { bg, color } = extColors(mime)
  return (
    <div style={{
      width: 40,
      height: 40,
      borderRadius: 10,
      flexShrink: 0,
      background: bg,
      border: `1px solid ${color}44`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 9,
      fontWeight: 800,
      color,
      letterSpacing: '0.05em',
    }}>
      {fileExt(name)}
    </div>
  )
}

function formatDate(str?: string): string {
  if (!str) return '-'
  try {
    return new Date(str).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return '-'
  }
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1)
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`
}
