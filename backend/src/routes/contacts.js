/**
 * routes/contacts.js
 * GET    /api/contacts           — list with search + account filter
 * POST   /api/contacts           — create
 * GET    /api/contacts/:id       — detail
 * PATCH  /api/contacts/:id       — update
 * DELETE /api/contacts/:id       — soft delete
 */

const router = require('express').Router();
const db     = require('../db/db');

const CONTACT_SELECT = `
  SELECT c.*,
         a.name AS account_name,
         a.id   AS account_id
  FROM contacts c
  LEFT JOIN accounts a ON c.account_id = a.id AND a.deleted_at IS NULL
  WHERE c.deleted_at IS NULL
`;

// ── GET /api/contacts ──────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  const { q, account_id, limit = 200, offset = 0 } = req.query;

  let sql = CONTACT_SELECT;
  const params = [];

  if (q) {
    sql += ` AND (lower(c.name) LIKE lower(?) OR lower(c.email) LIKE lower(?) OR lower(c.title) LIKE lower(?))`;
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (account_id) {
    sql += ` AND c.account_id = ?`;
    params.push(account_id);
  }

  sql += ` ORDER BY c.name ASC LIMIT ? OFFSET ?`;
  params.push(Number(limit), Number(offset));

  const contacts = db.prepare(sql).all(...params);
  res.json({ ok: true, contacts });
});

// ── POST /api/contacts ─────────────────────────────────────────────────────────

router.post('/', (req, res) => {
  const { account_id, name, email, phone, title, linkedin_url, notes } = req.body;
  if (!account_id) return res.status(400).json({ error: 'account_id is required' });

  const account = db.prepare(`SELECT id FROM accounts WHERE id = ? AND deleted_at IS NULL`).get(account_id);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  const info = db.prepare(`
    INSERT INTO contacts (account_id, name, email, phone, title, linkedin_url, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    account_id,
    name        ?? null,
    email       ?? null,
    phone       ?? null,
    title       ?? null,
    linkedin_url ?? null,
    notes       ?? null,
  );

  const contact = db.prepare(`${CONTACT_SELECT} AND c.id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ ok: true, contact });
});

// ── GET /api/contacts/:id ──────────────────────────────────────────────────────

router.get('/:id', (req, res) => {
  const contact = db.prepare(`${CONTACT_SELECT} AND c.id = ?`).get(req.params.id);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  res.json({ ok: true, contact });
});

// ── PATCH /api/contacts/:id ────────────────────────────────────────────────────

router.patch('/:id', (req, res) => {
  const contact = db.prepare(`SELECT id FROM contacts WHERE id = ? AND deleted_at IS NULL`).get(req.params.id);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });

  const { name, email, phone, title, linkedin_url, notes, account_id } = req.body;
  const updates = [], params = [];

  if (name         !== undefined) { updates.push(`name = ?`);          params.push(name ?? null); }
  if (email        !== undefined) { updates.push(`email = ?`);         params.push(email ?? null); }
  if (phone        !== undefined) { updates.push(`phone = ?`);         params.push(phone ?? null); }
  if (title        !== undefined) { updates.push(`title = ?`);         params.push(title ?? null); }
  if (linkedin_url !== undefined) { updates.push(`linkedin_url = ?`);  params.push(linkedin_url ?? null); }
  if (notes        !== undefined) { updates.push(`notes = ?`);         params.push(notes ?? null); }
  if (account_id   !== undefined) { updates.push(`account_id = ?`);   params.push(account_id); }

  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

  updates.push(`updated_at = datetime('now')`);
  params.push(req.params.id);
  db.prepare(`UPDATE contacts SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare(`${CONTACT_SELECT} AND c.id = ?`).get(req.params.id);
  res.json({ ok: true, contact: updated });
});

// ── DELETE /api/contacts/:id ───────────────────────────────────────────────────

router.delete('/:id', (req, res) => {
  const contact = db.prepare(`SELECT id FROM contacts WHERE id = ? AND deleted_at IS NULL`).get(req.params.id);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });

  db.prepare(`UPDATE contacts SET deleted_at = datetime('now') WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
