/**
 * fuzzyMatcher.js
 * Fuzzy-matches incoming account name strings against known accounts in the DB.
 * Uses Fuse.js. Never merges silently — always returns candidates for user confirmation.
 */

const Fuse = require('fuse.js');
const db   = require('../db/db');

const FUSE_OPTIONS = {
  includeScore: true,
  threshold: 0.4,      // 0 = exact, 1 = match anything
  keys: ['name', 'aliases_flat'],
};

/**
 * Build a fresh Fuse index from current accounts in DB.
 * Call this per-request (DB is small on localhost, cost is negligible).
 */
function buildIndex() {
  const rows = db.prepare(`
    SELECT id, name, aliases FROM accounts WHERE deleted_at IS NULL
  `).all();

  const docs = rows.map(r => ({
    id:           r.id,
    name:         r.name,
    aliases_flat: JSON.parse(r.aliases || '[]').join(' '),
  }));

  return new Fuse(docs, FUSE_OPTIONS);
}

/**
 * Find candidate accounts for a given name string.
 * @param {string} name - extracted company name from user input
 * @returns {Array<{ id, name, score, isExact }>} sorted best-first, max 3
 */
function findCandidates(name) {
  if (!name) return [];
  const fuse = buildIndex();
  const results = fuse.search(name, { limit: 3 });

  return results.map(r => ({
    id:      r.item.id,
    name:    r.item.name,
    score:   1 - (r.score ?? 0), // convert Fuse score to confidence (higher = better)
    isExact: r.item.name.toLowerCase() === name.toLowerCase(),
  }));
}

/**
 * Return the best single match if confidence is high enough, else null.
 * Caller must still present a confirmation UI — this is just a hint.
 */
function bestMatch(name, threshold = 0.75) {
  const candidates = findCandidates(name);
  if (candidates.length === 0) return null;
  const top = candidates[0];
  return top.score >= threshold ? top : null;
}

module.exports = { findCandidates, bestMatch };
