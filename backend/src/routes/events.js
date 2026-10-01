/**
 * routes/events.js
 * GET /api/events — SSE stream for real-time updates.
 * Clients connect once and receive push events: new_entry, stage_change, entry_updated, etc.
 */

const router = require('express').Router();
const { addClient } = require('../services/sseEmitter');

router.get('/', (req, res) => {
  addClient(res);
  // addClient sets headers, writes initial event, and handles close — nothing else needed here.
});

module.exports = router;
