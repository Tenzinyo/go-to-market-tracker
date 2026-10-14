import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useSSE } from '../hooks/useSSE'
import { useUser } from '../App'
import StageTag from '../components/StageTag'
import { tagColor } from '../lib/tagColors'
import TaskPanel from '../components/TaskPanel'
import FileAttachments from '../components/FileAttachments'

const FORECAST_LABELS = {
  commit:    { label: 'Commit',    color: '#16a34a', bg: '#dcfce7' },
  best_case: { label: 'Best Case', color: '#0369a1', bg: '#e0f2fe' },
  pipeline:  { label: 'Pipeline',  color: '#6366f1', bg: '#ede9fe' },
  omitted:   { label: 'Omitted',   color: '#6b7280', bg: '#f3f4f6' },
}

const ACTIVITY_ICON = {
  Meeting: '◆', Call: '☎', Email: '✉', Demo: '▶',
  Presentation: '◈', 'Follow-up': '↩', Proposal: '📄', Contract: '✍',
  Podcast: '🎙', Conference: '◉',
}

function fmt(amount, currency = 'USD') {
  if (amount == null || amount === '') return '—'
  const n = Number(amount)
  if (isNaN(n)) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
}

function TagEditor({ tags: initialTags, onSave }) {
  const [tags,  setTags]  = useState(initialTags)
  const [input, setInput] = useState('')

  function addTag() {
    const t = input.trim()
    if (!t || tags.includes(t)) { setInput(''); return }
    const next = [...tags, t]
    setTags(next); onSave(next); setInput('')
  }

  function removeTag(t) {
    const next = tags.filter(x => x !== t)
    setTags(next); onSave(next)
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      {tags.map(t => {
        const c = tagColor(t)
        return (
          <span key={t} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: c.bg, color: c.text,
            padding: '2px 8px', borderRadius: 99, fontSize: 12, fontWeight: 500,
          }}>
            {t}
            <button onClick={() => removeTag(t)}
              style={{ background: 'none', border: 'none', cursor: 'pointer',
                       padding: 0, lineHeight: 1, color: c.text, opacity: 0.6, fontSize: 14 }}>
              ×
            </button>
          </span>
        )
      })}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
        placeholder="+ tag"
        style={{
          border: '1px dashed #d1d5db', borderRadius: 99, padding: '2px 10px',
          fontSize: 12, outline: 'none', width: 70, color: '#6b7280', background: 'transparent',
        }}
      />
    </div>
  )
}

function EditModal({ deal, stages, users, onSave, onClose }) {
  const [form, setForm] = useState({
    name:              deal.name             ?? '',
    owner_id:          deal.owner_id         ?? '',
    current_stage_id:  deal.current_stage_id ?? '',
    amount:            deal.amount           ?? '',
    currency:          deal.currency         ?? 'USD',
    close_date:        deal.close_date       ?? '',
    probability:       deal.probability      ?? 0,
    forecast_category: deal.forecast_category ?? 'pipeline',
    product_line:      deal.product_line     ?? '',
    description:       deal.description      ?? '',
    lost_reason:       deal.lost_reason      ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      await onSave({
        ...form,
        amount:      form.amount !== '' ? Number(form.amount) : null,
        probability: Number(form.probability),
        owner_id:         form.owner_id         || null,
        current_stage_id: form.current_stage_id || null,
      })
      onClose()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
               display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: '100%', maxWidth: 560,
                    maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Edit Deal</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>×</button>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="form-label">Deal Name</label>
            <input className="form-input" required value={form.name}
              onChange={e => set('name', e.target.value)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="form-label">Owner</label>
              <select className="form-input" value={form.owner_id}
                onChange={e => set('owner_id', e.target.value)}>
                <option value="">— unassigned —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.display_name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Stage</label>
              <select className="form-input" value={form.current_stage_id}
                onChange={e => set('current_stage_id', e.target.value)}>
                <option value="">— no stage —</option>
                {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="form-label">Forecast Category</label>
              <select className="form-input" value={form.forecast_category}
                onChange={e => set('forecast_category', e.target.value)}>
                <option value="pipeline">Pipeline</option>
                <option value="best_case">Best Case</option>
                <option value="commit">Commit</option>
                <option value="omitted">Omitted</option>
              </select>
            </div>
            <div>
              <label className="form-label">Probability %</label>
              <input className="form-input" type="number" min="0" max="100"
                value={form.probability}
                onChange={e => set('probability', e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', gap: 12 }}>
            <div>
              <label className="form-label">Amount</label>
              <input className="form-input" type="number" min="0" step="any"
                value={form.amount}
                onChange={e => set('amount', e.target.value)} placeholder="e.g. 50000" />
            </div>
            <div>
              <label className="form-label">Currency</label>
              <select className="form-input" value={form.currency}
                onChange={e => set('currency', e.target.value)}>
                {['USD','EUR','GBP','CAD','AUD','JPY','SGD'].map(c =>
                  <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Expected Close</label>
              <input className="form-input" type="date" value={form.close_date}
                onChange={e => set('close_date', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="form-label">Product / Service Line</label>
            <input className="form-input" value={form.product_line}
              onChange={e => set('product_line', e.target.value)} />
          </div>

          <div>
            <label className="form-label">Description</label>
            <textarea className="form-input" rows={2} value={form.description}
              onChange={e => set('description', e.target.value)}
              style={{ resize: 'vertical' }} />
          </div>

          <div>
            <label className="form-label">Lost Reason</label>
            <input className="form-input" value={form.lost_reason}
              onChange={e => set('lost_reason', e.target.value)}
              placeholder="Why was this deal lost?" />
          </div>

          {error && <div style={{ color: '#ef4444', fontSize: 13 }}>{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function DealDetail() {
  const { id }         = useParams()
  const navigate       = useNavigate()
  const { currentUser } = useUser()

  const [deal,         setDeal]         = useState(null)
  const [stageHistory, setStageHistory] = useState([])
  const [activities,   setActivities]   = useState([])
  const [stages,       setStages]       = useState([])
  const [users,        setUsers]        = useState([])
  const [loading,      setLoading]      = useState(true)
  const [showEdit,     setShowEdit]     = useState(false)
  const [deleting,     setDeleting]     = useState(false)

  function load() {
    Promise.all([
      api.get(`/deals/${id}`),
      api.get('/stages'),
      api.get('/users'),
    ])
      .then(([detail, s, u]) => {
        setDeal(detail.deal)
        setStageHistory(detail.stage_history)
        setActivities(detail.activities)
        setStages(s.stages)
        setUsers(u.users)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useSSE(event => {
    if (['deal_updated', 'deal_deleted'].includes(event.type) && String(event.data?.id) === id) load()
  })

  async function handleSave(data) {
    await api.patch(`/deals/${id}`, data)
    load()
  }

  async function handleTagSave(tags) {
    await api.patch(`/deals/${id}`, { tags })
    setDeal(d => ({ ...d, tags: JSON.stringify(tags) }))
  }

  async function handleStageChange(stageId) {
    await api.post(`/deals/${id}/stage`, {
      to_stage_id: stageId,
      changed_by_id: currentUser?.id ?? null,
    })
    load()
  }

  async function handleDelete() {
    if (!window.confirm(`Delete deal "${deal.name}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await api.del(`/deals/${id}`)
      navigate('/deals')
    } catch {
      setDeleting(false)
    }
  }

  if (loading) return <div className="loading">Loading deal…</div>
  if (!deal)   return <div className="loading">Deal not found</div>

  let parsedTags = []
  try { parsedTags = JSON.parse(deal.tags || '[]') } catch {}

  const today    = new Date().toISOString().split('T')[0]
  const isOverdue = deal.close_date && deal.close_date < today && !deal.won_at && !deal.lost_at
  const forecast  = FORECAST_LABELS[deal.forecast_category] ?? FORECAST_LABELS.pipeline

  return (
    <div className="page">
      {showEdit && (
        <EditModal
          deal={deal}
          stages={stages}
          users={users}
          onSave={handleSave}
          onClose={() => setShowEdit(false)}
        />
      )}

      <div style={{ marginBottom: 16 }}>
        <Link to="/deals" className="text-muted text-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          ← Deals
        </Link>
      </div>

      {/* Header */}
      <div className="account-header">
        <div style={{
          width: 48, height: 48, borderRadius: 10, flexShrink: 0,
          background: deal.color_hex ?? '#6366f1',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 700, fontSize: 18,
        }}>
          $
        </div>
        <div style={{ flex: 1 }}>
          <h1 className="account-name">{deal.name}</h1>
          <div className="account-meta">
            <StageTag name={deal.stage_name} colorHex={deal.color_hex} textColorHex={deal.text_color_hex} />
            <span
              style={{
                background: forecast.bg, color: forecast.color,
                padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600,
              }}
            >
              {forecast.label}
            </span>
            <Link to={`/accounts/${deal.account_id}`} className="text-muted text-sm">
              {deal.account_name}
            </Link>
          </div>
          <div style={{ marginTop: 8 }}>
            <TagEditor tags={parsedTags} onSave={handleTagSave} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            className="btn btn-sm"
            style={{ color: '#dc2626', borderColor: '#fca5a5', background: 'white' }}
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowEdit(true)}>
            Edit Deal
          </button>
        </div>
      </div>

      <div className="card-grid" style={{ gridTemplateColumns: '1fr 2fr', alignItems: 'start' }}>
        {/* Left column — deal fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-title">Deal Details</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="text-muted text-sm">Amount</span>
                <span style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>
                  {fmt(deal.amount, deal.currency)}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="text-muted text-sm">Weighted Value</span>
                <span style={{ fontWeight: 600, fontSize: 13, color: '#16a34a' }}>
                  {deal.amount != null && deal.probability != null
                    ? fmt(deal.amount * deal.probability / 100, deal.currency)
                    : '—'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="text-muted text-sm">Probability</span>
                <span style={{ fontWeight: 500 }}>{deal.probability ?? 0}%</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="text-muted text-sm">Close Date</span>
                <span style={{ color: isOverdue ? '#ef4444' : undefined, fontWeight: 500 }}>
                  {deal.close_date
                    ? new Date(deal.close_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : '—'}
                  {isOverdue && <span style={{ marginLeft: 4, fontSize: 10, color: '#ef4444' }}>overdue</span>}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="text-muted text-sm">Owner</span>
                <span style={{ fontWeight: 500 }}>{deal.owner_name ?? '—'}</span>
              </div>

              {deal.product_line && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="text-muted text-sm">Product</span>
                  <span style={{ fontWeight: 500 }}>{deal.product_line}</span>
                </div>
              )}

              {deal.won_at && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="text-muted text-sm">Won</span>
                  <span style={{ color: '#16a34a', fontWeight: 600 }}>
                    {new Date(deal.won_at).toLocaleDateString()}
                  </span>
                </div>
              )}

              {deal.lost_at && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="text-muted text-sm">Lost</span>
                  <span style={{ color: '#dc2626', fontWeight: 600 }}>
                    {new Date(deal.lost_at).toLocaleDateString()}
                  </span>
                </div>
              )}

              {deal.lost_reason && (
                <div>
                  <div className="text-muted text-sm" style={{ marginBottom: 4 }}>Lost Reason</div>
                  <div style={{ fontSize: 13, color: '#374151' }}>{deal.lost_reason}</div>
                </div>
              )}

              {deal.description && (
                <div>
                  <div className="text-muted text-sm" style={{ marginBottom: 4 }}>Description</div>
                  <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{deal.description}</div>
                </div>
              )}
            </div>
          </div>

          {/* Stage selector */}
          <div className="card">
            <div className="card-title">Move Stage</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {stages.map(s => (
                <button
                  key={s.id}
                  onClick={() => handleStageChange(s.id)}
                  style={{
                    padding: '7px 12px', borderRadius: 6, border: '1px solid',
                    cursor: 'pointer', textAlign: 'left', fontSize: 13, fontWeight: 500,
                    background: deal.current_stage_id === s.id ? s.color_hex : '#f9fafb',
                    borderColor: deal.current_stage_id === s.id ? s.color_hex : '#e5e7eb',
                    color: deal.current_stage_id === s.id ? (s.text_color_hex ?? '#2b2b2b') : '#374151',
                  }}
                >
                  {s.name}
                  {deal.current_stage_id === s.id && <span style={{ marginLeft: 8, opacity: 0.7 }}>✓</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Stage history */}
          {stageHistory.length > 0 && (
            <div className="card">
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
            dealId={id}
            currentUser={currentUser}
            users={users}
          />

          {/* Attachments */}
          <div className="card mt-3">
            <FileAttachments entityType="deal" entityId={id} />
          </div>
        </div>

        {/* Right column — activities */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div className="card-title" style={{ margin: 0 }}>
              Activities ({activities.length})
            </div>
            <Link to="/log/new" className="btn btn-primary btn-sm">+ Log Activity</Link>
          </div>

          {activities.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">≡</div>
              <div className="empty-label">No activities logged for this deal yet</div>
            </div>
          ) : (
            <div className="timeline">
              {activities.map(e => (
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
                    {e.purpose && <div className="timeline-meta">{e.purpose}</div>}
                    {e.outcome && <div className="timeline-meta mt-1">Outcome: {e.outcome}</div>}
                    {e.next_step && (
                      <div className="timeline-meta mt-1" style={{ color: '#4f46e5' }}>
                        Next: {e.next_step}
                        {e.next_step_date ? ` by ${e.next_step_date}` : ''}
                      </div>
                    )}
                    {e.owner_name && (
                      <div className="text-muted text-xs" style={{ marginTop: 4 }}>by {e.owner_name}</div>
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
