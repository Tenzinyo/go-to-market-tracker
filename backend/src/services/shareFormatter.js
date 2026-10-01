/**
 * shareFormatter.js  — Phase 7
 * Generates a sensitivity-filtered plain-text account summary.
 *
 * Options:
 *   hideDealAmounts  {boolean} — redact $ figures
 *   hideContacts     {boolean} — omit contact names / emails
 *   hideOutcomes     {boolean} — omit outcome notes
 */

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatShare(account, entries, contacts = [], options = {}) {
  const { hideDealAmounts = false, hideContacts = false, hideOutcomes = false } = options;
  const lines = [];
  const today = fmtDate(new Date().toISOString().split('T')[0]);

  // ── Subject line ──────────────────────────────────────────────────────────
  lines.push(`Account Update: ${account.name}`);
  lines.push('');

  // ── Opening ───────────────────────────────────────────────────────────────
  const mostRecent = entries[0];
  const lastActivity = mostRecent
    ? `last touched on ${fmtDate(mostRecent.meeting_date ?? mostRecent.created_at?.slice(0, 10))}`
    : 'no activities logged yet';
  lines.push(`Here's a summary of where things stand with ${account.name} as of ${today}.`);
  lines.push('');
  lines.push(`Current stage: ${account.stage_name ?? 'Unknown'} — ${lastActivity}.`);

  // ── Deal value ────────────────────────────────────────────────────────────
  if (!hideDealAmounts) {
    const dealEntry = entries.find(e => e.deal_amount);
    if (dealEntry) {
      lines.push(`Deal value: ${dealEntry.deal_amount}`);
    }
  }

  // ── Contacts ──────────────────────────────────────────────────────────────
  if (!hideContacts && contacts.length > 0) {
    lines.push('');
    const names = contacts.map(c => c.email ? `${c.name} (${c.email})` : c.name);
    lines.push(`Key contacts: ${names.join(', ')}.`);
  }

  // ── Recent activity ───────────────────────────────────────────────────────
  if (entries.length > 0) {
    lines.push('');
    lines.push('Recent Activity');
    lines.push('───────────────');
    for (const e of entries) {
      const date    = fmtDate(e.meeting_date ?? e.created_at?.slice(0, 10));
      const type    = e.activity_type ?? 'Activity';
      const channel = e.channel && e.channel !== type ? ` · ${e.channel}` : '';
      const owner   = e.owner_name ? ` (${e.owner_name})` : '';
      lines.push(`${date} — ${type}${channel}${owner}`);

      const details = [];
      if (e.purpose)                         details.push(e.purpose);
      if (!hideOutcomes && e.outcome)        details.push(e.outcome);
      if (!hideDealAmounts && e.deal_amount) details.push(`Deal: ${e.deal_amount}`);
      if (details.length > 0) lines.push(details.join('. ') + '.');

      if (e.next_step) {
        const byDate = e.next_step_date ? ` by ${fmtDate(e.next_step_date)}` : '';
        lines.push(`Next: ${e.next_step}${byDate}.`);
      }
      lines.push('');
    }
  }

  // ── Open next steps ───────────────────────────────────────────────────────
  const openNextSteps = entries.filter(e => e.next_step);
  if (openNextSteps.length > 0) {
    lines.push('What\'s Next');
    lines.push('───────────');
    for (const e of openNextSteps) {
      const byDate = e.next_step_date ? ` — due ${fmtDate(e.next_step_date)}` : '';
      const owner  = e.owner_name ? ` [${e.owner_name}]` : '';
      lines.push(`• ${e.next_step}${byDate}${owner}`);
    }
    lines.push('');
  }

  lines.push('—');
  lines.push('Sent from GTM Tracker');

  return lines.join('\n');
}

module.exports = { formatShare };
