/**
 * routes/users.js
 * GET    /api/users      — list all users
 * POST   /api/users      — create user
 * PATCH  /api/users/:id  — update display_name or timezone
 */

const router = require('express').Router();
const db     = require('../db/db');

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

  const { display_name, email, timezone } = req.body;
  const updates = [];
  const params  = [];

  if (display_name)      { updates.push(`display_name = ?`); params.push(display_name); }
  if (email !== undefined) { updates.push(`email = ?`);      params.push(email || null); }
  if (timezone)          { updates.push(`timezone = ?`);     params.push(timezone); }

  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

  params.push(req.params.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.params.id);
  res.json({ ok: true, user: updated });
});

module.exports = router;
