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

export function validateFile(file: File): string | null {
  if (!ALLOWED_TYPES[file.type]) {
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
