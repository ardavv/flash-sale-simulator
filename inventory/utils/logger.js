'use strict';

/**
 * Structured logger for the Inventory Coordinator.
 *
 * Log format:
 *   [ISO_TIMESTAMP] [LEVEL    ] [COMPONENT] MESSAGE {context_json}
 *
 * Example:
 *   [2025-01-15T10:30:01.234Z] [INFO     ] [INVENTORY] Order processed { requestId: "abc-123", remaining: 997 }
 */

const LEVELS = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
};

/**
 * Pad a level string to a fixed width for aligned console output.
 * @param {string} level
 * @returns {string}
 */
function padLevel(level) {
  return level.padEnd(5, ' ');
}

/**
 * Write a single log line to stdout (INFO/DEBUG) or stderr (WARN/ERROR).
 * @param {string} level
 * @param {string} component
 * @param {string} message
 * @param {object} context
 */
function log(level, component, message, context) {
  const timestamp = new Date().toISOString();
  const ctxStr = Object.keys(context).length > 0 ? ' ' + JSON.stringify(context) : '';
  const line = `[${timestamp}] [${padLevel(level)}] [${component}] ${message}${ctxStr}`;

  if (level === LEVELS.ERROR || level === LEVELS.WARN) {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

/**
 * Factory that creates a component-scoped logger.
 *
 * @param {string} component  Name that appears in the [COMPONENT] field, e.g. "INVENTORY"
 * @returns {{ info, warn, error, debug }}
 */
function createLogger(component) {
  const comp = component.toUpperCase();
  return {
    /** @param {string} message @param {object} [context={}] */
    info(message, context = {}) {
      log(LEVELS.INFO, comp, message, context);
    },
    /** @param {string} message @param {object} [context={}] */
    warn(message, context = {}) {
      log(LEVELS.WARN, comp, message, context);
    },
    /** @param {string} message @param {object} [context={}] */
    error(message, context = {}) {
      log(LEVELS.ERROR, comp, message, context);
    },
    /** @param {string} message @param {object} [context={}] */
    debug(message, context = {}) {
      log(LEVELS.DEBUG, comp, message, context);
    },
  };
}

module.exports = { createLogger };
