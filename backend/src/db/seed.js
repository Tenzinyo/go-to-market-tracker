const db = require('./db');

function seed() {
  // ── Stages ──────────────────────────────────────────────────────────────────
  const stages = [
    { name: 'Prospecting', order_index: 1, color_hex: '#A8C5DA', text_color_hex: '#2B2B2B' },
    { name: 'Contacted',   order_index: 2, color_hex: '#9FC9C2', text_color_hex: '#2B2B2B' },
    { name: 'Submitted',   order_index: 3, color_hex: '#B9B3E0', text_color_hex: '#2B2B2B' },
    { name: 'Pending',     order_index: 4, color_hex: '#F2D58A', text_color_hex: '#2B2B2B' },
    { name: 'Staged',      order_index: 5, color_hex: '#F4B183', text_color_hex: '#2B2B2B' },
    { name: 'Closed Won',  order_index: 6, color_hex: '#8FCB9B', text_color_hex: '#2B2B2B' },
    { name: 'Closed Lost', order_index: 7, color_hex: '#E3A0A0', text_color_hex: '#2B2B2B' },
    { name: 'On Hold',     order_index: 8, color_hex: '#C9C5BE', text_color_hex: '#2B2B2B' },
  ];

  const insertStage = db.prepare(`
    INSERT OR IGNORE INTO stages (name, order_index, color_hex, text_color_hex)
    VALUES (@name, @order_index, @color_hex, @text_color_hex)
  `);

  for (const s of stages) insertStage.run(s);

  // ── Migrations ──────────────────────────────────────────────────────────────
  // Add email column to users if it doesn't exist yet
  const userCols = db.prepare(`PRAGMA table_info(users)`).all().map(c => c.name);
  if (!userCols.includes('email')) {
    db.prepare(`ALTER TABLE users ADD COLUMN email TEXT`).run();
  }

  // Add owner_id column to accounts if it doesn't exist yet
  const acctCols = db.prepare(`PRAGMA table_info(accounts)`).all().map(c => c.name);
  if (!acctCols.includes('owner_id')) {
    db.prepare(`ALTER TABLE accounts ADD COLUMN owner_id INTEGER REFERENCES users(id)`).run();
  }
  if (!acctCols.includes('tags')) {
    db.prepare(`ALTER TABLE accounts ADD COLUMN tags TEXT DEFAULT '[]'`).run();
  }

  // ── Default settings ────────────────────────────────────────────────────────
  const defaults = [
    { key: 'stale_days_threshold', value: '14' },
    { key: 'default_timezone',     value: 'America/New_York' },
    { key: 'app_name',             value: 'GTM Tracker' },
  ];

  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO settings (key, value) VALUES (@key, @value)
  `);

  for (const s of defaults) insertSetting.run(s);

  console.log('[seed] Database seeded successfully.');
}

// Only run seed once per process startup (idempotent via INSERT OR IGNORE)
seed();

module.exports = { seed };
