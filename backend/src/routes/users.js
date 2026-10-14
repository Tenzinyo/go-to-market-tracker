/**
 * routes/users.js
 * GET    /api/users      — list all users
 * POST   /api/users      — create user
 * PATCH  /api/users/:id  — update display_name or timezone
 */

const router = require('express').Router();
const db     = require('../db/db');
const { requireRole } = require('../middleware/rbac');

const VALID_ROLES = ['admin', 'manager', 'rep'];

router.get('/', (_req, res) => {
  const users = db.prepare(`SELECT * FROM users ORDER BY display_name ASC`).all();
  res.json({ ok: true, users });
});

router.post('/', (req, res) => {
  const { display_name, email, timezone = 'America/New_York' } = req.body;
  if (!display_name) return res.status(400).json({ error: 'display_name is required' });

  const info = db.prepare(`
    INSERT INTO users (display_name, email, timezone) VALUES (?, ?, ?)
  `).run(display_name, email ?? null, timezone);

  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ ok: true, user });
});

router.patch('/:id', (req, res) => {
  const user = db.prepare(`SELECT id FROM users WHERE id = ?`).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { display_name, email, timezone, role } = req.body;
  const updates = [];
  const params  = [];

  if (display_name)        { updates.push(`display_name = ?`); params.push(display_name); }
  if (email !== undefined) { updates.push(`email = ?`);        params.push(email || null); }
  if (timezone)            { updates.push(`timezone = ?`);     params.push(timezone); }
  if (role !== undefined) {
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: `Invalid role. Must be: ${VALID_ROLES.join(', ')}` });
    // Only admins may change roles — enforced via the route-level middleware below
    updates.push(`role = ?`);
    params.push(role);
  }

  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

  params.push(req.params.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.params.id);
  res.json({ ok: true, user: updated });
});

// ── PATCH /api/users/:id/role — admin-only role assignment ───────────────────

router.patch('/:id/role', requireRole('admin'), (req, res) => {
  const user = db.prepare(`SELECT id FROM users WHERE id = ?`).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { role } = req.body;
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `Invalid role. Must be: ${VALID_ROLES.join(', ')}` });
  }

  db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(role, req.params.id);
  const updated = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.params.id);
  res.json({ ok: true, user: updated });
});

// ── DELETE /api/users/:id — admin-only ────────────────────────────────────────

router.delete('/:id', requireRole('admin'), (req, res) => {
  const user = db.prepare(`SELECT id FROM users WHERE id = ?`).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Prevent deleting the last admin
  const adminCount = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE role = 'admin'`).get();
  const isAdmin    = db.prepare(`SELECT role FROM users WHERE id = ?`).get(req.params.id);
  if (isAdmin?.role === 'admin' && adminCount.c <= 1) {
    return res.status(409).json({ error: 'Cannot delete the last admin account' });
  }

  db.prepare(`DELETE FROM users WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
