/**
 * routes/tasks.js
 * GET    /api/tasks        — list with filters
 * POST   /api/tasks        — create
 * GET    /api/tasks/:id    — single task
 * PATCH  /api/tasks/:id    — update (status → done auto-sets completed_at)
 * DELETE /api/tasks/:id    — soft delete
 */

const router = require('express').Router();
const db     = require('../db/db');
const { emit } = require('../services/sseEmitter');

const TASK_SELECT = `
  SELECT t.*,
         a.name  AS account_name,
         d.name  AS deal_name,
         u.display_name AS assignee_name,
         cb.display_name AS created_by_name
  FROM tasks t
  LEFT JOIN accounts a ON t.account_id  = a.id
  LEFT JOIN deals    d ON t.deal_id     = d.id
  LEFT JOIN users    u ON t.assignee_id = u.id
  LEFT JOIN users   cb ON t.created_by  = cb.id
`;

// ── GET /api/tasks ─────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  const {
    status, priority, assignee_id, account_id, deal_id,
    overdue, due_today, q,
    limit = 200, offset = 0,
  } = req.query;

  let sql = `${TASK_SELECT} WHERE t.deleted_at IS NULL`;
  const params = [];

  if (status)      { sql += ` AND t.status      = ?`;     params.push(status); }
  if (priority)    { sql += ` AND t.priority    = ?`;     params.push(priority); }
  if (assignee_id) { sql += ` AND t.assignee_id = ?`;     params.push(assignee_id); }
  if (account_id)  { sql += ` AND t.account_id  = ?`;     params.push(account_id); }
  if (deal_id)     { sql += ` AND t.deal_id     = ?`;     params.push(deal_id); }
  if (q)           { sql += ` AND lower(t.title) LIKE lower(?)`; params.push(`%${q}%`); }

  if (overdue === '1') {
    sql += ` AND t.due_date < date('now') AND t.status NOT IN ('done','cancelled')`;
  }
  if (due_today === '1') {
    sql += ` AND t.due_date = date('now') AND t.status NOT IN ('done','cancelled')`;
  }

  // Sort: open tasks first by due date, then done/cancelled at bottom
  sql += `
    ORDER BY
      CASE t.status WHEN 'done' THEN 1 WHEN 'cancelled' THEN 2 ELSE 0 END,
      CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END,
      t.due_date ASC,
      CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END
    LIMIT ? OFFSET ?
  `;
  params.push(Number(limit), Number(offset));

  const tasks = db.prepare(sql).all(...params);

  // Summary counts (always unfiltered by status so dashboard can use them)
  const counts = db.prepare(`
    SELECT
      SUM(CASE WHEN status IN ('open','in_progress') AND deleted_at IS NULL THEN 1 ELSE 0 END) AS open_count,
      SUM(CASE WHEN status IN ('open','in_progress') AND due_date < date('now') AND deleted_at IS NULL THEN 1 ELSE 0 END) AS overdue_count,
      SUM(CASE WHEN status IN ('open','in_progress') AND due_date = date('now') AND deleted_at IS NULL THEN 1 ELSE 0 END) AS due_today_count,
      SUM(CASE WHEN status = 'done' AND completed_at >= date('now','-7 days') AND deleted_at IS NULL THEN 1 ELSE 0 END) AS done_this_week
    FROM tasks
    ${assignee_id ? `WHERE assignee_id = ${Number(assignee_id)}` : ''}
  `).get();

  res.json({ ok: true, tasks, counts });
});

// ── POST /api/tasks ────────────────────────────────────────────────────────────

router.post('/', (req, res) => {
  const {
    title, description, due_date, priority = 'medium', status = 'open',
    account_id, deal_id, entry_id, assignee_id, created_by,
  } = req.body;

  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });

  const info = db.prepare(`
    INSERT INTO tasks
      (title, description, due_date, priority, status,
       account_id, deal_id, entry_id, assignee_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    title.trim(),
    description  ?? null,
    due_date     ?? null,
    priority,
    status,
    account_id   ?? null,
    deal_id      ?? null,
    entry_id     ?? null,
    assignee_id  ?? null,
    created_by   ?? null,
  );

  const task = db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(info.lastInsertRowid);
  emit('task_created', { id: task.id, account_id: task.account_id, deal_id: task.deal_id });
  res.status(201).json({ ok: true, task });
});

// ── GET /api/tasks/:id ────────────────────────────────────────────────────────

router.get('/:id', (req, res) => {
  const task = db.prepare(`${TASK_SELECT} WHERE t.id = ? AND t.deleted_at IS NULL`).get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json({ ok: true, task });
});

// ── PATCH /api/tasks/:id ──────────────────────────────────────────────────────

router.patch('/:id', (req, res) => {
  const task = db.prepare(`SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL`).get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const allowed = ['title', 'description', 'due_date', 'priority', 'status', 'account_id', 'deal_id', 'assignee_id'];
  const updates = [];
  const params  = [];

  for (const field of allowed) {
    if (!(field in req.body)) continue;
    updates.push(`${field} = ?`);
    params.push(req.body[field]);
  }

  if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  // Auto-set completed_at when status changes to done
  if ('status' in req.body) {
    const newStatus = req.body.status;
    if (newStatus === 'done' && task.status !== 'done') {
      updates.push(`completed_at = datetime('now')`);
    } else if (newStatus !== 'done' && task.status === 'done') {
      updates.push(`completed_at = NULL`);
    }
  }

  updates.push(`updated_at = datetime('now')`);
  params.push(req.params.id);

  db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(req.params.id);
  emit('task_updated', { id: updated.id, account_id: updated.account_id, deal_id: updated.deal_id });
  res.json({ ok: true, task: updated });
});

// ── DELETE /api/tasks/:id ─────────────────────────────────────────────────────

router.delete('/:id', (req, res) => {
  const task = db.prepare(`SELECT id FROM tasks WHERE id = ? AND deleted_at IS NULL`).get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  db.prepare(`UPDATE tasks SET deleted_at = datetime('now') WHERE id = ?`).run(req.params.id);
  emit('task_deleted', { id: req.params.id });
  res.json({ ok: true });
});

module.exports = router;
