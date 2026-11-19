/**
 * Date utility helpers for Briefly Pre-Meeting Briefing Agent
 */

/**
 * Format a Date object into human-readable date e.g. "Nov 15, 2026"
 */
function formatDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

/**
 * Format time e.g. "10:00 AM"
 */
function formatTime(date) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

/**
 * Parses and computes the strict 30-day pre-meeting research window
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string} timeStr - HH:MM
 * @returns {object} Window calculations & formatted labels
 */
function computeResearchWindow(dateStr, timeStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    throw new Error('Meeting date is required.');
  }

  // Strict format validation for YYYY-MM-DD
  const dateMatch = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) {
    throw new Error('Invalid meeting date format. Expected YYYY-MM-DD.');
  }

  const [_, y, m, d] = dateMatch.map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) {
    throw new Error('Invalid calendar date specified.');
  }

  // Time format validation
  let time = (timeStr || '').trim();
  const timeMatch = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!timeMatch) {
    throw new Error('Invalid meeting time format. Expected HH:MM.');
  }

  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  if (hours > 23 || minutes > 59) {
    throw new Error('Invalid meeting time. Expected a time between 00:00 and 23:59.');
  }

  const meetingDate = new Date(`${dateStr}T${time}:00`);
  if (Number.isNaN(meetingDate.getTime())) {
    throw new Error('Invalid meeting date or time.');
  }

  // JavaScript normalizes dates such as February 31st, so verify the parts
  // after parsing to reject impossible calendar dates.
  if (
    meetingDate.getFullYear() !== y ||
    meetingDate.getMonth() + 1 !== m ||
    meetingDate.getDate() !== d
  ) {
    throw new Error('Invalid calendar date specified.');
  }

  // 30 days prior to the meeting
  const startDate = new Date(meetingDate);
  startDate.setDate(startDate.getDate() - 30);

  const now = new Date();
  // If the meeting is in the future, research coverage extends up to now
  // If the meeting was scheduled in the past, coverage bounded by the meeting date
  const endDate = meetingDate > now ? now : meetingDate;

  return {
    meetingDate,
    meetingDateFormatted: formatDate(meetingDate),
    meetingTimeFormatted: formatTime(meetingDate),
    startDate,
    startDateFormatted: formatDate(startDate),
    endDate,
    endDateFormatted: formatDate(endDate),
    windowLabel: `${formatDate(startDate)} – ${formatDate(meetingDate)} (30 days)`
  };
}

module.exports = {
  formatDate,
  formatTime,
  computeResearchWindow
};
