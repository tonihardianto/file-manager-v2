import type { AuthUser } from '../App'
import type { FileMeta } from '../components/FileList'

const UNAUTHORIZED_EVENT = 'fm:unauthorized'

function emitUnauthorized() {
  window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT))
}

export function unauthorizedEventName() {
  return UNAUTHORIZED_EVENT
}

export type UploadFailure = {
  fileName: string
  reason: string
}

export type UploadResult = {
  uploadedCount: number
  failedCount: number
  failedFiles: UploadFailure[]
}

export type FolderItem = {
  id: number
  name: string
  parentId?: number
  createdAt: string
}

function getCookie(name: string): string | null {
  const match = document.cookie
    .split('; ')
    .find((item) => item.startsWith(`${name}=`))
  if (!match) return null
  return decodeURIComponent(match.slice(name.length + 1))
}

function mapFileItem(item: Record<string, unknown>): FileMeta {
  return {
    id: String(item.systemName ?? ''),
    systemName: String(item.systemName ?? ''),
    originalName: String(item.originalName ?? item.systemName ?? 'Unknown'),
    size: Number(item.size ?? 0),
    mimeType: String(item.mimeType ?? 'application/octet-stream'),
    folderId: item.folderId == null ? undefined : Number(item.folderId),
    uploadedAt: String(item.uploadedAt ?? ''),
    deletedAt: item.deletedAt ? String(item.deletedAt) : undefined,
    downloadCount: Number(item.downloadCount ?? 0),
    shareCount: Number(item.shareCount ?? 0),
    starred: Boolean(item.starred ?? false),
  }
}

function mapFolderItem(item: Record<string, unknown>): FolderItem {
  return {
    id: Number(item.id ?? 0),
    name: String(item.name ?? 'Untitled Folder'),
    parentId: item.parentId == null ? undefined : Number(item.parentId),
    createdAt: String(item.createdAt ?? ''),
  }
}

function csrfHeaders(initHeaders?: HeadersInit): Headers {
  const headers = new Headers(initHeaders)
  const csrf = getCookie('fm_csrf')
  if (csrf) headers.set('X-CSRF-Token', csrf)
  return headers
}

async function request(url: string, init?: RequestInit, opts?: { on401?: 'emit' | 'silent' }): Promise<Response> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...init,
  })

  if (res.status === 401 && opts?.on401 !== 'silent') {
    emitUnauthorized()
  }

  return res
}

// ─── Auth ───────────────────────────────────────────────────────────────────

export async function login(username: string, password: string): Promise<AuthUser> {
  const res = await request('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  }, { on401: 'silent' })
  if (!res.ok) throw new Error('auth failed')
  const body = await res.json()
  return { id: body.data?.id ?? 'u-1', name: body.data?.name ?? username }
}

export async function fetchSession(): Promise<AuthUser | null> {
  const res = await request('/api/session', {
    method: 'GET',
  }, { on401: 'silent' })
  if (!res.ok) return null
  const body = await res.json()
  return {
    id: body.data?.id ?? '',
    name: body.data?.name ?? '',
  }
}

export async function logout(): Promise<void> {
  await request('/api/logout', {
    method: 'POST',
    headers: csrfHeaders(),
  })
}

// ─── Upload ─────────────────────────────────────────────────────────────────

function toPerFileProgress(files: File[], loadedBytes: number): number[] {
  const total = files.reduce((acc, f) => acc + f.size, 0)
  if (total <= 0) {
    const fallback: number[] = []
    for (const _f of files) fallback.push(0)
    return fallback
  }

  let remaining = Math.max(0, loadedBytes)
  const perFile: number[] = []

  for (const f of files) {
    const bytesForThisFile = Math.min(Math.max(remaining, 0), f.size)
    perFile.push(Math.min(100, (bytesForThisFile / f.size) * 100))
    remaining -= f.size
  }

  return perFile
}

export function uploadFiles(
  files: File[],
  onProgress?: (perFile: number[]) => void,
  opts?: { folderId?: number },
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    if (!files.length) {
      resolve({ uploadedCount: 0, failedCount: 0, failedFiles: [] })
      return
    }

    const form = new FormData()
    for (const file of files) form.append('file', file)

    const xhr = new XMLHttpRequest()
    xhr.withCredentials = true
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable || !onProgress) return
      onProgress(toPerFileProgress(files, e.loaded))
    }
    xhr.onload = () => {
      let body: Record<string, unknown> = {}
      try {
        body = JSON.parse(xhr.responseText) as Record<string, unknown>
      } catch {
        body = {}
      }

      const data = (body.data as Record<string, unknown> | undefined) ?? {}
      const failedRaw = Array.isArray(data.failedFiles) ? data.failedFiles : []
      const failedFiles: UploadFailure[] = failedRaw
        .map((item) => {
          if (!item || typeof item !== 'object') return null
          const row = item as Record<string, unknown>
          return {
            fileName: String(row.fileName ?? ''),
            reason: String(row.reason ?? 'Upload failed'),
          }
        })
        .filter((item): item is UploadFailure => item !== null)

      const uploadedCount = typeof data.uploadedCount === 'number'
        ? data.uploadedCount
        : (xhr.status >= 200 && xhr.status < 300 ? files.length : 0)
      const failedCount = typeof data.failedCount === 'number'
        ? data.failedCount
        : failedFiles.length

      const result: UploadResult = {
        uploadedCount,
        failedCount,
        failedFiles,
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        if (onProgress) {
          const completed = files.map(() => 100)
          onProgress(completed)
        }
        resolve(result)
      } else if (xhr.status === 401) {
        emitUnauthorized()
        reject(new Error('Session expired'))
      } else if (failedCount > 0 || uploadedCount > 0) {
        resolve(result)
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`))
      }
    }
    xhr.onerror = () => reject(new Error('Network error during upload'))
    const uploadUrl = (() => {
      if (!opts?.folderId) return '/api/upload'
      const params = new URLSearchParams({ folderId: String(opts.folderId) })
      return `/api/upload?${params.toString()}`
    })()

    xhr.open('POST', uploadUrl)
    const csrf = getCookie('fm_csrf')
    if (csrf) xhr.setRequestHeader('X-CSRF-Token', csrf)
    xhr.send(form)
  })
}

export function uploadFile(file: File, onProgress?: (percent: number) => void): Promise<UploadResult> {
  return uploadFiles([file], (perFile) => onProgress?.(perFile[0] ?? 0))
}

// ─── Files ──────────────────────────────────────────────────────────────────

export type PagedFiles = {
  files: FileMeta[]
  total: number
}

export async function fetchFiles(folderId?: number): Promise<FileMeta[]> {
  try {
    const url = folderId ? `/api/files?folderId=${encodeURIComponent(String(folderId))}` : '/api/files'
    const res = await request(url)
    if (!res.ok) return []
    const body = await res.json()
    // Backend returns { status, data: FileMetadata[] }
    const items: Array<Record<string, unknown>> = Array.isArray(body.data) ? body.data : []
    return items.map(mapFileItem)
  } catch {
    return []
  }
}

export async function fetchFilesPaginated(limit: number, offset: number): Promise<PagedFiles> {
  try {
    const url = `/api/files?limit=${limit}&offset=${offset}`
    const res = await request(url)
    if (!res.ok) return { files: [], total: 0 }
    const body = await res.json()
    const data = body.data as Record<string, unknown>
    if (!data || typeof data.total !== 'number' || !Array.isArray(data.files)) {
      return { files: [], total: 0 }
    }
    return {
      files: (data.files as Array<Record<string, unknown>>).map(mapFileItem),
      total: data.total,
    }
  } catch {
    return { files: [], total: 0 }
  }
}

export async function fetchSharedFilesCount(): Promise<number> {
  try {
    const res = await request('/api/files/shared-count')
    if (!res.ok) return 0
    const body = await res.json()
    const data = body.data as Record<string, unknown>
    return Number(data?.count ?? 0)
  } catch {
    return 0
  }
}

export async function fetchStarredFilesCount(): Promise<number> {
  try {
    const res = await request('/api/files/starred-count')
    if (!res.ok) return 0
    const body = await res.json()
    const data = body.data as Record<string, unknown>
    return Number(data?.count ?? 0)
  } catch {
    return 0
  }
}

export async function fetchTrashFiles(): Promise<FileMeta[]> {
  try {
    const res = await request('/api/trash')
    if (!res.ok) return []
    const body = await res.json()
    const items: Array<Record<string, unknown>> = Array.isArray(body.data) ? body.data : []
    return items.map(mapFileItem)
  } catch {
    return []
  }
}

export async function fetchFolders(): Promise<FolderItem[]> {
  try {
    const res = await request('/api/folders')
    if (!res.ok) return []
    const body = await res.json()
    const items: Array<Record<string, unknown>> = Array.isArray(body.data) ? body.data : []
    return items.map(mapFolderItem)
  } catch {
    return []
  }
}

export async function createFolder(name: string): Promise<FolderItem> {
  const res = await request('/api/folders', {
    method: 'POST',
    headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error('Failed to create folder')
  const body = await res.json()
  return mapFolderItem((body.data as Record<string, unknown>) ?? {})
}

export async function deleteFile(systemName: string): Promise<void> {
  await request(`/api/files/${encodeURIComponent(systemName)}`, {
    method: 'DELETE',
    headers: csrfHeaders(),
  })
}

export async function moveFileToFolder(systemName: string, folderId?: number): Promise<void> {
  const payload: { folderId: number | null } = {
    folderId: typeof folderId === 'number' ? folderId : null,
  }

  const res = await request(`/api/files/${encodeURIComponent(systemName)}/folder`, {
    method: 'PATCH',
    headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Failed to move file')
}

export async function setFileStarred(systemName: string, starred: boolean): Promise<void> {
  const res = await request(`/api/files/${encodeURIComponent(systemName)}/star`, {
    method: 'PATCH',
    headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ starred }),
  })
  if (!res.ok) throw new Error('Failed to update starred state')
}

export async function hardDeleteTrashFile(systemName: string): Promise<void> {
  await request(`/api/trash/${encodeURIComponent(systemName)}`, {
    method: 'DELETE',
    headers: csrfHeaders(),
  })
}

export async function restoreTrashFile(systemName: string): Promise<void> {
  await request(`/api/trash/${encodeURIComponent(systemName)}/restore`, {
    method: 'POST',
    headers: csrfHeaders(),
  })
}

// ─── Presigned link ─────────────────────────────────────────────────────────

export async function generateLink(systemName: string): Promise<string> {
  const res = await request('/api/token', {
    method: 'POST',
    headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ systemName }),
  })
  if (!res.ok) throw new Error('Failed to generate link')
  const body = await res.json()
  // Return absolute URL so recipient can open it directly
  return `${window.location.origin}${body.data?.downloadUrl ?? ''}`
}
