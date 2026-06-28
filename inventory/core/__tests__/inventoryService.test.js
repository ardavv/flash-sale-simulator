'use strict';

const MasterDB           = require('../../db/masterDB');
const SlaveDB            = require('../../db/slaveDB');
const { Mutex }          = require('../mutex');
const ReplicationManager = require('../replicationManager');
const InventoryService   = require('../inventoryService');

const PRODUCT = 'FLASH-ITEM-001';

/** Build a fresh set of collaborators for each test. */
function makeService(initialStock = 100) {
  const masterDB = new MasterDB(initialStock);
  const slaveDB  = new SlaveDB();
  const mutex    = new Mutex();
  const replicationManager = new ReplicationManager(masterDB, slaveDB, { replicationDelayMs: 0 });
  replicationManager.start();
  const service  = new InventoryService(masterDB, slaveDB, mutex);
  return { service, masterDB, slaveDB, mutex, replicationManager };
}

// ---------------------------------------------------------------------------
// processOrder — success
// ---------------------------------------------------------------------------

describe('processOrder — success', () => {
  test('decrements stock and returns status:"success" with correct remainingStock', async () => {
    const { service, masterDB } = makeService(10);

    const result = await service.processOrder(PRODUCT, 3, 'req-001');

    expect(result).toEqual({
      requestId:      'req-001',
      status:         'success',
      remainingStock: 7,
    });
    expect(masterDB.getStock(PRODUCT)).toBe(7);
  });

  test('buying exactly the remaining stock succeeds and leaves 0', async () => {
    const { service, masterDB } = makeService(5);

    const result = await service.processOrder(PRODUCT, 5, 'req-exact');

    expect(result.status).toBe('success');
    expect(result.remainingStock).toBe(0);
    expect(masterDB.getStock(PRODUCT)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// processOrder — failure (insufficient stock)
// ---------------------------------------------------------------------------

describe('processOrder — insufficient stock', () => {
  test('returns status:"failed" with reason:"insufficient_stock" when quantity > stock', async () => {
    const { service, masterDB } = makeService(2);

    const result = await service.processOrder(PRODUCT, 5, 'req-fail');

    expect(result).toEqual({
      requestId:      'req-fail',
      status:         'failed',
      remainingStock: 2,
      reason:         'insufficient_stock',
    });
    // Stock must not have changed
    expect(masterDB.getStock(PRODUCT)).toBe(2);
  });

  test('stock is unchanged after a failed order', async () => {
    const { service, masterDB } = makeService(0);

    await service.processOrder(PRODUCT, 1, 'req-zero');

    expect(masterDB.getStock(PRODUCT)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// processOrder — mutex released on exception
// ---------------------------------------------------------------------------

describe('processOrder — mutex released on exception', () => {
  test('mutex is unlocked even when decrementStock throws', async () => {
    const masterDB = new MasterDB(10);
    const slaveDB  = new SlaveDB();
    const mutex    = new Mutex();

    // Make decrementStock throw
    masterDB.decrementStock = () => { throw new Error('Simulated DB error'); };

    const service = new InventoryService(masterDB, slaveDB, mutex);

    await expect(service.processOrder(PRODUCT, 1, 'req-throw')).rejects.toThrow('Simulated DB error');

    // Mutex must be free so a subsequent acquire can succeed
    expect(mutex.isLocked()).toBe(false);

    // Confirm another order can proceed normally
    const goodMaster = new MasterDB(10);
    const goodService = new InventoryService(goodMaster, slaveDB, mutex);
    const result = await goodService.processOrder(PRODUCT, 1, 'req-after-throw');
    expect(result.status).toBe('success');
  });
});

// ---------------------------------------------------------------------------
// getStatus
// ---------------------------------------------------------------------------

describe('getStatus', () => {
  test('returns correct masterStock, slaveStock, isSynced=true when in sync', async () => {
    const { service } = makeService(50);

    // Do one order so replication fires (slaveDB gets updated)
    await service.processOrder(PRODUCT, 10, 'req-sync');

    const status = service.getStatus(PRODUCT);

    expect(status.masterStock).toBe(40);
    expect(status.slaveStock).toBe(40);
    expect(status.isSynced).toBe(true);
    expect(status.mutexQueueLength).toBe(0);
    expect(typeof status.slaveLastUpdated).toBe('string'); // ISO string
    expect(status.replicationLag).toBeGreaterThanOrEqual(0);
  });

  test('isSynced=false when master and slave differ (no ReplicationManager)', async () => {
    const masterDB = new MasterDB(50);
    const slaveDB  = new SlaveDB();
    const mutex    = new Mutex();
    // Deliberately do NOT start a ReplicationManager
    const service  = new InventoryService(masterDB, slaveDB, mutex);

    await service.processOrder(PRODUCT, 5, 'req-no-repl');

    const status = service.getStatus(PRODUCT);

    expect(status.masterStock).toBe(45);
    expect(status.slaveStock).toBe(0);   // never replicated
    expect(status.isSynced).toBe(false);
  });

  test('slaveLastUpdated is null and replicationLag is null before any replication', () => {
    const { service } = makeService(10);
    // No orders issued, SlaveDB has no entries
    const status = service.getStatus(PRODUCT);

    expect(status.slaveLastUpdated).toBeNull();
    expect(status.replicationLag).toBeNull();
  });

  test('mutexQueueLength reflects waiting acquirers', async () => {
    const { service, mutex } = makeService(100);

    // Hold the mutex manually
    const release = await mutex.acquire();
    // Queue two processOrder calls (they will block on mutex)
    const p1 = service.processOrder(PRODUCT, 1, 'r1');
    const p2 = service.processOrder(PRODUCT, 1, 'r2');

    expect(service.getStatus(PRODUCT).mutexQueueLength).toBe(2);

    release();
    await Promise.all([p1, p2]);
    expect(service.getStatus(PRODUCT).mutexQueueLength).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// reset
// ---------------------------------------------------------------------------

describe('reset', () => {
  test('restores stock to initial value so subsequent processOrder succeeds', async () => {
    const { service, masterDB } = makeService(5);

    // Drain stock
    for (let i = 0; i < 5; i++) {
      await service.processOrder(PRODUCT, 1, `req-drain-${i}`);
    }
    expect(masterDB.getStock(PRODUCT)).toBe(0);

    // Reset
    await service.reset(PRODUCT);
    expect(masterDB.getStock(PRODUCT)).toBe(5);

    // Now an order should succeed again
    const result = await service.processOrder(PRODUCT, 1, 'req-after-reset');
    expect(result.status).toBe('success');
    expect(result.remainingStock).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// concurrent processOrders
// ---------------------------------------------------------------------------

describe('concurrent processOrders', () => {
  test('100 concurrent orders on stock of 50 → exactly 50 succeed, stock never negative', async () => {
    const { service, masterDB } = makeService(50);

    // Fire 100 concurrent orders of quantity=1
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        service.processOrder(PRODUCT, 1, `concurrent-${i}`)
      )
    );

    const successes = results.filter(r => r.status === 'success');
    const failures  = results.filter(r => r.status === 'failed');

    expect(successes).toHaveLength(50);
    expect(failures).toHaveLength(50);

    // Stock is exactly 0 — never went negative
    expect(masterDB.getStock(PRODUCT)).toBe(0);

    // All remainingStock values reported by failures must be >= 0
    failures.forEach(r => expect(r.remainingStock).toBeGreaterThanOrEqual(0));
  });
});
