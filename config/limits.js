'use strict';

/**
 * Single source of truth for quota limits, time windows, and plan rules.
 * All monthly resets occur on the 1st of each month at 00:00 IST.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // +05:30 in milliseconds

const LIMITS = {
  anonymousLimit: 3,
  freeSignedTotal: 5,
  get freeExtra() {
    return this.freeSignedTotal - this.anonymousLimit; // 2
  },
  proLimit: 100,
  proDays: 30,
  period: 'month'
};

const TOOLS = Object.freeze(['job', 'upi', 'message']);
const SOURCES = Object.freeze(['web', 'extension']);

/**
 * Returns the current calendar month boundary in Indian Standard Time (IST).
 * @param {Date|number} [currentDate]
 * @returns {{ start: Date, resetsAt: Date }}
 */
function getIstMonthWindow(currentDate = new Date()) {
  const d = typeof currentDate === 'number' ? new Date(currentDate) : currentDate;
  // Convert UTC time to IST equivalent time
  const istDate = new Date(d.getTime() + IST_OFFSET_MS);
  const year = istDate.getUTCFullYear();
  const month = istDate.getUTCMonth(); // 0-indexed

  // Start of current month at 00:00:00 IST in UTC
  const startUtcMs = Date.UTC(year, month, 1, 0, 0, 0, 0) - IST_OFFSET_MS;
  // Start of next month at 00:00:00 IST in UTC (resetsAt)
  const nextMonthUtcMs = Date.UTC(year, month + 1, 1, 0, 0, 0, 0) - IST_OFFSET_MS;

  return {
    start: new Date(startUtcMs),
    resetsAt: new Date(nextMonthUtcMs)
  };
}

module.exports = {
  LIMITS,
  TOOLS,
  SOURCES,
  getIstMonthWindow,
  IST_OFFSET_MS
};

