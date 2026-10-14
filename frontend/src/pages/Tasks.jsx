import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useSSE } from '../hooks/useSSE'
import { useUser } from '../App'

const REFRESH_EVENTS = new Set(['task_created', 'task_updated', 'task_deleted'])

const PRIORITY = {
  high:   { label: 'High',   color: '#dc2626', bg: '#fee2e2', dot: '#ef4444' },
  medium: { label: 'Medium', color: '#d97706', bg: '#fef3c7', dot: '#f59e0b' },
  low:    { label: 'Low',    color: '#6b7280', bg: '#f3f4f6', dot: '#9ca3af' },
}

const STATUS = {
  open:        { label: 'Open',        color: '#4f46e5', bg: '#ede9fe' },
  in_progress: { label: 'In Progress', color: '#0369a1', bg: '#e0f2fe' },
  done:        { label: 'Done',        color: '#16a34a', bg: '#dcfce7' },
  cancelled:   { label: 'Cancelled',   color: '#6b7280', bg: '#f3f4f6' },
}

function PriorityDot({ priority }) {
  const p = PRIORITY[priority] ?? PRIORITY.medium
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: p.dot, flexShrink: 0,
    }} title={p.label} />
  )
}

function StatusBadge({ status }) {
  const s = STATUS[status] ?? STATUS.open
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99,
      background: s.bg, color: s.color,
    }}>{s.label}</span>
  )
}

// ── Quick-add task form ────────────────────────────────────────────────────────
function QuickAddForm({ accounts, users, currentUser, onAdded, onCancel }) {
  const [form, setForm] = useState({
    title: '', due_date: '', priority: 'medium', assignee_id: currentUser?.id ?? '',
    account_id: '', description: '',
  })
  const [saving, setSaving] = useState(false)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function submit(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    try {
      await api.post('/tasks', {
        ...form,
        assignee_id: form.assignee_id || null,
        account_id:  form.account_id  || null,
        created_by:  currentUser?.id  ?? null,
      })
      onAdded()
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={submit} style={{
      background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10,
      padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <input
        className="form-input"
        autoFocus
        required
        placeholder="Task title…"
        value={form.title}
        onChange={e => set('title', e.target.value)}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <div>
          <label className="form-label">Due Date</label>
          <input className="form-input" type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
        </div>
        <div>
          <label className="form-label">Priority</label>
          <select className="form-input" value={form.priority} onChange={e => set('priority', e.target.value)}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div>
          <label className="form-label">Assignee</label>
          <select className="form-input" value={form.assignee_id} onChange={e => set('assignee_id', e.target.value)}>
            <option value="">Unassigned</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.display_name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Account</label>
          <select className="form-input" value={form.account_id} onChange={e => set('account_id', e.target.value)}>
            <option value="">None</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
          {saving ? 'Adding…' : 'Add Task'}
        </button>
        <button type="button" className="btn btn-sm" style={{ background: 'white', border: '1px solid #e5e7eb' }} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

// ── Single task row ────────────────────────────────────────────────────────────
function TaskRow({ task, onToggleDone, onDelete }) {
  const today     = new Date().toISOString().split('T')[0]
  const isDone    = task.status === 'done' || task.status === 'cancelled'
  const isOverdue = task.due_date && task.due_date < today && !isDone

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '11px 14px', borderBottom: '1px solid #f3f4f6',
      opacity: isDone ? 0.55 : 1,
    }}>
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={task.status === 'done'}
        onChange={() => onToggleDone(task)}
        style={{ marginTop: 3, accentColor: '#4f46e5', cursor: 'pointer', flexShrink: 0 }}
      />

      {/* Priority dot */}
      <div style={{ marginTop: 5 }}>
        <PriorityDot priority={task.priority} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 500, fontSize: 14,
          textDecoration: isDone ? 'line-through' : 'none',
          color: isDone ? '#9ca3af' : '#111827',
        }}>
          {task.title}
        </div>
        {task.description && (
          <div className="text-muted text-xs" style={{ marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {task.description}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          {task.account_name && (
            <Link to={`/accounts/${task.account_id}`} style={{ fontSize: 11, color: '#6b7280' }}>
              ◎ {task.account_name}
            </Link>
          )}
          {task.deal_name && (
            <Link to={`/deals/${task.deal_id}`} style={{ fontSize: 11, color: '#6b7280' }}>
              ◇ {task.deal_name}
            </Link>
          )}
          {task.assignee_name && (
            <span style={{ fontSize: 11, color: '#9ca3af' }}>→ {task.assignee_name}</span>
          )}
        </div>
      </div>

      {/* Due date */}
      <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 80 }}>
        {task.due_date && (
          <div style={{ fontSize: 12, fontWeight: 500, color: isOverdue ? '#ef4444' : '#6b7280' }}>
            {isOverdue ? 'Overdue · ' : ''}
            {new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
        )}
        <StatusBadge status={task.status} />
      </div>

      {/* Delete */}
      <button
        onClick={() => onDelete(task.id)}
        style={{ background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: 16, padding: '0 2px', flexShrink: 0 }}
        title="Delete task"
      >
        ×
      </button>
    </div>
  )
}

// ── Group header ──────────────────────────────────────────────────────────────
function GroupHeader({ label, count, color = '#6b7280', bg = '#f9fafb' }) {
  return (
    <div style={{
      padding: '6px 14px', background: bg, borderBottom: '1px solid #e5e7eb',
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontSize: 11, background: color, color: '#fff', borderRadius: 99, padding: '0px 6px', fontWeight: 700 }}>{count}</span>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Tasks() {
  const { currentUser } = useUser()
  const [tasks,    setTasks]    = useState([])
  const [counts,   setCounts]   = useState(null)
  const [users,    setUsers]    = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [showAdd,  setShowAdd]  = useState(false)

  const [filters, setFilters] = useState({
    status: '', priority: '', assignee_id: '', account_id: '', q: '',
  })

  useEffect(() => {
    Promise.all([api.get('/users'), api.get('/accounts?limit=500')])
      .then(([u, a]) => { setUsers(u.users); setAccounts(a.accounts) })
      .catch(() => {})
  }, [])

  const load = useCallback(() => {
    const p = new URLSearchParams({ limit: '500' })
    if (filters.status)      p.set('status',      filters.status)
    if (filters.priority)    p.set('priority',    filters.priority)
    if (filters.assignee_id) p.set('assignee_id', filters.assignee_id)
    if (filters.account_id)  p.set('account_id',  filters.account_id)
    if (filters.q)           p.set('q',           filters.q)
    api.get(`/tasks?${p}`)
      .then(d => { setTasks(d.tasks); setCounts(d.counts); setLoading(false) })
      .catch(() => setLoading(false))
  }, [filters])

  useEffect(() => { load() }, [load])
  useSSE(event => { if (REFRESH_EVENTS.has(event.type)) load() })

  function setFilter(k, v) { setFilters(f => ({ ...f, [k]: v })) }
  const hasFilters = Object.values(filters).some(Boolean)

  async function toggleDone(task) {
    const newStatus = task.status === 'done' ? 'open' : 'done'
    await api.patch(`/tasks/${task.id}`, { status: newStatus })
    load()
  }

  async function deleteTask(id) {
    if (!confirm('Delete this task?')) return
    await api.del(`/tasks/${id}`)
    load()
  }

  // Group active (non-done/cancelled) tasks
  const today     = new Date().toISOString().split('T')[0]
  const weekEnd   = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]

  const active    = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled')
  const completed = tasks.filter(t => t.status === 'done' || t.status === 'cancelled')

  const overdue   = active.filter(t => t.due_date && t.due_date < today)
  const dueToday  = active.filter(t => t.due_date === today)
  const thisWeek  = active.filter(t => t.due_date && t.due_date > today && t.due_date <= weekEnd)
  const upcoming  = active.filter(t => t.due_date && t.due_date > weekEnd)
  const noDueDate = active.filter(t => !t.due_date)

  const groups = [
    { key: 'overdue',  label: 'Overdue',      items: overdue,   color: '#dc2626', bg: '#fef2f2' },
    { key: 'today',    label: 'Due Today',     items: dueToday,  color: '#d97706', bg: '#fffbeb' },
    { key: 'week',     label: 'This Week',     items: thisWeek,  color: '#0369a1', bg: '#f0f9ff' },
    { key: 'upcoming', label: 'Upcoming',      items: upcoming,  color: '#4f46e5', bg: '#f5f3ff' },
    { key: 'none',     label: 'No Due Date',   items: noDueDate, color: '#6b7280', bg: '#f9fafb' },
  ].filter(g => g.items.length > 0 || (!hasFilters && g.key === 'none'))

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-subtitle">{tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled').length} open task{tasks.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(s => !s)}>
          {showAdd ? '× Cancel' : '+ New Task'}
        </button>
      </div>

      {/* Stats row */}
      {counts && (
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-value">{counts.open_count ?? 0}</div>
            <div className="stat-label">Open tasks</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: (counts.overdue_count ?? 0) > 0 ? '#dc2626' : undefined }}>
              {counts.overdue_count ?? 0}
            </div>
            <div className="stat-label">Overdue</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: (counts.due_today_count ?? 0) > 0 ? '#d97706' : undefined }}>
              {counts.due_today_count ?? 0}
            </div>
            <div className="stat-label">Due today</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#16a34a' }}>{counts.done_this_week ?? 0}</div>
            <div className="stat-label">Completed this week</div>
          </div>
        </div>
      )}

      {/* Quick-add form */}
      {showAdd && (
        <QuickAddForm
          accounts={accounts}
          users={users}
          currentUser={currentUser}
          onAdded={() => { load(); setShowAdd(false) }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {/* Filters */}
      <div className="filter-bar">
        <input className="search-input" placeholder="Search tasks…" value={filters.q}
          onChange={e => setFilter('q', e.target.value)} />
        <select className="filter-select" value={filters.status} onChange={e => setFilter('status', e.target.value)}>
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select className="filter-select" value={filters.priority} onChange={e => setFilter('priority', e.target.value)}>
          <option value="">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select className="filter-select" value={filters.assignee_id} onChange={e => setFilter('assignee_id', e.target.value)}>
          <option value="">All assignees</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.display_name}</option>)}
        </select>
        <select className="filter-select" value={filters.account_id} onChange={e => setFilter('account_id', e.target.value)}>
          <option value="">All accounts</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        {hasFilters && (
          <button className="btn btn-secondary btn-sm" onClick={() => setFilters({ status: '', priority: '', assignee_id: '', account_id: '', q: '' })}>
            Clear
          </button>
        )}
      </div>

      {/* Task groups */}
      {loading ? (
        <div className="loading">Loading tasks…</div>
      ) : active.length === 0 && completed.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">✓</div>
            <div className="empty-label">{hasFilters ? 'No tasks match your filters' : 'No tasks yet — create your first task'}</div>
          </div>
        </div>
      ) : (
        <>
          {groups.map(g => g.items.length > 0 && (
            <div key={g.key} className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
              <GroupHeader label={g.label} count={g.items.length} color={g.color} bg={g.bg} />
              {g.items.map(task => (
                <TaskRow key={task.id} task={task} onToggleDone={toggleDone} onDelete={deleteTask} />
              ))}
            </div>
          ))}

          {/* Completed section (collapsed by default if many) */}
          {completed.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <GroupHeader label="Completed / Cancelled" count={completed.length} color="#6b7280" bg="#f9fafb" />
              {completed.slice(0, 10).map(task => (
                <TaskRow key={task.id} task={task} onToggleDone={toggleDone} onDelete={deleteTask} />
              ))}
              {completed.length > 10 && (
                <div style={{ padding: '8px 14px', fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>
                  +{completed.length - 10} more completed tasks
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
