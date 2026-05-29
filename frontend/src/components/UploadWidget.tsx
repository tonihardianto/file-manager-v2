import { useState } from 'react'
import type { UploadEntry } from './UploadDropzone'

interface Props {
  entries: UploadEntry[]
  onDismiss: () => void
}

export default function UploadWidget({ entries, onDismiss }: Props) {
  const [collapsed, setCollapsed] = useState(false)

  if (!entries.length) return null

  const total = entries.length
  const doneCount = entries.filter((e) => e.status === 'done').length
  const errorCount = entries.filter((e) => e.status === 'error').length
  const completedCount = doneCount + errorCount
  const isComplete = completedCount === total

  // Overall percent: average of all file percents
  const overallPercent = isComplete
    ? 100
    : Math.round(entries.reduce((sum, e) => sum + (e.percent ?? 0), 0) / total)

  // "Mengunggah X dari N": X = files done + 1 (current)
  const currentIndex = Math.min(doneCount + 1, total)

  const allFailed = isComplete && errorCount === total
  const allOk = isComplete && errorCount === 0

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 1000,
        width: 320,
        borderRadius: 16,
        border: '1px solid var(--c-border)',
        background: 'var(--c-panel)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.28)',
        overflow: 'hidden',
      }}
    >
      {/* ── Header ─────────────────────────────────────────── */}
      <div
        style={{
          padding: '11px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'var(--c-panel-subtle)',
          borderBottom: collapsed ? 'none' : '1px solid var(--c-border-subtle)',
        }}
      >
        {/* Leading icon */}
        {isComplete ? (
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              flexShrink: 0,
              background: allFailed ? 'rgba(220,38,38,0.15)' : 'rgba(34,197,94,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {allFailed ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth={2.5}>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        ) : (
          /* Spinning arc */
          <svg
            width="22"
            height="22"
            viewBox="0 0 22 22"
            style={{ flexShrink: 0, animation: 'spin 1s linear infinite' }}
          >
            <circle cx="11" cy="11" r="9" fill="none" stroke="var(--c-border)" strokeWidth="2.5" />
            <path
              d="M11 2 A9 9 0 0 1 20 11"
              fill="none"
              stroke="#4285f4"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        )}

        {/* Title */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--c-text-2)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {isComplete
              ? allOk
                ? `Upload selesai — ${doneCount} file berhasil`
                : `Upload selesai — ${doneCount} berhasil, ${errorCount} gagal`
              : `Mengunggah ${currentIndex} dari ${total} file (${overallPercent}% Selesai)`}
          </div>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Tampilkan detail' : 'Sembunyikan detail'}
          style={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: 'var(--c-text-4)',
            padding: 4,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            {collapsed
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />}
          </svg>
        </button>

        {/* Close (only when complete) */}
        {isComplete && (
          <button
            onClick={onDismiss}
            title="Tutup"
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: 'var(--c-text-4)',
              padding: 4,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {!collapsed && (
        <>
          {/* ── Global progress bar ───────────────────────────── */}
          <div
            style={{
              padding: '8px 14px 10px',
              background: 'var(--c-panel-subtle)',
              borderBottom: '1px solid var(--c-border-subtle)',
            }}
          >
            <div
              style={{
                height: 5,
                borderRadius: 999,
                background: 'rgba(71,85,105,0.35)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  borderRadius: 999,
                  width: `${overallPercent}%`,
                  background: allFailed ? '#ef4444' : '#4285f4',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>

          {/* ── Per-file list ─────────────────────────────────── */}
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {entries.map((entry, i) => {
              const st = entry.status ?? 'pending'
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 14px',
                    borderBottom: i < entries.length - 1 ? '1px solid var(--c-border-subtle)' : 'none',
                  }}
                >
                  {/* Status icon */}
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {st === 'done' && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {st === 'error' && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth={2.5}>
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    )}
                    {st === 'uploading' && (
                      <div
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          border: '2px solid var(--c-border)',
                          borderTopColor: '#4285f4',
                          animation: 'spin 0.8s linear infinite',
                        }}
                      />
                    )}
                    {st === 'pending' && (
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: 'var(--c-border)',
                          opacity: 0.5,
                        }}
                      />
                    )}
                  </div>

                  {/* Filename + progress bar */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--c-text-2)',
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {entry.name}
                    </div>
                    {st === 'uploading' && (
                      <div
                        style={{
                          marginTop: 3,
                          height: 2,
                          borderRadius: 999,
                          background: 'var(--c-border)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            borderRadius: 999,
                            background: '#4285f4',
                            width: `${entry.percent}%`,
                            transition: 'width 0.2s ease',
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Right label */}
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      flexShrink: 0,
                      color:
                        st === 'done'
                          ? '#22c55e'
                          : st === 'error'
                          ? '#ef4444'
                          : 'var(--c-text-5)',
                    }}
                  >
                    {st === 'done'
                      ? 'OK'
                      : st === 'error'
                      ? 'Gagal'
                      : st === 'pending'
                      ? 'Tunggu'
                      : `${entry.percent}%`}
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
