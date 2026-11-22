import { useCallback, useEffect, useState } from 'react'
import { BUCKET, supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { ALLOWED_TYPES, formatDate, formatSize } from '../lib/files'
import type { FileRow } from '../lib/files'
import UploadArea from '../components/UploadArea'
import ShareModal from '../components/ShareModal'
import ConfirmDialog from '../components/ConfirmDialog'

interface Notice { kind: 'success' | 'error'; text: string }

export default function Dashboard() {
  const { session } = useAuth()
  const user = session!.user
  const [files, setFiles] = useState<FileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [shareFile, setShareFile] = useState<FileRow | null>(null)
  const [deleteFile, setDeleteFile] = useState<FileRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('files')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) setLoadError(error.message)
    else {
      setLoadError(null)
      setFiles(data as FileRow[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(t)
  }, [notice])

  async function confirmDelete() {
    if (!deleteFile) return
    setDeleting(true)
    const { error: stErr } = await supabase.storage.from(BUCKET).remove([deleteFile.storage_path])
    if (stErr) {
      setNotice({ kind: 'error', text: `Delete failed: ${stErr.message}` })
    } else {
      const { error: dbErr } = await supabase.from('files').delete().eq('id', deleteFile.id)
      if (dbErr) setNotice({ kind: 'error', text: `Delete failed: ${dbErr.message}` })
      else setNotice({ kind: 'success', text: `Deleted “${deleteFile.file_name}”.` })
    }
    setDeleting(false)
    setDeleteFile(null)
    await load()
  }

  return (
    <>
      <header className="header">
        <strong>🔒 Secure File Share</strong>
        <div className="header-right">
          <span className="muted email">{user.email}</span>
          <button className="btn" onClick={() => void supabase.auth.signOut()}>Logout</button>
        </div>
      </header>
      <main className="container">
        {notice && (
          <div className={`alert ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
            {notice.text}
          </div>
        )}
        <section className="card">
          <h2>Upload</h2>
          <UploadArea
            userId={user.id}
            onUploaded={(name) => {
              setNotice({ kind: 'success', text: `Uploaded “${name}”.` })
              void load()
            }}
            onError={(text) => setNotice({ kind: 'error', text })}
          />
        </section>
        <section className="card">
          <h2>My Files</h2>
          {loading ? (
            <p className="muted">Loading files…</p>
          ) : loadError ? (
            <div className="alert error">
              Could not load files: {loadError}{' '}
              <button className="link" onClick={() => { setLoading(true); void load() }}>Retry</button>
            </div>
          ) : files.length === 0 ? (
            <div className="empty">No files yet. Upload your first file above.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Name</th><th>Size</th><th>Type</th><th>Uploaded</th><th /></tr>
                </thead>
                <tbody>
                  {files.map((f) => (
                    <tr key={f.id}>
                      <td className="name" data-label="Name">{f.file_name}</td>
                      <td data-label="Size">{formatSize(f.size_bytes)}</td>
                      <td data-label="Type">{ALLOWED_TYPES[f.mime_type] ?? f.mime_type}</td>
                      <td data-label="Uploaded">{formatDate(f.created_at)}</td>
                      <td className="row-actions">
                        <button className="btn small" onClick={() => setShareFile(f)}>Share</button>
                        <button className="btn small danger" onClick={() => setDeleteFile(f)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
      {shareFile && (
        <ShareModal
          file={shareFile}
          onClose={() => setShareFile(null)}
          onShared={(name) => setNotice({ kind: 'success', text: `Share link created for “${name}”.` })}
        />
      )}
      {deleteFile && (
        <ConfirmDialog
          file={deleteFile}
          busy={deleting}
          onCancel={() => setDeleteFile(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </>
  )
}
