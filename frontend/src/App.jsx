import { createContext, useContext, useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Pipeline from './pages/Pipeline'
import AccountList from './pages/AccountList'
import AccountDetail from './pages/AccountDetail'
import EntryLog from './pages/EntryLog'
import NewEntry from './pages/NewEntry'
import Chat from './pages/Chat'
import Settings from './pages/Settings'
import Analytics from './pages/Analytics'

export const UserContext = createContext(null)
export function useUser() { return useContext(UserContext) }

// ── Chat context — lives outside Chat page so streaming survives navigation ──
export const ChatContext = createContext(null)
export function useChatContext() { return useContext(ChatContext) }

const CHAT_STORAGE_KEY = 'gtm_chat_history'
const INITIAL_CHAT_MESSAGE = {
  role: 'assistant',
  content: "Hi! I have full access to your GTM pipeline data. Ask me anything — deal status, overdue follow-ups, account summaries, activity trends, or anything else about your pipeline.",
}

function ChatProvider({ children }) {
  const [messages, setMessages] = useState(() => {
    try {
      const saved = sessionStorage.getItem(CHAT_STORAGE_KEY)
      if (saved) return JSON.parse(saved)
    } catch {}
    return [INITIAL_CHAT_MESSAGE]
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    try {
      const toSave = messages.map(m => ({ ...m, streaming: false }))
      sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(toSave))
    } catch {}
  }, [messages])

  async function sendQuestion(question) {
    if (!question.trim() || loading) return

    setMessages(prev => [
      ...prev,
      { role: 'user', content: question.trim() },
      { role: 'assistant', content: '', streaming: true },
    ])
    setLoading(true)

    try {
      const res = await fetch('/api/chat/query', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ question: question.trim() }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        setMessages(prev => {
          const msgs = [...prev]
          msgs[msgs.length - 1] = { role: 'assistant', content: '', error: err.error, streaming: false }
          return msgs
        })
        return
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const payload = JSON.parse(line.slice(6))
            if (payload.text) {
              setMessages(prev => {
                const msgs = [...prev]
                const last = msgs[msgs.length - 1]
                msgs[msgs.length - 1] = { ...last, content: last.content + payload.text }
                return msgs
              })
            }
            if (payload.done || payload.error) {
              setMessages(prev => {
                const msgs = [...prev]
                msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], streaming: false, error: payload.error ?? undefined }
                return msgs
              })
            }
          } catch {}
        }
      }
    } catch (err) {
      setMessages(prev => {
        const msgs = [...prev]
        msgs[msgs.length - 1] = { role: 'assistant', content: '', error: err.message, streaming: false }
        return msgs
      })
    } finally {
      setLoading(false)
    }
  }

  function clearHistory() {
    sessionStorage.removeItem(CHAT_STORAGE_KEY)
    setMessages([INITIAL_CHAT_MESSAGE])
  }

  return (
    <ChatContext.Provider value={{ messages, loading, sendQuestion, clearHistory }}>
      {children}
    </ChatContext.Provider>
  )
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('gtm_user')) } catch { return null }
  })

  function selectUser(user) {
    setCurrentUser(user)
    localStorage.setItem('gtm_user', JSON.stringify(user))
  }

  return (
    <UserContext.Provider value={{ currentUser, selectUser }}>
    <ChatProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="pipeline" element={<Pipeline />} />
            <Route path="accounts" element={<AccountList />} />
            <Route path="accounts/:id" element={<AccountDetail />} />
            <Route path="log" element={<EntryLog />} />
            <Route path="log/new" element={<NewEntry />} />
            <Route path="chat" element={<Chat />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ChatProvider>
    </UserContext.Provider>
  )
}
