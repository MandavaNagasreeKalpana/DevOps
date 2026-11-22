export const MAX_SIZE = 10 * 1024 * 1024
export const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'text/plain': 'TXT',
  'application/zip': 'ZIP',
}

export interface FileRow {
  id: string
  owner_id: string
  file_name: string
  storage_path: string
  size_bytes: number
  mime_type: string
  created_at: string
}

export interface ShareLinkRow {
  id: string
  file_id: string
  expires_at: string
  created_at: string
}

// Some browsers/OSes report a different MIME type for the same format
// (e.g. Chrome and Edge on Windows label ZIP files application/x-zip-compressed).
const MIME_ALIASES: Record<string, string> = {
  'application/x-zip-compressed': 'application/zip',
  'application/x-zip': 'application/zip',
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
}

// Used only when the browser reports no type at all.
const EXTENSION_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  txt: 'text/plain',
  zip: 'application/zip',
}

/**
 * The canonical MIME type for a file, or '' if it isn't one of the allowed formats.
 * The storage bucket only accepts the canonical types, so uploads must use this value.
 */
export function normalizeMimeType(file: Pick<File, 'name' | 'type'>): string {
  const reported = file.type.toLowerCase().split(';')[0].trim()
  if (ALLOWED_TYPES[reported]) return reported
  if (MIME_ALIASES[reported]) return MIME_ALIASES[reported]
  if (reported === '') {
    const ext = file.name.toLowerCase().split('.').pop() ?? ''
    return EXTENSION_TYPES[ext] ?? ''
  }
  return ''
}

/** Whether a share link is still usable at the given time. */
export function isLinkActive(link: Pick<ShareLinkRow, 'expires_at'>, now: number = Date.now()): boolean {
  return new Date(link.expires_at).getTime() > now
}

/** Human-readable time left, e.g. "4 min left", "23 h left", or "expired". */
export function timeLeft(expiresAt: string, now: number = Date.now()): string {
  const ms = new Date(expiresAt).getTime() - now
  if (ms <= 0) return 'expired'
  const min = Math.ceil(ms / 60_000)
  if (min < 60) return `${min} min left`
  return `${Math.ceil(min / 60)} h left`
}

export function validateFile(file: File): string | null {
  if (!normalizeMimeType(file)) {
    return `"${file.name}": unsupported type. Allowed: PDF, PNG, JPEG, TXT, ZIP.`
  }
  if (file.size === 0) return `"${file.name}" is empty.`
  if (file.size > MAX_SIZE) return `"${file.name}" exceeds the 10 MB limit.`
  return null
}

export function sanitizeFileName(name: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^\.+/, '')
    .replace(/_+/g, '_')
  return cleaned.slice(-100) || 'file'
}

export function buildStoragePath(userId: string, fileName: string, now: number = Date.now()): string {
  return `${userId}/${now}-${sanitizeFileName(fileName)}`
}

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}
