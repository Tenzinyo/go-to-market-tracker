import { useEffect, useState, useCallback } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { api } from '../api'
import { useUser } from '../App'
import { useKeyboardShortcuts, SHORTCUTS } from '../hooks/useKeyboardShortcuts'

const NAV = [
  { to: '/',          label: 'Dashboard',    icon: '⬡', end: true },
  { to: '/pipeline',  label: 'Pipeline',     icon: '⊞' },
  { to: '/accounts',  label: 'Accounts',     icon: '◎' },
  { to: '/log',       label: 'Activity Log', icon: '≡' },
  { to: '/analytics', label: 'Analytics',    icon: '◉' },
  { to: '/chat',      label: 'Assistant',    icon: '◈' },
  { to: '/settings',  label: 'Settings',     icon: '⚙' },
]

function ShortcutsOverlay({ onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: '28px 32px', minWidth: 320, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Keyboard Shortcuts</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {SHORTCUTS.map(s => (
            <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
              <span style={{ fontSize: 13, color: '#374151' }}>{s.description}</span>
              <kbd style={{ fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 5, background: '#f3f4f6', border: '1px solid #d1d5db', color: '#374151', fontFamily: 'monospace' }}>
                {s.key}
              </kbd>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
            <span style={{ fontSize: 13, color: '#374151' }}>Close overlay / modal</span>
            <kbd style={{ fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 5, background: '#f3f4f6', border: '1px solid #d1d5db', color: '#374151', fontFamily: 'monospace' }}>Esc</kbd>
          </div>
        </div>
        <p style={{ marginTop: 18, fontSize: 11, color: '#9ca3af', textAlign: 'center' }}>Shortcuts are disabled while typing in a field</p>
      </div>
    </div>
  )
}

export default function Layout() {
  const [users, setUsers] = useState([])
  const [showHelp, setShowHelp] = useState(false)
  const { currentUser, selectUser } = useUser()

  useKeyboardShortcuts({ onHelp: useCallback(() => setShowHelp(h => !h), []) })

  useEffect(() => {
    api.get('/users').then(d => setUsers(d.users)).catch(() => {})
  }, [])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-icon">⬡</span>
          <span className="brand-name">GTM Tracker</span>
        </div>

        <nav className="sidebar-nav">
          {NAV.map(n => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-label">Active user</div>
          <select
            className="user-select"
            value={currentUser?.id ?? ''}
            onChange={e => {
              const u = users.find(u => String(u.id) === e.target.value)
              if (u) selectUser(u)
            }}
          >
            <option value="">— pick user —</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.display_name}</option>
            ))}
          </select>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>

      {showHelp && <ShortcutsOverlay onClose={() => setShowHelp(false)} />}
    </div>
  )
}
