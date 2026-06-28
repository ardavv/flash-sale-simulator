'use strict';

const { EventEmitter } = require('events');

/**
 * MasterDB — in-memory database for inventory stock management.
 *
 * Handles write operations with version tracking and write-event notification
 * (for replication to SlaveDB). Mutex locking is managed *externally* by
 * InventoryService; decrementStock itself is therefore synchronous.
 *
 * Internal state shape:
 *   products: Map<productId, { stock: number, version: number }>
 *   writeLog: Array<{ productId, delta, remainingStock, timestamp, requestId }>
 *
 * Requirements: 3.6, 3.9, 4.1
 */
class MasterDB extends EventEmitter {
  /**
   * @param {Map<string, number>|number} initialStock
   *   - If a Map is provided, each entry is { productId → initialStock }.
   *   - If a number is provided, it is stored under the default productId
   *     'FLASH-ITEM-001'.
   */
  constructor(initialStock) {
    super();

    /** @type {Map<string, number>} productId → initial stock value (for reset) */
    this._initialStockMap = new Map();

    /** @type {Map<string, { stock: number, version: number }>} */
    this.products = new Map();

    /** @type {Array<{ productId: string, delta: number, remainingStock: number, timestamp: string, requestId: string|null }>} */
    this.writeLog = [];

    // Normalise constructor argument into a Map
    if (initialStock instanceof Map) {
      for (const [productId, stock] of initialStock) {
        this._initialStockMap.set(productId, stock);
        this.products.set(productId, { stock, version: 0 });
      }
    } else {
      const stock = typeof initialStock === 'number' ? initialStock : 0;
      const defaultId = 'FLASH-ITEM-001';
      this._initialStockMap.set(defaultId, stock);
      this.products.set(defaultId, { stock, version: 0 });
    }
  }

  /**
   * Returns the current stock for a product.
   * Read-only; no mutex required.
   *
   * @param {string} productId
   * @returns {number} current stock, or 0 if productId is unknown
   */
  getStock(productId) {
    const entry = this.products.get(productId);
    return entry ? entry.stock : 0;
  }

  /**
   * Decrements the stock for a product by the given quantity.
   * Implements Requirement 3.9 — stock can never go below zero.
   *
   * Mutex acquisition is the caller's responsibility (InventoryService).
   * This method is synchronous.
   *
   * On success:
   *   - Decrements stock, increments version
   *   - Appends an entry to writeLog
   *   - Emits 'write' event with { productId, remainingStock, timestamp, requestId }
   *
   * @param {string}      productId
   * @param {number}      quantity   - must be a positive integer
   * @param {string|null} [requestId]
   * @returns {{ success: boolean, remainingStock: number }}
   */
  decrementStock(productId, quantity, requestId = null) {
    const entry = this.products.get(productId);
    const currentStock = entry ? entry.stock : 0;

    // Req 3.9 — never go below zero
    if (!entry || currentStock < quantity) {
      return { success: false, remainingStock: currentStock };
    }

    const remainingStock = currentStock - quantity;
    entry.stock = remainingStock;
    entry.version += 1;

    const timestamp = new Date().toISOString();

    this.writeLog.push({
      productId,
      delta: -quantity,
      remainingStock,
      timestamp,
      requestId,
    });

    // Req 4.1 — notify replication listener after every successful write
    this.emit('write', { productId, remainingStock, timestamp, requestId });

    return { success: true, remainingStock };
  }

  /**
   * Resets the stock for a product to the given value (or its initial stock
   * if no value is provided). Version is reset to 0.
   *
   * @param {string} productId
   * @param {number} [stock] - optional override; defaults to initial stock
   */
  reset(productId, stock) {
    const resetValue =
      stock !== undefined ? stock : (this._initialStockMap.get(productId) || 0);

    this.products.set(productId, { stock: resetValue, version: 0 });
  }

  /**
   * Registers a listener for the 'write' event (fires after every successful
   * decrementStock call). Implements Req 4.1 replication notification hook.
   *
   * @param {Function} listener - ({ productId, remainingStock, timestamp, requestId }) => void
   */
  onWrite(listener) {
    this.on('write', listener);
  }
}

module.exports = MasterDB;
