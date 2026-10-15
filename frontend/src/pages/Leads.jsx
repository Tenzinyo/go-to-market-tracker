import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useSSE } from '../hooks/useSSE'
import { useUser } from '../App'

// ── Constants ─────────────────────────────────────────────────────────────────

const LIFECYCLE_STAGES = ['lead', 'mql', 'sql', 'opportunity', 'customer', 'churned']

const LIFECYCLE_META = {
  lead:        { label: 'Lead',        color: '#94a3b8', bg: '#f1f5f9' },
  mql:         { label: 'MQL',         color: '#3b82f6', bg: '#eff6ff' },
  sql:         { label: 'SQL',         color: '#6366f1', bg: '#eef2ff' },
  opportunity: { label: 'Opportunity', color: '#8b5cf6', bg: '#f5f3ff' },
  customer:    { label: 'Customer',    color: '#16a34a', bg: '#f0fdf4' },
  churned:     { label: 'Churned',     color: '#dc2626', bg: '#fef2f2' },
}

const LEAD_SOURCES = ['inbound', 'outbound', 'referral', 'event', 'partner', 'other']
const SOURCE_LABELS = { inbound: 'Inbound', outbound: 'Outbound', referral: 'Referral', event: 'Event', partner: 'Partner', other: 'Other' }

function LifecycleBadge({ stage, size = 'sm' }) {
  if (!stage) return null
  const m = LIFECYCLE_META[stage] ?? { label: stage, color: '#6b7280', bg: '#f3f4f6' }
  return (
    <span style={{
      display: 'inline-block',
      padding: size === 'sm' ? '2px 8px' : '4px 12px',
      borderRadius: 99,
      fontSize: size === 'sm' ? 11 : 13,
      fontWeight: 600,
      background: m.bg,
      color: m.color,
      border: `1px solid ${m.color}33`,
    }}>
      {m.label}
    </span>
  )
}

// ── Funnel Visualization ──────────────────────────────────────────────────────

function Funnel({ funnel }) {
  const max = Math.max(...funnel.map(f => f.count), 1)

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, overflowX: 'auto' }}>
      {funnel.map((f, i) => (
        <div key={f.stage} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 100 }}>
          {/* Stage block */}
          <div style={{ flex: 1, textAlign: 'center', padding: '14px 8px' }}>
            <div style={{
              height: 8, borderRadius: 4, marginBottom: 10,
              background: f.color,
              opacity: 0.25 + 0.75 * (f.count / max),
              width: '100%',
            }} />
            <div style={{ fontSize: 22, fontWeight: 700, color: f.color, lineHeight: 1 }}>{f.count}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginTop: 3 }}>
              {LIFECYCLE_META[f.stage]?.label ?? f.stage}
            </div>
            {f.conversion_rate != null && (
              <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                {f.conversion_rate}% from prev
              </div>
            )}
          </div>
          {/* Arrow between stages */}
          {i < funnel.length - 1 && (
            <div style={{ color: '#d1d5db', fontSize: 18, flexShrink: 0, padding: '0 2px' }}>›</div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── New Lead Modal ────────────────────────────────────────────────────────────

function NewLeadModal({ users, onClose, onCreated }) {
  const { currentUser } = useUser()
  const [query,          setQuery]         = useState('')
  const [suggestions,    setSuggestions]   = useState([])
  const [selectedAccount, setSelectedAccount] = useState(null) // { id, name }
  const [showDropdown,   setShowDropdown]  = useState(false)
  const [form, setForm] = useState({
    lifecycle_stage: 'lead',
    lead_source: '',
    lead_score: 0,
    owner_id: currentUser?.id ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  // Debounced account search
  useEffect(() => {
    if (selectedAccount) return  // already picked
    if (query.trim().length < 1) { setSuggestions([]); setShowDropdown(false); return }
    const t = setTimeout(() => {
      api.get(`/accounts?q=${encodeURIComponent(query.trim())}&limit=8`)
        .then(d => { setSuggestions(d.accounts ?? []); setShowDropdown(true) })
        .catch(() => {})
    }, 200)
    return () => clearTimeout(t)
  }, [query, selectedAccount])

  function pickAccount(acct) {
    setSelectedAccount(acct)
    setQuery(acct.name)
    setShowDropdown(false)
    setSuggestions([])
    setError('')
  }

  function clearAccount() {
    setSelectedAccount(null)
    setQuery('')
    setSuggestions([])
  }

  async function submit(e) {
    e.preventDefault()
    if (!selectedAccount) {
      setError('Select an existing account from the activity log. Log an activity first if this company isn\'t listed.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await api.patch(`/accounts/${selectedAccount.id}`, {
        lifecycle_stage: form.lifecycle_stage,
        lead_source:     form.lead_source || null,
        lead_score:      Number(form.lead_score),
        owner_id:        form.owner_id ? Number(form.owner_id) : null,
      })
      onCreated()
      onClose()
    } catch (err) {
      setError(err.message ?? 'Failed to create lead')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: 28, width: 460,
        maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>New Lead</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>×</button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Account search — must be an existing account */}
          <div style={{ position: 'relative' }}>
            <label className="form-label">
              Company *
              <span style={{ fontSize: 10, fontWeight: 400, color: '#9ca3af', marginLeft: 6 }}>
                must exist in the activity log
              </span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                className="form-input"
                value={query}
                onChange={e => { setQuery(e.target.value); setSelectedAccount(null) }}
                onFocus={() => { if (suggestions.length) setShowDropdown(true) }}
                placeholder="Search existing accounts…"
                autoFocus
                autoComplete="off"
                style={{ paddingRight: selectedAccount ? 28 : undefined }}
              />
              {selectedAccount && (
                <button
                  type="button"
                  onClick={clearAccount}
                  style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 16, lineHeight: 1,
                  }}
                >×</button>
              )}
            </div>

            {/* Selected badge */}
            {selectedAccount && (
              <div style={{ marginTop: 4, fontSize: 12, color: '#16a34a', fontWeight: 500 }}>
                ✓ {selectedAccount.name}
              </div>
            )}

            {/* Dropdown suggestions */}
            {showDropdown && suggestions.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 2, overflow: 'hidden',
              }}>
                {suggestions.map(a => (
                  <div
                    key={a.id}
                    onMouseDown={() => pickAccount(a)}
                    style={{
                      padding: '9px 14px', cursor: 'pointer', fontSize: 13,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f5f3ff'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ fontWeight: 500, color: '#111827' }}>{a.name}</span>
                    {a.stage_name && (
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>{a.stage_name}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* No results hint */}
            {showDropdown && suggestions.length === 0 && query.trim().length >= 1 && !selectedAccount && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 2,
                padding: '12px 14px', fontSize: 12, color: '#6b7280',
              }}>
                No accounts found. <strong>Log an activity first</strong> to add this company.
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="form-label">Lifecycle Stage</label>
              <select className="form-input" value={form.lifecycle_stage} onChange={e => set('lifecycle_stage', e.target.value)}>
                {LIFECYCLE_STAGES.map(s => (
                  <option key={s} value={s}>{LIFECYCLE_META[s].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Lead Source</label>
              <select className="form-input" value={form.lead_source} onChange={e => set('lead_source', e.target.value)}>
                <option value="">— none —</option>
                {LEAD_SOURCES.map(s => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="form-label">Lead Score (0–100)</label>
              <input className="form-input" type="number" min={0} max={100} value={form.lead_score} onChange={e => set('lead_score', e.target.value)} />
            </div>
            <div>
              <label className="form-label">Owner</label>
              <select className="form-input" value={form.owner_id} onChange={e => set('owner_id', e.target.value)}>
                <option value="">— unassigned —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.display_name}</option>)}
              </select>
            </div>
          </div>

          {error && <div style={{ color: '#dc2626', fontSize: 13 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" className="btn" style={{ background: 'white', border: '1px solid #e5e7eb' }} onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !selectedAccount}>
              {saving ? 'Creating…' : 'Create Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Lifecycle Stage Inline Editor ─────────────────────────────────────────────

function StageCell({ lead, onUpdated }) {
  const [open, setOpen]   = useState(false)
  const [saving, setSaving] = useState(false)

  async function advance() {
    const idx = LIFECYCLE_STAGES.indexOf(lead.lifecycle_stage)
    if (idx < 0 || idx >= LIFECYCLE_STAGES.length - 1) return
    const next = LIFECYCLE_STAGES[idx + 1]
    setSaving(true)
    try {
      await api.patch(`/leads/${lead.id}`, { lifecycle_stage: next })
      onUpdated()
    } finally {
      setSaving(false)
    }
  }

  async function setStage(stage) {
    setOpen(false)
    if (stage === lead.lifecycle_stage) return
    setSaving(true)
    try {
      await api.patch(`/leads/${lead.id}`, { lifecycle_stage: stage })
      onUpdated()
    } finally {
      setSaving(false)
    }
  }

  const isLast = LIFECYCLE_STAGES.indexOf(lead.lifecycle_stage) >= LIFECYCLE_STAGES.length - 1

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <LifecycleBadge stage={lead.lifecycle_stage} />
      </div>
      {!isLast && (
        <button
          onClick={advance}
          disabled={saving}
          title="Advance to next stage"
          style={{
            background: 'none', border: '1px solid #e5e7eb', borderRadius: 4,
            padding: '1px 6px', fontSize: 11, cursor: 'pointer', color: '#6b7280',
          }}
        >›</button>
      )}
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: '100%', left: 0, zIndex: 100,
            background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 4, minWidth: 160,
          }}>
            {LIFECYCLE_STAGES.map(s => (
              <div
                key={s}
                onClick={() => setStage(s)}
                style={{
                  padding: '7px 12px', cursor: 'pointer', borderRadius: 6,
                  fontSize: 13, fontWeight: s === lead.lifecycle_stage ? 600 : 400,
                  background: s === lead.lifecycle_stage ? '#f5f3ff' : 'transparent',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: LIFECYCLE_META[s]?.color ?? '#6b7280', flexShrink: 0,
                }} />
                {LIFECYCLE_META[s]?.label ?? s}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Score Editor ──────────────────────────────────────────────────────────────

function ScoreCell({ lead, onUpdated }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(lead.lead_score ?? 0)
  const [saving, setSaving]   = useState(false)

  async function save() {
    setEditing(false)
    const score = Math.max(0, Math.min(100, Number(val)))
    if (score === (lead.lead_score ?? 0)) return
    setSaving(true)
    try {
      await api.patch(`/leads/${lead.id}`, { lead_score: score })
      onUpdated()
    } finally {
      setSaving(false)
    }
  }

  const score = lead.lead_score ?? 0
  const pct   = score / 100
  const color = pct >= 0.7 ? '#16a34a' : pct >= 0.4 ? '#d97706' : '#9ca3af'

  if (editing) {
    return (
      <input
        type="number" min={0} max={100}
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
        autoFocus
        style={{ width: 56, fontSize: 12, border: '1px solid #6366f1', borderRadius: 4, padding: '2px 6px', outline: 'none' }}
      />
    )
  }

  return (
    <div
      onClick={() => setEditing(true)}
      title="Click to edit score"
      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
    >
      <div style={{
        width: 32, height: 4, borderRadius: 2, background: '#e5e7eb', overflow: 'hidden',
      }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: saving ? '#9ca3af' : color }}>{score}</span>
    </div>
  )
}

// ── Lead Row (with inline delete) ─────────────────────────────────────────────

function LeadRow({ lead, isLast, onUpdated }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting,   setDeleting]   = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      await api.del(`/leads/${lead.id}`)
      onUpdated()
    } finally {
      setDeleting(false)
      setConfirming(false)
    }
  }

  return (
    <tr style={{ borderBottom: isLast ? 'none' : '1px solid #f9fafb', background: 'white' }}>
      <td style={{ padding: '11px 16px' }}>
        <Link
          to={`/accounts/${lead.id}`}
          style={{ fontWeight: 600, color: '#111827', fontSize: 13, textDecoration: 'none' }}
        >
          {lead.name}
        </Link>
        {lead.stage_name && (
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{lead.stage_name}</div>
        )}
      </td>
      <td style={{ padding: '11px 16px' }}>
        <StageCell lead={lead} onUpdated={onUpdated} />
      </td>
      <td style={{ padding: '11px 16px', fontSize: 12, color: '#6b7280' }}>
        {lead.lead_source ? SOURCE_LABELS[lead.lead_source] ?? lead.lead_source : '—'}
      </td>
      <td style={{ padding: '11px 16px' }}>
        <ScoreCell lead={lead} onUpdated={onUpdated} />
      </td>
      <td style={{ padding: '11px 16px', fontSize: 12, color: '#374151' }}>
        {lead.owner_name ?? <span style={{ color: '#9ca3af' }}>—</span>}
      </td>
      <td style={{ padding: '11px 16px', fontSize: 12, color: '#6b7280' }}>
        {lead.last_activity_date ?? <span style={{ color: '#d1d5db' }}>none</span>}
      </td>
      <td style={{ padding: '11px 16px', fontSize: 12, color: '#6b7280' }}>
        {lead.activity_count}
      </td>
      <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
        {!confirming ? (
          <button
            className="btn btn-sm"
            style={{ fontSize: 11, padding: '2px 8px', color: '#dc2626', borderColor: '#fca5a5' }}
            onClick={() => setConfirming(true)}
          >
            Remove
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#dc2626' }}>Remove lead?</span>
            <button
              className="btn btn-sm"
              style={{ fontSize: 11, padding: '2px 8px', background: '#dc2626', color: '#fff', borderColor: '#dc2626' }}
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? '…' : 'Yes'}
            </button>
            <button
              className="btn btn-sm"
              style={{ fontSize: 11, padding: '2px 8px' }}
              onClick={() => setConfirming(false)}
            >
              No
            </button>
          </div>
        )}
      </td>
    </tr>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Leads() {
  const [leads,      setLeads]      = useState([])
  const [funnel,     setFunnel]     = useState([])
  const [sources,    setSources]    = useState([])
  const [users,      setUsers]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [showNew,    setShowNew]    = useState(false)

  // Filters
  const [search,     setSearch]     = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [ownerFilter,  setOwnerFilter]  = useState('')

  const loadFunnel = useCallback(() => {
    api.get('/leads/funnel')
      .then(d => { setFunnel(d.funnel); setSources(d.sources) })
      .catch(() => {})
  }, [])

  const loadLeads = useCallback(() => {
    const params = new URLSearchParams()
    if (stageFilter)  params.set('lifecycle_stage', stageFilter)
    if (sourceFilter) params.set('lead_source', sourceFilter)
    if (ownerFilter)  params.set('owner_id', ownerFilter)
    if (search)       params.set('q', search)
    const qs = params.toString()
    api.get(`/leads${qs ? `?${qs}` : ''}`)
      .then(d => { setLeads(d.leads); setLoading(false) })
      .catch(() => setLoading(false))
  }, [stageFilter, sourceFilter, ownerFilter, search])

  useEffect(() => { api.get('/users').then(d => setUsers(d.users)).catch(() => {}) }, [])
  useEffect(() => { loadFunnel() }, [loadFunnel])
  useEffect(() => { setLoading(true); loadLeads() }, [loadLeads])

  useSSE(event => {
    if (['account_created', 'account_updated', 'account_deleted'].includes(event.type)) {
      loadLeads()
      loadFunnel()
    }
  })

  function refresh() { loadLeads(); loadFunnel() }

  const totalLeads = funnel.reduce((s, f) => s + f.count, 0)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Lead Pipeline</h1>
          <p className="page-subtitle">{totalLeads} tracked leads across all lifecycle stages</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ New Lead</button>
      </div>

      {showNew && (
        <NewLeadModal
          users={users}
          onClose={() => setShowNew(false)}
          onCreated={refresh}
        />
      )}

      {/* Funnel */}
      <div className="card mb-4">
        <div className="card-title">Lifecycle Funnel</div>
        {funnel.length === 0 ? (
          <div className="text-muted text-sm">No leads tracked yet. Create a lead to get started.</div>
        ) : (
          <Funnel funnel={funnel} />
        )}
      </div>

      {/* Lead Source breakdown */}
      {sources.length > 0 && (
        <div className="card mb-4">
          <div className="card-title">Lead Sources</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {sources.map(s => (
              <div
                key={s.lead_source}
                onClick={() => setSourceFilter(sf => sf === s.lead_source ? '' : s.lead_source)}
                style={{
                  padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
                  background: sourceFilter === s.lead_source ? '#6366f1' : '#f3f4f6',
                  color:      sourceFilter === s.lead_source ? '#fff' : '#374151',
                  fontSize: 13, fontWeight: 500,
                  border: '1px solid transparent',
                }}
              >
                {SOURCE_LABELS[s.lead_source] ?? s.lead_source} · <strong>{s.count}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <input
          className="form-input"
          style={{ width: 200 }}
          placeholder="Search accounts…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {/* Stage pills */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button
            onClick={() => setStageFilter('')}
            style={{
              padding: '4px 12px', borderRadius: 99, fontSize: 12, cursor: 'pointer',
              border: '1px solid #e5e7eb',
              background: !stageFilter ? '#6366f1' : 'white',
              color:      !stageFilter ? '#fff' : '#374151',
              fontWeight: 500,
            }}
          >All</button>
          {LIFECYCLE_STAGES.map(s => (
            <button
              key={s}
              onClick={() => setStageFilter(sf => sf === s ? '' : s)}
              style={{
                padding: '4px 12px', borderRadius: 99, fontSize: 12, cursor: 'pointer',
                border: `1px solid ${LIFECYCLE_META[s].color}44`,
                background: stageFilter === s ? LIFECYCLE_META[s].color : LIFECYCLE_META[s].bg,
                color:      stageFilter === s ? '#fff' : LIFECYCLE_META[s].color,
                fontWeight: 500,
              }}
            >{LIFECYCLE_META[s].label}</button>
          ))}
        </div>

        <select
          className="filter-select"
          value={sourceFilter}
          onChange={e => setSourceFilter(e.target.value)}
          style={{ minWidth: 130 }}
        >
          <option value="">All sources</option>
          {LEAD_SOURCES.map(s => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
        </select>

        <select
          className="filter-select"
          value={ownerFilter}
          onChange={e => setOwnerFilter(e.target.value)}
          style={{ minWidth: 130 }}
        >
          <option value="">All owners</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.display_name}</option>)}
        </select>
      </div>

      {/* Leads table */}
      {loading ? (
        <div className="loading">Loading leads…</div>
      ) : leads.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>◎</div>
          <div style={{ fontWeight: 600, color: '#374151', marginBottom: 6 }}>No leads found</div>
          <div className="text-muted text-sm" style={{ marginBottom: 20 }}>
            {stageFilter || sourceFilter || ownerFilter || search
              ? 'Try clearing some filters'
              : 'Click "+ New Lead" to start tracking your first lead'}
          </div>
          {!(stageFilter || sourceFilter || ownerFilter || search) && (
            <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ New Lead</button>
          )}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f3f4f6', background: '#fafafa' }}>
                <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Account</th>
                <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Lifecycle Stage</th>
                <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Source</th>
                <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Score</th>
                <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Owner</th>
                <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Last Activity</th>
                <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Activities</th>
                <th style={{ padding: '10px 16px' }}></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead, i) => (
                <LeadRow key={lead.id} lead={lead} isLast={i === leads.length - 1} onUpdated={refresh} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
