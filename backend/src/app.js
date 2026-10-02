/**
 * app.js — GTM Tracker Express entry point
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express = require('express');
const cors    = require('cors');
const path    = require('path');

// ── Bootstrap DB + seed ────────────────────────────────────────────────────────
require('./db/db');   // initializes DB + runs schema
require('./db/seed'); // idempotent seed (stages, default settings)

// ── Background services ────────────────────────────────────────────────────────
require('./services/retryQueue').start();   // retry failed Sheets syncs every 5 min
require('./services/digestMailer').start(); // send weekly pipeline digest every Monday 7–9 AM

// ── Routes ─────────────────────────────────────────────────────────────────────
const entriesRouter   = require('./routes/entries');
const accountsRouter  = require('./routes/accounts');
const stagesRouter    = require('./routes/stages');
const usersRouter     = require('./routes/users');
const settingsRouter  = require('./routes/settings');
const eventsRouter    = require('./routes/events');
const dashboardRouter = require('./routes/dashboard');
const chatRouter      = require('./routes/chat');
const shareRouter     = require('./routes/share');
const syncRouter      = require('./routes/sync');
const analyticsRouter = require('./routes/analytics');
const searchRouter    = require('./routes/search');
const voiceRouter     = require('./routes/voice');

// ── App ────────────────────────────────────────────────────────────────────────
const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ── API routes ─────────────────────────────────────────────────────────────────
app.use('/api/entries',   entriesRouter);
app.use('/api/accounts',  accountsRouter);
app.use('/api/stages',    stagesRouter);
app.use('/api/users',     usersRouter);
app.use('/api/settings',  settingsRouter);
app.use('/api/events',    eventsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/chat',      chatRouter);
app.use('/api/share',     shareRouter);
app.use('/api/sync',      syncRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/search',    searchRouter);
app.use('/api/voice',     voiceRouter);

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ── Start ──────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => {
  console.log(`[gtm-tracker] Backend running on http://localhost:${PORT}`);
});

module.exports = app;
