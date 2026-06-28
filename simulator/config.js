'use strict';

/**
 * Configuration for the Client Simulator component.
 * Values can be overridden via environment variables.
 */
const config = {
  /** Full URL of the Order Gateway's /order endpoint */
  gatewayUrl: process.env.GATEWAY_URL || 'http://localhost:3000/order',

  /** Full URL of the Dashboard's POST /api/metrics endpoint */
  dashboardUrl: process.env.DASHBOARD_URL || 'http://localhost:8080/api/metrics',

  /** Total number of order requests to send in a single simulation session */
  totalRequests: parseInt(process.env.TOTAL_REQUESTS, 10) || 5000,

  /** Number of worker threads to spawn when running in parallel mode */
  workerCount: parseInt(process.env.WORKER_COUNT, 10) || 50,

  /** Execution mode: "parallel" | "sequential" */
  mode: process.env.MODE || 'parallel',

  /** Milliseconds before a single HTTP request is considered timed out */
  timeoutMs: parseInt(process.env.TIMEOUT_MS, 10) || 10000,
};

module.exports = config;
