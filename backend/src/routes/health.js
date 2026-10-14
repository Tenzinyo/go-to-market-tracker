/**
 * routes/health.js
 *
 * GET /api/health          — all accounts with computed health scores + summary stats
 * GET /api/health/:id      — health score for one account
 */

const router = require('express').Router();
const db     = require('../db/db');
const { computeScore } = require('../services/healthScore');

// Shared SQL: fetch raw health metrics for accounts
const HEALTH_SQL = `
  SELECT
    a.id, a.name, a.lifecycle_stage, a.owner_id,
    a.current_stage_id,
    s.name  AS stage_name,
    s.color_hex,
    u.display_name AS owner_name,
    -- days since last logged activity (fall back to account creation date)
    CAST(julianday('now') - julianday(
      COALESCE(
        (SELECT MAX(COALESCE(e.meeting_date, date(e.created_at)))
         FROM entries e WHERE e.account_id = a.id AND e.deleted_at IS NULL),
        date(a.created_at)
      )
    ) AS INTEGER) AS days_since_activity,
    -- last activity date (for display)
    (SELECT MAX(COALESCE(e.meeting_date, date(e.created_at)))
     FROM entries e WHERE e.account_id = a.id AND e.deleted_at IS NULL) AS last_activity_date,
    -- activity count in last 30 days
    (SELECT COUNT(*) FROM entries e
     WHERE e.account_id = a.id AND e.deleted_at IS NULL
       AND COALESCE(e.meeting_date, date(e.created_at)) >= date('now', '-30 days')
    ) AS activities_30d,
    -- total activity count
    (SELECT COUNT(*) FROM entries e WHERE e.account_id = a.id AND e.deleted_at IS NULL) AS total_activities,
    -- open next steps (future-dated)
    (SELECT COUNT(*) FROM entries e
     WHERE e.account_id = a.id AND e.deleted_at IS NULL
       AND e.next_step IS NOT NULL
       AND e.next_step_date IS NOT NULL
       AND e.next_step_date >= date('now')
    ) AS open_next_steps,
    -- active (open) deals
    (SELECT COUNT(*) FROM deals d
     WHERE d.account_id = a.id AND d.deleted_at IS NULL
       AND d.won_at IS NULL AND d.lost_at IS NULL
    ) AS active_deals
  FROM accounts a
  LEFT JOIN stages s ON a.current_stage_id = s.id
  LEFT JOIN users  u ON a.owner_id = u.id
  WHERE a.deleted_at IS NULL
`;

function enrichWithScore(row) {
  const { score, status, flags } = computeScore(row);
  return { ...row, health_score: score, health_status: status, health_flags: flags };
}

// ── GET /api/health ────────────────────────────────────────────────────────────

router.get('/', (_req, res) => {
  const rows    = db.prepare(HEALTH_SQL + ` ORDER BY a.name ASC`).all();
  const accounts = rows.map(enrichWithScore);

  // Sort worst-first by default
  accounts.sort((a, b) => a.health_score - b.health_score);

  const stats = {
    healthy:  accounts.filter(a => a.health_status === 'healthy').length,
    at_risk:  accounts.filter(a => a.health_status === 'at_risk').length,
    critical: accounts.filter(a => a.health_status === 'critical').length,
    total:    accounts.length,
    avg_score: accounts.length
      ? Math.round(accounts.reduce((s, a) => s + a.health_score, 0) / accounts.length)
      : 0,
  };

  res.json({ ok: true, accounts, stats });
});

// ── GET /api/health/:id ────────────────────────────────────────────────────────

router.get('/:id', (req, res) => {
  const row = db.prepare(HEALTH_SQL + ` AND a.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Account not found' });
  res.json({ ok: true, account: enrichWithScore(row) });
});

module.exports = router;
