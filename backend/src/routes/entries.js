/**
 * routes/entries.js
 * POST /api/entries/extract          — preview extraction (no DB write)
 * POST /api/entries/extract-conversation — split + extract pasted thread
 * POST /api/entries                  — save confirmed entry
 * GET  /api/entries                  — list with filters
 * GET  /api/entries/:id              — single entry
 * PATCH /api/entries/:id             — edit (logs edit_history)
 * DELETE /api/entries/:id            — soft delete
 */

const router  = require('express').Router();
const db      = require('../db/db');
const { extract, splitConversation } = require('../services/extractor');
const { findCandidates }             = require('../services/fuzzyMatcher');
const { emit }                       = require('../services/sseEmitter');
const { syncEntry }                  = require('../services/sheetsSync');
const { appendEntry }                = require('../services/xlsxFallback');
const { enqueue }                    = require('../services/retryQueue');
const { notifyCoOwners }             = require('../services/notifier');

// ── Helpers ───────────────────────────────────────────────────────────────────

function newUUID() {
  return require('crypto').randomUUID();
}

function getStageByName(name) {
  return db.prepare(`SELECT id, name FROM stages WHERE name = ? AND deleted_at IS NULL`).get(name);
}

function getOrCreateAccount(name, stageId) {
  let account = db.prepare(`SELECT id, name FROM accounts WHERE lower(name) = lower(?) AND deleted_at IS NULL`).get(name);
  if (!account) {
    const info = db.prepare(`
      INSERT INTO accounts (name, aliases, current_stage_id) VALUES (?, '[]', ?)
    `).run(name, stageId ?? null);
    account = { id: info.lastInsertRowid, name };
  }
  return account;
}

// ── POST /api/entries/extract ─────────────────────────────────────────────────
// Returns extraction preview. No DB write. User sees confirmation card.

router.post('/extract', (req, res) => {
  const { text, owner_id, timezone, source } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }

  const preview = extract(
    text.trim(),
    owner_id ?? null,
    timezone ?? 'America/New_York',
    source   ?? 'typed'
  );

  // Duplicate detection: if no account matched, check for near-similar existing accounts
  if (!preview.account_id && preview.account_name) {
    const candidates = findCandidates(preview.account_name);
    preview.similar_accounts = candidates
      .filter(c => c.score >= 0.45 && c.score < 0.85)
      .slice(0, 3)
      .map(c => ({ id: c.id, name: c.name, score: Math.round(c.score * 100) }));
  } else {
    preview.similar_accounts = [];
  }

  res.json({ ok: true, preview });
});

// ── POST /api/entries/extract-conversation ────────────────────────────────────
// Splits pasted thread into individual messages, extracts each.

router.post('/extract-conversation', (req, res) => {
  const { text, default_owner_id, timezone } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }

  const blocks   = splitConversation(text.trim());
  const previews = blocks.map(block => ({
    ...extract(
      block.text,
      default_owner_id ?? null,
      timezone ?? 'America/New_York',
      'pasted'
    ),
    detected_author:    block.author,
    detected_timestamp: block.timestamp,
  }));

  res.json({ ok: true, count: previews.length, previews });
});

// ── POST /api/entries ─────────────────────────────────────────────────────────
// Save a confirmed entry (user has approved the confirmation card).

router.post('/', (req, res) => {
  const {
    raw_text, source, owner_id, timezone,
    meeting_date, meeting_time,
    activity_type, channel, purpose, outcome,
    account_name, account_id: provided_account_id,
    stage_name,
    next_step, next_step_date,
    deal_detail, deal_amount,
    contact_name, contact_email, contact_phone,
    field_sensitivity,
    confidence, missing_fields,
  } = req.body;

  if (!raw_text) return res.status(400).json({ error: 'raw_text is required' });

  // ── Resolve stage ────────────────────────────────────────────────────────────
  let stage_id = null;
  if (stage_name) {
    const stage = getStageByName(stage_name);
    if (stage) stage_id = stage.id;
  }

  // ── Resolve / create account ─────────────────────────────────────────────────
  let account_id = provided_account_id ?? null;
  let resolvedAccountName = account_name;

  if (!account_id && account_name) {
    const acct = getOrCreateAccount(account_name, stage_id);
    account_id = acct.id;
    resolvedAccountName = acct.name;
  }

  // Update account's current stage
  if (account_id && stage_id) {
    const prevAccount = db.prepare(`SELECT current_stage_id FROM accounts WHERE id = ?`).get(account_id);
    db.prepare(`UPDATE accounts SET current_stage_id = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(stage_id, account_id);

    // Log stage history if stage changed
    if (prevAccount && prevAccount.current_stage_id !== stage_id) {
      db.prepare(`
        INSERT INTO stage_history (account_id, entry_id, from_stage_id, to_stage_id, changed_by_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(account_id, null, prevAccount.current_stage_id, stage_id, owner_id ?? null);
    }
  }

  // ── Resolve / create contact ─────────────────────────────────────────────────
  let contact_id = null;
  if (account_id && contact_name) {
    let contact = db.prepare(`
      SELECT id FROM contacts WHERE account_id = ? AND lower(name) = lower(?) AND deleted_at IS NULL
    `).get(account_id, contact_name);

    if (!contact) {
      const info = db.prepare(`
        INSERT INTO contacts (account_id, name, email, phone)
        VALUES (?, ?, ?, ?)
      `).run(account_id, contact_name, contact_email ?? null, contact_phone ?? null);
      contact_id = info.lastInsertRowid;
    } else {
      contact_id = contact.id;
      // Update email/phone if newly provided
      if (contact_email || contact_phone) {
        db.prepare(`
          UPDATE contacts SET email = COALESCE(?, email), phone = COALESCE(?, phone),
          updated_at = datetime('now') WHERE id = ?
        `).run(contact_email ?? null, contact_phone ?? null, contact_id);
      }
    }
  }

  // ── Insert entry ──────────────────────────────────────────────────────────────
  const id = newUUID();

  db.prepare(`
    INSERT INTO entries (
      id, account_id, contact_id, owner_id,
      activity_type, purpose, channel, stage_id, outcome,
      next_step, next_step_date, meeting_date, meeting_time,
      deal_detail, deal_amount,
      source, raw_text,
      field_sensitivity, confidence, missing_fields
    ) VALUES (
      @id, @account_id, @contact_id, @owner_id,
      @activity_type, @purpose, @channel, @stage_id, @outcome,
      @next_step, @next_step_date, @meeting_date, @meeting_time,
      @deal_detail, @deal_amount,
      @source, @raw_text,
      @field_sensitivity, @confidence, @missing_fields
    )
  `).run({
    id,
    account_id:       account_id ?? null,
    contact_id:       contact_id ?? null,
    owner_id:         owner_id   ?? null,
    activity_type:    activity_type  ?? null,
    purpose:          purpose        ?? null,
    channel:          channel        ?? null,
    stage_id:         stage_id       ?? null,
    outcome:          outcome        ?? null,
    next_step:        next_step      ?? null,
    next_step_date:   next_step_date ?? null,
    meeting_date:     meeting_date   ?? null,
    meeting_time:     meeting_time   ?? null,
    deal_detail:      deal_detail    ?? null,
    deal_amount:      deal_amount    ?? null,
    source:           source         ?? 'typed',
    raw_text,
    field_sensitivity: JSON.stringify(field_sensitivity ?? {}),
    confidence:        JSON.stringify(confidence        ?? {}),
    missing_fields:    JSON.stringify(missing_fields    ?? []),
  });

  // Update stage_history entry_id reference
  if (account_id && stage_id) {
    db.prepare(`
      UPDATE stage_history SET entry_id = ? WHERE account_id = ? AND entry_id IS NULL
      ORDER BY id DESC LIMIT 1
    `).run(id, account_id);
  }

  // ── Persist raw message (append-only) ────────────────────────────────────────
  db.prepare(`INSERT INTO raw_messages (entry_id, original_text) VALUES (?, ?)`).run(id, raw_text);

  // ── Spreadsheet sync (Phase 5 stubs) ─────────────────────────────────────────
  try {
    syncEntry({ id, ...req.body });
  } catch (e) {
    enqueue(id);
    console.warn('[sync] sheets failed, queued:', id, e.message);
  }
  appendEntry({ id, ...req.body });

  // ── Notify co-owners (Phase 5+) ──────────────────────────────────────────────
  notifyCoOwners({ id, account_id, owner_id, activity_type, channel, purpose, outcome, next_step, next_step_date, deal_amount, meeting_date }).catch(() => {});

  // ── Broadcast SSE event ───────────────────────────────────────────────────────
  emit('new_entry', {
    id,
    account_id,
    account_name: resolvedAccountName,
    stage_name,
    owner_id,
    meeting_date,
    activity_type,
  });

  const saved = db.prepare(`SELECT * FROM entries WHERE id = ?`).get(id);
  res.status(201).json({ ok: true, entry: saved });
});

// ── GET /api/entries ──────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  const { account_id, owner_id, stage_id, date_from, date_to, limit = 100, offset = 0 } = req.query;

  let sql    = `SELECT e.*, a.name as account_name, u.display_name as owner_name,
                       s.name as stage_name, s.color_hex
                FROM entries e
                LEFT JOIN accounts a ON e.account_id = a.id
                LEFT JOIN users    u ON e.owner_id    = u.id
                LEFT JOIN stages   s ON e.stage_id    = s.id
                WHERE e.deleted_at IS NULL`;
  const params = [];

  if (account_id) { sql += ` AND e.account_id = ?`;    params.push(account_id); }
  if (owner_id)   { sql += ` AND e.owner_id   = ?`;    params.push(owner_id);   }
  if (stage_id)   { sql += ` AND e.stage_id   = ?`;    params.push(stage_id);   }
  if (date_from)  { sql += ` AND e.meeting_date >= ?`; params.push(date_from);  }
  if (date_to)    { sql += ` AND e.meeting_date <= ?`; params.push(date_to);    }

  sql += ` ORDER BY e.created_at DESC LIMIT ? OFFSET ?`;
  params.push(Number(limit), Number(offset));

  const entries = db.prepare(sql).all(...params);
  res.json({ ok: true, entries });
});

// ── GET /api/entries/:id ──────────────────────────────────────────────────────

router.get('/:id', (req, res) => {
  const entry = db.prepare(`
    SELECT e.*, a.name as account_name, u.display_name as owner_name,
           s.name as stage_name, s.color_hex
    FROM entries e
    LEFT JOIN accounts a ON e.account_id = a.id
    LEFT JOIN users    u ON e.owner_id    = u.id
    LEFT JOIN stages   s ON e.stage_id    = s.id
    WHERE e.id = ? AND e.deleted_at IS NULL
  `).get(req.params.id);

  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  res.json({ ok: true, entry });
});

// ── PATCH /api/entries/:id ────────────────────────────────────────────────────

router.patch('/:id', (req, res) => {
  const entry = db.prepare(`SELECT * FROM entries WHERE id = ? AND deleted_at IS NULL`).get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });

  const allowed = [
    'activity_type','purpose','channel','stage_id','outcome',
    'next_step','next_step_date','meeting_date','meeting_time',
    'deal_detail','deal_amount','field_sensitivity',
  ];

  const updates = [];
  const params  = [];
  const edited_by_id = req.body.edited_by_id ?? null;

  for (const field of allowed) {
    if (field in req.body) {
      const oldVal = entry[field];
      const newVal = field === 'field_sensitivity'
        ? JSON.stringify(req.body[field])
        : req.body[field];

      updates.push(`${field} = ?`);
      params.push(newVal);

      // Log edit history
      db.prepare(`
        INSERT INTO edit_history (entry_id, field_name, old_value, new_value, edited_by_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(req.params.id, field, String(oldVal ?? ''), String(newVal ?? ''), edited_by_id);
    }
  }

  if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  updates.push(`updated_at = datetime('now')`);
  params.push(req.params.id);

  db.prepare(`UPDATE entries SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  emit('entry_updated', { id: req.params.id });

  const updated = db.prepare(`SELECT * FROM entries WHERE id = ?`).get(req.params.id);
  res.json({ ok: true, entry: updated });
});

// ── DELETE /api/entries/:id ───────────────────────────────────────────────────

router.delete('/:id', (req, res) => {
  const entry = db.prepare(`SELECT id FROM entries WHERE id = ? AND deleted_at IS NULL`).get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });

  db.prepare(`UPDATE entries SET deleted_at = datetime('now') WHERE id = ?`).run(req.params.id);
  emit('entry_deleted', { id: req.params.id });
  res.json({ ok: true });
});

module.exports = router;
