import { useCallback, useEffect, useState } from 'react'
import { BUCKET, supabase } from '../lib/supabase'
import { formatDate, isLinkActive, timeLeft } from '../lib/files'
import type { FileRow, ShareLinkRow } from '../lib/files'

const OPTIONS = [
  { label: '5 minutes', seconds: 5 * 60 },
  { label: '1 hour', seconds: 60 * 60 },
  { label: '24 hours', seconds: 24 * 60 * 60 },
]

interface Props {
  file: FileRow
  onClose: () => void
  onShared: (name: string) => void
}

export default function ShareModal({ file, onClose, onShared }: Props) {
  const [seconds, setSeconds] = useState(OPTIONS[0].seconds)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<{ url: string; expires: Date } | null>(null)
  const [copied, setCopied] = useState(false)
  const [history, setHistory] = useState<ShareLinkRow[] | null>(null)

  // Only the expiry time is stored, never the signed URL itself.
  const loadHistory = useCallback(async () => {
    const { data, error } = await supabase
      .from('share_links')
      .select('id, file_id, expires_at, created_at')
      .eq('file_id', file.id)
      .order('created_at', { ascending: false })
      .limit(10)
    setHistory(error ? [] : (data as ShareLinkRow[]))
  }, [file.id])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  async function generate() {
    setBusy(true)
    setError(null)
    setCopied(false)
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(file.storage_path, seconds)
    if (error || !data) {
      setBusy(false)
      setError(error?.message ?? 'Could not create link.')
      return
    }
    const expires = new Date(Date.now() + seconds * 1000)
    setLink({ url: data.signedUrl, expires })
    // Record the share for the history list; a failure here must not hide the link.
    await supabase.from('share_links').insert({ file_id: file.id, expires_at: expires.toISOString() })
    setBusy(false)
    onShared(file.file_name)
    void loadHistory()
  }

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(true)
    } catch {
      setError('Copy failed — select the link and copy it manually.')
    }
  }

  const activeCount = history?.filter((h) => isLinkActive(h)).length ?? 0

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>Share “{file.file_name}”</h2>
        <label>
          Link expires after
          <select value={seconds} disabled={busy}
            onChange={(e) => { setSeconds(Number(e.target.value)); setLink(null) }}>
            {OPTIONS.map((o) => <option key={o.seconds} value={o.seconds}>{o.label}</option>)}
          </select>
        </label>
        {error && <div className="alert error" role="alert">{error}</div>}
        {link && (
          <div className="share-result">
            <input readOnly value={link.url} onFocus={(e) => e.target.select()} />
            <button className="btn" onClick={() => void copy()}>{copied ? 'Copied!' : 'Copy'}</button>
            <p className="muted">Expires at {link.expires.toLocaleString()}</p>
          </div>
        )}
        <section className="share-history" aria-label="Share history">
          <h3>
            Share history{' '}
            {history && history.length > 0 && (
              <span className="muted">({activeCount} active)</span>
            )}
          </h3>
          {history === null ? (
            <p className="muted">Loading…</p>
          ) : history.length === 0 ? (
            <p className="muted">This file hasn’t been shared yet.</p>
          ) : (
            <ul>
              {history.map((h) => {
                const active = isLinkActive(h)
                return (
                  <li key={h.id}>
                    <span className={`badge ${active ? 'active' : 'expired'}`}>
                      {active ? 'Active' : 'Expired'}
                    </span>
                    <span>Created {formatDate(h.created_at)}</span>
                    <span className="muted">{timeLeft(h.expires_at)}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
        <div className="actions">
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn primary" disabled={busy} onClick={() => void generate()}>
            {busy ? 'Generating…' : link ? 'Regenerate link' : 'Generate link'}
          </button>
        </div>
      </div>
    </div>
  )
}
