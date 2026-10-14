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

  // ── Pipelines ─────────────────────────────────────────────────────────────
  // Ensure a default "Sales" pipeline exists
  const existingDefault = db.prepare(`SELECT id FROM pipelines WHERE is_default = 1 AND deleted_at IS NULL`).get();
  let defaultPipelineId;
  if (!existingDefault) {
    const info = db.prepare(`INSERT INTO pipelines (name, description, is_default) VALUES (?, ?, 1)`)
      .run('Sales', 'Core sales pipeline from prospecting to close');
    defaultPipelineId = info.lastInsertRowid;
  } else {
    defaultPipelineId = existingDefault.id;
  }

  // Add pipeline_id column to stages if not present, then assign existing stages to default pipeline
  const stageCols = db.prepare(`PRAGMA table_info(stages)`).all().map(c => c.name);
  if (!stageCols.includes('pipeline_id')) {
    db.prepare(`ALTER TABLE stages ADD COLUMN pipeline_id INTEGER REFERENCES pipelines(id)`).run();
  }
  // Assign any stages without a pipeline to the default
  db.prepare(`UPDATE stages SET pipeline_id = ? WHERE pipeline_id IS NULL AND deleted_at IS NULL`)
    .run(defaultPipelineId);

  // Example extra pipelines (only if pipelines table is nearly empty)
  const pipelineCount = db.prepare(`SELECT COUNT(*) AS c FROM pipelines WHERE deleted_at IS NULL`).get();
  if (pipelineCount.c < 2) {
    const insertPipeline = db.prepare(`INSERT INTO pipelines (name, description) VALUES (?, ?)`);
    const insertStage    = db.prepare(`
      INSERT OR IGNORE INTO stages (name, order_index, color_hex, text_color_hex, pipeline_id)
      VALUES (@name, @order_index, @color_hex, @text_color_hex, @pipeline_id)
    `);

    const onboarding = insertPipeline.run('Onboarding', 'Track new customers through onboarding milestones');
    const onboardingId = onboarding.lastInsertRowid;
    [
      { name: 'Kickoff',        order_index: 1, color_hex: '#BAD4F5', text_color_hex: '#1e3a5f' },
      { name: 'Implementation', order_index: 2, color_hex: '#B5D9CC', text_color_hex: '#1a3a2e' },
      { name: 'Training',       order_index: 3, color_hex: '#D4C5F9', text_color_hex: '#3b1f6b' },
      { name: 'Go Live',        order_index: 4, color_hex: '#A8D5A2', text_color_hex: '#1a4d1a' },
    ].forEach(s => insertStage.run({ ...s, pipeline_id: onboardingId }));

    const cs = insertPipeline.run('Customer Success', 'Monitor health and expansion of existing customers');
    const csId = cs.lastInsertRowid;
    [
      { name: 'Healthy',   order_index: 1, color_hex: '#8FCB9B', text_color_hex: '#1a4d1a' },
      { name: 'Expanding', order_index: 2, color_hex: '#9FC9C2', text_color_hex: '#1a3a35' },
      { name: 'At Risk',   order_index: 3, color_hex: '#F2D58A', text_color_hex: '#5a3e00' },
      { name: 'Churning',  order_index: 4, color_hex: '#E3A0A0', text_color_hex: '#5a1a1a' },
    ].forEach(s => insertStage.run({ ...s, pipeline_id: csId }));
  }

  // ── Migrations ──────────────────────────────────────────────────────────────
  // Add email + role columns to users if they don't exist yet
  const userCols = db.prepare(`PRAGMA table_info(users)`).all().map(c => c.name);
  if (!userCols.includes('email')) {
    db.prepare(`ALTER TABLE users ADD COLUMN email TEXT`).run();
  }
  if (!userCols.includes('role')) {
    db.prepare(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'rep'`).run();
    // Make the first user an admin automatically (bootstrapping)
    const first = db.prepare(`SELECT id FROM users ORDER BY id ASC LIMIT 1`).get();
    if (first) {
      db.prepare(`UPDATE users SET role = 'admin' WHERE id = ?`).run(first.id);
    }
  }

  // ── Contacts migrations ────────────────────────────────────────────────────
  const contactCols = db.prepare(`PRAGMA table_info(contacts)`).all().map(c => c.name);
  for (const [col, def] of [
    ['title',        'TEXT'],
    ['linkedin_url', 'TEXT'],
    ['notes',        'TEXT'],
  ]) {
    if (!contactCols.includes(col)) {
      db.prepare(`ALTER TABLE contacts ADD COLUMN ${col} ${def}`).run();
    }
  }

  // Add owner_id column to accounts if it doesn't exist yet
  const acctCols = db.prepare(`PRAGMA table_info(accounts)`).all().map(c => c.name);
  if (!acctCols.includes('owner_id')) {
    db.prepare(`ALTER TABLE accounts ADD COLUMN owner_id INTEGER REFERENCES users(id)`).run();
  }
  if (!acctCols.includes('tags')) {
    db.prepare(`ALTER TABLE accounts ADD COLUMN tags TEXT DEFAULT '[]'`).run();
  }

  // ── Default email templates ────────────────────────────────────────────────
  const defaultTemplates = [
    {
      name: 'Cold Outreach',
      category: 'prospecting',
      subject: 'Introduction from {{sender_name}} — {{account_name}}',
      body: `Hi {{contact_name}},

I hope this finds you well. My name is {{sender_name}} and I wanted to reach out about a potential opportunity with {{account_name}}.

I'd love to learn more about your current priorities and explore whether there's a fit. Would you be open to a quick 20-minute call this week?

Looking forward to hearing from you.

Best,
{{sender_name}}`,
    },
    {
      name: 'Follow-Up After Meeting',
      category: 'follow_up',
      subject: 'Great connecting — next steps for {{account_name}}',
      body: `Hi {{contact_name}},

Thank you for taking the time to meet with me. It was great learning more about {{account_name}} and your goals.

As discussed, here are the next steps we agreed on:
- [Next step 1]
- [Next step 2]

Please let me know if you have any questions in the meantime. I'll follow up on {{close_date}}.

Best,
{{sender_name}}`,
    },
    {
      name: 'Demo Request',
      category: 'prospecting',
      subject: 'Scheduling a demo for {{account_name}}',
      body: `Hi {{contact_name}},

Following our conversation, I'd like to set up a personalized demo to show you exactly how we can help {{account_name}}.

The demo typically takes 30 minutes and I'll tailor it to your specific use case. Here are a few times that work for me:
- [Time option 1]
- [Time option 2]
- [Time option 3]

Alternatively, feel free to book directly using my calendar link: [link]

Best,
{{sender_name}}`,
    },
    {
      name: 'Proposal Follow-Up',
      category: 'proposal',
      subject: 'Following up on the proposal — {{deal_name}}',
      body: `Hi {{contact_name}},

I wanted to follow up on the proposal I sent over for {{deal_name}}. I hope you've had a chance to review it.

Do you have any questions or feedback? I'm happy to jump on a call to walk through any details or adjust the proposal to better fit your needs.

We're currently targeting a close by {{close_date}} — please let me know if that timeline still works for you.

Best,
{{sender_name}}`,
    },
  ];

  const insertTemplate = db.prepare(`
    INSERT OR IGNORE INTO email_templates (name, category, subject, body)
    SELECT @name, @category, @subject, @body
    WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = @name AND deleted_at IS NULL)
  `);

  for (const t of defaultTemplates) insertTemplate.run(t);

  // Add deal_id column to entries if it doesn't exist yet
  const entryCols = db.prepare(`PRAGMA table_info(entries)`).all().map(c => c.name);
  if (!entryCols.includes('deal_id')) {
    db.prepare(`ALTER TABLE entries ADD COLUMN deal_id INTEGER REFERENCES deals(id)`).run();
  }

  // ── Lifecycle stage fields on accounts ──────────────────────────────────────
  const acctCols2 = db.prepare(`PRAGMA table_info(accounts)`).all().map(c => c.name);
  if (!acctCols2.includes('lifecycle_stage')) {
    db.prepare(`ALTER TABLE accounts ADD COLUMN lifecycle_stage TEXT`).run();
  }
  if (!acctCols2.includes('lead_source')) {
    db.prepare(`ALTER TABLE accounts ADD COLUMN lead_source TEXT`).run();
  }
  if (!acctCols2.includes('lead_score')) {
    db.prepare(`ALTER TABLE accounts ADD COLUMN lead_score INTEGER DEFAULT 0`).run();
  }

  // ── Enrichment + hierarchy fields on accounts ────────────────────────────────
  const acctCols3 = db.prepare(`PRAGMA table_info(accounts)`).all().map(c => c.name);
  const enrichMigrations = [
    ['parent_id',      `INTEGER REFERENCES accounts(id)`],
    ['website',        `TEXT`],
    ['industry',       `TEXT`],
    ['employee_count', `INTEGER`],
    ['annual_revenue', `REAL`],
    ['description',    `TEXT`],
    ['city',           `TEXT`],
    ['country',        `TEXT`],
    ['linkedin_url',   `TEXT`],
  ];
  for (const [col, def] of enrichMigrations) {
    if (!acctCols3.includes(col)) {
      db.prepare(`ALTER TABLE accounts ADD COLUMN ${col} ${def}`).run();
    }
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

  // ── Example Workflows ────────────────────────────────────────────────────────
  const wfCount = db.prepare(`SELECT COUNT(*) AS c FROM workflows`).get();
  if (wfCount.c === 0) {
    const insertWf = db.prepare(`
      INSERT INTO workflows (name, enabled, trigger_type, trigger_config, action_type, action_config)
      VALUES (@name, @enabled, @trigger_type, @trigger_config, @action_type, @action_config)
    `);

    insertWf.run({
      name:           'New deal → research task',
      enabled:        1,
      trigger_type:   'deal_created',
      trigger_config: '{}',
      action_type:    'create_task',
      action_config:  JSON.stringify({
        title:            'Research {{account_name}} before first meeting',
        priority:         'medium',
        due_offset_days:  2,
      }),
    });

    insertWf.run({
      name:           'Re-engage stale accounts (14 days)',
      enabled:        1,
      trigger_type:   'inactivity_days',
      trigger_config: JSON.stringify({ days: 14 }),
      action_type:    'create_task',
      action_config:  JSON.stringify({
        title:            'Re-engage {{account_name}} — no activity in 14 days',
        priority:         'low',
        due_offset_days:  1,
      }),
    });

    insertWf.run({
      name:           'SQL lead → schedule discovery call',
      enabled:        1,
      trigger_type:   'lifecycle_changed',
      trigger_config: JSON.stringify({ lifecycle_stage: 'sql' }),
      action_type:    'create_task',
      action_config:  JSON.stringify({
        title:            'Schedule discovery call with {{account_name}}',
        priority:         'high',
        due_offset_days:  2,
      }),
    });

    insertWf.run({
      name:           'Deal won → advance account to Customer',
      enabled:        1,
      trigger_type:   'lifecycle_changed',
      trigger_config: JSON.stringify({ lifecycle_stage: 'opportunity' }),
      action_type:    'advance_lifecycle',
      action_config:  '{}',
    });

    // Disabled by default — fires on every account stage change which may be noisy
    insertWf.run({
      name:           'Account stage move → follow-up task (example — disabled)',
      enabled:        0,
      trigger_type:   'stage_changed',
      trigger_config: JSON.stringify({ entity: 'account' }),
      action_type:    'create_task',
      action_config:  JSON.stringify({
        title:            'Follow up with {{account_name}} after stage change',
        priority:         'medium',
        due_offset_days:  1,
      }),
    });
  }

  // ── Example Tasks ─────────────────────────────────────────────────────────────
  const taskCount = db.prepare(`SELECT COUNT(*) AS c FROM tasks`).get();
  if (taskCount.c === 0) {
    const d = (offsetDays) => {
      const dt = new Date();
      dt.setDate(dt.getDate() + offsetDays);
      return dt.toISOString().split('T')[0];
    };

    const firstUser = db.prepare(`SELECT id FROM users ORDER BY id ASC LIMIT 1`).get();
    const uid = firstUser?.id ?? null;

    const insertTask = db.prepare(`
      INSERT INTO tasks (title, description, due_date, priority, status, assignee_id, completed_at)
      VALUES (@title, @description, @due_date, @priority, @status, @assignee_id, @completed_at)
    `);

    insertTask.run({
      title:        'Prepare Q4 pipeline review deck',
      description:  'Summarize open deals, closed won totals, and weighted forecast for leadership review.',
      due_date:     d(7),
      priority:     'high',
      status:       'open',
      assignee_id:  uid,
      completed_at: null,
    });

    insertTask.run({
      title:        'Update deal close dates for all Staged accounts',
      description:  'Review every deal in Staged/Pending and confirm close dates are accurate.',
      due_date:     d(2),
      priority:     'medium',
      status:       'open',
      assignee_id:  uid,
      completed_at: null,
    });

    insertTask.run({
      title:        'Follow up on unanswered proposal emails',
      description:  null,
      due_date:     d(0),        // due today
      priority:     'high',
      status:       'open',
      assignee_id:  uid,
      completed_at: null,
    });

    insertTask.run({
      title:        'Research competitor pricing updates',
      description:  null,
      due_date:     d(-2),       // overdue
      priority:     'medium',
      status:       'open',
      assignee_id:  uid,
      completed_at: null,
    });

    insertTask.run({
      title:        'Send weekly activity summary to manager',
      description:  null,
      due_date:     d(-7),
      priority:     'low',
      status:       'done',
      assignee_id:  uid,
      completed_at: new Date().toISOString(),
    });

    insertTask.run({
      title:        'Set up CRM demo for new prospect',
      description:  'Walk through pipeline features, deal tracking, and reporting.',
      due_date:     d(3),
      priority:     'high',
      status:       'in_progress',
      assignee_id:  uid,
      completed_at: null,
    });
  }

  // ── Example Quotas (current quarter) ─────────────────────────────────────────
  const quotaCount = db.prepare(`SELECT COUNT(*) AS c FROM quotas`).get();
  if (quotaCount.c === 0) {
    const users = db.prepare(`SELECT id FROM users ORDER BY id ASC LIMIT 3`).all();
    if (users.length > 0) {
      const now  = new Date();
      const q    = Math.floor(now.getMonth() / 3);
      const yr   = now.getFullYear();
      const qs   = new Date(yr, q * 3,     1).toISOString().split('T')[0];
      const qe   = new Date(yr, q * 3 + 3, 0).toISOString().split('T')[0];
      const qlbl = `Q${q + 1} ${yr}`;

      const insertQuota = db.prepare(`
        INSERT INTO quotas (user_id, period_type, period_start, period_end, metric_type, target, currency, label)
        VALUES (@user_id, @period_type, @period_start, @period_end, @metric_type, @target, @currency, @label)
      `);

      const dealTargets     = [200000, 120000, 80000];
      const activityTargets = [60,     40,     30];

      for (let i = 0; i < users.length; i++) {
        // Revenue quota
        insertQuota.run({
          user_id:      users[i].id,
          period_type:  'quarterly',
          period_start: qs,
          period_end:   qe,
          metric_type:  'deal_value',
          target:       dealTargets[i] ?? 80000,
          currency:     'USD',
          label:        qlbl,
        });
        // Activity quota
        insertQuota.run({
          user_id:      users[i].id,
          period_type:  'quarterly',
          period_start: qs,
          period_end:   qe,
          metric_type:  'activity_count',
          target:       activityTargets[i] ?? 30,
          currency:     'USD',
          label:        qlbl,
        });
      }
    }
  }

  // ── Example Saved Reports ─────────────────────────────────────────────────────
  const rpCount = db.prepare(`SELECT COUNT(*) AS c FROM saved_reports`).get();
  if (rpCount.c === 0) {
    const sixMonthsAgo = (() => {
      const d = new Date(); d.setMonth(d.getMonth() - 6); return d.toISOString().split('T')[0];
    })();
    const today = new Date().toISOString().split('T')[0];

    const exampleReports = [
      {
        name:   'Activities by Month (Last 6 Months)',
        config: JSON.stringify({ metric: 'activity_count', group_by: 'month', date_from: sixMonthsAgo, date_to: today }),
      },
      {
        name:   'Deal Pipeline Value by Stage',
        config: JSON.stringify({ metric: 'deal_value', group_by: 'stage' }),
      },
      {
        name:   'Activities by Owner (All Time)',
        config: JSON.stringify({ metric: 'activity_count', group_by: 'owner' }),
      },
      {
        name:   'Deals Closed — by Owner',
        config: JSON.stringify({ metric: 'deal_count', group_by: 'owner' }),
      },
      {
        name:   'Tasks by Priority',
        config: JSON.stringify({ metric: 'task_count', group_by: 'task_priority' }),
      },
      {
        name:   'Weighted Pipeline by Forecast Category',
        config: JSON.stringify({ metric: 'deal_weighted', group_by: 'forecast_category' }),
      },
    ];

    const insertReport = db.prepare(`INSERT INTO saved_reports (name, config) VALUES (@name, @config)`);
    for (const r of exampleReports) insertReport.run(r);
  }

  console.log('[seed] Database seeded successfully.');
}

// Only run seed once per process startup (idempotent via INSERT OR IGNORE)
seed();

module.exports = { seed };
