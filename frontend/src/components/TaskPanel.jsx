/**
 * TaskPanel — compact task list for AccountDetail / DealDetail
 *
 * Props:
 *   accountId   — filter by account (optional)
 *   dealId      — filter by deal (optional)
 *   currentUser — { id, display_name }
 *   users       — [{ id, display_name }]
 */
import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import { useSSE } from '../hooks/useSSE'

const PRIORITY_DOT = {
  high:   '#ef4444',
  medium: '#f59e0b',
  low:    '#9ca3af',
}

const PRIORITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' }

export default function TaskPanel({ accountId, dealId, currentUser, users = [] }) {
  const [tasks,   setTasks]   = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [form,    setForm]    = useState({ title: '', due_date: '', priority: 'medium', assignee_id: currentUser?.id ?? '' })
  const [saving,  setSaving]  = useState(false)

  const load = useCallback(() => {
    const p = new URLSearchParams({ limit: '50' })
    if (accountId) p.set('account_id', accountId)
    if (dealId)    p.set('deal_id',    dealId)
    api.get(`/tasks?${p}`).then(d => setTasks(d.tasks)).catch(() => {})
  }, [accountId, dealId])

  useEffect(() => { load() }, [load])

  useSSE(event => {
    if (['task_created','task_updated','task_deleted'].includes(event.type)) {
      const d = event.data
      if ((accountId && String(d?.account_id) === String(accountId)) ||
          (dealId    && String(d?.deal_id)    === String(dealId))) {
        load()
      }
    }
  })

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function addTask(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    try {
      await api.post('/tasks', {
        title:       form.title.trim(),
        due_date:    form.due_date    || null,
        priority:    form.priority,
        assignee_id: form.assignee_id || null,
        account_id:  accountId        ?? null,
        deal_id:     dealId           ?? null,
        created_by:  currentUser?.id  ?? null,
      })
      setForm({ title: '', due_date: '', priority: 'medium', assignee_id: currentUser?.id ?? '' })
      setShowAdd(false)
      load()
    } finally { setSaving(false) }
  }

  async function toggleDone(task) {
    const newStatus = task.status === 'done' ? 'open' : 'done'
    await api.patch(`/tasks/${task.id}`, { status: newStatus })
    load()
  }

  async function deleteTask(id) {
    await api.del(`/tasks/${id}`)
    load()
  }

  const open      = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled')
  const completed = tasks.filter(t => t.status === 'done' || t.status === 'cancelled')
  const today     = new Date().toISOString().split('T')[0]

  return (
    <div className="card mt-3">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div className="card-title" style={{ margin: 0 }}>Tasks ({open.length} open)</div>
        <button
          className="btn btn-sm"
          style={{ background: 'white', border: '1px solid #e5e7eb' }}
          onClick={() => setShowAdd(s => !s)}
        >
          {showAdd ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={addTask} style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            className="form-input"
            autoFocus
            required
            placeholder="Task title…"
            value={form.title}
            onChange={e => setField('title', e.target.value)}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div>
              <label className="form-label">Due</label>
              <input className="form-input" type="date" value={form.due_date} onChange={e => setField('due_date', e.target.value)} />
            </div>
            <div>
              <label className="form-label">Priority</label>
              <select className="form-input" value={form.priority} onChange={e => setField('priority', e.target.value)}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="form-label">Assignee</label>
              <select className="form-input" value={form.assignee_id} onChange={e => setField('assignee_id', e.target.value)}>
                <option value="">Unassigned</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.display_name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <button className="btn btn-primary btn-sm" type="submit" disabled={saving}>
              {saving ? 'Adding…' : 'Add Task'}
            </button>
          </div>
        </form>
      )}

      {tasks.length === 0 ? (
        <div className="text-muted text-sm">No tasks yet.</div>
      ) : (
        <ul className="alert-list" style={{ gap: 0 }}>
          {open.map(t => {
            const isOverdue = t.due_date && t.due_date < today
            return (
              <li key={t.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '7px 0', borderBottom: '1px solid #f3f4f6',
              }}>
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => toggleDone(t)}
                  style={{ marginTop: 3, accentColor: '#4f46e5', cursor: 'pointer', flexShrink: 0 }}
                />
                <span style={{
                  display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                  background: PRIORITY_DOT[t.priority] ?? '#9ca3af', marginTop: 5, flexShrink: 0,
                }} title={PRIORITY_LABEL[t.priority]} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{t.title}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                    {t.assignee_name && <span className="text-muted text-xs">→ {t.assignee_name}</span>}
                    {t.due_date && (
                      <span style={{ fontSize: 11, color: isOverdue ? '#ef4444' : '#6b7280' }}>
                        {isOverdue ? 'Overdue · ' : ''}
                        {new Date(t.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => deleteTask(t.id)}
                  style={{ background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: 15, padding: 0, flexShrink: 0 }}
                >×</button>
              </li>
            )
          })}
          {completed.length > 0 && (
            <li style={{ padding: '6px 0' }}>
              <details>
                <summary style={{ fontSize: 12, color: '#9ca3af', cursor: 'pointer', userSelect: 'none' }}>
                  {completed.length} completed
                </summary>
                {completed.map(t => (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 0', opacity: 0.5,
                  }}>
                    <input type="checkbox" checked={true} onChange={() => toggleDone(t)}
                      style={{ accentColor: '#4f46e5', cursor: 'pointer' }} />
                    <span style={{ fontSize: 13, textDecoration: 'line-through', color: '#9ca3af' }}>{t.title}</span>
                  </div>
                ))}
              </details>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
