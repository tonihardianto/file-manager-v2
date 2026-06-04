import { useCallback, useEffect, useState } from 'react'
import type { AuthUser, Theme } from '../App'
import UploadDropzone, { type UploadEntry } from '../components/UploadDropzone'
import UploadWidget from '../components/UploadWidget'
import FileList from '../components/FileList'
import type { FileMeta } from '../components/FileList'
import CopyLinkModal from '../components/CopyLinkModal'
import * as api from '../lib/api'
import { Folder, HardDrive, Clock, Share2, Star, Trash2 } from 'lucide-react'

interface Props {
  user: AuthUser
  onSignOut: () => void
  theme: Theme
  onToggleTheme: () => void
}

type DriveSection = 'my-drive' | 'recent' | 'shared' | 'starred' | 'trash'
type TrashItem = FileMeta & { deletedAt: string }
type FolderFilterMode = 'all' | 'root' | 'folder'
type ToastKind = 'success' | 'error'
type ToastItem = { id: string; kind: ToastKind; message: string }
type FolderItem = api.FolderItem

const VIEW_KEY = 'fm_view'

function readViewMode(): 'grid' | 'list' {
  try {
    const raw = localStorage.getItem(VIEW_KEY)
    return raw === 'grid' ? 'grid' : 'list'
  } catch {
    return 'list'
  }
}

function makeToast(kind: ToastKind, message: string): ToastItem {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    message,
  }
}

function pushToast(setToasts: React.Dispatch<React.SetStateAction<ToastItem[]>>, kind: ToastKind, message: string) {
  setToasts((prev) => [...prev, makeToast(kind, message)].slice(-3))
}

const PAGE_SIZE = 5

export default function Dashboard({ user, onSignOut, theme, onToggleTheme }: Props) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(max-width: 900px)').matches
  })
  const [files, setFiles] = useState<FileMeta[]>([])
  // allFilesSnapshot: full unfiltered file list, used only for sidebar counts.
  // Never changes when entering a folder or switching sections.
  const [allFilesSnapshot, setAllFilesSnapshot] = useState<FileMeta[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [globalTotalCount, setGlobalTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [uploadProgress, setUploadProgress] = useState<UploadEntry[]>([])
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [folders, setFolders] = useState<FolderItem[]>([])
  const [folderFilterMode, setFolderFilterMode] = useState<FolderFilterMode>('all')
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [view, setView] = useState<'grid' | 'list'>(() => readViewMode())
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [activeSection, setActiveSection] = useState<DriveSection>('my-drive')
  const [selectMode, setSelectMode] = useState(false)
  const [starredCount, setStarredCount] = useState(0)
  const [sharedCount, setSharedCount] = useState(0)
  const [trash, setTrash] = useState<TrashItem[]>([])
  const [selectedSystemNames, setSelectedSystemNames] = useState<string[]>([])
  const [deleteTargets, setDeleteTargets] = useState<FileMeta[]>([])
  const [trashSelectMode, setTrashSelectMode] = useState(false)
  const [selectedTrashNames, setSelectedTrashNames] = useState<string[]>([])
  const [moveTargetFolder, setMoveTargetFolder] = useState<string>('')
  const [movingSelected, setMovingSelected] = useState(false)
  const [moveConfirm, setMoveConfirm] = useState<
    | { systemName: string; fileName: string; folderId?: number; folderLabel: string }
    | null
  >(null)
  const [movingSingle, setMovingSingle] = useState(false)
  const [trashConfirmAction, setTrashConfirmAction] = useState<
    | { kind: 'single-delete'; systemName: string; fileName: string }
    | { kind: 'bulk-delete'; count: number }
    | { kind: 'empty-trash'; count: number }
    | null
  >(null)
  const [restoreTargets, setRestoreTargets] = useState<TrashItem[]>([])
  const [restoring, setRestoring] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showScrollTop, setShowScrollTop] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const searchQuery = debouncedSearch.trim()
    const folderId = activeSection === 'my-drive' && folderFilterMode === 'folder' && selectedFolderId !== null
      ? selectedFolderId
      : undefined

    // Paginate only when showing unfiltered My Drive or Recent (no folder or root filter).
    const usePagination = (activeSection === 'my-drive' || activeSection === 'recent') && folderId === undefined && folderFilterMode !== 'root'

    if (usePagination) {
      const [paged, allFilesRaw, trashFiles, folderItems, sharedTotal, starredTotal] = await Promise.all([
        api.fetchFilesPaginated(PAGE_SIZE, 0, searchQuery),
        api.fetchFiles(undefined, searchQuery), // Full list for sidebar folder counts
        api.fetchTrashFiles(searchQuery),
        api.fetchFolders(),
        api.fetchSharedFilesCount(),
        api.fetchStarredFilesCount(),
      ])
      setFiles(paged.files)
      setTotalCount(paged.total)
      setGlobalTotalCount(paged.total) // Global count from server, used for nav badges
      setSharedCount(sharedTotal)
      setStarredCount(starredTotal)
      setHasMore(paged.total > paged.files.length)
      setFolders(folderItems)
      setTrash(trashFiles
        .map((item) => ({ ...item, deletedAt: item.deletedAt ?? new Date().toISOString() }))
        .sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime()))
      // Refresh the unfiltered snapshot used for sidebar folder counts (full list, not paginated)
      setAllFilesSnapshot(allFilesRaw)
    } else {
      // starred/shared need all files for client-side filtering; folder queries load that folder only.
      // Also fetch all files (no folderId filter) in parallel to refresh the sidebar snapshot.
      const [filesRaw, allFilesRaw, trashFiles, folderItems, sharedTotal, starredTotal] = await Promise.all([
        api.fetchFiles(folderId, searchQuery),
        api.fetchFiles(undefined, searchQuery), // search-filtered snapshot for current query
        api.fetchTrashFiles(searchQuery),
        api.fetchFolders(),
        api.fetchSharedFilesCount(),
        api.fetchStarredFilesCount(),
      ])
      const activeFiles = activeSection === 'my-drive' && folderFilterMode === 'root'
        ? filesRaw.filter((f) => f.folderId == null)
        : filesRaw
      setFiles(activeFiles)
      // NOTE: Do NOT update globalTotalCount here — it should always reflect the
      // total file count from the server, unaffected by folder/section filtering.
      // totalCount here is used only for local display (e.g., "Load more" text).
      setTotalCount(activeFiles.length)
      setGlobalTotalCount(allFilesRaw.length)
      setAllFilesSnapshot(allFilesRaw) // Always the full unfiltered list for sidebar counts
      setSharedCount(sharedTotal)
      setStarredCount(starredTotal)
      setHasMore(false)
      setFolders(folderItems)
      setTrash(trashFiles
        .map((item) => ({ ...item, deletedAt: item.deletedAt ?? new Date().toISOString() }))
        .sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime()))
    }
    setLoading(false)
  }, [activeSection, selectedFolderId, folderFilterMode, debouncedSearch])

  async function loadMore() {
    if (!hasMore || loadingMore) return
    setLoadingMore(true)
    const paged = await api.fetchFilesPaginated(PAGE_SIZE, files.length, debouncedSearch)
    setFiles((prev) => [...prev, ...paged.files])
    setHasMore(paged.total > files.length + paged.files.length)
    setTotalCount(paged.total)
    setLoadingMore(false)
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim())
    }, 350)
    return () => window.clearTimeout(timer)
  }, [search])

  async function handleCreateFolder() {
    const trimmed = newFolderName.trim()
    if (!trimmed || creatingFolder) return

    setCreatingFolder(true)
    try {
      await api.createFolder(trimmed)
      setNewFolderName('')
      pushToast(setToasts, 'success', 'Folder created successfully')
      await load()
    } catch {
      pushToast(setToasts, 'error', 'Failed to create folder')
    } finally {
      setCreatingFolder(false)
    }
  }

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    localStorage.setItem(VIEW_KEY, view)
  }, [view])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia('(max-width: 900px)')
    const onChange = (event: MediaQueryListEvent) => setIsMobile(event.matches)
    setIsMobile(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (isMobile && view !== 'grid') {
      setView('grid')
    }
  }, [isMobile, view])

  useEffect(() => {
    // Keep selection valid after file list changes.
    setSelectedSystemNames((prev) => prev.filter((systemName) => files.some((file) => file.systemName === systemName)))
  }, [files])

  useEffect(() => {
    setSelectedSystemNames([])
    setSelectMode(false)
  }, [activeSection])

  useEffect(() => {
    if (folderFilterMode !== 'folder' || selectedFolderId === null) return
    if (!folders.some((folder) => folder.id === selectedFolderId)) {
      setFolderFilterMode('all')
      setSelectedFolderId(null)
    }
  }, [folders, selectedFolderId, folderFilterMode])

  useEffect(() => {
    setSelectedTrashNames((prev) => prev.filter((systemName) => trash.some((item) => item.systemName === systemName)))
  }, [trash])

  useEffect(() => {
    if (activeSection !== 'trash') {
      setTrashSelectMode(false)
      setSelectedTrashNames([])
    }
  }, [activeSection])

  useEffect(() => {
    if (!toasts.length) return
    const timer = window.setTimeout(() => {
      setToasts((prev) => prev.slice(1))
    }, 2600)
    return () => window.clearTimeout(timer)
  }, [toasts])

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 300)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  async function handleUpload(selected: File[]) {
    // Initial state — all pending
    setUploadProgress(selected.map((f) => ({ name: f.name, percent: 0, status: 'pending' as const })))

    try {
      const result = await api.uploadFiles(selected, (perFile) => {
        setUploadProgress(selected.map((f, i) => {
          const pct = perFile[i] ?? 0
          const status = pct >= 100 ? 'done' as const : pct > 0 ? 'uploading' as const : 'pending' as const
          return { name: f.name, percent: pct, status }
        }))
      }, { folderId: selectedFolderId ?? undefined })

      await load()

      const failedNames = new Set(result.failedFiles.map((ff) => ff.fileName))
      setUploadProgress(selected.map((f) => ({
        name: f.name,
        percent: failedNames.has(f.name) ? 0 : 100,
        status: failedNames.has(f.name) ? 'error' as const : 'done' as const,
      })))

      if (result.uploadedCount > 0) {
        pushToast(setToasts, 'success', `Uploaded ${result.uploadedCount} file${result.uploadedCount > 1 ? 's' : ''} successfully`)
      }
      if (result.failedCount > 0) {
        pushToast(setToasts, 'error', `${result.failedCount} file${result.failedCount > 1 ? 's' : ''} failed to upload`)
      }

      // Auto-dismiss widget after 4s
      window.setTimeout(() => setUploadProgress([]), 4000)
    } catch {
      setUploadProgress(selected.map((f) => ({ name: f.name, percent: 0, status: 'error' as const })))
      pushToast(setToasts, 'error', `Failed to upload ${selected.length} file${selected.length > 1 ? 's' : ''}`)
      window.setTimeout(() => setUploadProgress([]), 4000)
    }
  }

  async function performDelete(systemName: string, opts?: { showToast?: boolean }) {
    try {
      await api.deleteFile(systemName)
      await load()

      if (opts?.showToast !== false) {
        setToasts((prev) => [...prev, makeToast('success', '1 file berhasil di hapus')].slice(-3))
      }
      return true
    } catch {
      if (opts?.showToast !== false) {
        setToasts((prev) => [...prev, makeToast('error', '1 file gagal di hapus')].slice(-3))
      }
      return false
    }
  }

  function requestDelete(systemName: string) {
    const file = files.find((f) => f.systemName === systemName)
    if (!file) return
    setDeleteTargets([file])
  }

  function requestBulkDelete() {
    const targets = files.filter((file) => selectedSystemNames.includes(file.systemName))
    if (!targets.length) return
    setDeleteTargets(targets)
  }

  function toggleSelectMode() {
    setSelectMode((prev) => {
      if (prev) setSelectedSystemNames([])
      return !prev
    })
  }

  async function confirmDelete() {
    if (!deleteTargets.length || deleting) return
    setDeleting(true)
    try {
      if (deleteTargets.length === 1) {
        await performDelete(deleteTargets[0].systemName)
      } else {
        let success = 0
        let failed = 0

        for (const target of deleteTargets) {
          const ok = await performDelete(target.systemName, { showToast: false })
          if (ok) success += 1
          else failed += 1
        }

        if (success > 0) {
          pushToast(setToasts, 'success', `${success} file berhasil di hapus`)
        }
        if (failed > 0) {
          pushToast(setToasts, 'error', `${failed} file gagal di hapus`)
        }
      }

      setSelectedSystemNames((prev) => prev.filter((systemName) => !deleteTargets.some((target) => target.systemName === systemName)))
      await load()
      setDeleteTargets([])
      setSelectMode(false)
    } finally {
      setDeleting(false)
    }
  }

  function toggleSelect(systemName: string) {
    setSelectedSystemNames((prev) => (prev.includes(systemName) ? prev.filter((name) => name !== systemName) : [...prev, systemName]))
  }

  function selectAllVisible(systemNames: string[], checked: boolean) {
    if (checked) {
      setSelectedSystemNames((prev) => Array.from(new Set([...prev, ...systemNames])))
      return
    }
    setSelectedSystemNames((prev) => prev.filter((name) => !systemNames.includes(name)))
  }

  async function moveSelectedFiles() {
    if (!selectedSystemNames.length || movingSelected) return
    const target = moveTargetFolder
    if (!target) return

    setMovingSelected(true)
    try {
      const folderId = target === 'root' ? undefined : Number(target)
      let success = 0
      let failed = 0

      for (const systemName of selectedSystemNames) {
        try {
          await api.moveFileToFolder(systemName, folderId)
          success += 1
        } catch {
          failed += 1
        }
      }

      if (success > 0) pushToast(setToasts, 'success', `${success} file berhasil dipindah`)
      if (failed > 0) pushToast(setToasts, 'error', `${failed} file gagal dipindah`)

      setMoveTargetFolder('')
      setSelectedSystemNames([])
      setSelectMode(false)
      await load()
    } finally {
      setMovingSelected(false)
    }
  }

  function requestMoveSingleFile(payload: { systemName: string; fileName: string; folderId?: number; folderLabel: string }) {
    setMoveConfirm(payload)
  }

  async function confirmMoveSingleFile() {
    if (!moveConfirm || movingSingle) return
    setMovingSingle(true)
    try {
      await api.moveFileToFolder(moveConfirm.systemName, moveConfirm.folderId)
      pushToast(setToasts, 'success', 'File berhasil dipindah')
      setMoveConfirm(null)
      await load()
    } catch {
      pushToast(setToasts, 'error', 'File gagal dipindah')
    } finally {
      setMovingSingle(false)
    }
  }

  async function handleGenerate(systemName: string) {
    const url = await api.generateLink(systemName)
    setGeneratedLink(url)
    await load()
  }

  async function toggleStar(systemName: string) {
    const target = files.find((f) => f.systemName === systemName)
    if (!target) return

    try {
      await api.setFileStarred(systemName, !(target.starred ?? false))
      await load()
    } catch {
      pushToast(setToasts, 'error', 'Failed to update starred state')
    }
  }

  async function togglePublic(systemName: string) {
    const target = files.find((f) => f.systemName === systemName)
    if (!target) return

    try {
      await api.setFilePublic(systemName, !(target.isPublic ?? false))
      pushToast(setToasts, 'success', target.isPublic ? 'File set to private' : 'File set to public')
      await load()
    } catch {
      pushToast(setToasts, 'error', 'Failed to update public visibility')
    }
  }

  function removeTrashRecord(systemName: string) {
    const target = trash.find((item) => item.systemName === systemName)
    if (!target) return
    setTrashConfirmAction({ kind: 'single-delete', systemName: target.systemName, fileName: target.originalName })
  }

  function requestRestoreTrash(systemName: string) {
    const target = trash.find((item) => item.systemName === systemName)
    if (!target) return
    setRestoreTargets([target])
  }

  function requestBulkRestoreTrash() {
    if (!selectedTrashNames.length) return
    const targets = trash.filter((item) => selectedTrashNames.includes(item.systemName))
    if (!targets.length) return
    setRestoreTargets(targets)
  }

  async function confirmRestoreTrash() {
    if (!restoreTargets.length || restoring) return

    setRestoring(true)
    try {
      if (restoreTargets.length === 1) {
        await api.restoreTrashFile(restoreTargets[0].systemName)
        pushToast(setToasts, 'success', '1 file berhasil di restore')
      } else {
        let success = 0
        let failed = 0

        for (const target of restoreTargets) {
          try {
            await api.restoreTrashFile(target.systemName)
            success += 1
          } catch {
            failed += 1
          }
        }

        if (success > 0) pushToast(setToasts, 'success', `${success} file berhasil di restore`)
        if (failed > 0) pushToast(setToasts, 'error', `${failed} file gagal di restore`)
      }

      setRestoreTargets([])
      setSelectedTrashNames([])
      setTrashSelectMode(false)
      await load()
    } catch {
      pushToast(setToasts, 'error', '1 file gagal di restore')
    } finally {
      setRestoring(false)
    }
  }

  function toggleTrashSelectMode() {
    setTrashSelectMode((prev) => {
      if (prev) setSelectedTrashNames([])
      return !prev
    })
  }

  function toggleTrashSelection(systemName: string) {
    setSelectedTrashNames((prev) => (prev.includes(systemName) ? prev.filter((name) => name !== systemName) : [...prev, systemName]))
  }

  function selectAllTrash(checked: boolean) {
    if (checked) {
      setSelectedTrashNames(trash.map((item) => item.systemName))
      return
    }
    setSelectedTrashNames([])
  }

  function requestBulkDeleteTrash() {
    if (!selectedTrashNames.length) return
    setTrashConfirmAction({ kind: 'bulk-delete', count: selectedTrashNames.length })
  }

  function requestEmptyTrash() {
    if (!trash.length) return
    setTrashConfirmAction({ kind: 'empty-trash', count: trash.length })
  }

  function executeBulkDeleteTrash() {
    if (!selectedTrashNames.length) return
    const targets = [...selectedTrashNames]
    void (async () => {
      let success = 0
      let failed = 0
      for (const systemName of targets) {
        try {
          await api.hardDeleteTrashFile(systemName)
          success += 1
        } catch {
          failed += 1
        }
      }
      if (success > 0) pushToast(setToasts, 'success', `${success} file berhasil di hapus`)
      if (failed > 0) pushToast(setToasts, 'error', `${failed} file gagal di hapus`)
      setSelectedTrashNames([])
      setTrashSelectMode(false)
      await load()
    })()
  }

  function executeEmptyTrash() {
    if (!trash.length) return
    const targets = trash.map((item) => item.systemName)
    void (async () => {
      let success = 0
      let failed = 0
      for (const systemName of targets) {
        try {
          await api.hardDeleteTrashFile(systemName)
          success += 1
        } catch {
          failed += 1
        }
      }
      if (success > 0) pushToast(setToasts, 'success', `${success} file berhasil di hapus`)
      if (failed > 0) pushToast(setToasts, 'error', `${failed} file gagal di hapus`)
      setSelectedTrashNames([])
      setTrashSelectMode(false)
      await load()
    })()
  }

  function confirmTrashAction() {
    if (!trashConfirmAction) return
    if (trashConfirmAction.kind === 'single-delete') {
      const { systemName } = trashConfirmAction
      void api.hardDeleteTrashFile(systemName).then(async () => {
        pushToast(setToasts, 'success', '1 file berhasil di hapus')
        await load()
      }).catch(() => {
        pushToast(setToasts, 'error', '1 file gagal di hapus')
      })
    } else if (trashConfirmAction.kind === 'bulk-delete') {
      executeBulkDeleteTrash()
    } else {
      executeEmptyTrash()
    }
    setTrashConfirmAction(null)
  }

  const baseFiles = (() => {
    if (activeSection === 'recent') return [...files].sort((a, b) => new Date(b.uploadedAt ?? 0).getTime() - new Date(a.uploadedAt ?? 0).getTime())
    if (activeSection === 'shared') return files.filter((f) => (f.shareCount ?? 0) > 0)
    if (activeSection === 'starred') return files.filter((f) => f.starred)
    return files
  })()

  const filteredFiles = baseFiles
  const filteredTrash = trash

  const isTrashView = activeSection === 'trash'
  const isAdminUser = (user.role ?? '').trim().toLowerCase() === 'admin'
  // Section title badge: show server total when paginating (hasMore=active), else local filtered count
  const showingCount = isTrashView ? filteredTrash.length : (hasMore ? totalCount : filteredFiles.length)
  const selectedFolder = folderFilterMode === 'folder' && selectedFolderId !== null ? folders.find((folder) => folder.id === selectedFolderId) : null
  const getFolderLabel = (folderId?: number) => {
    if (folderId == null) return 'Root'
    return folders.find((folder) => folder.id === folderId)?.name ?? 'Unknown'
  }
  const sectionTitle = activeSection === 'recent'
    ? 'Recent'
    : activeSection === 'shared'
      ? 'Shared'
      : activeSection === 'starred'
        ? 'Starred'
        : activeSection === 'trash'
          ? 'Trash'
          : folderFilterMode === 'root'
            ? 'My Drive / Root'
            : selectedFolder
              ? `My Drive / ${selectedFolder.name}`
              : 'My Drive'

  const recentCount = globalTotalCount
  const effectiveView = isMobile ? 'grid' : view

  return (
    <div className="drive-layout" style={{ minHeight: '100vh', background: 'var(--c-bg)' }}>
      <ToastStack toasts={toasts} />

      <aside style={{ borderRight: '1px solid var(--c-border-subtle)', padding: isMobile ? '14px 12px' : '22px 16px', display: 'flex', flexDirection: 'column', gap: isMobile ? 14 : 22, position: isMobile ? 'static' : 'sticky', top: 0, alignSelf: 'start', height: isMobile ? 'auto' : '100vh', overflowY: isMobile ? 'visible' : 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px' }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(145deg, #4285f4, #1a73e8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--c-text-bright)' }}>SMC Drive</p>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--c-text-4)' }}>File manager workspace</p>
          </div>
        </div>

        <div style={{ padding: 6, borderRadius: 16, border: '1px solid var(--c-border)', background: 'var(--c-panel-subtle)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <NavItem icon={HardDrive} label="My Drive" count={globalTotalCount} active={activeSection === 'my-drive'} onClick={() => setActiveSection('my-drive')} />
          <NavItem icon={Clock} label="Recent" count={recentCount} active={activeSection === 'recent'} onClick={() => setActiveSection('recent')} />
          <NavItem icon={Share2} label="Shared" count={sharedCount} active={activeSection === 'shared'} onClick={() => setActiveSection('shared')} />
          <NavItem icon={Star} label="Starred" count={starredCount} active={activeSection === 'starred'} onClick={() => setActiveSection('starred')} />
          <NavItem icon={Trash2} label="Trash" count={trash.length} active={activeSection === 'trash'} onClick={() => setActiveSection('trash')} />
        </div>

        <div style={{ border: '1px solid var(--c-border)', borderRadius: 12, background: 'var(--c-panel)', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="New folder"
              style={{ flex: 1, minWidth: 0, borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-input-bg)', color: 'var(--c-text-2)', padding: '7px 9px', fontSize: 12, outline: 'none' }}
            />
            <button
              onClick={handleCreateFolder}
              disabled={creatingFolder || !newFolderName.trim()}
              style={{ border: '1px solid var(--c-border)', borderRadius: 8, background: creatingFolder || !newFolderName.trim() ? 'var(--c-panel-subtle)' : 'rgba(66,133,244,0.16)', color: creatingFolder || !newFolderName.trim() ? 'var(--c-text-5)' : '#1a73e8', padding: '7px 10px', fontSize: 12, fontWeight: 700, cursor: creatingFolder || !newFolderName.trim() ? 'not-allowed' : 'pointer' }}
            >
              {creatingFolder ? '...' : 'New'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
            <button
              className={`fm-folder-nav-item${folderFilterMode === 'all' ? ' is-active' : ''}`}
              onClick={() => {
                setFolderFilterMode('all')
                setSelectedFolderId(null)
                setActiveSection('my-drive')
              }}
              style={{ border: 'none', borderRadius: 8, textAlign: 'left', background: folderFilterMode === 'all' ? 'rgba(66,133,244,0.16)' : 'transparent', color: folderFilterMode === 'all' ? '#1a73e8' : 'var(--c-text-3)', cursor: 'pointer', fontSize: 12, padding: '6px 8px', fontWeight: folderFilterMode === 'all' ? 700 : 500, display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <Folder size={14} color={folderFilterMode === 'all' ? '#1a73e8' : 'var(--c-text-4)'} />
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', justifyContent: 'space-between' }}>
                <span>All files</span>
                <span style={{ fontSize: 11, color: 'var(--c-text-5)' }}>{globalTotalCount}</span>
              </span>
            </button>
            <button
              className={`fm-folder-nav-item${folderFilterMode === 'root' ? ' is-active' : ''}`}
              onClick={() => {
                setFolderFilterMode('root')
                setSelectedFolderId(null)
                setActiveSection('my-drive')
              }}
              style={{ border: 'none', borderRadius: 8, textAlign: 'left', background: folderFilterMode === 'root' ? 'rgba(66,133,244,0.16)' : 'transparent', color: folderFilterMode === 'root' ? '#1a73e8' : 'var(--c-text-3)', cursor: 'pointer', fontSize: 12, padding: '6px 8px', fontWeight: folderFilterMode === 'root' ? 700 : 500, display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <Folder size={14} color={folderFilterMode === 'root' ? '#1a73e8' : 'var(--c-text-4)'} />
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', justifyContent: 'space-between' }}>
                <span>Root only</span>
                <span style={{ fontSize: 11, color: 'var(--c-text-5)' }}>{allFilesSnapshot.filter((f) => f.folderId == null).length}</span>
              </span>
            </button>
            {!folders.length ? (
              <span style={{ fontSize: 11, color: 'var(--c-text-5)' }}>No folders yet</span>
            ) : folders.map((folder) => (
              <button
                className={`fm-folder-nav-item${folderFilterMode === 'folder' && selectedFolderId === folder.id ? ' is-active' : ''}`}
                key={folder.id}
                onClick={() => {
                  setFolderFilterMode('folder')
                  setSelectedFolderId(folder.id)
                  setActiveSection('my-drive')
                }}
                style={{ border: 'none', borderRadius: 8, textAlign: 'left', background: folderFilterMode === 'folder' && selectedFolderId === folder.id ? 'rgba(66,133,244,0.16)' : 'transparent', color: folderFilterMode === 'folder' && selectedFolderId === folder.id ? '#1a73e8' : 'var(--c-text-3)', cursor: 'pointer', fontSize: 12, padding: '6px 8px', fontWeight: folderFilterMode === 'folder' && selectedFolderId === folder.id ? 700 : 500, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Folder size={14} color={folderFilterMode === 'folder' && selectedFolderId === folder.id ? '#1a73e8' : 'var(--c-text-4)'} />
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', justifyContent: 'space-between' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--c-text-5)' }}>{allFilesSnapshot.filter((f) => f.folderId === folder.id).length}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid var(--c-border)', background: 'var(--c-panel)', fontSize: 12, color: 'var(--c-text-4)', lineHeight: 1.6 }}>
          {globalTotalCount} total files
          <br />
          {uploadProgress.length > 0 ? `Uploading ${uploadProgress.length} file${uploadProgress.length > 1 ? 's' : ''}...` : 'Ready to upload'}
        </div>
      </aside>

      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header style={{ position: 'sticky', top: 0, zIndex: 30, display: 'flex', alignItems: 'center', flexWrap: isMobile ? 'wrap' : 'nowrap', gap: 12, padding: isMobile ? '10px 12px' : '12px 20px', borderBottom: '1px solid var(--c-border-subtle)', background: 'var(--c-topbar)', backdropFilter: 'blur(8px)' }}>
          <div style={{ flex: 1, minWidth: isMobile ? '100%' : 0, order: isMobile ? 2 : 0, display: 'flex', justifyContent: isMobile ? 'stretch' : 'center' }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: isMobile ? '100%' : 560 }}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="var(--c-text-4)" strokeWidth={2} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
              </svg>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search in Drive" style={{ width: '100%', padding: '10px 14px 10px 40px', borderRadius: 24, border: '1px solid var(--c-border)', background: 'var(--c-input-bg)', color: 'var(--c-text-2)', fontSize: 13, outline: 'none' }} />
            </div>
          </div>

          <button onClick={onToggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid var(--c-border)', background: 'var(--c-panel)', cursor: 'pointer', color: 'var(--c-text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', order: isMobile ? 0 : 0 }}>
            {theme === 'dark' ? (
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="5" /><path strokeLinecap="round" d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
            ) : (
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" /></svg>
            )}
          </button>

          <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(145deg,#4285f4,#1a73e8)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, order: isMobile ? 0 : 0 }}>{user.name.charAt(0).toUpperCase()}</div>
          <button onClick={onSignOut} style={{ padding: '8px 12px', borderRadius: 18, border: '1px solid var(--c-border)', background: 'var(--c-panel)', color: 'var(--c-text-4)', fontSize: 12, cursor: 'pointer', order: isMobile ? 0 : 0 }}>Sign out</button>
        </header>

        <main style={{ padding: isMobile ? '12px 12px 20px' : '18px 20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {activeSection !== 'trash' && (
            <section style={{ border: '1px solid var(--c-border)', borderRadius: 18, padding: 14, background: 'var(--c-panel)' }}>
              <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <SectionLabel>Upload</SectionLabel>
              </div>
              <UploadDropzone onUpload={handleUpload} progress={uploadProgress} />
            </section>
          )}

          <section style={{ border: '1px solid var(--c-border)', borderRadius: 18, padding: isMobile ? 10 : 14, background: 'var(--c-panel)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: isMobile ? 'wrap' : 'nowrap', marginBottom: 12, gap: 10 }}>
              <SectionLabel>{sectionTitle}{!loading && <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 999, background: 'rgba(66,133,244,0.15)', color: '#4285f4', fontSize: 11, fontWeight: 700 }}>{showingCount}</span>}</SectionLabel>
              {!isTrashView && !loading && !selectMode && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: isMobile ? 'flex-start' : 'flex-end', width: isMobile ? '100%' : 'auto' }}>
                  <button onClick={toggleSelectMode} style={{ border: '1px solid var(--c-border)', borderRadius: 999, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: 'var(--c-panel-subtle)', color: 'var(--c-text-3)' }}>
                    Pilih
                  </button>
                  <div style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 999, border: '1px solid var(--c-border)', background: 'var(--c-view-toggle)' }}>
                    {(isMobile ? (['grid'] as const) : (['list', 'grid'] as const)).map((v) => (
                      <button key={v} onClick={() => setView(v)} style={{ border: 'none', borderRadius: 999, padding: '6px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: view === v ? 'var(--c-view-active)' : 'transparent', color: view === v ? '#1a73e8' : 'var(--c-text-4)' }}>
                        {v === 'list' ? 'List' : 'Grid'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!isTrashView && !loading && selectMode && (
                <SelectionToolbar
                  selectedCount={selectedSystemNames.length}
                  moveTargetFolder={moveTargetFolder}
                  movingSelected={movingSelected}
                  folders={folders}
                  onCancel={toggleSelectMode}
                  onMoveFolderChange={setMoveTargetFolder}
                  onMove={moveSelectedFiles}
                  onDelete={requestBulkDelete}
                />
              )}

              {isTrashView && !loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: isMobile ? 'flex-start' : 'flex-end', width: isMobile ? '100%' : 'auto' }}>
                  <button onClick={toggleTrashSelectMode} style={{ border: '1px solid var(--c-border)', borderRadius: 999, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: trashSelectMode ? 'rgba(66,133,244,0.12)' : 'var(--c-panel-subtle)', color: trashSelectMode ? '#1a73e8' : 'var(--c-text-3)' }}>
                    {trashSelectMode ? 'Batal' : 'Pilih'}
                  </button>
                  <button onClick={requestEmptyTrash} disabled={!trash.length} style={{ border: '1px solid rgba(220,38,38,0.35)', borderRadius: 999, padding: '6px 12px', cursor: trash.length ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 700, background: 'rgba(220,38,38,0.12)', color: '#ef4444', opacity: trash.length ? 1 : 0.5 }}>
                    Kosongkan trash
                  </button>
                  {trashSelectMode && selectedTrashNames.length > 0 && (
                    <button onClick={requestBulkRestoreTrash} style={{ border: '1px solid rgba(34,197,94,0.35)', borderRadius: 999, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: 'rgba(34,197,94,0.1)', color: '#16a34a' }}>
                      Restore {selectedTrashNames.length} selected
                    </button>
                  )}
                  {trashSelectMode && selectedTrashNames.length > 0 && (
                    <button onClick={requestBulkDeleteTrash} style={{ border: '1px solid rgba(220,38,38,0.35)', borderRadius: 999, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: 'rgba(220,38,38,0.12)', color: '#ef4444' }}>
                      Delete {selectedTrashNames.length} selected
                    </button>
                  )}
                </div>
              )}
            </div>

            {loading ? <LoadingSkeleton /> : isTrashView ? <TrashList items={filteredTrash} onRemove={removeTrashRecord} onRestore={requestRestoreTrash} selectionEnabled={trashSelectMode} selectedSystemNames={selectedTrashNames} onToggleSelect={toggleTrashSelection} onSelectAllVisible={selectAllTrash} isMobile={isMobile} /> : <FileList files={filteredFiles} view={effectiveView} onDelete={requestDelete} onGenerate={handleGenerate} onRequestMove={requestMoveSingleFile} folderOptions={folders.map((folder) => ({ id: folder.id, name: folder.name }))} getFolderLabel={getFolderLabel} onToggleStar={toggleStar} onTogglePublic={isAdminUser ? togglePublic : undefined} isStarred={(systemName) => files.some((f) => f.systemName === systemName && !!f.starred)} selectionEnabled={selectMode} selectedSystemNames={selectedSystemNames} onToggleSelect={toggleSelect} onSelectAllVisible={selectAllVisible} />}

            {!isTrashView && hasMore && !loading && (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  style={{ padding: '9px 22px', borderRadius: 999, border: '1px solid var(--c-border)', background: 'var(--c-panel-subtle)', color: loadingMore ? 'var(--c-text-5)' : 'var(--c-text-3)', fontSize: 13, fontWeight: 600, cursor: loadingMore ? 'not-allowed' : 'pointer' }}
                >
                  {loadingMore ? 'Loading…' : `Load more (${totalCount - files.length} remaining)`}
                </button>
              </div>
            )}
          </section>
        </main>
      </div>

      {deleteTargets.length > 0 && (
        <DeleteConfirmModal
          title={deleteTargets.length > 1 ? `Delete ${deleteTargets.length} files?` : 'Delete file?'}
          description={deleteTargets.length > 1
            ? `You are about to delete ${deleteTargets.length} selected files. This action cannot be undone from server storage.`
            : <>You are about to delete <strong style={{ color: 'var(--c-text-2)' }}>{deleteTargets[0].originalName}</strong>. This action cannot be undone from server storage.</>}
          deleting={deleting}
          onCancel={() => !deleting && setDeleteTargets([])}
          onConfirm={confirmDelete}
          confirmLabel={deleteTargets.length > 1 ? `Delete ${deleteTargets.length} files` : 'Delete file'}
        />
      )}
      {trashConfirmAction && (
        <DeleteConfirmModal
          title={trashConfirmAction.kind === 'single-delete'
            ? 'Hapus file dari trash?'
            : trashConfirmAction.kind === 'empty-trash'
              ? 'Kosongkan trash?'
              : `Hapus ${trashConfirmAction.count} file dari trash?`}
          description={trashConfirmAction.kind === 'single-delete'
            ? <>Anda akan menghapus permanen <strong style={{ color: 'var(--c-text-2)' }}>{trashConfirmAction.fileName}</strong> dari trash. Aksi ini tidak bisa dibatalkan.</>
            : trashConfirmAction.kind === 'empty-trash'
              ? `Semua ${trashConfirmAction.count} file di trash akan dihapus permanen dan tidak bisa dipulihkan.`
              : `Anda akan menghapus ${trashConfirmAction.count} file yang dipilih dari trash. Aksi ini tidak bisa dibatalkan.`}
          deleting={false}
          onCancel={() => setTrashConfirmAction(null)}
          onConfirm={confirmTrashAction}
          confirmLabel={trashConfirmAction.kind === 'single-delete'
            ? 'Hapus permanen'
            : trashConfirmAction.kind === 'empty-trash'
              ? 'Kosongkan trash'
              : `Hapus ${trashConfirmAction.count} file`}
        />
      )}
      {restoreTargets.length > 0 && (
        <RestoreConfirmModal
          fileName={restoreTargets[0]?.originalName ?? ''}
          fileCount={restoreTargets.length}
          restoring={restoring}
          onCancel={() => !restoring && setRestoreTargets([])}
          onConfirm={confirmRestoreTrash}
        />
      )}
      {moveConfirm && (
        <MoveConfirmModal
          fileName={moveConfirm.fileName}
          folderName={moveConfirm.folderLabel}
          moving={movingSingle}
          onCancel={() => !movingSingle && setMoveConfirm(null)}
          onConfirm={confirmMoveSingleFile}
        />
      )}
      {generatedLink && <CopyLinkModal url={generatedLink} onClose={() => setGeneratedLink(null)} />}
      <UploadWidget entries={uploadProgress} onDismiss={() => setUploadProgress([])} />

      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Back to top"
          title="Back to top"
          style={{
            position: 'fixed',
            bottom: 28,
            right: 28,
            zIndex: 70,
            width: 42,
            height: 42,
            borderRadius: '50%',
            border: '1px solid var(--c-border)',
            background: 'var(--c-panel)',
            color: 'var(--c-text-3)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            transition: 'opacity 0.2s, transform 0.2s',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
      )}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c-text-5)' }}>{children}</div>
}

function SelectionToolbar({
  selectedCount,
  moveTargetFolder,
  movingSelected,
  folders,
  onCancel,
  onMoveFolderChange,
  onMove,
  onDelete,
}: {
  selectedCount: number
  moveTargetFolder: string
  movingSelected: boolean
  folders: FolderItem[]
  onCancel: () => void
  onMoveFolderChange: (val: string) => void
  onMove: () => void
  onDelete: () => void
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      alignSelf: 'stretch',
      padding: '6px 10px',
      borderRadius: 12,
      background: 'rgba(66,133,244,0.08)',
      border: '1px solid rgba(66,133,244,0.2)',
      flexWrap: 'wrap',
    }}>
      <button
        onClick={onCancel}
        title="Batal pilih"
        style={{
          border: 'none', background: 'transparent', cursor: 'pointer',
          padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--c-text-4)',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <span style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 13, fontWeight: 600, color: 'var(--c-text-2)',
        paddingRight: 10, borderRight: '1px solid var(--c-border-subtle)',
        whiteSpace: 'nowrap',
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4285f4" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
        <span>{selectedCount} selected</span>
      </span>

      {selectedCount > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <select
              value={moveTargetFolder}
              onChange={(e) => onMoveFolderChange(e.target.value)}
              style={{
                border: '1px solid var(--c-border)', borderRadius: 8,
                padding: '5px 8px', background: 'var(--c-panel)',
                color: 'var(--c-text-3)', fontSize: 12, maxWidth: 160,
              }}
            >
              <option value="">Move to folder</option>
              <option value="root">Root</option>
              {folders.map((folder) => (
                <option key={folder.id} value={String(folder.id)}>{folder.name}</option>
              ))}
            </select>
            {moveTargetFolder && (
              <button
                onClick={onMove}
                disabled={movingSelected}
                style={{
                  border: 'none', borderRadius: 8, padding: '5px 10px',
                  background: 'linear-gradient(135deg,#0e7490,#155e75)', color: 'white',
                  fontSize: 12, fontWeight: 600, cursor: movingSelected ? 'not-allowed' : 'pointer',
                  opacity: movingSelected ? 0.6 : 1, whiteSpace: 'nowrap',
                }}
              >
                {movingSelected ? 'Moving…' : 'Move'}
              </button>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }} />

          <button
            onClick={onDelete}
            style={{
              border: '1px solid rgba(220,38,38,0.35)', borderRadius: 8,
              padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: 'rgba(220,38,38,0.12)', color: '#ef4444',
              display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Delete
          </button>
        </>
      )}
    </div>
  )
}

function NavItem({ icon: Icon, label, active = false, count, onClick }: { icon?: React.ElementType; label: string; active?: boolean; count?: number; onClick: () => void }) {
  return (
    <button className={`fm-main-nav-item${active ? ' is-active' : ''}`} onClick={onClick} style={{ width: '100%', textAlign: 'left', border: 'none', borderRadius: 12, padding: '8px 10px', fontSize: 13, fontWeight: active ? 700 : 500, color: active ? '#1a73e8' : 'var(--c-text-3)', background: active ? 'rgba(66,133,244,0.16)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {Icon && <Icon size={15} color={active ? '#1a73e8' : 'var(--c-text-4)'} strokeWidth={active ? 2.5 : 2} />}
        {label}
      </span>
      {typeof count === 'number' && (
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          color: active ? '#1a73e8' : 'var(--c-text-5)',
          background: active ? 'rgba(66,133,244,0.16)' : 'var(--c-panel)',
          border: `1px solid ${active ? 'rgba(66,133,244,0.3)' : 'var(--c-border)'}`,
          borderRadius: 999,
          padding: '2px 7px',
          minWidth: 20,
          textAlign: 'center',
          lineHeight: '16px',
          flexShrink: 0,
        }}>{count}</span>
      )}
    </button>
  )
}

function TrashList({ items, onRemove, onRestore, selectionEnabled = false, selectedSystemNames = [], onToggleSelect, onSelectAllVisible, isMobile = false }: { items: TrashItem[]; onRemove: (systemName: string) => void; onRestore: (systemName: string) => void; selectionEnabled?: boolean; selectedSystemNames?: string[]; onToggleSelect?: (systemName: string) => void; onSelectAllVisible?: (checked: boolean) => void; isMobile?: boolean }) {
  if (!items.length) {
    return <div style={{ borderRadius: 12, border: '1px dashed var(--c-border)', background: 'var(--c-panel-subtle)', padding: '48px 16px', textAlign: 'center', color: 'var(--c-text-4)', fontSize: 13 }}>Trash is empty</div>
  }

  const allSelected = items.length > 0 && items.every((item) => selectedSystemNames.includes(item.systemName))
  const hasSomeSelected = items.some((item) => selectedSystemNames.includes(item.systemName))

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {selectionEnabled && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--c-text-4)' }}>
            <input type="checkbox" checked={allSelected} ref={(input) => { if (input) input.indeterminate = !allSelected && hasSomeSelected }} onChange={(e) => onSelectAllVisible?.(e.target.checked)} style={{ cursor: 'pointer' }} />
            Select all
          </label>
        )}
        {items.map((item) => (
          <div key={item.systemName} style={{ borderRadius: 12, border: '1px solid var(--c-border)', background: 'var(--c-panel)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              {selectionEnabled && (
                <input type="checkbox" checked={selectedSystemNames.includes(item.systemName)} onChange={() => onToggleSelect?.(item.systemName)} style={{ cursor: 'pointer', marginTop: 3 }} />
              )}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, color: 'var(--c-text-2)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.originalName}</div>
                <div style={{ fontSize: 11, color: 'var(--c-text-5)' }}>Deleted {new Date(item.deletedAt).toLocaleString()}</div>
              </div>
              <span style={{ fontSize: 12, color: 'var(--c-text-4)', flexShrink: 0 }}>{formatBytes(item.size)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => onRestore(item.systemName)} style={{ border: '1px solid rgba(34,197,94,0.35)', background: 'rgba(34,197,94,0.1)', color: '#16a34a', padding: '6px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>Restore</button>
              <button onClick={() => onRemove(item.systemName)} style={{ border: '1px solid rgba(220,38,38,0.35)', background: 'rgba(220,38,38,0.12)', color: '#ef4444', padding: '6px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>Delete permanen</button>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--c-border)' }}>
      {selectionEnabled && (
        <div style={{ display: 'grid', gridTemplateColumns: '30px 1fr auto auto', gap: 10, alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid var(--c-border-subtle)', background: 'var(--c-topbar)', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--c-text-5)' }}>
          <span>
            <input type="checkbox" checked={allSelected} ref={(input) => { if (input) input.indeterminate = !allSelected && hasSomeSelected }} onChange={(e) => onSelectAllVisible?.(e.target.checked)} style={{ cursor: 'pointer' }} />
          </span>
          <span>Name</span>
          <span>Size</span>
          <span>Actions</span>
        </div>
      )}
      {items.map((item, idx) => (
        <div key={item.systemName} style={{ display: 'grid', gridTemplateColumns: selectionEnabled ? '30px 1fr auto auto' : '1fr auto auto', gap: 10, alignItems: 'center', padding: '10px 14px', borderBottom: idx === items.length - 1 ? 'none' : '1px solid var(--c-border-subtle)', background: 'var(--c-panel)' }}>
          {selectionEnabled && (
            <span style={{ display: 'flex', alignItems: 'center' }}>
              <input type="checkbox" checked={selectedSystemNames.includes(item.systemName)} onChange={() => onToggleSelect?.(item.systemName)} style={{ cursor: 'pointer' }} />
            </span>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--c-text-2)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.originalName}</div>
            <div style={{ fontSize: 11, color: 'var(--c-text-5)' }}>Deleted {new Date(item.deletedAt).toLocaleString()}</div>
          </div>
          <span style={{ fontSize: 12, color: 'var(--c-text-4)' }}>{formatBytes(item.size)}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => onRestore(item.systemName)} style={{ border: '1px solid rgba(34,197,94,0.35)', background: 'rgba(34,197,94,0.1)', color: '#16a34a', padding: '6px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>Restore</button>
            <button onClick={() => onRemove(item.systemName)} style={{ border: '1px solid rgba(220,38,38,0.35)', background: 'rgba(220,38,38,0.12)', color: '#ef4444', padding: '6px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>Delete permanen</button>
          </div>
        </div>
      ))}
    </div>
  )
}

function LoadingSkeleton() {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{[1, 2, 3].map((i) => <div key={i} style={{ height: 52, borderRadius: 10, background: 'var(--c-skeleton)', border: '1px solid var(--c-border-subtle)', opacity: 1 - i * 0.2 }} />)}</div>
}

function ToastStack({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 90, display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'none', alignItems: 'center' }}>
      {toasts.map((toast) => (
        <div key={toast.id} style={{ minWidth: 240, maxWidth: 320, width: 'max-content', borderRadius: 12, padding: '12px 14px', border: `1px solid ${toast.kind === 'success' ? 'rgba(34,197,94,0.28)' : 'rgba(239,68,68,0.28)'}`, background: toast.kind === 'success' ? 'rgba(20,83,45,0.92)' : 'rgba(127,29,29,0.92)', color: 'white', boxShadow: '0 18px 40px rgba(0,0,0,0.25)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{toast.kind === 'success' ? 'Success' : 'Error'}</div>
          <div style={{ fontSize: 12, lineHeight: 1.5, opacity: 0.95 }}>{toast.message}</div>
        </div>
      ))}
    </div>
  )
}

function DeleteConfirmModal({ title, description, confirmLabel, deleting, onCancel, onConfirm }: { title: string; description: React.ReactNode; confirmLabel: string; deleting: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(2,6,23,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 420, borderRadius: 16, border: '1px solid var(--c-border)', background: 'var(--c-panel)', boxShadow: '0 25px 55px rgba(0,0,0,0.3)', padding: 18 }}>
        <h3 style={{ margin: 0, color: 'var(--c-text-bright)', fontSize: 16, fontWeight: 700 }}>{title}</h3>
        <p style={{ margin: '8px 0 0', color: 'var(--c-text-3)', fontSize: 13, lineHeight: 1.5 }}>{description}</p>
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel} disabled={deleting} style={{ border: '1px solid var(--c-border)', background: 'var(--c-panel-subtle)', color: 'var(--c-text-3)', padding: '8px 12px', borderRadius: 8, fontSize: 12, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1 }}>Cancel</button>
          <button onClick={onConfirm} disabled={deleting} style={{ border: 'none', background: 'linear-gradient(135deg,#dc2626,#b91c1c)', color: 'white', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1 }}>{deleting ? 'Deleting...' : confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

function RestoreConfirmModal({ fileName, fileCount, restoring, onCancel, onConfirm }: { fileName: string; fileCount: number; restoring: boolean; onCancel: () => void; onConfirm: () => void }) {
  const isBulk = fileCount > 1
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(2,6,23,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 420, borderRadius: 16, border: '1px solid var(--c-border)', background: 'var(--c-panel)', boxShadow: '0 25px 55px rgba(0,0,0,0.3)', padding: 18 }}>
        <h3 style={{ margin: 0, color: 'var(--c-text-bright)', fontSize: 16, fontWeight: 700 }}>{isBulk ? `Restore ${fileCount} files?` : 'Restore file?'}</h3>
        <p style={{ margin: '8px 0 0', color: 'var(--c-text-3)', fontSize: 13, lineHeight: 1.5 }}>
          {isBulk
            ? `Anda akan me-restore ${fileCount} file terpilih dari Trash ke My Drive.`
            : <>Anda akan me-restore <strong style={{ color: 'var(--c-text-2)' }}>{fileName}</strong> dari Trash ke My Drive.</>}
        </p>
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel} disabled={restoring} style={{ border: '1px solid var(--c-border)', background: 'var(--c-panel-subtle)', color: 'var(--c-text-3)', padding: '8px 12px', borderRadius: 8, fontSize: 12, cursor: restoring ? 'not-allowed' : 'pointer', opacity: restoring ? 0.6 : 1 }}>Cancel</button>
          <button onClick={onConfirm} disabled={restoring} style={{ border: 'none', background: 'linear-gradient(135deg,#16a34a,#15803d)', color: 'white', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: restoring ? 'not-allowed' : 'pointer', opacity: restoring ? 0.7 : 1 }}>{restoring ? 'Restoring...' : isBulk ? `Restore ${fileCount} files` : 'Restore file'}</button>
        </div>
      </div>
    </div>
  )
}

function MoveConfirmModal({ fileName, folderName, moving, onCancel, onConfirm }: { fileName: string; folderName: string; moving: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(2,6,23,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 420, borderRadius: 16, border: '1px solid var(--c-border)', background: 'var(--c-panel)', boxShadow: '0 25px 55px rgba(0,0,0,0.3)', padding: 18 }}>
        <h3 style={{ margin: 0, color: 'var(--c-text-bright)', fontSize: 16, fontWeight: 700 }}>Pindahkan file?</h3>
        <p style={{ margin: '8px 0 0', color: 'var(--c-text-3)', fontSize: 13, lineHeight: 1.5 }}>
          Anda akan memindahkan <strong style={{ color: 'var(--c-text-2)' }}>{fileName}</strong> ke <strong style={{ color: 'var(--c-text-2)' }}>{folderName}</strong>.
        </p>
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel} disabled={moving} style={{ border: '1px solid var(--c-border)', background: 'var(--c-panel-subtle)', color: 'var(--c-text-3)', padding: '8px 12px', borderRadius: 8, fontSize: 12, cursor: moving ? 'not-allowed' : 'pointer', opacity: moving ? 0.6 : 1 }}>Cancel</button>
          <button onClick={onConfirm} disabled={moving} style={{ border: 'none', background: 'linear-gradient(135deg,#0e7490,#155e75)', color: 'white', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: moving ? 'not-allowed' : 'pointer', opacity: moving ? 0.7 : 1 }}>{moving ? 'Moving...' : 'Pindahkan'}</button>
        </div>
      </div>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`
}
