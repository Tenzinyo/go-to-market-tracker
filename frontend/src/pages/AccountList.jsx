import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useSSE } from '../hooks/useSSE'
import StageTag from '../components/StageTag'
import { tagColor } from '../lib/tagColors'

const REFRESH_EVENTS = new Set(['account_created', 'account_updated', 'account_deleted', 'stage_change'])

export default function AccountList() {
  const [accounts, setAccounts] = useState([])
  const [stages, setStages] = useState([])
  const [allTags, setAllTags] = useState([])
  const [q, setQ] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/stages').then(d => setStages(d.stages)).catch(() => {})
    api.get('/accounts/tags').then(d => setAllTags(d.tags)).catch(() => {})
  }, [])

  const load = useCallback(() => {
    const params = new URLSearchParams({ limit: '200' })
    if (q)           params.set('q', q)
    if (stageFilter) params.set('stage_id', stageFilter)
    if (tagFilter)   params.set('tag', tagFilter)
    api.get(`/accounts?${params}`)
      .then(d => { setAccounts(d.accounts); setLoading(false) })
      .catch(() => setLoading(false))
  }, [q, stageFilter, tagFilter])

  useEffect(() => { load() }, [load])
  useSSE(event => { if (REFRESH_EVENTS.has(event.type)) load() })

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Accounts</h1>
          <p className="page-subtitle">{accounts.length} account{accounts.length !== 1 ? 's' : ''}</p>
        </div>
        <Link to="/log/new" className="btn btn-primary">+ Log Activity</Link>
      </div>

      <div className="filter-bar">
        <input
          className="search-input"
          placeholder="Search accounts…"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <select
          className="filter-select"
          value={stageFilter}
          onChange={e => setStageFilter(e.target.value)}
        >
          <option value="">All stages</option>
          {stages.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        {allTags.length > 0 && (
          <select
            className="filter-select"
            value={tagFilter}
            onChange={e => setTagFilter(e.target.value)}
          >
            <option value="">All tags</option>
            {allTags.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
        {(q || stageFilter || tagFilter) && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => { setQ(''); setStageFilter(''); setTagFilter('') }}
          >
            Clear
          </button>
        )}
      </div>

      <div className="card">
        {loading ? (
          <div className="loading">Loading…</div>
        ) : accounts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">◎</div>
            <div className="empty-label">
              {q || stageFilter ? 'No accounts match your filters' : 'No accounts yet — log an activity to create one'}
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Stage</th>
                  <th>Activities</th>
                  <th>Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map(a => (
                  <tr key={a.id}>
                    <td>
                      <Link to={`/accounts/${a.id}`} style={{ fontWeight: 500 }}>{a.name}</Link>
                      {(() => {
                        try {
                          const tags = JSON.parse(a.tags || '[]')
                          return tags.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                              {tags.map(t => {
                                const c = tagColor(t)
                                return (
                                  <span key={t} style={{
                                    background: c.bg, color: c.text,
                                    padding: '1px 7px', borderRadius: 99, fontSize: 11, fontWeight: 500,
                                  }}>{t}</span>
                                )
                              })}
                            </div>
                          ) : null
                        } catch { return null }
                      })()}
                    </td>
                    <td>
                      <StageTag name={a.stage_name} colorHex={a.color_hex} />
                    </td>
                    <td className="text-muted">{a.entry_count}</td>
                    <td className="text-muted">
                      {new Date(a.updated_at).toLocaleDateString()}
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
