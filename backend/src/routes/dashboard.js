/**
 * routes/dashboard.js  (Phase 4 — partial stub)
 * GET /api/dashboard — returns all widget data in one call.
 * Core aggregations implemented here; full widget logic expanded in Phase 4.
 */

const router = require('express').Router();
const db     = require('../db/db');

// ── Deal forecasting helpers ───────────────────────────────────────────────────

const STAGE_WEIGHTS = {
  'Prospecting': 0.10, 'Contacted': 0.20, 'Submitted': 0.40,
  'Pending': 0.60, 'Staged': 0.75, 'Closed Won': 1.00,
  'Closed Lost': 0.00, 'On Hold': 0.15,
};

function parseDealAmount(str) {
  if (!str) return null;
  const s = str.replace(/[$,\s]/g, '').toLowerCase();
  const num = parseFloat(s);
  if (isNaN(num)) return null;
  if (s.includes('b')) return num * 1e9;
  if (s.includes('m')) return num * 1e6;
  if (s.includes('k')) return num * 1e3;
  return num;
}

function fmtCurrency(n) {
  if (!n) return '$0';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

router.get('/', (req, res) => {
  const { owner_id, date_from, date_to } = req.query;

  // ── Helper: build a WHERE clause fragment shared across queries ────────────
  const filters = [`e.deleted_at IS NULL`];
  const params  = [];
  if (owner_id)  { filters.push(`e.owner_id = ?`);      params.push(owner_id);  }
  if (date_from) { filters.push(`e.meeting_date >= ?`);  params.push(date_from); }
  if (date_to)   { filters.push(`e.meeting_date <= ?`);  params.push(date_to);   }
  const where = filters.join(' AND ');

  // ── Deals per stage ────────────────────────────────────────────────────────
  const dealsPerStage = db.prepare(`
    SELECT s.id, s.name, s.color_hex, s.text_color_hex, s.order_index,
           COUNT(a.id) as count
    FROM stages s
    LEFT JOIN accounts a ON a.current_stage_id = s.id AND a.deleted_at IS NULL
    WHERE s.deleted_at IS NULL
    GROUP BY s.id ORDER BY s.order_index
  `).all();

  // ── Activities this week ───────────────────────────────────────────────────
  const activitiesThisWeek = db.prepare(`
    SELECT COUNT(*) as count FROM entries e
    WHERE ${where}
    AND e.meeting_date >= date('now', 'weekday 0', '-7 days')
    AND e.meeting_date <= date('now')
  `).get(...params);

  // ── Overdue next steps ─────────────────────────────────────────────────────
  const overdueNextSteps = db.prepare(`
    SELECT e.id, e.next_step, e.next_step_date, a.name as account_name,
           u.display_name as owner_name
    FROM entries e
    LEFT JOIN accounts a ON e.account_id = a.id
    LEFT JOIN users    u ON e.owner_id   = u.id
    WHERE e.deleted_at IS NULL
    AND e.next_step IS NOT NULL
    AND e.next_step_date < date('now')
    ${owner_id ? 'AND e.owner_id = ?' : ''}
    ORDER BY e.next_step_date ASC
    LIMIT 20
  `).all(...(owner_id ? [owner_id] : []));

  // ── Per-owner activity count ───────────────────────────────────────────────
  const perOwnerActivity = db.prepare(`
    SELECT u.id, u.display_name, COUNT(e.id) as count
    FROM users u
    LEFT JOIN entries e ON e.owner_id = u.id AND e.deleted_at IS NULL
    ${date_from || date_to ? `AND e.meeting_date BETWEEN COALESCE(?, '1970-01-01') AND COALESCE(?, '9999-12-31')` : ''}
    GROUP BY u.id ORDER BY count DESC
  `).all(...(date_from || date_to ? [date_from ?? null, date_to ?? null] : []));

  // ── Recently updated accounts ──────────────────────────────────────────────
  const recentAccounts = db.prepare(`
    SELECT a.id, a.name, a.updated_at, s.name as stage_name, s.color_hex
    FROM accounts a
    LEFT JOIN stages s ON a.current_stage_id = s.id
    WHERE a.deleted_at IS NULL
    ORDER BY a.updated_at DESC LIMIT 10
  `).all();

  // ── Upcoming meetings (next 7 days) ───────────────────────────────────────
  const upcomingMeetings = db.prepare(`
    SELECT e.id, e.meeting_date, e.meeting_time, e.activity_type, e.purpose,
           a.name as account_name, u.display_name as owner_name
    FROM entries e
    LEFT JOIN accounts a ON e.account_id = a.id
    LEFT JOIN users    u ON e.owner_id   = u.id
    WHERE e.deleted_at IS NULL
    AND e.meeting_date BETWEEN date('now') AND date('now', '+7 days')
    ${owner_id ? 'AND e.owner_id = ?' : ''}
    ORDER BY e.meeting_date ASC, e.meeting_time ASC
    LIMIT 20
  `).all(...(owner_id ? [owner_id] : []));

  // ── Stale deals ───────────────────────────────────────────────────────────
  const staleSetting = db.prepare(`SELECT value FROM settings WHERE key = 'stale_days_threshold'`).get();
  const staleDays    = parseInt(staleSetting?.value ?? '14', 10);

  const staleDeals = db.prepare(`
    SELECT a.id, a.name, a.updated_at, s.name as stage_name, s.color_hex,
           CAST((julianday('now') - julianday(a.updated_at)) AS INTEGER) as days_stale
    FROM accounts a
    LEFT JOIN stages s ON a.current_stage_id = s.id
    WHERE a.deleted_at IS NULL
    AND a.current_stage_id NOT IN (
      SELECT id FROM stages WHERE name IN ('Closed Won','Closed Lost') AND deleted_at IS NULL
    )
    AND CAST((julianday('now') - julianday(a.updated_at)) AS INTEGER) >= ?
    ORDER BY days_stale DESC
    LIMIT 20
  `).all(staleDays);

  // ── Missing info alerts ───────────────────────────────────────────────────
  const missingInfo = db.prepare(`
    SELECT e.id, e.missing_fields, e.created_at, a.name as account_name,
           u.display_name as owner_name
    FROM entries e
    LEFT JOIN accounts a ON e.account_id = a.id
    LEFT JOIN users    u ON e.owner_id   = u.id
    WHERE e.deleted_at IS NULL
    AND e.missing_fields != '[]'
    AND e.missing_fields IS NOT NULL
    ORDER BY e.created_at DESC
    LIMIT 20
  `).all();

  // ── Stage movement timeline (last 30 changes) ─────────────────────────────
  const stageTimeline = db.prepare(`
    SELECT sh.changed_at, sh.account_id,
           a.name as account_name,
           sf.name as from_stage, sf.color_hex as from_color,
           st.name as to_stage,   st.color_hex as to_color,
           u.display_name as changed_by
    FROM stage_history sh
    LEFT JOIN accounts a  ON sh.account_id    = a.id
    LEFT JOIN stages   sf ON sh.from_stage_id = sf.id
    LEFT JOIN stages   st ON sh.to_stage_id   = st.id
    LEFT JOIN users    u  ON sh.changed_by_id = u.id
    ORDER BY sh.changed_at DESC
    LIMIT 30
  `).all();

  // ── Deal forecasting ──────────────────────────────────────────────────────────
  const accountDeals = db.prepare(`
    SELECT a.id, a.name, s.name as stage_name,
      (SELECT e2.deal_amount FROM entries e2
       WHERE e2.account_id = a.id AND e2.deal_amount IS NOT NULL AND e2.deleted_at IS NULL
       ORDER BY COALESCE(e2.meeting_date, date(e2.created_at)) DESC LIMIT 1) as latest_deal
    FROM accounts a
    LEFT JOIN stages s ON a.current_stage_id = s.id
    WHERE a.deleted_at IS NULL
  `).all();

  let totalPipeline    = 0;
  let weightedPipeline = 0;
  const forecastRows   = [];

  for (const acct of accountDeals) {
    const amount = parseDealAmount(acct.latest_deal);
    if (!amount) continue;
    const weight = STAGE_WEIGHTS[acct.stage_name] ?? 0.50;
    totalPipeline    += amount;
    weightedPipeline += amount * weight;
    forecastRows.push({
      id: acct.id, name: acct.name, stage_name: acct.stage_name,
      deal_amount: acct.latest_deal, amount,
      weight: Math.round(weight * 100),
      weighted_amount: Math.round(amount * weight),
    });
  }

  res.json({
    ok: true,
    widgets: {
      deals_per_stage:      dealsPerStage,
      activities_this_week: activitiesThisWeek.count,
      overdue_next_steps:   overdueNextSteps,
      per_owner_activity:   perOwnerActivity,
      recent_accounts:      recentAccounts,
      upcoming_meetings:    upcomingMeetings,
      stale_deals:          { threshold_days: staleDays, items: staleDeals },
      missing_info:         missingInfo,
      stage_timeline:       stageTimeline,
      forecast: {
        total_pipeline:    Math.round(totalPipeline),
        weighted_pipeline: Math.round(weightedPipeline),
        total_str:         fmtCurrency(totalPipeline),
        weighted_str:      fmtCurrency(weightedPipeline),
        accounts:          forecastRows.sort((a, b) => b.weighted_amount - a.weighted_amount).slice(0, 10),
      },
    },
  });
});

module.exports = router;
