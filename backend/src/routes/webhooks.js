/**
 * routes/webhooks.js
 * GET    /api/webhooks           — list all webhooks
 * POST   /api/webhooks           — create (admin)
 * PATCH  /api/webhooks/:id       — update name/url/events/active/secret (admin)
 * DELETE /api/webhooks/:id       — soft delete (admin)
 * POST   /api/webhooks/:id/test  — fire a test payload (admin)
 */

const router   = require('express').Router();
const db       = require('../db/db');
const { requireRole } = require('../middleware/rbac');
const { dispatch }    = require('../services/webhookDispatcher');

const ALLOWED_EVENTS = [
  'deal_created',
  'deal_won',
  'deal_lost',
  'account_created',
  'stage_changed',
  'task_due',
];

// ── GET /api/webhooks ──────────────────────────────────────────────────────────

router.get('/', (_req, res) => {
  const webhooks = db.prepare(
    `SELECT * FROM webhooks WHERE deleted_at IS NULL ORDER BY created_at DESC`
  ).all();
  res.json({ ok: true, webhooks, allowed_events: ALLOWED_EVENTS });
});

// ── POST /api/webhooks ─────────────────────────────────────────────────────────

router.post('/', requireRole('admin'), (req, res) => {
  const { name, url, events = [], secret } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!url)  return res.status(400).json({ error: 'url is required' });

  const info = db.prepare(
    `INSERT INTO webhooks (name, url, events, secret) VALUES (?, ?, ?, ?)`
  ).run(name, url, JSON.stringify(events), secret ?? null);

  const hook = db.prepare(`SELECT * FROM webhooks WHERE id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ ok: true, webhook: hook });
});

// ── PATCH /api/webhooks/:id ────────────────────────────────────────────────────

router.patch('/:id', requireRole('admin'), (req, res) => {
  const hook = db.prepare(
    `SELECT id FROM webhooks WHERE id = ? AND deleted_at IS NULL`
  ).get(req.params.id);
  if (!hook) return res.status(404).json({ error: 'Webhook not found' });

  const { name, url, events, active, secret } = req.body;
  const updates = [], params = [];

  if (name   !== undefined) { updates.push(`name = ?`);   params.push(name); }
  if (url    !== undefined) { updates.push(`url = ?`);    params.push(url); }
  if (events !== undefined) { updates.push(`events = ?`); params.push(JSON.stringify(events)); }
  if (active !== undefined) { updates.push(`active = ?`); params.push(active ? 1 : 0); }
  if (secret !== undefined) { updates.push(`secret = ?`); params.push(secret ?? null); }

  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
  params.push(req.params.id);
  db.prepare(`UPDATE webhooks SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  res.json({ ok: true, webhook: db.prepare(`SELECT * FROM webhooks WHERE id = ?`).get(req.params.id) });
});

// ── DELETE /api/webhooks/:id ───────────────────────────────────────────────────

router.delete('/:id', requireRole('admin'), (req, res) => {
  const hook = db.prepare(
    `SELECT id FROM webhooks WHERE id = ? AND deleted_at IS NULL`
  ).get(req.params.id);
  if (!hook) return res.status(404).json({ error: 'Webhook not found' });

  db.prepare(`UPDATE webhooks SET deleted_at = datetime('now') WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// ── POST /api/webhooks/:id/test ────────────────────────────────────────────────

router.post('/:id/test', requireRole('admin'), (req, res) => {
  const hook = db.prepare(
    `SELECT * FROM webhooks WHERE id = ? AND deleted_at IS NULL`
  ).get(req.params.id);
  if (!hook) return res.status(404).json({ error: 'Webhook not found' });

  dispatch('test', {
    message:      'GTM Tracker webhook test',
    webhook_id:   hook.id,
    webhook_name: hook.name,
  });
  res.json({ ok: true, message: 'Test payload dispatched' });
});

module.exports = router;
