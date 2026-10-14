import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useSSE } from '../hooks/useSSE'
import StageTag from '../components/StageTag'

const REFRESH_EVENTS = new Set(['deal_created', 'deal_updated', 'deal_deleted'])

const FORECAST_LABELS = {
  commit:     { label: 'Commit',     color: '#16a34a', bg: '#dcfce7' },
  best_case:  { label: 'Best Case',  color: '#0369a1', bg: '#e0f2fe' },
  pipeline:   { label: 'Pipeline',   color: '#6366f1', bg: '#ede9fe' },
  omitted:    { label: 'Omitted',    color: '#6b7280', bg: '#f3f4f6' },
}

function ForecastBadge({ value }) {
  const f = FORECAST_LABELS[value] ?? FORECAST_LABELS.pipeline
  return (
    <span style={{
      background: f.bg, color: f.color,
      padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600,
    }}>{f.label}</span>
  )
}

function fmt(amount, currency = 'USD') {
  if (amount == null || amount === '') return '—'
  const n = Number(amount)
  if (isNaN(n)) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
}

function NewDealModal({ accounts, stages, users, onSave, onClose }) {
  const [form, setForm] = useState({
    name: '', account_id: '', owner_id: '', current_stage_id: '',
    amount: '', currency: 'USD', close_date: '',
    probability: '20', forecast_category: 'pipeline',
    product_line: '', description: '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.account_id) {
      setError('Deal name and account are required.')
      return
    }
    setSaving(true); setError('')
    try {
      await onSave({
        ...form,
        amount:      form.amount      ? Number(form.amount) : null,
        probability: form.probability ? Number(form.probability) : 0,
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
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>New Deal</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>×</button>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="form-label">Deal Name *</label>
            <input className="form-input" required value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Acme Corp – Enterprise License Q1 2027" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="form-label">Account *</label>
              <select className="form-input" required value={form.account_id}
                onChange={e => set('account_id', e.target.value)}>
                <option value="">— select account —</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Owner</label>
              <select className="form-input" value={form.owner_id}
                onChange={e => set('owner_id', e.target.value)}>
                <option value="">— unassigned —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.display_name}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="form-label">Stage</label>
              <select className="form-input" value={form.current_stage_id}
                onChange={e => set('current_stage_id', e.target.value)}>
                <option value="">— no stage —</option>
                {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
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
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 12 }}>
            <div>
              <label className="form-label">Deal Amount</label>
              <input className="form-input" type="number" min="0" step="any"
                value={form.amount} onChange={e => set('amount', e.target.value)}
                placeholder="e.g. 50000" />
            </div>
            <div>
              <label className="form-label">Expected Close Date</label>
              <input className="form-input" type="date"
                value={form.close_date} onChange={e => set('close_date', e.target.value)} />
            </div>
            <div>
              <label className="form-label">Prob %</label>
              <input className="form-input" type="number" min="0" max="100"
                value={form.probability} onChange={e => set('probability', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="form-label">Product / Service Line</label>
            <input className="form-input" value={form.product_line}
              onChange={e => set('product_line', e.target.value)}
              placeholder="e.g. Enterprise License, Professional Services" />
          </div>

          <div>
            <label className="form-label">Description</label>
            <textarea className="form-input" rows={2} value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Deal context, notes…"
              style={{ resize: 'vertical' }} />
          </div>

          {error && <div style={{ color: '#ef4444', fontSize: 13 }}>{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Creating…' : 'Create Deal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Deals() {
  const [deals,   setDeals]   = useState([])
  const [stats,   setStats]   = useState(null)
  const [stages,  setStages]  = useState([])
  const [accounts,setAccounts]= useState([])
  const [users,   setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  const [filters, setFilters] = useState({
    q: '', stage_id: '', owner_id: '', forecast_category: '',
    close_date_from: '', close_date_to: '',
  })

  useEffect(() => {
    Promise.all([
      api.get('/stages'),
      api.get('/accounts?limit=500'),
      api.get('/users'),
    ]).then(([s, a, u]) => {
      setStages(s.stages)
      setAccounts(a.accounts)
      setUsers(u.users)
    }).catch(() => {})
  }, [])

  const load = useCallback(() => {
    const params = new URLSearchParams({ limit: '500' })
    if (filters.q)                params.set('q',                filters.q)
    if (filters.stage_id)         params.set('stage_id',         filters.stage_id)
    if (filters.owner_id)         params.set('owner_id',         filters.owner_id)
    if (filters.forecast_category)params.set('forecast_category',filters.forecast_category)
    if (filters.close_date_from)  params.set('close_date_from',  filters.close_date_from)
    if (filters.close_date_to)    params.set('close_date_to',    filters.close_date_to)
    api.get(`/deals?${params}`)
      .then(d => { setDeals(d.deals); setStats(d.stats); setLoading(false) })
      .catch(() => setLoading(false))
  }, [filters])

  useEffect(() => { load() }, [load])
  useSSE(event => { if (REFRESH_EVENTS.has(event.type)) load() })

  function setFilter(k, v) { setFilters(f => ({ ...f, [k]: v })) }
  function clearFilters() {
    setFilters({ q: '', stage_id: '', owner_id: '', forecast_category: '', close_date_from: '', close_date_to: '' })
  }
  const hasFilters = Object.values(filters).some(Boolean)

  async function handleCreateDeal(data) {
    await api.post('/deals', data)
    load()
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="page">
      {showNew && (
        <NewDealModal
          accounts={accounts}
          stages={stages}
          users={users}
          onSave={handleCreateDeal}
          onClose={() => setShowNew(false)}
        />
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">Deals</h1>
          <p className="page-subtitle">{deals.length} deal{deals.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ New Deal</button>
      </div>

      {/* Summary stats */}
      {stats && (
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-value">{stats.active_count ?? 0}</div>
            <div className="stat-label">Active deals</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ fontSize: 20 }}>
              {fmt(stats.total_pipeline)}
            </div>
            <div className="stat-label">Total pipeline</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ fontSize: 20, color: '#16a34a' }}>
              {fmt(stats.weighted_pipeline)}
            </div>
            <div className="stat-label">Weighted pipeline</div>
          </div>
          {/* Breakdown by forecast category */}
          {['commit','best_case','pipeline'].map(cat => {
            const count = deals.filter(d => d.forecast_category === cat && !d.lost_at && !d.won_at).length
            const f = FORECAST_LABELS[cat]
            return (
              <div key={cat} className="stat-card">
                <div className="stat-value" style={{ color: f.color }}>{count}</div>
                <div className="stat-label">{f.label}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Filters */}
      <div className="filter-bar">
        <input
          className="search-input"
          placeholder="Search deals…"
          value={filters.q}
          onChange={e => setFilter('q', e.target.value)}
        />
        <select className="filter-select" value={filters.stage_id}
          onChange={e => setFilter('stage_id', e.target.value)}>
          <option value="">All stages</option>
          {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="filter-select" value={filters.owner_id}
          onChange={e => setFilter('owner_id', e.target.value)}>
          <option value="">All owners</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.display_name}</option>)}
        </select>
        <select className="filter-select" value={filters.forecast_category}
          onChange={e => setFilter('forecast_category', e.target.value)}>
          <option value="">All forecasts</option>
          <option value="commit">Commit</option>
          <option value="best_case">Best Case</option>
          <option value="pipeline">Pipeline</option>
          <option value="omitted">Omitted</option>
        </select>
        <input type="date" className="filter-select" title="Close date from"
          value={filters.close_date_from} max={filters.close_date_to || today}
          onChange={e => setFilter('close_date_from', e.target.value)} />
        <input type="date" className="filter-select" title="Close date to"
          value={filters.close_date_to} min={filters.close_date_from}
          onChange={e => setFilter('close_date_to', e.target.value)} />
        {hasFilters && (
          <button className="btn btn-secondary btn-sm" onClick={clearFilters}>Clear</button>
        )}
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <div className="loading">Loading deals…</div>
        ) : deals.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">◎</div>
            <div className="empty-label">
              {hasFilters ? 'No deals match your filters' : 'No deals yet — create your first deal'}
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Deal</th>
                  <th>Account</th>
                  <th>Stage</th>
                  <th>Amount</th>
                  <th>Close Date</th>
                  <th>Prob</th>
                  <th>Forecast</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                {deals.map(d => {
                  const isOverdue = d.close_date && d.close_date < today && !d.won_at && !d.lost_at
                  return (
                    <tr key={d.id}>
                      <td>
                        <Link to={`/deals/${d.id}`} style={{ fontWeight: 500 }}>{d.name}</Link>
                        {d.product_line && (
                          <div className="text-muted text-xs" style={{ marginTop: 2 }}>{d.product_line}</div>
                        )}
                      </td>
                      <td>
                        <Link to={`/accounts/${d.account_id}`} className="text-muted text-sm">
                          {d.account_name}
                        </Link>
                      </td>
                      <td>
                        <StageTag name={d.stage_name} colorHex={d.color_hex} textColorHex={d.text_color_hex} />
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                        {fmt(d.amount, d.currency)}
                      </td>
                      <td style={{ color: isOverdue ? '#ef4444' : undefined }} className="text-sm">
                        {d.close_date ?? '—'}
                        {isOverdue && <span style={{ marginLeft: 4, fontSize: 10 }}>overdue</span>}
                      </td>
                      <td className="text-sm text-muted">
                        {d.probability != null ? `${d.probability}%` : '—'}
                      </td>
                      <td>
                        <ForecastBadge value={d.forecast_category} />
                      </td>
                      <td className="text-sm text-muted">{d.owner_name ?? '—'}</td>
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
