/**
 * notifier.js — Activity notification emails
 *
 * When a new entry is logged for an account, emails all other team members
 * who have previously interacted with that account.
 *
 * Required env vars (any standard SMTP provider):
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 *   NOTIFY_FROM  (e.g. "GTM Tracker <noreply@yourco.com>")
 *
 * If not configured, notifications are logged to console only (no error thrown).
 */

const nodemailer = require('nodemailer');
const db         = require('../db/db');

function isConfigured() {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );
}

function getTransporter() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function buildEmailBody(entry, accountName, actorName) {
  const date    = entry.meeting_date ?? new Date().toISOString().split('T')[0];
  const type    = entry.activity_type ?? 'Activity';
  const channel = entry.channel ? ` · ${entry.channel}` : '';
  const lines   = [
    `Hi,`,
    ``,
    `${actorName} just logged a new activity for ${accountName}.`,
    ``,
    `  Date:     ${date}`,
    `  Type:     ${type}${channel}`,
  ];
  if (entry.purpose)    lines.push(`  Topic:    ${entry.purpose}`);
  if (entry.outcome)    lines.push(`  Outcome:  ${entry.outcome}`);
  if (entry.next_step) {
    const due = entry.next_step_date ? ` (due ${entry.next_step_date})` : '';
    lines.push(`  Next step: ${entry.next_step}${due}`);
  }
  if (entry.deal_amount) lines.push(`  Deal:     ${entry.deal_amount}`);
  lines.push('');
  lines.push('— GTM Tracker');
  return lines.join('\n');
}

/**
 * Notify all team members (except the entry owner) who have previously
 * interacted with the same account.
 */
async function notifyCoOwners(entry) {
  // Find other users who have logged entries for this account
  const coOwners = db.prepare(`
    SELECT DISTINCT u.id, u.display_name, u.email
    FROM entries e
    JOIN users u ON e.owner_id = u.id
    WHERE e.account_id = ?
      AND e.deleted_at IS NULL
      AND e.owner_id != ?
      AND u.email IS NOT NULL
      AND u.email != ''
  `).all(entry.account_id, entry.owner_id);

  if (coOwners.length === 0) return;

  // Get account name and actor name
  const account = db.prepare(`SELECT name FROM accounts WHERE id = ?`).get(entry.account_id);
  const actor   = db.prepare(`SELECT display_name FROM users WHERE id = ?`).get(entry.owner_id);
  const accountName = account?.name ?? 'Unknown Account';
  const actorName   = actor?.display_name ?? 'A team member';

  const subject = `[GTM] New activity on ${accountName} by ${actorName}`;
  const text    = buildEmailBody(entry, accountName, actorName);

  if (!isConfigured()) {
    console.log(`[notifier] SMTP not configured — would have emailed: ${coOwners.map(u => u.email).join(', ')}`);
    console.log(`[notifier] Subject: ${subject}`);
    return;
  }

  const transporter = getTransporter();
  const from        = process.env.NOTIFY_FROM ?? process.env.SMTP_USER;

  for (const user of coOwners) {
    try {
      await transporter.sendMail({ from, to: user.email, subject, text });
      console.log(`[notifier] emailed ${user.display_name} <${user.email}>`);
    } catch (err) {
      console.error(`[notifier] failed to email ${user.email}:`, err.message);
    }
  }
}

module.exports = { notifyCoOwners, isConfigured };
