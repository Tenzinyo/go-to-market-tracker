import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api'
import { useSSE } from '../hooks/useSSE'
import { useUser } from '../App'
import StageTag from '../components/StageTag'
import { tagColor } from '../lib/tagColors'
import ComposeEmailModal from '../components/ComposeEmailModal'
import TaskPanel from '../components/TaskPanel'
import FileAttachments from '../components/FileAttachments'

const LIFECYCLE_STAGES = ['lead', 'mql', 'sql', 'opportunity', 'customer', 'churned']
const LIFECYCLE_META = {
  lead:        { label: 'Lead',        color: '#94a3b8', bg: '#f1f5f9' },
  mql:         { label: 'MQL',         color: '#3b82f6', bg: '#eff6ff' },
  sql:         { label: 'SQL',         color: '#6366f1', bg: '#eef2ff' },
  opportunity: { label: 'Opportunity', color: '#8b5cf6', bg: '#f5f3ff' },
  customer:    { label: 'Customer',    color: '#16a34a', bg: '#f0fdf4' },
  churned:     { label: 'Churned',     color: '#dc2626', bg: '#fef2f2' },
}

function LifecycleSelector({ account, onUpdated }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const stage = account.lifecycle_stage
  const meta  = stage ? LIFECYCLE_META[stage] : null

  async function setStage(s) {
    setOpen(false)
    setSaving(true)
    try {
      await api.patch(`/accounts/${account.id}`, { lifecycle_stage: s })
      onUpdated()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <span
        onClick={() => setOpen(o => !o)}
        title="Click to set lifecycle stage"
        style={{
          display: 'inline-block', cursor: 'pointer',
          padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 600,
          background: meta?.bg ?? '#f3f4f6',
          color: meta?.color ?? '#6b7280',
          border: `1px solid ${meta?.color ?? '#e5e7eb'}44`,
          opacity: saving ? 0.6 : 1,
        }}
      >
        {meta ? meta.label : '+ Set lifecycle'}
      </span>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: '110%', left: 0, zIndex: 100,
            background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 4, minWidth: 160,
          }}>
            {stage && (
              <div
                onClick={() => setStage(null)}
                style={{ padding: '7px 12px', cursor: 'pointer', borderRadius: 6, fontSize: 12, color: '#9ca3af' }}
              >
                — Remove lifecycle
              </div>
            )}
            {LIFECYCLE_STAGES.map(s => (
              <div
                key={s}
                onClick={() => setStage(s)}
                style={{
                  padding: '7px 12px', cursor: 'pointer', borderRadius: 6,
                  fontSize: 13, fontWeight: s === stage ? 600 : 400,
                  background: s === stage ? '#f5f3ff' : 'transparent',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: LIFECYCLE_META[s].color, flexShrink: 0 }} />
                {LIFECYCLE_META[s].label}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

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

// ── Company Info (enrichment) ─────────────────────────────────────────────────

const INDUSTRIES = [
  'Technology','Software','Hardware','SaaS','Fintech','Healthcare','Biotech',
  'Pharmaceuticals','Manufacturing','Retail','E-commerce','Media','Advertising',
  'Education','Government','Non-profit','Real Estate','Energy','Utilities',
  'Transportation','Logistics','Consulting','Legal','Financial Services',
  'Insurance','Telecommunications','Hospitality','Food & Beverage','Other',
]

function CompanyInfoCard({ account, onUpdated }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)

  function startEdit() {
    setForm({
      website:        account.website        ?? '',
      industry:       account.industry       ?? '',
      employee_count: account.employee_count ?? '',
      annual_revenue: account.annual_revenue ?? '',
      city:           account.city           ?? '',
      country:        account.country        ?? '',
      linkedin_url:   account.linkedin_url   ?? '',
      description:    account.description    ?? '',
    })
    setEditing(true)
  }

  async function save() {
    setSaving(true)
    try {
      await api.patch(`/accounts/${account.id}`, {
        website:        form.website        || null,
        industry:       form.industry       || null,
        employee_count: form.employee_count ? Number(form.employee_count) : null,
        annual_revenue: form.annual_revenue ? Number(form.annual_revenue) : null,
        city:           form.city           || null,
        country:        form.country        || null,
        linkedin_url:   form.linkedin_url   || null,
        description:    form.description    || null,
      })
      setEditing(false)
      onUpdated()
    } finally {
      setSaving(false)
    }
  }

  const hasAny = account.website || account.industry || account.employee_count ||
    account.annual_revenue || account.city || account.country ||
    account.linkedin_url || account.description

  const s = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div className="card mt-3">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: editing ? 12 : hasAny ? 12 : 0 }}>
        <div className="card-title" style={{ margin: 0 }}>Company Info</div>
        {!editing && (
          <button className="btn btn-sm" style={{ background: 'white', border: '1px solid #e5e7eb' }} onClick={startEdit}>
            Edit
          </button>
        )}
      </div>

      {!editing ? (
        !hasAny ? (
          <div className="text-muted text-sm">
            No info yet — <button className="btn-link" style={{ color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: 0 }} onClick={startEdit}>add details</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {account.industry && (
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#9ca3af', width: 90, flexShrink: 0 }}>Industry</span>
                <span style={{ fontSize: 13, color: '#111827' }}>{account.industry}</span>
              </div>
            )}
            {account.website && (
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#9ca3af', width: 90, flexShrink: 0 }}>Website</span>
                <a href={account.website.startsWith('http') ? account.website : `https://${account.website}`}
                   target="_blank" rel="noreferrer"
                   style={{ fontSize: 13, color: '#6366f1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {account.website}
                </a>
              </div>
            )}
            {(account.city || account.country) && (
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#9ca3af', width: 90, flexShrink: 0 }}>Location</span>
                <span style={{ fontSize: 13, color: '#111827' }}>{[account.city, account.country].filter(Boolean).join(', ')}</span>
              </div>
            )}
            {account.employee_count && (
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#9ca3af', width: 90, flexShrink: 0 }}>Employees</span>
                <span style={{ fontSize: 13, color: '#111827' }}>{Number(account.employee_count).toLocaleString()}</span>
              </div>
            )}
            {account.annual_revenue && (
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#9ca3af', width: 90, flexShrink: 0 }}>Revenue</span>
                <span style={{ fontSize: 13, color: '#111827' }}>
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(account.annual_revenue)}
                </span>
              </div>
            )}
            {account.linkedin_url && (
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#9ca3af', width: 90, flexShrink: 0 }}>LinkedIn</span>
                <a href={account.linkedin_url} target="_blank" rel="noreferrer"
                   style={{ fontSize: 13, color: '#6366f1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {account.linkedin_url.replace(/^https?:\/\/(www\.)?/, '')}
                </a>
              </div>
            )}
            {account.description && (
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5, marginTop: 4, borderTop: '1px solid #f3f4f6', paddingTop: 8 }}>
                {account.description}
              </div>
            )}
          </div>
        )
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label className="form-label">Industry</label>
              <select className="form-input" value={form.industry} onChange={s('industry')}>
                <option value="">— select —</option>
                {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Employees</label>
              <input className="form-input" type="number" min="0" placeholder="e.g. 500"
                value={form.employee_count} onChange={s('employee_count')} />
            </div>
          </div>
          <div>
            <label className="form-label">Website</label>
            <input className="form-input" type="text" placeholder="https://example.com"
              value={form.website} onChange={s('website')} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label className="form-label">City</label>
              <input className="form-input" type="text" placeholder="San Francisco"
                value={form.city} onChange={s('city')} />
            </div>
            <div>
              <label className="form-label">Country</label>
              <input className="form-input" type="text" placeholder="USA"
                value={form.country} onChange={s('country')} />
            </div>
          </div>
          <div>
            <label className="form-label">Annual Revenue (USD)</label>
            <input className="form-input" type="number" min="0" placeholder="e.g. 5000000"
              value={form.annual_revenue} onChange={s('annual_revenue')} />
          </div>
          <div>
            <label className="form-label">LinkedIn URL</label>
            <input className="form-input" type="text" placeholder="https://linkedin.com/company/…"
              value={form.linkedin_url} onChange={s('linkedin_url')} />
          </div>
          <div>
            <label className="form-label">Description</label>
            <textarea className="form-input" rows={3} placeholder="What does this company do?"
              value={form.description} onChange={s('description')}
              style={{ resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Hierarchy (parent + subsidiaries) ─────────────────────────────────────────

function HierarchyCard({ account, children, onUpdated }) {
  const [pickingParent, setPickingParent] = useState(false)
  const [q, setQ]                         = useState('')
  const [results, setResults]             = useState([])
  const [saving, setSaving]               = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    clearTimeout(timerRef.current)
    if (q.trim().length < 2) { setResults([]); return }
    timerRef.current = setTimeout(() => {
      api.get(`/accounts?q=${encodeURIComponent(q.trim())}&limit=8`)
        .then(d => setResults(d.accounts.filter(a => a.id !== account.id)))
        .catch(() => {})
    }, 250)
    return () => clearTimeout(timerRef.current)
  }, [q, account.id])

  async function setParent(parentId) {
    setSaving(true)
    try {
      await api.patch(`/accounts/${account.id}`, { parent_id: parentId })
      setPickingParent(false)
      setQ('')
      setResults([])
      onUpdated()
    } finally {
      setSaving(false)
    }
  }

  const hasContent = account.parent_id || children.length > 0

  return (
    <div className="card mt-3">
      <div className="card-title" style={{ marginBottom: hasContent || pickingParent ? 10 : 0 }}>Hierarchy</div>

      {/* Parent */}
      <div style={{ marginBottom: children.length > 0 ? 10 : 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 6 }}>
          Parent Account
        </div>
        {account.parent_id ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link to={`/accounts/${account.parent_id}`} style={{ fontSize: 13, fontWeight: 500, color: '#4f46e5', flex: 1 }}>
              ↑ {account.parent_name}
            </Link>
            <button className="btn btn-sm" style={{ background: 'white', border: '1px solid #e5e7eb' }}
              onClick={() => setPickingParent(p => !p)}>Change</button>
            <button className="btn btn-sm" style={{ background: 'white', border: '1px solid #fca5a5', color: '#ef4444' }}
              onClick={() => setParent(null)}>×</button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="text-muted text-sm">No parent account</span>
            <button className="btn btn-sm" style={{ background: 'white', border: '1px solid #e5e7eb' }}
              onClick={() => setPickingParent(p => !p)}>Set parent</button>
          </div>
        )}

        {pickingParent && (
          <div style={{ marginTop: 8, position: 'relative' }}>
            <input
              className="form-input"
              autoFocus
              placeholder="Search accounts…"
              value={q}
              onChange={e => setQ(e.target.value)}
              disabled={saving}
            />
            {results.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden',
              }}>
                {results.map(a => (
                  <div key={a.id}
                    onMouseDown={() => setParent(a.id)}
                    style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f5f3ff'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ flex: 1 }}>{a.name}</span>
                    {a.stage_name && <span style={{ fontSize: 11, color: '#9ca3af' }}>{a.stage_name}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Subsidiaries */}
      {children.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 6 }}>
            Subsidiaries ({children.length})
          </div>
          <ul className="alert-list">
            {children.map(c => (
              <li key={c.id} className="alert-item">
                <Link to={`/accounts/${c.id}`} style={{ fontSize: 13, fontWeight: 500, color: '#374151', flex: 1 }}>
                  ↳ {c.name}
                </Link>
                {c.stage_name && (
                  <StageTag name={c.stage_name} colorHex={c.color_hex} />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function fmt(amount, currency = 'USD') {
  if (amount == null || amount === '') return '—'
  const n = Number(amount)
  if (isNaN(n)) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
}

const FORECAST_COLORS = {
  commit:    { color: '#16a34a', bg: '#dcfce7' },
  best_case: { color: '#0369a1', bg: '#e0f2fe' },
  pipeline:  { color: '#6366f1', bg: '#ede9fe' },
  omitted:   { color: '#6b7280', bg: '#f3f4f6' },
}

// ── ContactsCard ──────────────────────────────────────────────────────────────

function ContactForm({ contact, accountId, onSaved, onCancel }) {
  const [form, setForm] = useState({
    name:         contact?.name         ?? '',
    title:        contact?.title        ?? '',
    email:        contact?.email        ?? '',
    phone:        contact?.phone        ?? '',
    linkedin_url: contact?.linkedin_url ?? '',
    notes:        contact?.notes        ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function save(e) {
    e.preventDefault(); setSaving(true); setError('')
    try {
      const body = {
        name:         form.name.trim()         || null,
        title:        form.title.trim()        || null,
        email:        form.email.trim()        || null,
        phone:        form.phone.trim()        || null,
        linkedin_url: form.linkedin_url.trim() || null,
        notes:        form.notes.trim()        || null,
      }
      if (contact) { await api.patch(`/contacts/${contact.id}`, body) }
      else         { await api.post('/contacts', { ...body, account_id: accountId }) }
      onSaved()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <form onSubmit={save} style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label className="form-label">Name</label>
          <input className="form-input" style={{ padding: '5px 8px', fontSize: 13 }}
            value={form.name} onChange={e => set('name', e.target.value)} placeholder="Jane Smith" />
        </div>
        <div>
          <label className="form-label">Title</label>
          <input className="form-input" style={{ padding: '5px 8px', fontSize: 13 }}
            value={form.title} onChange={e => set('title', e.target.value)} placeholder="VP Sales" />
        </div>
        <div>
          <label className="form-label">Email</label>
          <input className="form-input" type="email" style={{ padding: '5px 8px', fontSize: 13 }}
            value={form.email} onChange={e => set('email', e.target.value)} placeholder="jane@co.com" />
        </div>
        <div>
          <label className="form-label">Phone</label>
          <input className="form-input" style={{ padding: '5px 8px', fontSize: 13 }}
            value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+1 555…" />
        </div>
      </div>
      <div>
        <label className="form-label">Notes</label>
        <input className="form-input" style={{ padding: '5px 8px', fontSize: 13 }}
          value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Champion, decision maker…" />
      </div>
      {error && <div style={{ color: '#ef4444', fontSize: 12 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? '…' : 'Save'}</button>
        <button type="button" className="btn btn-sm" style={{ background: 'white', border: '1px solid #e5e7eb' }} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function ContactsCard({ contacts, accountId, onReload, onCompose }) {
  const [adding,  setAdding]  = useState(false)
  const [editing, setEditing] = useState(null)

  async function remove(c) {
    if (!confirm(`Delete contact "${c.name}"?`)) return
    await api.del(`/contacts/${c.id}`)
    onReload()
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div className="card-title" style={{ margin: 0 }}>Contacts ({contacts.length})</div>
        {!adding && (
          <button className="btn btn-sm" style={{ background: 'white', border: '1px solid #e5e7eb', fontSize: 11 }}
            onClick={() => setAdding(true)}>+ Add</button>
        )}
      </div>

      {adding && (
        <ContactForm accountId={accountId} onSaved={() => { setAdding(false); onReload() }} onCancel={() => setAdding(false)} />
      )}

      {contacts.length === 0 && !adding ? (
        <div className="text-muted text-sm">No contacts — add one above</div>
      ) : (
        <ul className="alert-list" style={{ marginTop: adding ? 8 : 0 }}>
          {contacts.map(c => (
            <li key={c.id}>
              {editing === c.id ? (
                <ContactForm contact={c} accountId={accountId}
                  onSaved={() => { setEditing(null); onReload() }} onCancel={() => setEditing(null)} />
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{c.name || <span className="text-muted">Unnamed</span>}</div>
                    {c.title && <div style={{ fontSize: 11, color: '#6b7280' }}>{c.title}</div>}
                    {c.email && <div className="text-muted text-sm">{c.email}</div>}
                    {c.phone && <div className="text-muted text-sm">{c.phone}</div>}
                    {c.notes && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, fontStyle: 'italic' }}>{c.notes}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {c.email && (
                      <button className="btn btn-sm" style={{ background: 'white', border: '1px solid #e5e7eb' }}
                        title="Compose email" onClick={() => onCompose(c)}>✉</button>
                    )}
                    <button className="btn btn-sm" style={{ background: 'white', border: '1px solid #e5e7eb' }}
                      onClick={() => setEditing(c.id)}>Edit</button>
                    <button className="btn btn-sm" style={{ background: 'white', border: '1px solid #fca5a5', color: '#ef4444' }}
                      onClick={() => remove(c)}>×</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function AccountDetail() {
  const { id } = useParams()
  const { currentUser } = useUser()
  const [account, setAccount] = useState(null)
  const [contacts, setContacts] = useState([])
  const [entries, setEntries] = useState([])
  const [stageHistory, setStageHistory] = useState([])
  const [children, setChildren] = useState([])
  const [deals, setDeals] = useState([])
  const [emailLog, setEmailLog] = useState([])
  const [loading, setLoading]     = useState(true)
  const [showShare, setShowShare] = useState(false)
  const [showCompose, setShowCompose] = useState(false)
  const [composeContact, setComposeContact] = useState(null)

  function load() {
    Promise.all([
      api.get(`/accounts/${id}`),
      api.get(`/accounts/${id}/timeline`),
      api.get(`/deals?account_id=${id}`),
      api.get(`/emails/log?account_id=${id}&limit=20`),
    ])
      .then(([detail, timeline, dealsData, emailData]) => {
        setAccount(detail.account)
        setContacts(detail.contacts)
        setStageHistory(detail.stage_history)
        setChildren(detail.children ?? [])
        setEntries(timeline.entries)
        setDeals(dealsData.deals)
        setEmailLog(emailData.logs)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useSSE(event => {
    const relevant = ['new_entry', 'entry_updated', 'entry_deleted', 'stage_change', 'account_updated', 'deal_created', 'deal_updated', 'deal_deleted']
    if (relevant.includes(event.type)) {
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
            <LifecycleSelector account={account} onUpdated={load} />
            <span>{entries.length} {entries.length === 1 ? 'activity' : 'activities'}</span>
          </div>
          <TagEditor account={account} onUpdate={tags => setAccount(a => ({ ...a, tags: JSON.stringify(tags) }))} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" style={{ background: 'white', border: '1px solid #e5e7eb' }} onClick={() => setShowShare(true)}>
            ↗ Share
          </button>
          <button className="btn btn-sm" style={{ background: 'white', border: '1px solid #e5e7eb' }} onClick={() => setShowCompose(true)}>
            ✉ Email
          </button>
          <Link to="/log/new" className="btn btn-primary btn-sm">+ Log Activity</Link>
        </div>
      </div>

      {showShare && <ShareModal account={account} onClose={() => setShowShare(false)} />}

      {showCompose && (
        <ComposeEmailModal
          account={account}
          contacts={contacts}
          currentUser={currentUser}
          initialContactId={composeContact?.id ?? null}
          onClose={() => { setShowCompose(false); setComposeContact(null) }}
          onSent={() => api.get(`/emails/log?account_id=${id}&limit=20`).then(d => setEmailLog(d.logs)).catch(() => {})}
        />
      )}

      <div className="card-grid" style={{ gridTemplateColumns: '1fr 2fr', alignItems: 'start' }}>
        {/* Left column */}
        <div>
          {/* Contacts */}
          <ContactsCard
            contacts={contacts}
            accountId={id}
            onReload={load}
            onCompose={c => { setComposeContact(c); setShowCompose(true) }}
          />

          {/* Deals */}
          <div className="card mt-3">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div className="card-title" style={{ margin: 0 }}>Deals ({deals.length})</div>
              <Link to={`/deals?account_id=${id}`} className="text-muted text-xs">View all</Link>
            </div>
            {deals.length === 0 ? (
              <div className="text-muted text-sm">No deals — <Link to="/deals" style={{ color: '#6366f1' }}>create one</Link></div>
            ) : (
              <ul className="alert-list">
                {deals.map(d => {
                  const fc = FORECAST_COLORS[d.forecast_category] ?? FORECAST_COLORS.pipeline
                  return (
                    <li key={d.id} className="alert-item">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Link to={`/deals/${d.id}`} style={{ fontWeight: 500, fontSize: 13 }}>{d.name}</Link>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                          <StageTag name={d.stage_name} colorHex={d.color_hex} />
                          {d.amount != null && (
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>
                              {fmt(d.amount, d.currency)}
                            </span>
                          )}
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 99,
                            background: fc.bg, color: fc.color,
                          }}>
                            {d.forecast_category}
                          </span>
                        </div>
                      </div>
                    </li>
                  )
                })}
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

          {/* Tasks */}
          <TaskPanel
            accountId={id}
            currentUser={currentUser}
            users={[]}
          />

          {/* Attachments */}
          <div className="card mt-3">
            <FileAttachments entityType="account" entityId={id} />
          </div>

          {/* Company Info */}
          <CompanyInfoCard account={account} onUpdated={load} />

          {/* Hierarchy */}
          <HierarchyCard account={account} children={children} onUpdated={load} />

          {/* Email history */}
          {emailLog.length > 0 && (
            <div className="card mt-3">
              <div className="card-title">Sent Emails ({emailLog.length})</div>
              <ul className="alert-list">
                {emailLog.map(e => (
                  <li key={e.id} className="alert-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                      <span style={{ fontWeight: 500, fontSize: 13 }}>{e.subject}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 99,
                        background: e.status === 'sent' ? '#dcfce7' : e.status === 'mailto' ? '#e0f2fe' : '#fee2e2',
                        color:      e.status === 'sent' ? '#16a34a' : e.status === 'mailto' ? '#0369a1' : '#dc2626',
                      }}>
                        {e.status}
                      </span>
                    </div>
                    <div className="text-muted text-xs">
                      To: {e.to_name ? `${e.to_name} <${e.to_email}>` : e.to_email}
                    </div>
                    {e.template_name && <div className="text-muted text-xs">Template: {e.template_name}</div>}
                    <div className="text-muted text-xs">{new Date(e.sent_at).toLocaleString()}</div>
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
