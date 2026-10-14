/**
 * ComposeEmailModal
 *
 * Props:
 *   account  — { id, name } (required)
 *   contacts — [{ id, name, email }] for this account
 *   deal     — { id, name, close_date } (optional)
 *   currentUser — { id, display_name }
 *   onClose  — fn
 *   onSent   — fn (called after successful send/log)
 */
import { useState, useEffect } from 'react'
import { api } from '../api'

const CATEGORY_LABELS = {
  prospecting: 'Prospecting',
  follow_up:   'Follow-Up',
  proposal:    'Proposal',
  general:     'General',
}

export default function ComposeEmailModal({ account, contacts = [], deal, currentUser, onClose, onSent, initialContactId }) {
  const [templates,    setTemplates]    = useState([])
  const [templateId,   setTemplateId]   = useState('')
  const [contactId,    setContactId]    = useState('')
  const [toEmail,      setToEmail]      = useState('')
  const [toName,       setToName]       = useState('')
  const [subject,      setSubject]      = useState('')
  const [body,         setBody]         = useState('')
  const [previewing,   setPreviewing]   = useState(false)
  const [sending,      setSending]      = useState(false)
  const [smtpOk,       setSmtpOk]       = useState(false)
  const [tab,          setTab]          = useState('compose')   // 'compose' | 'preview'
  const [result,       setResult]       = useState(null)        // { ok, status, error }
  const [error,        setError]        = useState('')

  useEffect(() => {
    api.get('/emails/templates').then(d => setTemplates(d.templates)).catch(() => {})
    api.get('/emails/smtp-status').then(d => setSmtpOk(d.configured)).catch(() => {})
  }, [])

  // Pre-fill contact: use initialContactId if provided, otherwise auto-select if only one
  useEffect(() => {
    const preselect = initialContactId
      ? contacts.find(c => String(c.id) === String(initialContactId))
      : contacts.length === 1 ? contacts[0] : null
    if (preselect?.email) {
      setContactId(String(preselect.id))
      setToEmail(preselect.email)
      setToName(preselect.name ?? '')
    }
  }, [contacts, initialContactId])

  // When contact selection changes, sync email + name fields
  function handleContactChange(cid) {
    setContactId(cid)
    const c = contacts.find(c => String(c.id) === cid)
    if (c) {
      setToEmail(c.email ?? '')
      setToName(c.name  ?? '')
    } else {
      setToEmail('')
      setToName('')
    }
    // Re-preview with new contact if a template is already selected
    if (templateId && cid) {
      loadPreview(templateId, cid)
    }
  }

  async function loadPreview(tmplId, cid = contactId) {
    if (!tmplId) return
    setPreviewing(true)
    try {
      const data = await api.post('/emails/preview', {
        template_id: Number(tmplId),
        account_id:  account?.id      ?? null,
        deal_id:     deal?.id         ?? null,
        contact_id:  cid ? Number(cid) : null,
        sender_id:   currentUser?.id  ?? null,
      })
      setSubject(data.subject)
      setBody(data.body)
    } catch {
      // ignore preview errors — user can still type manually
    } finally {
      setPreviewing(false)
    }
  }

  function handleTemplateChange(id) {
    setTemplateId(id)
    if (id) loadPreview(id)
    else { setSubject(''); setBody('') }
  }

  async function handleSend(method) {
    setError('')
    if (!toEmail.trim()) { setError('Recipient email is required.'); return }
    if (!subject.trim()) { setError('Subject is required.'); return }
    if (!body.trim())    { setError('Body is required.'); return }

    if (method === 'mailto') {
      // Log then open email client
      await api.post('/emails/send', {
        to_email:    toEmail.trim(),
        to_name:     toName.trim() || null,
        subject:     subject.trim(),
        body:        body.trim(),
        account_id:  account?.id     ?? null,
        deal_id:     deal?.id        ?? null,
        contact_id:  contactId ? Number(contactId) : null,
        sent_by_id:  currentUser?.id ?? null,
        template_id: templateId ? Number(templateId) : null,
        method:      'mailto',
      }).catch(() => {})

      const mailtoUrl =
        `mailto:${encodeURIComponent(toEmail.trim())}` +
        `?subject=${encodeURIComponent(subject.trim())}` +
        `&body=${encodeURIComponent(body.trim())}`
      window.location.href = mailtoUrl
      setResult({ ok: true, status: 'mailto' })
      if (onSent) onSent()
      return
    }

    // SMTP send
    setSending(true)
    try {
      await api.post('/emails/send', {
        to_email:    toEmail.trim(),
        to_name:     toName.trim() || null,
        subject:     subject.trim(),
        body:        body.trim(),
        account_id:  account?.id     ?? null,
        deal_id:     deal?.id        ?? null,
        contact_id:  contactId ? Number(contactId) : null,
        sent_by_id:  currentUser?.id ?? null,
        template_id: templateId ? Number(templateId) : null,
        method:      'smtp',
      })
      setResult({ ok: true, status: 'sent' })
      if (onSent) onSent()
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  const contactsWithEmail = contacts.filter(c => c.email)

  // Group templates by category
  const byCategory = templates.reduce((acc, t) => {
    const cat = t.category || 'general'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(t)
    return acc
  }, {})

  if (result?.ok) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}>
        <div style={{
          background: '#fff', borderRadius: 12, padding: 32, maxWidth: 420, width: '100%',
          textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>
            {result.status === 'sent' ? '✓' : '✉'}
          </div>
          <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>
            {result.status === 'sent' ? 'Email sent!' : 'Opened in email client'}
          </h3>
          <p style={{ color: '#6b7280', fontSize: 14, margin: '0 0 20px' }}>
            {result.status === 'sent'
              ? `Email delivered to ${toEmail}`
              : 'Email logged and opened in your email client'}
          </p>
          <button className="btn btn-primary" onClick={onClose} style={{ width: '100%' }}>Done</button>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#fff', borderRadius: 12, width: '100%', maxWidth: 680,
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px', borderBottom: '1px solid #e5e7eb',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Compose Email</h2>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
              {account?.name}{deal ? ` · ${deal.name}` : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
          {['compose', 'preview'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: 'none', border: 'none', padding: '10px 20px', cursor: 'pointer',
                fontSize: 13, fontWeight: tab === t ? 600 : 400,
                color: tab === t ? '#4f46e5' : '#6b7280',
                borderBottom: tab === t ? '2px solid #4f46e5' : '2px solid transparent',
                marginBottom: -1, textTransform: 'capitalize',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: 24 }}>
          {tab === 'compose' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Template selector */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                  Template <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span>
                </label>
                <select
                  className="form-input"
                  value={templateId}
                  onChange={e => handleTemplateChange(e.target.value)}
                  disabled={previewing}
                >
                  <option value="">— write from scratch —</option>
                  {Object.entries(byCategory).map(([cat, tmpls]) => (
                    <optgroup key={cat} label={CATEGORY_LABELS[cat] ?? cat}>
                      {tmpls.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </optgroup>
                  ))}
                </select>
                {previewing && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Loading template…</div>}
              </div>

              {/* To */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>To</label>
                  {contactsWithEmail.length > 0 ? (
                    <select
                      className="form-input"
                      value={contactId}
                      onChange={e => handleContactChange(e.target.value)}
                    >
                      <option value="">— pick contact —</option>
                      {contactsWithEmail.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
                      ))}
                      <option value="__custom__">Enter manually…</option>
                    </select>
                  ) : (
                    <input
                      className="form-input"
                      type="email"
                      placeholder="recipient@company.com"
                      value={toEmail}
                      onChange={e => setToEmail(e.target.value)}
                    />
                  )}
                </div>
                {contactsWithEmail.length > 0 && (
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Email</label>
                    <input
                      className="form-input"
                      type="email"
                      placeholder="recipient@company.com"
                      value={toEmail}
                      onChange={e => setToEmail(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Subject */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Subject</label>
                <input
                  className="form-input"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="Email subject…"
                />
              </div>

              {/* Body */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                  Body
                  <span style={{ marginLeft: 8, fontWeight: 400, color: '#9ca3af', fontSize: 11 }}>
                    Variables: {`{{contact_name}} {{account_name}} {{sender_name}} {{deal_name}} {{close_date}}`}
                  </span>
                </label>
                <textarea
                  className="form-input"
                  rows={12}
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  placeholder="Write your email here, or pick a template above…"
                  style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
                />
              </div>
            </div>
          ) : (
            /* Preview tab */
            <div>
              <div style={{
                background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20,
                marginBottom: 16,
              }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: '#6b7280', minWidth: 60 }}>To:</span>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{toName ? `${toName} <${toEmail}>` : toEmail || '—'}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <span style={{ fontSize: 12, color: '#6b7280', minWidth: 60 }}>Subject:</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{subject || '—'}</span>
                </div>
                <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '0 0 16px' }} />
                <pre style={{
                  margin: 0, fontFamily: 'inherit', fontSize: 13, color: '#374151',
                  whiteSpace: 'pre-wrap', lineHeight: 1.7,
                }}>
                  {body || '(no body)'}
                </pre>
              </div>
              {!smtpOk && (
                <div style={{
                  background: '#fef9c3', border: '1px solid #fde047', borderRadius: 6,
                  padding: '10px 14px', fontSize: 13, color: '#854d0e',
                }}>
                  SMTP is not configured — you can still open this in your email client below.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px', borderTop: '1px solid #e5e7eb', flexShrink: 0,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
        }}>
          {error && <div style={{ color: '#ef4444', fontSize: 13, flex: 1 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button
              className="btn"
              style={{ background: 'white', border: '1px solid #e5e7eb' }}
              onClick={() => handleSend('mailto')}
              title="Log email and open in your email client"
            >
              Open in Email Client
            </button>
            {smtpOk && (
              <button
                className="btn btn-primary"
                onClick={() => handleSend('smtp')}
                disabled={sending}
              >
                {sending ? 'Sending…' : 'Send Email'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
