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

-- ── Saved reports ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_reports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  config     TEXT    NOT NULL,   -- JSON: { metric, group_by, date_from, date_to, filters }
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now'))
);

-- ── Tasks ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT    NOT NULL,
  description  TEXT,
  due_date     DATE,
  priority     TEXT    NOT NULL DEFAULT 'medium'
               CHECK(priority IN ('high','medium','low')),
  status       TEXT    NOT NULL DEFAULT 'open'
               CHECK(status IN ('open','in_progress','done','cancelled')),
  account_id   INTEGER REFERENCES accounts(id),
  deal_id      INTEGER REFERENCES deals(id),
  entry_id     TEXT    REFERENCES entries(id),
  assignee_id  INTEGER REFERENCES users(id),
  created_by   INTEGER REFERENCES users(id),
  completed_at DATETIME,
  created_at   DATETIME DEFAULT (datetime('now')),
  updated_at   DATETIME DEFAULT (datetime('now')),
  deleted_at   DATETIME
);

-- ── Email templates ──────────────────────────────────────────────────────────
-- Reusable outreach templates with {{placeholder}} variable support
CREATE TABLE IF NOT EXISTS email_templates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT 'general',
  subject    TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  deleted_at DATETIME
);

-- ── Email log ─────────────────────────────────────────────────────────────────
-- Tracks every email sent (or attempted) from within the app
CREATE TABLE IF NOT EXISTS email_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id  INTEGER REFERENCES accounts(id),
  deal_id     INTEGER REFERENCES deals(id),
  contact_id  INTEGER REFERENCES contacts(id),
  sent_by_id  INTEGER REFERENCES users(id),
  template_id INTEGER REFERENCES email_templates(id),
  to_email    TEXT NOT NULL,
  to_name     TEXT,
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'sent'
              CHECK(status IN ('sent','failed','mailto')),
  error_msg   TEXT,
  sent_at     DATETIME DEFAULT (datetime('now'))
);

-- ── Deals (Opportunity object) ────────────────────────────────────────────────
-- One account can have many deals (e.g. renewal + upsell + new product line)
CREATE TABLE IF NOT EXISTS deals (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT    NOT NULL,
  account_id        INTEGER NOT NULL REFERENCES accounts(id),
  owner_id          INTEGER REFERENCES users(id),
  current_stage_id  INTEGER REFERENCES stages(id),
  amount            REAL,                        -- deal value (numeric for calculations)
  currency          TEXT    DEFAULT 'USD',
  close_date        DATE,                        -- expected close date
  probability       INTEGER DEFAULT 0,           -- 0-100 close probability %
  forecast_category TEXT    DEFAULT 'pipeline'
                    CHECK(forecast_category IN ('commit','best_case','pipeline','omitted')),
  product_line      TEXT,
  description       TEXT,
  tags              TEXT    DEFAULT '[]',        -- JSON array
  lost_reason       TEXT,
  won_at            DATETIME,
  lost_at           DATETIME,
  created_at        DATETIME DEFAULT (datetime('now')),
  updated_at        DATETIME DEFAULT (datetime('now')),
  deleted_at        DATETIME
);

-- ── Deal stage history ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deal_stage_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id       INTEGER NOT NULL REFERENCES deals(id),
  from_stage_id INTEGER REFERENCES stages(id),
  to_stage_id   INTEGER NOT NULL REFERENCES stages(id),
  changed_by_id INTEGER REFERENCES users(id),
  changed_at    DATETIME DEFAULT (datetime('now'))
);

-- ── Quotas ───────────────────────────────────────────────────────────────────
-- metric_type: deal_value (won deal $ in period) | deal_count (won deals) | activity_count
CREATE TABLE IF NOT EXISTS quotas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  period_type  TEXT    NOT NULL CHECK(period_type IN ('monthly','quarterly','yearly','custom')),
  period_start DATE    NOT NULL,
  period_end   DATE    NOT NULL,
  metric_type  TEXT    NOT NULL CHECK(metric_type IN ('deal_value','deal_count','activity_count')),
  target       REAL    NOT NULL,
  currency     TEXT    NOT NULL DEFAULT 'USD',
  label        TEXT,            -- optional friendly label, e.g. "Q3 2026"
  created_at   DATETIME DEFAULT (datetime('now')),
  updated_at   DATETIME DEFAULT (datetime('now'))
);

-- ── Workflows ─────────────────────────────────────────────────────────────────
-- trigger_type: stage_changed | lifecycle_changed | deal_created | inactivity_days
-- action_type:  create_task   | advance_lifecycle
CREATE TABLE IF NOT EXISTS workflows (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL,
  enabled        INTEGER NOT NULL DEFAULT 1,
  trigger_type   TEXT    NOT NULL,
  trigger_config TEXT    NOT NULL DEFAULT '{}',  -- JSON: { entity, stage_id, lifecycle_stage, days }
  action_type    TEXT    NOT NULL,
  action_config  TEXT    NOT NULL DEFAULT '{}',  -- JSON: { title, priority, due_offset_days, assignee_id }
  created_at     DATETIME DEFAULT (datetime('now')),
  updated_at     DATETIME DEFAULT (datetime('now'))
);

-- ── Workflow run log ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id INTEGER NOT NULL REFERENCES workflows(id),
  trigger_data TEXT,   -- JSON snapshot of what triggered it
  status      TEXT    NOT NULL DEFAULT 'ok',
  error_msg   TEXT,
  ran_at      DATETIME DEFAULT (datetime('now'))
);

-- ── Pipelines ────────────────────────────────────────────────────────────────
-- Named groups of stages; each stage belongs to one pipeline
CREATE TABLE IF NOT EXISTS pipelines (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  description TEXT,
  is_default  INTEGER NOT NULL DEFAULT 0,
  created_at  DATETIME DEFAULT (datetime('now')),
  deleted_at  DATETIME
);

-- ── Attachments ──────────────────────────────────────────────────────────────
-- entity_type: account | deal | entry | contact
-- entity_id stored as TEXT to support both integer IDs and UUID entry IDs
CREATE TABLE IF NOT EXISTS attachments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type   TEXT    NOT NULL CHECK(entity_type IN ('account','deal','entry','contact')),
  entity_id     TEXT    NOT NULL,
  filename      TEXT    NOT NULL,   -- stored filename on disk (uuid-based, no spaces)
  original_name TEXT    NOT NULL,   -- original upload name shown to user
  size          INTEGER NOT NULL,
  mime_type     TEXT,
  uploaded_by   INTEGER REFERENCES users(id),
  created_at    DATETIME DEFAULT (datetime('now')),
  deleted_at    DATETIME
);

CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(entity_type, entity_id);

-- ── Outbound Webhooks ────────────────────────────────────────────────────────
-- HTTP endpoints that receive POST payloads when CRM events fire
CREATE TABLE IF NOT EXISTS webhooks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  url        TEXT    NOT NULL,
  events     TEXT    NOT NULL DEFAULT '[]',  -- JSON array of event type strings, or ["*"] for all
  active     INTEGER NOT NULL DEFAULT 1,
  secret     TEXT,                           -- optional HMAC-SHA256 signing secret
  created_at DATETIME DEFAULT (datetime('now')),
  deleted_at DATETIME
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
CREATE INDEX IF NOT EXISTS idx_deals_account_id    ON deals(account_id);
CREATE INDEX IF NOT EXISTS idx_deals_owner_id      ON deals(owner_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage_id      ON deals(current_stage_id);
CREATE INDEX IF NOT EXISTS idx_deals_close_date    ON deals(close_date);
CREATE INDEX IF NOT EXISTS idx_deal_stage_history_deal ON deal_stage_history(deal_id);
CREATE INDEX IF NOT EXISTS idx_tasks_account_id  ON tasks(account_id);
CREATE INDEX IF NOT EXISTS idx_tasks_deal_id     ON tasks(deal_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date    ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_status      ON tasks(status);
