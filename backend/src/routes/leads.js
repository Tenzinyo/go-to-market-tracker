/**
 * routes/leads.js
 *
 * GET  /api/leads          — list accounts that have a lifecycle_stage set
 * GET  /api/leads/funnel   — counts + conversion rates per lifecycle stage
 * PATCH /api/leads/:id     — update lifecycle_stage / lead_source / lead_score
 */

const router = require('express').Router();
const db     = require('../db/db');
const { emit } = require('../services/sseEmitter');
const { fireTrigger } = require('../services/workflowEngine');

const LIFECYCLE_STAGES = ['lead', 'mql', 'sql', 'opportunity', 'customer', 'churned'];

const LIFECYCLE_META = {
  lead:        { label: 'Lead',        color: '#94a3b8' },
  mql:         { label: 'MQL',         color: '#60a5fa' },
  sql:         { label: 'SQL',         color: '#818cf8' },
  opportunity: { label: 'Opportunity', color: '#a78bfa' },
  customer:    { label: 'Customer',    color: '#34d399' },
  churned:     { label: 'Churned',     color: '#f87171' },
};

const LEAD_SOURCES = ['inbound', 'outbound', 'referral', 'event', 'partner', 'other'];

// ── GET /api/leads ────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  const { lifecycle_stage, lead_source, owner_id, q, limit = 200, offset = 0 } = req.query;

  let sql = `
    SELECT a.*,
           s.name        AS stage_name,
           s.color_hex   AS stage_color,
           u.display_name AS owner_name,
           (SELECT MAX(COALESCE(e.meeting_date, date(e.created_at)))
            FROM entries e WHERE e.account_id = a.id AND e.deleted_at IS NULL) AS last_activity_date,
           (SELECT COUNT(*) FROM entries e WHERE e.account_id = a.id AND e.deleted_at IS NULL) AS activity_count
    FROM accounts a
    LEFT JOIN stages s ON a.current_stage_id = s.id
    LEFT JOIN users  u ON a.owner_id = u.id
    WHERE a.deleted_at IS NULL AND a.lifecycle_stage IS NOT NULL
  `;
  const params = [];

  if (lifecycle_stage) {
    sql += ` AND a.lifecycle_stage = ?`;
    params.push(lifecycle_stage);
  }
  if (lead_source) {
    sql += ` AND a.lead_source = ?`;
    params.push(lead_source);
  }
  if (owner_id) {
    sql += ` AND a.owner_id = ?`;
    params.push(Number(owner_id));
  }
  if (q) {
    sql += ` AND lower(a.name) LIKE lower(?)`;
    params.push(`%${q}%`);
  }

  sql += ` ORDER BY COALESCE(a.lead_score, 0) DESC, a.updated_at DESC LIMIT ? OFFSET ?`;
  params.push(Number(limit), Number(offset));

  const leads = db.prepare(sql).all(...params);
  res.json({ ok: true, leads, lifecycle_stages: LIFECYCLE_STAGES, lifecycle_meta: LIFECYCLE_META, lead_sources: LEAD_SOURCES });
});

// ── GET /api/leads/funnel ─────────────────────────────────────────────────────

router.get('/funnel', (_req, res) => {
  const rows = db.prepare(`
    SELECT lifecycle_stage, COUNT(*) AS count
    FROM accounts
    WHERE deleted_at IS NULL AND lifecycle_stage IS NOT NULL
    GROUP BY lifecycle_stage
  `).all();

  const countMap = Object.fromEntries(rows.map(r => [r.lifecycle_stage, r.count]));

  const funnel = LIFECYCLE_STAGES.map(stage => ({
    stage,
    ...LIFECYCLE_META[stage],
    count: countMap[stage] ?? 0,
  }));

  // Conversion rate from previous stage
  for (let i = 1; i < funnel.length; i++) {
    const prev = funnel[i - 1].count;
    funnel[i].conversion_rate = prev > 0 ? Math.round((funnel[i].count / prev) * 100) : null;
  }

  const sources = db.prepare(`
    SELECT lead_source, COUNT(*) AS count
    FROM accounts
    WHERE deleted_at IS NULL AND lifecycle_stage IS NOT NULL AND lead_source IS NOT NULL
    GROUP BY lead_source
    ORDER BY count DESC
  `).all();

  const total = rows.reduce((s, r) => s + r.count, 0);

  res.json({ ok: true, funnel, sources, total });
});

// ── PATCH /api/leads/:id ──────────────────────────────────────────────────────

router.patch('/:id', (req, res) => {
  const account = db.prepare(`SELECT * FROM accounts WHERE id = ? AND deleted_at IS NULL`).get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  const { lifecycle_stage, lead_source, lead_score } = req.body;
  const updates = [];
  const params  = [];

  if (lifecycle_stage !== undefined) {
    if (lifecycle_stage !== null && !LIFECYCLE_STAGES.includes(lifecycle_stage)) {
      return res.status(400).json({ error: `Invalid lifecycle_stage. Must be one of: ${LIFECYCLE_STAGES.join(', ')}` });
    }
    updates.push(`lifecycle_stage = ?`);
    params.push(lifecycle_stage);
  }
  if (lead_source !== undefined) {
    updates.push(`lead_source = ?`);
    params.push(lead_source ?? null);
  }
  if (lead_score !== undefined) {
    updates.push(`lead_score = ?`);
    params.push(Number(lead_score));
  }

  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

  updates.push(`updated_at = datetime('now')`);
  params.push(req.params.id);
  db.prepare(`UPDATE accounts SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare(`SELECT * FROM accounts WHERE id = ?`).get(req.params.id);
  emit('account_updated', { id: updated.id });

  if (lifecycle_stage !== undefined && lifecycle_stage && lifecycle_stage !== account.lifecycle_stage) {
    fireTrigger('lifecycle_changed', {
      account_id:      Number(req.params.id),
      account_name:    account.name,
      lifecycle_stage: lifecycle_stage,
    });
  }

  res.json({ ok: true, account: updated });
});

module.exports = router;
