'use strict';

const MasterDB = require('../../db/masterDB');
const SlaveDB = require('../../db/slaveDB');
const ReplicationManager = require('../replicationManager');

describe('ReplicationManager', () => {
  let masterDB;
  let slaveDB;

  beforeEach(() => {
    masterDB = new MasterDB(new Map([['P1', 100]]));
    slaveDB = new SlaveDB();
  });

  // ─── 1. Immediate replication (delay = 0) ────────────────────────────────

  test('SlaveDB stock is updated synchronously after a MasterDB write (delay = 0)', () => {
    const rm = new ReplicationManager(masterDB, slaveDB, { replicationDelayMs: 0 });
    rm.start();

    masterDB.decrementStock('P1', 10);

    expect(slaveDB.getStock('P1')).toBe(90);

    rm.stop();
  });

  // ─── 2. Delayed replication ───────────────────────────────────────────────

  test('SlaveDB is NOT updated immediately but IS updated after the delay', () => {
    jest.useFakeTimers();

    const rm = new ReplicationManager(masterDB, slaveDB, { replicationDelayMs: 50 });
    rm.start();

    masterDB.decrementStock('P1', 20);

    // Not yet updated — timer hasn't fired
    expect(slaveDB.getStock('P1')).toBe(0);

    // Advance timers by the configured delay
    jest.advanceTimersByTime(50);

    // Now it should be updated
    expect(slaveDB.getStock('P1')).toBe(80);

    rm.stop();
    jest.useRealTimers();
  });

  // ─── 3. stop() prevents further replication ──────────────────────────────

  test('stop() prevents further replication after being called', () => {
    const rm = new ReplicationManager(masterDB, slaveDB, { replicationDelayMs: 0 });
    rm.start();

    // First write — should replicate
    masterDB.decrementStock('P1', 5);
    expect(slaveDB.getStock('P1')).toBe(95);

    // Stop the manager
    rm.stop();

    // Second write — should NOT replicate to SlaveDB
    masterDB.decrementStock('P1', 5);
    expect(slaveDB.getStock('P1')).toBe(95); // still 95, not 90
  });

  // ─── 4. Timestamp is correctly propagated ────────────────────────────────

  test('replicationManager propagates the timestamp from the write event', () => {
    const rm = new ReplicationManager(masterDB, slaveDB, { replicationDelayMs: 0 });
    rm.start();

    const before = Date.now();
    masterDB.decrementStock('P1', 1);
    const after = Date.now();

    const lastUpdated = slaveDB.getLastUpdated('P1');
    expect(lastUpdated).toBeInstanceOf(Date);

    const ts = lastUpdated.getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);

    rm.stop();
  });
});
