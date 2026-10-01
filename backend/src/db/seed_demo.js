/**
 * seed_demo.js — one-time demo data for dev/testing
 * Run: node src/db/seed_demo.js
 */
const db     = require('./db');
require('./seed');   // ensures stages + settings exist before demo data
const crypto = require('crypto');

const uid = () => crypto.randomUUID();

// Guard: skip if demo data already exists
const existing = db.prepare('SELECT COUNT(*) as c FROM entries WHERE deleted_at IS NULL').get().c;
if (existing > 0) {
  console.log(`Demo data already present (${existing} entries). Skipping.`);
  process.exit(0);
}

// ── 1. Users ──────────────────────────────────────────────────────────────────
const users = [
  { display_name: 'Alex Rivera',  timezone: 'America/New_York' },
  { display_name: 'Jamie Chen',   timezone: 'America/Los_Angeles' },
  { display_name: 'Morgan Patel', timezone: 'America/Chicago' },
];

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (display_name, timezone) VALUES (@display_name, @timezone)
`);
for (const u of users) insertUser.run(u);

const userRows = db.prepare('SELECT id, display_name FROM users').all();
const userId = (name) => userRows.find(u => u.display_name === name)?.id;

const alex   = userId('Alex Rivera');
const jamie  = userId('Jamie Chen');
const morgan = userId('Morgan Patel');

// ── 2. Stage IDs ─────────────────────────────────────────────────────────────
const stageId = (name) => db.prepare('SELECT id FROM stages WHERE name = ?').get(name)?.id;

const PROSPECTING  = stageId('Prospecting');
const CONTACTED    = stageId('Contacted');
const SUBMITTED    = stageId('Submitted');
const PENDING      = stageId('Pending');
const STAGED       = stageId('Staged');
const CLOSED_WON   = stageId('Closed Won');
const CLOSED_LOST  = stageId('Closed Lost');
const ON_HOLD      = stageId('On Hold');

// ── 3. Accounts ───────────────────────────────────────────────────────────────
const accounts = [
  { name: 'Nomura Securities',      stage: STAGED,      owner: alex  },
  { name: 'BlackRock',              stage: PENDING,     owner: alex  },
  { name: 'Citadel',                stage: CONTACTED,   owner: jamie },
  { name: 'Bridgewater Associates', stage: SUBMITTED,   owner: morgan},
  { name: 'Renaissance Technologies', stage: PROSPECTING, owner: jamie },
  { name: 'Two Sigma',              stage: CLOSED_WON,  owner: alex  },
  { name: 'Point72',                stage: ON_HOLD,     owner: morgan},
  { name: 'Millennium Management',  stage: CONTACTED,   owner: jamie },
  { name: 'D.E. Shaw',              stage: PROSPECTING, owner: alex  },
  { name: 'AQR Capital',            stage: CLOSED_LOST, owner: morgan},
];

const insertAcct = db.prepare(`
  INSERT INTO accounts (name, aliases, current_stage_id)
  SELECT @name, '[]', @stage WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE name = @name AND deleted_at IS NULL)
`);
for (const a of accounts) insertAcct.run({ name: a.name, stage: a.stage });

const acctId = (name) => db.prepare('SELECT id FROM accounts WHERE name = ?').get(name)?.id;

// ── 4. Contacts ───────────────────────────────────────────────────────────────
const contacts = [
  { account: 'Nomura Securities',      name: 'Kenji Watanabe',  email: 'k.watanabe@nomura.com' },
  { account: 'Nomura Securities',      name: 'Yuki Tanaka',     email: 'y.tanaka@nomura.com'   },
  { account: 'BlackRock',              name: 'Sarah Mitchell',  email: 's.mitchell@blackrock.com' },
  { account: 'Citadel',                name: 'Derek Hoffman',   email: 'd.hoffman@citadel.com' },
  { account: 'Bridgewater Associates', name: 'Priya Kapoor',    email: 'p.kapoor@bridgewater.com' },
  { account: 'Two Sigma',              name: 'Lisa Park',       email: 'l.park@twosigma.com'   },
  { account: 'Point72',                name: 'Marcus Webb',     email: 'm.webb@point72.com'    },
];

const insertContact = db.prepare(`
  INSERT OR IGNORE INTO contacts (account_id, name, email) VALUES (@account_id, @name, @email)
`);
for (const c of contacts) {
  const aid = acctId(c.account);
  if (aid) insertContact.run({ account_id: aid, name: c.name, email: c.email });
}

// ── 5. Entries ─────────────────────────────────────────────────────────────────
const insertEntry = db.prepare(`
  INSERT INTO entries (
    id, account_id, owner_id, activity_type, purpose, channel,
    stage_id, outcome, next_step, next_step_date, meeting_date, meeting_time,
    deal_amount, source, raw_text, confidence, missing_fields
  ) VALUES (
    @id, @account_id, @owner_id, @activity_type, @purpose, @channel,
    @stage_id, @outcome, @next_step, @next_step_date, @meeting_date, @meeting_time,
    @deal_amount, @source, @raw_text, @confidence, @missing_fields
  )
`);

const insertRaw = db.prepare(`INSERT INTO raw_messages (entry_id, original_text) VALUES (?, ?)`);

function addEntry(e) {
  const id = uid();
  insertEntry.run({
    id,
    account_id:     acctId(e.account),
    owner_id:       e.owner,
    activity_type:  e.type,
    purpose:        e.purpose ?? null,
    channel:        e.channel ?? null,
    stage_id:       e.stage ?? null,
    outcome:        e.outcome ?? null,
    next_step:      e.next_step ?? null,
    next_step_date: e.next_step_date ?? null,
    meeting_date:   e.date,
    meeting_time:   e.time ?? null,
    deal_amount:    e.deal ?? null,
    source:        'typed',
    raw_text:       e.raw,
    confidence:    '{}',
    missing_fields:'[]',
  });
  insertRaw.run(id, e.raw);
  return id;
}

// Nomura Securities — active deal in Staged
addEntry({ account: 'Nomura Securities', owner: alex,  type: 'Meeting',     date: '2026-09-05', channel: 'In-person',  purpose: 'Intro call to discuss AI security partnership',         outcome: 'Very interested, requested a proposal',    next_step: 'Send proposal deck',             next_step_date: '2026-09-12', stage: CONTACTED,   raw: 'Intro meeting with Nomura Securities on Sep 5. Kenji Watanabe attended. They are very interested in our AI security platform. Requested a proposal by end of next week.' });
addEntry({ account: 'Nomura Securities', owner: alex,  type: 'Presentation', date: '2026-09-15', channel: 'Online',     purpose: 'Product demo and proposal walkthrough',                 outcome: 'Positive — asked about pricing tiers',     next_step: 'Send pricing breakdown',          next_step_date: '2026-09-20', stage: SUBMITTED,   raw: 'Presented the full product demo to Nomura on Sep 15 via Zoom. Kenji and Yuki both attended. They loved the real-time threat detection module. Asked about enterprise pricing tiers. Need to send pricing breakdown.' });
addEntry({ account: 'Nomura Securities', owner: alex,  type: 'Call',         date: '2026-09-25', channel: 'Phone',      purpose: 'Pricing discussion and contract terms',                 outcome: 'Agreed on base tier, reviewing contract',  next_step: 'Follow up on contract signature',  next_step_date: '2026-10-03', stage: STAGED,      deal: '$240,000', raw: 'Called Kenji at Nomura on Sep 25. They agreed to the base enterprise tier at $240k annually. Legal team is reviewing the contract now. Following up next week on signature.' });
addEntry({ account: 'Nomura Securities', owner: alex,  type: 'Meeting',      date: '2026-09-30', channel: 'In-person',  purpose: 'Onboarding prep — went over technical requirements',    outcome: 'Successful, IT team aligned',              next_step: 'Schedule kickoff call',            next_step_date: '2026-10-07', stage: STAGED,      raw: 'Lunch meetup with Nomura IT team on Sep 30. Went over onboarding requirements and integration specs. Very productive — their IT team is fully aligned. Need to schedule kickoff.' });

// BlackRock — pending approval
addEntry({ account: 'BlackRock', owner: alex,  type: 'Call',     date: '2026-09-10', channel: 'Phone',   purpose: 'Initial outreach re: portfolio risk analytics',  outcome: 'Interested, wants formal proposal', next_step: 'Send proposal', next_step_date: '2026-09-17', stage: CONTACTED, raw: 'Called Sarah Mitchell at BlackRock. She is interested in our portfolio risk analytics module. Asked us to submit a formal proposal.' });
addEntry({ account: 'BlackRock', owner: alex,  type: 'Proposal', date: '2026-09-18', channel: 'Email',   purpose: 'Submitted risk analytics platform proposal',     outcome: 'Submitted, awaiting review',        next_step: 'Follow up on approval', next_step_date: '2026-09-28', stage: SUBMITTED, deal: '$380,000', raw: 'Sent the full proposal to BlackRock on Sep 18 via email. $380k annual contract covering portfolio risk analytics and real-time reporting. Waiting for their procurement team to review.' });
addEntry({ account: 'BlackRock', owner: alex,  type: 'Call',     date: '2026-09-29', channel: 'Phone',   purpose: 'Procurement review update',                      outcome: 'Under review, decision in 2 weeks', next_step: 'Check back in', next_step_date: '2026-10-10', stage: PENDING, raw: 'Follow-up call with Sarah at BlackRock. Procurement is reviewing. Decision expected in 2 weeks. Will check back in on Oct 10.' });

// Citadel — early stage
addEntry({ account: 'Citadel', owner: jamie, type: 'Meeting', date: '2026-09-20', channel: 'Online',    purpose: 'Exploratory call on algorithmic trading analytics', outcome: 'Derek wants a deeper technical demo', next_step: 'Schedule technical demo', next_step_date: '2026-10-05', stage: CONTACTED, raw: 'Had an exploratory meeting with Derek Hoffman at Citadel over Zoom. He is curious about our algo trading analytics. Wants a deeper technical demo with their quant team. Scheduling for early October.' });
addEntry({ account: 'Citadel', owner: jamie, type: 'Call',    date: '2026-10-01', channel: 'Phone',     purpose: 'Confirm demo logistics',                            outcome: 'Demo confirmed Oct 8',             next_step: 'Prep demo environment',   next_step_date: '2026-10-07', stage: CONTACTED, raw: 'Quick call with Derek to confirm the demo date. Set for Oct 8 with 4 members of their quant team. Need to prep the demo environment beforehand.' });

// Bridgewater — submitted
addEntry({ account: 'Bridgewater Associates', owner: morgan, type: 'Meeting',     date: '2026-09-08', channel: 'In-person', purpose: 'Macro strategy data platform introduction',  outcome: 'Very aligned with their data needs', next_step: 'Submit detailed proposal', next_step_date: '2026-09-22', stage: CONTACTED,  raw: 'Met with Priya Kapoor at Bridgewater HQ. They are looking for a macro strategy data platform. Our solution is well aligned. She asked for a detailed proposal.' });
addEntry({ account: 'Bridgewater Associates', owner: morgan, type: 'Presentation', date: '2026-09-23', channel: 'Online',    purpose: 'Full platform demo to data team',            outcome: 'Strong interest from data team',     next_step: 'Send proposal + pricing', next_step_date: '2026-09-30', stage: SUBMITTED,  deal: '$520,000', raw: 'Presented to Bridgewater data team via Zoom. 6 attendees. Very strong reaction to the macro analytics module. $520k proposal sent afterward.' });

// Renaissance Technologies — prospecting
addEntry({ account: 'Renaissance Technologies', owner: jamie, type: 'Email',   date: '2026-09-28', channel: 'Email', purpose: 'Cold outreach on quant research data tools', outcome: 'No response yet', next_step: 'Follow up if no reply', next_step_date: '2026-10-05', stage: PROSPECTING, raw: 'Sent initial outreach email to Renaissance Technologies about our quant research data tools. Waiting for a response.' });

// Two Sigma — closed won!
addEntry({ account: 'Two Sigma', owner: alex, type: 'Meeting',  date: '2026-08-12', channel: 'Online',    purpose: 'Platform intro and discovery',              outcome: 'Excited, asked for proposal',       next_step: 'Send proposal', next_step_date: '2026-08-19', stage: CONTACTED,  raw: 'Discovery call with Lisa Park at Two Sigma. Very excited about our ML data pipeline features.' });
addEntry({ account: 'Two Sigma', owner: alex, type: 'Meeting',  date: '2026-08-25', channel: 'In-person', purpose: 'Contract negotiation',                      outcome: 'Agreed on terms',                   next_step: 'Send final contract', next_step_date: '2026-08-28', stage: STAGED, deal: '$290,000', raw: 'Met with Two Sigma legal and procurement in person. Agreed on contract terms at $290k annual. Sending final docs.' });
addEntry({ account: 'Two Sigma', owner: alex, type: 'Contract', date: '2026-09-02', channel: 'Email',     purpose: 'Contract signed — deal closed',             outcome: 'Signed and returned',               next_step: 'Begin onboarding', next_step_date: '2026-09-09', stage: CLOSED_WON, deal: '$290,000', raw: 'Two Sigma signed and returned the contract on Sep 2. Deal closed at $290k. Starting onboarding next week.' });

// Point72 — on hold
addEntry({ account: 'Point72', owner: morgan, type: 'Meeting', date: '2026-09-01', channel: 'Online',  purpose: 'Risk management platform discussion',  outcome: 'Interested but budget cycle ends Q4', next_step: 'Revisit in November', next_step_date: '2026-11-01', stage: ON_HOLD, raw: 'Met with Marcus Webb at Point72. They are interested but their budget cycle resets in Q4. Put on hold until November.' });

// Millennium Management — contacted
addEntry({ account: 'Millennium Management', owner: jamie, type: 'Call', date: '2026-09-26', channel: 'Phone', purpose: 'Intro call on data infrastructure modernization', outcome: 'Warm reception, wants more info', next_step: 'Send product overview deck', next_step_date: '2026-10-03', stage: CONTACTED, raw: 'Introductory call with Millennium Management. Warm reception. They are evaluating vendors for data infrastructure. Sending our overview deck.' });

// D.E. Shaw — early prospecting
addEntry({ account: 'D.E. Shaw', owner: alex, type: 'Email', date: '2026-09-30', channel: 'Email', purpose: 'Initial outreach on systematic trading analytics', outcome: null, next_step: 'Follow up next week', next_step_date: '2026-10-07', stage: PROSPECTING, raw: 'Sent initial outreach to D.E. Shaw about our systematic trading analytics platform. Will follow up next week if no response.' });

// AQR Capital — closed lost
addEntry({ account: 'AQR Capital', owner: morgan, type: 'Meeting',  date: '2026-08-20', channel: 'Online', purpose: 'Product evaluation',             outcome: 'Liked the product',   next_step: 'Send proposal', next_step_date: '2026-08-27', stage: SUBMITTED, raw: 'Met with AQR Capital product evaluation team. They liked our offering but had concerns about data residency requirements.' });
addEntry({ account: 'AQR Capital', owner: morgan, type: 'Call',     date: '2026-09-05', channel: 'Phone',  purpose: 'Proposal review and final decision', outcome: 'Went with a competitor due to data residency requirements', next_step: null, next_step_date: null, stage: CLOSED_LOST, raw: 'Final call with AQR. They decided to go with a competitor who can meet their EU data residency requirements. We lost the deal.' });

// ── Podcast entries ────────────────────────────────────────────────────────────
// Jamie guested on a FinTech podcast — brand/outreach play for Citadel
addEntry({ account: 'Citadel', owner: jamie, type: 'Podcast', date: '2026-09-12', channel: 'Podcast', purpose: 'AI in algorithmic trading — outreach and brand visibility', outcome: 'Episode live, Derek Hoffman at Citadel mentioned listening to it', next_step: 'Share episode link with Derek', next_step_date: '2026-09-14', stage: CONTACTED, raw: 'Jamie appeared on the Alpha Signal podcast on Sep 12. Topic was AI in algorithmic trading. Derek Hoffman at Citadel mentioned he caught the episode. Great brand moment. Sharing the link with him this week.' });

// Alex guested on a fintech podcast — generated interest from D.E. Shaw
addEntry({ account: 'D.E. Shaw', owner: alex, type: 'Podcast', date: '2026-09-22', channel: 'Podcast', purpose: 'Systematic trading analytics — product positioning and outreach', outcome: 'Inbound from D.E. Shaw after episode aired', next_step: 'Schedule intro call', next_step_date: '2026-10-02', stage: PROSPECTING, raw: 'Alex was a guest on the Quant Edge podcast on Sep 22, talking about systematic trading analytics. Got an inbound message from someone at D.E. Shaw who heard the episode and wants to learn more. Scheduling an intro call.' });

// Morgan recorded a podcast with a Bridgewater contact post-deal
addEntry({ account: 'Bridgewater Associates', owner: morgan, type: 'Podcast', date: '2026-09-27', channel: 'Podcast', purpose: 'Macro data strategy — co-hosted episode with Priya Kapoor', outcome: 'Successful recording, publishing next week', next_step: 'Send Priya final episode link when live', next_step_date: '2026-10-04', stage: SUBMITTED, raw: 'Recorded a co-hosted podcast episode with Priya Kapoor from Bridgewater on Sep 27. Topic was macro data strategy in volatile markets. Great relationship-building moment mid-deal. Publishing next week.' });

// ── Conference entries ─────────────────────────────────────────────────────────
// Jamie attended FinTech Summit — met Millennium Management there
addEntry({ account: 'Millennium Management', owner: jamie, type: 'Conference', date: '2026-09-17', channel: 'Conference', purpose: 'Networking at FinTech Summit NYC — connected with Millennium Management team', outcome: 'Exchanged cards with two PMs, warm intro to head of data infra', next_step: 'Follow up with intro email', next_step_date: '2026-09-19', stage: CONTACTED, raw: 'Attended FinTech Summit NYC on Sep 17. Connected with two portfolio managers from Millennium Management and got a warm intro to their head of data infrastructure. Exchanged cards. Following up with an intro email this week.' });

// Alex spoke on a panel at a quant conference — exposure for Renaissance Tech
addEntry({ account: 'Renaissance Technologies', owner: alex, type: 'Conference', date: '2026-09-19', channel: 'Conference', purpose: 'Panelist on AI-driven market analytics at Global Quant Conference', outcome: 'Several attendees from Renaissance Technologies approached after the panel', next_step: 'Send follow-up email to RenTech contacts', next_step_date: '2026-09-21', stage: PROSPECTING, raw: 'Alex spoke on a panel at the Global Quant Conference on Sep 19. Topic: AI-driven market analytics. Three people from Renaissance Technologies approached him afterward and asked for more info. Great outreach opportunity. Sending follow-up emails.' });

// Morgan attended a conference and met Point72 contact — set up re-engagement
addEntry({ account: 'Point72', owner: morgan, type: 'Conference', date: '2026-09-24', channel: 'Conference', purpose: 'Risk analytics track at Hedge Fund Ops Summit — reconnected with Marcus Webb', outcome: 'Marcus signaled Q4 budget may open up sooner than expected', next_step: 'Re-engage with updated pricing deck', next_step_date: '2026-10-08', stage: ON_HOLD, raw: 'Attended Hedge Fund Ops Summit on Sep 24. Ran into Marcus Webb from Point72 at the risk analytics track. He hinted their Q4 budget freeze may lift earlier than expected. Good signal — sending updated pricing deck to re-engage.' });

// ── 6. Update account stages to match latest entry ────────────────────────────
const stageUpdates = [
  ['Nomura Securities',       STAGED     ],
  ['BlackRock',               PENDING    ],
  ['Citadel',                 CONTACTED  ],
  ['Bridgewater Associates',  SUBMITTED  ],
  ['Renaissance Technologies',PROSPECTING],
  ['Two Sigma',               CLOSED_WON ],
  ['Point72',                 ON_HOLD    ],
  ['Millennium Management',   CONTACTED  ],
  ['D.E. Shaw',               PROSPECTING],
  ['AQR Capital',             CLOSED_LOST],
];

const updateStage = db.prepare(`UPDATE accounts SET current_stage_id = ? WHERE name = ?`);
for (const [name, sid] of stageUpdates) updateStage.run(sid, name);

// ── 7. Stage history ──────────────────────────────────────────────────────────
const insertSH = db.prepare(`
  INSERT INTO stage_history (account_id, from_stage_id, to_stage_id, changed_by_id, changed_at)
  VALUES (@account_id, @from, @to, @by, @at)
`);

const history = [
  { account: 'Nomura Securities',      from: CONTACTED,   to: SUBMITTED,  by: alex,   at: '2026-09-16 09:00:00' },
  { account: 'Nomura Securities',      from: SUBMITTED,   to: STAGED,     by: alex,   at: '2026-09-26 10:00:00' },
  { account: 'BlackRock',              from: CONTACTED,   to: SUBMITTED,  by: alex,   at: '2026-09-18 14:00:00' },
  { account: 'BlackRock',              from: SUBMITTED,   to: PENDING,    by: alex,   at: '2026-09-29 11:00:00' },
  { account: 'Bridgewater Associates', from: CONTACTED,   to: SUBMITTED,  by: morgan, at: '2026-09-23 16:00:00' },
  { account: 'Two Sigma',              from: CONTACTED,   to: STAGED,     by: alex,   at: '2026-08-25 13:00:00' },
  { account: 'Two Sigma',              from: STAGED,      to: CLOSED_WON, by: alex,   at: '2026-09-02 09:00:00' },
  { account: 'AQR Capital',            from: SUBMITTED,   to: CLOSED_LOST,by: morgan, at: '2026-09-05 15:00:00' },
  { account: 'Point72',                from: CONTACTED,   to: ON_HOLD,    by: morgan, at: '2026-09-01 11:00:00' },
];

for (const h of history) {
  insertSH.run({ account_id: acctId(h.account), from: h.from, to: h.to, by: h.by, at: h.at });
}

// ── Done ──────────────────────────────────────────────────────────────────────
const counts = {
  users:    db.prepare('SELECT COUNT(*) as c FROM users').get().c,
  accounts: db.prepare('SELECT COUNT(*) as c FROM accounts WHERE deleted_at IS NULL').get().c,
  contacts: db.prepare('SELECT COUNT(*) as c FROM contacts WHERE deleted_at IS NULL').get().c,
  entries:  db.prepare('SELECT COUNT(*) as c FROM entries WHERE deleted_at IS NULL').get().c,
};
console.log('Demo data seeded:');
console.log(`  ${counts.users} users, ${counts.accounts} accounts, ${counts.contacts} contacts, ${counts.entries} entries`);
