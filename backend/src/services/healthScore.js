/**
 * services/healthScore.js
 *
 * Computes a 0-100 health score for an account from four signals:
 *
 *  Recency     (40 pts) — how recently was there any activity
 *  Engagement  (30 pts) — number of activities in last 30 days
 *  Next step   (20 pts) — is there an open/upcoming next step planned
 *  Active deal (10 pts) — is there at least one live deal
 *
 * Thresholds:
 *   70-100  → healthy
 *   40-69   → at_risk
 *   0-39    → critical
 */

function computeScore({ days_since_activity, activities_30d, open_next_steps, active_deals }) {
  let score = 0;
  const flags = [];

  // ── Recency (0-40) ──────────────────────────────────────────────────────────
  const days = days_since_activity ?? 9999;
  if      (days <= 7)  score += 40;
  else if (days <= 14) score += 30;
  else if (days <= 30) score += 20;
  else if (days <= 60) score += 10;
  else if (days <= 90) score += 5;

  if (days > 90)       flags.push(`No activity in ${days}+ days`);
  else if (days > 30)  flags.push(`${days}d since last activity`);

  // ── Engagement (0-30) ───────────────────────────────────────────────────────
  const a30 = activities_30d ?? 0;
  if      (a30 >= 5) score += 30;
  else if (a30 >= 3) score += 20;
  else if (a30 >= 2) score += 15;
  else if (a30 >= 1) score += 10;

  if (a30 === 0) flags.push('No activities in last 30 days');

  // ── Next step (0-20) ────────────────────────────────────────────────────────
  const ns = open_next_steps ?? 0;
  if (ns > 0) score += 20;
  else        flags.push('No upcoming next step');

  // ── Active deal (0-10) ──────────────────────────────────────────────────────
  const ad = active_deals ?? 0;
  if (ad > 0) score += 10;
  else        flags.push('No active deals');

  const status = score >= 70 ? 'healthy' : score >= 40 ? 'at_risk' : 'critical';
  return { score: Math.min(100, score), status, flags };
}

module.exports = { computeScore };
