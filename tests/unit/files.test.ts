import { describe, expect, it } from 'vitest'
import {
  ALLOWED_TYPES,
  MAX_SIZE,
  buildStoragePath,
  formatSize,
  isLinkActive,
  normalizeMimeType,
  sanitizeFileName,
  timeLeft,
  validateFile,
} from '../../src/lib/files'

function makeFile(name: string, type: string, size: number): File {
  // Blob contents only matter for size; allocate lazily-sized buffer.
  return new File([new Uint8Array(size)], name, { type })
}

describe('validateFile: type', () => {
  it.each([
    ['doc.pdf', 'application/pdf'],
    ['pic.png', 'image/png'],
    ['pic.jpg', 'image/jpeg'],
    ['notes.txt', 'text/plain'],
    ['bundle.zip', 'application/zip'],
  ])('accepts %s (%s)', (name, type) => {
    expect(validateFile(makeFile(name, type, 100))).toBeNull()
  })

  it.each([
    ['virus.exe', 'application/x-msdownload'],
    ['page.html', 'text/html'],
    ['script.js', 'text/javascript'],
    ['image.svg', 'image/svg+xml'],
    ['anim.gif', 'image/gif'],
    ['unknown.bin', ''],
  ])('rejects %s (%s)', (name, type) => {
    const err = validateFile(makeFile(name, type, 100))
    expect(err).toMatch(/unsupported type/i)
    expect(err).toContain(name)
  })

  it('lists exactly the five allowed types', () => {
    expect(Object.values(ALLOWED_TYPES).sort()).toEqual(['JPEG', 'PDF', 'PNG', 'TXT', 'ZIP'])
  })
})

describe('validateFile: size', () => {
  it('accepts a file of exactly 10 MB', () => {
    expect(MAX_SIZE).toBe(10 * 1024 * 1024)
    expect(validateFile(makeFile('a.pdf', 'application/pdf', MAX_SIZE))).toBeNull()
  })

  it('rejects a file one byte over 10 MB', () => {
    expect(validateFile(makeFile('a.pdf', 'application/pdf', MAX_SIZE + 1))).toMatch(/10 MB/)
  })

  it('rejects a 0-byte file', () => {
    expect(validateFile(makeFile('empty.txt', 'text/plain', 0))).toMatch(/empty/i)
  })

  it('checks type before size', () => {
    expect(validateFile(makeFile('big.exe', 'application/x-msdownload', MAX_SIZE + 1))).toMatch(
      /unsupported type/i,
    )
  })
})

describe('sanitizeFileName', () => {
  it('keeps safe names unchanged', () => {
    expect(sanitizeFileName('report-2024_v1.pdf')).toBe('report-2024_v1.pdf')
  })

  it('replaces spaces and special characters with underscores', () => {
    expect(sanitizeFileName('my file (final) #1!.pdf')).toBe('my_file_final_1_.pdf')
  })

  it('removes path separators from traversal attempts', () => {
    for (const evil of ['../../etc/passwd', '..\\..\\windows\\system32', '/etc/passwd', 'a/../../b']) {
      const out = sanitizeFileName(evil)
      expect(out).not.toMatch(/[/\\]/)
      expect(out.startsWith('.')).toBe(false)
      expect(out).not.toMatch(/(^|[/\\])\.\.([/\\]|$)/)
    }
  })

  it('never returns an empty name or a bare dot name', () => {
    expect(sanitizeFileName('')).toBe('file')
    expect(sanitizeFileName('..')).toBe('file')
    expect(sanitizeFileName('...')).toBe('file')
  })

  it('strips leading dots (no hidden files)', () => {
    expect(sanitizeFileName('.htaccess')).toBe('htaccess')
  })

  it('truncates very long names to 100 chars, keeping the extension', () => {
    const out = sanitizeFileName('a'.repeat(500) + '.pdf')
    expect(out).toHaveLength(100)
    expect(out.endsWith('.pdf')).toBe(true)
  })

  it('handles unicode without producing unsafe characters', () => {
    for (const name of ['résumé.pdf', '日本語.txt', 'emoji😀.png', 'ﬁle.zip']) {
      const out = sanitizeFileName(name)
      expect(out).toMatch(/^[\w.-]+$/)
      expect(out.length).toBeGreaterThan(0)
    }
    expect(sanitizeFileName('ﬁle.zip')).toBe('file.zip') // NFKD normalises ligatures
  })

  it('strips null bytes and control characters', () => {
    expect(sanitizeFileName('a\u0000b\n.pdf')).toBe('a_b_.pdf')
  })
})

describe('buildStoragePath', () => {
  const uid = '123e4567-e89b-12d3-a456-426614174000'

  it('uses <user_id>/<timestamp>-<sanitized name>', () => {
    expect(buildStoragePath(uid, 'my file.pdf', 1700000000000)).toBe(
      `${uid}/1700000000000-my_file.pdf`,
    )
  })

  it('defaults the timestamp to now', () => {
    const before = Date.now()
    const path = buildStoragePath(uid, 'a.txt')
    const ts = Number(path.split('/')[1].split('-')[0])
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(Date.now())
  })

  it('keeps the file inside the user folder even for traversal names', () => {
    const path = buildStoragePath(uid, '../../other-user/secret.pdf', 1)
    const parts = path.split('/')
    expect(parts).toHaveLength(2)
    expect(parts[0]).toBe(uid)
  })
})

describe('formatSize', () => {
  it('formats small values in KB', () => {
    expect(formatSize(0)).toBe('0.0 KB')
    expect(formatSize(512)).toBe('0.5 KB')
    expect(formatSize(1024)).toBe('1.0 KB')
    expect(formatSize(1536)).toBe('1.5 KB')
  })

  it('formats values below 1 MB in KB', () => {
    expect(formatSize(1024 * 1024 - 1)).toBe('1024.0 KB')
  })

  it('formats MB values', () => {
    expect(formatSize(1024 * 1024)).toBe('1.00 MB')
    expect(formatSize(MAX_SIZE)).toBe('10.00 MB')
    expect(formatSize(2.5 * 1024 * 1024)).toBe('2.50 MB')
  })
})

describe('normalizeMimeType', () => {
  it('keeps canonical types', () => {
    expect(normalizeMimeType({ name: 'a.pdf', type: 'application/pdf' })).toBe('application/pdf')
  })

  it('maps the Windows ZIP type to application/zip', () => {
    expect(normalizeMimeType({ name: 'a.zip', type: 'application/x-zip-compressed' })).toBe('application/zip')
  })

  it('maps legacy JPEG types', () => {
    expect(normalizeMimeType({ name: 'a.jpg', type: 'image/jpg' })).toBe('image/jpeg')
    expect(normalizeMimeType({ name: 'a.jpg', type: 'image/pjpeg' })).toBe('image/jpeg')
  })

  it('ignores case and parameters', () => {
    expect(normalizeMimeType({ name: 'a.txt', type: 'Text/Plain; charset=utf-8' })).toBe('text/plain')
  })

  it('falls back to the extension only when no type is reported', () => {
    expect(normalizeMimeType({ name: 'Report.PDF', type: '' })).toBe('application/pdf')
    expect(normalizeMimeType({ name: 'noext', type: '' })).toBe('')
    expect(normalizeMimeType({ name: 'evil.exe', type: '' })).toBe('')
  })

  it('does not trust the extension when a disallowed type is reported', () => {
    expect(normalizeMimeType({ name: 'fake.pdf', type: 'text/html' })).toBe('')
  })

  it('lets validateFile accept a Windows ZIP', () => {
    expect(validateFile(makeFile('a.zip', 'application/x-zip-compressed', 10))).toBeNull()
  })
})

describe('share link helpers', () => {
  const now = Date.parse('2026-01-01T12:00:00Z')

  it('isLinkActive compares the expiry with now', () => {
    expect(isLinkActive({ expires_at: '2026-01-01T12:05:00Z' }, now)).toBe(true)
    expect(isLinkActive({ expires_at: '2026-01-01T12:00:00Z' }, now)).toBe(false)
    expect(isLinkActive({ expires_at: '2026-01-01T11:00:00Z' }, now)).toBe(false)
  })

  it('timeLeft shows minutes, hours or expired', () => {
    expect(timeLeft('2026-01-01T12:04:30Z', now)).toBe('5 min left')
    expect(timeLeft('2026-01-01T12:59:00Z', now)).toBe('59 min left')
    expect(timeLeft('2026-01-01T13:00:00Z', now)).toBe('1 h left')
    expect(timeLeft('2026-01-02T11:00:00Z', now)).toBe('23 h left')
    expect(timeLeft('2026-01-01T11:59:59Z', now)).toBe('expired')
  })
})
