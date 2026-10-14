/**
 * routes/reports.js
 *
 * POST /api/reports/run          — execute a report config, return rows
 * GET  /api/reports/saved        — list saved reports
 * POST /api/reports/saved        — save a report
 * PATCH /api/reports/saved/:id   — rename a saved report
 * DELETE /api/reports/saved/:id  — delete saved report
 * GET  /api/reports/meta         — return available metrics + group_bys for the UI
 */

const router = require('express').Router();
const db     = require('../db/db');

// ── Metric + Group-by catalog ─────────────────────────────────────────────────
//
// Each METRIC defines:
//   label      — display name
//   value_expr — SQL expression for the aggregated value
//   from       — FROM clause (table alias)
//   date_col   — column used for date range filtering
//   owner_col  — column used for owner filter (nullable)
//   base_where — always-applied WHERE conditions
//
// Each GROUP_BY defines:
//   label      — display name
//   select     — SELECT fragment that produces "label" column (and optional color_hex)
//   join       — optional JOIN clause
//   group      — GROUP BY expression
//   order      — ORDER BY expression
//   compatible — array of metric keys this group_by works with

const METRICS = {
  activity_count: {
    label:      'Activity Count',
    value_expr: 'COUNT(e.id)',
    from:       'entries e',
    date_col:   "COALESCE(e.meeting_date, date(e.created_at))",
    owner_col:  'e.owner_id',
    base_where: 'e.deleted_at IS NULL',
  },
  deal_count: {
    label:      'Deal Count',
    value_expr: 'COUNT(d.id)',
    from:       'deals d',
    date_col:   "date(d.created_at)",
    owner_col:  'd.owner_id',
    base_where: 'd.deleted_at IS NULL',
  },
  deal_value: {
    label:      'Deal Pipeline Value ($)',
    value_expr: 'ROUND(SUM(COALESCE(d.amount, 0)), 0)',
    from:       'deals d',
    date_col:   "date(d.created_at)",
    owner_col:  'd.owner_id',
    base_where: "d.deleted_at IS NULL AND d.won_at IS NULL AND d.lost_at IS NULL",
  },
  deal_weighted: {
    label:      'Weighted Pipeline Value ($)',
    value_expr: 'ROUND(SUM(COALESCE(d.amount, 0) * COALESCE(d.probability, 0) / 100.0), 0)',
    from:       'deals d',
    date_col:   "date(d.created_at)",
    owner_col:  'd.owner_id',
    base_where: "d.deleted_at IS NULL AND d.won_at IS NULL AND d.lost_at IS NULL",
  },
  account_count: {
    label:      'Account Count',
    value_expr: 'COUNT(a.id)',
    from:       'accounts a',
    date_col:   "date(a.created_at)",
    owner_col:  'a.owner_id',
    base_where: 'a.deleted_at IS NULL',
  },
  task_count: {
    label:      'Task Count',
    value_expr: 'COUNT(t.id)',
    from:       'tasks t',
    date_col:   't.due_date',
    owner_col:  't.assignee_id',
    base_where: 't.deleted_at IS NULL',
  },
};

const GROUP_BYS = {
  month: {
    label:      'Month',
    select:     (m) => {
      const col = METRICS[m].date_col;
      return `strftime('%Y-%m', ${col}) AS label`;
    },
    group:      (m) => {
      const col = METRICS[m].date_col;
      return `strftime('%Y-%m', ${col})`;
    },
    order:      'label ASC',
    compatible: ['activity_count', 'deal_count', 'deal_value', 'deal_weighted', 'account_count', 'task_count'],
  },
  week: {
    label:      'Week',
    select:     (m) => {
      const col = METRICS[m].date_col;
      return `strftime('%Y-W%W', ${col}) AS label`;
    },
    group:      (m) => {
      const col = METRICS[m].date_col;
      return `strftime('%Y-W%W', ${col})`;
    },
    order:      'label ASC',
    compatible: ['activity_count', 'deal_count', 'task_count'],
  },
  owner: {
    label:      'Owner / Assignee',
    select:     () => `COALESCE(u_owner.display_name, 'Unassigned') AS label`,
    join:       (m) => {
      const col = METRICS[m].owner_col;
      if (!col) return '';
      // derive the join alias from metric
      return `LEFT JOIN users u_owner ON ${col} = u_owner.id`;
    },
    group:      () => `u_owner.display_name`,
    order:      'value DESC',
    compatible: ['activity_count', 'deal_count', 'deal_value', 'deal_weighted', 'account_count', 'task_count'],
  },
  stage: {
    label:      'Stage',
    select:     (m) => {
      if (m === 'activity_count') return `COALESCE(s_grp.name, 'No Stage') AS label, s_grp.color_hex`;
      if (m === 'account_count')  return `COALESCE(s_grp.name, 'No Stage') AS label, s_grp.color_hex`;
      return `COALESCE(s_grp.name, 'No Stage') AS label, s_grp.color_hex`;
    },
    join:       (m) => {
      if (m === 'activity_count') return `LEFT JOIN stages s_grp ON e.stage_id = s_grp.id`;
      if (m === 'account_count')  return `LEFT JOIN stages s_grp ON a.current_stage_id = s_grp.id`;
      if (m === 'deal_count' || m === 'deal_value' || m === 'deal_weighted') return `LEFT JOIN stages s_grp ON d.current_stage_id = s_grp.id`;
      return '';
    },
    group:      () => `s_grp.name`,
    order:      'COALESCE(s_grp.order_index, 999) ASC',
    compatible: ['activity_count', 'deal_count', 'deal_value', 'deal_weighted', 'account_count'],
  },
  activity_type: {
    label:      'Activity Type',
    select:     () => `COALESCE(e.activity_type, 'Unknown') AS label`,
    group:      () => `e.activity_type`,
    order:      'value DESC',
    compatible: ['activity_count'],
  },
  channel: {
    label:      'Channel',
    select:     () => `COALESCE(e.channel, 'Unknown') AS label`,
    group:      () => `e.channel`,
    order:      'value DESC',
    compatible: ['activity_count'],
  },
  forecast_category: {
    label:      'Forecast Category',
    select:     () => `COALESCE(d.forecast_category, 'pipeline') AS label`,
    group:      () => `d.forecast_category`,
    order:      'value DESC',
    compatible: ['deal_count', 'deal_value', 'deal_weighted'],
  },
  task_status: {
    label:      'Task Status',
    select:     () => `t.status AS label`,
    group:      () => `t.status`,
    order:      'value DESC',
    compatible: ['task_count'],
  },
  task_priority: {
    label:      'Task Priority',
    select:     () => `t.priority AS label`,
    group:      () => `t.priority`,
    order:      `CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END ASC`,
    compatible: ['task_count'],
  },
};

// ── GET /api/reports/meta ─────────────────────────────────────────────────────

router.get('/meta', (_req, res) => {
  const metrics = Object.entries(METRICS).map(([key, m]) => ({
    key,
    label:      m.label,
    group_bys:  Object.entries(GROUP_BYS)
      .filter(([, g]) => g.compatible.includes(key))
      .map(([gkey, g]) => ({ key: gkey, label: g.label })),
  }));

  // Fetch stages, owners, activity types for filter dropdowns
  const stages  = db.prepare(`SELECT id, name FROM stages WHERE deleted_at IS NULL ORDER BY order_index`).all();
  const users   = db.prepare(`SELECT id, display_name FROM users ORDER BY display_name`).all();
  const actTypes = db.prepare(`SELECT DISTINCT activity_type FROM entries WHERE activity_type IS NOT NULL ORDER BY activity_type`).all().map(r => r.activity_type);

  res.json({ ok: true, metrics, stages, users, activity_types: actTypes });
});

// ── POST /api/reports/run ─────────────────────────────────────────────────────

router.post('/run', (req, res) => {
  const {
    metric, group_by,
    date_from, date_to,
    owner_id, stage_id, activity_type_filter, forecast_category_filter,
    limit = 50,
  } = req.body;

  const m = METRICS[metric];
  const g = GROUP_BYS[group_by];

  if (!m) return res.status(400).json({ error: `Unknown metric: ${metric}` });
  if (!g) return res.status(400).json({ error: `Unknown group_by: ${group_by}` });
  if (!g.compatible.includes(metric)) {
    return res.status(400).json({ error: `group_by "${group_by}" is not compatible with metric "${metric}"` });
  }

  const selectLabel   = typeof g.select === 'function' ? g.select(metric) : g.select;
  const joinClause    = typeof g.join   === 'function' ? g.join(metric)   : (g.join ?? '');
  const groupExpr     = typeof g.group  === 'function' ? g.group(metric)  : g.group;
  const orderExpr     = g.order;

  const whereClauses  = [m.base_where];
  const params        = [];

  // Date range
  if (date_from && m.date_col) {
    whereClauses.push(`${m.date_col} >= ?`);
    params.push(date_from);
  }
  if (date_to && m.date_col) {
    whereClauses.push(`${m.date_col} <= ?`);
    params.push(date_to);
  }

  // Owner filter
  if (owner_id && m.owner_col) {
    whereClauses.push(`${m.owner_col} = ?`);
    params.push(Number(owner_id));
  }

  // Stage filter (only for activity_count and account_count)
  if (stage_id) {
    if (metric === 'activity_count') {
      whereClauses.push(`e.stage_id = ?`);
      params.push(Number(stage_id));
    } else if (metric === 'account_count') {
      whereClauses.push(`a.current_stage_id = ?`);
      params.push(Number(stage_id));
    } else if (['deal_count','deal_value','deal_weighted'].includes(metric)) {
      whereClauses.push(`d.current_stage_id = ?`);
      params.push(Number(stage_id));
    }
  }

  // Activity type filter
  if (activity_type_filter && metric === 'activity_count') {
    whereClauses.push(`e.activity_type = ?`);
    params.push(activity_type_filter);
  }

  // Forecast category filter
  if (forecast_category_filter && ['deal_count','deal_value','deal_weighted'].includes(metric)) {
    whereClauses.push(`d.forecast_category = ?`);
    params.push(forecast_category_filter);
  }

  const sql = `
    SELECT ${selectLabel}, ${m.value_expr} AS value
    FROM ${m.from}
    ${joinClause}
    WHERE ${whereClauses.join(' AND ')}
    GROUP BY ${groupExpr}
    ORDER BY ${orderExpr}
    LIMIT ${Number(limit)}
  `;

  try {
    const rows  = db.prepare(sql).all(...params);
    const total = rows.reduce((s, r) => s + (r.value ?? 0), 0);

    // Add percentage to each row
    const enriched = rows.map(r => ({
      ...r,
      pct: total > 0 ? Math.round((r.value / total) * 100) : 0,
    }));

    res.json({
      ok: true,
      rows:        enriched,
      total,
      metric_label: m.label,
      group_label:  g.label,
      ran_at:      new Date().toISOString(),
    });
  } catch (err) {
    console.error('[reports] SQL error:', err.message, '\nSQL:', sql);
    res.status(500).json({ error: `Query failed: ${err.message}` });
  }
});

// ── GET /api/reports/saved ────────────────────────────────────────────────────

router.get('/saved', (_req, res) => {
  const reports = db.prepare(`
    SELECT r.*, u.display_name AS created_by_name
    FROM saved_reports r
    LEFT JOIN users u ON r.created_by = u.id
    ORDER BY r.updated_at DESC
  `).all();
  res.json({ ok: true, reports });
});

// ── POST /api/reports/saved ───────────────────────────────────────────────────

router.post('/saved', (req, res) => {
  const { name, config, created_by } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  if (!config)       return res.status(400).json({ error: 'config is required' });

  const info = db.prepare(`
    INSERT INTO saved_reports (name, config, created_by) VALUES (?, ?, ?)
  `).run(name.trim(), JSON.stringify(config), created_by ?? null);

  const saved = db.prepare(`SELECT * FROM saved_reports WHERE id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ ok: true, report: saved });
});

// ── PATCH /api/reports/saved/:id ─────────────────────────────────────────────

router.patch('/saved/:id', (req, res) => {
  const report = db.prepare(`SELECT id FROM saved_reports WHERE id = ?`).get(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });

  const { name, config } = req.body;
  const updates = [];
  const params  = [];

  if (name)   { updates.push('name = ?');   params.push(name.trim()); }
  if (config) { updates.push('config = ?'); params.push(JSON.stringify(config)); }
  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

  updates.push(`updated_at = datetime('now')`);
  params.push(req.params.id);
  db.prepare(`UPDATE saved_reports SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare(`SELECT * FROM saved_reports WHERE id = ?`).get(req.params.id);
  res.json({ ok: true, report: updated });
});

// ── DELETE /api/reports/saved/:id ────────────────────────────────────────────

router.delete('/saved/:id', (req, res) => {
  const report = db.prepare(`SELECT id FROM saved_reports WHERE id = ?`).get(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  db.prepare(`DELETE FROM saved_reports WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
