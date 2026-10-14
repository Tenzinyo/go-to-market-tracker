# GTM Tracker

A local-first Go-To-Market activity tracker. Log sales meetings, calls, and touchpoints in plain English — the app extracts the structured data automatically (no AI, no API costs). View your pipeline as a kanban board, track overdue follow-ups, and see a live dashboard of deal activity.

---

## Quick Start

```bash
# 1 — Backend
cd backend
npm install
node src/app.js          # runs on http://localhost:3001

# 2 — Frontend (new terminal)
cd frontend
npm install
npm run dev              # runs on http://localhost:5173
```

Open **http://localhost:5173** in Chrome or Edge (Chrome required for voice input).

### Demo Data

Seed the database with 15 realistic accounts, 14 contacts, 11 deals, 38 activities, and 12 tasks:

```bash
cd backend
node src/db/seed_demo.js           # add demo data (skips if data exists)
node src/db/seed_demo.js --reset   # wipe and re-seed from scratch
```

---

## How to Log an Activity

1. Click **Log Activity** in the sidebar
2. Type (or speak) what happened — e.g.:
   > *"Had lunch with AB Securities on Tuesday to discuss partnership in AI security. Will follow up next week."*
3. Click **Extract & Review** — the app parses the text and pre-fills all fields
4. Review the confirmation card, adjust anything, click **Confirm & Save**
5. The entry appears in the Activity Log and the account moves to the right stage on the Pipeline board

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Browser  (port 5173)                   │
│                                                         │
│  React + Vite + React Router + dnd-kit                  │
│                                                         │
│  Pages                    Components                    │
│  ├─ Dashboard             ├─ Layout (sidebar + nav)     │
│  ├─ Pipeline (kanban)     ├─ ConfirmationCard           │
│  ├─ Accounts              └─ StageTag                   │
│  ├─ Account Detail                                      │
│  ├─ Contacts              State                         │
│  ├─ Leads                 ├─ UserContext (localStorage) │
│  ├─ Deals / Deal Detail   ├─ ChatContext (sessionStorage)│
│  ├─ Tasks                 └─ SSE listener (real-time)   │
│  ├─ Activity Log                                        │
│  ├─ Log Activity                                        │
│  ├─ Analytics                                           │
│  ├─ Health Scores                                       │
│  ├─ Quotas                                              │
│  ├─ Reports                                             │
│  ├─ Workflows                                           │
│  ├─ AI Assistant (Chat)                                 │
│  └─ Settings                                            │
└──────────────────┬──────────────────────────────────────┘
                   │  HTTP /api/*  (Vite proxy)
                   │  GET /api/events  (SSE stream)
┌──────────────────▼──────────────────────────────────────┐
│                Express Server  (port 3001)               │
│                                                         │
│  Routes                                                 │
│  ├─ /api/entries           log + edit + soft-delete     │
│  ├─ /api/entries/extract   preview without saving       │
│  ├─ /api/accounts          CRUD + stage moves           │
│  ├─ /api/contacts          CRUD + account link          │
│  ├─ /api/leads             lead pipeline                │
│  ├─ /api/deals             deal pipeline + forecasting  │
│  ├─ /api/tasks             task CRUD + status           │
│  ├─ /api/stages            pipeline stage config        │
│  ├─ /api/dashboard         all widget data in one call  │
│  ├─ /api/events            SSE push stream              │
│  ├─ /api/users             team member list             │
│  ├─ /api/settings          app config                   │
│  ├─ /api/search            global full-text search      │
│  ├─ /api/account-health    account health scores        │
│  ├─ /api/quotas            quota tracking               │
│  ├─ /api/reports           reporting data               │
│  ├─ /api/workflows         automation workflows         │
│  ├─ /api/integrations      Slack + integration status   │
│  ├─ /api/webhooks          outbound webhook management  │
│  ├─ /api/chat              AI assistant (streaming)     │
│  ├─ /api/share             account share log            │
│  └─ /api/ping              liveness check               │
│                                                         │
│  Services                                               │
│  ├─ extractor.js           rules-based field extraction │
│  ├─ dateParser.js          chrono-node → dates/times    │
│  ├─ fuzzyMatcher.js        Fuse.js → account matching   │
│  ├─ sseEmitter.js          broadcasts events to clients │
│  ├─ slackNotifier.js       Slack Incoming Webhook push  │
│  ├─ webhookDispatcher.js   outbound webhook dispatch    │
│  ├─ retryQueue.js          failed sync retry (5 min)    │
│  ├─ sheetsSync.js          Google Sheets append         │
│  ├─ shareFormatter.js      account summary generator    │
│  ├─ digestMailer.js        weekly digest email          │
│  └─ templateBuilder.js     email template engine        │
│                                                         │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│              SQLite  (better-sqlite3)                   │
│              backend/data/gtm.db                        │
│                                                         │
│  Tables                                                 │
│  ├─ stages               pipeline stages + colors       │
│  ├─ users                team members                   │
│  ├─ accounts             companies being tracked        │
│  ├─ contacts             people at each account         │
│  ├─ leads                lead pipeline                  │
│  ├─ deals                deal pipeline + values         │
│  ├─ tasks                tasks per account/deal         │
│  ├─ webhooks             outbound webhook configs       │
│  ├─ entries              every logged activity          │
│  ├─ stage_history        account stage audit trail      │
│  ├─ deal_stage_history   deal stage audit trail         │
│  ├─ raw_messages         original text, append-only     │
│  ├─ edit_history         field-level change log         │
│  ├─ shares               share log                      │
│  ├─ sync_log             Google Sheets sync queue       │
│  └─ settings             app-wide config                │
└─────────────────────────────────────────────────────────┘
```

### Data flow for logging an activity

```
User types text
      │
      ▼
POST /api/entries/extract
      │
      ▼
extractor.js ──► dateParser.js   (chrono-node parses dates/times)
             ──► fuzzyMatcher.js (Fuse.js matches account names)
             ──► keyword dicts   (activity type, channel, stage, purpose…)
      │
      ▼
Confirmation card shown in browser (user reviews + edits)
      │
      ▼
POST /api/entries  (saves to SQLite)
      │
      ├──► sheetsSync.js        (writes to Google Sheets)
      ├──► retryQueue.js        (queues failed syncs)
      ├──► slackNotifier.js     (posts to Slack if configured)
      ├──► webhookDispatcher.js (fires outbound webhooks)
      └──► sseEmitter.js        (broadcasts "new_entry" to all tabs)
                │
                ▼
        Dashboard + Pipeline update live
```

---

## Features

### Activity Logging  ✅
- Type or speak what happened — extracts all structured data automatically, zero AI, zero cost
- Activity types: Meeting, Call, Email, Demo, Presentation, Follow-up, Proposal, Contract, Podcast, Conference
- Channels: Online, In-person, Phone, Email, Conference, Podcast
- Outcome sentiment: Successful / Not interested / Needs follow-up
- Fuzzy account matching via Fuse.js (catches typos and alternate names)
- Date parsing via chrono-node ("next Friday", "Oct 12", "lunch" → 12:00)
- Duplicate account detection with one-click merge

### Pipeline & Accounts  ✅
- Kanban pipeline board with drag-and-drop stage moves
- Account list with search, stage filter, and tag filter
- Account detail page: contacts, stage history, activity timeline, enrichment fields
- Account tags: freeform colored labels, filterable in the accounts list
- Deal forecasting: weighted pipeline value by stage probability on Dashboard

### Contacts  ✅
- Global `/contacts` page: search by name, email, or title; filter by account
- Inline contact management on every account detail page (add/edit/delete)
- Contact fields: name, job title, email, phone, LinkedIn URL, notes
- Compose email button per contact opens your default mail client

### Leads  ✅
- Dedicated lead pipeline separate from accounts
- Lead scoring, status tracking, and conversion flow

### Deals  ✅
- Full deal pipeline with stage history and audit trail
- Deal detail page with linked account, value, close date, and probability
- Weighted pipeline value integrated into Dashboard

### Tasks  ✅
- Task list linked to accounts and deals
- Statuses: open / in progress / done
- Due dates with overdue highlighting
- Filterable by account, status, and assignee

### Health Scores  ✅
- Per-account health score based on recency of activity, deal stage, and engagement
- `/health` page ranks all accounts by health with color-coded indicators
- Identifies at-risk accounts that need attention

### Quotas  ✅
- Set revenue quotas per user per period
- Track attainment as deals close
- Dashboard-style quota progress view

### Reports  ✅
- Pipeline reports by account, owner, and date range
- Activity summaries exportable from the UI

### Workflows  ✅
- Define automation rules triggered by events (stage change, inactivity, deal created)
- Actions: send email, post to Slack, create task
- Inactivity checker runs hourly and fires configured rules automatically

### Analytics  ✅
- Win rate stat cards — total accounts, Closed Won, Closed Lost, win %
- Pipeline funnel — horizontal bar chart of accounts per stage
- Avg days in stage — computed from stage history
- Activity type breakdown — Meeting, Call, Email, Demo, etc.
- Monthly activity chart — entry count over the last 6 months
- Top accounts — ranked by logged activities
- Pure CSS charts — zero charting libraries

### Global Search  ✅
- Search bar in the sidebar searches accounts and activities simultaneously
- Keyboard-navigable dropdown (↑↓ navigate, ↵ open, Esc close)
- Results appear after 2 characters with 250ms debounce

### AI Assistant  ✅
- Chat interface at `/chat` — ask anything about your pipeline in plain English
- Powered by **Ollama (local, free)** — no API key, no cost, runs entirely on your machine
- Uses `llama3.2` by default; configurable via `OLLAMA_MODEL` and `OLLAMA_URL`
- Streaming word-by-word responses; chat history persists across navigation
- **Tool calling**: assistant can take real actions — assign owners, move stages, update next steps
- Suggestion chips on first load for common queries

```
# backend/.env (optional overrides)
OLLAMA_MODEL=llama3.2
OLLAMA_URL=http://localhost:11434
```

### Slack Notifications  ✅
- Posts to Slack when deals are created, won, or lost, and when stages change
- Configure via a Slack Incoming Webhook URL — no OAuth required
- Test message button available in **Settings → Integrations** (admin only)

```
# backend/.env
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

### Outbound Webhooks  ✅
- Register any number of HTTP endpoints to receive pipeline events
- Events: `deal_created`, `deal_won`, `deal_lost`, `stage_changed`, `account_created`
- Optional HMAC-SHA256 request signing (`X-GTM-Signature` header) per webhook
- Enable/disable/test/delete per webhook in **Settings → Integrations**
- Fire-and-forget with 5-second timeout; no retry on failure

### Google Sheets Sync  ✅
- Every saved entry is automatically appended as a row in a Google Sheet
- Auto-creates the "Activities" tab and header row on first sync
- Failed syncs retried in the background every 5 minutes (up to 5 attempts)
- Sync status in **Settings → Sheets Sync**: counts, last success, failed entries, Retry All

```
# backend/.env
GOOGLE_SHEETS_SPREADSHEET_ID=your-sheet-id
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-sa@project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
```

Setup: create a Google Service Account, enable the Sheets API, share your spreadsheet with the service account email (Editor access).

### Activity Notifications  ✅
- When a new entry is logged, other team members who've interacted with that account are emailed a summary
- Email includes: date, activity type, channel, topic, outcome, next step, deal value
- Email addresses managed in **Settings → Team**

```
# backend/.env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password    # Gmail: use an App Password
NOTIFY_FROM=GTM Tracker <you@gmail.com>
```

### Weekly Digest Email  ✅
- Automated Monday morning digest sent to all team members with email addresses
- Includes: overdue next steps, stale deals, upcoming meetings, pipeline snapshot by stage
- Scheduler runs hourly, fires between 7–9 AM on Mondays; tracks `last_digest_sent` to prevent duplicates

### Share & Export  ✅
- **↗ Share** button on every account detail page generates a clean email-style summary
- Toggle filters: hide deal amounts, hide contacts, hide outcome notes
- Copy to Clipboard or Open in Email (pre-fills subject + body in your mail client)
- Every share is logged to the `shares` table

### Export to CSV  ✅
- **↓ Export CSV** on the Activity Log page exports all visible (filtered) entries
- Columns: Date, Account, Type, Channel, Stage, Purpose, Outcome, Next Step, Due, Deal Amount, Owner
- Runs entirely in the browser — no backend call needed

### Voice & Thread Import  ✅
- Voice tab: live transcription via browser Web Speech API (Chrome/Edge)
- Paste Thread tab: paste a Slack/email/chat thread → splits into messages → extract all at once
- Thread review: per-card edit, include/exclude toggle, Select All / Deselect All
- Saves selected entries sequentially with running progress counter

### Entry Editing  ✅
- Every row in the Activity Log has an **Edit** button
- Modal with all editable fields: date, activity type, channel, purpose, outcome, next step + due date, deal amount
- Delete button with confirmation step; all edits logged to `edit_history` (field-level audit trail)

### Keyboard Shortcuts  ✅
- Press `?` anywhere to open the shortcuts overlay (Esc to close)
- `n` Log Activity · `d` Dashboard · `k` Pipeline · `a` Accounts · `l` Activity Log · `c` AI Assistant
- Disabled while typing in any input or textarea

### Settings  ✅
- **Team tab**: view/add team members, manage email addresses
- **Stages tab**: rename, recolor, add, and delete stages
- **App Settings tab**: app name, stale deal threshold, default timezone
- **Integrations tab** (admin only): Slack config + test, outbound webhook management

### RBAC  ✅
- Three roles: `admin`, `manager`, `rep`
- Admin-only routes protected server-side by `requireRole('admin')` middleware
- Role badge shown in sidebar footer; admin-only tabs hidden for lower roles

### Real-time Updates  ✅
- SSE stream pushes `new_entry` events to all open tabs
- Dashboard and Pipeline board refresh automatically on new activity

### Mobile-Responsive Layout  ✅
- At ≤ 768px the sidebar collapses into a horizontal top nav bar
- Grids reflow to 1–2 columns; tables stay horizontally scrollable

---

## Default Pipeline Stages

| Stage | Color |
|---|---|
| Prospecting | Blue-grey |
| Contacted | Teal |
| Submitted | Lavender |
| Pending | Yellow |
| Staged | Orange |
| Closed Won | Green |
| Closed Lost | Red |
| On Hold | Grey |

Stages are fully configurable via **Settings → Stages** or `POST/PATCH /api/stages`.

---

## Key Files

```
backend/src/
  app.js                        server entry point
  db/schema.sql                 full database schema
  db/seed.js                    stage + settings seed (idempotent)
  db/seed_demo.js               demo data (--reset flag to wipe and re-seed)
  routes/
    accounts.js                 account CRUD + stage moves + webhook hooks
    contacts.js                 contact CRUD
    leads.js                    lead pipeline
    deals.js                    deal pipeline + Slack/webhook hooks
    tasks.js                    task CRUD
    health.js                   account health scores
    quotas.js                   quota tracking
    reports.js                  reporting endpoints
    workflows.js                workflow rules engine
    integrations.js             Slack status + test endpoint
    webhooks.js                 outbound webhook CRUD + test
    search.js                   global full-text search
    chat.js                     AI assistant + tool calling
    analytics.js                analytics aggregations
  services/
    extractor.js                rules-based field extraction (core)
    dateParser.js               chrono-node date/time parsing
    fuzzyMatcher.js             Fuse.js account name matching
    sseEmitter.js               SSE broadcast to all clients
    slackNotifier.js            Slack Incoming Webhook fire-and-forget
    webhookDispatcher.js        outbound webhook dispatch + HMAC signing
    digestMailer.js             weekly digest email scheduler
    sheetsSync.js               Google Sheets append
    retryQueue.js               failed sync retry queue

frontend/src/
  App.jsx                       router + UserContext + ChatContext
  api.js                        fetch wrapper
  hooks/useSSE.js               SSE listener
  hooks/useKeyboardShortcuts.js keyboard shortcut handler
  lib/tagColors.js              deterministic tag color palette
  components/Layout.jsx         sidebar + global search + nav
  pages/
    Dashboard.jsx               stats + pipeline health widgets
    Pipeline.jsx                kanban board (dnd-kit)
    AccountList.jsx             account list + tag/stage filters
    AccountDetail.jsx           account detail + contacts + timeline + share
    Contacts.jsx                global contacts page
    Leads.jsx                   lead pipeline
    Deals.jsx                   deal list
    DealDetail.jsx              deal detail page
    Tasks.jsx                   task list
    Health.jsx                  account health scores
    Quotas.jsx                  quota tracking
    Reports.jsx                 reports
    Workflows.jsx               workflow rules UI
    Analytics.jsx               pipeline analytics (pure CSS charts)
    EntryLog.jsx                activity log + filters + CSV export
    NewEntry.jsx                log activity + voice + thread import
    Chat.jsx                    AI assistant chat UI
    Settings.jsx                team + stages + app settings + integrations
```
