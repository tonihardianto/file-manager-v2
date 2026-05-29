import { useEffect, useRef, useState } from 'react'

interface Props {
  url: string
  onClose: () => void
}

export default function CopyLinkModal({ url, onClose }: Props) {
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.select() }, [])

  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  function onBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      onClick={onBackdrop}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: 440, borderRadius: 18,
          background: 'var(--c-panel)',
          border: '1px solid var(--c-border)',
          boxShadow: '0 32px 64px rgba(0,0,0,0.4), 0 0 0 1px rgba(124,58,237,0.1)',
          padding: 24,
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9,
              background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#a78bfa" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--c-text-bright)' }}>Share link generated</h3>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--c-text-4)' }}>Valid for 5 minutes</p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 7, border: 'none',
              background: 'var(--c-input-bg)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-text-4)',
            }}
          >
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Info banner */}
        <div style={{
          padding: '10px 12px', borderRadius: 9, marginBottom: 16,
          background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)',
          fontSize: 12, color: '#fbbf24', display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 3a9 9 0 110 18A9 9 0 0112 3z" />
          </svg>
          Share with authorized recipients only. Link expires in 5 minutes.
        </div>

        {/* URL input + copy */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={inputRef}
            readOnly
            value={url}
            style={{
              flex: 1, minWidth: 0, padding: '9px 12px', borderRadius: 9,
              background: 'var(--c-input-bg)',
              border: '1px solid var(--c-border)',
              fontSize: 12, color: 'var(--c-text-3)', outline: 'none',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          />
          <button
            onClick={copy}
            style={{
              padding: '9px 18px', borderRadius: 9, border: 'none', flexShrink: 0,
              background: copied
                ? 'linear-gradient(135deg,#10b981,#059669)'
                : 'linear-gradient(135deg,#7c3aed,#6d28d9)',
              color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              boxShadow: copied
                ? '0 4px 16px rgba(16,185,129,0.3)'
                : '0 4px 16px rgba(124,58,237,0.3)',
              transition: 'all 0.2s',
            }}
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  )
}

