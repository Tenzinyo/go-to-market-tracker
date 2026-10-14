/**
 * seed_demo.js — comprehensive demo data
 *
 * Run (fresh DB):   node src/db/seed_demo.js
 * Force re-seed:    node src/db/seed_demo.js --reset
 */

const db     = require('./db');
require('./seed');   // ensure stages, pipelines, settings exist first
const crypto = require('crypto');

const RESET = process.argv.includes('--reset');

// ── Guard ─────────────────────────────────────────────────────────────────────
const existing = db.prepare('SELECT COUNT(*) as c FROM entries WHERE deleted_at IS NULL').get().c;
if (existing > 0 && !RESET) {
  console.log(`Demo data already present (${existing} entries). Use --reset to re-seed.`);
  process.exit(0);
}

if (RESET) {
  console.log('Resetting demo data…');
  db.prepare(`DELETE FROM workflow_runs`).run();
  db.prepare(`DELETE FROM workflows`).run();
  db.prepare(`DELETE FROM tasks`).run();
  db.prepare(`DELETE FROM deal_stage_history`).run();
  db.prepare(`DELETE FROM deals`).run();
  db.prepare(`DELETE FROM stage_history`).run();
  db.prepare(`DELETE FROM sync_log`).run();
  db.prepare(`DELETE FROM edit_history`).run();
  db.prepare(`DELETE FROM raw_messages`).run();
  db.prepare(`DELETE FROM entries`).run();
  db.prepare(`DELETE FROM contacts`).run();
  db.prepare(`DELETE FROM accounts`).run();
  db.prepare(`DELETE FROM users`).run();
}

const uid = () => crypto.randomUUID();

// ── 1. Users ──────────────────────────────────────────────────────────────────
const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (display_name, email, timezone, role)
  VALUES (@display_name, @email, @timezone, @role)
`);

const USERS = [
  { display_name: 'Alex Rivera',  email: 'alex@gtmtracker.io',   timezone: 'America/New_York',      role: 'admin'   },
  { display_name: 'Jamie Chen',   email: 'jamie@gtmtracker.io',  timezone: 'America/Los_Angeles',   role: 'manager' },
  { display_name: 'Morgan Patel', email: 'morgan@gtmtracker.io', timezone: 'America/Chicago',       role: 'rep'     },
];
for (const u of USERS) insertUser.run(u);

const userRows = db.prepare('SELECT id, display_name FROM users').all();
const userId   = name => userRows.find(u => u.display_name === name)?.id;
const alex   = userId('Alex Rivera');
const jamie  = userId('Jamie Chen');
const morgan = userId('Morgan Patel');

// ── 2. Stage IDs ──────────────────────────────────────────────────────────────
const stageId  = name => db.prepare('SELECT id FROM stages WHERE name = ?').get(name)?.id;
const PROSPECT = stageId('Prospecting');
const CONTACT  = stageId('Contacted');
const SUBMIT   = stageId('Submitted');
const PENDING  = stageId('Pending');
const STAGED   = stageId('Staged');
const WON      = stageId('Closed Won');
const LOST     = stageId('Closed Lost');
const HOLD     = stageId('On Hold');

// ── 3. Accounts ───────────────────────────────────────────────────────────────
const insertAcct = db.prepare(`
  INSERT INTO accounts
    (name, current_stage_id, owner_id, lifecycle_stage, industry,
     website, city, country, employee_count, tags)
  VALUES
    (@name, @stage, @owner, @lifecycle, @industry,
     @website, @city, @country, @employees, @tags)
`);

const ACCOUNTS = [
  // name,                    stage,   owner,  lifecycle,    industry,             website,                       city,            country,  employees, tags
  ['Nomura Securities',        STAGED,  alex,   'opportunity','Financial Services', 'https://nomura.com',          'New York',      'US',     26000,    '["enterprise","priority"]'],
  ['BlackRock',                PENDING, alex,   'opportunity','Asset Management',   'https://blackrock.com',       'New York',      'US',     20000,    '["enterprise"]'],
  ['Citadel',                  CONTACT, jamie,  'sql',        'Hedge Fund',         'https://citadel.com',         'Chicago',       'US',      2800,    '["hedge-fund"]'],
  ['Bridgewater Associates',   SUBMIT,  morgan, 'opportunity','Hedge Fund',         'https://bridgewater.com',     'Westport',      'US',      1700,    '["hedge-fund","priority"]'],
  ['Renaissance Technologies', PROSPECT,jamie,  'mql',        'Quantitative Fund',  'https://rentec.com',          'East Setauket', 'US',       400,    '["quant"]'],
  ['Two Sigma',                WON,     alex,   'customer',   'Quantitative Fund',  'https://twosigma.com',        'New York',      'US',      3500,    '["quant","won"]'],
  ['Point72',                  HOLD,    morgan, 'sql',        'Hedge Fund',         'https://point72.com',         'Stamford',      'US',      2000,    '["hedge-fund"]'],
  ['Millennium Management',    CONTACT, jamie,  'sql',        'Hedge Fund',         'https://mlp.com',             'New York',      'US',      4700,    '["hedge-fund"]'],
  ['D.E. Shaw',                PROSPECT,alex,   'mql',        'Quantitative Fund',  'https://deshaw.com',          'New York',      'US',      1500,    '["quant"]'],
  ['AQR Capital',              LOST,    morgan, 'lead',       'Quantitative Fund',  'https://aqr.com',             'Greenwich',     'US',      1000,    '["quant","lost"]'],
  ['Man Group',                SUBMIT,  jamie,  'opportunity','Hedge Fund',         'https://man.com',             'London',        'UK',      1400,    '["hedge-fund","international"]'],
  ['Fidelity Investments',     CONTACT, morgan, 'sql',        'Asset Management',   'https://fidelity.com',        'Boston',        'US',     60000,    '["enterprise"]'],
  ['Vanguard',                 PROSPECT,alex,   'lead',       'Asset Management',   'https://vanguard.com',        'Malvern',       'US',     20000,    '["enterprise"]'],
  ['Tiger Global',             PROSPECT,jamie,  'lead',       'Venture / Hedge',    'https://tigerglobal.com',     'New York',      'US',       200,    '["hedge-fund"]'],
  ['Coatue Management',        CONTACT, alex,   'mql',        'Venture / Hedge',    'https://coatue.com',          'New York',      'US',       300,    '["hedge-fund"]'],
];

for (const [name, stage, owner, lifecycle, industry, website, city, country, employees, tags] of ACCOUNTS) {
  insertAcct.run({ name, stage, owner, lifecycle, industry, website, city, country, employees, tags });
}

const acctId = name => db.prepare('SELECT id FROM accounts WHERE name = ?').get(name)?.id;

// ── 4. Contacts ───────────────────────────────────────────────────────────────
const insertContact = db.prepare(`
  INSERT OR IGNORE INTO contacts (account_id, name, email, phone, title, notes)
  VALUES (@account_id, @name, @email, @phone, @title, @notes)
`);

const CONTACTS = [
  { account: 'Nomura Securities',      name: 'Kenji Watanabe',    email: 'k.watanabe@nomura.com',       phone: '+1 212 555 0101', title: 'Head of Technology Procurement', notes: 'Primary champion. Very technical. Responds best in the morning.' },
  { account: 'Nomura Securities',      name: 'Yuki Tanaka',       email: 'y.tanaka@nomura.com',         phone: '+1 212 555 0102', title: 'Director of Risk Systems',       notes: 'Budget approver. Met in person Sep 30. Positive on timeline.' },
  { account: 'BlackRock',              name: 'Sarah Mitchell',    email: 's.mitchell@blackrock.com',    phone: '+1 646 555 0201', title: 'VP Portfolio Risk Analytics',    notes: 'Key contact. Very responsive. Procurement runs through her.' },
  { account: 'BlackRock',              name: 'Tom Brecker',       email: 't.brecker@blackrock.com',     phone: null,              title: 'Head of Enterprise Procurement', notes: 'Decision maker on contracts. Harder to reach.' },
  { account: 'Citadel',                name: 'Derek Hoffman',     email: 'd.hoffman@citadel.com',       phone: '+1 312 555 0301', title: 'Managing Director, Quant',       notes: 'Listened to our podcast. Strong quant background.' },
  { account: 'Bridgewater Associates', name: 'Priya Kapoor',      email: 'p.kapoor@bridgewater.com',   phone: '+1 203 555 0401', title: 'Head of Data Strategy',         notes: 'Co-hosted podcast with Morgan. Very aligned on macro analytics.' },
  { account: 'Two Sigma',              name: 'Lisa Park',         email: 'l.park@twosigma.com',         phone: '+1 212 555 0601', title: 'CTO',                            notes: 'Signed off on the deal. Very technical and direct.' },
  { account: 'Point72',                name: 'Marcus Webb',       email: 'm.webb@point72.com',          phone: '+1 203 555 0701', title: 'Head of Risk Technology',        notes: 'Budget freeze until Q4. Met at Hedge Fund Ops Summit Sep 24.' },
  { account: 'Millennium Management',  name: 'Rachel Torres',     email: 'r.torres@mlp.com',            phone: '+1 212 555 0801', title: 'Director of Data Infrastructure', notes: 'Evaluating multiple vendors. Likes our pricing flexibility.' },
  { account: 'Man Group',              name: 'Oliver Bennett',    email: 'o.bennett@man.com',           phone: '+44 20 7144 1000', title: 'Head of Quantitative Systems', notes: 'UK contact. Time zone 5 hrs ahead. Very analytical in evaluations.' },
  { account: 'Fidelity Investments',   name: 'Carla Simmons',     email: 'c.simmons@fidelity.com',      phone: '+1 617 555 1101', title: 'VP Technology Strategy',         notes: 'Enterprise procurement process is slow. Need exec sponsor.' },
  { account: 'Coatue Management',      name: 'Nathan Lee',        email: 'n.lee@coatue.com',            phone: '+1 212 555 1501', title: 'Head of Technology',             notes: 'Intro via conference. Interested in ML pipeline features.' },
  { account: 'D.E. Shaw',              name: 'Eleanor Voss',      email: 'e.voss@deshaw.com',           phone: null,              title: 'Director of Systematic Research', notes: 'Inbound after podcast. Very interested in quant analytics.' },
  { account: 'AQR Capital',            name: 'James Thorn',       email: 'j.thorn@aqr.com',             phone: '+1 203 555 1001', title: 'Head of Technology',             notes: 'Lost to competitor on EU data residency. Keep warm for future.' },
];

for (const c of CONTACTS) {
  const aid = acctId(c.account);
  if (aid) insertContact.run({ account_id: aid, name: c.name, email: c.email, phone: c.phone ?? null, title: c.title, notes: c.notes });
}

// ── 5. Deals ─────────────────────────────────────────────────────────────────
const insertDeal = db.prepare(`
  INSERT INTO deals
    (name, account_id, owner_id, current_stage_id, amount, currency,
     close_date, probability, forecast_category, won_at, lost_at, description)
  VALUES
    (@name, @account_id, @owner_id, @stage_id, @amount, 'USD',
     @close_date, @prob, @forecast, @won_at, @lost_at, @description)
`);

const DEALS = [
  // name,                                           account,                   owner,  stage,   amount,   close_date,   prob, forecast,    won_at,       lost_at, desc
  ['AI Security Platform — Enterprise License',      'Nomura Securities',        alex,   STAGED,  240000,  '2026-10-15',  75, 'commit',    null,          null,   'Full enterprise license for AI-driven security monitoring platform'],
  ['Portfolio Risk Analytics Suite',                 'BlackRock',                alex,   PENDING, 380000,  '2026-10-31',  50, 'best_case', null,          null,   'Real-time portfolio risk analytics and reporting module'],
  ['Algo Trading Analytics — Pilot',                 'Citadel',                  jamie,  CONTACT,  80000,  '2026-11-30',  20, 'pipeline',  null,          null,   'Initial pilot for algorithmic trading analytics — 6-month term'],
  ['Macro Data Platform',                            'Bridgewater Associates',   morgan, SUBMIT,  520000,  '2026-10-25',  60, 'best_case', null,          null,   'Macro strategy data platform with real-time global feeds'],
  ['ML Data Pipeline — Annual',                      'Two Sigma',                alex,   WON,     290000,  '2026-09-02',  100,'commit',    '2026-09-02',  null,   'Closed. Annual ML data pipeline license with 3-year renewal option'],
  ['Quant Research Data Tools',                      'Renaissance Technologies', jamie,  PROSPECT, 150000, '2026-12-31',  10, 'pipeline',  null,          null,   'Exploratory — quant research and backtesting data tools'],
  ['Risk Analytics Platform',                        'Point72',                  morgan, HOLD,    200000,  '2026-12-15',  30, 'pipeline',  null,          null,   'On hold until Q4 budget cycle opens'],
  ['Data Infrastructure Modernisation',              'Millennium Management',    jamie,  CONTACT,  95000,  '2026-12-01',  20, 'pipeline',  null,          null,   'Data infrastructure modernisation — starting with a pilot phase'],
  ['EU Data Residency Analytics Package',            'AQR Capital',              morgan, LOST,    175000,  '2026-09-10',  0,  'omitted',   null,          '2026-09-10', 'Lost to competitor who met EU data residency requirements'],
  ['Systematic Trading Analytics Suite',             'Man Group',                jamie,  SUBMIT,  310000,  '2026-11-15',  55, 'best_case', null,          null,   'Comprehensive systematic trading analytics for European markets'],
  ['Enterprise Analytics Pilot',                     'Fidelity Investments',     morgan, CONTACT,  60000,  '2026-12-31',  15, 'pipeline',  null,          null,   'Initial pilot program — potential $800k expansion if successful'],
];

for (const [name, account, owner, stage, amount, close_date, prob, forecast, won_at, lost_at, desc] of DEALS) {
  const aid = acctId(account);
  if (aid) {
    insertDeal.run({ name, account_id: aid, owner_id: owner, stage_id: stage, amount, close_date, prob, forecast, won_at, lost_at, description: desc });
  }
}

const dealId = name => db.prepare(`SELECT id FROM deals WHERE name = ?`).get(name)?.id;

// ── 6. Entries ────────────────────────────────────────────────────────────────
const insertEntry = db.prepare(`
  INSERT INTO entries (
    id, account_id, owner_id, activity_type, purpose, channel,
    stage_id, outcome, next_step, next_step_date, meeting_date,
    deal_amount, source, raw_text, confidence, missing_fields
  ) VALUES (
    @id, @account_id, @owner_id, @type, @purpose, @channel,
    @stage_id, @outcome, @next_step, @next_step_date, @date,
    @deal, 'typed', @raw, '{}', '[]'
  )
`);
const insertRaw = db.prepare(`INSERT INTO raw_messages (entry_id, original_text) VALUES (?, ?)`);

function addEntry(e) {
  const id = uid();
  insertEntry.run({
    id,
    account_id:     acctId(e.account),
    owner_id:       e.owner,
    type:           e.type,
    purpose:        e.purpose       ?? null,
    channel:        e.channel       ?? null,
    stage_id:       e.stage         ?? null,
    outcome:        e.outcome       ?? null,
    next_step:      e.next_step     ?? null,
    next_step_date: e.next_step_date ?? null,
    date:           e.date,
    deal:           e.deal          ?? null,
    raw:            e.raw,
  });
  insertRaw.run(id, e.raw);
  return id;
}

// ── Nomura Securities ─────────────────────────────────────────────────────────
addEntry({ account: 'Nomura Securities', owner: alex, type: 'Meeting', date: '2026-09-05', channel: 'In-person', purpose: 'Intro call — AI security partnership', outcome: 'Very interested, requested proposal', next_step: 'Send proposal deck', next_step_date: '2026-09-12', stage: CONTACT, raw: 'Intro meeting with Nomura Securities Sep 5. Kenji Watanabe attended. Strong interest in AI security platform. Requested a proposal by end of next week.' });
addEntry({ account: 'Nomura Securities', owner: alex, type: 'Presentation', date: '2026-09-15', channel: 'Online', purpose: 'Product demo and proposal walkthrough', outcome: 'Positive — asked about pricing tiers', next_step: 'Send pricing breakdown', next_step_date: '2026-09-20', stage: SUBMIT, raw: 'Full product demo to Nomura via Zoom Sep 15. Kenji and Yuki attended. Loved the real-time threat detection module. Asked about enterprise pricing tiers.' });
addEntry({ account: 'Nomura Securities', owner: alex, type: 'Call', date: '2026-09-25', channel: 'Phone', purpose: 'Pricing discussion and contract terms', outcome: 'Agreed on base tier, reviewing contract', next_step: 'Follow up on signature', next_step_date: '2026-10-03', stage: STAGED, deal: '$240,000', raw: 'Called Kenji at Nomura Sep 25. Agreed to base enterprise tier at $240k annually. Legal reviewing contract now.' });
addEntry({ account: 'Nomura Securities', owner: alex, type: 'Meeting', date: '2026-09-30', channel: 'In-person', purpose: 'Onboarding prep — technical requirements', outcome: 'IT team fully aligned', next_step: 'Schedule kickoff call', next_step_date: '2026-10-07', stage: STAGED, raw: 'Lunch with Nomura IT team Sep 30. Reviewed onboarding requirements and integration specs. Very productive. Schedule kickoff next.' });
addEntry({ account: 'Nomura Securities', owner: alex, type: 'Call', date: '2026-10-05', channel: 'Phone', purpose: 'Contract status check', outcome: 'Legal finishing review this week', next_step: 'Get signed contract', next_step_date: '2026-10-12', stage: STAGED, raw: 'Quick check-in with Kenji. Legal almost done with review. Expecting signed contract by end of week.' });

// ── BlackRock ─────────────────────────────────────────────────────────────────
addEntry({ account: 'BlackRock', owner: alex, type: 'Call', date: '2026-09-10', channel: 'Phone', purpose: 'Initial outreach — portfolio risk analytics', outcome: 'Interested, wants formal proposal', next_step: 'Send proposal', next_step_date: '2026-09-17', stage: CONTACT, raw: 'Called Sarah Mitchell at BlackRock. Interested in portfolio risk analytics module. Wants a formal proposal submitted.' });
addEntry({ account: 'BlackRock', owner: alex, type: 'Proposal', date: '2026-09-18', channel: 'Email', purpose: 'Submitted risk analytics platform proposal', outcome: 'Submitted, awaiting review', next_step: 'Follow up on approval', next_step_date: '2026-09-28', stage: SUBMIT, deal: '$380,000', raw: 'Sent full proposal to BlackRock Sep 18. $380k annual contract covering portfolio risk analytics and real-time reporting. Waiting on procurement review.' });
addEntry({ account: 'BlackRock', owner: alex, type: 'Call', date: '2026-09-29', channel: 'Phone', purpose: 'Procurement review update', outcome: 'Under review, decision in 2 weeks', next_step: 'Check back in Oct 10', next_step_date: '2026-10-10', stage: PENDING, raw: 'Follow-up with Sarah at BlackRock. Procurement reviewing. Decision expected in 2 weeks.' });
addEntry({ account: 'BlackRock', owner: alex, type: 'Meeting', date: '2026-10-08', channel: 'Online', purpose: 'Procurement team Q&A', outcome: 'Good session — two remaining concerns on SLAs', next_step: 'Send SLA addendum', next_step_date: '2026-10-11', stage: PENDING, raw: 'Zoom call with BlackRock procurement team and Sarah. Two outstanding concerns about SLA response times. Sending an addendum to address them.' });

// ── Citadel ───────────────────────────────────────────────────────────────────
addEntry({ account: 'Citadel', owner: jamie, type: 'Meeting', date: '2026-09-12', channel: 'Podcast', purpose: 'AI in algo trading — brand visibility', outcome: 'Derek Hoffman mentioned listening to episode', next_step: 'Share episode with Derek', next_step_date: '2026-09-14', stage: CONTACT, raw: 'Jamie on Alpha Signal podcast Sep 12. Topic: AI in algo trading. Derek Hoffman at Citadel mentioned catching the episode. Great brand moment.' });
addEntry({ account: 'Citadel', owner: jamie, type: 'Meeting', date: '2026-09-20', channel: 'Online', purpose: 'Exploratory call on algo trading analytics', outcome: 'Derek wants a technical demo with quant team', next_step: 'Schedule technical demo', next_step_date: '2026-10-05', stage: CONTACT, raw: 'Exploratory meeting with Derek Hoffman at Citadel over Zoom. Curious about algo trading analytics. Wants deeper technical demo with quant team. Scheduling for early October.' });
addEntry({ account: 'Citadel', owner: jamie, type: 'Call', date: '2026-10-01', channel: 'Phone', purpose: 'Confirm demo logistics', outcome: 'Demo confirmed Oct 8', next_step: 'Prep demo environment', next_step_date: '2026-10-07', stage: CONTACT, raw: 'Quick call with Derek to confirm demo date. Oct 8 with 4 members of quant team. Need to prep demo environment.' });

// ── Bridgewater Associates ────────────────────────────────────────────────────
addEntry({ account: 'Bridgewater Associates', owner: morgan, type: 'Meeting', date: '2026-09-08', channel: 'In-person', purpose: 'Macro strategy data platform intro', outcome: 'Very aligned with their data needs', next_step: 'Submit detailed proposal', next_step_date: '2026-09-22', stage: CONTACT, raw: 'Met with Priya Kapoor at Bridgewater HQ. Looking for macro strategy data platform. Well aligned. Asked for detailed proposal.' });
addEntry({ account: 'Bridgewater Associates', owner: morgan, type: 'Presentation', date: '2026-09-23', channel: 'Online', purpose: 'Full platform demo to data team', outcome: 'Strong interest from 6-person data team', next_step: 'Send proposal + pricing', next_step_date: '2026-09-30', stage: SUBMIT, deal: '$520,000', raw: 'Presented to Bridgewater data team via Zoom. 6 attendees. Very strong reaction to macro analytics module. $520k proposal sent.' });
addEntry({ account: 'Bridgewater Associates', owner: morgan, type: 'Podcast', date: '2026-09-27', channel: 'Podcast', purpose: 'Co-hosted episode with Priya Kapoor on macro data strategy', outcome: 'Excellent rapport built, episode publishing next week', next_step: 'Send Priya episode link when live', next_step_date: '2026-10-04', stage: SUBMIT, raw: 'Recorded co-hosted podcast episode with Priya Kapoor Sep 27. Topic: macro data in volatile markets. Great relationship-building mid-deal.' });
addEntry({ account: 'Bridgewater Associates', owner: morgan, type: 'Call', date: '2026-10-07', channel: 'Phone', purpose: 'Proposal follow-up', outcome: 'Internal champion confirmed, procurement starting', next_step: 'Send legal-ready contract draft', next_step_date: '2026-10-14', stage: SUBMIT, raw: 'Follow-up call with Priya. She confirmed as internal champion. Procurement formally kicking off. Send contract draft this week.' });

// ── Renaissance Technologies ──────────────────────────────────────────────────
addEntry({ account: 'Renaissance Technologies', owner: jamie, type: 'Email', date: '2026-09-28', channel: 'Email', purpose: 'Cold outreach on quant research data tools', outcome: 'No response yet', next_step: 'Follow up if no reply', next_step_date: '2026-10-05', stage: PROSPECT, raw: 'Sent initial outreach email to Renaissance Technologies about quant research data tools. Waiting for response.' });
addEntry({ account: 'Renaissance Technologies', owner: alex, type: 'Conference', date: '2026-09-19', channel: 'Conference', purpose: 'Panel: AI-driven market analytics at Global Quant Conference', outcome: 'Three RenTech attendees approached after panel', next_step: 'Send follow-up emails to RenTech contacts', next_step_date: '2026-09-21', stage: PROSPECT, raw: 'Alex spoke on panel at Global Quant Conference Sep 19. Three people from Renaissance Technologies approached afterward. Great outreach opportunity.' });

// ── Two Sigma — closed won ────────────────────────────────────────────────────
addEntry({ account: 'Two Sigma', owner: alex, type: 'Meeting', date: '2026-08-12', channel: 'Online', purpose: 'Platform intro and discovery', outcome: 'Excited, asked for proposal', next_step: 'Send proposal', next_step_date: '2026-08-19', stage: CONTACT, raw: 'Discovery call with Lisa Park at Two Sigma. Very excited about ML data pipeline features.' });
addEntry({ account: 'Two Sigma', owner: alex, type: 'Demo', date: '2026-08-20', channel: 'Online', purpose: 'Full technical demo with engineering team', outcome: 'Engineering team impressed — no blockers', next_step: 'Move to commercial discussion', next_step_date: '2026-08-22', stage: SUBMIT, raw: 'Full technical demo with Two Sigma engineering team. 5 attendees. No blockers found. Moving to commercial.' });
addEntry({ account: 'Two Sigma', owner: alex, type: 'Meeting', date: '2026-08-25', channel: 'In-person', purpose: 'Contract negotiation', outcome: 'Agreed on terms at $290k', next_step: 'Send final contract', next_step_date: '2026-08-28', stage: STAGED, deal: '$290,000', raw: 'Met Two Sigma legal and procurement in person Aug 25. Agreed contract terms at $290k annual. Sending final docs.' });
addEntry({ account: 'Two Sigma', owner: alex, type: 'Contract', date: '2026-09-02', channel: 'Email', purpose: 'Contract signed — deal closed', outcome: 'Signed and returned', next_step: 'Begin onboarding', next_step_date: '2026-09-09', stage: WON, deal: '$290,000', raw: 'Two Sigma signed and returned contract Sep 2. Deal closed at $290k. Starting onboarding next week.' });

// ── Point72 — on hold ─────────────────────────────────────────────────────────
addEntry({ account: 'Point72', owner: morgan, type: 'Meeting', date: '2026-09-01', channel: 'Online', purpose: 'Risk management platform discussion', outcome: 'Interested but budget resets Q4', next_step: 'Revisit November', next_step_date: '2026-11-01', stage: HOLD, raw: 'Met Marcus Webb at Point72. Interested but budget cycle resets Q4. Put on hold until November.' });
addEntry({ account: 'Point72', owner: morgan, type: 'Conference', date: '2026-09-24', channel: 'Conference', purpose: 'Hedge Fund Ops Summit — reconnected with Marcus Webb', outcome: 'Marcus signalled Q4 budget may open sooner', next_step: 'Re-engage with updated pricing deck', next_step_date: '2026-10-08', stage: HOLD, raw: 'Ran into Marcus Webb at Hedge Fund Ops Summit. He hinted Q4 budget freeze may lift earlier. Sending updated pricing deck.' });

// ── Millennium Management ─────────────────────────────────────────────────────
addEntry({ account: 'Millennium Management', owner: jamie, type: 'Conference', date: '2026-09-17', channel: 'Conference', purpose: 'FinTech Summit NYC — connected with Millennium team', outcome: 'Warm intro to head of data infrastructure', next_step: 'Follow up with intro email', next_step_date: '2026-09-19', stage: CONTACT, raw: 'FinTech Summit NYC Sep 17. Met two Millennium Management PMs and got warm intro to head of data infrastructure. Exchanged cards.' });
addEntry({ account: 'Millennium Management', owner: jamie, type: 'Call', date: '2026-09-26', channel: 'Phone', purpose: 'Intro call — data infrastructure modernisation', outcome: 'Warm reception, wants product overview', next_step: 'Send overview deck', next_step_date: '2026-10-03', stage: CONTACT, raw: 'Intro call with Millennium Management. Warm reception. Evaluating vendors for data infrastructure. Sending overview deck.' });

// ── D.E. Shaw ─────────────────────────────────────────────────────────────────
addEntry({ account: 'D.E. Shaw', owner: alex, type: 'Podcast', date: '2026-09-22', channel: 'Podcast', purpose: 'Quant Edge podcast — systematic trading analytics', outcome: 'Inbound from D.E. Shaw after episode', next_step: 'Schedule intro call', next_step_date: '2026-10-02', stage: PROSPECT, raw: 'Alex on Quant Edge podcast Sep 22 talking systematic trading analytics. Got inbound message from D.E. Shaw after episode aired. Scheduling intro call.' });
addEntry({ account: 'D.E. Shaw', owner: alex, type: 'Email', date: '2026-09-30', channel: 'Email', purpose: 'Initial outreach — systematic trading analytics', outcome: 'Pending reply', next_step: 'Follow up next week', next_step_date: '2026-10-07', stage: PROSPECT, raw: 'Sent initial outreach to D.E. Shaw about systematic trading analytics platform. Will follow up next week.' });

// ── AQR Capital — closed lost ─────────────────────────────────────────────────
addEntry({ account: 'AQR Capital', owner: morgan, type: 'Meeting', date: '2026-08-20', channel: 'Online', purpose: 'Product evaluation', outcome: 'Liked product, concerned about data residency', next_step: 'Send proposal', next_step_date: '2026-08-27', stage: SUBMIT, raw: 'Met with AQR Capital eval team. Liked our offering but raised concerns about EU data residency.' });
addEntry({ account: 'AQR Capital', owner: morgan, type: 'Call', date: '2026-09-05', channel: 'Phone', purpose: 'Final decision call', outcome: 'Lost — competitor met EU data residency needs', next_step: null, next_step_date: null, stage: LOST, raw: 'Final call with AQR. Went with competitor who meets EU data residency requirements. Keep warm for future.' });

// ── Man Group ─────────────────────────────────────────────────────────────────
addEntry({ account: 'Man Group', owner: jamie, type: 'Call', date: '2026-09-14', channel: 'Phone', purpose: 'Intro call — systematic trading analytics for European markets', outcome: 'Oliver very interested, wants demo', next_step: 'Schedule technical demo', next_step_date: '2026-09-25', stage: CONTACT, raw: 'Intro call with Oliver Bennett at Man Group in London. Very interested in systematic trading analytics. Wants a technical demo.' });
addEntry({ account: 'Man Group', owner: jamie, type: 'Demo', date: '2026-09-26', channel: 'Online', purpose: 'Technical demo — European market analytics module', outcome: 'Strong reaction, requesting formal proposal', next_step: 'Send proposal by Oct 3', next_step_date: '2026-10-03', stage: SUBMIT, deal: '$310,000', raw: 'Technical demo with Man Group via Zoom Sep 26. Oliver and three quant researchers attended. Loved European market analytics. Requesting formal proposal.' });
addEntry({ account: 'Man Group', owner: jamie, type: 'Email', date: '2026-10-03', channel: 'Email', purpose: 'Sent formal proposal — $310k', outcome: 'Sent, awaiting review', next_step: 'Follow up Oct 10', next_step_date: '2026-10-10', stage: SUBMIT, deal: '$310,000', raw: 'Sent Man Group the formal proposal for $310k. Covering systematic trading analytics suite with 2-year term. Waiting on their response.' });

// ── Fidelity Investments ──────────────────────────────────────────────────────
addEntry({ account: 'Fidelity Investments', owner: morgan, type: 'Email', date: '2026-09-16', channel: 'Email', purpose: 'Outreach on enterprise analytics pilot', outcome: 'Carla Simmons responded positively', next_step: 'Schedule intro call', next_step_date: '2026-09-23', stage: CONTACT, raw: 'Reached out to Carla Simmons at Fidelity about enterprise analytics pilot. She responded positively. Scheduling intro call.' });
addEntry({ account: 'Fidelity Investments', owner: morgan, type: 'Call', date: '2026-09-24', channel: 'Phone', purpose: 'Discovery call — technology strategy priorities', outcome: 'Big opportunity if pilot goes well — potential $800k expansion', next_step: 'Send pilot proposal', next_step_date: '2026-10-01', stage: CONTACT, raw: 'Discovery call with Carla at Fidelity. Long-term potential is huge — $800k expansion if pilot succeeds. Need to send pilot proposal.' });

// ── Vanguard ──────────────────────────────────────────────────────────────────
addEntry({ account: 'Vanguard', owner: alex, type: 'Email', date: '2026-10-01', channel: 'Email', purpose: 'Cold outreach — passive investing analytics', outcome: 'No response yet', next_step: 'Follow up Oct 8', next_step_date: '2026-10-08', stage: PROSPECT, raw: 'Sent cold outreach to Vanguard about passive investing analytics. Waiting for response.' });

// ── Tiger Global ──────────────────────────────────────────────────────────────
addEntry({ account: 'Tiger Global', owner: jamie, type: 'Email', date: '2026-09-29', channel: 'Email', purpose: 'Initial outreach', outcome: 'No response yet', next_step: 'Follow up if no reply', next_step_date: '2026-10-06', stage: PROSPECT, raw: 'Initial outreach to Tiger Global. Waiting on response.' });

// ── Coatue Management ─────────────────────────────────────────────────────────
addEntry({ account: 'Coatue Management', owner: alex, type: 'Call', date: '2026-10-02', channel: 'Phone', purpose: 'Intro call — ML pipeline features', outcome: 'Nathan very interested in ML pipeline', next_step: 'Send technical overview', next_step_date: '2026-10-09', stage: CONTACT, raw: 'Intro call with Nathan Lee at Coatue. Very interested in ML data pipeline features. Connected via conference referral. Sending technical overview.' });

// ── 7. Deals — stage history ──────────────────────────────────────────────────
const insertDSH = db.prepare(`
  INSERT INTO deal_stage_history (deal_id, from_stage_id, to_stage_id, changed_by_id, changed_at)
  VALUES (@deal, @from, @to, @by, @at)
`);

const DEAL_HISTORY = [
  { deal: 'AI Security Platform — Enterprise License',  from: CONTACT, to: SUBMIT,   by: alex,   at: '2026-09-16 09:00:00' },
  { deal: 'AI Security Platform — Enterprise License',  from: SUBMIT,  to: STAGED,   by: alex,   at: '2026-09-26 10:00:00' },
  { deal: 'Portfolio Risk Analytics Suite',             from: CONTACT, to: SUBMIT,   by: alex,   at: '2026-09-18 14:00:00' },
  { deal: 'Portfolio Risk Analytics Suite',             from: SUBMIT,  to: PENDING,  by: alex,   at: '2026-09-29 11:00:00' },
  { deal: 'Macro Data Platform',                        from: CONTACT, to: SUBMIT,   by: morgan, at: '2026-09-23 16:00:00' },
  { deal: 'ML Data Pipeline — Annual',                  from: CONTACT, to: SUBMIT,   by: alex,   at: '2026-08-20 15:00:00' },
  { deal: 'ML Data Pipeline — Annual',                  from: SUBMIT,  to: STAGED,   by: alex,   at: '2026-08-25 13:00:00' },
  { deal: 'ML Data Pipeline — Annual',                  from: STAGED,  to: WON,      by: alex,   at: '2026-09-02 09:00:00' },
  { deal: 'EU Data Residency Analytics Package',        from: SUBMIT,  to: LOST,     by: morgan, at: '2026-09-05 15:00:00' },
  { deal: 'Systematic Trading Analytics Suite',         from: CONTACT, to: SUBMIT,   by: jamie,  at: '2026-09-27 10:00:00' },
];

for (const h of DEAL_HISTORY) {
  const did = dealId(h.deal);
  if (did) insertDSH.run({ deal: did, from: h.from, to: h.to, by: h.by, at: h.at });
}

// ── 8. Account stage history ──────────────────────────────────────────────────
const insertSH = db.prepare(`
  INSERT INTO stage_history (account_id, from_stage_id, to_stage_id, changed_by_id, changed_at)
  VALUES (@account_id, @from, @to, @by, @at)
`);

const STAGE_HISTORY = [
  { account: 'Nomura Securities',      from: CONTACT, to: SUBMIT,  by: alex,   at: '2026-09-16 09:00:00' },
  { account: 'Nomura Securities',      from: SUBMIT,  to: STAGED,  by: alex,   at: '2026-09-26 10:00:00' },
  { account: 'BlackRock',              from: CONTACT, to: SUBMIT,  by: alex,   at: '2026-09-18 14:00:00' },
  { account: 'BlackRock',              from: SUBMIT,  to: PENDING, by: alex,   at: '2026-09-29 11:00:00' },
  { account: 'Bridgewater Associates', from: CONTACT, to: SUBMIT,  by: morgan, at: '2026-09-23 16:00:00' },
  { account: 'Two Sigma',              from: CONTACT, to: SUBMIT,  by: alex,   at: '2026-08-20 15:00:00' },
  { account: 'Two Sigma',              from: SUBMIT,  to: STAGED,  by: alex,   at: '2026-08-25 13:00:00' },
  { account: 'Two Sigma',              from: STAGED,  to: WON,     by: alex,   at: '2026-09-02 09:00:00' },
  { account: 'AQR Capital',            from: SUBMIT,  to: LOST,    by: morgan, at: '2026-09-05 15:00:00' },
  { account: 'Point72',                from: CONTACT, to: HOLD,    by: morgan, at: '2026-09-01 11:00:00' },
  { account: 'Man Group',              from: CONTACT, to: SUBMIT,  by: jamie,  at: '2026-09-27 10:00:00' },
];

for (const h of STAGE_HISTORY) {
  insertSH.run({ account_id: acctId(h.account), from: h.from, to: h.to, by: h.by, at: h.at });
}

// ── 9. Tasks ──────────────────────────────────────────────────────────────────
const insertTask = db.prepare(`
  INSERT INTO tasks (title, due_date, priority, status, account_id, deal_id, assignee_id, created_by)
  VALUES (@title, @due, @priority, @status, @account_id, @deal_id, @assignee, @created_by)
`);

const TASKS = [
  { title: 'Send signed contract follow-up to Kenji',          due: '2026-10-12', priority: 'high',   status: 'open',        account: 'Nomura Securities',        deal: 'AI Security Platform — Enterprise License',  assignee: alex,   by: alex   },
  { title: 'Send SLA addendum to BlackRock procurement',       due: '2026-10-11', priority: 'high',   status: 'open',        account: 'BlackRock',                deal: 'Portfolio Risk Analytics Suite',             assignee: alex,   by: alex   },
  { title: 'Prep Citadel quant demo environment',              due: '2026-10-07', priority: 'high',   status: 'in_progress', account: 'Citadel',                  deal: 'Algo Trading Analytics — Pilot',             assignee: jamie,  by: jamie  },
  { title: 'Send contract draft to Bridgewater',               due: '2026-10-14', priority: 'high',   status: 'open',        account: 'Bridgewater Associates',   deal: 'Macro Data Platform',                        assignee: morgan, by: morgan },
  { title: 'Follow up Man Group proposal Oct 10',              due: '2026-10-10', priority: 'medium', status: 'open',        account: 'Man Group',                deal: 'Systematic Trading Analytics Suite',          assignee: jamie,  by: jamie  },
  { title: 'Re-engage Point72 with updated pricing deck',      due: '2026-10-08', priority: 'medium', status: 'open',        account: 'Point72',                  deal: 'Risk Analytics Platform',                    assignee: morgan, by: morgan },
  { title: 'Send Fidelity pilot proposal',                     due: '2026-10-01', priority: 'medium', status: 'done',        account: 'Fidelity Investments',     deal: 'Enterprise Analytics Pilot',                 assignee: morgan, by: morgan },
  { title: 'Follow up D.E. Shaw intro request',                due: '2026-10-07', priority: 'medium', status: 'open',        account: 'D.E. Shaw',                deal: null,                                          assignee: alex,   by: alex   },
  { title: 'Send Millennium Management product overview deck', due: '2026-10-03', priority: 'low',    status: 'done',        account: 'Millennium Management',    deal: 'Data Infrastructure Modernisation',           assignee: jamie,  by: jamie  },
  { title: 'Follow up Vanguard outreach Oct 8',                due: '2026-10-08', priority: 'low',    status: 'open',        account: 'Vanguard',                 deal: null,                                          assignee: alex,   by: alex   },
  { title: 'Renew Two Sigma onboarding check-in',              due: '2026-10-15', priority: 'medium', status: 'open',        account: 'Two Sigma',                deal: null,                                          assignee: alex,   by: alex   },
  { title: 'Send RenTech conference follow-up emails',         due: '2026-09-21', priority: 'medium', status: 'done',        account: 'Renaissance Technologies', deal: null,                                          assignee: alex,   by: alex   },
];

for (const t of TASKS) {
  insertTask.run({
    title:      t.title,
    due:        t.due,
    priority:   t.priority,
    status:     t.status,
    account_id: acctId(t.account),
    deal_id:    t.deal ? dealId(t.deal) : null,
    assignee:   t.assignee,
    created_by: t.by,
  });
}

// ── Done ──────────────────────────────────────────────────────────────────────
const counts = {
  users:    db.prepare('SELECT COUNT(*) as c FROM users').get().c,
  accounts: db.prepare('SELECT COUNT(*) as c FROM accounts WHERE deleted_at IS NULL').get().c,
  contacts: db.prepare('SELECT COUNT(*) as c FROM contacts WHERE deleted_at IS NULL').get().c,
  deals:    db.prepare('SELECT COUNT(*) as c FROM deals WHERE deleted_at IS NULL').get().c,
  entries:  db.prepare('SELECT COUNT(*) as c FROM entries WHERE deleted_at IS NULL').get().c,
  tasks:    db.prepare('SELECT COUNT(*) as c FROM tasks WHERE deleted_at IS NULL').get().c,
};
console.log('Demo data seeded successfully:');
console.log(`  ${counts.users} users  |  ${counts.accounts} accounts  |  ${counts.contacts} contacts`);
console.log(`  ${counts.deals} deals  |  ${counts.entries} activities  |  ${counts.tasks} tasks`);
