import { useState, useEffect } from 'react'
import { api } from '../api'
import { usePermissions } from '../hooks/usePermissions'
import { useUser } from '../App'

const ROLE_COLORS = {
  admin:   { color: '#7c3aed', bg: '#f5f3ff', label: 'Admin' },
  manager: { color: '#1d4ed8', bg: '#eff6ff', label: 'Manager' },
  rep:     { color: '#374151', bg: '#f3f4f6', label: 'Rep' },
}

function RoleBadge({ role }) {
  const m = ROLE_COLORS[role] ?? ROLE_COLORS.rep
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
      background: m.bg, color: m.color, border: `1px solid ${m.color}33`,
    }}>{m.label}</span>
  )
}

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Vancouver', 'Europe/London', 'Europe/Paris',
  'Europe/Berlin', 'Asia/Tokyo', 'Asia/Singapore', 'Asia/Hong_Kong',
  'Australia/Sydney', 'Pacific/Auckland',
]

// ── Team Tab ──────────────────────────────────────────────────────────────────

function UserRow({ user, canManage, onSaved, onDelete }) {
  const [editingEmail, setEditingEmail] = useState(false)
  const [email, setEmail]               = useState(user.email ?? '')
  const [saving, setSaving]             = useState(false)
  const [roleChanging, setRoleChanging] = useState(false)

  async function saveEmail() {
    setSaving(true)
    try {
      await api.patch(`/users/${user.id}`, { email: email.trim() })
      setEditingEmail(false)
      onSaved()
    } catch {} finally { setSaving(false) }
  }

  async function changeRole(role) {
    setRoleChanging(true)
    try {
      await api.patch(`/users/${user.id}/role`, { role })
      onSaved()
    } catch (err) {
      alert(err.message)
    } finally {
      setRoleChanging(false)
    }
  }

  return (
    <tr>
      <td style={{ fontWeight: 500 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {user.display_name}
          <RoleBadge role={user.role ?? 'rep'} />
        </div>
      </td>
      <td className="text-muted text-sm">{user.timezone}</td>
      <td>
        {editingEmail ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              className="form-input"
              style={{ padding: '4px 8px', fontSize: 13, width: 200 }}
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="email@company.com"
              autoFocus
            />
            <button className="btn btn-primary btn-sm" onClick={saveEmail} disabled={saving}>
              {saving ? '…' : 'Save'}
            </button>
            <button className="btn btn-sm" style={{ background: 'white', border: '1px solid #e5e7eb' }}
              onClick={() => { setEditingEmail(false); setEmail(user.email ?? '') }}>
              Cancel
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={user.email ? 'text-sm' : 'text-muted text-sm'}>
              {user.email || 'No email — no notifications'}
            </span>
            <button className="btn btn-sm" style={{ background: 'white', border: '1px solid #e5e7eb' }}
              onClick={() => setEditingEmail(true)}>
              {user.email ? 'Edit' : 'Add'}
            </button>
          </div>
        )}
      </td>
      {canManage && (
        <td>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select
              className="form-input"
              style={{ padding: '3px 8px', fontSize: 12, width: 100 }}
              value={user.role ?? 'rep'}
              onChange={e => changeRole(e.target.value)}
              disabled={roleChanging}
            >
              <option value="rep">Rep</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
            <button
              className="btn btn-sm"
              style={{ background: 'white', border: '1px solid #fecaca', color: '#dc2626', fontSize: 11 }}
              onClick={() => onDelete(user)}
            >Remove</button>
          </div>
        </td>
      )}
    </tr>
  )
}

function TeamTab() {
  const [users, setUsers]       = useState([])
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [timezone, setTimezone] = useState('America/New_York')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const { can, isAdmin }        = usePermissions()
  const { currentUser }         = useUser()

  function load() {
    api.get('/users').then(d => setUsers(d.users)).catch(() => {})
  }
  useEffect(() => { load() }, [])

  async function addUser(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true); setError('')
    try {
      await api.post('/users', { display_name: name.trim(), email: email.trim() || undefined, timezone })
      setName(''); setEmail('')
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteUser(user) {
    if (user.id === currentUser?.id) { alert('You cannot remove yourself.'); return }
    if (!confirm(`Remove "${user.display_name}" from the team?`)) return
    try {
      await api.del(`/users/${user.id}`)
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <div className="card-title" style={{ margin: 0 }}>Team Members</div>
          <div className="text-muted text-xs">Email required for activity notifications</div>
        </div>
        {users.length === 0 ? (
          <div className="text-muted text-sm">No users yet.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Timezone</th>
                <th>Notification Email</th>
                {isAdmin && <th>Role & Access</th>}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <UserRow
                  key={u.id}
                  user={u}
                  canManage={isAdmin}
                  onSaved={load}
                  onDelete={deleteUser}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="card-title">Add Team Member</div>
        <form onSubmit={addUser} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="form-label">Name</label>
              <input className="form-input" placeholder="e.g. Jordan Lee"
                value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div>
              <label className="form-label">Email <span className="text-muted text-xs">(for notifications)</span></label>
              <input className="form-input" type="email" placeholder="jordan@company.com"
                value={email} onChange={e => setEmail(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="form-label">Timezone</label>
            <select className="form-input" value={timezone} onChange={e => setTimezone(e.target.value)}>
              {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
          {error && <div style={{ color: '#ef4444', fontSize: 13 }}>{error}</div>}
          <div>
            <button className="btn btn-primary" disabled={saving}>
              {saving ? 'Adding…' : 'Add Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Stages Tab ────────────────────────────────────────────────────────────────

function StageRow({ stage, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [name, setName]       = useState(stage.name)
  const [color, setColor]     = useState(stage.color_hex)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  async function save() {
    setSaving(true); setError('')
    try {
      await api.patch(`/stages/${stage.id}`, { name: name.trim(), color_hex: color })
      setEditing(false)
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!confirm(`Delete stage "${stage.name}"? Accounts in this stage must be moved first.`)) return
    try {
      await api.del(`/stages/${stage.id}`)
      onSaved()
    } catch (err) {
      alert(err.message)
    }
  }

  if (editing) {
    return (
      <tr>
        <td>
          <input
            className="form-input"
            style={{ padding: '5px 8px', fontSize: 13 }}
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </td>
        <td>
          <input type="color" value={color} onChange={e => setColor(e.target.value)}
            style={{ width: 36, height: 28, border: 'none', cursor: 'pointer', borderRadius: 4 }} />
        </td>
        <td>
          {error && <span style={{ color: '#ef4444', fontSize: 12, marginRight: 8 }}>{error}</span>}
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving} style={{ marginRight: 6 }}>
            {saving ? '…' : 'Save'}
          </button>
          <button className="btn btn-sm" style={{ background: 'white', border: '1px solid #e5e7eb' }}
            onClick={() => { setEditing(false); setName(stage.name); setColor(stage.color_hex) }}>
            Cancel
          </button>
        </td>
      </tr>
    )
  }

  return (
    <tr>
      <td style={{ fontWeight: 500 }}>
        <span style={{
          display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
          background: stage.color_hex, marginRight: 8, verticalAlign: 'middle',
        }} />
        {stage.name}
      </td>
      <td className="text-muted text-sm">{stage.color_hex}</td>
      <td>
        <button className="btn btn-sm" style={{ background: 'white', border: '1px solid #e5e7eb', marginRight: 6 }}
          onClick={() => setEditing(true)}>Edit</button>
        <button className="btn btn-sm" style={{ background: 'white', border: '1px solid #fca5a5', color: '#ef4444' }}
          onClick={remove}>Delete</button>
      </td>
    </tr>
  )
}

function StagesTab() {
  const [pipelines,      setPipelines]      = useState([])
  const [stages,         setStages]         = useState([])
  const [activePipeline, setActivePipeline] = useState(null)
  const [name,           setName]           = useState('')
  const [color,          setColor]          = useState('#A8C5DA')
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState('')
  // New pipeline form
  const [newPipName,     setNewPipName]     = useState('')
  const [newPipDesc,     setNewPipDesc]     = useState('')
  const [savingPip,      setSavingPip]      = useState(false)
  const [pipError,       setPipError]       = useState('')

  function load() {
    Promise.all([
      api.get('/pipelines'),
      api.get('/stages'),
    ]).then(([p, s]) => {
      setPipelines(p.pipelines)
      setStages(s.stages)
      setActivePipeline(prev => prev ?? p.pipelines.find(pl => pl.is_default)?.id ?? p.pipelines[0]?.id ?? null)
    }).catch(() => {})
  }
  useEffect(() => { load() }, [])

  async function addStage(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true); setError('')
    try {
      await api.post('/stages', { name: name.trim(), color_hex: color, pipeline_id: activePipeline })
      setName('')
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function addPipeline(e) {
    e.preventDefault()
    if (!newPipName.trim()) return
    setSavingPip(true); setPipError('')
    try {
      await api.post('/pipelines', { name: newPipName.trim(), description: newPipDesc.trim() || null })
      setNewPipName(''); setNewPipDesc('')
      load()
    } catch (err) {
      setPipError(err.message)
    } finally {
      setSavingPip(false)
    }
  }

  async function deletePipeline(id) {
    const pip = pipelines.find(p => p.id === id)
    if (!confirm(`Delete pipeline "${pip?.name}"?`)) return
    try {
      await api.del(`/pipelines/${id}`)
      if (activePipeline === id) setActivePipeline(null)
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  const pipelineStages = stages.filter(s => s.pipeline_id === activePipeline)

  return (
    <div>
      {/* Pipeline tabs */}
      {pipelines.length > 0 && (
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e7eb', marginBottom: 20, flexWrap: 'wrap' }}>
          {pipelines.map(p => (
            <button
              key={p.id}
              onClick={() => setActivePipeline(p.id)}
              style={{
                background: 'none', border: 'none', padding: '8px 16px', cursor: 'pointer',
                fontSize: 13, fontWeight: activePipeline === p.id ? 600 : 400,
                color: activePipeline === p.id ? '#4f46e5' : '#6b7280',
                borderBottom: activePipeline === p.id ? '2px solid #4f46e5' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {p.name}
              {p.is_default ? <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 4 }}>default</span> : null}
            </button>
          ))}
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="card-title" style={{ margin: 0 }}>
            {pipelines.find(p => p.id === activePipeline)?.name ?? 'Stages'}
          </div>
          {activePipeline && !pipelines.find(p => p.id === activePipeline)?.is_default && (
            <button
              className="btn btn-sm"
              style={{ background: 'white', border: '1px solid #fca5a5', color: '#ef4444' }}
              onClick={() => deletePipeline(activePipeline)}
            >
              Delete Pipeline
            </button>
          )}
        </div>
        {pipelineStages.length === 0 ? (
          <div className="text-muted text-sm">No stages yet — add one below.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Name</th><th>Color</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {pipelineStages.map(s => <StageRow key={s.id} stage={s} onSaved={load} />)}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">Add Stage to {pipelines.find(p => p.id === activePipeline)?.name ?? 'Pipeline'}</div>
        <form onSubmit={addStage} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label className="form-label">Stage Name</label>
            <input className="form-input" placeholder="e.g. Negotiation" value={name}
              onChange={e => setName(e.target.value)} required />
          </div>
          <div>
            <label className="form-label">Color</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="color" value={color} onChange={e => setColor(e.target.value)}
                style={{ width: 44, height: 38, border: '1px solid #e5e7eb', cursor: 'pointer', borderRadius: 6 }} />
              <span className="text-muted text-sm">{color}</span>
            </div>
          </div>
          <div>
            {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 6 }}>{error}</div>}
            <button className="btn btn-primary" disabled={saving || !activePipeline}>
              {saving ? 'Adding…' : 'Add Stage'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="card-title">New Pipeline</div>
        <form onSubmit={addPipeline} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
            <div>
              <label className="form-label">Pipeline Name</label>
              <input className="form-input" placeholder="e.g. Renewals" value={newPipName}
                onChange={e => setNewPipName(e.target.value)} required />
            </div>
            <div>
              <label className="form-label">Description <span className="text-muted text-xs">(optional)</span></label>
              <input className="form-input" placeholder="What this pipeline is for…" value={newPipDesc}
                onChange={e => setNewPipDesc(e.target.value)} />
            </div>
          </div>
          {pipError && <div style={{ color: '#ef4444', fontSize: 13 }}>{pipError}</div>}
          <div>
            <button className="btn btn-primary" disabled={savingPip}>
              {savingPip ? 'Creating…' : 'Create Pipeline'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── App Settings Tab ──────────────────────────────────────────────────────────

function AppSettingsTab() {
  const [settings, setSettings] = useState({})
  const [form, setForm]         = useState({})
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => {
    api.get('/settings').then(d => {
      setSettings(d.settings)
      setForm({
        app_name:             d.settings.app_name             ?? 'GTM Tracker',
        stale_days_threshold: d.settings.stale_days_threshold ?? '14',
        default_timezone:     d.settings.default_timezone     ?? 'America/New_York',
      })
    }).catch(() => {})
  }, [])

  async function save(e) {
    e.preventDefault()
    setSaving(true); setError(''); setSaved(false)
    try {
      await api.patch('/settings', form)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <div className="card-title">App Settings</div>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label className="form-label">App Name</label>
          <input className="form-input" value={form.app_name ?? ''} onChange={e => set('app_name', e.target.value)} />
          <div className="text-muted text-xs" style={{ marginTop: 4 }}>Shown in the sidebar header.</div>
        </div>
        <div>
          <label className="form-label">Stale Deal Threshold (days)</label>
          <input className="form-input" type="number" min="1" max="365"
            value={form.stale_days_threshold ?? ''}
            onChange={e => set('stale_days_threshold', e.target.value)} />
          <div className="text-muted text-xs" style={{ marginTop: 4 }}>
            Accounts with no activity for this many days are flagged as stale on the Dashboard.
          </div>
        </div>
        <div>
          <label className="form-label">Default Timezone</label>
          <select className="form-input" value={form.default_timezone ?? ''} onChange={e => set('default_timezone', e.target.value)}>
            {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </div>
        {error && <div style={{ color: '#ef4444', fontSize: 13 }}>{error}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
          {saved && <span style={{ color: '#16a34a', fontSize: 13 }}>Saved!</span>}
        </div>
      </form>
    </div>
  )
}

// ── Google Sheets Sync Tab ────────────────────────────────────────────────────

function SyncTab() {
  const [status, setStatus]   = useState(null)
  const [retrying, setRetrying] = useState(false)
  const [msg, setMsg]         = useState('')

  function load() {
    api.get('/sync/status').then(setStatus).catch(() => {})
  }
  useEffect(() => { load() }, [])

  async function retry() {
    setRetrying(true); setMsg('')
    try {
      const d = await api.post('/sync/retry', {})
      setMsg(`Retried ${d.retried} failed entries.`)
      load()
    } catch (err) {
      setMsg(`Error: ${err.message}`)
    } finally {
      setRetrying(false)
    }
  }

  if (!status) return <div className="text-muted text-sm">Loading…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Status card */}
      <div className="card">
        <div className="card-title">Sync Status</div>
        <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'Configured', value: status.configured ? 'Yes' : 'No', color: status.configured ? '#16a34a' : '#ef4444' },
            { label: 'Synced',     value: status.counts.success, color: '#16a34a' },
            { label: 'Pending',    value: status.counts.pending, color: '#d97706' },
            { label: 'Failed',     value: status.counts.failed,  color: status.counts.failed > 0 ? '#ef4444' : '#6b7280' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div className="text-muted text-xs">{s.label}</div>
            </div>
          ))}
        </div>
        {status.last_success && (
          <div className="text-muted text-sm">Last successful sync: {new Date(status.last_success).toLocaleString()}</div>
        )}
      </div>

      {/* Setup instructions */}
      {!status.configured && (
        <div className="card" style={{ borderLeft: '3px solid #f59e0b' }}>
          <div className="card-title">Setup Required</div>
          <p className="text-sm" style={{ marginBottom: 12 }}>
            Add these three values to <code style={{ background: '#f3f4f6', padding: '1px 5px', borderRadius: 3 }}>backend/.env</code> and restart the server:
          </p>
          <pre style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, fontSize: 12, overflowX: 'auto' }}>{`GOOGLE_SHEETS_SPREADSHEET_ID=your-sheet-id
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-sa@project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n..."`}</pre>
          <p className="text-muted text-sm" style={{ marginTop: 10 }}>
            Create a Google Service Account at console.cloud.google.com, enable the Sheets API, and share your spreadsheet with the service account email.
          </p>
        </div>
      )}

      {/* Failed entries */}
      {status.recent_failed.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div className="card-title" style={{ margin: 0 }}>Failed Entries</div>
            <button className="btn btn-primary btn-sm" onClick={retry} disabled={retrying || !status.configured}>
              {retrying ? 'Retrying…' : 'Retry All'}
            </button>
          </div>
          {msg && <div style={{ fontSize: 13, color: '#16a34a', marginBottom: 10 }}>{msg}</div>}
          <table className="data-table">
            <thead><tr><th>Account</th><th>Attempts</th><th>Error</th><th>Last tried</th></tr></thead>
            <tbody>
              {status.recent_failed.map(f => (
                <tr key={f.entry_id}>
                  <td>{f.account_name ?? '—'}</td>
                  <td>{f.attempts}</td>
                  <td className="text-muted text-sm" style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.error_msg}</td>
                  <td className="text-muted text-sm">{f.last_attempt_at ? new Date(f.last_attempt_at).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {status.configured && status.counts.failed === 0 && status.counts.success > 0 && (
        <div className="card" style={{ borderLeft: '3px solid #16a34a' }}>
          <div className="text-sm" style={{ color: '#16a34a', fontWeight: 500 }}>
            All entries synced successfully.
          </div>
        </div>
      )}
    </div>
  )
}

// ── Email Tab ─────────────────────────────────────────────────────────────────

const TEMPLATE_CATEGORIES = ['general', 'prospecting', 'follow_up', 'proposal']

function TemplateRow({ template, onSaved, onDeleted }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: template.name, category: template.category, subject: template.subject, body: template.body })
  const [saving, setSaving] = useState(false)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    setSaving(true)
    try {
      await api.patch(`/emails/templates/${template.id}`, form)
      setEditing(false)
      onSaved()
    } finally { setSaving(false) }
  }

  async function remove() {
    if (!confirm(`Delete template "${template.name}"?`)) return
    await api.del(`/emails/templates/${template.id}`)
    onDeleted()
  }

  if (editing) {
    return (
      <div style={{ padding: '14px', border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label className="form-label">Name</label>
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div>
            <label className="form-label">Category</label>
            <select className="form-input" value={form.category} onChange={e => set('category', e.target.value)}>
              {TEMPLATE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label className="form-label">Subject</label>
          <input className="form-input" value={form.subject} onChange={e => set('subject', e.target.value)} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label className="form-label">Body</label>
          <textarea className="form-input" rows={6} value={form.body} onChange={e => set('body', e.target.value)} style={{ resize: 'vertical' }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>{saving ? '…' : 'Save'}</button>
          <button className="btn btn-sm" style={{ background: 'white', border: '1px solid #e5e7eb' }} onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '12px 14px', border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{template.name}</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{template.subject}</div>
          <span style={{ display: 'inline-block', marginTop: 4, fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 99, background: '#ede9fe', color: '#6366f1' }}>
            {template.category}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button className="btn btn-sm" style={{ background: 'white', border: '1px solid #e5e7eb' }} onClick={() => setEditing(true)}>Edit</button>
          <button className="btn btn-sm" style={{ background: 'white', border: '1px solid #fca5a5', color: '#ef4444' }} onClick={remove}>Delete</button>
        </div>
      </div>
    </div>
  )
}

function EmailTab() {
  const [smtpStatus, setSmtpStatus] = useState(null)
  const [templates,  setTemplates]  = useState([])
  const [testEmail,  setTestEmail]  = useState('')
  const [testing,    setTesting]    = useState(false)
  const [testMsg,    setTestMsg]    = useState('')
  const [showAdd,    setShowAdd]    = useState(false)
  const [newForm, setNewForm] = useState({ name: '', category: 'general', subject: '', body: '' })
  const [saving,  setSaving]  = useState(false)
  const [saveErr, setSaveErr] = useState('')

  function loadTemplates() {
    api.get('/emails/templates').then(d => setTemplates(d.templates)).catch(() => {})
  }

  useEffect(() => {
    api.get('/emails/smtp-status').then(setSmtpStatus).catch(() => {})
    loadTemplates()
  }, [])

  async function sendTest(e) {
    e.preventDefault()
    setTesting(true); setTestMsg('')
    try {
      const d = await api.post('/emails/smtp-test', { to: testEmail })
      setTestMsg(d.message)
    } catch (err) {
      setTestMsg(`Error: ${err.message}`)
    } finally { setTesting(false) }
  }

  async function addTemplate(e) {
    e.preventDefault()
    setSaving(true); setSaveErr('')
    try {
      await api.post('/emails/templates', newForm)
      setNewForm({ name: '', category: 'general', subject: '', body: '' })
      setShowAdd(false)
      loadTemplates()
    } catch (err) {
      setSaveErr(err.message)
    } finally { setSaving(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* SMTP Status */}
      <div className="card">
        <div className="card-title">SMTP Configuration</div>
        {smtpStatus ? (
          <div>
            <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: smtpStatus.configured ? '#16a34a' : '#ef4444' }}>
                  {smtpStatus.configured ? 'Configured' : 'Not set up'}
                </div>
                <div className="text-muted text-xs">Status</div>
              </div>
              {smtpStatus.host && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{smtpStatus.host}:{smtpStatus.port}</div>
                  <div className="text-muted text-xs">Host</div>
                </div>
              )}
              {smtpStatus.user && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{smtpStatus.user}</div>
                  <div className="text-muted text-xs">User</div>
                </div>
              )}
            </div>

            {!smtpStatus.configured && (
              <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: '#854d0e', marginBottom: 14 }}>
                Add these to <code style={{ background: '#fef08a', padding: '1px 4px', borderRadius: 3 }}>backend/.env</code> and restart the server:
                <pre style={{ margin: '8px 0 0', fontFamily: 'monospace', fontSize: 12, background: '#fffbeb', borderRadius: 4, padding: 10 }}>
{`SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@yourcompany.com
SMTP_PASS=your-app-password
NOTIFY_FROM="GTM Tracker <you@yourcompany.com>"`}
                </pre>
              </div>
            )}

            {smtpStatus.configured && (
              <form onSubmit={sendTest} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Send test email to</label>
                  <input className="form-input" type="email" value={testEmail}
                    onChange={e => setTestEmail(e.target.value)} placeholder="you@company.com" required />
                </div>
                <button className="btn btn-primary" disabled={testing} style={{ flexShrink: 0 }}>
                  {testing ? 'Sending…' : 'Test Connection'}
                </button>
              </form>
            )}
            {testMsg && (
              <div style={{ marginTop: 10, fontSize: 13, color: testMsg.startsWith('Error') ? '#ef4444' : '#16a34a' }}>
                {testMsg}
              </div>
            )}
          </div>
        ) : (
          <div className="text-muted text-sm">Loading…</div>
        )}
      </div>

      {/* Templates */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="card-title" style={{ margin: 0 }}>Email Templates ({templates.length})</div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(s => !s)}>
            {showAdd ? 'Cancel' : '+ New Template'}
          </button>
        </div>

        {showAdd && (
          <form onSubmit={addTemplate} style={{ padding: 14, background: '#f9fafb', borderRadius: 8, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="form-label">Template Name</label>
                <input className="form-input" required value={newForm.name}
                  onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Cold Outreach" />
              </div>
              <div>
                <label className="form-label">Category</label>
                <select className="form-input" value={newForm.category}
                  onChange={e => setNewForm(f => ({ ...f, category: e.target.value }))}>
                  {TEMPLATE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="form-label">Subject <span className="text-muted text-xs">(use {'{{account_name}}'} etc.)</span></label>
              <input className="form-input" required value={newForm.subject}
                onChange={e => setNewForm(f => ({ ...f, subject: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Body</label>
              <textarea className="form-input" required rows={6} value={newForm.body}
                onChange={e => setNewForm(f => ({ ...f, body: e.target.value }))} style={{ resize: 'vertical' }} />
            </div>
            {saveErr && <div style={{ color: '#ef4444', fontSize: 13 }}>{saveErr}</div>}
            <div><button className="btn btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create Template'}</button></div>
          </form>
        )}

        {templates.length === 0 ? (
          <div className="text-muted text-sm">No templates yet. Create your first one above.</div>
        ) : (
          templates.map(t => (
            <TemplateRow key={t.id} template={t} onSaved={loadTemplates} onDeleted={loadTemplates} />
          ))
        )}
      </div>
    </div>
  )
}

// ── Integrations Tab ──────────────────────────────────────────────────────────

const ALL_EVENTS = [
  { key: 'deal_created',    label: 'Deal Created' },
  { key: 'deal_won',        label: 'Deal Won' },
  { key: 'deal_lost',       label: 'Deal Lost' },
  { key: 'account_created', label: 'Account Created' },
  { key: 'stage_changed',   label: 'Stage Changed' },
  { key: 'task_due',        label: 'Task Due' },
]

function WebhookRow({ hook, onSaved, onDeleted }) {
  const [testing, setTesting] = useState(false)
  const [msg,     setMsg]     = useState('')

  async function toggle() {
    await api.patch(`/webhooks/${hook.id}`, { active: !hook.active })
    onSaved()
  }

  async function remove() {
    if (!confirm(`Delete webhook "${hook.name}"?`)) return
    await api.del(`/webhooks/${hook.id}`)
    onDeleted()
  }

  async function test() {
    setTesting(true); setMsg('')
    try {
      const d = await api.post(`/webhooks/${hook.id}/test`, {})
      setMsg(d.message)
    } catch (err) {
      setMsg(`Error: ${err.message}`)
    } finally { setTesting(false) }
  }

  const events = (() => { try { return JSON.parse(hook.events) } catch { return [] } })()

  return (
    <div style={{ padding: '12px 14px', border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
              background: hook.active ? '#22c55e' : '#d1d5db',
            }} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>{hook.name}</span>
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6, wordBreak: 'break-all' }}>{hook.url}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {events.map(e => (
              <span key={e} style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 99, background: '#ede9fe', color: '#6366f1' }}>
                {e}
              </span>
            ))}
            {events.length === 0 && <span style={{ fontSize: 11, color: '#9ca3af' }}>No events subscribed</span>}
          </div>
          {msg && <div style={{ marginTop: 6, fontSize: 12, color: msg.startsWith('Error') ? '#ef4444' : '#16a34a' }}>{msg}</div>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button className="btn btn-sm" style={{ background: 'white', border: '1px solid #e5e7eb' }}
            onClick={toggle}>{hook.active ? 'Disable' : 'Enable'}</button>
          <button className="btn btn-sm" style={{ background: 'white', border: '1px solid #e5e7eb' }}
            onClick={test} disabled={testing}>{testing ? '…' : 'Test'}</button>
          <button className="btn btn-sm" style={{ background: 'white', border: '1px solid #fca5a5', color: '#ef4444' }}
            onClick={remove}>Delete</button>
        </div>
      </div>
    </div>
  )
}

function IntegrationsTab() {
  const [status,   setStatus]   = useState(null)
  const [webhooks, setWebhooks] = useState([])
  const [slackMsg, setSlackMsg] = useState('')
  const [testing,  setTesting]  = useState(false)
  const [showAdd,  setShowAdd]  = useState(false)
  const [form,     setForm]     = useState({ name: '', url: '', events: [], secret: '' })
  const [saving,   setSaving]   = useState(false)
  const [saveErr,  setSaveErr]  = useState('')

  function loadWebhooks() {
    api.get('/webhooks').then(d => setWebhooks(d.webhooks)).catch(() => {})
  }

  useEffect(() => {
    api.get('/integrations/status').then(setStatus).catch(() => {})
    loadWebhooks()
  }, [])

  async function testSlack() {
    setTesting(true); setSlackMsg('')
    try {
      const d = await api.post('/integrations/slack-test', {})
      setSlackMsg(d.message)
    } catch (err) {
      setSlackMsg(`Error: ${err.message}`)
    } finally { setTesting(false) }
  }

  function toggleEvent(key) {
    setForm(f => ({
      ...f,
      events: f.events.includes(key) ? f.events.filter(e => e !== key) : [...f.events, key],
    }))
  }

  async function addWebhook(e) {
    e.preventDefault()
    setSaving(true); setSaveErr('')
    try {
      await api.post('/webhooks', {
        name:   form.name.trim(),
        url:    form.url.trim(),
        events: form.events,
        secret: form.secret.trim() || undefined,
      })
      setForm({ name: '', url: '', events: [], secret: '' })
      setShowAdd(false)
      loadWebhooks()
    } catch (err) {
      setSaveErr(err.message)
    } finally { setSaving(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Slack */}
      <div className="card">
        <div className="card-title">Slack Notifications</div>
        {status ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{
                width: 10, height: 10, borderRadius: '50%', display: 'inline-block',
                background: status.slack.configured ? '#22c55e' : '#d1d5db',
              }} />
              <span style={{ fontSize: 14, fontWeight: 500 }}>
                {status.slack.configured ? 'Connected' : 'Not configured'}
              </span>
            </div>

            {!status.slack.configured && (
              <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: '#854d0e', marginBottom: 14 }}>
                Add this to <code style={{ background: '#fef08a', padding: '1px 4px', borderRadius: 3 }}>backend/.env</code> and restart the server:
                <pre style={{ margin: '8px 0 0', fontFamily: 'monospace', fontSize: 12, background: '#fffbeb', borderRadius: 4, padding: 10 }}>
{`SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../...`}
                </pre>
                <p style={{ margin: '8px 0 0', fontSize: 12 }}>
                  Create an Incoming Webhook at api.slack.com/apps → Your App → Incoming Webhooks.
                </p>
              </div>
            )}

            {status.slack.configured && (
              <div>
                <div style={{ fontSize: 13, color: '#374151', marginBottom: 12 }}>
                  Slack will receive notifications for: <strong>deal created</strong>, <strong>deal won</strong>, <strong>deal lost</strong>.
                </div>
                <button className="btn btn-primary btn-sm" onClick={testSlack} disabled={testing}>
                  {testing ? 'Sending…' : 'Send Test Message'}
                </button>
                {slackMsg && (
                  <span style={{ marginLeft: 10, fontSize: 13, color: slackMsg.startsWith('Error') ? '#ef4444' : '#16a34a' }}>
                    {slackMsg}
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="text-muted text-sm">Loading…</div>
        )}
      </div>

      {/* Outbound Webhooks */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="card-title" style={{ margin: 0 }}>Outbound Webhooks ({webhooks.length})</div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(s => !s)}>
            {showAdd ? 'Cancel' : '+ New Webhook'}
          </button>
        </div>

        {showAdd && (
          <form onSubmit={addWebhook} style={{ padding: 14, background: '#f9fafb', borderRadius: 8, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="form-label">Name</label>
                <input className="form-input" required placeholder="e.g. Zapier trigger"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Endpoint URL</label>
                <input className="form-input" required type="url" placeholder="https://…"
                  value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="form-label">Events <span className="text-muted text-xs">(select which events trigger this webhook)</span></label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                {ALL_EVENTS.map(ev => (
                  <label key={ev.key} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={form.events.includes(ev.key)}
                      onChange={() => toggleEvent(ev.key)}
                    />
                    {ev.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="form-label">Signing Secret <span className="text-muted text-xs">(optional — added as X-GTM-Signature header)</span></label>
              <input className="form-input" placeholder="Leave blank to skip"
                value={form.secret} onChange={e => setForm(f => ({ ...f, secret: e.target.value }))} />
            </div>
            {saveErr && <div style={{ color: '#ef4444', fontSize: 13 }}>{saveErr}</div>}
            <div>
              <button className="btn btn-primary" disabled={saving || form.events.length === 0}>
                {saving ? 'Creating…' : 'Create Webhook'}
              </button>
              {form.events.length === 0 && (
                <span style={{ marginLeft: 10, fontSize: 12, color: '#9ca3af' }}>Select at least one event</span>
              )}
            </div>
          </form>
        )}

        {webhooks.length === 0 && !showAdd ? (
          <div className="text-muted text-sm">No webhooks configured. Add one to push CRM events to external services.</div>
        ) : (
          webhooks.map(h => (
            <WebhookRow key={h.id} hook={h} onSaved={loadWebhooks} onDeleted={loadWebhooks} />
          ))
        )}
      </div>

      {/* Payload format reference */}
      <div className="card" style={{ borderLeft: '3px solid #6366f1' }}>
        <div className="card-title">Payload Format</div>
        <pre style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: 12, fontSize: 12, overflowX: 'auto', margin: 0 }}>{`{
  "event": "deal_won",
  "timestamp": "2026-01-15T10:30:00.000Z",
  "data": {
    "deal_id": 42,
    "deal_name": "Acme Corp Renewal",
    "account_name": "Acme Corp",
    "amount": 50000,
    "stage_name": "Closed Won"
  }
}`}</pre>
      </div>
    </div>
  )
}

// ── Main Settings Page ────────────────────────────────────────────────────────

// Admin-only tabs
const ADMIN_TABS = new Set(['Stages', 'App Settings', 'Sheets Sync'])

export default function Settings() {
  const [tab, setTab]      = useState('Team')
  const { can, role }      = usePermissions()
  const { currentUser }    = useUser()

  const visibleTabs = ['Team', 'Email',
    ...(can('manage_stages')   ? ['Stages']        : []),
    ...(can('manage_settings') ? ['App Settings']  : []),
    ...(can('manage_settings') ? ['Sheets Sync']   : []),
    ...(can('manage_settings') ? ['Integrations']  : []),
  ]

  // Reset to 'Team' if current tab becomes invisible
  const activeTab = visibleTabs.includes(tab) ? tab : 'Team'

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Manage your team, pipeline stages, and app configuration</p>
        </div>
        {currentUser && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
            background: '#f8fafc', borderRadius: 8, border: '1px solid #e5e7eb',
            fontSize: 13, color: '#374151',
          }}>
            <span style={{ color: '#6b7280' }}>Signed in as</span>
            <strong>{currentUser.display_name}</strong>
            <RoleBadge role={role} />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid #e5e7eb', paddingBottom: 0 }}>
        {visibleTabs.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: 'none', border: 'none', padding: '8px 16px', cursor: 'pointer',
              fontSize: 14, fontWeight: activeTab === t ? 600 : 400,
              color: activeTab === t ? '#4f46e5' : '#6b7280',
              borderBottom: activeTab === t ? '2px solid #4f46e5' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {activeTab === 'Team'         && <TeamTab />}
      {activeTab === 'Email'        && <EmailTab />}
      {activeTab === 'Stages'       && <StagesTab />}
      {activeTab === 'App Settings' && <AppSettingsTab />}
      {activeTab === 'Sheets Sync'  && <SyncTab />}
      {activeTab === 'Integrations' && <IntegrationsTab />}
    </div>
  )
}
