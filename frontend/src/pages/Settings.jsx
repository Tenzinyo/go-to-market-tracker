import { useState, useEffect } from 'react'
import { api } from '../api'

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Vancouver', 'Europe/London', 'Europe/Paris',
  'Europe/Berlin', 'Asia/Tokyo', 'Asia/Singapore', 'Asia/Hong_Kong',
  'Australia/Sydney', 'Pacific/Auckland',
]

// ── Team Tab ──────────────────────────────────────────────────────────────────

function UserRow({ user, onSaved }) {
  const [editingEmail, setEditingEmail] = useState(false)
  const [email, setEmail]               = useState(user.email ?? '')
  const [saving, setSaving]             = useState(false)

  async function saveEmail() {
    setSaving(true)
    try {
      await api.patch(`/users/${user.id}`, { email: email.trim() })
      setEditingEmail(false)
      onSaved()
    } catch {} finally { setSaving(false) }
  }

  return (
    <tr>
      <td style={{ fontWeight: 500 }}>{user.display_name}</td>
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
              <tr><th>Name</th><th>Timezone</th><th>Notification Email</th></tr>
            </thead>
            <tbody>
              {users.map(u => <UserRow key={u.id} user={u} onSaved={load} />)}
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
  const [stages, setStages] = useState([])
  const [name, setName]     = useState('')
  const [color, setColor]   = useState('#A8C5DA')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function load() {
    api.get('/stages').then(d => setStages(d.stages)).catch(() => {})
  }
  useEffect(() => { load() }, [])

  async function addStage(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true); setError('')
    try {
      await api.post('/stages', { name: name.trim(), color_hex: color })
      setName('')
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">Pipeline Stages</div>
        <table className="data-table">
          <thead>
            <tr><th>Name</th><th>Color</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {stages.map(s => <StageRow key={s.id} stage={s} onSaved={load} />)}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-title">Add Stage</div>
        <form onSubmit={addStage} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label className="form-label">Stage Name</label>
            <input
              className="form-input"
              placeholder="e.g. Negotiation"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
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
            <button className="btn btn-primary" disabled={saving}>
              {saving ? 'Adding…' : 'Add Stage'}
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

// ── Main Settings Page ────────────────────────────────────────────────────────

const TABS = ['Team', 'Stages', 'App Settings', 'Sheets Sync']

export default function Settings() {
  const [tab, setTab] = useState('Team')

  return (
    <div className="page">
      <h1 className="page-title">Settings</h1>
      <p className="page-subtitle">Manage your team, pipeline stages, and app configuration</p>

      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid #e5e7eb', paddingBottom: 0 }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: 'none', border: 'none', padding: '8px 16px', cursor: 'pointer',
              fontSize: 14, fontWeight: tab === t ? 600 : 400,
              color: tab === t ? '#4f46e5' : '#6b7280',
              borderBottom: tab === t ? '2px solid #4f46e5' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Team'         && <TeamTab />}
      {tab === 'Stages'       && <StagesTab />}
      {tab === 'App Settings' && <AppSettingsTab />}
      {tab === 'Sheets Sync'  && <SyncTab />}
    </div>
  )
}
