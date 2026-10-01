import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useSSE } from '../hooks/useSSE'
import { useUser } from '../App'
import StageTag from '../components/StageTag'

const REFRESH_EVENTS = new Set(['new_entry', 'entry_updated', 'entry_deleted'])

const ACTIVITY_TYPES = ['Meeting','Call','Email','Demo','Presentation','Follow-up','Proposal','Contract','Podcast','Conference']
const CHANNELS       = ['Online','In-person','Phone','Email','Conference','Podcast']

// ── Edit modal ─────────────────────────────────────────────────────────────────
function EditModal({ entry, stages, onSave, onDelete, onClose }) {
  const [form, setForm] = useState({
    meeting_date:   entry.meeting_date   ?? '',
    activity_type:  entry.activity_type  ?? '',
    channel:        entry.channel        ?? '',
    purpose:        entry.purpose        ?? '',
    outcome:        entry.outcome        ?? '',
    next_step:      entry.next_step      ?? '',
    next_step_date: entry.next_step_date ?? '',
    deal_amount:    entry.deal_amount    ?? '',
  })
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirm,  setConfirm]  = useState(false)
  const [error,    setError]    = useState(null)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSave() {
    setSaving(true); setError(null)
    try {
      await onSave(entry.id, form)
      onClose()
    } catch (e) { setError(e.message); setSaving(false) }
  }

  async function handleDelete() {
    setDeleting(true); setError(null)
    try {
      await onDelete(entry.id)
      onClose()
    } catch (e) { setError(e.message); setDeleting(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Edit Entry</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label className="form-label">Date</label>
              <input type="date" className="form-input" value={form.meeting_date} onChange={e => set('meeting_date', e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label">Activity Type</label>
              <select className="form-input" value={form.activity_type} onChange={e => set('activity_type', e.target.value)}>
                <option value="">—</option>
                {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="form-label">Channel</label>
            <select className="form-input" value={form.channel} onChange={e => set('channel', e.target.value)}>
              <option value="">—</option>
              {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Purpose / Topic</label>
            <input className="form-input" value={form.purpose} onChange={e => set('purpose', e.target.value)} placeholder="What was discussed?" />
          </div>
          <div>
            <label className="form-label">Outcome</label>
            <input className="form-input" value={form.outcome} onChange={e => set('outcome', e.target.value)} placeholder="How did it go?" />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 2 }}>
              <label className="form-label">Next Step</label>
              <input className="form-input" value={form.next_step} onChange={e => set('next_step', e.target.value)} placeholder="What's the follow-up?" />
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label">Due</label>
              <input type="date" className="form-input" value={form.next_step_date} onChange={e => set('next_step_date', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="form-label">Deal Amount</label>
            <input className="form-input" value={form.deal_amount} onChange={e => set('deal_amount', e.target.value)} placeholder="e.g. $50,000" />
          </div>
        </div>

        {error && <div className="inline-error" style={{ marginTop: 12 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
          {!confirm ? (
            <button className="btn btn-sm" style={{ color: '#dc2626', borderColor: '#fca5a5' }} onClick={() => setConfirm(true)}>
              Delete
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#dc2626' }}>Delete this entry?</span>
              <button className="btn btn-sm" style={{ background: '#dc2626', color: '#fff', borderColor: '#dc2626' }} onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button className="btn btn-sm" onClick={() => setConfirm(false)}>Cancel</button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const today = () => new Date().toISOString().split('T')[0]

export default function EntryLog() {
  const [entries,      setEntries]      = useState([])
  const [stages,       setStages]       = useState([])
  const [accounts,     setAccounts]     = useState([])
  const [filters,      setFilters]      = useState({ account_id: '', stage_id: '', date_from: '', date_to: '' })
  const [loading,      setLoading]      = useState(true)
  const [editingEntry, setEditingEntry] = useState(null)
  const { currentUser } = useUser()

  useEffect(() => {
    Promise.all([api.get('/stages'), api.get('/accounts?limit=500')])
      .then(([s, a]) => { setStages(s.stages); setAccounts(a.accounts) })
      .catch(() => {})
  }, [])

  const load = useCallback(() => {
    const params = new URLSearchParams({ limit: '300' })
    if (filters.account_id) params.set('account_id', filters.account_id)
    if (filters.stage_id)   params.set('stage_id',   filters.stage_id)
    if (filters.date_from)  params.set('date_from',  filters.date_from)
    if (filters.date_to)    params.set('date_to',    filters.date_to)
    api.get(`/entries?${params}`)
      .then(d => { setEntries(d.entries); setLoading(false) })
      .catch(() => setLoading(false))
  }, [filters])

  useEffect(() => { load() }, [load])
  useSSE(event => { if (REFRESH_EVENTS.has(event.type)) load() })

  function setFilter(key, val) { setFilters(f => ({ ...f, [key]: val })) }
  function clearFilters() { setFilters({ account_id: '', stage_id: '', date_from: '', date_to: '' }) }
  const hasFilters = Object.values(filters).some(Boolean)

  function exportCSV() {
    const headers = ['Date','Account','Type','Channel','Stage','Purpose','Outcome','Next Step','Due','Deal Amount','Owner']
    const rows = entries.map(e => [
      e.meeting_date ?? '', e.account_name ?? '', e.activity_type ?? '',
      e.channel ?? '', e.stage_name ?? '', e.purpose ?? '', e.outcome ?? '',
      e.next_step ?? '', e.next_step_date ?? '', e.deal_amount ?? '', e.owner_name ?? '',
    ])
    const csv = [headers, ...rows]
      .map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `gtm-activities-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleSaveEntry(id, form) {
    await api.patch(`/entries/${id}`, { ...form, edited_by_id: currentUser?.id ?? null })
    load()
  }

  async function handleDeleteEntry(id) {
    await api.del(`/entries/${id}`)
    load()
  }

  return (
    <div className="page">
      {editingEntry && (
        <EditModal
          entry={editingEntry}
          stages={stages}
          onSave={handleSaveEntry}
          onDelete={handleDeleteEntry}
          onClose={() => setEditingEntry(null)}
        />
      )}
      <div className="page-header">
        <div>
          <h1 className="page-title">Activity Log</h1>
          <p className="page-subtitle">{entries.length} entr{entries.length !== 1 ? 'ies' : 'y'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {entries.length > 0 && (
            <button className="btn btn-secondary" onClick={exportCSV}>↓ Export CSV</button>
          )}
          <Link to="/log/new" className="btn btn-primary">+ Log Activity</Link>
        </div>
      </div>

      <div className="filter-bar">
        <select className="filter-select" value={filters.account_id} onChange={e => setFilter('account_id', e.target.value)}>
          <option value="">All accounts</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className="filter-select" value={filters.stage_id} onChange={e => setFilter('stage_id', e.target.value)}>
          <option value="">All stages</option>
          {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input
          type="date"
          className="filter-select"
          title="From date"
          value={filters.date_from}
          max={filters.date_to || today()}
          onChange={e => setFilter('date_from', e.target.value)}
        />
        <input
          type="date"
          className="filter-select"
          title="To date"
          value={filters.date_to}
          min={filters.date_from}
          max={today()}
          onChange={e => setFilter('date_to', e.target.value)}
        />
        {hasFilters && (
          <button className="btn btn-secondary btn-sm" onClick={clearFilters}>Clear</button>
        )}
      </div>

      <div className="card">
        {loading ? (
          <div className="loading">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">≡</div>
            <div className="empty-label">
              {hasFilters ? 'No entries match your filters' : 'No activities logged yet'}
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Account</th>
                  <th>Type</th>
                  <th>Channel</th>
                  <th>Stage</th>
                  <th>Purpose</th>
                  <th>Owner</th>
                  <th>Next Step</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => {
                  const isOverdue =
                    e.next_step_date && e.next_step_date < today()
                  return (
                    <tr key={e.id}>
                      <td className="text-sm">{e.meeting_date ?? '—'}</td>
                      <td>
                        {e.account_id ? (
                          <Link to={`/accounts/${e.account_id}`} style={{ fontWeight: 500 }}>
                            {e.account_name ?? '—'}
                          </Link>
                        ) : (
                          <span className="text-muted">{e.account_name ?? '—'}</span>
                        )}
                      </td>
                      <td className="text-sm">{e.activity_type ?? '—'}</td>
                      <td className="text-sm text-muted">{e.channel ?? '—'}</td>
                      <td>
                        <StageTag name={e.stage_name} colorHex={e.color_hex} />
                      </td>
                      <td
                        className="text-sm"
                        style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={e.purpose ?? ''}
                      >
                        {e.purpose ?? '—'}
                      </td>
                      <td className="text-sm text-muted">{e.owner_name ?? '—'}</td>
                      <td
                        className="text-sm"
                        style={{ color: isOverdue ? '#ef4444' : undefined, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={e.next_step ?? ''}
                      >
                        {e.next_step
                          ? `${e.next_step}${e.next_step_date ? ` (${e.next_step_date})` : ''}`
                          : '—'}
                      </td>
                      <td>
                        <button
                          className="btn btn-sm"
                          style={{ padding: '2px 10px', fontSize: 12 }}
                          onClick={() => setEditingEntry(e)}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
