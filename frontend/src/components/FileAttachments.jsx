import { useState, useEffect, useRef } from 'react'
import { useUser } from '../App'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSize(bytes) {
  if (bytes < 1024)         return `${bytes} B`
  if (bytes < 1024 * 1024)  return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(mimeType, name) {
  const ext = name?.split('.').pop()?.toLowerCase() ?? ''
  if (mimeType?.startsWith('image/'))            return '🖼'
  if (mimeType === 'application/pdf')            return '📄'
  if (['doc','docx'].includes(ext))              return '📝'
  if (['xls','xlsx','csv'].includes(ext))        return '📊'
  if (['ppt','pptx'].includes(ext))              return '📋'
  if (['zip','tar','gz','rar'].includes(ext))    return '🗜'
  if (mimeType?.startsWith('video/'))            return '🎬'
  if (mimeType?.startsWith('audio/'))            return '🎵'
  if (['js','ts','jsx','tsx','py','java','go','rb','json','html','css','sql'].includes(ext)) return '💻'
  return '📎'
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function FileAttachments({ entityType, entityId }) {
  const { currentUser }           = useUser()
  const [attachments, setAttachments] = useState([])
  const [uploading,   setUploading]   = useState(false)
  const [error,       setError]       = useState('')
  const [dragOver,    setDragOver]    = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (entityType && entityId) load()
  }, [entityType, entityId])

  function load() {
    fetch(`/api/attachments?entity_type=${entityType}&entity_id=${entityId}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setAttachments(d.attachments) })
      .catch(() => {})
  }

  async function uploadFiles(files) {
    if (!files?.length) return
    setUploading(true)
    setError('')

    const userId = currentUser?.id ?? null

    for (const file of files) {
      const form = new FormData()
      form.append('file', file)
      form.append('entity_type', entityType)
      form.append('entity_id',   String(entityId))

      try {
        const headers = {}
        if (userId) headers['X-User-Id'] = String(userId)

        const res = await fetch('/api/attachments', { method: 'POST', headers, body: form })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `Upload failed`)
      } catch (err) {
        setError(err.message)
      }
    }

    setUploading(false)
    load()
  }

  async function deleteAttachment(id) {
    if (!confirm('Delete this file?')) return
    const headers = {}
    if (currentUser?.id) headers['X-User-Id'] = String(currentUser.id)
    await fetch(`/api/attachments/${id}`, { method: 'DELETE', headers })
    setAttachments(prev => prev.filter(a => a.id !== id))
  }

  function onDrop(e) {
    e.preventDefault()
    setDragOver(false)
    uploadFiles(e.dataTransfer.files)
  }

  return (
    <div>
      <div className="card-title" style={{ marginBottom: 10 }}>
        Files &amp; Attachments
        {attachments.length > 0 && (
          <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: 6 }}>({attachments.length})</span>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? '#6366f1' : '#d1d5db'}`,
          borderRadius: 8,
          padding: '14px 12px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragOver ? '#f5f3ff' : '#fafafa',
          transition: 'all 0.15s',
          marginBottom: 12,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={e => uploadFiles(e.target.files)}
        />
        {uploading ? (
          <span style={{ fontSize: 13, color: '#6b7280' }}>Uploading…</span>
        ) : (
          <span style={{ fontSize: 13, color: '#6b7280' }}>
            {dragOver ? 'Drop to upload' : 'Click or drag files here · max 25 MB each'}
          </span>
        )}
      </div>

      {error && (
        <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 8 }}>{error}</div>
      )}

      {/* File list */}
      {attachments.length === 0 ? (
        <div className="text-muted text-sm" style={{ textAlign: 'center', padding: '8px 0' }}>
          No files attached yet
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {attachments.map(a => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8,
              background: '#fff',
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{fileIcon(a.mime_type, a.original_name)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.original_name}
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
                  {fmtSize(a.size)}
                  {a.uploaded_by_name && <span> · {a.uploaded_by_name}</span>}
                  {' · '}{new Date(a.created_at).toLocaleDateString()}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <a
                  href={`/api/attachments/${a.id}/file`}
                  download={a.original_name}
                  className="btn btn-sm"
                  style={{ background: '#ede9fe', color: '#4f46e5', border: 'none', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                >
                  ↓
                </a>
                <button
                  className="btn btn-sm"
                  style={{ background: 'white', border: '1px solid #fca5a5', color: '#ef4444' }}
                  onClick={() => deleteAttachment(a.id)}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
