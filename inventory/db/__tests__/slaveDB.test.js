'use strict';

const SlaveDB = require('../slaveDB');

describe('SlaveDB', () => {
  let db;

  beforeEach(() => {
    db = new SlaveDB();
  });

  // -------------------------------------------------------------------------
  // applyReplication
  // -------------------------------------------------------------------------

  describe('applyReplication', () => {
    test('correctly sets stock after replication with a Date timestamp', () => {
      const now = new Date();
      db.applyReplication('ITEM-001', 500, now);

      expect(db.getStock('ITEM-001')).toBe(500);
    });

    test('correctly sets lastUpdated after replication with a Date timestamp', () => {
      const now = new Date();
      db.applyReplication('ITEM-001', 500, now);

      expect(db.getLastUpdated('ITEM-001')).toEqual(now);
    });

    test('accepts ISO string as timestamp and stores it as a Date', () => {
      const iso = '2025-01-15T10:30:00.000Z';
      db.applyReplication('ITEM-002', 300, iso);

      const updated = db.getLastUpdated('ITEM-002');
      expect(updated).toBeInstanceOf(Date);
      expect(updated.toISOString()).toBe(iso);
    });

    test('accepts numeric timestamp (ms) and stores it as a Date', () => {
      const msNow = Date.now();
      db.applyReplication('ITEM-003', 100, msNow);

      const updated = db.getLastUpdated('ITEM-003');
      expect(updated).toBeInstanceOf(Date);
      expect(updated.getTime()).toBe(msNow);
    });

    test('calling applyReplication twice updates to the latest values', () => {
      const first = new Date('2025-01-01T00:00:00.000Z');
      const second = new Date('2025-01-02T00:00:00.000Z');

      db.applyReplication('ITEM-001', 1000, first);
      db.applyReplication('ITEM-001', 750, second);

      expect(db.getStock('ITEM-001')).toBe(750);
      expect(db.getLastUpdated('ITEM-001')).toEqual(second);
    });

    test('supports multiple independent products', () => {
      const t1 = new Date('2025-01-01T00:00:00.000Z');
      const t2 = new Date('2025-01-01T00:00:01.000Z');

      db.applyReplication('ITEM-A', 200, t1);
      db.applyReplication('ITEM-B', 400, t2);

      expect(db.getStock('ITEM-A')).toBe(200);
      expect(db.getStock('ITEM-B')).toBe(400);
      expect(db.getLastUpdated('ITEM-A')).toEqual(t1);
      expect(db.getLastUpdated('ITEM-B')).toEqual(t2);
    });
  });

  // -------------------------------------------------------------------------
  // getStock
  // -------------------------------------------------------------------------

  describe('getStock', () => {
    test('returns 0 for an unknown productId', () => {
      expect(db.getStock('UNKNOWN')).toBe(0);
    });

    test('returns 0 after stock is set to 0 via replication', () => {
      db.applyReplication('ITEM-001', 0, new Date());
      expect(db.getStock('ITEM-001')).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // getLastUpdated
  // -------------------------------------------------------------------------

  describe('getLastUpdated', () => {
    test('returns null for an unknown productId', () => {
      expect(db.getLastUpdated('UNKNOWN')).toBeNull();
    });

    test('returns the Date passed to applyReplication', () => {
      const ts = new Date('2025-06-01T12:00:00.000Z');
      db.applyReplication('ITEM-001', 50, ts);
      expect(db.getLastUpdated('ITEM-001')).toEqual(ts);
    });
  });

  // -------------------------------------------------------------------------
  // getReplicationLag
  // -------------------------------------------------------------------------

  describe('getReplicationLag', () => {
    test('returns null before any replication has occurred', () => {
      expect(db.getReplicationLag()).toBeNull();
    });

    test('returns a non-negative number after at least one replication', () => {
      db.applyReplication('ITEM-001', 100, new Date());
      const lag = db.getReplicationLag();
      expect(typeof lag).toBe('number');
      expect(lag).toBeGreaterThanOrEqual(0);
    });

    test('lag is based on the most recent replication across all products', () => {
      const older = new Date(Date.now() - 5000); // 5 seconds ago
      const recent = new Date();                 // now

      db.applyReplication('ITEM-A', 200, older);
      db.applyReplication('ITEM-B', 100, recent);

      const lag = db.getReplicationLag();
      // The most recent update is "now", so lag should be very small (< 500ms in any sane environment)
      expect(lag).toBeGreaterThanOrEqual(0);
      expect(lag).toBeLessThan(500);
    });

    test('lag grows over time (second call is >= first call)', async () => {
      db.applyReplication('ITEM-001', 100, new Date());
      const lag1 = db.getReplicationLag();

      await new Promise((resolve) => setTimeout(resolve, 20));

      const lag2 = db.getReplicationLag();
      expect(lag2).toBeGreaterThanOrEqual(lag1);
    });
  });
});
