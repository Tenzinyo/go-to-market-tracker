import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export const SHORTCUTS = [
  { key: 'n', description: 'Log new activity',  action: 'navigate', to: '/log/new' },
  { key: 'd', description: 'Dashboard',          action: 'navigate', to: '/' },
  { key: 'k', description: 'Pipeline (Kanban)',  action: 'navigate', to: '/pipeline' },
  { key: 'a', description: 'Accounts',           action: 'navigate', to: '/accounts' },
  { key: 'l', description: 'Activity Log',       action: 'navigate', to: '/log' },
  { key: 'c', description: 'AI Assistant',       action: 'navigate', to: '/chat' },
  { key: '?', description: 'Show shortcuts',     action: 'help' },
]

export function useKeyboardShortcuts({ onHelp }) {
  const navigate = useNavigate()

  useEffect(() => {
    function handler(e) {
      // Ignore if typing in an input, textarea, or select
      const tag = e.target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const sc = SHORTCUTS.find(s => s.key === e.key)
      if (!sc) return

      e.preventDefault()
      if (sc.action === 'navigate') navigate(sc.to)
      if (sc.action === 'help')     onHelp?.()
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate, onHelp])
}
