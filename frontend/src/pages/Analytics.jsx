import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import StageTag from '../components/StageTag'

function Bar({ value, max, color = '#4f46e5', height = 20 }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, background: '#f3f4f6', borderRadius: 6, height, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, background: color, height: '100%', borderRadius: 6, minWidth: value > 0 ? 4 : 0, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: 13, color: '#374151', minWidth: 32, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}

export default function Analytics() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/analytics')
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading">Loading analytics…</div>
  if (!data)   return <div className="loading">Failed to load analytics</div>

  const { activity_breakdown, accounts_per_stage, stage_durations,
          win_loss, top_accounts, activities_per_month } = data

  const maxAccounts  = Math.max(...accounts_per_stage.map(s => s.count), 1)
  const maxActivity  = Math.max(...(activity_breakdown.map(a => a.count)), 1)
  const maxMonthly   = Math.max(...(activities_per_month.map(m => m.count)), 1)
  const maxDays      = Math.max(...stage_durations.filter(s => s.avg_days).map(s => s.avg_days), 1)
  const totalDeals   = win_loss.won + win_loss.lost + win_loss.active + win_loss.unassigned
  const winRate      = win_loss.won + win_loss.lost > 0
    ? Math.round((win_loss.won / (win_loss.won + win_loss.lost)) * 100)
    : null

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">Pipeline performance and activity breakdown</p>
        </div>
      </div>

      {/* Win/Loss summary */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{totalDeals}</div>
          <div className="stat-label">Total accounts</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#16a34a' }}>{win_loss.won}</div>
          <div className="stat-label">Closed Won</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#dc2626' }}>{win_loss.lost}</div>
          <div className="stat-label">Closed Lost</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: winRate >= 60 ? '#16a34a' : winRate !== null && winRate < 40 ? '#dc2626' : undefined }}>
            {winRate !== null ? `${winRate}%` : '—'}
          </div>
          <div className="stat-label">Win rate</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

        {/* Pipeline funnel */}
        <div className="card">
          <h2 className="card-title" style={{ marginBottom: 16 }}>Pipeline Funnel</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {accounts_per_stage.map(s => (
              <div key={s.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>{s.name}</span>
                </div>
                <Bar value={s.count} max={maxAccounts} color={s.color_hex} />
              </div>
            ))}
          </div>
        </div>

        {/* Avg time per stage */}
        <div className="card">
          <h2 className="card-title" style={{ marginBottom: 16 }}>Avg Days in Stage</h2>
          {stage_durations.every(s => !s.avg_days) ? (
            <div className="empty-state" style={{ padding: '24px 0' }}>
              <div className="empty-label">No stage history yet</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {stage_durations.map(s => (
                <div key={s.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>{s.name}</span>
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>
                      {s.avg_days != null ? `${s.avg_days}d avg` : '—'}
                      {s.transitions > 0 && <span style={{ marginLeft: 6 }}>({s.transitions} transitions)</span>}
                    </span>
                  </div>
                  <Bar value={s.avg_days ?? 0} max={maxDays} color={s.color_hex} height={16} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

        {/* Activity type breakdown */}
        <div className="card">
          <h2 className="card-title" style={{ marginBottom: 16 }}>Activity Types</h2>
          {activity_breakdown.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 0' }}>
              <div className="empty-label">No activities logged yet</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {activity_breakdown.map(a => (
                <div key={a.activity_type}>
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>{a.activity_type}</span>
                  </div>
                  <Bar value={a.count} max={maxActivity} color="#6366f1" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Monthly activity */}
        <div className="card">
          <h2 className="card-title" style={{ marginBottom: 16 }}>Monthly Activity (last 6 mo)</h2>
          {activities_per_month.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 0' }}>
              <div className="empty-label">No activities in range</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {activities_per_month.map(m => (
                <div key={m.month}>
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>{m.month}</span>
                  </div>
                  <Bar value={m.count} max={maxMonthly} color="#0ea5e9" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top accounts */}
      <div className="card">
        <h2 className="card-title" style={{ marginBottom: 16 }}>Top Accounts by Activity</h2>
        {top_accounts.length === 0 ? (
          <div className="empty-state"><div className="empty-label">No accounts yet</div></div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Account</th>
                  <th>Stage</th>
                  <th>Activities</th>
                </tr>
              </thead>
              <tbody>
                {top_accounts.map((a, i) => (
                  <tr key={a.id}>
                    <td className="text-muted text-sm">{i + 1}</td>
                    <td>
                      <Link to={`/accounts/${a.id}`} style={{ fontWeight: 500 }}>{a.name}</Link>
                    </td>
                    <td><StageTag name={a.stage_name} colorHex={a.color_hex} /></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: Math.max(4, Math.round((a.entry_count / (top_accounts[0]?.entry_count || 1)) * 80)),
                          height: 8, background: '#4f46e5', borderRadius: 4
                        }} />
                        <span className="text-sm">{a.entry_count}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
