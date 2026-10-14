import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'

function Avatar({ name }) {
  const initials = (name || '?')
    .split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%', background: '#ede9fe',
      color: '#6366f1', fontWeight: 700, fontSize: 12,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {initials}
    </div>
  )
}

function ContactModal({ contact, accountId, onSaved, onClose }) {
  const isEdit = !!contact
  const [form, setForm] = useState({
    name:         contact?.name         ?? '',
    title:        contact?.title        ?? '',
    email:        contact?.email        ?? '',
    phone:        contact?.phone        ?? '',
    linkedin_url: contact?.linkedin_url ?? '',
    notes:        contact?.notes        ?? '',
    account_id:   contact?.account_id   ?? accountId ?? '',
  })
  const [accounts, setAccounts] = useState([])
  const [saving, setSaving]     = useState(false)
  const [error,  setError]      = useState('')

  useEffect(() => {
    if (!accountId) {
      api.get('/accounts?limit=500').then(d => setAccounts(d.accounts)).catch(() => {})
    }
  }, [accountId])

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function save(e) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const body = {
        name:         form.name.trim()         || null,
        title:        form.title.trim()        || null,
        email:        form.email.trim()        || null,
        phone:        form.phone.trim()        || null,
        linkedin_url: form.linkedin_url.trim() || null,
        notes:        form.notes.trim()        || null,
        account_id:   form.account_id          || undefined,
      }
      if (isEdit) {
        await api.patch(`/contacts/${contact.id}`, body)
      } else {
        await api.post('/contacts', body)
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: '100%', maxWidth: 520, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{isEdit ? 'Edit Contact' : 'New Contact'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>×</button>
        </div>

        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="form-label">Name</label>
              <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Jane Smith" />
            </div>
            <div>
              <label className="form-label">Job Title</label>
              <input className="form-input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="VP of Sales" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="jane@company.com" />
            </div>
            <div>
              <label className="form-label">Phone</label>
              <input className="form-input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+1 555 000 0000" />
            </div>
          </div>

          {!accountId && (
            <div>
              <label className="form-label">Account</label>
              <select className="form-input" value={form.account_id} onChange={e => set('account_id', e.target.value)} required>
                <option value="">— select account —</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="form-label">LinkedIn URL</label>
            <input className="form-input" value={form.linkedin_url} onChange={e => set('linkedin_url', e.target.value)} placeholder="https://linkedin.com/in/…" />
          </div>

          <div>
            <label className="form-label">Notes</label>
            <textarea className="form-input" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Champion, decision maker, key concerns…" style={{ resize: 'vertical' }} />
          </div>

          {error && <div style={{ color: '#ef4444', fontSize: 13 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" className="btn" style={{ background: 'white', border: '1px solid #e5e7eb' }} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Contacts() {
  const [contacts, setContacts] = useState([])
  const [accounts, setAccounts] = useState([])
  const [q,             setQ]           = useState('')
  const [accountFilter, setAccountFilter] = useState('')
  const [loading,  setLoading]  = useState(true)
  const [showAdd,  setShowAdd]  = useState(false)
  const [editing,  setEditing]  = useState(null)
  const timerRef = useRef(null)

  const load = useCallback(() => {
    const params = new URLSearchParams({ limit: '500' })
    if (q)             params.set('q', q)
    if (accountFilter) params.set('account_id', accountFilter)
    api.get(`/contacts?${params}`)
      .then(d => { setContacts(d.contacts); setLoading(false) })
      .catch(() => setLoading(false))
  }, [q, accountFilter])

  useEffect(() => {
    api.get('/accounts?limit=500').then(d => setAccounts(d.accounts)).catch(() => {})
  }, [])

  useEffect(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(load, 200)
    return () => clearTimeout(timerRef.current)
  }, [load])

  async function remove(contact) {
    if (!confirm(`Delete contact "${contact.name}"?`)) return
    await api.del(`/contacts/${contact.id}`)
    load()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Contacts</h1>
          <p className="page-subtitle">{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Contact</button>
      </div>

      <div className="filter-bar">
        <input
          className="search-input"
          placeholder="Search by name, email, or title…"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <select className="filter-select" value={accountFilter} onChange={e => setAccountFilter(e.target.value)}>
          <option value="">All accounts</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        {(q || accountFilter) && (
          <button className="btn btn-secondary btn-sm" onClick={() => { setQ(''); setAccountFilter('') }}>Clear</button>
        )}
      </div>

      <div className="card">
        {loading ? (
          <div className="loading">Loading…</div>
        ) : contacts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">◎</div>
            <div className="empty-label">
              {q || accountFilter ? 'No contacts match your filters' : 'No contacts yet — add your first one'}
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Account</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map(c => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={c.name} />
                        <div>
                          <div style={{ fontWeight: 500 }}>{c.name || <span className="text-muted">—</span>}</div>
                          {c.title && <div style={{ fontSize: 11, color: '#6b7280' }}>{c.title}</div>}
                        </div>
                      </div>
                    </td>
                    <td>
                      {c.account_name
                        ? <Link to={`/accounts/${c.account_id}`} style={{ color: '#4f46e5', fontWeight: 500 }}>{c.account_name}</Link>
                        : <span className="text-muted">—</span>}
                    </td>
                    <td className="text-sm">
                      {c.email
                        ? <a href={`mailto:${c.email}`} style={{ color: '#4f46e5' }}>{c.email}</a>
                        : <span className="text-muted">—</span>}
                    </td>
                    <td className="text-muted text-sm">{c.phone || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm" style={{ background: 'white', border: '1px solid #e5e7eb' }}
                          onClick={() => setEditing(c)}>Edit</button>
                        <button className="btn btn-sm" style={{ background: 'white', border: '1px solid #fca5a5', color: '#ef4444' }}
                          onClick={() => remove(c)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <ContactModal onSaved={load} onClose={() => setShowAdd(false)} />
      )}
      {editing && (
        <ContactModal contact={editing} onSaved={load} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
