/**
 * services/workflowEngine.js
 *
 * fireTrigger(type, context)  — call from routes after mutations
 * checkInactivity()           — call on a schedule
 * start()                     — starts the periodic inactivity checker
 */

const db = require('../db/db');
const { emit } = require('./sseEmitter');

const LIFECYCLE_STAGES = ['lead', 'mql', 'sql', 'opportunity', 'customer', 'churned'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getEnabledWorkflows(triggerType) {
  return db.prepare(`SELECT * FROM workflows WHERE enabled = 1 AND trigger_type = ?`).all(triggerType);
}

function logRun(workflowId, triggerData, status, errorMsg = null) {
  try {
    db.prepare(`
      INSERT INTO workflow_runs (workflow_id, trigger_data, status, error_msg)
      VALUES (?, ?, ?, ?)
    `).run(workflowId, JSON.stringify(triggerData), status, errorMsg ?? null);
  } catch {}
}

// ── Action executor ───────────────────────────────────────────────────────────

function executeAction(workflow, context) {
  const config = JSON.parse(workflow.action_config || '{}');

  switch (workflow.action_type) {
    case 'create_task': {
      const raw   = config.title || 'Follow up';
      const title = raw
        .replace(/\{\{account_name\}\}/g, context.account_name ?? '')
        .replace(/\{\{deal_name\}\}/g,    context.deal_name    ?? '');

      const offsetDays = Number(config.due_offset_days ?? 0);
      const dueDate = offsetDays > 0
        ? new Date(Date.now() + offsetDays * 86_400_000).toISOString().split('T')[0]
        : null;

      const info = db.prepare(`
        INSERT INTO tasks (title, priority, due_date, account_id, deal_id, assignee_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        title,
        config.priority    ?? 'medium',
        dueDate,
        context.account_id ?? null,
        context.deal_id    ?? null,
        config.assignee_id ?? null,
      );
      emit('task_created', { id: info.lastInsertRowid, account_id: context.account_id ?? null, deal_id: context.deal_id ?? null });
      break;
    }

    case 'advance_lifecycle': {
      if (!context.account_id) break;
      const acct = db.prepare(`SELECT lifecycle_stage FROM accounts WHERE id = ? AND deleted_at IS NULL`).get(context.account_id);
      if (!acct?.lifecycle_stage) break;
      const idx = LIFECYCLE_STAGES.indexOf(acct.lifecycle_stage);
      if (idx >= 0 && idx < LIFECYCLE_STAGES.length - 1) {
        db.prepare(`UPDATE accounts SET lifecycle_stage = ?, updated_at = datetime('now') WHERE id = ?`)
          .run(LIFECYCLE_STAGES[idx + 1], context.account_id);
      }
      break;
    }

    default:
      break;
  }
}

// ── Trigger matcher ───────────────────────────────────────────────────────────

function fireTrigger(triggerType, context) {
  const workflows = getEnabledWorkflows(triggerType);

  for (const wf of workflows) {
    try {
      const cfg = JSON.parse(wf.trigger_config || '{}');

      if (triggerType === 'stage_changed') {
        // entity filter: 'account' | 'deal' (omit = both)
        if (cfg.entity && cfg.entity !== context.entity) continue;
        // stage filter: only fire on specific destination stage
        if (cfg.stage_id && Number(cfg.stage_id) !== Number(context.to_stage_id)) continue;
      }

      if (triggerType === 'lifecycle_changed') {
        // only fire for specific target lifecycle stage if configured
        if (cfg.lifecycle_stage && cfg.lifecycle_stage !== context.lifecycle_stage) continue;
      }

      // deal_created — no filtering needed, fires on every new deal

      executeAction(wf, context);
      logRun(wf.id, context, 'ok');
    } catch (err) {
      console.error(`[workflow] error executing workflow ${wf.id}:`, err.message);
      logRun(wf.id, context, 'error', err.message);
    }
  }
}

// ── Inactivity checker ────────────────────────────────────────────────────────

function checkInactivity() {
  const workflows = getEnabledWorkflows('inactivity_days');
  if (workflows.length === 0) return;

  for (const wf of workflows) {
    try {
      const cfg  = JSON.parse(wf.trigger_config || '{}');
      const days = Math.max(1, Number(cfg.days ?? 14));

      // Accounts whose last activity was more than N days ago (or never)
      const staleAccounts = db.prepare(`
        SELECT a.id, a.name,
               MAX(COALESCE(e.meeting_date, date(e.created_at))) AS last_activity
        FROM accounts a
        LEFT JOIN entries e ON e.account_id = a.id AND e.deleted_at IS NULL
        WHERE a.deleted_at IS NULL
        GROUP BY a.id
        HAVING last_activity IS NULL OR last_activity <= date('now', ?)
      `).all(`-${days} days`);

      for (const acct of staleAccounts) {
        // Prevent re-triggering the same workflow for the same account within 24 h
        const recent = db.prepare(`
          SELECT id FROM workflow_runs
          WHERE workflow_id = ?
            AND trigger_data LIKE ?
            AND ran_at >= datetime('now', '-1 day')
        `).get(wf.id, `%"account_id":${acct.id}%`);

        if (recent) continue;

        const context = { account_id: acct.id, account_name: acct.name };
        executeAction(wf, context);
        logRun(wf.id, context, 'ok');
      }
    } catch (err) {
      console.error('[workflow] inactivity check error:', err.message);
    }
  }
}

// ── Background runner ─────────────────────────────────────────────────────────

function start() {
  // Run once on startup, then every hour
  setTimeout(() => {
    checkInactivity();
    setInterval(checkInactivity, 60 * 60 * 1000);
  }, 30_000); // 30 s delay after boot

  console.log('[workflow] Inactivity checker scheduled (hourly)');
}

module.exports = { fireTrigger, checkInactivity, start };
