/**
 * routes/quotas.js
 *
 * GET    /api/quotas              — list quotas (optionally filtered by period) with live progress
 * POST   /api/quotas              — create quota  (manager+)
 * PATCH  /api/quotas/:id          — update target / dates (manager+)
 * DELETE /api/quotas/:id          — delete (manager+)
 * GET    /api/quotas/leaderboard  — team attainment for a given period
 */

const router = require('express').Router();
const db     = require('../db/db');
const { requireRole } = require('../middleware/rbac');

// ── Progress calculator ───────────────────────────────────────────────────────

function calcProgress(quota) {
  switch (quota.metric_type) {
    case 'deal_value':
      return db.prepare(`
        SELECT COALESCE(ROUND(SUM(d.amount), 2), 0) AS achieved
        FROM deals d
        WHERE d.owner_id = ? AND d.deleted_at IS NULL
          AND d.won_at IS NOT NULL
          AND date(d.won_at) BETWEEN ? AND ?
      `).get(quota.user_id, quota.period_start, quota.period_end)?.achieved ?? 0;

    case 'deal_count':
      return db.prepare(`
        SELECT COUNT(*) AS achieved
        FROM deals d
        WHERE d.owner_id = ? AND d.deleted_at IS NULL
          AND d.won_at IS NOT NULL
          AND date(d.won_at) BETWEEN ? AND ?
      `).get(quota.user_id, quota.period_start, quota.period_end)?.achieved ?? 0;

    case 'activity_count':
      return db.prepare(`
        SELECT COUNT(*) AS achieved
        FROM entries e
        WHERE e.owner_id = ? AND e.deleted_at IS NULL
          AND COALESCE(e.meeting_date, date(e.created_at)) BETWEEN ? AND ?
      `).get(quota.user_id, quota.period_start, quota.period_end)?.achieved ?? 0;

    default:
      return 0;
  }
}

function enrich(quota) {
  const achieved    = calcProgress(quota);
  const attainment  = quota.target > 0 ? Math.round((achieved / quota.target) * 100) : 0;
  return { ...quota, achieved, attainment };
}

// ── GET /api/quotas/leaderboard ───────────────────────────────────────────────

router.get('/leaderboard', (req, res) => {
  const { period_start, period_end } = req.query;
  if (!period_start || !period_end) {
    return res.status(400).json({ error: 'period_start and period_end are required' });
  }

  // All users + their quotas for the period (one quota per user, first metric wins)
  const users = db.prepare(`SELECT id, display_name FROM users ORDER BY display_name`).all();
  const periodQuotas = db.prepare(`
    SELECT * FROM quotas
    WHERE period_start = ? AND period_end = ?
    ORDER BY created_at ASC
  `).all(period_start, period_end);

  const byUser = {};
  for (const q of periodQuotas) {
    if (!byUser[q.user_id]) byUser[q.user_id] = [];
    byUser[q.user_id].push(enrich(q));
  }

  const board = users
    .filter(u => byUser[u.id]?.length > 0)
    .map(u => ({
      user_id:      u.id,
      display_name: u.display_name,
      quotas:       byUser[u.id],
      // Primary attainment = first quota's attainment
      attainment:   byUser[u.id][0]?.attainment ?? 0,
    }))
    .sort((a, b) => b.attainment - a.attainment);

  res.json({ ok: true, leaderboard: board, period_start, period_end });
});

// ── GET /api/quotas ───────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  const { user_id, period_start, period_end } = req.query;

  let sql = `SELECT q.*, u.display_name AS user_name FROM quotas q JOIN users u ON q.user_id = u.id WHERE 1=1`;
  const params = [];

  if (user_id)      { sql += ` AND q.user_id = ?`;      params.push(Number(user_id)); }
  if (period_start) { sql += ` AND q.period_start >= ?`; params.push(period_start); }
  if (period_end)   { sql += ` AND q.period_end <= ?`;   params.push(period_end); }

  sql += ` ORDER BY q.period_start DESC, u.display_name ASC`;

  const quotas = db.prepare(sql).all(...params).map(enrich);
  res.json({ ok: true, quotas });
});

// ── POST /api/quotas ──────────────────────────────────────────────────────────

router.post('/', requireRole('manager'), (req, res) => {
  const {
    user_id, period_type = 'custom', period_start, period_end,
    metric_type, target, currency = 'USD', label,
  } = req.body;

  if (!user_id)      return res.status(400).json({ error: 'user_id is required' });
  if (!period_start) return res.status(400).json({ error: 'period_start is required' });
  if (!period_end)   return res.status(400).json({ error: 'period_end is required' });
  if (!metric_type)  return res.status(400).json({ error: 'metric_type is required' });
  if (target == null)return res.status(400).json({ error: 'target is required' });

  const user = db.prepare(`SELECT id FROM users WHERE id = ?`).get(user_id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Check for duplicate (same user + period + metric)
  const dup = db.prepare(`
    SELECT id FROM quotas
    WHERE user_id = ? AND period_start = ? AND period_end = ? AND metric_type = ?
  `).get(Number(user_id), period_start, period_end, metric_type);
  if (dup) return res.status(409).json({ error: 'A quota for this user, period, and metric already exists' });

  const info = db.prepare(`
    INSERT INTO quotas (user_id, period_type, period_start, period_end, metric_type, target, currency, label)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(Number(user_id), period_type, period_start, period_end, metric_type, Number(target), currency, label ?? null);

  const quota = enrich(db.prepare(`
    SELECT q.*, u.display_name AS user_name FROM quotas q JOIN users u ON q.user_id = u.id WHERE q.id = ?
  `).get(info.lastInsertRowid));

  res.status(201).json({ ok: true, quota });
});

// ── PATCH /api/quotas/:id ─────────────────────────────────────────────────────

router.patch('/:id', requireRole('manager'), (req, res) => {
  const quota = db.prepare(`SELECT id FROM quotas WHERE id = ?`).get(req.params.id);
  if (!quota) return res.status(404).json({ error: 'Quota not found' });

  const { target, label, period_start, period_end, period_type } = req.body;
  const updates = [];
  const params  = [];

  if (target !== undefined)       { updates.push(`target = ?`);       params.push(Number(target)); }
  if (label !== undefined)        { updates.push(`label = ?`);        params.push(label ?? null); }
  if (period_start !== undefined) { updates.push(`period_start = ?`); params.push(period_start); }
  if (period_end !== undefined)   { updates.push(`period_end = ?`);   params.push(period_end); }
  if (period_type !== undefined)  { updates.push(`period_type = ?`);  params.push(period_type); }

  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

  updates.push(`updated_at = datetime('now')`);
  params.push(req.params.id);
  db.prepare(`UPDATE quotas SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const updated = enrich(db.prepare(`
    SELECT q.*, u.display_name AS user_name FROM quotas q JOIN users u ON q.user_id = u.id WHERE q.id = ?
  `).get(req.params.id));

  res.json({ ok: true, quota: updated });
});

// ── DELETE /api/quotas/:id ────────────────────────────────────────────────────

router.delete('/:id', requireRole('manager'), (req, res) => {
  const quota = db.prepare(`SELECT id FROM quotas WHERE id = ?`).get(req.params.id);
  if (!quota) return res.status(404).json({ error: 'Quota not found' });
  db.prepare(`DELETE FROM quotas WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
