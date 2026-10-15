# GTM Tracker

A local-first, full-stack Go-To-Market activity tracker built for sales teams. Log meetings, calls, and touchpoints in plain English — the app extracts structured data automatically with zero AI dependencies and zero API costs. Everything runs on your machine: SQLite database, Node.js backend, React frontend.

> **Demo-ready.** Seed 15 accounts, 11 deals, 38 activities, and 12 tasks in one command and walk through every feature immediately.

---

## Quick Start

```bash
# 1 — Backend
cd backend
npm install
node src/app.js          # http://localhost:3001

# 2 — Frontend (new terminal)
cd frontend
npm install
npm run dev              # http://localhost:5173
```

Open **http://localhost:5173** in Chrome or Edge (required for voice input).

### Load Demo Data

```bash
cd backend
node src/db/seed_demo.js           # seed 15 accounts, 11 deals, 38 activities, 12 tasks
node src/db/seed_demo.js --reset   # wipe everything and re-seed from scratch
```

---

## Feature Tour

### 1. Log Activity — The Core Loop

The fastest way to capture a sales touchpoint:

1. Click **Log Activity** in the sidebar (or press `n`)
2. Type what happened in plain English:
   > *"Had lunch with Nomura Capital on Tuesday to discuss a $2M AI security deal. They want a proposal by end of month. Follow up next Friday."*
3. Click **Extract & Review** — the app parses the sentence and pre-fills:
   - Account name → matched against existing accounts via Fuse.js fuzzy search
   - Activity type → Meeting
   - Date → Tuesday's date
   - Deal amount → $2,000,000
   - Next step → "Send proposal"
   - Next step date → next Friday's date
4. Adjust any field on the confirmation card, pick a pipeline stage, click **Confirm & Save**
5. The account moves to that stage on the Pipeline board in real time — no page refresh needed

**Input modes:**
- **Type** — freeform text
- **Voice** — live mic transcription via Chrome Web Speech API
- **Paste Thread** — paste a Slack/email thread, each message is extracted separately with a per-card review screen

---

### 2. Dashboard

`/` — Live overview of your entire pipeline.

- Overdue next steps — entries with a past-due follow-up date
- Upcoming meetings — scheduled in the next 7 days
- Stale deals — accounts with no activity past a configurable threshold
- Recent accounts — latest companies added to the tracker
- Deals per stage — weighted pipeline value by close probability
- Stage timeline — activity trend chart
- Revenue forecast — projected close value across all open deals
- Task summary — open/in-progress/done counts

Refreshes automatically whenever any activity is logged, stage is changed, or deal is updated.

### 3. Pipeline Board

`/pipeline` — Kanban view of every account by stage.

- Drag and drop cards between columns to move an account's stage instantly
- Multiple pipeline support — switch between pipelines via tabs
- Cards show: company name, industry, activity count, and colored tags
- Real-time: any stage change (drag, new entry, or edit) updates all open browser tabs via SSE

---

### 4. Activity Log

`/log` — Full searchable, filterable history of every logged touchpoint.

- Filter by account, stage, date range
- Inline **Edit** button on every row — opens a modal to change date, type, channel, stage, purpose, outcome, next step, deal amount
- **Changing stage in the edit modal moves the account on the Pipeline board in real-time**
- **Delete** with confirmation; all edits logged to an audit trail
- **↓ Export CSV** exports the current filtered view (runs in-browser, no server call)

---

### 5. Accounts

`/accounts` — Full company directory.

- Search by name or alias
- Filter by pipeline stage and freeform tags
- Account detail page (`/accounts/:id`) includes:
  - Current stage, owner, enrichment fields (industry, headcount, revenue, website, LinkedIn)
  - Stage history — full timeline of every stage move with timestamps
  - All logged activities in chronological order
  - Linked contacts with email/phone/title
  - Subsidiary accounts (parent/child hierarchy)
  - **↗ Share** — generates a clean email-ready account summary with toggleable sections

---

### 6. Contacts

`/contacts` — Global contact directory across all accounts.

- Search by name, email, or job title
- Filter by account
- Fields: name, title, email, phone, LinkedIn URL, notes
- **Compose Email** button pre-fills your default mail client
- Contacts are also managed inline on every Account Detail page

---

### 7. Leads

`/leads` — Dedicated lead pipeline, separate from accounts.

- Lifecycle stages: Lead → MQL → SQL → Opportunity → Customer → Churned
- One-click stage advancement or dropdown picker inline in the table
- Lead score (0–100), lead source tracking, owner assignment
- Funnel visualization — horizontal bars showing count at each lifecycle stage
- Filters by lifecycle stage, lead source, and owner
- Real-time updates via SSE

---

### 8. Deals

`/deals` — Deal pipeline with forecasting.

- Full CRUD with linked account, owner, value, close date, and win probability
- Deal detail page: stage history, notes, linked account
- Weighted pipeline value shown on Dashboard (value × probability)
- Triggers Slack notifications and outbound webhooks on create/won/lost

---

### 9. Tasks

`/tasks` — Unified task list across accounts and deals.

- Statuses: open / in progress / done
- Due dates with red overdue highlighting
- Filter by account, assignee, and status
- Task panel also embedded on Account Detail and Deal Detail pages

---

### 10. Health Scores

`/health` — At-risk account radar.

- Computed score per account based on: days since last activity, deal stage, engagement frequency
- Color-coded indicators: healthy / at risk / critical
- Sort by health score to immediately see which accounts need attention

---

### 11. Quotas

`/quotas` — Revenue quota tracking per team member.

- Set quarterly or monthly targets per rep
- Attainment updates as deals close
- Progress bars with % attained and gap to target

---

### 12. Analytics

`/analytics` — Pipeline performance metrics, zero charting libraries.

| Widget | What it shows |
|---|---|
| Win rate | Total accounts, Closed Won, Closed Lost, win % |
| Pipeline funnel | Account count per stage as horizontal bars |
| Avg days in stage | Computed from stage_history timestamps |
| Activity breakdown | Meeting / Call / Email / Demo / etc. distribution |
| Monthly activity | Entry count over the last 6 months |
| Top accounts | Ranked by logged activity count |

---

### 13. Reports

`/reports` — Configurable pipeline reports.

- Filter by account, owner, stage, and date range
- Activity summary view
- Export from the Activity Log (CSV)

---

### 14. Workflows — Automation

`/workflows` — Event-driven automation rules, no code required.

**Trigger events:**
- Stage changed
- Deal created / won / lost
- Account inactivity (configurable threshold in days)

**Actions:**
- Send an email
- Post a message to Slack
- Create a task

The inactivity checker runs hourly in the background and fires rules automatically. Rules are listed with last-triggered timestamps and enable/disable toggles.

---

### 15. AI Assistant

`/chat` — Conversational interface to your pipeline data.

- Ask in plain English: *"Which accounts haven't had activity in 2 weeks?"*, *"What's our pipeline value in the Proposal stage?"*
- Powered by **Ollama** — runs locally, no API key, no cost, no data leaves your machine
- Default model: `llama3.2`; configurable via env vars
- Streaming word-by-word responses
- **Tool calling**: the assistant can take real actions — move an account's stage, assign an owner, update a next step
- Suggestion chips on first load for common queries
- Chat history persists across page navigation

```bash
# Install Ollama and pull the model
brew install ollama
ollama pull llama3.2
ollama serve
```

```
# backend/.env (optional overrides)
OLLAMA_MODEL=llama3.2
OLLAMA_URL=http://localhost:11434
```

---

### 16. Integrations

#### Slack Notifications
- Posts to a Slack channel on: deal created, deal won, deal lost, stage changed
- Configure with a Slack Incoming Webhook URL — no OAuth, no bot setup
- Test button in **Settings → Integrations** (admin only)

```
# backend/.env
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

#### Outbound Webhooks
- Register any HTTP endpoint to receive pipeline events in real time
- Supported events: `deal_created`, `deal_won`, `deal_lost`, `stage_changed`, `account_created`
- Optional HMAC-SHA256 request signing (`X-GTM-Signature` header)
- Per-webhook enable/disable/test/delete in Settings

#### Google Sheets Sync
- Every saved activity is automatically appended as a row in a connected Google Sheet
- Auto-creates the "Activities" sheet and header row on first sync
- Failed syncs retried every 5 minutes (up to 5 attempts)
- Sync status view in **Settings → Sheets Sync**

```
# backend/.env
GOOGLE_SHEETS_SPREADSHEET_ID=your-sheet-id
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-sa@project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
```

#### Email Notifications
- When a new activity is logged, co-owners of that account receive an email summary
- Weekly digest email every Monday morning: overdue steps, stale deals, upcoming meetings

```
# backend/.env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password
NOTIFY_FROM=GTM Tracker <you@gmail.com>
```

---

### 17. Settings

`/settings` — Fully configurable.

| Tab | What you can do |
|---|---|
| Team | Add/edit users, assign email addresses, manage roles |
| Stages | Rename, recolor, reorder, add, or delete pipeline stages |
| App Settings | App name, stale deal threshold (days), default timezone |
| Integrations | Slack webhook, outbound webhooks, sheets sync (admin only) |

---

### 18. RBAC — Roles & Permissions

Three roles enforced server-side on every protected route:

| Role | Permissions |
|---|---|
| `rep` | Log activities, view everything |
| `manager` | + delete accounts/deals, edit workflows |
| `admin` | + manage stages, settings, integrations, change user roles |

- Role badge shown in sidebar footer
- Admin-only Settings tabs hidden for lower roles
- First user seeded is auto-promoted to admin

---

### 19. Real-Time Updates (SSE)

Every mutation emits a Server-Sent Event. All open tabs update instantly with no polling:

| Event | Who reacts |
|---|---|
| `new_entry` | Activity Log, Dashboard, Pipeline, Leads |
| `entry_updated` | Activity Log, Dashboard |
| `stage_change` | Pipeline, Dashboard, Leads |
| `account_updated` | Pipeline, Leads, Dashboard, Account List |
| `account_created` | Pipeline, Leads, Account List |
| `deal_created/won/lost` | Dashboard, Deals |

**Stage propagation is fully bidirectional:**
- Log a new activity with a stage → account moves on the Pipeline board immediately
- Edit an existing activity's stage in the Activity Log → same result, all views update live

---

### 20. Global Search

- Search bar in the sidebar header
- Searches accounts and activity entries simultaneously
- Keyboard navigation: `↑↓` to move, `Enter` to open, `Esc` to close
- Results appear after 2 characters with 250ms debounce

---

### 21. Keyboard Shortcuts

Press `?` anywhere to see the full overlay.

| Key | Action |
|---|---|
| `n` | Log Activity |
| `d` | Dashboard |
| `k` | Pipeline |
| `a` | Accounts |
| `l` | Activity Log |
| `c` | AI Assistant |
| `?` | Shortcuts overlay |
| `Esc` | Close modal/overlay |

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
│  ├─ /api/pipelines         multi-pipeline support       │
│  ├─ /api/dashboard         all widget data in one call  │
│  ├─ /api/events            SSE push stream              │
│  ├─ /api/users             team member list             │
│  ├─ /api/settings          app config                   │
│  ├─ /api/search            global full-text search      │
│  ├─ /api/health            account health scores        │
│  ├─ /api/quotas            quota tracking               │
│  ├─ /api/reports           reporting data               │
│  ├─ /api/workflows         automation workflows         │
│  ├─ /api/integrations      Slack + integration status   │
│  ├─ /api/webhooks          outbound webhook management  │
│  ├─ /api/chat              AI assistant (streaming)     │
│  ├─ /api/analytics         pipeline analytics           │
│  ├─ /api/share             account share log            │
│  └─ /api/ping              liveness check               │
│                                                         │
│  Services                                               │
│  ├─ extractor.js           rules-based field extraction │
│  ├─ dateParser.js          chrono-node → dates/times    │
│  ├─ fuzzyMatcher.js        Fuse.js → account matching   │
│  ├─ sseEmitter.js          broadcasts events to clients │
│  ├─ workflowEngine.js      automation trigger engine    │
│  ├─ healthScore.js         per-account health scoring   │
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
│  ├─ pipelines            multi-pipeline definitions     │
│  ├─ users                team members + roles           │
│  ├─ accounts             companies being tracked        │
│  ├─ contacts             people at each account         │
│  ├─ leads                lead pipeline                  │
│  ├─ deals                deal pipeline + values         │
│  ├─ tasks                tasks per account/deal         │
│  ├─ workflows            automation rule definitions    │
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

### Data flow — logging an activity

```
User types / speaks text
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
Confirmation card (user reviews + edits extracted fields)
      │
      ▼
POST /api/entries  (saves to SQLite)
      │
      ├──► accounts table        UPDATE current_stage_id if stage selected
      ├──► stage_history table   INSERT row if stage changed
      ├──► sheetsSync.js         append row to Google Sheets
      ├──► retryQueue.js         queue if sheets sync fails
      ├──► slackNotifier.js      post to Slack if configured
      ├──► webhookDispatcher.js  fire outbound webhooks
      └──► sseEmitter.js         broadcast new_entry + account_updated
                │
                ▼
       All open tabs update: Pipeline, Dashboard, Leads, Activity Log
```

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

Fully configurable via **Settings → Stages** or `POST/PATCH /api/stages`.

---

## Environment Variables

All optional. The app runs fully offline without any of these set.

```
# backend/.env

# AI Assistant (local Ollama)
OLLAMA_MODEL=llama3.2
OLLAMA_URL=http://localhost:11434

# Slack
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# Google Sheets
GOOGLE_SHEETS_SPREADSHEET_ID=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
NOTIFY_FROM=GTM Tracker <you@gmail.com>
```

---

## Key Files

```
backend/src/
  app.js                        server entry point
  db/schema.sql                 full database schema
  db/seed.js                    stage + settings seed (idempotent)
  db/seed_demo.js               demo data loader (--reset to wipe and re-seed)
  middleware/
    rbac.js                     role-based access control middleware
  routes/
    entries.js                  activity log CRUD + stage propagation
    accounts.js                 account CRUD + stage moves + webhooks
    contacts.js                 contact CRUD
    leads.js                    lead pipeline + funnel
    deals.js                    deal pipeline + Slack/webhook hooks
    tasks.js                    task CRUD
    health.js                   account health score endpoint
    quotas.js                   quota tracking
    reports.js                  report endpoints
    analytics.js                pipeline analytics aggregations
    workflows.js                workflow CRUD + trigger endpoint
    integrations.js             Slack status + test
    webhooks.js                 outbound webhook CRUD + test
    pipelines.js                multi-pipeline CRUD
    stages.js                   stage CRUD
    search.js                   global full-text search
    chat.js                     AI assistant + tool calling
  services/
    extractor.js                rules-based field extraction (core)
    dateParser.js               chrono-node date/time parsing
    fuzzyMatcher.js             Fuse.js account name matching
    sseEmitter.js               SSE broadcast to all clients
    workflowEngine.js           automation trigger evaluation
    healthScore.js              per-account health computation
    slackNotifier.js            Slack Incoming Webhook fire-and-forget
    webhookDispatcher.js        outbound webhook dispatch + HMAC signing
    digestMailer.js             weekly digest email scheduler
    sheetsSync.js               Google Sheets row append
    retryQueue.js               failed sync retry queue

frontend/src/
  App.jsx                       router + UserContext + ChatContext
  api.js                        fetch wrapper (sends X-User-Id header)
  hooks/
    useSSE.js                   SSE event listener hook
    usePermissions.js           role-aware permission checks
    useKeyboardShortcuts.js     keyboard shortcut handler
  lib/tagColors.js              deterministic tag color palette
  components/
    Layout.jsx                  sidebar + global search + nav
    ConfirmationCard.jsx        post-extract review form
    StageTag.jsx                colored stage pill
    FileAttachments.jsx         file upload/list per account
    TaskPanel.jsx               inline task list component
    ComposeEmailModal.jsx       email compose for contacts
  pages/
    Dashboard.jsx               stats + pipeline health widgets
    Pipeline.jsx                kanban board (dnd-kit drag-and-drop)
    AccountList.jsx             account list + tag/stage filters
    AccountDetail.jsx           account detail + contacts + timeline + share
    Contacts.jsx                global contacts directory
    Leads.jsx                   lead pipeline + funnel visualization
    Deals.jsx                   deal list
    DealDetail.jsx              deal detail + stage history
    Tasks.jsx                   task list + filters
    Health.jsx                  account health score rankings
    Quotas.jsx                  quota tracking + attainment
    Reports.jsx                 configurable pipeline reports
    Workflows.jsx               automation rules UI
    Analytics.jsx               pipeline analytics (pure CSS charts)
    EntryLog.jsx                activity log + filters + edit modal + CSV export
    NewEntry.jsx                log activity (type / voice / paste thread)
    Chat.jsx                    AI assistant streaming chat
    Settings.jsx                team + stages + app settings + integrations
```
