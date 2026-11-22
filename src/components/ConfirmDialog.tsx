import type { FileRow } from '../lib/files'

interface Props {
  file: FileRow
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}

export default function ConfirmDialog({ file, busy, onCancel, onConfirm }: Props) {
  return (
    <div className="overlay" onClick={busy ? undefined : onCancel}>
      <div className="modal card" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>Delete file?</h2>
        <p>
          “{file.file_name}” will be permanently deleted and any shared links will stop working.
        </p>
        <div className="actions">
          <button className="btn" disabled={busy} onClick={onCancel}>Cancel</button>
          <button className="btn danger" disabled={busy} onClick={onConfirm}>
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}
