/**
 * retryQueue.js  — Phase 5
 * Retries failed Google Sheets sync entries from the sync_log table.
 * Runs on an interval; gives up after MAX_ATTEMPTS.
 */

const db             = require('../db/db');
const { syncEntry }  = require('./sheetsSync');

const MAX_ATTEMPTS   = 5;
const RETRY_INTERVAL = 5 * 60 * 1000; // 5 minutes

let   _timer = null;

/**
 * Called immediately when a sync fails — marks the entry for retry.
 * (sheetsSync already writes the sync_log row; this is a no-op kept for
 * backwards compat with the entries route which calls enqueue.)
 */
function enqueue(entryId) {
  // sync_log row is written by sheetsSync.syncEntry — nothing extra needed
  console.log('[retryQueue] enqueued for retry:', entryId);
}

/**
 * Fetch the full entry row (with joined account + owner names) for syncing.
 */
function getFullEntry(entryId) {
  return db.prepare(`
    SELECT e.*, a.name as account_name, u.display_name as owner_name
    FROM entries e
    LEFT JOIN accounts a ON e.account_id = a.id
    LEFT JOIN users    u ON e.owner_id   = u.id
    WHERE e.id = ?
  `).get(entryId);
}

/**
 * Retry all failed entries that haven't exceeded MAX_ATTEMPTS.
 * Returns count of retried rows.
 */
async function retryFailed() {
  const failed = db.prepare(`
    SELECT entry_id FROM sync_log
    WHERE status = 'failed' AND attempts < ?
    ORDER BY created_at ASC
  `).all(MAX_ATTEMPTS);

  if (failed.length === 0) return 0;
  console.log(`[retryQueue] retrying ${failed.length} failed entries`);

  for (const row of failed) {
    const entry = getFullEntry(row.entry_id);
    if (entry) await syncEntry(entry);
  }
  return failed.length;
}

/**
 * Start the background retry interval. Call once at server startup.
 */
function start() {
  if (_timer) return;
  _timer = setInterval(retryFailed, RETRY_INTERVAL);
  _timer.unref(); // don't keep the process alive just for this
  console.log('[retryQueue] started — retrying failed syncs every 5 min');
}

function stop() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

module.exports = { enqueue, retryFailed, start, stop };
