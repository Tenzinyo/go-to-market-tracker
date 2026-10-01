/**
 * digestMailer.js — Weekly pipeline digest
 *
 * Sends a Monday morning summary email to all team members with email addresses.
 * Includes: overdue next steps, stale deals, upcoming meetings, pipeline snapshot.
 *
 * Schedule: checks every hour; sends on Monday between 7–9 AM if not sent today.
 * Uses the same SMTP config as notifier.js.
 */

const nodemailer = require('nodemailer');
const db         = require('../db/db');

const DIGEST_SETTING_KEY = 'last_digest_sent';

function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_PORT === '465',
    auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

function buildDigest() {
  const today = new Date().toISOString().split('T')[0];
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  const overdue = db.prepare(`
    SELECT e.next_step, e.next_step_date, a.name as account_name, u.display_name as owner_name
    FROM entries e
    LEFT JOIN accounts a ON e.account_id = a.id
    LEFT JOIN users    u ON e.owner_id   = u.id
    WHERE e.deleted_at IS NULL AND e.next_step IS NOT NULL AND e.next_step_date < ?
    ORDER BY e.next_step_date ASC LIMIT 20
  `).all(today);

  const staleSetting = db.prepare(`SELECT value FROM settings WHERE key = 'stale_days_threshold'`).get();
  const staleDays    = parseInt(staleSetting?.value ?? '14', 10);

  const stale = db.prepare(`
    SELECT a.name, s.name as stage_name,
           CAST((julianday('now') - julianday(a.updated_at)) AS INTEGER) as days_stale
    FROM accounts a
    LEFT JOIN stages s ON a.current_stage_id = s.id
    WHERE a.deleted_at IS NULL
      AND a.current_stage_id NOT IN (SELECT id FROM stages WHERE name IN ('Closed Won','Closed Lost') AND deleted_at IS NULL)
      AND CAST((julianday('now') - julianday(a.updated_at)) AS INTEGER) >= ?
    ORDER BY days_stale DESC LIMIT 10
  `).all(staleDays);

  const upcoming = db.prepare(`
    SELECT e.meeting_date, e.activity_type, e.purpose,
           a.name as account_name, u.display_name as owner_name
    FROM entries e
    LEFT JOIN accounts a ON e.account_id = a.id
    LEFT JOIN users    u ON e.owner_id   = u.id
    WHERE e.deleted_at IS NULL AND e.meeting_date BETWEEN ? AND ?
    ORDER BY e.meeting_date ASC LIMIT 15
  `).all(today, nextWeek);

  const pipeline = db.prepare(`
    SELECT s.name, COUNT(a.id) as count
    FROM stages s LEFT JOIN accounts a ON a.current_stage_id = s.id AND a.deleted_at IS NULL
    WHERE s.deleted_at IS NULL GROUP BY s.id ORDER BY s.order_index
  `).all();

  const lines = [
    `GTM Tracker — Weekly Pipeline Digest`,
    `Week of ${today}`,
    ``,
    `═══ PIPELINE SNAPSHOT ═══`,
    ...pipeline.map(s => `  ${s.name.padEnd(16)} ${s.count} account${s.count !== 1 ? 's' : ''}`),
  ];

  if (overdue.length > 0) {
    lines.push(``, `═══ OVERDUE NEXT STEPS (${overdue.length}) ═══`);
    for (const o of overdue) {
      lines.push(`  [${o.next_step_date}] ${o.account_name} — ${o.next_step}` +
        (o.owner_name ? ` (${o.owner_name})` : ''));
    }
  }

  if (stale.length > 0) {
    lines.push(``, `═══ STALE DEALS (${staleDays}+ days, ${stale.length} accounts) ═══`);
    for (const s of stale) {
      lines.push(`  ${s.name} · ${s.stage_name} · ${s.days_stale} days`);
    }
  }

  if (upcoming.length > 0) {
    lines.push(``, `═══ UPCOMING MEETINGS (next 7 days) ═══`);
    for (const u of upcoming) {
      lines.push(`  [${u.meeting_date}] ${u.account_name} — ${u.activity_type ?? 'Meeting'}` +
        (u.purpose ? `: ${u.purpose}` : '') +
        (u.owner_name ? ` (${u.owner_name})` : ''));
    }
  }

  lines.push(``, `— GTM Tracker`);
  return lines.join('\n');
}

async function sendDigest() {
  const today = new Date().toISOString().split('T')[0];

  // Check if already sent today
  const last = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(DIGEST_SETTING_KEY);
  if (last?.value === today) return;

  const recipients = db.prepare(
    `SELECT display_name, email FROM users WHERE email IS NOT NULL AND email != ''`
  ).all();

  if (recipients.length === 0) {
    console.log('[digest] No recipients with email addresses — skipping');
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`).run(DIGEST_SETTING_KEY, today);
    return;
  }

  const body    = buildDigest();
  const subject = `[GTM] Weekly Pipeline Digest — ${today}`;
  const from    = process.env.NOTIFY_FROM ?? process.env.SMTP_USER;

  if (!isConfigured()) {
    console.log(`[digest] SMTP not configured — would have sent digest to: ${recipients.map(r => r.email).join(', ')}`);
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`).run(DIGEST_SETTING_KEY, today);
    return;
  }

  const transporter = getTransporter();
  for (const r of recipients) {
    try {
      await transporter.sendMail({ from, to: r.email, subject, text: body });
      console.log(`[digest] sent to ${r.display_name} <${r.email}>`);
    } catch (err) {
      console.error(`[digest] failed for ${r.email}:`, err.message);
    }
  }

  db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`).run(DIGEST_SETTING_KEY, today);
}

function start() {
  // Check every hour; fire on Monday between 7–9 AM
  const timer = setInterval(async () => {
    const now = new Date();
    const isMonday = now.getDay() === 1;
    const hour     = now.getHours();
    if (isMonday && hour >= 7 && hour < 9) {
      await sendDigest().catch(e => console.error('[digest] error:', e.message));
    }
  }, 60 * 60 * 1000);

  timer.unref(); // don't block process exit
  console.log('[digest] weekly digest scheduler started');
}

module.exports = { start, sendDigest };
