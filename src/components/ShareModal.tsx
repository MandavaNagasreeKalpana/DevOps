import { useState } from 'react'
import { BUCKET, supabase } from '../lib/supabase'
import type { FileRow } from '../lib/files'

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

  async function generate() {
    setBusy(true)
    setError(null)
    setCopied(false)
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(file.storage_path, seconds)
    setBusy(false)
    if (error || !data) {
      setError(error?.message ?? 'Could not create link.')
      return
    }
    setLink({ url: data.signedUrl, expires: new Date(Date.now() + seconds * 1000) })
    onShared(file.file_name)
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
