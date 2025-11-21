const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'suspicious_activities.log');

/**
 * Logs a suspicious activity.
 * @param {string} type - The type of suspicious activity (e.g., 'QUEST_COMPLETION_TIME', 'SPAM_QUEST_COMPLETION').
 * @param {object} data - The data associated with the event.
 */
function logSuspiciousActivity(type, data) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    type,
    data,
  };

  const logLine = JSON.stringify(logEntry) + '\n';

  fs.appendFile(LOG_FILE, logLine, (err) => {
    if (err) {
      console.error('Failed to write to suspicious activity log:', err);
    }
  });
}

module.exports = { logSuspiciousActivity };