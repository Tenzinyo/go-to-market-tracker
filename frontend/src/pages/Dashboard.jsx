import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useSSE } from '../hooks/useSSE'
import StageTag from '../components/StageTag'

const REFRESH_EVENTS = new Set(['new_entry', 'entry_updated', 'stage_change', 'account_created', 'account_updated'])

export default function Dashboard() {
  const [data,        setData]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [ownerFilter, setOwnerFilter] = useState('')
  const [users,       setUsers]       = useState([])

  useEffect(() => {
    api.get('/users').then(d => setUsers(d.users)).catch(() => {})
  }, [])

  const load = useCallback(() => {
    const params = ownerFilter ? `?owner_id=${ownerFilter}` : ''
    api.get(`/dashboard${params}`)
      .then(d => { setData(d.widgets); setLoading(false) })
      .catch(() => setLoading(false))
  }, [ownerFilter])

  useEffect(() => { load() }, [load])

  useSSE(event => {
    if (REFRESH_EVENTS.has(event.type)) load()
  })

  if (loading) return <div className="loading">Loading dashboard…</div>
  if (!data)   return <div className="loading">Failed to load</div>

  const overdue       = data.overdue_next_steps   ?? []
  const upcoming      = data.upcoming_meetings    ?? []
  const stale         = data.stale_deals?.items   ?? []
  const staleDays     = data.stale_deals?.threshold_days ?? 14
  const recentAccts   = data.recent_accounts      ?? []
  const dealsPerStage = data.deals_per_stage       ?? []
  const stageTimeline = data.stage_timeline        ?? []
  const forecast      = data.forecast             ?? {}

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Real-time overview of your GTM pipeline</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select
            className="filter-select"
            value={ownerFilter}
            onChange={e => setOwnerFilter(e.target.value)}
            style={{ minWidth: 140 }}
          >
            <option value="">All owners</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.display_name}</option>)}
          </select>
          <Link to="/log/new" className="btn btn-primary">+ Log Activity</Link>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{data.activities_this_week ?? 0}</div>
          <div className="stat-label">Activities this week</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: overdue.length > 0 ? '#ef4444' : undefined }}>
            {overdue.length}
          </div>
          <div className="stat-label">Overdue next steps</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{upcoming.length}</div>
          <div className="stat-label">Meetings (next 7 days)</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: stale.length > 0 ? '#d97706' : undefined }}>
            {stale.length}
          </div>
          <div className="stat-label">Stale deals ({staleDays}d+)</div>
        </div>
        {forecast.weighted_pipeline > 0 && (
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#16a34a', fontSize: 22 }}>{forecast.weighted_str}</div>
            <div className="stat-label">Weighted pipeline</div>
          </div>
        )}
        {forecast.total_pipeline > 0 && (
          <div className="stat-card">
            <div className="stat-value" style={{ fontSize: 22 }}>{forecast.total_str}</div>
            <div className="stat-label">Total pipeline</div>
          </div>
        )}
      </div>

      {/* Pipeline by stage */}
      <div className="card mb-4">
        <div className="card-title">Pipeline by Stage</div>
        {dealsPerStage.length === 0 ? (
          <span className="text-muted text-sm">No stages configured yet</span>
        ) : (
          <div className="stage-pills">
            {dealsPerStage.map(s => (
              <Link
                key={s.id}
                to="/pipeline"
                className="stage-pill"
                style={{ backgroundColor: s.color_hex, color: s.text_color_hex ?? '#2b2b2b' }}
              >
                <span className="stage-pill-count">{s.count}</span>
                <span className="stage-pill-name">{s.name}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Four info cards */}
      <div className="card-grid">
        {/* Overdue next steps */}
        <div className="card">
          <div className="card-title">Overdue Next Steps</div>
          {overdue.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">✓</div>
              <div className="empty-label">All clear!</div>
            </div>
          ) : (
            <ul className="alert-list">
              {overdue.map(e => (
                <li key={e.id} className="alert-item">
                  <span className="alert-dot-red" />
                  <div>
                    <div>{e.next_step}</div>
                    <div className="text-muted text-sm">
                      {e.account_name} · <span className="overdue">{e.next_step_date}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Upcoming meetings */}
        <div className="card">
          <div className="card-title">Upcoming Meetings</div>
          {upcoming.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📅</div>
              <div className="empty-label">No meetings scheduled</div>
            </div>
          ) : (
            <ul className="alert-list">
              {upcoming.map(e => (
                <li key={e.id} className="alert-item">
                  <span className="alert-dot-yellow" />
                  <div>
                    <div>
                      {e.activity_type || 'Meeting'}
                      {e.purpose ? `: ${e.purpose}` : ''}
                    </div>
                    <div className="text-muted text-sm">
                      {e.account_name} · {e.meeting_date}
                      {e.meeting_time ? ` at ${e.meeting_time}` : ''}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Stale deals */}
        <div className="card">
          <div className="card-title">Stale Deals</div>
          {stale.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">◎</div>
              <div className="empty-label">No stale deals</div>
            </div>
          ) : (
            <ul className="alert-list">
              {stale.map(a => (
                <li key={a.id} className="alert-item">
                  <span className="alert-dot-yellow" />
                  <div>
                    <Link to={`/accounts/${a.id}`}>{a.name}</Link>
                    <div className="text-muted text-sm">
                      <StageTag name={a.stage_name} colorHex={a.color_hex} /> · {a.days_stale}d stale
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recently updated accounts */}
        <div className="card">
          <div className="card-title">Recently Updated Accounts</div>
          {recentAccts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">◎</div>
              <div className="empty-label">No accounts yet</div>
            </div>
          ) : (
            <ul className="alert-list">
              {recentAccts.map(a => (
                <li key={a.id} className="alert-item">
                  <div>
                    <Link to={`/accounts/${a.id}`}>{a.name}</Link>
                    <div className="text-muted text-sm">
                      <StageTag name={a.stage_name} colorHex={a.color_hex} />
                      {' · '}
                      {new Date(a.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Stage movement timeline */}
      {stageTimeline.length > 0 && (
        <div className="card">
          <div className="card-title">Recent Stage Movements</div>
          <ul className="alert-list">
            {stageTimeline.slice(0, 12).map((s, i) => (
              <li key={i} className="alert-item" style={{ flexWrap: 'wrap', gap: 6 }}>
                <Link to={`/accounts/${s.account_id}`} style={{ fontWeight: 600 }}>{s.account_name}</Link>
                <span className="text-muted">moved</span>
                {s.from_stage && <><StageTag name={s.from_stage} colorHex={s.from_color} /><span className="text-muted">→</span></>}
                <StageTag name={s.to_stage} colorHex={s.to_color} />
                {s.changed_by && <span className="text-muted text-xs">by {s.changed_by}</span>}
                <span className="text-muted text-xs" style={{ marginLeft: 'auto' }}>
                  {new Date(s.changed_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
