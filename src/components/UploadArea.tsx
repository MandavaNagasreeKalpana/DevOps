import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { BUCKET, supabase } from '../lib/supabase'
import { buildStoragePath, normalizeMimeType, validateFile } from '../lib/files'

interface Props {
  userId: string
  onUploaded: (name: string) => void
  onError: (msg: string) => void
}

export default function UploadArea({ userId, onUploaded, onError }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  async function uploadOne(file: File): Promise<boolean> {
    const invalid = validateFile(file)
    if (invalid) {
      onError(invalid)
      return false
    }
    const path = buildStoragePath(userId, file.name)
    const mimeType = normalizeMimeType(file)
    // supabase-js sends a File with its own reported type, so re-wrap it with the
    // canonical type; otherwise the bucket rejects e.g. application/x-zip-compressed.
    const body = file.type === mimeType ? file : new File([file], file.name, { type: mimeType })
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, body, { contentType: mimeType, upsert: false })
    if (upErr) {
      onError(`Upload failed for "${file.name}": ${upErr.message}`)
      return false
    }
    const { error: insErr } = await supabase.from('files').insert({
      file_name: file.name,
      storage_path: path,
      size_bytes: file.size,
      mime_type: mimeType,
    })
    if (insErr) {
      // Roll back so no orphaned object remains in storage.
      await supabase.storage.from(BUCKET).remove([path])
      onError(`Could not save "${file.name}": ${insErr.message}`)
      return false
    }
    onUploaded(file.name)
    return true
  }

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0 || status) return
    const files = Array.from(list)
    for (let i = 0; i < files.length; i++) {
      setStatus(`Uploading ${files[i].name} (${i + 1}/${files.length})…`)
      setProgress(Math.round((i / files.length) * 100))
      await uploadOne(files[i])
    }
    setProgress(100)
    setStatus(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    void handleFiles(e.dataTransfer.files)
  }

  return (
    <div
      className={`dropzone${dragging ? ' dragging' : ''}${status ? ' busy' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <p className="drop-title">Drag &amp; drop files here</p>
      <p className="muted">PDF, PNG, JPEG, TXT or ZIP — up to 10 MB each</p>
      <input
        ref={inputRef}
        type="file"
        hidden
        multiple
        accept=".pdf,.png,.jpg,.jpeg,.txt,.zip,application/pdf,image/png,image/jpeg,text/plain,application/zip"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <button className="btn primary" disabled={!!status} onClick={() => inputRef.current?.click()}>
        {status ? 'Uploading…' : 'Choose files'}
      </button>
      {status && (
        <div className="progress-wrap" aria-live="polite">
          <div className="progress"><div className="bar" style={{ width: `${progress}%` }} /></div>
          <span className="muted">{status}</span>
        </div>
      )}
    </div>
  )
}
