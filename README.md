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
│  ├─ Activity Log          State                         │
│  └─ Log Activity          ├─ UserContext (localStorage) │
│                           └─ SSE listener (real-time)   │
└──────────────────┬──────────────────────────────────────┘
                   │  HTTP /api/*  (Vite proxy)
                   │  GET /api/events  (SSE stream)
┌──────────────────▼──────────────────────────────────────┐
│                Express Server  (port 3001)               │
│                                                         │
│  Routes                                                 │
│  ├─ /api/entries       log + edit + soft-delete         │
│  ├─ /api/entries/extract   preview without saving       │
│  ├─ /api/accounts      CRUD + stage moves               │
│  ├─ /api/stages        pipeline stage config            │
│  ├─ /api/dashboard     all widget data in one call      │
│  ├─ /api/events        SSE push stream                  │
│  ├─ /api/users         team member list                 │
│  ├─ /api/settings      app config                       │
│  ├─ /api/chat          [Phase 3 stub]                   │
│  ├─ /api/share         [Phase 7 stub]                   │
│  └─ /api/sync          [Phase 5 stub]                   │
│                                                         │
│  Services                                               │
│  ├─ extractor.js       rules-based field extraction     │
│  │   └─ keyword dicts → activity type, channel,        │
│  │      stage, purpose, next step, outcome, amount      │
│  ├─ dateParser.js      chrono-node → meeting_date/time  │
│  ├─ fuzzyMatcher.js    Fuse.js → account name matching  │
│  ├─ sseEmitter.js      broadcasts events to all clients │
│  ├─ sheetsSync.js      [Phase 5 stub]                   │
│  ├─ xlsxFallback.js    [Phase 5 stub]                   │
│  ├─ retryQueue.js      [Phase 5 stub]                   │
│  ├─ shareFormatter.js  [Phase 7 stub]                   │
│  └─ templateBuilder.js [Phase 7 stub]                   │
│                                                         │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│              SQLite  (better-sqlite3)                   │
│              backend/data/gtm.db                        │
│                                                         │
│  Tables                                                 │
│  ├─ stages          pipeline stages + colors            │
│  ├─ users           team members                        │
│  ├─ accounts        companies / firms being tracked     │
│  ├─ contacts        people at each account              │
│  ├─ entries         every logged activity (core table)  │
│  ├─ stage_history   full audit trail of stage moves     │
│  ├─ raw_messages    original text, append-only          │
│  ├─ edit_history    field-level change log              │
│  ├─ shares          share log                           │
│  ├─ sync_log        Google Sheets sync queue            │
│  └─ settings        app-wide config                     │
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
      ├──► sheetsSync.js  (writes to Google Sheets — Phase 5)
      ├──► retryQueue.js  (queues failed syncs — Phase 5)
      └──► sseEmitter.js  (broadcasts "new_entry" to all open tabs)
                │
                ▼
        Dashboard + Pipeline update live
```

---

## Phases

### Phase 1 — Database & Schema  ✅ Complete
- SQLite database with WAL mode
- All tables: stages, users, accounts, contacts, entries, stage history, edit history, raw messages, sync log, settings
- Idempotent seed: 8 default pipeline stages, default settings

### Phase 2 — Backend API & Extraction Engine  ✅ Complete
- All REST routes for entries, accounts, stages, users, settings, dashboard
- Rules-based extractor: pulls activity type, channel, date/time, account name, purpose, next step, outcome, deal amount from free text — zero AI, zero cost
- Activity types: Meeting, Call, Email, Demo, Presentation, Follow-up, Proposal, Contract, **Podcast**, **Conference**
- Channels: Online, In-person, Phone, Email, **Conference**, **Podcast**
- Outcome sentiment extraction: Successful / Not interested / Needs follow-up
- Fuzzy account matching via Fuse.js (catches typos and alternate names)
- Date parsing via chrono-node ("next Friday", "Oct 12", "lunch" → 12:00)
- Server-Sent Events (SSE) for real-time push to all connected browsers
- Soft deletes, edit history logging, stage history audit trail

### Phase 3 — AI Chat / Q&A  ✅ Complete
- `POST /api/chat/query` streams plain-English answers over all pipeline data
- Powered by **Ollama (local, free)** — no API key, no cost, runs entirely on your machine
- Uses `llama3.2` by default; configurable via `OLLAMA_MODEL` and `OLLAMA_URL` in `.env`
- Streaming SSE response — answers appear word-by-word in the UI
- Context includes: all accounts + stages, last 80 activity entries, all overdue next steps
- Chat UI accessible via **Assistant** in the sidebar (`/chat`)
- Suggestion chips on first load for common queries (overdue deals, stale accounts, top performers, etc.)

### AI Tool Calling  ✅ Complete
- Assistant can now **take real actions**, not just answer questions
- Uses Ollama function/tool calling: model declares intent → server executes against SQLite → model confirms
- Supported actions:
  - **Assign owner** — "Assign Nomura to Jamie Chen" → updates `owner_id` on account
  - **Move stage** — "Move BlackRock to Closed Won" → updates stage + logs stage history
  - **Update next step** — "Set next step for Citadel to send proposal by Nov 1" → updates latest entry
- Fuzzy account name matching — partial names and typos still resolve correctly
- Falls back to pure Q&A when no action is requested

```
# backend/.env (optional overrides)
OLLAMA_MODEL=llama3.2        # or llama3.1, mistral, gemma2, etc.
OLLAMA_URL=http://localhost:11434
```

### Phase 4 — Frontend  ✅ Complete
- Dashboard with stats, pipeline health, overdue next steps, upcoming meetings, stale deals, stage movement feed
- Kanban pipeline board with drag-and-drop stage moves (dnd-kit)
- Account list with search and stage filter
- Account detail page with contact list, stage history, activity timeline
- Activity log with filters (account, stage, date range)
- Log activity page: Type / Voice (Web Speech API) / Paste thread → extract → confirm → save
- Real-time updates via SSE (dashboard and pipeline refresh on new entries)

### Phase 5 — Google Sheets Sync  ✅ Complete
- Every saved entry is automatically appended as a row in a Google Sheet
- Auto-creates the "Activities" tab and header row on first sync
- Failed syncs are retried in the background every 5 minutes (up to 5 attempts)
- Sync status visible in **Settings → Sheets Sync**: counts, last success time, failed entries, Retry All button
- `dotenv` loads credentials from `backend/.env` at server startup

```
# backend/.env
GOOGLE_SHEETS_SPREADSHEET_ID=your-sheet-id
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-sa@project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
```

Setup: create a Google Service Account at console.cloud.google.com, enable the Sheets API, share your spreadsheet with the service account email (Editor access).

### Settings UI  ✅ Complete
- Accessible via **Settings** in the sidebar (`/settings`)
- **Team tab**: view all team members, add new members with name + timezone
- **Stages tab**: rename stages, change colors, add new stages, delete empty ones
- **App Settings tab**: configure app name, stale deal threshold (days), default timezone
- All changes persist immediately — no restart required

### Activity Notifications  ✅ Complete
- When a new entry is logged for an account, all other team members who have previously interacted with that account are emailed a summary
- Email includes: date, activity type, channel, topic, outcome, next step, deal value
- Email addresses managed in **Settings → Team** — inline edit per user, also set at member creation
- Powered by Nodemailer — works with any SMTP provider (Gmail, SendGrid, etc.)
- If SMTP is not configured, notifications are logged to console only (no errors)

```
# backend/.env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password    # Gmail: use an App Password
NOTIFY_FROM=GTM Tracker <you@gmail.com>
```

### Phase 6 — Voice & Conversation Import  ✅ Complete
- Voice tab uses browser Web Speech API (Chrome/Edge) for live transcription
- **Paste Thread** tab: paste a Slack/email/chat thread → splits into individual messages → extract all at once
- Supports formats: `[10:30] Name: message`, `Name: message`, `Name (date): message`
- Thread review screen shows each extracted message as a compact card:
  - Detected author + timestamp badge per card
  - Editable account name, activity type, and date fields inline
  - Toggle to show/hide raw text
  - Checkbox to include or exclude each entry
- Select All / Deselect All buttons for bulk control
- Save N entries button — saves selected entries sequentially with running progress counter
- Powered by `POST /api/entries/extract-conversation` (backend splits + extracts each block)

### Pipeline Analytics  ✅ Complete
- New **Analytics** page in the sidebar (`/analytics`)
- Win rate stat cards — total accounts, Closed Won, Closed Lost, win %
- **Pipeline funnel** — horizontal bar chart of accounts per stage
- **Avg days in stage** — how long accounts typically sit at each stage (computed from stage history)
- **Activity type breakdown** — Meeting, Call, Email, Demo, Podcast, Conference, etc.
- **Monthly activity chart** — entry count over the last 6 months
- **Top accounts** — ranked by number of logged activities
- Powered by `GET /api/analytics` (zero charting libraries — pure CSS bars)

### Entry Editing  ✅ Complete
- Every row in the Activity Log has an **Edit** button
- Opens a modal with all editable fields: date, activity type, channel, purpose, outcome, next step + due date, deal amount
- **Delete** button inside the modal with a confirmation step before removal
- All edits are logged to the `edit_history` table automatically (field-level audit trail)

### Deal Forecasting  ✅ Complete
- **Weighted pipeline value** shown on Dashboard — total deal value × stage probability
- Stage weights: Prospecting 10% → Contacted 20% → Submitted 40% → Pending 60% → Staged 75% → Closed Won 100%
- Two new stat cards on Dashboard: "Weighted pipeline" and "Total pipeline"
- Computed from each account's latest entry with a deal amount, powered by `GET /api/dashboard`

### Export to CSV  ✅ Complete
- **↓ Export CSV** button on the Activity Log page (appears when entries are loaded)
- Exports all currently visible entries (respects active filters) as a `.csv` download
- Columns: Date, Account, Type, Channel, Stage, Purpose, Outcome, Next Step, Due, Deal Amount, Owner
- No backend needed — built entirely in the browser

### Duplicate Account Detection  ✅ Complete
- When extracting an entry, if the account name doesn't exactly match but similar accounts exist, a **yellow warning banner** appears in the confirmation card
- "Possible duplicate — did you mean: [Nomura Securities] (87% match) — use this"
- One-click to adopt the existing account instead of creating a duplicate
- Also fixed a pre-existing regex bug in the extractor (`{2,60?}` → `{2,60}?`) that was silently preventing many account names from being extracted correctly

### Weekly Digest Email  ✅ Complete
- Automated Monday morning email sent to all team members with email addresses
- Digest includes: overdue next steps, stale deals, upcoming meetings for the week, pipeline snapshot by stage
- Scheduler runs hourly and fires between 7–9 AM on Mondays; tracks `last_digest_sent` in settings to avoid duplicates
- Uses the same SMTP config as activity notifications; logs to console if SMTP not configured
- Manual trigger available via `require('./services/digestMailer').sendDigest()` in Node

### Mobile-Responsive Layout  ✅ Complete
- At ≤ 768px the sidebar collapses into a **horizontal top nav** bar
- Nav labels shrink to icon + short text in a scrollable row; sidebar footer hidden on mobile
- Grids (card-grid, stats-row, form-row) reflow to 1–2 columns on small screens
- Tables stay horizontally scrollable; kanban board retains horizontal scroll

### Dashboard Owner Filter  ✅ Complete
- **"All owners" dropdown** in the Dashboard page header
- Selecting a team member filters all widgets to show only their activities, overdue steps, and meetings
- The `/api/dashboard` endpoint already supported `?owner_id=` — this wires up the UI

### Account Tags  ✅ Complete
- Freeform labels on any account — visible as colored chips on the Account Detail page and the Accounts list
- **Add** a tag: type in the dashed input below the account name and press Enter
- **Remove** a tag: click × on any chip — saves immediately via `PATCH /api/accounts/:id`
- Tag colors are deterministic (hash → 8-color palette) so the same tag is always the same color everywhere
- **Filter by tag** in the Accounts list — "All tags" dropdown appears when any tags exist, powered by `GET /api/accounts/tags`

### Keyboard Shortcuts  ✅ Complete
- Press `?` anywhere to open the shortcuts overlay (Esc to close)
- Navigation shortcuts: `n` Log Activity · `d` Dashboard · `k` Pipeline · `a` Accounts · `l` Activity Log · `c` AI Assistant
- Shortcuts are disabled while typing in any input, textarea, or select field
- Implemented via `useKeyboardShortcuts` hook (`frontend/src/hooks/useKeyboardShortcuts.js`); overlay rendered in `Layout.jsx`

### Phase 7 — Share & Export  ✅ Complete
- **↗ Share button** on every account detail page opens a modal
- Toggle filters before generating: hide deal amounts, hide contacts, hide outcome notes
- Produces a clean email-style summary — opening line, key contacts, recent activity narrative, open next steps
- **Copy to Clipboard** — paste directly into any email or Slack message
- **Open in Email** — pre-fills subject + body in your default mail client
- Every share is logged to the `shares` table (`GET /api/share/log` for history)

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

Stages are fully configurable via `POST/PATCH /api/stages`.

---

## Key Files

```
backend/src/
  app.js                   server entry point
  db/schema.sql            full database schema
  db/seed.js               stage + settings seed (idempotent)
  services/extractor.js    ← core extraction logic lives here
  services/dateParser.js
  services/fuzzyMatcher.js
  services/sseEmitter.js

frontend/src/
  App.jsx                  router + UserContext
  api.js                   fetch wrapper
  hooks/useSSE.js          SSE listener
  hooks/useKeyboardShortcuts.js   keyboard shortcut handler
  lib/tagColors.js         deterministic tag color palette
  pages/Dashboard.jsx
  pages/Pipeline.jsx       kanban board (dnd-kit)
  pages/Analytics.jsx      pipeline analytics charts
  pages/NewEntry.jsx       log activity + voice input
  pages/Chat.jsx           AI assistant chat UI
  components/ConfirmationCard.jsx   extraction review UI
```