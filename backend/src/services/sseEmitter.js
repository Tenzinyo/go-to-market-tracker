/**
 * sseEmitter.js
 * Simple in-process Server-Sent Events broadcaster.
 * Routes register SSE clients; services call emit() to push events to all clients.
 */

const clients = new Set();

/**
 * Add a new SSE client (res object from Express).
 * Sends keep-alive comments every 25 seconds to prevent connection drops.
 */
function addClient(res) {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Initial connection confirmation
  res.write('data: {"type":"connected"}\n\n');

  const keepAlive = setInterval(() => {
    if (!res.writableEnded) res.write(': ping\n\n');
  }, 25000);

  clients.add(res);

  res.on('close', () => {
    clearInterval(keepAlive);
    clients.delete(res);
  });
}

/**
 * Broadcast an event to all connected SSE clients.
 * @param {string} type  - event type string (e.g. 'new_entry', 'stage_change')
 * @param {object} data  - payload (will be JSON-serialized)
 */
function emit(type, data) {
  const payload = JSON.stringify({ type, data, ts: Date.now() });
  for (const res of clients) {
    if (!res.writableEnded) {
      res.write(`data: ${payload}\n\n`);
    }
  }
}

module.exports = { addClient, emit };
