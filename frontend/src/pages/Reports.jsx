import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import { useUser } from '../App'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtValue(value, metricKey) {
  if (value == null) return '—'
  if (['deal_value', 'deal_weighted'].includes(metricKey)) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
  }
  return Number(value).toLocaleString()
}

function exportCSV(rows, metricLabel, groupLabel) {
  const headers = [groupLabel, metricLabel, '%']
  const lines   = [
    headers.join(','),
    ...rows.map(r => [
      `"${String(r.label ?? '').replace(/"/g, '""')}"`,
      r.value,
      r.pct,
    ].join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `report-${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Bar chart (CSS-only) ──────────────────────────────────────────────────────

function BarChart({ rows, metricKey, colorHex }) {
  const max = Math.max(...rows.map(r => r.value ?? 0), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r, i) => {
        const pct   = Math.max(Math.round(((r.value ?? 0) / max) * 100), r.value > 0 ? 2 : 0)
        const color = r.color_hex ?? colorHex ?? '#6366f1'
        return (
          <div key={i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#374151', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.label ?? '—'}
              </span>
              <span style={{ fontSize: 12, color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>
                {fmtValue(r.value, metricKey)}
                <span style={{ marginLeft: 8, color: '#9ca3af' }}>{r.pct}%</span>
              </span>
            </div>
            <div style={{ background: '#f3f4f6', borderRadius: 6, height: 18, overflow: 'hidden' }}>
              <div style={{
                width: `${pct}%`, background: color, height: '100%',
                borderRadius: 6, transition: 'width 0.4s ease',
                minWidth: r.value > 0 ? 4 : 0,
              }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Save Report Modal ─────────────────────────────────────────────────────────

function SaveModal({ config, currentUser, onSaved, onClose }) {
  const [name,   setName]   = useState('')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  async function save(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true); setError('')
    try {
      await api.post('/reports/saved', { name: name.trim(), config, created_by: currentUser?.id ?? null })
      onSaved()
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
      <div style={{ background: '#fff', borderRadius: 12, padding: 28, maxWidth: 400, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 700 }}>Save Report</h2>
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            className="form-input"
            autoFocus
            required
            placeholder="Report name…"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          {error && <div style={{ color: '#ef4444', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Saved Reports sidebar ─────────────────────────────────────────────────────

function SavedReports({ saved, onLoad, onDelete, onRefresh }) {
  if (saved.length === 0) {
    return <div className="text-muted text-sm">No saved reports yet. Build a report and click "Save".</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {saved.map(r => {
        let cfg = null
        try { cfg = JSON.parse(r.config) } catch {}
        return (
          <div key={r.id} style={{
            padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8,
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</div>
              {cfg && (
                <div className="text-muted text-xs" style={{ marginTop: 2 }}>
                  {cfg.metric_label ?? cfg.metric} · by {cfg.group_label ?? cfg.group_by}
                  {cfg.date_from && <span> · {cfg.date_from}{cfg.date_to ? ` → ${cfg.date_to}` : ''}</span>}
                </div>
              )}
              <div className="text-muted text-xs" style={{ marginTop: 2 }}>
                {new Date(r.updated_at).toLocaleDateString()}
                {r.created_by_name ? ` · ${r.created_by_name}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <button className="btn btn-sm" style={{ background: '#ede9fe', color: '#6366f1', border: 'none' }}
                onClick={() => onLoad(cfg)}>
                Load
              </button>
              <button className="btn btn-sm" style={{ background: 'white', border: '1px solid #fca5a5', color: '#ef4444' }}
                onClick={() => onDelete(r.id)}>
                ×
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Report Results table ──────────────────────────────────────────────────────

function ResultsTable({ rows, metricKey, metricLabel, groupLabel }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>{groupLabel}</th>
            <th style={{ textAlign: 'right' }}>{metricLabel}</th>
            <th style={{ textAlign: 'right' }}>Share %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ fontWeight: 500 }}>{r.label ?? '—'}</td>
              <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {fmtValue(r.value, metricKey)}
              </td>
              <td style={{ textAlign: 'right' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                  <div style={{ width: Math.max(r.pct, 2), height: 6, background: r.color_hex ?? '#6366f1', borderRadius: 3 }} />
                  <span style={{ fontSize: 12, color: '#9ca3af', minWidth: 32, textAlign: 'right' }}>{r.pct}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  metric:                    'activity_count',
  group_by:                  'month',
  date_from:                 new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
  date_to:                   new Date().toISOString().split('T')[0],
  owner_id:                  '',
  stage_id:                  '',
  activity_type_filter:      '',
  forecast_category_filter:  '',
}

export default function Reports() {
  const { currentUser }  = useUser()

  const [meta,         setMeta]         = useState(null)
  const [metaLoading,  setMetaLoading]  = useState(true)
  const [metaError,    setMetaError]    = useState('')
  const [config,       setConfig]       = useState(DEFAULT_CONFIG)
  const [result,       setResult]       = useState(null)
  const [running,      setRunning]      = useState(false)
  const [runError,     setRunError]     = useState('')
  const [saved,        setSaved]        = useState([])
  const [showSave,     setShowSave]     = useState(false)
  const [chartView,    setChartView]    = useState(true)   // true = chart, false = table
  const [activeTab,    setActiveTab]    = useState('build') // 'build' | 'saved'

  function loadMeta() {
    setMetaLoading(true)
    setMetaError('')
    api.get('/reports/meta')
      .then(d => { setMeta(d); setMetaLoading(false) })
      .catch(err => { setMetaError(err.message || 'Failed to load'); setMetaLoading(false) })
  }

  useEffect(() => {
    loadMeta()
    loadSaved()
  }, [])

  function loadSaved() {
    api.get('/reports/saved').then(d => setSaved(d.reports)).catch(() => {})
  }

  function set(k, v) { setConfig(c => ({ ...c, [k]: v })) }

  const currentMetric  = meta?.metrics?.find(m => m.key === config.metric)
  const validGroupBys  = currentMetric?.group_bys ?? []
  const groupByIsValid = validGroupBys.some(g => g.key === config.group_by)

  // Auto-fix group_by when metric changes to something incompatible
  function handleMetricChange(val) {
    const newMeta   = meta?.metrics?.find(m => m.key === val)
    const firstGrp  = newMeta?.group_bys?.[0]?.key ?? 'month'
    const stillOk   = newMeta?.group_bys?.some(g => g.key === config.group_by)
    set('metric', val)
    if (!stillOk) set('group_by', firstGrp)
  }

  const runReport = useCallback(async () => {
    setRunning(true); setRunError('')
    try {
      const data = await api.post('/reports/run', {
        ...config,
        owner_id:   config.owner_id  || undefined,
        stage_id:   config.stage_id  || undefined,
        activity_type_filter:     config.activity_type_filter     || undefined,
        forecast_category_filter: config.forecast_category_filter || undefined,
      })
      setResult(data)
    } catch (err) {
      setRunError(err.message)
    } finally {
      setRunning(false) }
  }, [config])

  function loadSavedReport(cfg) {
    if (!cfg) return
    setConfig({ ...DEFAULT_CONFIG, ...cfg })
    setResult(null)
    setActiveTab('build')
  }

  async function deleteSaved(id) {
    if (!confirm('Delete this saved report?')) return
    await api.del(`/reports/saved/${id}`)
    loadSaved()
  }

  const configWithLabels = {
    ...config,
    metric_label: currentMetric?.label ?? config.metric,
    group_label:  validGroupBys.find(g => g.key === config.group_by)?.label ?? config.group_by,
  }

  const today   = new Date().toISOString().split('T')[0]
  const yr      = new Date().getFullYear()

  // Quick date range presets
  const DATE_PRESETS = [
    { label: 'This year',   from: `${yr}-01-01`,      to: today },
    { label: 'Last 90d',    from: new Date(Date.now() - 90*86400000).toISOString().split('T')[0], to: today },
    { label: 'Last 30d',    from: new Date(Date.now() - 30*86400000).toISOString().split('T')[0], to: today },
    { label: 'Last 7d',     from: new Date(Date.now() -  7*86400000).toISOString().split('T')[0], to: today },
    { label: 'Q1',          from: `${yr}-01-01`,      to: `${yr}-03-31` },
    { label: 'Q2',          from: `${yr}-04-01`,      to: `${yr}-06-30` },
    { label: 'Q3',          from: `${yr}-07-01`,      to: `${yr}-09-30` },
    { label: 'Q4',          from: `${yr}-10-01`,      to: `${yr}-12-31` },
  ]

  return (
    <div className="page">
      {showSave && result && (
        <SaveModal
          config={configWithLabels}
          currentUser={currentUser}
          onSaved={loadSaved}
          onClose={() => setShowSave(false)}
        />
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">Report Builder</h1>
          <p className="page-subtitle">Build custom reports, slice by any dimension, save for later</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, alignItems: 'start' }}>
        {/* ── Left panel: builder + saved ── */}
        <div>
          {/* Tab switcher */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: 16 }}>
            {[['build','Build'], ['saved','Saved']].map(([key, lbl]) => (
              <button key={key} onClick={() => setActiveTab(key)} style={{
                background: 'none', border: 'none', padding: '8px 16px', cursor: 'pointer',
                fontSize: 13, fontWeight: activeTab === key ? 600 : 400,
                color: activeTab === key ? '#4f46e5' : '#6b7280',
                borderBottom: activeTab === key ? '2px solid #4f46e5' : '2px solid transparent',
                marginBottom: -1,
              }}>{lbl} {key === 'saved' && saved.length > 0 && `(${saved.length})`}</button>
            ))}
          </div>

          {activeTab === 'build' && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {metaLoading && (
                <div className="text-muted text-sm" style={{ textAlign: 'center', padding: '8px 0' }}>
                  Loading report configuration…
                </div>
              )}
              {metaError && (
                <div style={{ color: '#dc2626', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>Failed to load: {metaError}</span>
                  <button className="btn btn-sm" onClick={loadMeta} style={{ flexShrink: 0 }}>Retry</button>
                </div>
              )}
              {/* Metric */}
              <div>
                <label className="form-label">Metric</label>
                <select className="form-input" value={config.metric}
                  onChange={e => handleMetricChange(e.target.value)}>
                  {meta?.metrics?.map(m => (
                    <option key={m.key} value={m.key}>{m.label}</option>
                  ))}
                </select>
              </div>

              {/* Group by */}
              <div>
                <label className="form-label">Group By</label>
                <select className="form-input" value={groupByIsValid ? config.group_by : validGroupBys[0]?.key ?? ''}
                  onChange={e => set('group_by', e.target.value)}>
                  {validGroupBys.map(g => (
                    <option key={g.key} value={g.key}>{g.label}</option>
                  ))}
                </select>
              </div>

              {/* Date range */}
              <div>
                <label className="form-label">Date Range</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                  {DATE_PRESETS.map(p => (
                    <button key={p.label} type="button"
                      style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 99, cursor: 'pointer',
                        border: '1px solid',
                        background: config.date_from === p.from && config.date_to === p.to ? '#ede9fe' : '#f9fafb',
                        borderColor: config.date_from === p.from && config.date_to === p.to ? '#6366f1' : '#e5e7eb',
                        color: config.date_from === p.from && config.date_to === p.to ? '#4f46e5' : '#6b7280',
                      }}
                      onClick={() => { set('date_from', p.from); set('date_to', p.to) }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label className="form-label">From</label>
                    <input className="form-input" type="date" value={config.date_from}
                      onChange={e => set('date_from', e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">To</label>
                    <input className="form-input" type="date" value={config.date_to}
                      onChange={e => set('date_to', e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Filters */}
              <div>
                <label className="form-label">Filters <span className="text-muted text-xs">(optional)</span></label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <select className="form-input" value={config.owner_id}
                    onChange={e => set('owner_id', e.target.value)}>
                    <option value="">All owners</option>
                    {meta?.users?.map(u => <option key={u.id} value={u.id}>{u.display_name}</option>)}
                  </select>

                  <select className="form-input" value={config.stage_id}
                    onChange={e => set('stage_id', e.target.value)}>
                    <option value="">All stages</option>
                    {meta?.stages?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>

                  {config.metric === 'activity_count' && (
                    <select className="form-input" value={config.activity_type_filter}
                      onChange={e => set('activity_type_filter', e.target.value)}>
                      <option value="">All activity types</option>
                      {meta?.activity_types?.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  )}

                  {['deal_count','deal_value','deal_weighted'].includes(config.metric) && (
                    <select className="form-input" value={config.forecast_category_filter}
                      onChange={e => set('forecast_category_filter', e.target.value)}>
                      <option value="">All forecast categories</option>
                      <option value="commit">Commit</option>
                      <option value="best_case">Best Case</option>
                      <option value="pipeline">Pipeline</option>
                      <option value="omitted">Omitted</option>
                    </select>
                  )}
                </div>
              </div>

              {runError && <div style={{ color: '#ef4444', fontSize: 13 }}>{runError}</div>}

              <button className="btn btn-primary" onClick={runReport} disabled={running || !meta}>
                {running ? 'Running…' : 'Run Report'}
              </button>
            </div>
          )}

          {activeTab === 'saved' && (
            <div className="card">
              <SavedReports
                saved={saved}
                onLoad={loadSavedReport}
                onDelete={deleteSaved}
                onRefresh={loadSaved}
              />
            </div>
          )}
        </div>

        {/* ── Right panel: results ── */}
        <div>
          {!result ? (
            <div className="card">
              <div className="empty-state" style={{ padding: '60px 0' }}>
                <div className="empty-icon" style={{ fontSize: 36 }}>◉</div>
                <div className="empty-label">Configure your report on the left and click "Run Report"</div>
              </div>
            </div>
          ) : (
            <>
              {/* Results header */}
              <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>
                      {result.metric_label} by {result.group_label}
                    </div>
                    <div className="text-muted text-xs" style={{ marginTop: 3 }}>
                      {result.rows.length} groups · Total: {fmtValue(result.total, config.metric)}
                      {config.date_from && <span> · {config.date_from} → {config.date_to || 'now'}</span>}
                      · Ran {new Date(result.ran_at).toLocaleTimeString()}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn btn-sm"
                      style={{ background: chartView ? '#ede9fe' : 'white', border: '1px solid', borderColor: chartView ? '#6366f1' : '#e5e7eb', color: chartView ? '#4f46e5' : '#374151' }}
                      onClick={() => setChartView(true)}
                    >Chart</button>
                    <button
                      className="btn btn-sm"
                      style={{ background: !chartView ? '#ede9fe' : 'white', border: '1px solid', borderColor: !chartView ? '#6366f1' : '#e5e7eb', color: !chartView ? '#4f46e5' : '#374151' }}
                      onClick={() => setChartView(false)}
                    >Table</button>
                    <button className="btn btn-sm" style={{ background: 'white', border: '1px solid #e5e7eb' }}
                      onClick={() => exportCSV(result.rows, result.metric_label, result.group_label)}>
                      ↓ CSV
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowSave(true)}>
                      Save Report
                    </button>
                  </div>
                </div>
              </div>

              {/* Summary stat cards */}
              {result.rows.length > 0 && (
                <div className="stats-row" style={{ marginBottom: 16 }}>
                  <div className="stat-card">
                    <div className="stat-value" style={{ fontSize: 20 }}>{fmtValue(result.total, config.metric)}</div>
                    <div className="stat-label">Total</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value" style={{ fontSize: 20 }}>{result.rows.length}</div>
                    <div className="stat-label">Groups</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value" style={{ fontSize: 18 }}>
                      {fmtValue(result.rows[0].value, config.metric)}
                    </div>
                    <div className="stat-label">Highest: {result.rows[0].label}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value" style={{ fontSize: 18 }}>
                      {fmtValue(Math.round(result.total / result.rows.length), config.metric)}
                    </div>
                    <div className="stat-label">Average per group</div>
                  </div>
                </div>
              )}

              {/* Chart or Table */}
              <div className="card">
                {result.rows.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-label">No data for this configuration</div>
                  </div>
                ) : chartView ? (
                  <BarChart rows={result.rows} metricKey={config.metric} />
                ) : (
                  <ResultsTable
                    rows={result.rows}
                    metricKey={config.metric}
                    metricLabel={result.metric_label}
                    groupLabel={result.group_label}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
