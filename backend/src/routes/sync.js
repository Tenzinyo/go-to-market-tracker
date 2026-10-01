/**
 * routes/sync.js  — Phase 5
 * GET  /api/sync/status — pending/failed counts + last sync time
 * POST /api/sync/retry  — retry all failed rows immediately
 */

const router           = require('express').Router();
const db               = require('../db/db');
const { retryFailed }  = require('../services/retryQueue');
const { isConfigured } = require('../services/sheetsSync');

router.get('/status', (_req, res) => {
  const summary = db.prepare(`
    SELECT status, COUNT(*) as count FROM sync_log GROUP BY status
  `).all();

  const counts = { pending: 0, success: 0, failed: 0 };
  for (const row of summary) counts[row.status] = row.count;

  const last = db.prepare(
    `SELECT MAX(last_attempt_at) as last FROM sync_log WHERE status = 'success'`
  ).get();

  const recentFailed = db.prepare(`
    SELECT sl.entry_id, sl.attempts, sl.error_msg, sl.last_attempt_at, a.name as account_name
    FROM sync_log sl
    LEFT JOIN entries e ON sl.entry_id = e.id
    LEFT JOIN accounts a ON e.account_id = a.id
    WHERE sl.status = 'failed'
    ORDER BY sl.last_attempt_at DESC
    LIMIT 10
  `).all();

  res.json({
    ok:            true,
    configured:    isConfigured(),
    counts,
    last_success:  last?.last ?? null,
    recent_failed: recentFailed,
  });
});

router.post('/retry', async (_req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ error: 'Google Sheets credentials not configured in .env' });
  }
  const retried = await retryFailed();
  res.json({ ok: true, retried });
});

module.exports = router;
