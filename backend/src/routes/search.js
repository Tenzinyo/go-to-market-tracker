/**
 * routes/search.js
 * GET /api/search?q=X — global search across accounts + entries
 */

const router = require('express').Router();
const db     = require('../db/db');

router.get('/', (req, res) => {
  const { q = '' } = req.query;
  if (!q.trim()) return res.json({ ok: true, accounts: [], entries: [] });

  const term = `%${q.trim()}%`;

  const accounts = db.prepare(`
    SELECT a.id, a.name, s.name as stage_name, s.color_hex, s.text_color_hex
    FROM accounts a
    LEFT JOIN stages s ON a.current_stage_id = s.id
    WHERE a.deleted_at IS NULL
      AND (lower(a.name) LIKE lower(?) OR lower(a.aliases) LIKE lower(?))
    ORDER BY a.updated_at DESC
    LIMIT 6
  `).all(term, term);

  const entries = db.prepare(`
    SELECT e.id, e.activity_type, e.purpose, e.meeting_date,
           a.id as account_id, a.name as account_name
    FROM entries e
    JOIN accounts a ON e.account_id = a.id
    WHERE e.deleted_at IS NULL AND a.deleted_at IS NULL
      AND (lower(e.purpose)        LIKE lower(?)
        OR lower(e.outcome)        LIKE lower(?)
        OR lower(e.next_step)      LIKE lower(?)
        OR lower(e.activity_type)  LIKE lower(?))
    ORDER BY e.created_at DESC
    LIMIT 6
  `).all(term, term, term, term);

  res.json({ ok: true, accounts, entries });
});

module.exports = router;
