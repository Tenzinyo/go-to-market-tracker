/**
 * routes/share.js  — Phase 7
 * POST /api/share/generate — build sensitivity-filtered share content
 * GET  /api/share/log      — history of all shares
 */

const router          = require('express').Router();
const db              = require('../db/db');
const { formatShare } = require('../services/shareFormatter');

// POST /api/share/generate
router.post('/generate', (req, res) => {
  const { account_id, shared_by_id, method = 'copy', options = {} } = req.body;
  if (!account_id) return res.status(400).json({ error: 'account_id is required' });

  const account = db.prepare(`
    SELECT a.*, s.name as stage_name
    FROM accounts a
    LEFT JOIN stages s ON a.current_stage_id = s.id
    WHERE a.id = ? AND a.deleted_at IS NULL
  `).get(account_id);

  if (!account) return res.status(404).json({ error: 'Account not found' });

  const entries = db.prepare(`
    SELECT e.meeting_date, e.activity_type, e.channel, e.purpose,
           e.outcome, e.next_step, e.next_step_date, e.deal_amount,
           e.created_at, u.display_name as owner_name
    FROM entries e
    LEFT JOIN users u ON e.owner_id = u.id
    WHERE e.account_id = ? AND e.deleted_at IS NULL
    ORDER BY COALESCE(e.meeting_date, date(e.created_at)) DESC
  `).all(account_id);

  const contacts = db.prepare(`
    SELECT name, email, phone
    FROM contacts
    WHERE account_id = ? AND deleted_at IS NULL
    ORDER BY name
  `).all(account_id);

  const summary = formatShare(account, entries, contacts, options);

  const entry_ids = JSON.stringify(entries.map(e => e.id).filter(Boolean));
  const result = db.prepare(`
    INSERT INTO shares (account_id, entry_ids, shared_by_id, method, content_snapshot)
    VALUES (?, ?, ?, ?, ?)
  `).run(account_id, entry_ids, shared_by_id ?? null, method, summary);

  res.json({ ok: true, summary, share_id: result.lastInsertRowid });
});

// GET /api/share/log
router.get('/log', (_req, res) => {
  const shares = db.prepare(`
    SELECT sh.*, a.name as account_name, u.display_name as shared_by_name
    FROM shares sh
    LEFT JOIN accounts a ON sh.account_id = a.id
    LEFT JOIN users    u ON sh.shared_by_id = u.id
    ORDER BY sh.created_at DESC
    LIMIT 50
  `).all();
  res.json({ ok: true, shares });
});

module.exports = router;
