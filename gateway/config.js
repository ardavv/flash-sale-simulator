'use strict';

/**
 * Configuration for the Order Gateway component.
 * Values can be overridden via environment variables.
 */
const config = {
  /** Port on which the Express HTTP server listens */
  httpPort: parseInt(process.env.HTTP_PORT, 10) || 3000,

  /** Hostname of the Inventory Coordinator TCP server */
  tcpHost: process.env.TCP_HOST || 'localhost',

  /** Port of the Inventory Coordinator TCP server */
  tcpPort: parseInt(process.env.TCP_PORT, 10) || 4000,

  /** Maximum number of TCP reconnect attempts before giving up */
  maxRetries: parseInt(process.env.MAX_RETRIES, 10) || 5,

  /** Milliseconds to wait between reconnect attempts */
  retryIntervalMs: parseInt(process.env.RETRY_INTERVAL_MS, 10) || 1000,

  /** Milliseconds to wait for a TCP response before timing out a request */
  requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 10000,
};

module.exports = config;
