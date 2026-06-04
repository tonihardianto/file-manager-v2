import { useCallback, useRef, useState } from 'react'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`
}

// Progress entries passed from Dashboard: array aligned to queued files
export interface UploadEntry {
  name: string
  percent: number  // 0-100
  status?: 'pending' | 'uploading' | 'done' | 'error'
}

interface Props {
  onUpload: (files: File[]) => Promise<void>
  progress?: UploadEntry[]  // non-empty while uploading
}

export default function UploadDropzone({ onUpload, progress }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const [staged, setStaged] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)

  const hasProgress = Boolean(progress && progress.length > 0)
  const hasInFlightProgress = Boolean(progress?.some((entry) => {
    const st = entry.status ?? 'pending'
    return st === 'pending' || st === 'uploading' || (entry.percent ?? 0) < 100
  }))
  const isComplete = hasProgress && !hasInFlightProgress
  const isActive = uploading || hasInFlightProgress

  // ── Staging ────────────────────────────────────────────────────────────

  const addFiles = useCallback((incoming: File[]) => {
    setStaged((prev) => {
      const names = new Set(prev.map((f) => f.name))
      return [...prev, ...incoming.filter((f) => !names.has(f.name))]
    })
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length) addFiles(files)
  }, [addFiles])

  function removeStaged(name: string) {
    setStaged((prev) => prev.filter((f) => f.name !== name))
  }

  // ── Upload ─────────────────────────────────────────────────────────────

  async function startUpload() {
    if (!staged.length || uploading) return
    const toUpload = [...staged]
    setStaged([])
    setUploading(true)
    try {
      await onUpload(toUpload)
    } finally {
      setUploading(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  const overallPercent = progress && progress.length > 0
    ? Math.round(progress.reduce((sum, e) => sum + (e.percent ?? 0), 0) / progress.length)
    : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false) }}
        onDrop={onDrop}
        onClick={() => !isActive && inputRef.current?.click()}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 12, padding: '28px 24px', borderRadius: 14,
          cursor: isActive ? 'default' : 'pointer',
          transition: 'all 0.2s',
          border: `2px dashed ${dragging ? 'rgba(124,58,237,0.7)' : isActive ? 'rgba(124,58,237,0.35)' : 'var(--c-border)'}`,
          background: dragging ? 'rgba(124,58,237,0.05)' : 'var(--c-panel-subtle)',
        }}
      >
        <div style={{
          width: 44, height: 44, borderRadius: 11,
          background: dragging ? 'rgba(124,58,237,0.15)' : isActive ? 'rgba(124,58,237,0.1)' : 'var(--c-input-bg)',
          border: `1px solid ${dragging ? 'rgba(124,58,237,0.4)' : isActive ? 'rgba(124,58,237,0.3)' : 'var(--c-border)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.2s',
        }}>
          {isActive && !dragging ? (
            <svg width="22" height="22" viewBox="0 0 22 22" style={{ animation: 'spin 1s linear infinite' }}>
              <circle cx="11" cy="11" r="9" fill="none" stroke="rgba(124,58,237,0.25)" strokeWidth="2.5" />
              <path d="M11 2 A9 9 0 0 1 20 11" fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24"
              stroke={dragging ? '#a78bfa' : 'var(--c-text-4)'} strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          )}
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: dragging ? '#c4b5fd' : 'var(--c-text-3)' }}>
            {dragging ? 'Release to stage' : isActive ? `Upload in progress… ${overallPercent}%` : isComplete ? 'Upload complete' : 'Drop files here'}
          </p>
          {isActive && !dragging ? (
            <div style={{ marginTop: 8, width: 160, height: 3, borderRadius: 999, background: 'var(--c-border)', overflow: 'hidden', margin: '8px auto 0' }}>
              <div style={{ height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#7c3aed,#a78bfa)', width: `${overallPercent}%`, transition: 'width 0.3s ease' }} />
            </div>
          ) : (
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--c-text-5)' }}>
              {isComplete ? 'Ready for next upload' : (
                <>
                  or{' '}
                  <span style={{ color: '#7c3aed', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                    browse files
                  </span>
                  {' '}· max 1 GB or 1024 MB per file
                </>
              )}
            </p>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => { if (e.target.files) { addFiles(Array.from(e.target.files)); e.target.value = '' } }}
          style={{ display: 'none' }}
        />
      </div>

      {/* ── Staged queue ─────────────────────────────────────── */}
      {staged.length > 0 && !isActive && (
        <div style={{
          borderRadius: 12, overflow: 'hidden',
          border: '1px solid var(--c-border)',
          background: 'var(--c-panel)',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px',
            borderBottom: '1px solid var(--c-border-subtle)',
            background: 'var(--c-topbar)',
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-3)' }}>
              {staged.length} file{staged.length > 1 ? 's' : ''} queued
            </span>
            <button
              onClick={() => setStaged([])}
              style={{
                fontSize: 11, color: 'var(--c-text-4)', background: 'none',
                border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4,
              }}
            >
              Clear all
            </button>
          </div>

          {/* File rows */}
          {staged.map((f) => (
            <div key={f.name} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 14px',
              borderBottom: '1px solid var(--c-border-subtle)',
            }}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="var(--c-text-5)" strokeWidth={1.8} style={{ flexShrink: 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <span style={{
                flex: 1, fontSize: 12, color: 'var(--c-text-2)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {f.name}
              </span>
              <span style={{ fontSize: 11, color: 'var(--c-text-5)', flexShrink: 0 }}>
                {formatBytes(f.size)}
              </span>
              <button
                onClick={() => removeStaged(f.name)}
                title="Remove"
                style={{
                  width: 22, height: 22, borderRadius: 5, border: 'none',
                  background: 'none', cursor: 'pointer', flexShrink: 0, padding: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--c-text-5)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = 'rgba(220,38,38,0.1)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--c-text-5)'; e.currentTarget.style.background = 'none' }}
              >
                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}

          {/* Upload button */}
          <div style={{ padding: '10px 14px' }}>
            <button
              onClick={startUpload}
              style={{
                width: '100%', padding: '9px', borderRadius: 9, border: 'none',
                background: 'linear-gradient(135deg,#7c3aed,#6d28d9)',
                color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(124,58,237,0.3)',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              Upload {staged.length} file{staged.length > 1 ? 's' : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
