/**
 * routes/stages.js
 * GET    /api/stages      — ordered list with colors
 * POST   /api/stages      — create new stage
 * PATCH  /api/stages/:id  — update name, color, order
 * DELETE /api/stages/:id  — soft delete (blocked if accounts in stage)
 */

const router = require('express').Router();
const db     = require('../db/db');
const { emit } = require('../services/sseEmitter');
const { requireRole } = require('../middleware/rbac');

router.get('/', (req, res) => {
  const { pipeline_id } = req.query;
  let sql = `
    SELECT s.*, p.name AS pipeline_name, p.is_default AS pipeline_is_default
    FROM stages s
    LEFT JOIN pipelines p ON s.pipeline_id = p.id
    WHERE s.deleted_at IS NULL
  `;
  const params = [];
  if (pipeline_id) {
    sql += ` AND s.pipeline_id = ?`;
    params.push(Number(pipeline_id));
  }
  sql += ` ORDER BY s.order_index ASC`;
  const stages = db.prepare(sql).all(...params);
  res.json({ ok: true, stages });
});

router.post('/', requireRole('admin'), (req, res) => {
  const { name, color_hex = '#CCCCCC', text_color_hex = '#2B2B2B', pipeline_id } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  // Resolve pipeline: use provided or fall back to default
  let resolvedPipelineId = pipeline_id ? Number(pipeline_id) : null;
  if (!resolvedPipelineId) {
    const def = db.prepare(`SELECT id FROM pipelines WHERE is_default = 1 AND deleted_at IS NULL`).get();
    resolvedPipelineId = def?.id ?? null;
  }

  const maxOrder = db.prepare(`
    SELECT MAX(order_index) as m FROM stages WHERE pipeline_id = ? AND deleted_at IS NULL
  `).get(resolvedPipelineId);
  const order_index = (maxOrder?.m ?? 0) + 1;

  const info = db.prepare(`
    INSERT INTO stages (name, order_index, color_hex, text_color_hex, pipeline_id) VALUES (?, ?, ?, ?, ?)
  `).run(name, order_index, color_hex, text_color_hex, resolvedPipelineId);

  const stage = db.prepare(`SELECT * FROM stages WHERE id = ?`).get(info.lastInsertRowid);
  emit('stage_created', { stage });
  res.status(201).json({ ok: true, stage });
});

router.patch('/:id', requireRole('admin'), (req, res) => {
  const stage = db.prepare(`SELECT id FROM stages WHERE id = ? AND deleted_at IS NULL`).get(req.params.id);
  if (!stage) return res.status(404).json({ error: 'Stage not found' });

  const { name, color_hex, text_color_hex, order_index } = req.body;
  const updates = [];
  const params  = [];

  if (name)            { updates.push(`name = ?`);            params.push(name); }
  if (color_hex)       { updates.push(`color_hex = ?`);       params.push(color_hex); }
  if (text_color_hex)  { updates.push(`text_color_hex = ?`);  params.push(text_color_hex); }
  if (order_index !== undefined) { updates.push(`order_index = ?`); params.push(order_index); }

  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

  updates.push(`updated_at = datetime('now')`);
  params.push(req.params.id);
  db.prepare(`UPDATE stages SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare(`SELECT * FROM stages WHERE id = ?`).get(req.params.id);
  emit('stage_updated', { stage: updated });
  res.json({ ok: true, stage: updated });
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  const inUse = db.prepare(`
    SELECT COUNT(*) as c FROM accounts WHERE current_stage_id = ? AND deleted_at IS NULL
  `).get(req.params.id);

  if (inUse.c > 0) {
    return res.status(409).json({
      error: `Cannot delete: ${inUse.c} account(s) are in this stage. Move them first.`,
    });
  }

  db.prepare(`UPDATE stages SET deleted_at = datetime('now') WHERE id = ?`).run(req.params.id);
  emit('stage_deleted', { id: Number(req.params.id) });
  res.json({ ok: true });
});

module.exports = router;
