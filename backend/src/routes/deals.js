/**
 * routes/deals.js
 * GET    /api/deals              — list with filters
 * POST   /api/deals              — create
 * GET    /api/deals/:id          — detail + stage history + activities
 * PATCH  /api/deals/:id          — update fields
 * DELETE /api/deals/:id          — soft delete
 * POST   /api/deals/:id/stage    — move to a new stage
 */

const router = require('express').Router();
const db     = require('../db/db');
const { emit }        = require('../services/sseEmitter');
const { fireTrigger } = require('../services/workflowEngine');
const { requireRole } = require('../middleware/rbac');
const slack    = require('../services/slackNotifier');
const { dispatch } = require('../services/webhookDispatcher');

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEAL_SELECT = `
  SELECT d.*,
         a.name  AS account_name,
         u.display_name AS owner_name,
         s.name  AS stage_name,
         s.color_hex,
         s.text_color_hex
  FROM deals d
  LEFT JOIN accounts a ON d.account_id = a.id
  LEFT JOIN users    u ON d.owner_id   = u.id
  LEFT JOIN stages   s ON d.current_stage_id = s.id
`;

// ── GET /api/deals ─────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  const {
    account_id, owner_id, stage_id, forecast_category,
    close_date_from, close_date_to, q,
    limit = 200, offset = 0,
  } = req.query;

  let sql = `${DEAL_SELECT} WHERE d.deleted_at IS NULL`;
  const params = [];

  if (account_id)       { sql += ` AND d.account_id = ?`;        params.push(account_id); }
  if (owner_id)         { sql += ` AND d.owner_id = ?`;          params.push(owner_id); }
  if (stage_id)         { sql += ` AND d.current_stage_id = ?`;  params.push(stage_id); }
  if (forecast_category){ sql += ` AND d.forecast_category = ?`; params.push(forecast_category); }
  if (close_date_from)  { sql += ` AND d.close_date >= ?`;       params.push(close_date_from); }
  if (close_date_to)    { sql += ` AND d.close_date <= ?`;       params.push(close_date_to); }
  if (q)                { sql += ` AND lower(d.name) LIKE lower(?)`; params.push(`%${q}%`); }

  sql += ` ORDER BY d.updated_at DESC LIMIT ? OFFSET ?`;
  params.push(Number(limit), Number(offset));

  const deals = db.prepare(sql).all(...params);

  // Summary stats
  const statsSql = `
    SELECT
      COUNT(*)                                        AS total_count,
      SUM(CASE WHEN d.deleted_at IS NULL THEN 1 END) AS active_count,
      SUM(COALESCE(d.amount, 0))                      AS total_pipeline,
      SUM(COALESCE(d.amount, 0) * COALESCE(d.probability, 0) / 100.0) AS weighted_pipeline
    FROM deals d
    WHERE d.deleted_at IS NULL
      AND d.won_at IS NULL AND d.lost_at IS NULL
  `;
  const stats = db.prepare(statsSql).get();

  res.json({ ok: true, deals, stats });
});

// ── POST /api/deals ────────────────────────────────────────────────────────────

router.post('/', (req, res) => {
  const {
    name, account_id, owner_id, current_stage_id,
    amount, currency = 'USD', close_date, probability = 0,
    forecast_category = 'pipeline', product_line, description, tags,
  } = req.body;

  if (!name)       return res.status(400).json({ error: 'name is required' });
  if (!account_id) return res.status(400).json({ error: 'account_id is required' });

  const account = db.prepare(`SELECT id FROM accounts WHERE id = ? AND deleted_at IS NULL`).get(account_id);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  const info = db.prepare(`
    INSERT INTO deals (name, account_id, owner_id, current_stage_id, amount, currency,
                       close_date, probability, forecast_category, product_line, description, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name,
    account_id,
    owner_id          ?? null,
    current_stage_id  ?? null,
    amount            != null ? Number(amount) : null,
    currency,
    close_date        ?? null,
    Number(probability),
    forecast_category,
    product_line      ?? null,
    description       ?? null,
    JSON.stringify(tags ?? []),
  );

  // Log initial stage if provided
  if (current_stage_id) {
    db.prepare(`
      INSERT INTO deal_stage_history (deal_id, from_stage_id, to_stage_id, changed_by_id)
      VALUES (?, NULL, ?, ?)
    `).run(info.lastInsertRowid, current_stage_id, owner_id ?? null);
  }

  const deal = db.prepare(`${DEAL_SELECT} WHERE d.id = ?`).get(info.lastInsertRowid);
  emit('deal_created', { id: deal.id, name: deal.name, account_id: deal.account_id });

  fireTrigger('deal_created', {
    deal_id:      deal.id,
    deal_name:    deal.name,
    account_id:   deal.account_id,
    account_name: deal.account_name,
  });

  const dealCtx = { deal_id: deal.id, deal_name: deal.name, account_name: deal.account_name, amount: deal.amount, currency: deal.currency };
  slack.notify(`:handshake: New deal created: *${deal.name}* (${deal.account_name})`);
  dispatch('deal_created', dealCtx);

  res.status(201).json({ ok: true, deal });
});

// ── GET /api/deals/:id ────────────────────────────────────────────────────────

router.get('/:id', (req, res) => {
  const deal = db.prepare(`${DEAL_SELECT} WHERE d.id = ? AND d.deleted_at IS NULL`).get(req.params.id);
  if (!deal) return res.status(404).json({ error: 'Deal not found' });

  // Stage history
  const stageHistory = db.prepare(`
    SELECT dsh.*,
           sf.name AS from_stage, sf.color_hex AS from_color,
           st.name AS to_stage,   st.color_hex AS to_color,
           u.display_name AS changed_by
    FROM deal_stage_history dsh
    LEFT JOIN stages sf ON dsh.from_stage_id = sf.id
    LEFT JOIN stages st ON dsh.to_stage_id   = st.id
    LEFT JOIN users  u  ON dsh.changed_by_id = u.id
    WHERE dsh.deal_id = ?
    ORDER BY dsh.changed_at DESC
  `).all(req.params.id);

  // Activities linked to this deal (via deal_id) or to the account
  const activities = db.prepare(`
    SELECT e.*, u.display_name AS owner_name, s.name AS stage_name, s.color_hex
    FROM entries e
    LEFT JOIN users  u ON e.owner_id = u.id
    LEFT JOIN stages s ON e.stage_id = s.id
    WHERE e.deleted_at IS NULL
      AND (e.deal_id = ? OR (e.deal_id IS NULL AND e.account_id = ?))
    ORDER BY e.created_at DESC
    LIMIT 50
  `).all(req.params.id, deal.account_id);

  res.json({ ok: true, deal, stage_history: stageHistory, activities });
});

// ── PATCH /api/deals/:id ──────────────────────────────────────────────────────

router.patch('/:id', (req, res) => {
  const deal = db.prepare(`SELECT * FROM deals WHERE id = ? AND deleted_at IS NULL`).get(req.params.id);
  if (!deal) return res.status(404).json({ error: 'Deal not found' });

  const allowed = [
    'name', 'owner_id', 'current_stage_id', 'amount', 'currency',
    'close_date', 'probability', 'forecast_category',
    'product_line', 'description', 'tags', 'lost_reason',
  ];

  const updates = [];
  const params  = [];

  for (const field of allowed) {
    if (!(field in req.body)) continue;
    let val = req.body[field];
    if (field === 'tags')   val = JSON.stringify(val ?? []);
    if (field === 'amount') val = val != null ? Number(val) : null;
    updates.push(`${field} = ?`);
    params.push(val);
  }

  if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  updates.push(`updated_at = datetime('now')`);
  params.push(req.params.id);

  db.prepare(`UPDATE deals SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare(`${DEAL_SELECT} WHERE d.id = ?`).get(req.params.id);
  emit('deal_updated', { id: updated.id, account_id: updated.account_id });
  res.json({ ok: true, deal: updated });
});

// ── DELETE /api/deals/:id ─────────────────────────────────────────────────────

router.delete('/:id', requireRole('manager'), (req, res) => {
  const deal = db.prepare(`SELECT id FROM deals WHERE id = ? AND deleted_at IS NULL`).get(req.params.id);
  if (!deal) return res.status(404).json({ error: 'Deal not found' });

  db.prepare(`UPDATE deals SET deleted_at = datetime('now') WHERE id = ?`).run(req.params.id);
  emit('deal_deleted', { id: req.params.id });
  res.json({ ok: true });
});

// ── POST /api/deals/:id/stage ─────────────────────────────────────────────────

router.post('/:id/stage', (req, res) => {
  const { to_stage_id, changed_by_id } = req.body;
  if (!to_stage_id) return res.status(400).json({ error: 'to_stage_id is required' });

  const deal  = db.prepare(`SELECT * FROM deals WHERE id = ? AND deleted_at IS NULL`).get(req.params.id);
  if (!deal)  return res.status(404).json({ error: 'Deal not found' });

  const stage = db.prepare(`SELECT * FROM stages WHERE id = ? AND deleted_at IS NULL`).get(to_stage_id);
  if (!stage) return res.status(404).json({ error: 'Stage not found' });

  const prevStageId = deal.current_stage_id;

  // Detect won/lost from stage name
  const stageName = stage.name.toLowerCase();
  const isWon  = stageName.includes('won');
  const isLost = stageName.includes('lost');

  db.prepare(`
    UPDATE deals SET
      current_stage_id = ?,
      won_at  = CASE WHEN ? THEN datetime('now') ELSE won_at END,
      lost_at = CASE WHEN ? THEN datetime('now') ELSE lost_at END,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(to_stage_id, isWon ? 1 : 0, isLost ? 1 : 0, req.params.id);

  // Log history
  if (prevStageId !== to_stage_id) {
    db.prepare(`
      INSERT INTO deal_stage_history (deal_id, from_stage_id, to_stage_id, changed_by_id)
      VALUES (?, ?, ?, ?)
    `).run(req.params.id, prevStageId ?? null, to_stage_id, changed_by_id ?? null);
  }

  const updated = db.prepare(`${DEAL_SELECT} WHERE d.id = ?`).get(req.params.id);
  emit('deal_updated', { id: updated.id, account_id: updated.account_id });

  fireTrigger('stage_changed', {
    entity:       'deal',
    deal_id:      updated.id,
    deal_name:    updated.name,
    account_id:   updated.account_id,
    account_name: updated.account_name,
    to_stage_id:  Number(to_stage_id),
  });

  const stageCtx = { deal_id: updated.id, deal_name: updated.name, account_name: updated.account_name, stage_name: stage.name, amount: updated.amount };
  if (isWon) {
    slack.notify(`:trophy: Deal *WON*: *${updated.name}* (${updated.account_name})${updated.amount ? ` — $${Number(updated.amount).toLocaleString()}` : ''}`);
    dispatch('deal_won', stageCtx);
  } else if (isLost) {
    slack.notify(`:x: Deal lost: *${updated.name}* (${updated.account_name})`);
    dispatch('deal_lost', stageCtx);
  } else {
    dispatch('stage_changed', stageCtx);
  }

  res.json({ ok: true, deal: updated });
});

module.exports = router;
