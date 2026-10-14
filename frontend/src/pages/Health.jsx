import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_META = {
  healthy:  { label: 'Healthy',  color: '#16a34a', bg: '#dcfce7', bar: '#22c55e' },
  at_risk:  { label: 'At Risk',  color: '#d97706', bg: '#fef3c7', bar: '#f59e0b' },
  critical: { label: 'Critical', color: '#dc2626', bg: '#fee2e2', bar: '#ef4444' },
}

const LIFECYCLE_LABELS = {
  lead: 'Lead', mql: 'MQL', sql: 'SQL',
  opportunity: 'Opportunity', customer: 'Customer', churned: 'Churned',
}

// ── Score bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ score, status }) {
  const meta = STATUS_META[status] ?? STATUS_META.at_risk
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 140 }}>
      <div style={{ flex: 1, background: '#f3f4f6', borderRadius: 99, height: 6, overflow: 'hidden' }}>
        <div style={{
          width: `${score}%`, height: '100%', borderRadius: 99,
          background: meta.bar, transition: 'width 0.4s ease',
        }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: meta.color, minWidth: 28, textAlign: 'right' }}>
        {score}
      </span>
    </div>
  )
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] ?? STATUS_META.at_risk
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
      background: meta.bg, color: meta.color,
    }}>
      {meta.label}
    </span>
  )
}

// ── Account row ───────────────────────────────────────────────────────────────

function AccountRow({ account }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <tr
        style={{ cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}
      >
        <td>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#9ca3af', width: 14 }}>{expanded ? '▾' : '▸'}</span>
            <div>
              <Link
                to={`/accounts/${account.id}`}
                style={{ fontWeight: 500, color: '#111827' }}
                onClick={e => e.stopPropagation()}
              >
                {account.name}
              </Link>
              {account.lifecycle_stage && (
                <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 6 }}>
                  {LIFECYCLE_LABELS[account.lifecycle_stage] ?? account.lifecycle_stage}
                </span>
              )}
            </div>
          </div>
        </td>
        <td><StatusBadge status={account.health_status} /></td>
        <td><ScoreBar score={account.health_score} status={account.health_status} /></td>
        <td className="text-muted text-sm">
          {account.last_activity_date
            ? `${account.days_since_activity}d ago`
            : 'Never'}
        </td>
        <td className="text-muted text-sm">{account.activities_30d}</td>
        <td className="text-muted text-sm">{account.active_deals}</td>
        <td className="text-muted text-sm">{account.owner_name ?? '—'}</td>
      </tr>

      {expanded && account.health_flags.length > 0 && (
        <tr>
          <td colSpan={7} style={{ padding: '0 14px 10px 42px', background: '#fafafa' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {account.health_flags.map((flag, i) => (
                <span key={i} style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 6,
                  background: '#fee2e2', color: '#991b1b',
                  border: '1px solid #fca5a5',
                }}>
                  ⚠ {flag}
                </span>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

const FILTERS = [
  { key: 'all',      label: 'All' },
  { key: 'critical', label: 'Critical' },
  { key: 'at_risk',  label: 'At Risk' },
  { key: 'healthy',  label: 'Healthy' },
]

export default function Health() {
  const [accounts, setAccounts] = useState([])
  const [stats,    setStats]    = useState(null)
  const [filter,   setFilter]   = useState('all')
  const [loading,  setLoading]  = useState(true)
  const [sortDir,  setSortDir]  = useState('asc') // asc = worst first

  const load = useCallback(() => {
    setLoading(true)
    api.get('/account-health')
      .then(d => { setAccounts(d.accounts); setStats(d.stats); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = accounts
    .filter(a => filter === 'all' || a.health_status === filter)
    .sort((a, b) => sortDir === 'asc'
      ? a.health_score - b.health_score
      : b.health_score - a.health_score
    )

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Account Health</h1>
          <p className="page-subtitle">Engagement scores and churn risk signals across your portfolio</p>
        </div>
        <button className="btn" style={{ background: 'white', border: '1px solid #e5e7eb' }} onClick={load}>
          Refresh
        </button>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="stats-row" style={{ marginBottom: 20 }}>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#16a34a' }}>{stats.healthy}</div>
            <div className="stat-label">Healthy</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#d97706' }}>{stats.at_risk}</div>
            <div className="stat-label">At Risk</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#dc2626' }}>{stats.critical}</div>
            <div className="stat-label">Critical</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.avg_score}</div>
            <div className="stat-label">Avg Score</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">Total Accounts</div>
          </div>
        </div>
      )}

      {/* Score methodology */}
      <div className="card" style={{ marginBottom: 16, padding: '10px 16px' }}>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12, color: '#6b7280' }}>
          <span><strong style={{ color: '#374151' }}>Score = </strong>Recency (40) + Engagement 30d (30) + Next Step (20) + Active Deal (10)</span>
          <span>·</span>
          <span><strong style={{ color: '#16a34a' }}>Healthy</strong> 70+</span>
          <span><strong style={{ color: '#d97706' }}>At Risk</strong> 40–69</span>
          <span><strong style={{ color: '#dc2626' }}>Critical</strong> &lt;40</span>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e7eb', marginBottom: 16 }}>
        {FILTERS.map(f => {
          const count = f.key === 'all'
            ? stats?.total
            : stats?.[f.key]
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                background: 'none', border: 'none', padding: '8px 16px', cursor: 'pointer',
                fontSize: 13, fontWeight: filter === f.key ? 600 : 400,
                color: filter === f.key
                  ? (STATUS_META[f.key]?.color ?? '#4f46e5')
                  : '#6b7280',
                borderBottom: filter === f.key
                  ? `2px solid ${STATUS_META[f.key]?.color ?? '#4f46e5'}`
                  : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {f.label}
              {count != null && (
                <span style={{ marginLeft: 5, fontSize: 11, color: '#9ca3af' }}>({count})</span>
              )}
            </button>
          )
        })}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', paddingBottom: 4 }}>
          <button
            className="btn btn-sm"
            style={{ background: 'white', border: '1px solid #e5e7eb', fontSize: 12 }}
            onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
          >
            Score {sortDir === 'asc' ? '↑ Worst first' : '↓ Best first'}
          </button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading">Computing health scores…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">◉</div>
            <div className="empty-label">No accounts match this filter</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Status</th>
                  <th>Health Score</th>
                  <th>Last Activity</th>
                  <th>Acts (30d)</th>
                  <th>Deals</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => <AccountRow key={a.id} account={a} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
