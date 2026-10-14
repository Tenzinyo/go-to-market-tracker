/**
 * services/slackNotifier.js
 * Sends messages to a Slack Incoming Webhook URL.
 * Configure via SLACK_WEBHOOK_URL environment variable.
 */

const https = require('https');

function isConfigured() {
  return !!process.env.SLACK_WEBHOOK_URL;
}

/**
 * Fire-and-forget POST to the Slack webhook.
 * @param {string} text      Fallback / notification text
 * @param {object[]} [blocks] Optional Slack Block Kit blocks
 */
function notify(text, blocks) {
  if (!isConfigured()) return;

  let parsed;
  try { parsed = new URL(process.env.SLACK_WEBHOOK_URL); } catch { return; }

  const body = JSON.stringify(blocks ? { text, blocks } : { text });
  const options = {
    hostname: parsed.hostname,
    path:     parsed.pathname + parsed.search,
    method:   'POST',
    headers:  {
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
    timeout: 5000,
  };

  const req = https.request(options);
  req.on('error', () => {});
  req.on('timeout', () => req.destroy());
  req.write(body);
  req.end();
}

module.exports = { isConfigured, notify };
