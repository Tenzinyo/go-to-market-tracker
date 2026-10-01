/**
 * routes/accounts.js
 * GET    /api/accounts           — list + fuzzy search
 * POST   /api/accounts           — create
 * GET    /api/accounts/:id       — detail + contacts + current stage
 * PATCH  /api/accounts/:id       — edit
 * DELETE /api/accounts/:id       — soft delete
 * GET    /api/accounts/:id/timeline — full entry timeline
 * POST   /api/accounts/:id/stage — move to a new stage
 */

const router = require('express').Router();
const db     = require('../db/db');
const { emit } = require('../services/sseEmitter');

// ── GET /api/accounts ─────────────────────────────────────────────────────────

// ── GET /api/accounts/tags ────────────────────────────────────────────────────
// Returns all distinct tags across all accounts (for filter dropdowns)

router.get('/tags', (req, res) => {
  const rows = db.prepare(`SELECT tags FROM accounts WHERE deleted_at IS NULL AND tags IS NOT NULL AND tags != '[]'`).all();
  const tagSet = new Set();
  for (const r of rows) {
    try { for (const t of JSON.parse(r.tags)) tagSet.add(t); } catch {}
  }
  res.json({ ok: true, tags: [...tagSet].sort() });
});

router.get('/', (req, res) => {
  const { q, stage_id, tag, limit = 100, offset = 0 } = req.query;

  let sql = `
    SELECT a.*, s.name as stage_name, s.color_hex,
           u.display_name as owner_name,
           (SELECT COUNT(*) FROM entries e WHERE e.account_id = a.id AND e.deleted_at IS NULL) as entry_count
    FROM accounts a
    LEFT JOIN stages s ON a.current_stage_id = s.id
    LEFT JOIN users  u ON a.owner_id = u.id
    WHERE a.deleted_at IS NULL
  `;
  const params = [];

  if (q) {
    sql += ` AND (lower(a.name) LIKE lower(?) OR lower(a.aliases) LIKE lower(?))`;
    params.push(`%${q}%`, `%${q}%`);
  }
  if (stage_id) {
    sql += ` AND a.current_stage_id = ?`;
    params.push(stage_id);
  }
  if (tag) {
    // JSON array contains the tag string
    sql += ` AND (a.tags LIKE ? OR a.tags LIKE ? OR a.tags LIKE ? OR a.tags LIKE ?)`;
    const escaped = tag.replace(/"/g, '\\"');
    params.push(`["${escaped}"]`, `["${escaped}",%`, `%,"${escaped}"]`, `%,"${escaped}",%`);
  }

  sql += ` ORDER BY a.updated_at DESC LIMIT ? OFFSET ?`;
  params.push(Number(limit), Number(offset));

  const accounts = db.prepare(sql).all(...params);
  res.json({ ok: true, accounts });
});

// ── POST /api/accounts ────────────────────────────────────────────────────────

router.post('/', (req, res) => {
  const { name, aliases = [], current_stage_id } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const existing = db.prepare(`SELECT id FROM accounts WHERE lower(name) = lower(?) AND deleted_at IS NULL`).get(name);
  if (existing) return res.status(409).json({ error: 'Account already exists', id: existing.id });

  const info = db.prepare(`
    INSERT INTO accounts (name, aliases, current_stage_id) VALUES (?, ?, ?)
  `).run(name, JSON.stringify(aliases), current_stage_id ?? null);

  const account = db.prepare(`SELECT * FROM accounts WHERE id = ?`).get(info.lastInsertRowid);
  emit('account_created', { id: account.id, name: account.name });
  res.status(201).json({ ok: true, account });
});

// ── GET /api/accounts/:id ─────────────────────────────────────────────────────

router.get('/:id', (req, res) => {
  const account = db.prepare(`
    SELECT a.*, s.name as stage_name, s.color_hex, s.text_color_hex,
           u.display_name as owner_name
    FROM accounts a
    LEFT JOIN stages s ON a.current_stage_id = s.id
    LEFT JOIN users  u ON a.owner_id = u.id
    WHERE a.id = ? AND a.deleted_at IS NULL
  `).get(req.params.id);

  if (!account) return res.status(404).json({ error: 'Account not found' });

  const contacts = db.prepare(`
    SELECT * FROM contacts WHERE account_id = ? AND deleted_at IS NULL
  `).all(req.params.id);

  const stageHistory = db.prepare(`
    SELECT sh.*, sf.name as from_stage, sf.color_hex as from_color,
           st.name as to_stage, st.color_hex as to_color,
           u.display_name as changed_by
    FROM stage_history sh
    LEFT JOIN stages sf ON sh.from_stage_id = sf.id
    LEFT JOIN stages st ON sh.to_stage_id   = st.id
    LEFT JOIN users  u  ON sh.changed_by_id = u.id
    WHERE sh.account_id = ?
    ORDER BY sh.changed_at ASC
  `).all(req.params.id);

  res.json({ ok: true, account, contacts, stage_history: stageHistory });
});

// ── PATCH /api/accounts/:id ───────────────────────────────────────────────────

router.patch('/:id', (req, res) => {
  const account = db.prepare(`SELECT id FROM accounts WHERE id = ? AND deleted_at IS NULL`).get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  const { name, aliases, current_stage_id, owner_id, tags } = req.body;
  const updates = [];
  const params  = [];

  if (name)              { updates.push(`name = ?`);              params.push(name); }
  if (aliases)           { updates.push(`aliases = ?`);           params.push(JSON.stringify(aliases)); }
  if (current_stage_id !== undefined) {
    updates.push(`current_stage_id = ?`);
    params.push(current_stage_id);
  }
  if (owner_id !== undefined) {
    updates.push(`owner_id = ?`);
    params.push(owner_id);
  }
  if (tags !== undefined) {
    updates.push(`tags = ?`);
    params.push(JSON.stringify(tags));
  }

  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

  updates.push(`updated_at = datetime('now')`);
  params.push(req.params.id);
  db.prepare(`UPDATE accounts SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare(`SELECT * FROM accounts WHERE id = ?`).get(req.params.id);
  emit('account_updated', { id: updated.id });
  res.json({ ok: true, account: updated });
});

// ── DELETE /api/accounts/:id ──────────────────────────────────────────────────

router.delete('/:id', (req, res) => {
  const account = db.prepare(`SELECT id FROM accounts WHERE id = ? AND deleted_at IS NULL`).get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  db.prepare(`UPDATE accounts SET deleted_at = datetime('now') WHERE id = ?`).run(req.params.id);
  emit('account_deleted', { id: req.params.id });
  res.json({ ok: true });
});

// ── GET /api/accounts/:id/timeline ───────────────────────────────────────────

router.get('/:id/timeline', (req, res) => {
  const account = db.prepare(`SELECT id, name FROM accounts WHERE id = ? AND deleted_at IS NULL`).get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  const entries = db.prepare(`
    SELECT e.*, u.display_name as owner_name, s.name as stage_name, s.color_hex
    FROM entries e
    LEFT JOIN users  u ON e.owner_id  = u.id
    LEFT JOIN stages s ON e.stage_id  = s.id
    WHERE e.account_id = ? AND e.deleted_at IS NULL
    ORDER BY COALESCE(e.meeting_date, date(e.created_at)) ASC, e.created_at ASC
  `).all(req.params.id);

  res.json({ ok: true, account, entries });
});

// ── POST /api/accounts/:id/stage ─────────────────────────────────────────────
// Move an account to a new stage (e.g., via kanban drag-and-drop).

router.post('/:id/stage', (req, res) => {
  const { to_stage_id, changed_by_id } = req.body;
  if (!to_stage_id) return res.status(400).json({ error: 'to_stage_id is required' });

  const account = db.prepare(`SELECT * FROM accounts WHERE id = ? AND deleted_at IS NULL`).get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  const toStage = db.prepare(`SELECT id, name FROM stages WHERE id = ? AND deleted_at IS NULL`).get(to_stage_id);
  if (!toStage) return res.status(404).json({ error: 'Stage not found' });

  // Log stage history
  db.prepare(`
    INSERT INTO stage_history (account_id, from_stage_id, to_stage_id, changed_by_id)
    VALUES (?, ?, ?, ?)
  `).run(req.params.id, account.current_stage_id ?? null, to_stage_id, changed_by_id ?? null);

  // Update account current stage
  db.prepare(`
    UPDATE accounts SET current_stage_id = ?, updated_at = datetime('now') WHERE id = ?
  `).run(to_stage_id, req.params.id);

  emit('stage_change', {
    account_id:     Number(req.params.id),
    account_name:   account.name,
    from_stage_id:  account.current_stage_id,
    to_stage_id,
    to_stage_name:  toStage.name,
    changed_by_id,
  });

  res.json({ ok: true, from_stage_id: account.current_stage_id, to_stage_id, to_stage_name: toStage.name });
});

module.exports = router;
