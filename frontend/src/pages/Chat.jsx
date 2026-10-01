import { useState, useRef, useEffect } from 'react'

const SUGGESTIONS = [
  'Which deals are overdue on next steps?',
  'Summarize the Nomura Securities deal status.',
  'Which accounts are stale and need attention?',
  'What activities happened this week?',
  'Who are the top performers by activity count?',
  'Which deals are closest to closing?',
]

function Message({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 14,
    }}>
      {!isUser && (
        <div style={{
          width: 30, height: 30, borderRadius: '50%', background: '#eef2ff',
          border: '2px solid #a5b4fc', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 14, flexShrink: 0, marginRight: 10, marginTop: 2,
        }}>
          ⬡
        </div>
      )}
      <div style={{
        maxWidth: '72%',
        background: isUser ? '#4f46e5' : 'white',
        color: isUser ? 'white' : '#111827',
        border: isUser ? 'none' : '1px solid #e5e7eb',
        borderRadius: isUser ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
        padding: '10px 14px',
        fontSize: 14,
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {msg.content}
        {msg.streaming && (
          <span style={{
            display: 'inline-block', width: 8, height: 14,
            background: '#6366f1', borderRadius: 2, marginLeft: 3,
            animation: 'blink 0.9s step-end infinite',
          }} />
        )}
        {msg.error && (
          <div style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>
            Error: {msg.error}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Chat() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hi! I have full access to your GTM pipeline data. Ask me anything — deal status, overdue follow-ups, account summaries, activity trends, or anything else about your pipeline.",
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendQuestion(question) {
    if (!question.trim() || loading) return

    const userMsg = { role: 'user', content: question.trim() }
    const assistantMsg = { role: 'assistant', content: '', streaming: true }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')
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
                msgs[msgs.length - 1] = {
                  ...msgs[msgs.length - 1],
                  streaming: false,
                  error: payload.error ?? undefined,
                }
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
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    sendQuestion(input)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendQuestion(input)
    }
  }

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 0 }}>
      {/* Header */}
      <div style={{
        padding: '20px 28px 16px',
        borderBottom: '1px solid #e5e7eb',
        background: 'white',
        flexShrink: 0,
      }}>
        <h1 className="page-title">Pipeline Assistant</h1>
        <p className="page-subtitle">Ask anything about your deals, accounts, and activity</p>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
        {messages.map((msg, i) => <Message key={i} msg={msg} />)}

        {/* Suggestions — shown only at the start */}
        {messages.length === 1 && (
          <div style={{ marginTop: 8 }}>
            <div className="text-xs text-muted" style={{ marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
              Try asking…
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => sendQuestion(s)}
                  style={{
                    background: 'white', border: '1px solid #e5e7eb',
                    borderRadius: 8, padding: '7px 13px', fontSize: 13,
                    color: '#374151', cursor: 'pointer', transition: 'all 0.1s',
                  }}
                  onMouseEnter={e => { e.target.style.borderColor = '#a5b4fc'; e.target.style.color = '#4f46e5' }}
                  onMouseLeave={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.color = '#374151' }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '14px 28px 20px',
        borderTop: '1px solid #e5e7eb',
        background: 'white',
        flexShrink: 0,
      }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 10 }}>
          <textarea
            ref={inputRef}
            className="form-input"
            style={{
              flex: 1, minHeight: 44, maxHeight: 120, resize: 'none',
              paddingTop: 11, paddingBottom: 11, lineHeight: 1.5,
            }}
            placeholder="Ask about your pipeline… (Enter to send, Shift+Enter for new line)"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            autoFocus
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="btn btn-primary"
            style={{ alignSelf: 'flex-end', height: 44, paddingLeft: 20, paddingRight: 20 }}
          >
            {loading ? '…' : 'Send'}
          </button>
        </form>
      </div>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
      `}</style>
    </div>
  )
}
