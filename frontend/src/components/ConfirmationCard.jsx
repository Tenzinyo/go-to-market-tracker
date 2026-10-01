import { useState } from 'react'

const ACTIVITY_TYPES = ['Meeting', 'Call', 'Email', 'Demo', 'Presentation', 'Follow-up', 'Proposal', 'Contract']
const CHANNELS = ['Online', 'In-person', 'Phone', 'Email']
const TODAY = new Date().toISOString().split('T')[0]

function ConfBadge({ value }) {
  if (!value || value >= 0.85) return null
  if (value >= 0.65) return <span className="conf-badge conf-badge-med">~{Math.round(value * 100)}%</span>
  return <span className="conf-badge conf-badge-low">low confidence</span>
}

// Green tick shown next to auto-filled fields
function AutoTag() {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '1px 5px',
      borderRadius: 4, background: '#dcfce7', color: '#15803d',
    }}>
      auto
    </span>
  )
}

export default function ConfirmationCard({ preview, stages, onConfirm, onCancel, submitting }) {
  const conf = preview.confidence ?? {}
  const initialMissing = preview.missing_fields ?? []
  const [showMore, setShowMore] = useState(false)

  const [form, setForm] = useState({
    meeting_date:   preview.meeting_date   ?? TODAY,   // default today if not found
    meeting_time:   preview.meeting_time   ?? '',
    activity_type:  preview.activity_type  ?? '',
    channel:        preview.channel        ?? '',
    account_name:   preview.account_name   ?? '',
    account_id:     preview.account_id     ?? null,
    purpose:        preview.purpose        ?? '',
    stage_name:     preview.stage_name     ?? '',
    outcome:        '',
    next_step:      preview.next_step      ?? '',
    next_step_date: preview.next_step_date ?? '',
    deal_amount:    preview.deal_amount    ?? '',
    deal_detail:    '',
    contact_name:   '',
  })

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function fieldClass(field) {
    const isMissing = initialMissing.includes(field) && !form[field]
    if (isMissing) return 'form-input missing'
    const c = conf[field]
    if (c !== undefined && c > 0 && c < 0.65) return 'form-input conf-low'
    if (c !== undefined && c > 0 && c < 0.85) return 'form-input conf-medium'
    return 'form-input'
  }

  function wasExtracted(field) {
    return !!preview[field]
  }

  function handleSelectCandidate(candidate) {
    setForm(f => ({ ...f, account_name: candidate.name, account_id: candidate.id }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    onConfirm({ ...preview, ...form })
  }

  const fuzzyCandidates   = (preview.fuzzy_candidates ?? []).filter(c => !c.isExact)
  const similarAccounts   = (preview.similar_accounts  ?? []).filter(s => !form.account_id)

  // What the extractor actually captured (for the summary strip)
  const captured = [
    preview.account_name   && { label: 'Account',  value: preview.account_name },
    preview.activity_type  && { label: 'Type',      value: preview.activity_type },
    preview.meeting_date   && { label: 'Date',       value: preview.meeting_date },
    preview.purpose        && { label: 'Purpose',    value: preview.purpose },
    preview.stage_name     && { label: 'Stage',      value: preview.stage_name },
    preview.next_step      && { label: 'Next step',  value: preview.next_step },
    preview.deal_amount    && { label: 'Amount',     value: preview.deal_amount },
  ].filter(Boolean)

  // Fields that are required and still empty after form init
  const stillMissing = initialMissing.filter(f => !form[f] && f !== 'meeting_date') // date defaults to today

  return (
    <form className="confirm-card" onSubmit={handleSubmit}>
      {/* Header */}
      <div className="confirm-card-header">
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Review extracted entry</div>
          <div className="text-sm" style={{ marginTop: 3 }}>
            {captured.length > 0 ? (
              <span style={{ color: '#15803d' }}>
                {captured.length} field{captured.length > 1 ? 's' : ''} extracted automatically
              </span>
            ) : (
              <span style={{ color: '#6b7280' }}>No fields extracted — fill in manually below</span>
            )}
            {stillMissing.length > 0 && (
              <span className="overdue" style={{ marginLeft: 10 }}>
                · {stillMissing.length} required field{stillMissing.length > 1 ? 's' : ''} need attention
              </span>
            )}
          </div>
        </div>
        <button type="button" onClick={onCancel} className="btn btn-secondary btn-sm">
          Edit input
        </button>
      </div>

      {/* What was auto-captured — quick visual summary */}
      {captured.length > 0 && (
        <div style={{
          background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 7,
          padding: '10px 14px', marginBottom: 18, display: 'flex', flexWrap: 'wrap', gap: '8px 20px',
        }}>
          {captured.map(c => (
            <div key={c.label} style={{ fontSize: 12 }}>
              <span style={{ color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 10 }}>
                {c.label}
              </span>
              <div style={{ color: '#111827', fontWeight: 500, marginTop: 1 }}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Raw input */}
      <div className="confirm-raw-text">{preview.raw_text}</div>

      {/* ── Required / key fields ── */}
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280', marginBottom: 10 }}>
        Key details
      </div>

      {/* Account + Date */}
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">
            Account (company / firm)
            {wasExtracted('account_name') && <AutoTag />}
            <ConfBadge value={conf.account_name} />
          </label>
          <input
            className={fieldClass('account_name')}
            value={form.account_name}
            onChange={e => set('account_name', e.target.value)}
            placeholder="Company or firm name"
          />
          {fuzzyCandidates.length > 0 && (
            <div className="fuzzy-candidates">
              <div className="fuzzy-candidates-title">Similar accounts found — is this one?</div>
              {fuzzyCandidates.map(c => (
                <button key={c.id} type="button" className="fuzzy-cand-btn" onClick={() => handleSelectCandidate(c)}>
                  {c.name}
                  <span style={{ color: '#9ca3af' }}>{Math.round(c.score * 100)}% match</span>
                </button>
              ))}
            </div>
          )}
          {similarAccounts.length > 0 && fuzzyCandidates.length === 0 && (
            <div style={{ marginTop: 6, padding: '8px 10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#92400e', marginBottom: 5 }}>
                Possible duplicate — did you mean:
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {similarAccounts.map(s => (
                  <button key={s.id} type="button"
                    style={{ fontSize: 12, padding: '3px 10px', borderRadius: 5, border: '1px solid #f59e0b', background: '#fef3c7', cursor: 'pointer', color: '#78350f' }}
                    onClick={() => handleSelectCandidate(s)}
                  >
                    {s.name} <span style={{ color: '#a16207' }}>({s.score}% match) — use this</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">
            Meeting Date
            {preview.meeting_date ? <AutoTag /> : <span style={{ fontSize: 10, color: '#6b7280' }}>(defaulted to today)</span>}
            <ConfBadge value={conf.meeting_date} />
          </label>
          <input
            type="date"
            className="form-input"
            value={form.meeting_date}
            onChange={e => set('meeting_date', e.target.value)}
          />
        </div>
      </div>

      {/* Activity type + Stage */}
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">
            Activity Type
            {wasExtracted('activity_type') && <AutoTag />}
            <ConfBadge value={conf.activity_type} />
          </label>
          <select className={fieldClass('activity_type')} value={form.activity_type} onChange={e => set('activity_type', e.target.value)}>
            <option value="">— select —</option>
            {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">
            Stage
            {wasExtracted('stage_name') && <AutoTag />}
            <ConfBadge value={conf.stage} />
          </label>
          <select className="form-input" value={form.stage_name} onChange={e => set('stage_name', e.target.value)}>
            <option value="">— no stage change —</option>
            {stages.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {/* Purpose */}
      <div className="form-group">
        <label className="form-label">
          Purpose / topic
          {wasExtracted('purpose') && <AutoTag />}
          <ConfBadge value={conf.purpose} />
        </label>
        <input
          className={fieldClass('purpose')}
          value={form.purpose}
          onChange={e => set('purpose', e.target.value)}
          placeholder="What was discussed?"
        />
      </div>

      {/* Next step */}
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">
            Next Step
            {wasExtracted('next_step') && <AutoTag />}
            <ConfBadge value={conf.next_step} />
          </label>
          <input
            className="form-input"
            value={form.next_step}
            onChange={e => set('next_step', e.target.value)}
            placeholder="What's the follow-up action?"
          />
        </div>
        <div className="form-group">
          <label className="form-label">
            Next Step Date
            {wasExtracted('next_step_date') && <AutoTag />}
          </label>
          <input type="date" className="form-input" value={form.next_step_date} onChange={e => set('next_step_date', e.target.value)} />
        </div>
      </div>

      {/* ── Optional / extra fields ── */}
      <button
        type="button"
        onClick={() => setShowMore(v => !v)}
        style={{
          background: 'none', border: 'none', color: '#6366f1',
          fontSize: 13, fontWeight: 500, cursor: 'pointer', padding: '4px 0', marginBottom: 8,
          display: 'flex', alignItems: 'center', gap: 5,
        }}
      >
        {showMore ? '▾' : '▸'} {showMore ? 'Hide' : 'Add'} optional details
        {(form.channel || form.meeting_time || form.outcome || form.contact_name || form.deal_amount || form.deal_detail) && (
          <span style={{ background: '#eef2ff', color: '#4f46e5', borderRadius: 10, padding: '0 6px', fontSize: 11 }}>filled</span>
        )}
      </button>

      {showMore && (
        <>
          <div className="form-row-3">
            <div className="form-group">
              <label className="form-label">
                Channel
                {wasExtracted('channel') && <AutoTag />}
              </label>
              <select className="form-input" value={form.channel} onChange={e => set('channel', e.target.value)}>
                <option value="">— select —</option>
                {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Time</label>
              <input type="time" className="form-input" value={form.meeting_time} onChange={e => set('meeting_time', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Contact Name</label>
              <input className="form-input" value={form.contact_name} onChange={e => set('contact_name', e.target.value)} placeholder="Person you spoke with" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Outcome</label>
              <input className="form-input" value={form.outcome} onChange={e => set('outcome', e.target.value)} placeholder="How did it go?" />
            </div>
            <div className="form-group">
              <label className="form-label">
                Deal Amount
                {wasExtracted('deal_amount') && <AutoTag />}
              </label>
              <input className="form-input" value={form.deal_amount} onChange={e => set('deal_amount', e.target.value)} placeholder="e.g. $50,000" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Deal Detail</label>
            <input className="form-input" value={form.deal_detail} onChange={e => set('deal_detail', e.target.value)} placeholder="Additional deal context" />
          </div>
        </>
      )}

      <div className="confirm-actions">
        <button type="button" onClick={onCancel} className="btn btn-secondary">Back</button>
        <button type="submit" disabled={submitting} className="btn btn-primary btn-lg">
          {submitting ? 'Saving…' : 'Confirm & Save'}
        </button>
      </div>
    </form>
  )
}
