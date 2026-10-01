/**
 * routes/analytics.js
 * GET /api/analytics — pipeline analytics: stage durations, funnel, activity breakdown
 */

const router = require('express').Router();
const db     = require('../db/db');

router.get('/', (req, res) => {
  // ── Activity type breakdown ─────────────────────────────────────────────────
  const activityBreakdown = db.prepare(`
    SELECT activity_type, COUNT(*) as count
    FROM entries WHERE deleted_at IS NULL AND activity_type IS NOT NULL
    GROUP BY activity_type ORDER BY count DESC
  `).all();

  // ── Accounts per stage ──────────────────────────────────────────────────────
  const accountsPerStage = db.prepare(`
    SELECT s.id, s.name, s.color_hex, s.text_color_hex, s.order_index,
           COUNT(a.id) as count
    FROM stages s
    LEFT JOIN accounts a ON a.current_stage_id = s.id AND a.deleted_at IS NULL
    WHERE s.deleted_at IS NULL
    GROUP BY s.id ORDER BY s.order_index
  `).all();

  // ── Average days per stage (from stage_history transitions) ─────────────────
  const stagesOrder = db.prepare(
    `SELECT id, name, color_hex, order_index FROM stages WHERE deleted_at IS NULL ORDER BY order_index`
  ).all();

  const avgTimeRaw = db.prepare(`
    SELECT
      sh.to_stage_id as stage_id,
      ROUND(AVG(
        CAST(julianday(COALESCE(
          (SELECT MIN(sh2.changed_at) FROM stage_history sh2
           WHERE sh2.account_id = sh.account_id AND sh2.id > sh.id),
          datetime('now')
        )) - julianday(sh.changed_at) AS REAL)
      ), 1) as avg_days,
      COUNT(*) as transitions
    FROM stage_history sh
    GROUP BY sh.to_stage_id
  `).all();

  const avgMap = {};
  for (const r of avgTimeRaw) avgMap[r.stage_id] = r;

  const stageDurations = stagesOrder.map(s => ({
    id:          s.id,
    name:        s.name,
    color_hex:   s.color_hex,
    order_index: s.order_index,
    avg_days:    avgMap[s.id]?.avg_days    ?? null,
    transitions: avgMap[s.id]?.transitions ?? 0,
  }));

  // ── Win / Loss summary ──────────────────────────────────────────────────────
  const winLossRows = db.prepare(`
    SELECT s.name as stage_name, COUNT(a.id) as count
    FROM accounts a JOIN stages s ON a.current_stage_id = s.id
    WHERE a.deleted_at IS NULL AND s.name IN ('Closed Won','Closed Lost')
    GROUP BY s.id
  `).all();

  const activeCount = db.prepare(`
    SELECT COUNT(*) as count FROM accounts a
    JOIN stages s ON a.current_stage_id = s.id
    WHERE a.deleted_at IS NULL AND s.name NOT IN ('Closed Won','Closed Lost')
  `).get();

  const unassigned = db.prepare(
    `SELECT COUNT(*) as count FROM accounts WHERE deleted_at IS NULL AND current_stage_id IS NULL`
  ).get();

  // ── Top accounts by activity ────────────────────────────────────────────────
  const topAccounts = db.prepare(`
    SELECT a.id, a.name, COUNT(e.id) as entry_count,
           s.name as stage_name, s.color_hex
    FROM accounts a
    LEFT JOIN entries e ON e.account_id = a.id AND e.deleted_at IS NULL
    LEFT JOIN stages  s ON a.current_stage_id = s.id
    WHERE a.deleted_at IS NULL
    GROUP BY a.id ORDER BY entry_count DESC LIMIT 10
  `).all();

  // ── Activities per month (last 6 months) ───────────────────────────────────
  const activitiesPerMonth = db.prepare(`
    SELECT strftime('%Y-%m', COALESCE(meeting_date, date(created_at))) as month,
           COUNT(*) as count
    FROM entries
    WHERE deleted_at IS NULL
      AND COALESCE(meeting_date, date(created_at)) >= date('now', '-6 months')
    GROUP BY month ORDER BY month ASC
  `).all();

  res.json({
    ok: true,
    activity_breakdown:   activityBreakdown,
    accounts_per_stage:   accountsPerStage,
    stage_durations:      stageDurations,
    win_loss: {
      won:        winLossRows.find(r => r.stage_name === 'Closed Won')?.count  ?? 0,
      lost:       winLossRows.find(r => r.stage_name === 'Closed Lost')?.count ?? 0,
      active:     activeCount?.count  ?? 0,
      unassigned: unassigned?.count ?? 0,
    },
    top_accounts:         topAccounts,
    activities_per_month: activitiesPerMonth,
  });
});

module.exports = router;
