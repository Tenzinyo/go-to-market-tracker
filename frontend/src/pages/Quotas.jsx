import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import { useUser } from '../App'
import { usePermissions } from '../hooks/usePermissions'

// ── Period helpers ────────────────────────────────────────────────────────────

function fmtDate(d) {
  return d.toISOString().split('T')[0]
}

const PRESETS = [
  { key: 'this_month',    label: 'This Month' },
  { key: 'this_quarter',  label: 'This Quarter' },
  { key: 'last_month',    label: 'Last Month' },
  { key: 'last_quarter',  label: 'Last Quarter' },
  { key: 'this_year',     label: 'This Year' },
]

function getPresetRange(key) {
  const now = new Date()
  const Y = now.getFullYear()
  const M = now.getMonth()

  switch (key) {
    case 'this_month':
      return { start: fmtDate(new Date(Y, M, 1)), end: fmtDate(new Date(Y, M + 1, 0)) }
    case 'this_quarter': {
      const q = Math.floor(M / 3)
      return { start: fmtDate(new Date(Y, q * 3, 1)), end: fmtDate(new Date(Y, q * 3 + 3, 0)) }
    }
    case 'last_month':
      return { start: fmtDate(new Date(Y, M - 1, 1)), end: fmtDate(new Date(Y, M, 0)) }
    case 'last_quarter': {
      const q = Math.floor(M / 3) - 1
      const adjY = q < 0 ? Y - 1 : Y
      const adjQ = ((q % 4) + 4) % 4
      return { start: fmtDate(new Date(adjY, adjQ * 3, 1)), end: fmtDate(new Date(adjY, adjQ * 3 + 3, 0)) }
    }
    case 'this_year':
      return { start: `${Y}-01-01`, end: `${Y}-12-31` }
    default:
      return null
  }
}

function presetLabel(key) {
  return PRESETS.find(p => p.key === key)?.label ?? key
}

// ── Formatting ────────────────────────────────────────────────────────────────

const METRIC_LABELS = {
  deal_value:      'Revenue (Won Deals)',
  deal_count:      'Deals Closed',
  activity_count:  'Activities Logged',
}

function fmtValue(val, metricType, currency = 'USD') {
  if (metricType === 'deal_value') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(val)
  }
  return String(Math.round(val))
}

function AttainmentColor(pct) {
  if (pct >= 100) return '#16a34a'
  if (pct >= 75)  return '#4f46e5'
  if (pct >= 50)  return '#d97706'
  return '#ef4444'
}

// ── Quota Progress Card ───────────────────────────────────────────────────────

function QuotaCard({ quota, onEdit, onDelete, canManage, isMe }) {
  const pct   = Math.min(quota.attainment, 100)
  const color = AttainmentColor(quota.attainment)
  const over  = quota.attainment > 100

  return (
    <div style={{
      background: '#fff', border: `1px solid ${isMe ? '#6366f1' : '#e5e7eb'}`,
      borderRadius: 12, padding: '18px 20px',
      boxShadow: isMe ? '0 0 0 3px #6366f120' : undefined,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>
            {quota.user_name}
            {isMe && <span style={{ marginLeft: 6, fontSize: 11, color: '#6366f1', fontWeight: 600 }}>You</span>}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
            {METRIC_LABELS[quota.metric_type] ?? quota.metric_type}
            {quota.label && <span style={{ marginLeft: 6 }}>· {quota.label}</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>
            {quota.attainment}%
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>attainment</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ background: '#f3f4f6', borderRadius: 6, height: 8, overflow: 'hidden', marginBottom: 8 }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: 6,
          background: color, transition: 'width 0.5s',
        }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 12, color: '#374151' }}>
          <strong style={{ color }}>{fmtValue(quota.achieved, quota.metric_type, quota.currency)}</strong>
          <span style={{ color: '#9ca3af' }}> / {fmtValue(quota.target, quota.metric_type, quota.currency)}</span>
        </div>
        {over && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
            background: '#dcfce7', color: '#16a34a',
          }}>
            {fmtValue(quota.achieved - quota.target, quota.metric_type, quota.currency)} over!
          </span>
        )}
      </div>

      {canManage && (
        <div style={{ display: 'flex', gap: 6, marginTop: 12, paddingTop: 10, borderTop: '1px solid #f3f4f6' }}>
          <button
            onClick={() => onEdit(quota)}
            className="btn btn-sm"
            style={{ background: 'white', border: '1px solid #e5e7eb', fontSize: 12 }}
          >Edit</button>
          <button
            onClick={() => onDelete(quota)}
            className="btn btn-sm"
            style={{ background: 'white', border: '1px solid #fecaca', color: '#dc2626', fontSize: 12 }}
          >Remove</button>
        </div>
      )}
    </div>
  )
}

// ── Set Quota Modal ───────────────────────────────────────────────────────────

function QuotaModal({ quota, users, period, onClose, onSaved }) {
  const editing = !!quota
  const [form, setForm] = useState({
    user_id:      quota?.user_id      ?? '',
    metric_type:  quota?.metric_type  ?? 'deal_value',
    target:       quota?.target       ?? '',
    currency:     quota?.currency     ?? 'USD',
    label:        quota?.label        ?? '',
    period_type:  quota?.period_type  ?? 'custom',
    period_start: quota?.period_start ?? period.start,
    period_end:   quota?.period_end   ?? period.end,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function submit(e) {
    e.preventDefault()
    if (!form.user_id)  { setError('Select a user'); return }
    if (!form.target)   { setError('Target is required'); return }
    setSaving(true); setError('')
    try {
      if (editing) {
        await api.patch(`/quotas/${quota.id}`, {
          target:       Number(form.target),
          label:        form.label || null,
          period_start: form.period_start,
          period_end:   form.period_end,
        })
      } else {
        await api.post('/quotas', {
          user_id:      Number(form.user_id),
          metric_type:  form.metric_type,
          target:       Number(form.target),
          currency:     form.currency,
          label:        form.label || null,
          period_type:  form.period_type,
          period_start: form.period_start,
          period_end:   form.period_end,
        })
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err.message ?? 'Failed to save')
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
        background: '#fff', borderRadius: 12, padding: 28, width: 480,
        maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{editing ? 'Edit Quota' : 'Set Quota'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>×</button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!editing && (
            <div>
              <label className="form-label">Team Member *</label>
              <select className="form-input" value={form.user_id} onChange={e => set('user_id', e.target.value)} autoFocus>
                <option value="">— select —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.display_name}</option>)}
              </select>
            </div>
          )}

          {!editing && (
            <div>
              <label className="form-label">Metric</label>
              <select className="form-input" value={form.metric_type} onChange={e => set('metric_type', e.target.value)}>
                {Object.entries(METRIC_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: form.metric_type === 'deal_value' ? '2fr 1fr' : '1fr', gap: 10 }}>
            <div>
              <label className="form-label">Target {form.metric_type === 'deal_value' ? '($)' : '(count)'} *</label>
              <input
                className="form-input"
                type="number" min={0} step={form.metric_type === 'deal_value' ? 1000 : 1}
                value={form.target}
                onChange={e => set('target', e.target.value)}
                placeholder={form.metric_type === 'deal_value' ? '100000' : '10'}
              />
            </div>
            {form.metric_type === 'deal_value' && (
              <div>
                <label className="form-label">Currency</label>
                <select className="form-input" value={form.currency} onChange={e => set('currency', e.target.value)}>
                  {['USD','EUR','GBP','CAD','AUD'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="form-label">Period Start</label>
              <input className="form-input" type="date" value={form.period_start} onChange={e => set('period_start', e.target.value)} />
            </div>
            <div>
              <label className="form-label">Period End</label>
              <input className="form-input" type="date" value={form.period_end} onChange={e => set('period_end', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="form-label">Label <span className="text-muted text-xs">(optional, e.g. "Q3 2026")</span></label>
            <input className="form-input" value={form.label} onChange={e => set('label', e.target.value)} placeholder="Q3 2026" />
          </div>

          {error && <div style={{ color: '#dc2626', fontSize: 13 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn" style={{ background: 'white', border: '1px solid #e5e7eb' }} onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Set Quota'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Leaderboard row ───────────────────────────────────────────────────────────

function LeaderboardRow({ rank, entry }) {
  const maxQuota = entry.quotas[0]
  if (!maxQuota) return null
  const pct   = Math.min(maxQuota.attainment, 100)
  const color = AttainmentColor(maxQuota.attainment)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0',
      borderBottom: '1px solid #f9fafb',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: rank === 1 ? '#fef3c7' : rank === 2 ? '#f3f4f6' : rank === 3 ? '#fef9f0' : '#f9fafb',
        color: rank <= 3 ? '#92400e' : '#6b7280',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700,
      }}>
        {rank <= 3 ? ['🥇','🥈','🥉'][rank - 1] : rank}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{entry.display_name}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color }}>
            {fmtValue(maxQuota.achieved, maxQuota.metric_type, maxQuota.currency)}
            <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: 12 }}> / {fmtValue(maxQuota.target, maxQuota.metric_type, maxQuota.currency)}</span>
          </span>
        </div>
        <div style={{ background: '#f3f4f6', borderRadius: 4, height: 6, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.4s' }} />
        </div>
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 48 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color }}>{maxQuota.attainment}%</div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Quotas() {
  const { currentUser }          = useUser()
  const { isManager, can }       = usePermissions()

  const [users,     setUsers]    = useState([])
  const [quotas,    setQuotas]   = useState([])
  const [leaderboard, setLB]     = useState([])
  const [loading,   setLoading]  = useState(true)
  const [preset,    setPreset]   = useState('this_quarter')
  const [customStart, setCS]     = useState('')
  const [customEnd,   setCE]     = useState('')
  const [showNew,   setShowNew]  = useState(false)
  const [editing,   setEditing]  = useState(null)
  const [view,      setView]     = useState('leaderboard') // 'leaderboard' | 'cards'

  const period = (() => {
    if (preset === 'custom') return { start: customStart, end: customEnd }
    return getPresetRange(preset) ?? { start: '', end: '' }
  })()

  const load = useCallback(() => {
    if (!period.start || !period.end) return
    setLoading(true)
    Promise.all([
      api.get(`/quotas?period_start=${period.start}&period_end=${period.end}`),
      api.get(`/quotas/leaderboard?period_start=${period.start}&period_end=${period.end}`),
    ]).then(([qData, lbData]) => {
      setQuotas(qData.quotas)
      setLB(lbData.leaderboard)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [period.start, period.end])

  useEffect(() => { api.get('/users').then(d => setUsers(d.users)).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])

  async function handleDelete(quota) {
    if (!confirm(`Remove quota for ${quota.user_name}?`)) return
    await api.del(`/quotas/${quota.id}`)
    load()
  }

  const myQuotas    = quotas.filter(q => q.user_id === currentUser?.id)
  const otherQuotas = quotas.filter(q => q.user_id !== currentUser?.id)

  const periodLabel = preset !== 'custom'
    ? presetLabel(preset)
    : `${period.start} – ${period.end}`

  // Team aggregate stats
  const avgAttainment = leaderboard.length > 0
    ? Math.round(leaderboard.reduce((s, e) => s + e.attainment, 0) / leaderboard.length)
    : null
  const atOrOver = leaderboard.filter(e => e.attainment >= 100).length

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Quota Tracking</h1>
          <p className="page-subtitle">Team performance vs targets · {periodLabel}</p>
        </div>
        {isManager && (
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ Set Quota</button>
        )}
      </div>

      {(showNew || editing) && (
        <QuotaModal
          quota={editing}
          users={users}
          period={period}
          onClose={() => { setShowNew(false); setEditing(null) }}
          onSaved={load}
        />
      )}

      {/* Period selector */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center' }}>
        {PRESETS.map(p => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            style={{
              padding: '5px 14px', borderRadius: 99, fontSize: 13, cursor: 'pointer',
              border: '1px solid #e5e7eb',
              background: preset === p.key ? '#6366f1' : 'white',
              color:      preset === p.key ? '#fff' : '#374151',
              fontWeight: 500,
            }}
          >{p.label}</button>
        ))}
        <button
          onClick={() => setPreset('custom')}
          style={{
            padding: '5px 14px', borderRadius: 99, fontSize: 13, cursor: 'pointer',
            border: '1px solid #e5e7eb',
            background: preset === 'custom' ? '#6366f1' : 'white',
            color:      preset === 'custom' ? '#fff' : '#374151',
            fontWeight: 500,
          }}
        >Custom</button>
        {preset === 'custom' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="date" className="form-input" style={{ padding: '4px 8px', fontSize: 13 }}
              value={customStart} onChange={e => setCS(e.target.value)} />
            <span style={{ color: '#6b7280' }}>–</span>
            <input type="date" className="form-input" style={{ padding: '4px 8px', fontSize: 13 }}
              value={customEnd} onChange={e => setCE(e.target.value)} />
          </div>
        )}
      </div>

      {/* Team summary stats */}
      {leaderboard.length > 0 && (
        <div className="stats-row" style={{ marginBottom: 24 }}>
          <div className="stat-card">
            <div className="stat-value">{leaderboard.length}</div>
            <div className="stat-label">Reps with quotas</div>
          </div>
          {avgAttainment != null && (
            <div className="stat-card">
              <div className="stat-value" style={{ color: AttainmentColor(avgAttainment) }}>{avgAttainment}%</div>
              <div className="stat-label">Avg attainment</div>
            </div>
          )}
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#16a34a' }}>{atOrOver}</div>
            <div className="stat-label">At or above 100%</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#ef4444' }}>{leaderboard.filter(e => e.attainment < 50).length}</div>
            <div className="stat-label">Below 50%</div>
          </div>
        </div>
      )}

      {/* My quotas spotlight */}
      {myQuotas.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            My Quota{myQuotas.length > 1 ? 's' : ''}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {myQuotas.map(q => (
              <QuotaCard
                key={q.id}
                quota={q}
                isMe
                canManage={isManager}
                onEdit={setEditing}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>
      )}

      {/* Toggle leaderboard / cards */}
      {quotas.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {['leaderboard','cards'].map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '4px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                border: '1px solid #e5e7eb',
                background: view === v ? '#f5f3ff' : 'white',
                color: view === v ? '#6366f1' : '#374151',
                fontWeight: view === v ? 600 : 400,
              }}
            >{v === 'leaderboard' ? 'Leaderboard' : 'Cards'}</button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="loading">Loading quotas…</div>
      ) : quotas.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>◎</div>
          <div style={{ fontWeight: 600, color: '#374151', marginBottom: 6 }}>No quotas set for this period</div>
          <div className="text-muted text-sm" style={{ marginBottom: 20 }}>
            {isManager
              ? 'Click "+ Set Quota" to assign targets to team members.'
              : 'Your manager hasn\'t set any quotas for this period yet.'}
          </div>
          {isManager && (
            <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ Set Quota</button>
          )}
        </div>
      ) : view === 'leaderboard' ? (
        <div className="card">
          <div className="card-title">Leaderboard · {periodLabel}</div>
          {leaderboard.map((entry, i) => (
            <LeaderboardRow key={entry.user_id} rank={i + 1} entry={entry} />
          ))}
        </div>
      ) : (
        <>
          {otherQuotas.length > 0 && (
            <div>
              {isManager && (
                <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                  Team
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {otherQuotas.map(q => (
                  <QuotaCard
                    key={q.id}
                    quota={q}
                    isMe={false}
                    canManage={isManager}
                    onEdit={setEditing}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
