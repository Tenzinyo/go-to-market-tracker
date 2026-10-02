import { useEffect, useState, useCallback, useRef } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
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

function GlobalSearch() {
  const [q, setQ]               = useState('')
  const [results, setResults]   = useState(null)
  const [open, setOpen]         = useState(false)
  const [active, setActive]     = useState(-1)
  const wrapRef                 = useRef(null)
  const inputRef                = useRef(null)
  const timerRef                = useRef(null)
  const navigate                = useNavigate()

  // Debounced search
  useEffect(() => {
    clearTimeout(timerRef.current)
    if (q.trim().length < 2) { setResults(null); setOpen(false); return }
    timerRef.current = setTimeout(() => {
      api.get(`/search?q=${encodeURIComponent(q.trim())}`)
        .then(d => { setResults(d); setOpen(true); setActive(-1) })
        .catch(() => {})
    }, 250)
    return () => clearTimeout(timerRef.current)
  }, [q])

  // Close on outside click
  useEffect(() => {
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) close()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  function close() { setOpen(false); setActive(-1) }

  // Flatten results for keyboard nav
  const flat = results
    ? [
        ...results.accounts.map(a => ({ type: 'account', id: a.id, label: a.name, sub: a.stage_name, color: a.color_hex, path: `/accounts/${a.id}` })),
        ...results.entries.map(e => ({ type: 'entry', id: e.id, label: e.purpose || e.activity_type || 'Activity', sub: e.account_name, path: `/accounts/${e.account_id}` })),
      ]
    : []

  function go(item) {
    navigate(item.path)
    setQ('')
    close()
  }

  function onKeyDown(e) {
    if (!open || !flat.length) {
      if (e.key === 'Escape') { setQ(''); close() }
      return
    }
    if (e.key === 'ArrowDown')  { e.preventDefault(); setActive(i => Math.min(i + 1, flat.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter')   { e.preventDefault(); if (active >= 0) go(flat[active]) }
    else if (e.key === 'Escape')  { setQ(''); close() }
  }

  const hasAccounts = results?.accounts?.length > 0
  const hasEntries  = results?.entries?.length > 0

  // Position dropdown to the right of the sidebar
  const [dropPos, setDropPos] = useState({ top: 60 })
  useEffect(() => {
    if (open && wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect()
      setDropPos({ top: rect.top })
    }
  }, [open])

  return (
    <div ref={wrapRef} style={{ padding: '10px 12px', position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#475569', fontSize: 12, pointerEvents: 'none' }}>⌕</span>
        <input
          ref={inputRef}
          value={q}
          onChange={e => setQ(e.target.value)}
          onFocus={() => { if (results && flat.length) setOpen(true) }}
          onKeyDown={onKeyDown}
          placeholder="Search…"
          style={{
            width: '100%', background: '#1e293b', border: '1px solid #334155',
            color: '#e2e8f0', padding: '7px 10px 7px 28px', borderRadius: 6,
            fontSize: 12, outline: 'none',
          }}
          onFocusCapture={e => { e.target.style.borderColor = '#6366f1' }}
          onBlurCapture={e => { e.target.style.borderColor = '#334155' }}
        />
        {q && (
          <button
            onClick={() => { setQ(''); close(); inputRef.current?.focus() }}
            style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#475569', fontSize: 14, padding: 0, lineHeight: 1 }}
          >×</button>
        )}
      </div>

      {open && flat.length > 0 && (
        <div style={{
          position: 'fixed', left: 244, top: dropPos.top,
          width: 340, background: '#fff', borderRadius: 10,
          border: '1px solid #e5e7eb', boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
          zIndex: 1500, overflow: 'hidden',
        }}>
          {hasAccounts && (
            <>
              <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af' }}>Accounts</div>
              {results.accounts.map(a => {
                const idx = flat.findIndex(f => f.type === 'account' && f.id === a.id)
                return (
                  <div
                    key={a.id}
                    onMouseEnter={() => setActive(idx)}
                    onMouseDown={() => go(flat[idx])}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 14px', cursor: 'pointer',
                      background: active === idx ? '#f5f3ff' : 'transparent',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                    </div>
                    {a.stage_name && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99, flexShrink: 0,
                        background: a.color_hex ? `${a.color_hex}22` : '#f3f4f6',
                        color: a.color_hex ?? '#6b7280',
                      }}>{a.stage_name}</span>
                    )}
                  </div>
                )
              })}
            </>
          )}

          {hasAccounts && hasEntries && (
            <div style={{ height: 1, background: '#f3f4f6', margin: '4px 0' }} />
          )}

          {hasEntries && (
            <>
              <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af' }}>Activities</div>
              {results.entries.map(e => {
                const idx = flat.findIndex(f => f.type === 'entry' && f.id === e.id)
                return (
                  <div
                    key={e.id}
                    onMouseEnter={() => setActive(idx)}
                    onMouseDown={() => go(flat[idx])}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 14px', cursor: 'pointer',
                      background: active === idx ? '#f5f3ff' : 'transparent',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {e.purpose || e.activity_type || 'Activity'}
                      </div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{e.account_name}{e.meeting_date ? ` · ${e.meeting_date}` : ''}</div>
                    </div>
                    <span style={{ fontSize: 11, color: '#d1d5db', flexShrink: 0 }}>◎</span>
                  </div>
                )
              })}
            </>
          )}

          <div style={{ padding: '6px 14px', borderTop: '1px solid #f3f4f6', fontSize: 10, color: '#d1d5db', display: 'flex', gap: 12 }}>
            <span>↑↓ navigate</span><span>↵ open</span><span>Esc close</span>
          </div>
        </div>
      )}

      {open && results && flat.length === 0 && (
        <div style={{
          position: 'fixed', left: 244, top: dropPos.top,
          width: 300, background: '#fff', borderRadius: 10,
          border: '1px solid #e5e7eb', boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
          zIndex: 1500, padding: '16px 14px', fontSize: 13, color: '#9ca3af', textAlign: 'center',
        }}>
          No results for "{q}"
        </div>
      )}
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

        <GlobalSearch />

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
