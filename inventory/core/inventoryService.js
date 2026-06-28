'use strict';

const { createLogger } = require('../utils/logger');

const logger = createLogger('INVENTORY');

/**
 * InventoryService — business logic for stock management.
 *
 * Orchestrates Mutex, MasterDB, and SlaveDB to provide:
 *   - processOrder  : mutex-protected stock decrement
 *   - getStatus     : simultaneous read of master + slave state
 *   - reset         : restore stock to initial value without restart
 *
 * Requirements: 3.4, 3.5, 3.6, 3.7, 3.8, 4.5, 7.5
 */
class InventoryService {
  /**
   * @param {import('../db/masterDB')} masterDB
   * @param {import('../db/slaveDB')}  slaveDB
   * @param {import('./mutex').Mutex}  mutex
   */
  constructor(masterDB, slaveDB, mutex) {
    this._masterDB = masterDB;
    this._slaveDB  = slaveDB;
    this._mutex    = mutex;
  }

  // ---------------------------------------------------------------------------
  // processOrder
  // ---------------------------------------------------------------------------

  /**
   * Acquire the mutex, read & decrement stock if sufficient, release mutex.
   * Replication to SlaveDB is triggered automatically via MasterDB's 'write'
   * event (handled by ReplicationManager) — Req 3.8.
   *
   * @param {string} productId
   * @param {number} quantity
   * @param {string} requestId
   * @returns {Promise<{ requestId: string, status: "success"|"failed", remainingStock: number, reason?: string }>}
   */
  async processOrder(productId, quantity, requestId) {
    // Req 3.4 — acquire mutex before any MasterDB access
    const release = await this._mutex.acquire();

    let result;
    try {
      // Req 3.6 — read & conditionally decrement (MasterDB is synchronous)
      const dbResult = this._masterDB.decrementStock(productId, quantity, requestId);

      if (dbResult.success) {
        // Req 3.8 — replication triggered by MasterDB 'write' event
        result = {
          requestId,
          status: 'success',
          remainingStock: dbResult.remainingStock,
        };
        logger.info('Order processed', {
          requestId,
          result: 'success',
          remaining: dbResult.remainingStock,
        });
      } else {
        // Req 3.7 — insufficient stock: release mutex, return failure, no mutation
        result = {
          requestId,
          status: 'failed',
          remainingStock: dbResult.remainingStock,
          reason: 'insufficient_stock',
        };
        logger.info('Order failed', {
          requestId,
          result: 'failed',
          reason: 'insufficient_stock',
        });
      }
    } finally {
      // Req 3.4 / 3.5 — ALWAYS release so the queue can advance
      release();
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // getStatus
  // ---------------------------------------------------------------------------

  /**
   * Return a snapshot of master + slave state simultaneously.
   * Req 4.5 — both stocks are read in a single synchronous pass (no await
   * between reads) so they represent the same moment in time.
   *
   * @param {string} [productId='FLASH-ITEM-001']
   * @returns {{
   *   masterStock: number,
   *   slaveStock: number,
   *   slaveLastUpdated: string|null,
   *   replicationLag: number|null,
   *   isSynced: boolean,
   *   mutexQueueLength: number
   * }}
   */
  getStatus(productId = 'FLASH-ITEM-001') {
    const masterStock      = this._masterDB.getStock(productId);
    const slaveStock       = this._slaveDB.getStock(productId);
    const lastUpdatedDate  = this._slaveDB.getLastUpdated(productId);
    const slaveLastUpdated = lastUpdatedDate ? lastUpdatedDate.toISOString() : null;
    const replicationLag   = this._slaveDB.getReplicationLag();
    const isSynced         = masterStock === slaveStock;
    const mutexQueueLength = this._mutex.queueLength();

    return {
      masterStock,
      slaveStock,
      slaveLastUpdated,
      replicationLag,
      isSynced,
      mutexQueueLength,
    };
  }

  // ---------------------------------------------------------------------------
  // reset
  // ---------------------------------------------------------------------------

  /**
   * Reset stock to its initial value without restarting the process.
   * Req 7.5 — mutex is acquired so no in-flight order races the reset.
   *
   * @param {string} productId
   * @returns {Promise<void>}
   */
  async reset(productId) {
    const release = await this._mutex.acquire();
    try {
      this._masterDB.reset(productId);
      logger.info('Stock reset', { productId });
    } finally {
      release();
    }
  }
}

module.exports = InventoryService;
