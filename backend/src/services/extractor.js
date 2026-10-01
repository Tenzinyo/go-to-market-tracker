/**
 * extractor.js
 * Rules-based extraction pipeline. Zero LLM. Zero cost.
 *
 * Given a raw text string, returns a structured preview object with
 * per-field confidence scores and a list of missing required fields.
 * The caller shows this to the user in a confirmation card BEFORE saving.
 */

const { parseDatetime, parseNextStepDate } = require('./dateParser');
const { findCandidates }                   = require('./fuzzyMatcher');

// ── Keyword dictionaries ──────────────────────────────────────────────────────

const ACTIVITY_TYPES = {
  'Meeting':      ['meeting', 'meetup', 'meet-up', 'meet up', 'met with', 'met ', 'sat down', 'conference',
                   'session with', 'sync with', 'catch-up', 'catch up', 'had lunch', 'lunch with',
                   'grabbed lunch', 'coffee with', 'coffee chat', '1:1', 'one-on-one', 'one on one',
                   'had a call', 'introductory call', 'intro call', 'kickoff', 'kick-off'],
  'Call':         ['call with', 'called', 'phone call', 'spoke with', 'talked to', 'rang', 'on a call', 'hopped on a call'],
  'Email':        ['emailed', 'sent an email', 'sent email', 'email to', 'wrote to', 'messaged via email'],
  'Demo':         ['demo', 'demonstration', 'walk-through', 'walkthrough', 'showed the product'],
  'Presentation': ['presentation', 'presented', 'pitch', 'pitched'],
  'Follow-up':    ['follow-up', 'follow up', 'followed up', 'checking in', 'touching base', 'circling back'],
  'Proposal':     ['sent proposal', 'submitted proposal', 'proposal sent', 'quoted', 'sent a quote'],
  'Contract':     ['contract', 'agreement', 'signed', 'ink', 'paperwork'],
  'Podcast':      ['podcast', 'pod episode', 'recorded a podcast', 'appeared on', 'guest on', 'guested on',
                   'interviewed on', 'podcast episode', 'pod guest', 'was on a podcast', 'podcast interview'],
  'Conference':   ['conference', 'conf ', 'summit', 'expo', 'trade show', 'tradeshow', 'networking event',
                   'industry event', 'attended conference', 'presented at', 'spoke at', 'panel', 'panelist',
                   'keynote', 'booth at', 'meetup event', 'workshop', 'hackathon', 'seminar', 'webinar'],
};

const CHANNELS = {
  'Online':     ['online', 'virtual', 'zoom', 'microsoft teams', 'google meet', 'webex', 'skype', 'remote', 'video call', 'video meeting'],
  'In-person':  ['in-person', 'in person', 'face to face', 'face-to-face', 'on-site', 'onsite', 'at their office',
                 'at our office', 'visited', 'lunch', 'coffee', 'in the office', 'at the office', 'stopped by',
                 'came in', 'went to', 'in person'],
  'Phone':        ['by phone', 'over the phone', 'phone call', 'on the phone', 'mobile call'],
  'Email':        ['via email', 'by email', 'over email', 'through email'],
  'Conference':   ['at a conference', 'at the conference', 'at the summit', 'at the expo', 'at the event',
                   'at the trade show', 'at the tradeshow', 'at the meetup', 'at the workshop', 'at the seminar'],
  'Podcast':      ['on a podcast', 'on the podcast', 'via podcast', 'on their podcast', 'podcast recording'],
};

const STAGE_KEYWORDS = {
  'Prospecting': ['prospect', 'prospecting', 'outreach', 'initial contact', 'cold call', 'identifying', 'exploring potential',
                  'networking', 'building connections', 'building network', 'met at conference', 'met at the conference',
                  'connected at', 'exchanged cards', 'swapped info'],
  'Contacted':   ['contacted', 'reached out', 'introductory', 'intro call', 'first meeting', 'initial meeting', 'first contact'],
  'Submitted':   ['submitted', 'sent proposal', 'proposal submitted', 'application submitted', 'submitted request', 'sent over the proposal', 'approval request'],
  'Pending':     ['pending', 'waiting for', 'awaiting', 'under review', 'in review', 'approval pending', 'decision pending', 'waiting on'],
  'Staged':      ['staged', 'approved', 'moving forward', 'agreed to move', 'greenlit', 'got the green light'],
  'Closed Won':  ['closed won', 'won the deal', 'signed the contract', 'deal closed', 'deal done', 'we won', 'contract signed'],
  'Closed Lost': ['closed lost', 'lost the deal', 'rejected', 'declined', 'passed on it', 'not interested', 'no deal', 'we lost'],
  'On Hold':     ['on hold', 'put on hold', 'paused', 'delayed', 'postponed', 'deferred', 'waiting to hear back', 'no update'],
};

// Keywords that signal a next step is mentioned
const NEXT_STEP_SIGNALS = [
  'next step', 'follow up', 'will send', 'need to', 'action item',
  'plan to', 'schedule', 'set up a', 'will call', 'will email',
  'will submit', 'will share', 'will send over', 'will follow',
];

// Purpose extraction prepositions / openers
const PURPOSE_PREPOSITIONS = [
  'to discuss', 'went over', 'went through', 'talked about', 'talked through',
  'discussed', 'covered', 'reviewed', 'focused on', 'around', 'about',
  'regarding', 're:', 'discussing', 'related to', 'on the topic of', 'for',
];

// Required fields — missing any of these is flagged
const REQUIRED_FIELDS = ['meeting_date', 'activity_type', 'account_name'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreKeywords(lower, dict) {
  for (const [label, keywords] of Object.entries(dict)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return { value: label, confidence: 0.9 };
    }
  }
  return { value: null, confidence: 0 };
}

/**
 * Extract account name from raw text using structural patterns.
 * Returns { name, confidence, startIdx, endIdx }
 */
function extractAccountName(text) {
  // Pattern 1: "with [Account] for/about/regarding/at/in/to/on"
  const withRe = /\bwith\s+([A-Z][A-Za-z0-9\s&,\.'-]{2,60}?)(?=\s+(?:for|about|regarding|at|in\b|to\b|on\b|from\b|by\b|re:|and\b)|\s*[,\.]|$)/;
  let m = text.match(withRe);
  if (m) {
    const name = m[1].trim().replace(/\s+/g, ' ');
    return { name, confidence: 0.82, startIdx: m.index, endIdx: m.index + m[0].length };
  }

  // Pattern 2: "from [Account]"
  const fromRe = /\bfrom\s+([A-Z][A-Za-z0-9\s&,\.'-]{2,60}?)(?=\s+(?:for|about|at|in\b|to\b)|\s*[,\.]|$)/;
  m = text.match(fromRe);
  if (m) {
    const name = m[1].trim().replace(/\s+/g, ' ');
    return { name, confidence: 0.72, startIdx: m.index, endIdx: m.index + m[0].length };
  }

  // Pattern 2b: "outreach to [Account]" / "connected with [Account]" / "met [Account]"
  const outreachRe = /\b(?:outreach to|connected with|met\s+(?:the\s+)?|spoke to|introduced to)\s+([A-Z][A-Za-z0-9\s&,\.'-]{2,60}?)(?=\s+(?:team|folks|people|rep|contact|about|at|for|and\b)|\s*[,\.]|$)/;
  m = text.match(outreachRe);
  if (m) {
    const name = m[1].trim().replace(/\s+/g, ' ');
    return { name, confidence: 0.70, startIdx: m.index, endIdx: m.index + m[0].length };
  }

  // Pattern 3: "[Account Inc/LLC/Corp/Ltd/Co/Securities/Company/Group/Partners] meeting/call"
  const suffixRe = /([A-Z][A-Za-z0-9\s&'-]{1,50}(?:Inc\.?|LLC\.?|Corp\.?|Ltd\.?|\bCo\.?|Securities|Company|Group|Partners|Associates|Ventures|Holdings))\s+(?:meeting|call|discussion|presentation|demo|conference)/i;
  m = text.match(suffixRe);
  if (m) {
    const name = m[1].trim().replace(/\s+/g, ' ');
    return { name, confidence: 0.70, startIdx: m.index, endIdx: m.index + m[0].length };
  }

  return { name: null, confidence: 0, startIdx: -1, endIdx: -1 };
}

/**
 * Extract purpose from text, preferring text that comes AFTER the account name.
 */
function extractPurpose(text, accountEndIdx) {
  const searchText = accountEndIdx > 0 ? text.slice(accountEndIdx) : text;

  for (const prep of PURPOSE_PREPOSITIONS) {
    // Match "for [purpose] at/on/by/[comma/period/end]"
    const re = new RegExp(
      `\\b${prep}\\s+(.{3,120?})(?=\\s+(?:at|on|by|before|after)\\b|[,\\.]|$)`,
      'i'
    );
    const m = searchText.match(re);
    if (m) {
      const purpose = m[1].trim().replace(/\s+/g, ' ');
      // Skip if it looks like a time ("at 7 pm")
      if (/^\d/.test(purpose)) continue;
      return { value: purpose, confidence: 0.80 };
    }
  }
  return { value: null, confidence: 0 };
}

/**
 * Extract next step text from sentences containing signal phrases.
 */
function extractNextStep(text) {
  const lower = text.toLowerCase();
  for (const signal of NEXT_STEP_SIGNALS) {
    const idx = lower.indexOf(signal);
    if (idx === -1) continue;
    // Grab the rest of the sentence from the signal
    const snippet = text.slice(idx);
    const end = snippet.search(/[\.!?\n]/);
    const raw = end > 0 ? snippet.slice(0, end) : snippet;
    const cleaned = raw.trim().replace(/\s+/g, ' ');
    if (cleaned.length > 5) return { value: cleaned, confidence: 0.75 };
  }
  return { value: null, confidence: 0 };
}

/**
 * Extract deal amount — currency patterns like $10,000 or "10k" or "50 thousand"
 */
function extractDealAmount(text) {
  const currencyRe = /(\$[\d,]+(?:\.\d{2})?(?:\s*(?:k|M|B|thousand|million|billion))?|\b\d[\d,]*(?:\.\d{2})?\s*(?:USD|dollars?|k|M|B|thousand|million|billion)\b)/i;
  const m = text.match(currencyRe);
  return m ? { value: m[1].trim(), confidence: 0.88 } : { value: null, confidence: 0 };
}

/**
 * Extract outcome sentiment — "successful", "went well", "no interest", etc.
 */
function extractOutcome(lower) {
  if (/(successful|went well|went great|great meeting|good meeting|positive|productive|they.re interested|very interested|moving forward|agreed to|signed|closed)/.test(lower)) {
    return { value: 'Successful', confidence: 0.72 };
  }
  if (/(no interest|not interested|passed|declined|rejected|didn.t go well|went poorly|no response|ghosted|dead end)/.test(lower)) {
    return { value: 'Not interested', confidence: 0.72 };
  }
  if (/(needs more info|need to follow up|they need time|thinking about it|will get back|get back to us|considering)/.test(lower)) {
    return { value: 'Needs follow-up', confidence: 0.68 };
  }
  return { value: null, confidence: 0 };
}

/**
 * Infer stage from activity context clues when no stage keyword was found.
 * Returns a lower-confidence guess.
 */
function inferStage(activityType, purpose, lower) {
  if (!activityType && !purpose) return { value: null, confidence: 0 };
  const combined = `${activityType ?? ''} ${purpose ?? ''} ${lower}`.toLowerCase();

  if (/(proposal|submitted|approval request|sent over)/.test(combined)) return { value: 'Submitted', confidence: 0.5 };
  if (/(pending|awaiting|under review|waiting)/.test(combined))          return { value: 'Pending',   confidence: 0.5 };
  if (/(intro|first meeting|initial)/.test(combined))                    return { value: 'Contacted', confidence: 0.5 };
  if (/(signed|closed|won)/.test(combined))                              return { value: 'Closed Won', confidence: 0.5 };
  if (/(on hold|paused|delayed)/.test(combined))                         return { value: 'On Hold',   confidence: 0.5 };
  return { value: null, confidence: 0 };
}

// ── Main extract function ─────────────────────────────────────────────────────

/**
 * Extract structured fields from a single plain-text message.
 *
 * @param {string} text      - raw user input
 * @param {number} ownerId   - user ID of the person submitting
 * @param {string} timezone  - IANA timezone of the submitting user
 * @param {string} source    - 'typed' | 'voice' | 'pasted'
 * @returns {object}         - extraction preview (not saved yet)
 */
function extract(text, ownerId, timezone = 'America/New_York', source = 'typed') {
  const lower = text.toLowerCase();
  const confidence = {};
  const missing = [];

  // ── 1. Date / Time ──────────────────────────────────────────────────────────
  const dt = parseDatetime(text, timezone);
  const meeting_date = dt.meeting_date;
  const meeting_time = dt.meeting_time;
  confidence.meeting_date = dt.date_confidence;
  confidence.meeting_time = dt.time_confidence;
  if (!meeting_date) missing.push('meeting_date');

  // ── 2. Activity type ────────────────────────────────────────────────────────
  const at = scoreKeywords(lower, ACTIVITY_TYPES);
  const activity_type = at.value;
  confidence.activity_type = at.confidence;
  if (!activity_type) missing.push('activity_type');

  // ── 3. Channel ──────────────────────────────────────────────────────────────
  const ch = scoreKeywords(lower, CHANNELS);
  const channel = ch.value;
  confidence.channel = ch.confidence;
  if (!channel) missing.push('channel');

  // ── 4. Account name ─────────────────────────────────────────────────────────
  const acctExtract = extractAccountName(text);
  const rawAccountName = acctExtract.name;
  confidence.account_name = acctExtract.confidence;

  // Fuzzy-match against known DB accounts
  let account_id        = null;
  let account_name      = rawAccountName;
  let fuzzy_candidates  = [];
  let account_is_new    = true;

  if (rawAccountName) {
    fuzzy_candidates = findCandidates(rawAccountName);
    if (fuzzy_candidates.length > 0 && fuzzy_candidates[0].isExact) {
      account_id       = fuzzy_candidates[0].id;
      account_name     = fuzzy_candidates[0].name;
      account_is_new   = false;
      confidence.account_name = 0.97;
    } else if (fuzzy_candidates.length > 0 && fuzzy_candidates[0].score >= 0.75) {
      // High-confidence match — still surface to user to confirm
      confidence.account_name = fuzzy_candidates[0].score;
    }
  } else {
    missing.push('account_name');
  }

  // ── 5. Purpose ──────────────────────────────────────────────────────────────
  const pu = extractPurpose(text, acctExtract.endIdx);
  const purpose = pu.value;
  confidence.purpose = pu.confidence;
  if (!purpose) missing.push('purpose');

  // ── 6. Stage ────────────────────────────────────────────────────────────────
  const sg = scoreKeywords(lower, STAGE_KEYWORDS);
  let stage_name = sg.value;
  confidence.stage = sg.confidence;

  if (!stage_name) {
    const inferred = inferStage(activity_type, purpose, lower);
    stage_name = inferred.value;
    confidence.stage = inferred.confidence;
  }
  if (!stage_name) missing.push('stage');

  // ── 7. Next step ────────────────────────────────────────────────────────────
  const ns = extractNextStep(text);
  const next_step = ns.value;
  confidence.next_step = ns.confidence;

  // ── 8. Next step date ───────────────────────────────────────────────────────
  let next_step_date = null;
  if (next_step) {
    next_step_date = parseNextStepDate(next_step, timezone);
    confidence.next_step_date = next_step_date ? 0.75 : 0;
  }

  // ── 9. Deal amount ──────────────────────────────────────────────────────────
  const da = extractDealAmount(text);
  const deal_amount = da.value;
  confidence.deal_amount = da.confidence;

  // ── 10. Outcome ─────────────────────────────────────────────────────────────
  const oc = extractOutcome(lower);
  const outcome = oc.value;
  confidence.outcome = oc.confidence;

  // ── 11. Missing required fields ─────────────────────────────────────────────
  for (const f of REQUIRED_FIELDS) {
    if (!missing.includes(f)) {
      const val = { meeting_date, activity_type, account_name }[f];
      if (!val) missing.push(f);
    }
  }

  return {
    // Extracted values
    raw_text:        text,
    source,
    owner_id:        ownerId,
    meeting_date,
    meeting_time,
    activity_type,
    channel,
    account_name,     // display name (may be new or matched)
    account_id,       // null if new account
    account_is_new,
    fuzzy_candidates, // non-empty = ask user to confirm merge
    purpose,
    stage_name,       // stage name string; route converts to stage_id
    next_step,
    next_step_date,
    deal_amount,
    deal_detail:      null,    // not extractable from text; user fills in
    outcome,
    contact_name:     null,    // not extractable; user fills in
    // Meta
    confidence,
    missing_fields: missing,
  };
}

// ── Pasted conversation splitter ─────────────────────────────────────────────

/**
 * Split a pasted multi-person conversation into individual message blocks.
 * Supports formats:
 *   "Name: message"
 *   "[HH:MM] Name: message"
 *   "Name (date): message"
 *
 * @param {string} conversation - raw pasted text
 * @returns {Array<{ author: string|null, timestamp: string|null, text: string }>}
 */
function splitConversation(conversation) {
  // Try to detect message boundaries
  const lineRe = /^(?:\[?(\d{1,2}[:\/.]\d{2}(?:[:\/.]\d{2,4})?(?:\s*[AP]M)?)\]?\s+)?([A-Z][A-Za-z\s]{1,30}):\s*(.+)/;
  const lines   = conversation.split('\n');
  const blocks  = [];
  let current   = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const m = trimmed.match(lineRe);
    if (m) {
      if (current) blocks.push(current);
      current = {
        author:    m[2]?.trim()  ?? null,
        timestamp: m[1]?.trim()  ?? null,
        text:      m[3]?.trim()  ?? trimmed,
      };
    } else if (current) {
      // Continuation of previous message
      current.text += ' ' + trimmed;
    } else {
      // No author pattern found — treat as a single-author message
      blocks.push({ author: null, timestamp: null, text: trimmed });
    }
  }

  if (current) blocks.push(current);

  // If no structure was detected, return the whole thing as one block
  return blocks.length > 0 ? blocks : [{ author: null, timestamp: null, text: conversation }];
}

module.exports = { extract, splitConversation };
