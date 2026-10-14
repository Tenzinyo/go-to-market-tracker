import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'

// ── Human-readable descriptions ───────────────────────────────────────────────

function describeTrigger(wf, meta) {
  const cfg = JSON.parse(wf.trigger_config || '{}')

  switch (wf.trigger_type) {
    case 'stage_changed': {
      const entity = cfg.entity ? (cfg.entity === 'deal' ? 'deal' : 'account') : 'account or deal'
      const stage  = meta.stages?.find(s => s.id === Number(cfg.stage_id))
      return stage
        ? `When a ${entity} moves to "${stage.name}"`
        : `When a ${entity} moves to any stage`
    }
    case 'lifecycle_changed': {
      const LABELS = { lead: 'Lead', mql: 'MQL', sql: 'SQL', opportunity: 'Opportunity', customer: 'Customer', churned: 'Churned' }
      return cfg.lifecycle_stage
        ? `When lifecycle changes to "${LABELS[cfg.lifecycle_stage] ?? cfg.lifecycle_stage}"`
        : 'When lifecycle stage changes (any)'
    }
    case 'deal_created':
      return 'When any new deal is created'
    case 'inactivity_days':
      return `When an account has no activity for ${cfg.days ?? 14} days`
    default:
      return wf.trigger_type
  }
}

function describeAction(wf, meta) {
  const cfg = JSON.parse(wf.action_config || '{}')

  switch (wf.action_type) {
    case 'create_task': {
      const title    = cfg.title || 'Follow up'
      const priority = cfg.priority || 'medium'
      const due      = cfg.due_offset_days ? `, due in ${cfg.due_offset_days}d` : ''
      const assignee = meta.users?.find(u => u.id === Number(cfg.assignee_id))
      const who      = assignee ? ` → ${assignee.display_name}` : ''
      return `Create task: "${title}" (${priority}${due}${who})`
    }
    case 'advance_lifecycle':
      return 'Advance lifecycle to next stage'
    default:
      return wf.action_type
  }
}

// ── Workflow Form ─────────────────────────────────────────────────────────────

const LIFECYCLE_STAGES = ['lead', 'mql', 'sql', 'opportunity', 'customer', 'churned']
const LIFECYCLE_LABELS = { lead: 'Lead', mql: 'MQL', sql: 'SQL', opportunity: 'Opportunity', customer: 'Customer', churned: 'Churned' }

function WorkflowModal({ workflow, meta, onClose, onSaved }) {
  const editing = !!workflow

  const [name, setName]               = useState(workflow?.name ?? '')
  const [triggerType, setTriggerType] = useState(workflow?.trigger_type ?? 'stage_changed')
  const [triggerCfg, setTriggerCfg]   = useState(() => {
    try { return JSON.parse(workflow?.trigger_config || '{}') } catch { return {} }
  })
  const [actionType, setActionType]   = useState(workflow?.action_type ?? 'create_task')
  const [actionCfg, setActionCfg]     = useState(() => {
    try { return JSON.parse(workflow?.action_config || '{}') } catch { return {} }
  })
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')

  function setTC(k, v) { setTriggerCfg(c => ({ ...c, [k]: v })) }
  function setAC(k, v) { setActionCfg(c => ({ ...c, [k]: v })) }

  // Reset trigger config when trigger type changes
  function changeTriggerType(t) {
    setTriggerType(t)
    setTriggerCfg({})
  }

  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')
    try {
      if (editing) {
        await api.patch(`/workflows/${workflow.id}`, {
          name, trigger_type: triggerType, trigger_config: triggerCfg,
          action_type: actionType, action_config: actionCfg,
        })
      } else {
        await api.post('/workflows', {
          name, trigger_type: triggerType, trigger_config: triggerCfg,
          action_type: actionType, action_config: actionCfg,
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
        background: '#fff', borderRadius: 12, padding: 28, width: 540,
        maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
            {editing ? 'Edit Workflow' : 'New Workflow'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>×</button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Name */}
          <div>
            <label className="form-label">Workflow Name *</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Create follow-up when deal moves to Proposal" autoFocus />
          </div>

          {/* Trigger */}
          <div style={{ background: '#f8fafc', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              When (Trigger)
            </div>

            <div>
              <label className="form-label">Trigger Type</label>
              <select className="form-input" value={triggerType} onChange={e => changeTriggerType(e.target.value)}>
                {meta.triggers?.map(t => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                {meta.triggers?.find(t => t.key === triggerType)?.description}
              </div>
            </div>

            {/* Stage changed config */}
            {triggerType === 'stage_changed' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="form-label">Entity</label>
                  <select className="form-input" value={triggerCfg.entity ?? ''} onChange={e => setTC('entity', e.target.value || undefined)}>
                    <option value="">Both accounts & deals</option>
                    <option value="account">Account only</option>
                    <option value="deal">Deal only</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Stage (leave blank = any)</label>
                  <select className="form-input" value={triggerCfg.stage_id ?? ''} onChange={e => setTC('stage_id', e.target.value ? Number(e.target.value) : undefined)}>
                    <option value="">Any stage</option>
                    {meta.stages?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* Lifecycle changed config */}
            {triggerType === 'lifecycle_changed' && (
              <div>
                <label className="form-label">Target Lifecycle Stage (leave blank = any)</label>
                <select className="form-input" value={triggerCfg.lifecycle_stage ?? ''} onChange={e => setTC('lifecycle_stage', e.target.value || undefined)}>
                  <option value="">Any lifecycle change</option>
                  {LIFECYCLE_STAGES.map(s => <option key={s} value={s}>{LIFECYCLE_LABELS[s]}</option>)}
                </select>
              </div>
            )}

            {/* Inactivity config */}
            {triggerType === 'inactivity_days' && (
              <div>
                <label className="form-label">Days of inactivity</label>
                <input
                  className="form-input"
                  type="number" min={1} max={365}
                  value={triggerCfg.days ?? 14}
                  onChange={e => setTC('days', Number(e.target.value))}
                  style={{ width: 120 }}
                />
              </div>
            )}
          </div>

          {/* Action */}
          <div style={{ background: '#f0fdf4', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Then (Action)
            </div>

            <div>
              <label className="form-label">Action Type</label>
              <select className="form-input" value={actionType} onChange={e => { setActionType(e.target.value); setActionCfg({}) }}>
                {meta.actions?.map(a => (
                  <option key={a.key} value={a.key}>{a.label}</option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                {meta.actions?.find(a => a.key === actionType)?.description}
              </div>
            </div>

            {/* Create task config */}
            {actionType === 'create_task' && (
              <>
                <div>
                  <label className="form-label">Task Title</label>
                  <input
                    className="form-input"
                    value={actionCfg.title ?? ''}
                    onChange={e => setAC('title', e.target.value)}
                    placeholder="Follow up with {{account_name}}"
                  />
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>
                    Use <code style={{ background: '#f3f4f6', padding: '1px 4px', borderRadius: 3 }}>{'{{account_name}}'}</code> or <code style={{ background: '#f3f4f6', padding: '1px 4px', borderRadius: 3 }}>{'{{deal_name}}'}</code> as placeholders
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div>
                    <label className="form-label">Priority</label>
                    <select className="form-input" value={actionCfg.priority ?? 'medium'} onChange={e => setAC('priority', e.target.value)}>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Due in (days)</label>
                    <input
                      className="form-input"
                      type="number" min={0} max={365}
                      value={actionCfg.due_offset_days ?? 1}
                      onChange={e => setAC('due_offset_days', Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="form-label">Assign to</label>
                    <select className="form-input" value={actionCfg.assignee_id ?? ''} onChange={e => setAC('assignee_id', e.target.value ? Number(e.target.value) : null)}>
                      <option value="">Unassigned</option>
                      {meta.users?.map(u => <option key={u.id} value={u.id}>{u.display_name}</option>)}
                    </select>
                  </div>
                </div>
              </>
            )}
          </div>

          {error && <div style={{ color: '#dc2626', fontSize: 13 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn" style={{ background: 'white', border: '1px solid #e5e7eb' }} onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Workflow'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Workflow Card ─────────────────────────────────────────────────────────────

function WorkflowCard({ wf, meta, onEdit, onDelete, onToggle }) {
  const [toggling, setToggling] = useState(false)

  async function toggle() {
    setToggling(true)
    try { await onToggle(wf) }
    finally { setToggling(false) }
  }

  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
      padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: 16,
      opacity: wf.enabled ? 1 : 0.65,
    }}>
      {/* Enable toggle */}
      <div style={{ paddingTop: 2 }}>
        <label style={{ position: 'relative', display: 'inline-block', width: 36, height: 20, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!wf.enabled}
            onChange={toggle}
            disabled={toggling}
            style={{ opacity: 0, width: 0, height: 0 }}
          />
          <span style={{
            position: 'absolute', inset: 0, borderRadius: 99, transition: '0.2s',
            background: wf.enabled ? '#6366f1' : '#d1d5db',
          }} />
          <span style={{
            position: 'absolute', left: wf.enabled ? 18 : 2, top: 2,
            width: 16, height: 16, borderRadius: '50%', background: '#fff',
            transition: '0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }} />
        </label>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: '#111827', marginBottom: 8 }}>{wf.name}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <span style={{
            fontSize: 12, padding: '3px 10px', borderRadius: 99,
            background: '#ede9fe', color: '#6d28d9', fontWeight: 500,
          }}>
            {describeTrigger(wf, meta)}
          </span>
          <span style={{ fontSize: 12, color: '#6b7280', paddingTop: 2 }}>→</span>
          <span style={{
            fontSize: 12, padding: '3px 10px', borderRadius: 99,
            background: '#dcfce7', color: '#16a34a', fontWeight: 500,
          }}>
            {describeAction(wf, meta)}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          onClick={() => onEdit(wf)}
          className="btn btn-sm"
          style={{ background: 'white', border: '1px solid #e5e7eb', fontSize: 12 }}
        >Edit</button>
        <button
          onClick={() => onDelete(wf)}
          className="btn btn-sm"
          style={{ background: 'white', border: '1px solid #fecaca', color: '#dc2626', fontSize: 12 }}
        >Delete</button>
      </div>
    </div>
  )
}

// ── Run Log ───────────────────────────────────────────────────────────────────

function RunLog({ runs }) {
  if (runs.length === 0) return (
    <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: 13 }}>
      No workflow runs yet. Workflows fire automatically when triggers are matched.
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {runs.map((r, i) => {
        const data = (() => { try { return JSON.parse(r.trigger_data || '{}') } catch { return {} } })()
        return (
          <div key={r.id} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '9px 4px',
            borderBottom: i < runs.length - 1 ? '1px solid #f3f4f6' : 'none',
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              background: r.status === 'ok' ? '#16a34a' : '#dc2626',
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>{r.workflow_name}</span>
              {data.account_name && (
                <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 8 }}>for {data.account_name}</span>
              )}
              {data.deal_name && (
                <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 8 }}>deal: {data.deal_name}</span>
              )}
              {r.error_msg && (
                <div style={{ fontSize: 11, color: '#dc2626', marginTop: 2 }}>{r.error_msg}</div>
              )}
            </div>
            <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>
              {new Date(r.ran_at).toLocaleString()}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Workflows() {
  const [workflows, setWorkflows] = useState([])
  const [runs,      setRuns]      = useState([])
  const [meta,      setMeta]      = useState({ triggers: [], actions: [], stages: [], users: [] })
  const [loading,   setLoading]   = useState(true)
  const [showNew,   setShowNew]   = useState(false)
  const [editing,   setEditing]   = useState(null)
  const [showRuns,  setShowRuns]  = useState(false)

  const load = useCallback(() => {
    Promise.all([
      api.get('/workflows'),
      api.get('/workflows/meta'),
      api.get('/workflows/runs?limit=30'),
    ]).then(([wfData, metaData, runData]) => {
      setWorkflows(wfData.workflows)
      setMeta(metaData)
      setRuns(runData.runs)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function handleToggle(wf) {
    await api.patch(`/workflows/${wf.id}`, { enabled: !wf.enabled })
    load()
  }

  async function handleDelete(wf) {
    if (!confirm(`Delete workflow "${wf.name}"? This also clears its run log.`)) return
    await api.del(`/workflows/${wf.id}`)
    load()
  }

  const enabled  = workflows.filter(w => w.enabled)
  const disabled = workflows.filter(w => !w.enabled)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Workflows</h1>
          <p className="page-subtitle">Automate tasks and updates when key events happen in your pipeline</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn"
            style={{ background: 'white', border: '1px solid #e5e7eb' }}
            onClick={() => setShowRuns(s => !s)}
          >
            {showRuns ? 'Hide' : 'View'} Run Log ({runs.length})
          </button>
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ New Workflow</button>
        </div>
      </div>

      {(showNew || editing) && (
        <WorkflowModal
          workflow={editing}
          meta={meta}
          onClose={() => { setShowNew(false); setEditing(null) }}
          onSaved={load}
        />
      )}

      {/* Stats */}
      <div className="stats-row" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-value">{workflows.length}</div>
          <div className="stat-label">Total workflows</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#16a34a' }}>{enabled.length}</div>
          <div className="stat-label">Active</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{runs.filter(r => r.status === 'ok').length}</div>
          <div className="stat-label">Successful runs (last 30)</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: runs.some(r => r.status === 'error') ? '#dc2626' : undefined }}>
            {runs.filter(r => r.status === 'error').length}
          </div>
          <div className="stat-label">Errors (last 30)</div>
        </div>
      </div>

      {/* Run log */}
      {showRuns && (
        <div className="card mb-4">
          <div className="card-title">Recent Run Log</div>
          <RunLog runs={runs} />
        </div>
      )}

      {loading ? (
        <div className="loading">Loading workflows…</div>
      ) : workflows.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
          <div style={{ fontWeight: 600, color: '#374151', marginBottom: 6 }}>No workflows yet</div>
          <div className="text-muted text-sm" style={{ marginBottom: 20 }}>
            Workflows automatically create tasks, advance lifecycle stages, and more — triggered by events in your pipeline.
          </div>
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ Create your first workflow</button>
        </div>
      ) : (
        <>
          {enabled.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                Active ({enabled.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {enabled.map(wf => (
                  <WorkflowCard
                    key={wf.id}
                    wf={wf}
                    meta={meta}
                    onEdit={setEditing}
                    onDelete={handleDelete}
                    onToggle={handleToggle}
                  />
                ))}
              </div>
            </div>
          )}

          {disabled.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                Disabled ({disabled.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {disabled.map(wf => (
                  <WorkflowCard
                    key={wf.id}
                    wf={wf}
                    meta={meta}
                    onEdit={setEditing}
                    onDelete={handleDelete}
                    onToggle={handleToggle}
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
