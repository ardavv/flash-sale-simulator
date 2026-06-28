'use strict';

/**
 * Configuration for the Inventory Coordinator component.
 * Values can be overridden via environment variables.
 */
const config = {
  /** Port on which the TCP server listens */
  tcpPort: parseInt(process.env.TCP_PORT, 10) || 4000,

  /** Initial stock level for the managed product */
  initialStock: parseInt(process.env.INITIAL_STOCK, 10) || 1000,

  /**
   * Maximum milliseconds the mutex may be held before a force-release is triggered.
   * Prevents deadlocks caused by unhandled exceptions inside critical sections.
   */
  mutexTimeoutMs: parseInt(process.env.MUTEX_TIMEOUT_MS, 10) || 5000,

  /** Default product identifier managed by this coordinator */
  productId: process.env.PRODUCT_ID || 'FLASH-ITEM-001',
};

module.exports = config;
