'use strict';

const MasterDB = require('../masterDB');

// Feature: flash-sale-simulator — Task 2.1: MasterDB unit tests

describe('MasterDB', () => {
  // ─── constructor ──────────────────────────────────────────────────────────

  describe('constructor', () => {
    test('accepts a number and stores it under the default productId', () => {
      const db = new MasterDB(500);
      expect(db.getStock('FLASH-ITEM-001')).toBe(500);
    });

    test('accepts a Map and stores each product', () => {
      const map = new Map([
        ['PROD-A', 100],
        ['PROD-B', 200],
      ]);
      const db = new MasterDB(map);
      expect(db.getStock('PROD-A')).toBe(100);
      expect(db.getStock('PROD-B')).toBe(200);
    });
  });

  // ─── getStock ─────────────────────────────────────────────────────────────

  describe('getStock', () => {
    test('returns 0 for an unknown productId', () => {
      const db = new MasterDB(100);
      expect(db.getStock('UNKNOWN-PRODUCT')).toBe(0);
    });

    test('returns the correct initial stock', () => {
      const db = new MasterDB(42);
      expect(db.getStock('FLASH-ITEM-001')).toBe(42);
    });
  });

  // ─── decrementStock ───────────────────────────────────────────────────────

  describe('decrementStock', () => {
    test('stock does not go below 0 when quantity exceeds current stock', () => {
      const db = new MasterDB(5);
      const result = db.decrementStock('FLASH-ITEM-001', 10);
      expect(result.success).toBe(false);
      expect(result.remainingStock).toBe(5); // unchanged
      expect(db.getStock('FLASH-ITEM-001')).toBe(5);
    });

    test('returns success:false and does not modify stock for unknown product', () => {
      const db = new MasterDB(10);
      const result = db.decrementStock('DOES-NOT-EXIST', 1);
      expect(result.success).toBe(false);
      expect(result.remainingStock).toBe(0);
    });

    test('successful decrement when quantity equals currentStock exactly', () => {
      const db = new MasterDB(10);
      const result = db.decrementStock('FLASH-ITEM-001', 10);
      expect(result.success).toBe(true);
      expect(result.remainingStock).toBe(0);
      expect(db.getStock('FLASH-ITEM-001')).toBe(0);
    });

    test('normal decrement reduces stock by the correct amount', () => {
      const db = new MasterDB(100);
      const result = db.decrementStock('FLASH-ITEM-001', 30);
      expect(result.success).toBe(true);
      expect(result.remainingStock).toBe(70);
      expect(db.getStock('FLASH-ITEM-001')).toBe(70);
    });

    test('increments version after each successful write', () => {
      const db = new MasterDB(100);
      db.decrementStock('FLASH-ITEM-001', 1);
      db.decrementStock('FLASH-ITEM-001', 1);
      expect(db.products.get('FLASH-ITEM-001').version).toBe(2);
    });

    test('appends an entry to writeLog on success', () => {
      const db = new MasterDB(50);
      db.decrementStock('FLASH-ITEM-001', 5, 'req-001');
      expect(db.writeLog).toHaveLength(1);
      expect(db.writeLog[0]).toMatchObject({
        productId: 'FLASH-ITEM-001',
        delta: -5,
        remainingStock: 45,
        requestId: 'req-001',
      });
      expect(typeof db.writeLog[0].timestamp).toBe('string');
    });

    test('does NOT append to writeLog on failure', () => {
      const db = new MasterDB(3);
      db.decrementStock('FLASH-ITEM-001', 99);
      expect(db.writeLog).toHaveLength(0);
    });
  });

  // ─── reset ────────────────────────────────────────────────────────────────

  describe('reset', () => {
    test('reset returns stock to initialStock value', () => {
      const db = new MasterDB(100);
      db.decrementStock('FLASH-ITEM-001', 60);
      db.reset('FLASH-ITEM-001');
      expect(db.getStock('FLASH-ITEM-001')).toBe(100);
    });

    test('reset resets version to 0', () => {
      const db = new MasterDB(100);
      db.decrementStock('FLASH-ITEM-001', 10);
      db.reset('FLASH-ITEM-001');
      expect(db.products.get('FLASH-ITEM-001').version).toBe(0);
    });

    test('reset accepts an explicit stock value', () => {
      const db = new MasterDB(100);
      db.reset('FLASH-ITEM-001', 999);
      expect(db.getStock('FLASH-ITEM-001')).toBe(999);
    });

    test('reset can create a new product entry', () => {
      const db = new MasterDB(100);
      db.reset('NEW-PRODUCT', 50);
      expect(db.getStock('NEW-PRODUCT')).toBe(50);
    });
  });

  // ─── onWrite ──────────────────────────────────────────────────────────────

  describe('onWrite', () => {
    test('listener is called after a successful write', () => {
      const db = new MasterDB(100);
      const listener = jest.fn();
      db.onWrite(listener);

      db.decrementStock('FLASH-ITEM-001', 10, 'req-abc');

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'FLASH-ITEM-001',
          remainingStock: 90,
          requestId: 'req-abc',
        })
      );
    });

    test('listener is NOT called when decrement fails', () => {
      const db = new MasterDB(5);
      const listener = jest.fn();
      db.onWrite(listener);

      db.decrementStock('FLASH-ITEM-001', 999); // will fail

      expect(listener).not.toHaveBeenCalled();
    });

    test('multiple listeners all receive the write event', () => {
      const db = new MasterDB(100);
      const l1 = jest.fn();
      const l2 = jest.fn();
      db.onWrite(l1);
      db.onWrite(l2);

      db.decrementStock('FLASH-ITEM-001', 1);

      expect(l1).toHaveBeenCalledTimes(1);
      expect(l2).toHaveBeenCalledTimes(1);
    });

    test('listener receives correct remainingStock across sequential writes', () => {
      const db = new MasterDB(30);
      const received = [];
      db.onWrite(({ remainingStock }) => received.push(remainingStock));

      db.decrementStock('FLASH-ITEM-001', 10);
      db.decrementStock('FLASH-ITEM-001', 10);
      db.decrementStock('FLASH-ITEM-001', 10);

      expect(received).toEqual([20, 10, 0]);
    });
  });
});
