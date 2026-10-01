import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api'
import { useSSE } from '../hooks/useSSE'
import { useUser } from '../App'
import StageTag from '../components/StageTag'
import { tagColor } from '../lib/tagColors'

function TagEditor({ account, onUpdate }) {
  const [tags, setTags] = useState(() => {
    try { return JSON.parse(account.tags || '[]') } catch { return [] }
  })
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)

  async function save(newTags) {
    setSaving(true)
    try {
      await api.patch(`/accounts/${account.id}`, { tags: newTags })
      setTags(newTags)
      if (onUpdate) onUpdate(newTags)
    } finally {
      setSaving(false)
    }
  }

  function addTag() {
    const t = input.trim()
    if (!t || tags.includes(t)) { setInput(''); return }
    save([...tags, t])
    setInput('')
  }

  function removeTag(t) {
    save(tags.filter(x => x !== t))
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 }}>
      {tags.map(t => {
        const c = tagColor(t)
        return (
          <span key={t} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: c.bg, color: c.text,
            padding: '2px 8px', borderRadius: 99, fontSize: 12, fontWeight: 500,
          }}>
            {t}
            <button
              onClick={() => removeTag(t)}
              disabled={saving}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: c.text, opacity: 0.6, fontSize: 14 }}
            >×</button>
          </span>
        )
      })}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
        placeholder="+ add tag"
        style={{
          border: '1px dashed #d1d5db', borderRadius: 99, padding: '2px 10px',
          fontSize: 12, outline: 'none', width: 90, color: '#6b7280', background: 'transparent',
        }}
      />
    </div>
  )
}

const ACTIVITY_ICON = {
  Meeting: '◆', Call: '☎', Email: '✉', Demo: '▶',
  Presentation: '◈', 'Follow-up': '↩', Proposal: '📄', Contract: '✍',
  Podcast: '🎙', Conference: '◉',
}

function ShareModal({ account, onClose }) {
  const { currentUser } = useUser()
  const [options, setOptions]   = useState({ hideDealAmounts: false, hideContacts: false, hideOutcomes: false })
  const [summary, setSummary]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [copied, setCopied]     = useState(false)
  const textRef = useRef(null)

  function toggle(key) {
    setOptions(o => ({ ...o, [key]: !o[key] }))
    setSummary('')
  }

  async function generate(method) {
    setLoading(true)
    try {
      const data = await api.post('/share/generate', {
        account_id:   account.id,
        shared_by_id: currentUser?.id ?? null,
        method,
        options,
      })
      setSummary(data.summary)
      if (method === 'mailto') {
        const subject = encodeURIComponent(`Account Summary: ${account.name}`)
        const body    = encodeURIComponent(data.summary)
        window.location.href = `mailto:?subject=${subject}&body=${body}`
      }
    } catch (e) {
      setSummary(`Error: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function copy() {
    if (!summary) await generate('copy')
    try {
      await navigator.clipboard.writeText(summary || textRef.current?.value || '')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      textRef.current?.select()
      document.execCommand('copy')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'white', borderRadius: 12, padding: 28, width: 560, maxWidth: '95vw',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column', gap: 16,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Share: {account.name}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>×</button>
        </div>

        {/* Options */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Filter sensitive info
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              ['hideDealAmounts', 'Hide deal amounts'],
              ['hideContacts',    'Hide contact names & emails'],
              ['hideOutcomes',    'Hide outcome notes'],
            ].map(([key, label]) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                <input type="checkbox" checked={options[key]} onChange={() => toggle(key)} />
                {label}
              </label>
            ))}
          </div>
        </div>

        {/* Generate buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-primary"
            style={{ flex: 1 }}
            disabled={loading}
            onClick={() => generate('copy')}
          >
            {loading ? 'Generating…' : 'Generate Preview'}
          </button>
        </div>

        {/* Preview */}
        {summary && (
          <>
            <textarea
              ref={textRef}
              readOnly
              value={summary}
              style={{
                flex: 1, minHeight: 260, fontFamily: 'monospace', fontSize: 12,
                background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8,
                padding: 12, resize: 'vertical', lineHeight: 1.6,
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={copy}>
                {copied ? '✓ Copied!' : 'Copy to Clipboard'}
              </button>
              <button
                className="btn"
                style={{ flex: 1, background: 'white', border: '1px solid #e5e7eb' }}
                onClick={() => generate('mailto')}
              >
                Open in Email
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function AccountDetail() {
  const { id } = useParams()
  const [account, setAccount] = useState(null)
  const [contacts, setContacts] = useState([])
  const [entries, setEntries] = useState([])
  const [stageHistory, setStageHistory] = useState([])
  const [loading, setLoading]     = useState(true)
  const [showShare, setShowShare] = useState(false)

  function load() {
    Promise.all([
      api.get(`/accounts/${id}`),
      api.get(`/accounts/${id}/timeline`),
    ])
      .then(([detail, timeline]) => {
        setAccount(detail.account)
        setContacts(detail.contacts)
        setStageHistory(detail.stage_history)
        setEntries(timeline.entries)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useSSE(event => {
    if (['new_entry', 'entry_updated', 'entry_deleted', 'stage_change', 'account_updated'].includes(event.type)) {
      if (!event.data?.account_id || String(event.data.account_id) === id) load()
    }
  })

  if (loading) return <div className="loading">Loading account…</div>
  if (!account) return <div className="loading">Account not found</div>

  const initials = account.name
    .split(/\s+/)
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="page">
      <div style={{ marginBottom: 16 }}>
        <Link to="/accounts" className="text-muted text-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          ← Accounts
        </Link>
      </div>

      <div className="account-header">
        <div className="account-avatar">{initials}</div>
        <div style={{ flex: 1 }}>
          <h1 className="account-name">{account.name}</h1>
          <div className="account-meta">
            <StageTag name={account.stage_name} colorHex={account.color_hex} textColorHex={account.text_color_hex} />
            <span>{entries.length} {entries.length === 1 ? 'activity' : 'activities'}</span>
          </div>
          <TagEditor account={account} onUpdate={tags => setAccount(a => ({ ...a, tags: JSON.stringify(tags) }))} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" style={{ background: 'white', border: '1px solid #e5e7eb' }} onClick={() => setShowShare(true)}>
            ↗ Share
          </button>
          <Link to="/log/new" className="btn btn-primary btn-sm">+ Log Activity</Link>
        </div>
      </div>

      {showShare && <ShareModal account={account} onClose={() => setShowShare(false)} />}

      <div className="card-grid" style={{ gridTemplateColumns: '1fr 2fr', alignItems: 'start' }}>
        {/* Left column */}
        <div>
          {/* Contacts */}
          <div className="card">
            <div className="card-title">Contacts ({contacts.length})</div>
            {contacts.length === 0 ? (
              <div className="text-muted text-sm">No contacts recorded</div>
            ) : (
              <ul className="alert-list">
                {contacts.map(c => (
                  <li key={c.id} className="alert-item">
                    <div>
                      <div style={{ fontWeight: 500 }}>{c.name}</div>
                      {c.email && <div className="text-muted text-sm">{c.email}</div>}
                      {c.phone && <div className="text-muted text-sm">{c.phone}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Stage history */}
          {stageHistory.length > 0 && (
            <div className="card mt-3">
              <div className="card-title">Stage History</div>
              <ul className="alert-list">
                {stageHistory.map((h, i) => (
                  <li key={i} className="alert-item" style={{ flexWrap: 'wrap', gap: 5 }}>
                    {h.from_stage && (
                      <><StageTag name={h.from_stage} colorHex={h.from_color} />
                      <span className="text-muted text-xs">→</span></>
                    )}
                    <StageTag name={h.to_stage} colorHex={h.to_color} />
                    {h.changed_by && <span className="text-muted text-xs">by {h.changed_by}</span>}
                    <span className="text-muted text-xs" style={{ marginLeft: 'auto' }}>
                      {new Date(h.changed_at).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Activity timeline */}
        <div className="card">
          <div className="card-title">Activity Timeline ({entries.length})</div>
          {entries.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">≡</div>
              <div className="empty-label">No activities logged yet</div>
            </div>
          ) : (
            <div className="timeline">
              {entries.map(e => (
                <div key={e.id} className="timeline-item">
                  <div className="timeline-dot">
                    {ACTIVITY_ICON[e.activity_type] ?? '●'}
                  </div>
                  <div className="timeline-content">
                    <div className="timeline-date">
                      {e.meeting_date ?? new Date(e.created_at).toLocaleDateString()}
                      {e.meeting_time ? ` · ${e.meeting_time}` : ''}
                    </div>
                    <div className="timeline-title">
                      {e.activity_type ?? 'Activity'}
                      {e.channel ? ` · ${e.channel}` : ''}
                    </div>
                    {e.purpose && (
                      <div className="timeline-meta">{e.purpose}</div>
                    )}
                    {e.outcome && (
                      <div className="timeline-meta mt-1">Outcome: {e.outcome}</div>
                    )}
                    {e.next_step && (
                      <div className="timeline-meta mt-1" style={{ color: '#4f46e5' }}>
                        Next: {e.next_step}
                        {e.next_step_date ? ` by ${e.next_step_date}` : ''}
                      </div>
                    )}
                    {e.deal_amount && (
                      <div className="timeline-meta mt-1" style={{ color: '#16a34a' }}>
                        Deal: {e.deal_amount}
                      </div>
                    )}
                    {e.stage_name && (
                      <div className="mt-1">
                        <StageTag name={e.stage_name} colorHex={e.color_hex} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
