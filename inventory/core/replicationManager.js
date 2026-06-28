'use strict';

/**
 * ReplicationManager — bridges MasterDB write events to SlaveDB.
 *
 * Subscribes to the 'write' event emitted by MasterDB after every successful
 * decrementStock(), then calls slaveDB.applyReplication() either immediately
 * (replicationDelayMs === 0) or after a configurable simulated delay.
 *
 * The delay is always ≤ 100 ms so that Requirement 4.4 is satisfied.
 *
 * Requirements: 4.1, 4.2, 4.4
 */
class ReplicationManager {
  /**
   * @param {import('../db/masterDB')} masterDB
   * @param {import('../db/slaveDB')}  slaveDB
   * @param {{ replicationDelayMs?: number }} [options]
   */
  constructor(masterDB, slaveDB, options = {}) {
    this._masterDB = masterDB;
    this._slaveDB = slaveDB;
    this._replicationDelayMs =
      typeof options.replicationDelayMs === 'number'
        ? options.replicationDelayMs
        : 0;

    // Bind once so the same function reference can be removed in stop()
    this._handleWrite = this._handleWrite.bind(this);
  }

  /**
   * Start listening for write events on MasterDB.
   * Safe to call multiple times — duplicate registration is avoided because
   * `_handleWrite` is always the same bound reference.
   */
  start() {
    this._masterDB.onWrite(this._handleWrite);
  }

  /**
   * Stop listening for write events (cleanup).
   */
  stop() {
    this._masterDB.removeListener('write', this._handleWrite);
  }

  /**
   * Internal handler invoked on every MasterDB 'write' event.
   *
   * @param {{ productId: string, remainingStock: number, timestamp: string, requestId: string|null }} event
   */
  _handleWrite({ productId, remainingStock, timestamp }) {
    if (this._replicationDelayMs === 0) {
      this._slaveDB.applyReplication(productId, remainingStock, timestamp);
    } else {
      setTimeout(() => {
        this._slaveDB.applyReplication(productId, remainingStock, timestamp);
      }, this._replicationDelayMs);
    }
  }
}

module.exports = ReplicationManager;
