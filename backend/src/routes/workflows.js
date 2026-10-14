/**
 * routes/workflows.js
 *
 * GET    /api/workflows          — list all
 * POST   /api/workflows          — create
 * PATCH  /api/workflows/:id      — update (name, enabled, configs)
 * DELETE /api/workflows/:id      — delete workflow + its run log
 * GET    /api/workflows/runs     — recent run log
 * GET    /api/workflows/meta     — available triggers/actions + stage/user lists
 */

const router = require('express').Router();
const db     = require('../db/db');
const { requireRole } = require('../middleware/rbac');

const TRIGGER_TYPES = ['stage_changed', 'lifecycle_changed', 'deal_created', 'inactivity_days'];
const ACTION_TYPES  = ['create_task', 'advance_lifecycle'];

// ── GET /api/workflows/meta ───────────────────────────────────────────────────

router.get('/meta', (_req, res) => {
  const stages = db.prepare(`SELECT id, name FROM stages WHERE deleted_at IS NULL ORDER BY order_index`).all();
  const users  = db.prepare(`SELECT id, display_name FROM users ORDER BY display_name`).all();

  const triggers = [
    { key: 'stage_changed',     label: 'Stage moved',             description: 'When an account or deal is moved to a specific stage' },
    { key: 'lifecycle_changed', label: 'Lifecycle stage changed', description: 'When an account lifecycle stage is updated' },
    { key: 'deal_created',      label: 'New deal created',        description: 'When any new deal is created' },
    { key: 'inactivity_days',   label: 'Account inactivity',      description: 'When an account has no logged activity for N days' },
  ];

  const actions = [
    { key: 'create_task',       label: 'Create a task',           description: 'Automatically create a task linked to the account or deal' },
    { key: 'advance_lifecycle', label: 'Advance lifecycle stage', description: 'Move the account to the next lifecycle stage' },
  ];

  res.json({ ok: true, triggers, actions, stages, users });
});

// ── GET /api/workflows ────────────────────────────────────────────────────────

router.get('/', (_req, res) => {
  const workflows = db.prepare(`SELECT * FROM workflows ORDER BY created_at DESC`).all();
  res.json({ ok: true, workflows });
});

// ── GET /api/workflows/runs ───────────────────────────────────────────────────

router.get('/runs', (req, res) => {
  const { limit = 50 } = req.query;
  const runs = db.prepare(`
    SELECT wr.*, w.name AS workflow_name
    FROM workflow_runs wr
    JOIN workflows w ON wr.workflow_id = w.id
    ORDER BY wr.ran_at DESC
    LIMIT ?
  `).all(Number(limit));
  res.json({ ok: true, runs });
});

// ── POST /api/workflows ───────────────────────────────────────────────────────

router.post('/', requireRole('manager'), (req, res) => {
  const { name, trigger_type, trigger_config = {}, action_type, action_config = {} } = req.body;

  if (!name?.trim())                   return res.status(400).json({ error: 'name is required' });
  if (!TRIGGER_TYPES.includes(trigger_type)) return res.status(400).json({ error: `invalid trigger_type` });
  if (!ACTION_TYPES.includes(action_type))   return res.status(400).json({ error: `invalid action_type` });

  const info = db.prepare(`
    INSERT INTO workflows (name, trigger_type, trigger_config, action_type, action_config)
    VALUES (?, ?, ?, ?, ?)
  `).run(name.trim(), trigger_type, JSON.stringify(trigger_config), action_type, JSON.stringify(action_config));

  const wf = db.prepare(`SELECT * FROM workflows WHERE id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ ok: true, workflow: wf });
});

// ── PATCH /api/workflows/:id ──────────────────────────────────────────────────

router.patch('/:id', requireRole('manager'), (req, res) => {
  const wf = db.prepare(`SELECT id FROM workflows WHERE id = ?`).get(req.params.id);
  if (!wf) return res.status(404).json({ error: 'Workflow not found' });

  const { name, enabled, trigger_type, trigger_config, action_type, action_config } = req.body;
  const updates = [];
  const params  = [];

  if (name !== undefined)           { updates.push(`name = ?`);           params.push(name.trim()); }
  if (enabled !== undefined)        { updates.push(`enabled = ?`);        params.push(enabled ? 1 : 0); }
  if (trigger_type !== undefined)   { updates.push(`trigger_type = ?`);   params.push(trigger_type); }
  if (trigger_config !== undefined) { updates.push(`trigger_config = ?`); params.push(JSON.stringify(trigger_config)); }
  if (action_type !== undefined)    { updates.push(`action_type = ?`);    params.push(action_type); }
  if (action_config !== undefined)  { updates.push(`action_config = ?`);  params.push(JSON.stringify(action_config)); }

  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

  updates.push(`updated_at = datetime('now')`);
  params.push(req.params.id);
  db.prepare(`UPDATE workflows SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare(`SELECT * FROM workflows WHERE id = ?`).get(req.params.id);
  res.json({ ok: true, workflow: updated });
});

// ── DELETE /api/workflows/:id ─────────────────────────────────────────────────

router.delete('/:id', requireRole('manager'), (req, res) => {
  const wf = db.prepare(`SELECT id FROM workflows WHERE id = ?`).get(req.params.id);
  if (!wf) return res.status(404).json({ error: 'Workflow not found' });

  db.prepare(`DELETE FROM workflow_runs WHERE workflow_id = ?`).run(req.params.id);
  db.prepare(`DELETE FROM workflows WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
