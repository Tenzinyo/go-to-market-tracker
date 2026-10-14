/**
 * services/webhookDispatcher.js
 * Dispatches outbound HTTP POST payloads to all active webhook endpoints
 * that subscribe to the given event type.
 *
 * Payload format:
 *   { event: string, timestamp: ISO8601, data: object }
 *
 * If a webhook has a `secret`, an HMAC-SHA256 signature is added as:
 *   X-GTM-Signature: sha256=<hex>
 */

const https  = require('https');
const http   = require('http');
const crypto = require('crypto');
const db     = require('../db/db');

function dispatch(eventType, payload) {
  let hooks;
  try {
    hooks = db.prepare(`
      SELECT * FROM webhooks
      WHERE active = 1 AND deleted_at IS NULL
        AND (events = '["*"]' OR events LIKE ?)
    `).all(`%"${eventType}"%`);
  } catch {
    return;
  }
  for (const hook of hooks) _post(hook, eventType, payload);
}

function _post(hook, eventType, payload) {
  try {
    const body = JSON.stringify({
      event:     eventType,
      timestamp: new Date().toISOString(),
      data:      payload,
    });

    const parsed  = new URL(hook.url);
    const isHttps = parsed.protocol === 'https:';
    const lib     = isHttps ? https : http;

    const headers = {
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(body),
      'User-Agent':     'GTM-Tracker-Webhook/1.0',
    };

    if (hook.secret) {
      headers['X-GTM-Signature'] =
        'sha256=' + crypto.createHmac('sha256', hook.secret).update(body).digest('hex');
    }

    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   'POST',
      headers,
      timeout:  5000,
    };

    const req = lib.request(options);
    req.on('error', () => {});
    req.on('timeout', () => req.destroy());
    req.write(body);
    req.end();
  } catch {}
}

module.exports = { dispatch };
