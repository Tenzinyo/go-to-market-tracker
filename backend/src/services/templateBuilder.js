/**
 * templateBuilder.js  (Phase 3 — stub)
 * Builds sourced Q&A summaries from DB rows using templates.
 * NO invented data. Every line cites its entry ID.
 * Full implementation added in Phase 3.
 */

const db = require('../db/db');

/**
 * Answer a plain-language question about an account.
 * @param {string} accountName - extracted from user query
 * @returns {object} summary object or { noRecord: true }
 */
function summarizeAccount(accountName) {
  // Stub — Phase 3 implements this fully
  return { stub: true, message: `Phase 3 will implement summarizeAccount for "${accountName}"` };
}

module.exports = { summarizeAccount };
