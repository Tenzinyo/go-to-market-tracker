/**
 * routes/emails.js
 *
 * GET    /api/emails/templates          — list templates
 * POST   /api/emails/templates          — create template
 * PATCH  /api/emails/templates/:id      — update template
 * DELETE /api/emails/templates/:id      — soft delete template
 *
 * POST   /api/emails/send               — render + send (SMTP or mailto log)
 * GET    /api/emails/log                — sent email history (filter by account_id/deal_id)
 *
 * GET    /api/emails/smtp-status        — check if SMTP is configured
 * POST   /api/emails/smtp-test          — send a test email to a given address
 */

const router     = require('express').Router();
const db         = require('../db/db');
const nodemailer = require('nodemailer');
const { emit }   = require('../services/sseEmitter');

// ── SMTP helpers (mirrors notifier.js pattern) ────────────────────────────────

function smtpConfigured() {
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

// ── Template variable substitution ───────────────────────────────────────────

function renderTemplate(text, vars = {}) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

function buildVars({ account, contact, sender, deal } = {}) {
  return {
    account_name:  account?.name          ?? '',
    contact_name:  contact?.name          ?? '',
    sender_name:   sender?.display_name   ?? '',
    deal_name:     deal?.name             ?? '',
    stage_name:    account?.stage_name    ?? deal?.stage_name ?? '',
    close_date:    deal?.close_date       ?? '',
  };
}

// ── GET /api/emails/smtp-status ───────────────────────────────────────────────

router.get('/smtp-status', (_req, res) => {
  res.json({
    ok: true,
    configured: smtpConfigured(),
    host: process.env.SMTP_HOST  ?? null,
    port: process.env.SMTP_PORT  ?? '587',
    user: process.env.SMTP_USER  ?? null,
    from: process.env.NOTIFY_FROM ?? process.env.SMTP_USER ?? null,
  });
});

// ── POST /api/emails/smtp-test ────────────────────────────────────────────────

router.post('/smtp-test', async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'to email is required' });

  if (!smtpConfigured()) {
    return res.status(400).json({ error: 'SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in your .env file.' });
  }

  try {
    const transporter = getTransporter();
    await transporter.verify();
    await transporter.sendMail({
      from:    process.env.NOTIFY_FROM ?? process.env.SMTP_USER,
      to,
      subject: '[GTM Tracker] SMTP Test',
      text:    'This is a test email from GTM Tracker. Your SMTP configuration is working correctly.',
    });
    res.json({ ok: true, message: `Test email sent to ${to}` });
  } catch (err) {
    res.status(500).json({ error: `SMTP test failed: ${err.message}` });
  }
});

// ── GET /api/emails/templates ─────────────────────────────────────────────────

router.get('/templates', (req, res) => {
  const { category } = req.query;
  let sql = `SELECT * FROM email_templates WHERE deleted_at IS NULL`;
  const params = [];
  if (category) { sql += ` AND category = ?`; params.push(category); }
  sql += ` ORDER BY category, name`;
  const templates = db.prepare(sql).all(...params);
  res.json({ ok: true, templates });
});

// ── POST /api/emails/templates ────────────────────────────────────────────────

router.post('/templates', (req, res) => {
  const { name, category = 'general', subject, body, created_by } = req.body;
  if (!name)    return res.status(400).json({ error: 'name is required' });
  if (!subject) return res.status(400).json({ error: 'subject is required' });
  if (!body)    return res.status(400).json({ error: 'body is required' });

  const info = db.prepare(`
    INSERT INTO email_templates (name, category, subject, body, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, category, subject, body, created_by ?? null);

  const template = db.prepare(`SELECT * FROM email_templates WHERE id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ ok: true, template });
});

// ── PATCH /api/emails/templates/:id ──────────────────────────────────────────

router.patch('/templates/:id', (req, res) => {
  const tmpl = db.prepare(`SELECT id FROM email_templates WHERE id = ? AND deleted_at IS NULL`).get(req.params.id);
  if (!tmpl) return res.status(404).json({ error: 'Template not found' });

  const allowed = ['name', 'category', 'subject', 'body'];
  const updates = [];
  const params  = [];

  for (const field of allowed) {
    if (field in req.body) { updates.push(`${field} = ?`); params.push(req.body[field]); }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  updates.push(`updated_at = datetime('now')`);
  params.push(req.params.id);
  db.prepare(`UPDATE email_templates SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare(`SELECT * FROM email_templates WHERE id = ?`).get(req.params.id);
  res.json({ ok: true, template: updated });
});

// ── DELETE /api/emails/templates/:id ─────────────────────────────────────────

router.delete('/templates/:id', (req, res) => {
  const tmpl = db.prepare(`SELECT id FROM email_templates WHERE id = ? AND deleted_at IS NULL`).get(req.params.id);
  if (!tmpl) return res.status(404).json({ error: 'Template not found' });
  db.prepare(`UPDATE email_templates SET deleted_at = datetime('now') WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// ── POST /api/emails/send ─────────────────────────────────────────────────────

router.post('/send', async (req, res) => {
  const {
    to_email, to_name, subject, body,
    account_id, deal_id, contact_id,
    sent_by_id, template_id,
    method = 'smtp',   // 'smtp' | 'mailto'
  } = req.body;

  if (!to_email) return res.status(400).json({ error: 'to_email is required' });
  if (!subject)  return res.status(400).json({ error: 'subject is required' });
  if (!body)     return res.status(400).json({ error: 'body is required' });

  let status = 'sent';
  let error_msg = null;

  if (method === 'smtp') {
    if (!smtpConfigured()) {
      return res.status(400).json({
        error: 'SMTP not configured. Use "Open in Email Client" instead, or configure SMTP in your .env file.',
      });
    }
    try {
      const transporter = getTransporter();
      const from = process.env.NOTIFY_FROM ?? process.env.SMTP_USER;
      await transporter.sendMail({ from, to: to_email, subject, text: body });
    } catch (err) {
      status    = 'failed';
      error_msg = err.message;
    }
  } else {
    // mailto — browser opens email client; we just log it
    status = 'mailto';
  }

  // Log the email regardless of method
  const info = db.prepare(`
    INSERT INTO email_log
      (account_id, deal_id, contact_id, sent_by_id, template_id,
       to_email, to_name, subject, body, status, error_msg)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    account_id  ?? null, deal_id      ?? null, contact_id  ?? null,
    sent_by_id  ?? null, template_id  ?? null,
    to_email, to_name ?? null, subject, body, status, error_msg,
  );

  if (status === 'failed') {
    return res.status(500).json({ ok: false, error: error_msg, log_id: info.lastInsertRowid });
  }

  emit('email_sent', { account_id, deal_id, contact_id });
  res.status(201).json({ ok: true, status, log_id: info.lastInsertRowid });
});

// ── GET /api/emails/log ───────────────────────────────────────────────────────

router.get('/log', (req, res) => {
  const { account_id, deal_id, limit = 100, offset = 0 } = req.query;

  let sql = `
    SELECT el.*,
           a.name  AS account_name,
           u.display_name AS sent_by_name,
           et.name AS template_name
    FROM email_log el
    LEFT JOIN accounts        a  ON el.account_id  = a.id
    LEFT JOIN users           u  ON el.sent_by_id  = u.id
    LEFT JOIN email_templates et ON el.template_id = et.id
    WHERE 1=1
  `;
  const params = [];

  if (account_id) { sql += ` AND el.account_id = ?`; params.push(account_id); }
  if (deal_id)    { sql += ` AND el.deal_id    = ?`; params.push(deal_id); }

  sql += ` ORDER BY el.sent_at DESC LIMIT ? OFFSET ?`;
  params.push(Number(limit), Number(offset));

  const logs = db.prepare(sql).all(...params);
  res.json({ ok: true, logs });
});

// ── POST /api/emails/preview ──────────────────────────────────────────────────
// Render template variables without sending — used by the compose modal

router.post('/preview', (req, res) => {
  const { template_id, account_id, deal_id, contact_id, sender_id } = req.body;
  if (!template_id) return res.status(400).json({ error: 'template_id is required' });

  const template = db.prepare(`SELECT * FROM email_templates WHERE id = ? AND deleted_at IS NULL`).get(template_id);
  if (!template) return res.status(404).json({ error: 'Template not found' });

  const account = account_id ? db.prepare(`
    SELECT a.*, s.name AS stage_name FROM accounts a
    LEFT JOIN stages s ON a.current_stage_id = s.id
    WHERE a.id = ?
  `).get(account_id) : null;

  const deal    = deal_id    ? db.prepare(`SELECT * FROM deals    WHERE id = ? AND deleted_at IS NULL`).get(deal_id)    : null;
  const contact = contact_id ? db.prepare(`SELECT * FROM contacts WHERE id = ? AND deleted_at IS NULL`).get(contact_id) : null;
  const sender  = sender_id  ? db.prepare(`SELECT * FROM users    WHERE id = ?`).get(sender_id)  : null;

  const vars = buildVars({ account, contact, sender, deal });

  res.json({
    ok: true,
    subject: renderTemplate(template.subject, vars),
    body:    renderTemplate(template.body, vars),
    vars,
  });
});

module.exports = router;
