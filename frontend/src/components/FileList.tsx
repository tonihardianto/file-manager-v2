import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as api from '../lib/api'
import { MoreVertical, Download, Link2, Trash2, Star, Folder } from 'lucide-react'

export type FileMeta = {
  id: string
  systemName: string
  originalName: string
  size: number
  mimeType: string
  folderId?: number
  uploadedAt?: string
  deletedAt?: string
  downloadCount?: number
  shareCount?: number
  starred?: boolean
  isPublic?: boolean
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`
}

function fileExt(name: string): string {
  return name.split('.').pop()?.toUpperCase().slice(0, 4) ?? 'FILE'
}

type ColorScheme = { bg: string; color: string }

function extColors(mime: string): ColorScheme {
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
  if (!str) return ''
  try {
    return new Date(str).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return ''
  }
}

async function downloadFile(systemName: string) {
  const url = await api.generateLink(systemName)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.rel = 'noopener noreferrer'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

// using lucide icons for action menu

interface Props {
  files: FileMeta[]
  view: 'grid' | 'list'
  onDelete: (systemName: string) => void
  onGenerate: (systemName: string) => void
  onRequestMove?: (payload: { systemName: string; fileName: string; folderId?: number; folderLabel: string }) => void
  folderOptions?: Array<{ id: number; name: string }>
  getFolderLabel?: (folderId?: number) => string
  onToggleStar?: (systemName: string) => void
  onTogglePublic?: (systemName: string) => void
  isStarred?: (systemName: string) => boolean
  selectionEnabled?: boolean
  selectedSystemNames?: string[]
  onToggleSelect?: (systemName: string) => void
  onSelectAllVisible?: (systemNames: string[], checked: boolean) => void
}

export default function FileList({ files, view, onDelete, onGenerate, onRequestMove, folderOptions = [], getFolderLabel, onToggleStar, onTogglePublic, isStarred, selectionEnabled = false, selectedSystemNames = [], onToggleSelect, onSelectAllVisible }: Props) {
  if (!files.length) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '64px 24px',
        gap: 12,
        textAlign: 'center',
        borderRadius: 14,
        border: '1px dashed var(--c-border)',
        background: 'var(--c-panel-subtle)',
      }}>
        <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="var(--c-text-6)" strokeWidth={1.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <p style={{ fontSize: 14, color: 'var(--c-text-4)', margin: 0 }}>No files yet</p>
        <p style={{ fontSize: 12, color: 'var(--c-text-5)', margin: 0 }}>Upload something to get started</p>
      </div>
    )
  }

  if (view === 'grid') {
    return <GridView files={files} onDelete={onDelete} onGenerate={onGenerate} onRequestMove={onRequestMove} folderOptions={folderOptions} getFolderLabel={getFolderLabel} onToggleStar={onToggleStar} onTogglePublic={onTogglePublic} isStarred={isStarred} selectionEnabled={selectionEnabled} selectedSystemNames={selectedSystemNames} onToggleSelect={onToggleSelect} />
  }

  return <ListView files={files} onDelete={onDelete} onGenerate={onGenerate} onRequestMove={onRequestMove} folderOptions={folderOptions} getFolderLabel={getFolderLabel} onToggleStar={onToggleStar} onTogglePublic={onTogglePublic} isStarred={isStarred} selectionEnabled={selectionEnabled} selectedSystemNames={selectedSystemNames} onToggleSelect={onToggleSelect} onSelectAllVisible={onSelectAllVisible} />
}

function GridView({ files, onDelete, onGenerate, onRequestMove, folderOptions, getFolderLabel, onToggleStar, onTogglePublic, isStarred, selectionEnabled, selectedSystemNames, onToggleSelect }: Omit<Props, 'view' | 'onSelectAllVisible'>) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
      {files.map((f) => (
        <GridCard key={f.systemName} file={f} onDelete={onDelete} onGenerate={onGenerate} onRequestMove={onRequestMove} folderOptions={folderOptions} getFolderLabel={getFolderLabel} onToggleStar={onToggleStar} onTogglePublic={onTogglePublic} isStarred={isStarred} selectionEnabled={selectionEnabled} selected={selectedSystemNames?.includes(f.systemName) ?? false} onToggleSelect={onToggleSelect} />
      ))}
    </div>
  )
}

function GridCard({ file: f, onDelete, onGenerate, onRequestMove, folderOptions = [], getFolderLabel, onToggleStar, onTogglePublic, isStarred, selectionEnabled, selected, onToggleSelect }: {
  file: FileMeta
  onDelete: (s: string) => void
  onGenerate: (s: string) => void
  onRequestMove?: (payload: { systemName: string; fileName: string; folderId?: number; folderLabel: string }) => void
  folderOptions?: Array<{ id: number; name: string }>
  getFolderLabel?: (folderId?: number) => string
  onToggleStar?: (s: string) => void
  onTogglePublic?: (s: string) => void
  isStarred?: (s: string) => boolean
  selectionEnabled?: boolean
  selected?: boolean
  onToggleSelect?: (s: string) => void
}) {
  const [hover, setHover] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const starred = isStarred?.(f.systemName) ?? false

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        borderRadius: 12,
        overflow: 'visible',
        background: 'var(--c-panel)',
        border: `1px solid ${selected ? 'rgba(66,133,244,0.6)' : hover ? 'rgba(124,58,237,0.4)' : 'var(--c-border)'}`,
        padding: 14,
        cursor: 'default',
        transition: 'border-color 0.2s',
        zIndex: menuOpen || hover ? 12 : 1,
      }}
    >
      {selectionEnabled && onToggleSelect && (
        <label style={{ position: 'absolute', top: 8, left: 8, zIndex: 2, width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, background: 'var(--c-panel)', border: '1px solid var(--c-border)', cursor: 'pointer' }}>
          <input type="checkbox" checked={selected} onChange={() => onToggleSelect(f.systemName)} style={{ cursor: 'pointer' }} />
        </label>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
        <FileTypeBadge name={f.originalName} mime={f.mimeType} />
        <div style={{ width: '100%' }}>
          <p style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--c-text-2)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }} title={f.originalName}>
            {f.originalName}
          </p>
          <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--c-text-5)' }}>{formatBytes(f.size)}</p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--c-text-5)' }}>{f.downloadCount ?? 0}x downloaded</p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--c-text-5)' }}>{f.shareCount ?? 0}x shared</p>
          {getFolderLabel && <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--c-text-5)' }}>{getFolderLabel(f.folderId)}</p>}
        </div>
      </div>

      <div style={{ position: 'absolute', top: 8, right: 8, opacity: hover ? 1 : 0.9, transition: 'opacity 0.15s' }}>
        <ActionMenu
          file={f}
          starred={starred}
          onDelete={onDelete}
          onGenerate={onGenerate}
          onRequestMove={onRequestMove}
          folderOptions={folderOptions}
          onToggleStar={onToggleStar}
          onTogglePublic={onTogglePublic}
          compact
          onOpenChange={setMenuOpen}
        />
      </div>
    </div>
  )
}

function ListView({ files, onDelete, onGenerate, onRequestMove, folderOptions, getFolderLabel, onToggleStar, onTogglePublic, isStarred, selectionEnabled, selectedSystemNames, onToggleSelect, onSelectAllVisible }: Omit<Props, 'view'>) {
  const allVisibleSelected = files.length > 0 && files.every((f) => selectedSystemNames?.includes(f.systemName))
  const hasSomeSelected = files.some((f) => selectedSystemNames?.includes(f.systemName))
  const selectAllRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!selectAllRef.current) return
    selectAllRef.current.indeterminate = !allVisibleSelected && hasSomeSelected
  }, [allVisibleSelected, hasSomeSelected])

  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--c-border)' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: selectionEnabled ? '30px 1fr 90px 80px 120px 90px 80px auto' : '1fr 90px 80px 120px 90px 80px auto',
        gap: 12,
        padding: '8px 16px',
        background: 'var(--c-topbar)',
        borderBottom: '1px solid var(--c-border)',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--c-text-5)',
      }}>
        {selectionEnabled && (
          <span>
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allVisibleSelected}
              onChange={(e) => onSelectAllVisible?.(files.map((f) => f.systemName), e.target.checked)}
              aria-label="Select all files"
              style={{ cursor: 'pointer' }}
            />
          </span>
        )}
        <span>Name</span>
        <span>Folder</span>
        <span>Size</span>
        <span>Uploaded</span>
        <span>Downloads</span>
        <span>Shares</span>
        <span>Actions</span>
      </div>

      {files.map((f, i) => (
        <ListRow
          key={f.systemName}
          file={f}
          odd={i % 2 === 0}
          onDelete={onDelete}
          onGenerate={onGenerate}
          onRequestMove={onRequestMove}
          folderOptions={folderOptions}
          getFolderLabel={getFolderLabel}
          onToggleStar={onToggleStar}
          onTogglePublic={onTogglePublic}
          isStarred={isStarred}
          selectionEnabled={selectionEnabled}
          selected={selectedSystemNames?.includes(f.systemName) ?? false}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </div>
  )
}

function ListRow({ file: f, odd, onDelete, onGenerate, onRequestMove, folderOptions = [], getFolderLabel, onToggleStar, onTogglePublic, isStarred, selectionEnabled, selected, onToggleSelect }: {
  file: FileMeta
  odd: boolean
  onDelete: (s: string) => void
  onGenerate: (s: string) => void
  onRequestMove?: (payload: { systemName: string; fileName: string; folderId?: number; folderLabel: string }) => void
  folderOptions?: Array<{ id: number; name: string }>
  getFolderLabel?: (folderId?: number) => string
  onToggleStar?: (s: string) => void
  onTogglePublic?: (s: string) => void
  isStarred?: (s: string) => boolean
  selectionEnabled?: boolean
  selected?: boolean
  onToggleSelect?: (s: string) => void
}) {
  const [hover, setHover] = useState(false)
  const starred = isStarred?.(f.systemName) ?? false

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: selectionEnabled ? '30px 1fr 90px 80px 120px 90px 80px auto' : '1fr 90px 80px 120px 90px 80px auto',
        gap: 12,
        padding: '10px 16px',
        alignItems: 'center',
        background: selected ? 'rgba(66,133,244,0.1)' : hover ? 'var(--c-input-bg)' : odd ? 'var(--c-panel)' : 'var(--c-panel-subtle)',
        borderBottom: '1px solid var(--c-border-subtle)',
        transition: 'background 0.1s',
      }}
    >
      {selectionEnabled && (
        <span>
          <input type="checkbox" checked={selected} onChange={() => onToggleSelect?.(f.systemName)} aria-label={`Select ${f.originalName}`} style={{ cursor: 'pointer' }} />
        </span>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <FileTypeBadge name={f.originalName} mime={f.mimeType} />
        <div style={{ minWidth: 0 }}>
          <p style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--c-text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }} title={f.originalName}>
            {f.originalName}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--c-text-5)' }}>{f.mimeType}</p>
        </div>
      </div>
      <span style={{ fontSize: 12, color: 'var(--c-text-4)' }}>{getFolderLabel ? getFolderLabel(f.folderId) : '-'}</span>
      <span style={{ fontSize: 12, color: 'var(--c-text-4)' }}>{formatBytes(f.size)}</span>
      <span style={{ fontSize: 12, color: 'var(--c-text-4)' }}>{formatDate(f.uploadedAt)}</span>
      <span style={{ fontSize: 12, color: 'var(--c-text-4)' }}>{f.downloadCount ?? 0}x</span>
      <span style={{ fontSize: 12, color: 'var(--c-text-4)' }}>{f.shareCount ?? 0}x</span>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <ActionMenu
          file={f}
          starred={starred}
          onDelete={onDelete}
          onGenerate={onGenerate}
          onRequestMove={onRequestMove}
          folderOptions={folderOptions}
          onToggleStar={onToggleStar}
          onTogglePublic={onTogglePublic}
        />
      </div>
    </div>
  )
}

function ActionMenu({
  file,
  starred,
  onDelete,
  onGenerate,
  onRequestMove,
  folderOptions,
  onToggleStar,
  onTogglePublic,
  compact = false,
  onOpenChange,
}: {
  file: FileMeta
  starred: boolean
  onDelete: (systemName: string) => void
  onGenerate: (systemName: string) => void
  onRequestMove?: (payload: { systemName: string; fileName: string; folderId?: number; folderLabel: string }) => void
  folderOptions?: Array<{ id: number; name: string }>
  onToggleStar?: (systemName: string) => void
  onTogglePublic?: (systemName: string) => void
  compact?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const dropRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const [moveTarget, setMoveTarget] = useState('')

  function handleToggle() {
    if (open) { setOpen(false); return }
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const approxHeight = 220
    const spaceBelow = window.innerHeight - rect.bottom
    const top = spaceBelow >= approxHeight ? rect.bottom + 4 : rect.top - approxHeight - 4
    setMenuPos({ top, right: window.innerWidth - rect.right })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onDocMouseDown = (event: MouseEvent) => {
      if (btnRef.current?.contains(event.target as Node)) return
      if (dropRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [open])

  useEffect(() => {
    onOpenChange?.(open)
  }, [open, onOpenChange])

  function requestMove() {
    if (!onRequestMove || !moveTarget) return
    if (moveTarget === 'root') {
      onRequestMove({
        systemName: file.systemName,
        fileName: file.originalName,
        folderId: undefined,
        folderLabel: 'Root',
      })
      setMoveTarget('')
      setOpen(false)
      return
    }
    const targetId = Number(moveTarget)
    const targetLabel = folderOptions?.find((folder) => folder.id === targetId)?.name ?? 'Unknown'
    onRequestMove({
      systemName: file.systemName,
      fileName: file.originalName,
      folderId: targetId,
      folderLabel: targetLabel,
    })
    setMoveTarget('')
    setOpen(false)
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        title="Actions"
        onClick={handleToggle}
        className="fm-action-trigger"
        style={{
          width: compact ? 28 : 30,
          height: compact ? 28 : 30,
          borderRadius: 8,
          border: '1px solid var(--c-border)',
          background: 'var(--c-panel)',
          color: 'var(--c-text-3)',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MoreVertical size={16} />
      </button>

      {open && menuPos && createPortal(
        <div ref={dropRef} style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, minWidth: 190, zIndex: 9999, borderRadius: 10, border: '1px solid var(--c-border)', background: 'var(--c-panel)', boxShadow: '0 10px 26px rgba(0,0,0,0.32)', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {onToggleStar && (
            <button className="fm-action-item" onClick={() => { onToggleStar(file.systemName); setOpen(false) }} style={{ border: 'none', background: 'transparent', color: 'var(--c-text-3)', cursor: 'pointer', textAlign: 'left', fontSize: 12, padding: '6px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Star size={14} />
              <span>{starred ? 'Unstar' : 'Star'}</span>
            </button>
          )}
          {onTogglePublic && (
            <button className="fm-action-item" onClick={() => { onTogglePublic(file.systemName); setOpen(false) }} style={{ border: 'none', background: 'transparent', color: file.isPublic ? '#f59e0b' : 'var(--c-text-3)', cursor: 'pointer', textAlign: 'left', fontSize: 12, padding: '6px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Link2 size={14} />
              <span>{file.isPublic ? 'Set private' : 'Set public'}</span>
            </button>
          )}
          <button className="fm-action-item" onClick={() => { void downloadFile(file.systemName); setOpen(false) }} style={{ border: 'none', background: 'transparent', color: 'var(--c-text-3)', cursor: 'pointer', textAlign: 'left', fontSize: 12, padding: '6px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Download size={14} />
            <span>Download</span>
          </button>
          <button className="fm-action-item" onClick={() => { onGenerate(file.systemName); setOpen(false) }} style={{ border: 'none', background: 'transparent', color: 'var(--c-text-3)', cursor: 'pointer', textAlign: 'left', fontSize: 12, padding: '6px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link2 size={14} />
            <span>Share link</span>
          </button>
          <button className="fm-action-item fm-action-item-danger" onClick={() => { onDelete(file.systemName); setOpen(false) }} style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', textAlign: 'left', fontSize: 12, padding: '6px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Trash2 size={14} />
            <span>Delete</span>
          </button>

          {onRequestMove && !!folderOptions?.length && (
            <div style={{ borderTop: '1px solid var(--c-border-subtle)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <select
                value={moveTarget}
                onChange={(e) => setMoveTarget(e.target.value)}
                style={{ border: '1px solid var(--c-border)', borderRadius: 8, padding: '6px 8px', background: 'var(--c-panel)', color: 'var(--c-text-3)', fontSize: 12 }}
              >
                <option value="">Move to...</option>
                <option value="root">Root</option>
                {folderOptions.map((folder) => (
                  <option key={folder.id} value={String(folder.id)}>{folder.name}</option>
                ))}
              </select>
              <button
                onClick={requestMove}
                disabled={!moveTarget}
                style={{ border: '1px solid rgba(20, 143, 98, 0.5)', borderRadius: 8, padding: '6px 8px', cursor: !moveTarget ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700, background: 'rgba(14,116,144,0.14)', color: '#8bb2e9', opacity: !moveTarget ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                <Folder size={14} />
                <span>Move</span>
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
