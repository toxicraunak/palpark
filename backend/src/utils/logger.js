const winston = require('winston');
const path = require('path');
const fs = require('fs');

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}]: ${stack || message}`;
});

const transports = [
  new winston.transports.Console({
    format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), logFormat),
  }),
];

// Only write to log files if a writable logs/ directory is available.
// Render and other ephemeral filesystems may not persist or allow this —
// console logging alone is sufficient there (captured by Render's log viewer).
const ENABLE_FILE_LOGS = process.env.ENABLE_FILE_LOGS === 'true';
if (ENABLE_FILE_LOGS) {
  try {
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    transports.push(
      new winston.transports.File({
        filename: path.join(logsDir, 'error.log'),
        level: 'error',
        maxsize: 10 * 1024 * 1024,
        maxFiles: 5,
      }),
      new winston.transports.File({
        filename: path.join(logsDir, 'combined.log'),
        maxsize: 20 * 1024 * 1024,
        maxFiles: 10,
      })
    );
  } catch (err) {
    // Filesystem not writable (common on PaaS) — fall back to console only
    console.warn('[logger] File logging disabled (filesystem not writable):', err.message);
  }
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    logFormat
  ),
  transports,
});

module.exports = logger;
