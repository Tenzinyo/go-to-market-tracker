/**
 * routes/settings.js
 * GET   /api/settings     — all key-value settings
 * PATCH /api/settings     — update one or more settings
 */

const router = require('express').Router();
const db     = require('../db/db');

router.get('/', (_req, res) => {
  const rows = db.prepare(`SELECT key, value, updated_at FROM settings ORDER BY key`).all();
  // Return as flat object for easy use on the frontend
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json({ ok: true, settings });
});

router.patch('/', (req, res) => {
  const allowed = [
    'stale_days_threshold',
    'default_timezone',
    'app_name',
  ];

  const update = db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);

  const updated = [];
  for (const key of allowed) {
    if (key in req.body) {
      update.run(key, String(req.body[key]));
      updated.push(key);
    }
  }

  if (updated.length === 0) return res.status(400).json({ error: 'No valid settings keys provided' });

  const rows = db.prepare(`SELECT key, value FROM settings ORDER BY key`).all();
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json({ ok: true, updated, settings });
});

module.exports = router;
