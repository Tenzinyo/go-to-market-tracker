/**
 * routes/chat.js  — Phase 3
 * POST /api/chat/query — plain-language Q&A + actions over stored entries.
 * Streams the response back as SSE so the UI can render word-by-word.
 * Uses Ollama tool calling so the assistant can actually modify data.
 */

const router = require('express').Router();
const db     = require('../db/db');

const OLLAMA_URL   = process.env.OLLAMA_URL   || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

const TODAY = () => new Date().toISOString().split('T')[0];

// ── Build DB context ───────────────────────────────────────────────────────────

function buildContext() {
  const accounts = db.prepare(`
    SELECT a.id, a.name, s.name as stage_name, a.updated_at,
           u.display_name as owner_name,
           (SELECT COUNT(*) FROM entries e WHERE e.account_id = a.id AND e.deleted_at IS NULL) as entry_count
    FROM accounts a
    LEFT JOIN stages s ON a.current_stage_id = s.id
    LEFT JOIN users  u ON a.owner_id = u.id
    WHERE a.deleted_at IS NULL
    ORDER BY a.updated_at DESC
  `).all();

  const entries = db.prepare(`
    SELECT e.meeting_date, e.activity_type, e.channel, e.purpose,
           e.outcome, e.next_step, e.next_step_date, e.deal_amount,
           e.created_at, a.name as account_name, u.display_name as owner_name,
           s.name as stage_name
    FROM entries e
    LEFT JOIN accounts a ON e.account_id = a.id
    LEFT JOIN users    u ON e.owner_id   = u.id
    LEFT JOIN stages   s ON e.stage_id   = s.id
    WHERE e.deleted_at IS NULL
    ORDER BY COALESCE(e.meeting_date, date(e.created_at)) DESC
    LIMIT 80
  `).all();

  const overdueNextSteps = db.prepare(`
    SELECT e.next_step, e.next_step_date, a.name as account_name, u.display_name as owner_name
    FROM entries e
    LEFT JOIN accounts a ON e.account_id = a.id
    LEFT JOIN users    u ON e.owner_id   = u.id
    WHERE e.deleted_at IS NULL
      AND e.next_step IS NOT NULL
      AND e.next_step_date < date('now')
    ORDER BY e.next_step_date ASC
    LIMIT 20
  `).all();

  const users  = db.prepare(`SELECT id, display_name FROM users ORDER BY display_name`).all();
  const stages = db.prepare(`SELECT id, name FROM stages WHERE deleted_at IS NULL ORDER BY order_index`).all();

  const lines = [];

  lines.push(`TODAY: ${TODAY()}`);
  lines.push('');
  lines.push(`=== TEAM MEMBERS (valid owner names) ===`);
  lines.push(users.map(u => u.display_name).join(', ') || '  (none)');

  lines.push('');
  lines.push(`=== PIPELINE STAGES (valid stage names) ===`);
  lines.push(stages.map(s => s.name).join(', ') || '  (none)');

  lines.push('');
  lines.push('=== PIPELINE (all accounts) ===');
  for (const a of accounts) {
    const updated = a.updated_at ? a.updated_at.slice(0, 10) : '?';
    const owner   = a.owner_name ? ` | Owner: ${a.owner_name}` : ' | Owner: unassigned';
    lines.push(`  ${a.name} | Stage: ${a.stage_name ?? 'None'}${owner} | Activities: ${a.entry_count} | Last updated: ${updated}`);
  }

  if (overdueNextSteps.length > 0) {
    lines.push('');
    lines.push('=== OVERDUE NEXT STEPS ===');
    for (const o of overdueNextSteps) {
      lines.push(`  [OVERDUE ${o.next_step_date}] ${o.account_name} — ${o.next_step} (owner: ${o.owner_name ?? 'unassigned'})`);
    }
  }

  lines.push('');
  lines.push('=== ACTIVITY LOG (most recent first) ===');
  for (const e of entries) {
    const date    = e.meeting_date ?? e.created_at?.slice(0, 10) ?? '?';
    const account = e.account_name ?? 'Unknown';
    const type    = e.activity_type ?? 'Activity';
    const channel = e.channel ? ` via ${e.channel}` : '';
    const purpose = e.purpose ? ` | Topic: ${e.purpose}` : '';
    const outcome = e.outcome ? ` | Outcome: ${e.outcome}` : '';
    const next    = e.next_step
      ? ` | Next: ${e.next_step}${e.next_step_date ? ` by ${e.next_step_date}` : ''}`
      : '';
    const deal    = e.deal_amount ? ` | Deal: ${e.deal_amount}` : '';
    const owner   = e.owner_name ? ` [${e.owner_name}]` : '';
    lines.push(`  ${date} | ${account} | ${type}${channel}${purpose}${outcome}${next}${deal}${owner}`);
  }

  return lines.join('\n');
}

// ── Tool definitions ───────────────────────────────────────────────────────────

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'assign_account_owner',
      description: 'Assign a team member as the owner of an account.',
      parameters: {
        type: 'object',
        properties: {
          account_name: { type: 'string', description: 'Exact or partial account name as shown in the pipeline' },
          owner_name:   { type: 'string', description: 'Full display name of the team member to assign' },
        },
        required: ['account_name', 'owner_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'move_account_stage',
      description: 'Move an account to a different pipeline stage.',
      parameters: {
        type: 'object',
        properties: {
          account_name: { type: 'string', description: 'Exact or partial account name' },
          stage_name:   { type: 'string', description: 'Target stage name (e.g. Prospecting, Contacted, Closed Won)' },
        },
        required: ['account_name', 'stage_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_next_step',
      description: 'Update the next step / follow-up action on the most recent entry for an account.',
      parameters: {
        type: 'object',
        properties: {
          account_name: { type: 'string', description: 'Exact or partial account name' },
          next_step:    { type: 'string', description: 'Description of the next action' },
          due_date:     { type: 'string', description: 'Due date in YYYY-MM-DD format (optional)' },
        },
        required: ['account_name', 'next_step'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_activity',
      description: 'Request deletion of an activity/entry from the activity log. Ownership is enforced — only the owner may delete. If the activity is unassigned it will first be assigned to the current user. Always requires explicit user confirmation before the deletion is carried out.',
      parameters: {
        type: 'object',
        properties: {
          account_name:  { type: 'string', description: 'Exact or partial account name the activity belongs to' },
          activity_date: { type: 'string', description: 'Date of the activity in YYYY-MM-DD format to identify it (optional — uses the most recent entry if omitted)' },
        },
        required: ['account_name'],
      },
    },
  },
];

// ── Tool execution ─────────────────────────────────────────────────────────────

function findAccount(name) {
  // exact match first (case-insensitive)
  let row = db.prepare(`SELECT id, name FROM accounts WHERE lower(name) = lower(?) AND deleted_at IS NULL`).get(name);
  if (row) return row;
  // partial match
  row = db.prepare(`SELECT id, name FROM accounts WHERE lower(name) LIKE lower(?) AND deleted_at IS NULL LIMIT 1`).get(`%${name}%`);
  return row ?? null;
}

function executeTool(name, args, currentUserId) {
  if (name === 'assign_account_owner') {
    const account = findAccount(args.account_name);
    if (!account) return { ok: false, error: `Account "${args.account_name}" not found` };

    const user = db.prepare(`SELECT id, display_name FROM users WHERE lower(display_name) = lower(?) LIMIT 1`).get(args.owner_name)
              ?? db.prepare(`SELECT id, display_name FROM users WHERE lower(display_name) LIKE lower(?) LIMIT 1`).get(`%${args.owner_name}%`);
    if (!user) return { ok: false, error: `Team member "${args.owner_name}" not found` };

    db.prepare(`UPDATE accounts SET owner_id = ?, updated_at = datetime('now') WHERE id = ?`).run(user.id, account.id);
    return { ok: true, message: `${account.name} is now assigned to ${user.display_name}` };
  }

  if (name === 'move_account_stage') {
    const account = findAccount(args.account_name);
    if (!account) return { ok: false, error: `Account "${args.account_name}" not found` };

    const stage = db.prepare(`SELECT id, name FROM stages WHERE lower(name) = lower(?) AND deleted_at IS NULL LIMIT 1`).get(args.stage_name)
               ?? db.prepare(`SELECT id, name FROM stages WHERE lower(name) LIKE lower(?) AND deleted_at IS NULL LIMIT 1`).get(`%${args.stage_name}%`);
    if (!stage) return { ok: false, error: `Stage "${args.stage_name}" not found` };

    const prev = db.prepare(`SELECT current_stage_id FROM accounts WHERE id = ?`).get(account.id);
    db.prepare(`INSERT INTO stage_history (account_id, from_stage_id, to_stage_id) VALUES (?, ?, ?)`).run(account.id, prev?.current_stage_id ?? null, stage.id);
    db.prepare(`UPDATE accounts SET current_stage_id = ?, updated_at = datetime('now') WHERE id = ?`).run(stage.id, account.id);
    return { ok: true, message: `${account.name} moved to ${stage.name}` };
  }

  if (name === 'update_next_step') {
    const account = findAccount(args.account_name);
    if (!account) return { ok: false, error: `Account "${args.account_name}" not found` };

    const entry = db.prepare(`
      SELECT id FROM entries WHERE account_id = ? AND deleted_at IS NULL
      ORDER BY COALESCE(meeting_date, date(created_at)) DESC, created_at DESC LIMIT 1
    `).get(account.id);
    if (!entry) return { ok: false, error: `No entries found for "${args.account_name}"` };

    db.prepare(`UPDATE entries SET next_step = ?, next_step_date = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(args.next_step, args.due_date ?? null, entry.id);
    return { ok: true, message: `Next step for ${account.name} updated: "${args.next_step}"${args.due_date ? ` due ${args.due_date}` : ''}` };
  }

  if (name === 'delete_activity') {
    const account = findAccount(args.account_name);
    if (!account) return { ok: false, error: `Account "${args.account_name}" not found` };

    let entry;
    if (args.activity_date) {
      entry = db.prepare(`
        SELECT e.id, e.owner_id, e.activity_type, e.meeting_date, u.display_name as owner_name
        FROM entries e LEFT JOIN users u ON e.owner_id = u.id
        WHERE e.account_id = ? AND e.deleted_at IS NULL AND date(COALESCE(e.meeting_date, e.created_at)) = ?
        ORDER BY e.created_at DESC LIMIT 1
      `).get(account.id, args.activity_date);
    } else {
      entry = db.prepare(`
        SELECT e.id, e.owner_id, e.activity_type, e.meeting_date, u.display_name as owner_name
        FROM entries e LEFT JOIN users u ON e.owner_id = u.id
        WHERE e.account_id = ? AND e.deleted_at IS NULL
        ORDER BY COALESCE(e.meeting_date, date(e.created_at)) DESC, e.created_at DESC LIMIT 1
      `).get(account.id);
    }

    if (!entry) {
      return { ok: false, error: `No activity found for "${account.name}"${args.activity_date ? ` on ${args.activity_date}` : ''}` };
    }

    const summary = `${entry.activity_type ?? 'Activity'} on ${entry.meeting_date ?? 'unknown date'} for ${account.name}`;

    // Ownership check — someone else owns it
    if (entry.owner_id !== null && entry.owner_id !== currentUserId) {
      return { ok: false, error: `Only ${entry.owner_name ?? 'the assigned owner'} can delete this activity. You do not own it.` };
    }

    // Auto-assign if unassigned
    let autoAssigned = false;
    if (entry.owner_id === null) {
      if (!currentUserId) {
        return { ok: false, error: 'No current user — cannot assign ownership before deletion.' };
      }
      db.prepare(`UPDATE entries SET owner_id = ?, updated_at = datetime('now') WHERE id = ?`).run(currentUserId, entry.id);
      autoAssigned = true;
    }

    return { ok: true, needsConfirmation: true, entryId: entry.id, summary, autoAssigned };
  }

  return { ok: false, error: `Unknown tool: ${name}` };
}

// ── Streaming helper ───────────────────────────────────────────────────────────

async function streamOllama(messages, res) {
  const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_MODEL, stream: true, messages }),
  });

  if (!ollamaRes.ok) {
    const err = await ollamaRes.text();
    res.write(`data: ${JSON.stringify({ error: `Ollama error: ${err}` })}\n\n`);
    return;
  }

  const reader  = ollamaRes.body.getReader();
  const decoder = new TextDecoder();
  let   buffer  = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const chunk = JSON.parse(line);
        const text  = chunk.message?.content;
        if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
      } catch {}
    }
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

router.post('/confirm-action', (req, res) => {
  const { entryId, confirmed } = req.body;
  const currentUserId = req.currentUser?.id ?? null;

  if (!entryId) return res.status(400).json({ error: 'entryId required' });

  if (!confirmed) {
    return res.json({ ok: true, message: 'Deletion cancelled. The activity has not been removed.' });
  }

  const entry = db.prepare(`
    SELECT e.id, e.owner_id, e.activity_type, e.meeting_date, a.name as account_name
    FROM entries e LEFT JOIN accounts a ON e.account_id = a.id
    WHERE e.id = ? AND e.deleted_at IS NULL
  `).get(entryId);

  if (!entry) return res.status(404).json({ error: 'Activity not found or already deleted.' });
  if (entry.owner_id !== currentUserId) {
    return res.status(403).json({ error: 'Only the owner of this activity can delete it.' });
  }

  db.prepare(`UPDATE entries SET deleted_at = datetime('now') WHERE id = ?`).run(entryId);

  return res.json({
    ok: true,
    message: `Done — the "${entry.activity_type ?? 'activity'}" on ${entry.meeting_date ?? 'unknown date'} for ${entry.account_name ?? 'unknown account'} has been permanently deleted.`,
  });
});

router.post('/query', async (req, res) => {
  const { question } = req.body;
  const currentUserId = req.currentUser?.id ?? null;
  if (!question?.trim()) {
    return res.status(400).json({ error: 'question is required' });
  }

  // AI chat requires Ollama running locally — not available in cloud deployments
  if (process.env.NODE_ENV === 'production' && OLLAMA_URL.includes('localhost')) {
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ text: 'The AI Assistant requires Ollama running locally and is not available in the cloud deployment. All other features (pipeline, logging, analytics) work normally.' })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
    return;
  }

  const context = buildContext();

  const systemPrompt = `You are a GTM (Go-To-Market) assistant for a sales team. You have full access to their CRM data and can take actions when asked.

When the user asks you to assign an owner, move a stage, or update a next step — use the appropriate tool. After calling a tool, confirm what was done in plain English.

Rules:
- Only reference information present in the data. Never invent deals, contacts, or outcomes.
- Use exact names from the TEAM MEMBERS and PIPELINE STAGES lists when calling tools.
- Keep answers focused and scannable.
- If you are unsure, say so rather than guessing.
- When asked to delete an activity or entry, ALWAYS call the delete_activity tool — never use update_next_step or any other tool as a workaround. The tool handles all ownership and confirmation logic automatically. After calling it, inform the user that confirmation buttons will appear for them to approve or cancel the deletion.

CRM DATA:
${context}`;

  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: question.trim() },
    ];

    // ── Pass 1: non-streaming, with tools, to detect tool calls ───────────────
    const pass1 = await fetch(`${OLLAMA_URL}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, stream: false, tools: TOOLS, messages }),
    });

    if (!pass1.ok) {
      const err = await pass1.text();
      res.write(`data: ${JSON.stringify({ error: `Ollama error: ${err}` })}\n\n`);
      return;
    }

    const pass1Data = await pass1.json();
    const assistantMsg = pass1Data.message;

    // ── If tool calls returned, execute them ───────────────────────────────────
    if (assistantMsg?.tool_calls?.length) {
      messages.push(assistantMsg);

      const confirmActions = [];
      for (const tc of assistantMsg.tool_calls) {
        const toolName = tc.function?.name;
        const toolArgs = tc.function?.arguments ?? {};
        console.log(`[chat] tool call: ${toolName}`, toolArgs);

        const result = executeTool(toolName, toolArgs, currentUserId);
        console.log(`[chat] tool result:`, result);

        if (result.needsConfirmation) {
          confirmActions.push(result);
        }

        messages.push({
          role:    'tool',
          content: JSON.stringify(result),
        });
      }

      // Emit confirmAction events so the frontend can show Yes/No buttons
      for (const ca of confirmActions) {
        res.write(`data: ${JSON.stringify({ confirmAction: ca })}\n\n`);
      }

      // ── Pass 2: stream the final response now that tools ran ─────────────────
      await streamOllama(messages, res);
    } else {
      // No tool calls — stream directly from pass1 content or do a streaming re-ask
      // If pass1 already has content, stream it token-by-token as one chunk
      const content = assistantMsg?.content;
      if (content) {
        // Stream word by word so UI feels responsive
        const words = content.split(' ');
        for (const word of words) {
          res.write(`data: ${JSON.stringify({ text: word + ' ' })}\n\n`);
        }
      } else {
        await streamOllama(messages, res);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    console.error('[chat] error:', err.message);
    res.write(`data: ${JSON.stringify({ error: `Could not reach Ollama. Is it running? (${err.message})` })}\n\n`);
  } finally {
    res.end();
  }
});

module.exports = router;
