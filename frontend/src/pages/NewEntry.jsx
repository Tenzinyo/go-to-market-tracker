import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useUser } from '../App'
import ConfirmationCard from '../components/ConfirmationCard'

const ACTIVITY_TYPES = ['Meeting', 'Call', 'Email', 'Demo', 'Presentation', 'Follow-up', 'Proposal', 'Contract', 'Podcast', 'Conference']
const TODAY = new Date().toISOString().split('T')[0]

// ── Compact card for thread review ─────────────────────────────────────────────
function ThreadCard({ preview, index, checked, onToggle, onChange }) {
  const [expanded, setExpanded] = useState(false)

  function field(key, val) {
    onChange(index, key, val)
  }

  return (
    <div style={{
      border: `2px solid ${checked ? '#4f46e5' : '#e5e7eb'}`,
      borderRadius: 8,
      padding: '12px 14px',
      background: checked ? '#fafafe' : '#fafafa',
      opacity: checked ? 1 : 0.55,
      transition: 'all 0.1s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggle(index)}
          style={{ marginTop: 3, width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            {preview.detected_author && (
              <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', background: '#f3f4f6', padding: '1px 7px', borderRadius: 10 }}>
                {preview.detected_author}
              </span>
            )}
            {preview.detected_timestamp && (
              <span style={{ fontSize: 11, color: '#9ca3af' }}>{preview.detected_timestamp}</span>
            )}
          </div>

          {/* Key fields — compact editable row */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <input
              style={{ flex: '1 1 140px', minWidth: 120, padding: '4px 8px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: 13 }}
              placeholder="Account"
              value={preview.account_name ?? ''}
              onChange={e => field('account_name', e.target.value)}
            />
            <select
              style={{ flex: '0 0 auto', padding: '4px 8px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: 13 }}
              value={preview.activity_type ?? ''}
              onChange={e => field('activity_type', e.target.value)}
            >
              <option value="">Type…</option>
              {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input
              type="date"
              style={{ flex: '0 0 auto', padding: '4px 8px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: 13 }}
              value={preview.meeting_date ?? TODAY}
              onChange={e => field('meeting_date', e.target.value)}
            />
          </div>

          {/* Purpose */}
          {preview.purpose && (
            <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>
              <span style={{ color: '#9ca3af' }}>Topic: </span>{preview.purpose}
            </div>
          )}

          {/* Next step */}
          {preview.next_step && (
            <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>
              <span style={{ color: '#9ca3af' }}>Next: </span>{preview.next_step}
              {preview.next_step_date && <span style={{ color: '#9ca3af' }}> by {preview.next_step_date}</span>}
            </div>
          )}

          {/* Raw text toggle */}
          <button
            type="button"
            onClick={() => setExpanded(x => !x)}
            style={{ fontSize: 11, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 2 }}
          >
            {expanded ? '▲ hide text' : '▼ show raw text'}
          </button>
          {expanded && (
            <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280', background: '#f9fafb', borderRadius: 5, padding: '6px 10px', whiteSpace: 'pre-wrap' }}>
              {preview.raw_text}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function NewEntry() {
  const [text, setText] = useState('')
  const [source, setSource] = useState('typed')
  const [preview, setPreview] = useState(null)
  const [threadPreviews, setThreadPreviews] = useState(null)  // array for paste thread
  const [threadChecked, setThreadChecked] = useState([])       // which entries are selected
  const [stages, setStages] = useState([])
  const [extracting, setExtracting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [error, setError] = useState(null)

  // Voice recording state
  const [recording, setRecording] = useState(false)
  const [interim, setInterim] = useState('')
  const recognitionRef = useRef(null)
  const finalRef = useRef('')

  const { currentUser } = useUser()
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/stages').then(d => setStages(d.stages)).catch(() => {})
  }, [])

  // ── Voice recording ────────────────────────────────────────────────────────
  function toggleRecording() {
    if (recording) {
      recognitionRef.current?.stop()
      return
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      setError('Speech recognition requires Chrome or Edge. Use the Type tab in other browsers.')
      return
    }

    const r = new SR()
    r.continuous = true
    r.interimResults = true
    r.lang = 'en-US'
    recognitionRef.current = r
    finalRef.current = ''
    setText('')
    setInterim('')
    setError(null)

    r.onresult = (event) => {
      let interimText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalRef.current += t + ' '
        } else {
          interimText = t
        }
      }
      setText(finalRef.current.trim())
      setInterim(interimText)
    }

    r.onend = () => {
      setRecording(false)
      setInterim('')
      setText(finalRef.current.trim())
    }

    r.onerror = (e) => {
      if (e.error !== 'aborted') setError(`Mic error: ${e.error}`)
      setRecording(false)
      setInterim('')
    }

    r.start()
    setRecording(true)
  }

  function switchSource(s) {
    if (recording) recognitionRef.current?.stop()
    setSource(s)
    setText('')
    setInterim('')
    setError(null)
  }

  // ── Extract ────────────────────────────────────────────────────────────────
  async function handleExtract(e) {
    e.preventDefault()
    if (!text.trim()) return
    if (recording) recognitionRef.current?.stop()
    setExtracting(true)
    setError(null)
    try {
      if (source === 'pasted') {
        const d = await api.post('/entries/extract-conversation', {
          text:             text.trim(),
          default_owner_id: currentUser?.id ?? null,
          timezone:         currentUser?.timezone ?? 'America/New_York',
        })
        setThreadPreviews(d.previews)
        setThreadChecked(d.previews.map(() => true))
      } else {
        const d = await api.post('/entries/extract', {
          text:     text.trim(),
          owner_id: currentUser?.id ?? null,
          timezone: currentUser?.timezone ?? 'America/New_York',
          source,
        })
        setPreview(d.preview)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setExtracting(false)
    }
  }

  async function handleConfirm(data) {
    setSaving(true)
    setError(null)
    try {
      await api.post('/entries', { ...data, owner_id: currentUser?.id ?? null, source })
      navigate('/log')
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  // ── Thread field edit ───────────────────────────────────────────────────────
  function handleThreadChange(index, key, value) {
    setThreadPreviews(prev => prev.map((p, i) => i === index ? { ...p, [key]: value } : p))
  }

  function handleThreadToggle(index) {
    setThreadChecked(prev => prev.map((v, i) => i === index ? !v : v))
  }

  async function handleThreadSave() {
    const toSave = threadPreviews.filter((_, i) => threadChecked[i])
    if (toSave.length === 0) return
    setSaving(true)
    setError(null)
    let count = 0
    try {
      for (const p of toSave) {
        await api.post('/entries', {
          ...p,
          owner_id: currentUser?.id ?? null,
          source:   'pasted',
        })
        count++
        setSavedCount(count)
      }
      navigate('/log')
    } catch (err) {
      setError(`Saved ${count} of ${toSave.length}. Error: ${err.message}`)
      setSaving(false)
    }
  }

  // ── Thread review screen ───────────────────────────────────────────────────
  if (threadPreviews) {
    const selectedCount = threadChecked.filter(Boolean).length
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Review Thread ({threadPreviews.length} messages)</h1>
        </div>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 16 }}>
            Each message was extracted separately. Check the ones you want to save, edit key fields inline, then click Save.
          </p>

          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button type="button" className="btn btn-sm" onClick={() => setThreadChecked(threadPreviews.map(() => true))}>
              Select all
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setThreadChecked(threadPreviews.map(() => false))}>
              Deselect all
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {threadPreviews.map((p, i) => (
              <ThreadCard
                key={i}
                preview={p}
                index={i}
                checked={threadChecked[i]}
                onToggle={handleThreadToggle}
                onChange={handleThreadChange}
              />
            ))}
          </div>

          {error && <div className="inline-error" style={{ marginBottom: 12 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn"
              onClick={() => { setThreadPreviews(null); setThreadChecked([]); setError(null) }}
            >
              ← Back
            </button>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              disabled={selectedCount === 0 || saving}
              onClick={handleThreadSave}
            >
              {saving ? `Saving… (${savedCount}/${selectedCount})` : `Save ${selectedCount} entr${selectedCount === 1 ? 'y' : 'ies'}`}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Single preview screen ──────────────────────────────────────────────────
  if (preview) {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Review Entry</h1>
        </div>
        {error && <div className="inline-error">{error}</div>}
        <ConfirmationCard
          preview={preview}
          stages={stages}
          onConfirm={handleConfirm}
          onCancel={() => { setPreview(null); setError(null) }}
          submitting={saving}
        />
      </div>
    )
  }

  // ── Input screen ───────────────────────────────────────────────────────────
  const displayText = recording ? (text + (interim ? ' ' + interim : '')) : text

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Log Activity</h1>
      </div>

      <div className="new-entry-form">
        <div className="card">
          {/* Source tabs */}
          <div className="source-tabs">
            <button type="button" className={`source-tab${source === 'typed'  ? ' active' : ''}`} onClick={() => switchSource('typed')}>Type</button>
            <button type="button" className={`source-tab${source === 'voice'  ? ' active' : ''}`} onClick={() => switchSource('voice')}>Voice</button>
            <button type="button" className={`source-tab${source === 'pasted' ? ' active' : ''}`} onClick={() => switchSource('pasted')}>Paste thread</button>
          </div>

          <form onSubmit={handleExtract}>
            {/* Voice tab — mic button UI */}
            {source === 'voice' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0 8px' }}>
                <button
                  type="button"
                  onClick={toggleRecording}
                  style={{
                    width: 72, height: 72, borderRadius: '50%',
                    background: recording ? '#ef4444' : '#4f46e5',
                    border: 'none', color: 'white', fontSize: 28,
                    cursor: 'pointer', transition: 'all 0.15s',
                    boxShadow: recording ? '0 0 0 6px rgba(239,68,68,0.2)' : '0 2px 12px rgba(79,70,229,0.3)',
                  }}
                  title={recording ? 'Stop recording' : 'Start recording'}
                >
                  {recording ? '■' : '🎙'}
                </button>
                <div style={{ marginTop: 10, fontSize: 13, color: recording ? '#ef4444' : '#6b7280', fontWeight: 500 }}>
                  {recording ? 'Recording… click to stop' : 'Click to speak'}
                </div>
                {interim && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#9ca3af', fontStyle: 'italic', maxWidth: 400, textAlign: 'center' }}>
                    {interim}
                  </div>
                )}
              </div>
            )}

            {/* Transcript / text area */}
            <div className="form-group" style={{ position: 'relative', marginTop: source === 'voice' ? 12 : 0 }}>
              {source !== 'voice' && (
                <label className="form-label">
                  {source === 'pasted' ? 'Paste conversation thread' : 'Describe what happened'}
                </label>
              )}
              {source === 'voice' && text && (
                <label className="form-label">Transcript</label>
              )}
              {(source !== 'voice' || text || interim) && (
                <textarea
                  className="form-input"
                  style={{
                    minHeight: source === 'pasted' ? 180 : 120,
                    paddingBottom: 24,
                    color: (recording && interim) ? '#6b7280' : undefined,
                  }}
                  value={source === 'voice' ? displayText : text}
                  onChange={e => { if (source !== 'voice' || !recording) setText(e.target.value) }}
                  readOnly={source === 'voice' && recording}
                  placeholder={
                    source === 'pasted'
                      ? 'Paste a chat or email thread. Each message will be extracted separately.\n\n[10:30] Alice: Met with Acme today about renewal…'
                      : 'e.g. "Had a meeting with Nomura to discuss partnership in AI security. Will follow up next week."'
                  }
                  autoFocus={source !== 'voice'}
                />
              )}
              {text && <span className="char-count">{text.length}</span>}
            </div>

            {!currentUser && (
              <div className="inline-warn">
                No user selected — pick your name in the sidebar to associate this entry with you.
              </div>
            )}
            {error && <div className="inline-error">{error}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                disabled={!text.trim() || extracting || recording}
                className="btn btn-primary btn-lg"
              >
                {extracting ? 'Extracting…' : 'Extract & Review →'}
              </button>
            </div>
          </form>
        </div>

        <p className="text-muted text-sm" style={{ marginTop: 10, textAlign: 'center' }}>
          Fields are extracted automatically — no AI required.
          {source === 'voice' && ' · Speech recognition works in Chrome and Edge.'}
        </p>
      </div>
    </div>
  )
}
