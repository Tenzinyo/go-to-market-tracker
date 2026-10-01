/**
 * sheetsSync.js  — Phase 5
 * Appends a new activity entry as a row in a Google Sheet using the Sheets API v4.
 *
 * Required env vars:
 *   GOOGLE_SHEETS_SPREADSHEET_ID
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY  (include literal \n line breaks)
 *
 * Sheet columns (auto-created on first write):
 *   Date | Account | Activity Type | Channel | Purpose | Outcome |
 *   Next Step | Next Step Date | Deal Amount | Owner | Entry ID
 */

const { google }    = require('googleapis');
const db            = require('../db/db');

const SHEET_NAME    = 'Activities';
const HEADER_ROW    = [
  'Date', 'Account', 'Activity Type', 'Channel', 'Purpose',
  'Outcome', 'Next Step', 'Next Step Due', 'Deal Amount', 'Owner', 'Entry ID',
];

function isConfigured() {
  return !!(
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID &&
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  );
}

function getClient() {
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n');
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key:   privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

async function ensureSheet(sheets, spreadsheetId) {
  // Check if the Activities tab exists; create it if not
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets?.some(s => s.properties.title === SHEET_NAME);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] },
    });
    console.log(`[sheetsSync] created sheet tab: ${SHEET_NAME}`);
  }
}

async function ensureHeader(sheets, spreadsheetId) {
  await ensureSheet(sheets, spreadsheetId);
  // Read row 1 — if empty, write the header
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A1:K1`,
  });
  const existing = res.data.values?.[0];
  if (!existing || existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADER_ROW] },
    });
    console.log(`[sheetsSync] wrote header row`);
  }
}

function entryToRow(entry) {
  return [
    entry.meeting_date ?? '',
    entry.account_name ?? '',
    entry.activity_type ?? '',
    entry.channel ?? '',
    entry.purpose ?? '',
    entry.outcome ?? '',
    entry.next_step ?? '',
    entry.next_step_date ?? '',
    entry.deal_amount ?? '',
    entry.owner_name ?? '',
    entry.id ?? '',
  ];
}

/**
 * Sync one entry to Google Sheets. Logs result to sync_log.
 * @param {object} entry - full entry object with joined account_name, owner_name
 */
async function syncEntry(entry) {
  if (!isConfigured()) {
    console.log('[sheetsSync] not configured — skipping');
    return { status: 'skipped' };
  }

  // Log attempt
  const existing = db.prepare('SELECT id, attempts FROM sync_log WHERE entry_id = ?').get(entry.id);
  let logId;
  if (existing) {
    db.prepare(`UPDATE sync_log SET status='pending', attempts=attempts+1, last_attempt_at=datetime('now'), error_msg=NULL WHERE entry_id=?`).run(entry.id);
    logId = existing.id;
  } else {
    const r = db.prepare(`INSERT INTO sync_log (entry_id, status, attempts, last_attempt_at) VALUES (?,  'pending', 1, datetime('now'))`).run(entry.id);
    logId = r.lastInsertRowid;
  }

  try {
    const sheets        = getClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

    await ensureHeader(sheets, spreadsheetId);

    const res = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range:            `${SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody:      { values: [entryToRow(entry)] },
    });

    const rowIndex = res.data.updates?.updatedRange ?? null;
    db.prepare(`UPDATE sync_log SET status='success', sheet_row_index=? WHERE id=?`).run(rowIndex, logId);
    console.log('[sheetsSync] synced entry', entry.id, '→', rowIndex);
    return { status: 'success' };

  } catch (err) {
    db.prepare(`UPDATE sync_log SET status='failed', error_msg=? WHERE id=?`).run(err.message, logId);
    console.error('[sheetsSync] failed:', err.message);
    return { status: 'failed', error: err.message };
  }
}

module.exports = { syncEntry, isConfigured };
