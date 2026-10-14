/**
 * routes/integrations.js
 * GET  /api/integrations/status     — configured status for all integrations
 * POST /api/integrations/slack-test — send a test Slack message (admin)
 */

const router = require('express').Router();
const slack  = require('../services/slackNotifier');
const { isConfigured: sheetsConfigured } = require('../services/sheetsSync');
const { requireRole } = require('../middleware/rbac');

router.get('/status', (_req, res) => {
  res.json({
    ok: true,
    slack:  { configured: slack.isConfigured() },
    sheets: { configured: sheetsConfigured() },
  });
});

router.post('/slack-test', requireRole('admin'), (_req, res) => {
  if (!slack.isConfigured()) {
    return res.status(503).json({ error: 'SLACK_WEBHOOK_URL is not configured' });
  }
  slack.notify(':wave: Test message from *GTM Tracker* — your Slack integration is working!');
  res.json({ ok: true, message: 'Test message sent to Slack' });
});

module.exports = router;
