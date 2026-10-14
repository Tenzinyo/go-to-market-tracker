/**
 * routes/pipelines.js
 *
 * GET    /api/pipelines        — list all pipelines (with stage count)
 * POST   /api/pipelines        — create  (admin)
 * PATCH  /api/pipelines/:id    — rename / update description (admin)
 * DELETE /api/pipelines/:id    — soft delete (admin; blocked if stages exist)
 */

const router = require('express').Router();
const db     = require('../db/db');
const { requireRole } = require('../middleware/rbac');

router.get('/', (_req, res) => {
  const pipelines = db.prepare(`
    SELECT p.*,
           (SELECT COUNT(*) FROM stages s WHERE s.pipeline_id = p.id AND s.deleted_at IS NULL) AS stage_count
    FROM pipelines p
    WHERE p.deleted_at IS NULL
    ORDER BY p.is_default DESC, p.created_at ASC
  `).all();
  res.json({ ok: true, pipelines });
});

router.post('/', requireRole('admin'), (req, res) => {
  const { name, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

  const info = db.prepare(`
    INSERT INTO pipelines (name, description) VALUES (?, ?)
  `).run(name.trim(), description?.trim() ?? null);

  const pipeline = db.prepare(`SELECT * FROM pipelines WHERE id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ ok: true, pipeline });
});

router.patch('/:id', requireRole('admin'), (req, res) => {
  const pipeline = db.prepare(`SELECT id FROM pipelines WHERE id = ? AND deleted_at IS NULL`).get(req.params.id);
  if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' });

  const { name, description } = req.body;
  const updates = [];
  const params  = [];

  if (name)        { updates.push(`name = ?`);        params.push(name.trim()); }
  if (description !== undefined) { updates.push(`description = ?`); params.push(description ?? null); }
  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

  params.push(req.params.id);
  db.prepare(`UPDATE pipelines SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare(`SELECT * FROM pipelines WHERE id = ?`).get(req.params.id);
  res.json({ ok: true, pipeline: updated });
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  const pipeline = db.prepare(`SELECT * FROM pipelines WHERE id = ? AND deleted_at IS NULL`).get(req.params.id);
  if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' });

  if (pipeline.is_default) {
    return res.status(409).json({ error: 'Cannot delete the default pipeline' });
  }

  const stageCount = db.prepare(`
    SELECT COUNT(*) AS c FROM stages WHERE pipeline_id = ? AND deleted_at IS NULL
  `).get(req.params.id);

  if (stageCount.c > 0) {
    return res.status(409).json({
      error: `Cannot delete: ${stageCount.c} stage(s) still belong to this pipeline. Delete them first.`,
    });
  }

  db.prepare(`UPDATE pipelines SET deleted_at = datetime('now') WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
