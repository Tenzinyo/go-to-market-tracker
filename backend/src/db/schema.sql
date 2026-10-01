-- GTM Tracker Database Schema
-- SQLite with WAL mode + foreign keys enabled at runtime

-- ── Stages ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stages (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL UNIQUE,
  order_index    INTEGER NOT NULL,
  color_hex      TEXT    NOT NULL DEFAULT '#CCCCCC',
  text_color_hex TEXT    NOT NULL DEFAULT '#2B2B2B',
  created_at     DATETIME DEFAULT (datetime('now')),
  updated_at     DATETIME DEFAULT (datetime('now')),
  deleted_at     DATETIME
);

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  display_name TEXT    NOT NULL,
  email        TEXT,
  timezone     TEXT    NOT NULL DEFAULT 'America/New_York',
  created_at   DATETIME DEFAULT (datetime('now'))
);

-- ── Accounts ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT    NOT NULL,
  aliases          TEXT    DEFAULT '[]',   -- JSON array of alternate names
  current_stage_id INTEGER REFERENCES stages(id),
  owner_id         INTEGER REFERENCES users(id),
  created_at       DATETIME DEFAULT (datetime('now')),
  updated_at       DATETIME DEFAULT (datetime('now')),
  deleted_at       DATETIME
);

-- ── Contacts ──────────────────────────────────────────────────────────────────
-- email and phone are SENSITIVE fields
CREATE TABLE IF NOT EXISTS contacts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  name       TEXT,
  email      TEXT,   -- sensitive
  phone      TEXT,   -- sensitive
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  deleted_at DATETIME
);

-- ── Entries (core activity log) ───────────────────────────────────────────────
-- deal_detail and deal_amount are SENSITIVE fields
CREATE TABLE IF NOT EXISTS entries (
  id                TEXT    PRIMARY KEY,           -- UUID
  account_id        INTEGER REFERENCES accounts(id),
  contact_id        INTEGER REFERENCES contacts(id),
  owner_id          INTEGER REFERENCES users(id),
  activity_type     TEXT,
  purpose           TEXT,
  channel           TEXT,
  stage_id          INTEGER REFERENCES stages(id),
  outcome           TEXT,
  next_step         TEXT,
  next_step_date    DATE,
  meeting_date      DATE,
  meeting_time      TEXT,
  deal_detail       TEXT,   -- sensitive
  deal_amount       TEXT,   -- sensitive
  source            TEXT    CHECK(source IN ('typed','voice','pasted')),
  raw_text          TEXT    NOT NULL,
  field_sensitivity TEXT    DEFAULT '{}',  -- JSON: per-entry sensitivity overrides
  confidence        TEXT    DEFAULT '{}',  -- JSON: per-field confidence 0-1
  missing_fields    TEXT    DEFAULT '[]',  -- JSON: list of null required fields
  created_at        DATETIME DEFAULT (datetime('now')),
  updated_at        DATETIME DEFAULT (datetime('now')),
  deleted_at        DATETIME
);

-- ── Stage history ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stage_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id    INTEGER NOT NULL REFERENCES accounts(id),
  entry_id      TEXT    REFERENCES entries(id),
  from_stage_id INTEGER REFERENCES stages(id),
  to_stage_id   INTEGER NOT NULL REFERENCES stages(id),
  changed_by_id INTEGER REFERENCES users(id),
  changed_at    DATETIME DEFAULT (datetime('now'))
);

-- ── Raw messages (append-only, never overwritten) ─────────────────────────────
CREATE TABLE IF NOT EXISTS raw_messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id     TEXT    NOT NULL REFERENCES entries(id),
  original_text TEXT   NOT NULL,
  created_at   DATETIME DEFAULT (datetime('now'))
);

-- ── Edit history ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS edit_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id     TEXT    NOT NULL REFERENCES entries(id),
  field_name   TEXT    NOT NULL,
  old_value    TEXT,
  new_value    TEXT,
  edited_by_id INTEGER REFERENCES users(id),
  edited_at    DATETIME DEFAULT (datetime('now'))
);

-- ── Shares ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shares (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id       INTEGER REFERENCES accounts(id),
  entry_ids        TEXT    DEFAULT '[]',   -- JSON array of entry UUIDs
  shared_by_id     INTEGER REFERENCES users(id),
  shared_to        TEXT,
  method           TEXT    CHECK(method IN ('mailto','copy')),
  content_snapshot TEXT,
  created_at       DATETIME DEFAULT (datetime('now'))
);

-- ── Sync log ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id        TEXT    NOT NULL REFERENCES entries(id),
  sheet_row_index INTEGER,
  status          TEXT    DEFAULT 'pending' CHECK(status IN ('pending','success','failed')),
  attempts        INTEGER DEFAULT 0,
  last_attempt_at DATETIME,
  error_msg       TEXT,
  created_at      DATETIME DEFAULT (datetime('now'))
);

-- ── App settings ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT    PRIMARY KEY,
  value      TEXT    NOT NULL,
  updated_at DATETIME DEFAULT (datetime('now'))
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_entries_account_id  ON entries(account_id);
CREATE INDEX IF NOT EXISTS idx_entries_owner_id    ON entries(owner_id);
CREATE INDEX IF NOT EXISTS idx_entries_stage_id    ON entries(stage_id);
CREATE INDEX IF NOT EXISTS idx_entries_meeting_date ON entries(meeting_date);
CREATE INDEX IF NOT EXISTS idx_entries_created_at  ON entries(created_at);
CREATE INDEX IF NOT EXISTS idx_entries_deleted_at  ON entries(deleted_at);
CREATE INDEX IF NOT EXISTS idx_accounts_name       ON accounts(name);
CREATE INDEX IF NOT EXISTS idx_stage_history_account ON stage_history(account_id);
CREATE INDEX IF NOT EXISTS idx_contacts_account_id ON contacts(account_id);
