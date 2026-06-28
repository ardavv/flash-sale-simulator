'use strict';

/**
 * SlaveDB — read-only replica of MasterDB.
 *
 * The ONLY way to update data is via applyReplication().
 * No direct write methods are exposed.
 *
 * Internal state:
 *   products: Map<productId, { stock: number, lastUpdated: Date }>
 *
 * Satisfies Requirements 4.2, 4.3, 4.6
 */
class SlaveDB {
  constructor() {
    /** @type {Map<string, { stock: number, lastUpdated: Date }>} */
    this._products = new Map();
  }

  /**
   * Apply a replication event from MasterDB.
   * This is the ONLY method that mutates the SlaveDB state.
   *
   * @param {string} productId
   * @param {number} stock        - current stock value from Master
   * @param {Date|string|number}  timestamp - when the master write occurred
   */
  applyReplication(productId, stock, timestamp) {
    const ts =
      timestamp instanceof Date
        ? timestamp
        : new Date(timestamp);

    this._products.set(productId, {
      stock: stock,
      lastUpdated: ts,
    });
  }

  /**
   * Return the current stock for a product.
   * Returns 0 if the product has never been replicated.
   *
   * @param {string} productId
   * @returns {number}
   */
  getStock(productId) {
    const entry = this._products.get(productId);
    return entry !== undefined ? entry.stock : 0;
  }

  /**
   * Return the Date of the last replication for a product.
   * Returns null if the product has never been replicated.
   *
   * @param {string} productId
   * @returns {Date|null}
   */
  getLastUpdated(productId) {
    const entry = this._products.get(productId);
    return entry !== undefined ? entry.lastUpdated : null;
  }

  /**
   * Return milliseconds elapsed since the most recent replication event
   * across ALL products.
   * Returns null if no replication has happened yet.
   *
   * @returns {number|null}
   */
  getReplicationLag() {
    if (this._products.size === 0) {
      return null;
    }

    let mostRecentMs = -Infinity;
    for (const entry of this._products.values()) {
      const ms = entry.lastUpdated.getTime();
      if (ms > mostRecentMs) {
        mostRecentMs = ms;
      }
    }

    return Date.now() - mostRecentMs;
  }
}

module.exports = SlaveDB;
