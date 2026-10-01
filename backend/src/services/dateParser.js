/**
 * dateParser.js
 * Resolves natural language dates/times to absolute values.
 * Uses chrono-node. All output is timezone-aware via the user's tz.
 */

const chrono = require('chrono-node');

/**
 * Parse date and time from free text.
 * @param {string} text  - raw input string
 * @param {string} tz    - IANA timezone string, e.g. 'America/New_York'
 * @returns {{ meeting_date: string|null, meeting_time: string|null,
 *             date_confidence: number, time_confidence: number,
 *             parsed_ref: Date|null }}
 */
function parseDatetime(text, tz = 'America/New_York') {
  // Use current time in the user's timezone as the reference point
  const refDate = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));

  const results = chrono.parse(text, refDate, { forwardDate: false });

  if (!results || results.length === 0) {
    return {
      meeting_date: null,
      meeting_time: null,
      date_confidence: 0,
      time_confidence: 0,
      parsed_ref: null,
    };
  }

  const best = results[0];
  const start = best.start;

  // Build date string YYYY-MM-DD
  const year  = start.get('year')  ?? refDate.getFullYear();
  const month = String(start.get('month')).padStart(2, '0');
  const day   = String(start.get('day')).padStart(2, '0');
  const meeting_date = `${year}-${month}-${day}`;

  // Build time string HH:MM if an hour was parsed
  let meeting_time = null;
  let time_confidence = 0;

  if (start.isCertain('hour')) {
    const hour   = String(start.get('hour')).padStart(2, '0');
    const minute = String(start.get('minute') ?? 0).padStart(2, '0');
    meeting_time = `${hour}:${minute}`;
    time_confidence = 0.9;
  } else if (start.get('hour') != null) {
    const hour   = String(start.get('hour')).padStart(2, '0');
    const minute = String(start.get('minute') ?? 0).padStart(2, '0');
    meeting_time = `${hour}:${minute}`;
    time_confidence = 0.5; // implied, not certain
  }

  // Date confidence: explicit year/month/day = high; "today"/"tomorrow" = medium
  const hasExplicitDate = start.isCertain('year') && start.isCertain('month') && start.isCertain('day');
  const date_confidence = hasExplicitDate ? 0.95 : 0.85;

  return {
    meeting_date,
    meeting_time,
    date_confidence,
    time_confidence,
    parsed_ref: start.date(),
  };
}

/**
 * Resolve a next-step / follow-up date phrase (e.g. "by next Friday", "end of week")
 */
function parseNextStepDate(text, tz = 'America/New_York') {
  const refDate = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  const results = chrono.parse(text, refDate, { forwardDate: true });
  if (!results || results.length === 0) return null;
  const s = results[0].start;
  const year  = s.get('year')  ?? refDate.getFullYear();
  const month = String(s.get('month')).padStart(2, '0');
  const day   = String(s.get('day')).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

module.exports = { parseDatetime, parseNextStepDate };
