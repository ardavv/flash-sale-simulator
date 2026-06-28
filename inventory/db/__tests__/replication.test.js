'use strict';

// Feature: flash-sale-simulator, Property 3: Konvergensi Replikasi Slave ke Master

const fc = require('fast-check');
const MasterDB = require('../masterDB');
const SlaveDB = require('../../db/slaveDB');
const ReplicationManager = require('../../core/replicationManager');

const PRODUCT_ID = 'FLASH-ITEM-001';

// Helper: sleep for a given number of ms
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─────────────────────────────────────────────────────────────────────────────
// Property-Based Test
// ─────────────────────────────────────────────────────────────────────────────

/**
 * **Validates: Requirements 4.1, 4.2, 4.4**
 *
 * Property 3 — Konvergensi Replikasi Slave ke Master
 *
 * For any sequence of write operations against the MasterDB, after a 100 ms
 * wait the SlaveDB MUST converge to the same stock value as MasterDB (eventual
 * consistency with a bounded delay).
 *
 * Timeout is set to 30 000 ms because 100 runs × ~100 ms sleep ≈ 10+ seconds.
 */
describe('ReplicationManager — Property 3: Slave Converges to Master (fast-check)', () => {
  test(
    'slave converges to master after any sequence of write operations',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // initialStock: integer in [10, 500]
          fc.integer({ min: 10, max: 500 }),
          // writeOps: 1–20 operations, each decrementing by 1–5 units
          fc.array(
            fc.record({ quantity: fc.integer({ min: 1, max: 5 }) }),
            { minLength: 1, maxLength: 20 }
          ),
          async (initialStock, writeOps) => {
            // --- Setup ---
            const masterDB = new MasterDB(initialStock);
            const slaveDB = new SlaveDB();
            const replicationManager = new ReplicationManager(masterDB, slaveDB, {
              replicationDelayMs: 0,
            });

            replicationManager.start();

            // --- Run all write ops sequentially ---
            let successfulWrites = 0;
            for (const op of writeOps) {
              const result = masterDB.decrementStock(PRODUCT_ID, op.quantity);
              if (result.success) {
                successfulWrites += 1;
              }
            }

            // --- 100 ms sleep (bounded convergence window per Req 4.4) ---
            await sleep(100);

            // --- Assertion 1: slave stock equals master stock ---
            const masterStock = masterDB.getStock(PRODUCT_ID);
            const slaveStock = slaveDB.getStock(PRODUCT_ID);

            if (slaveStock !== masterStock) {
              return false;
            }

            // --- Assertion 2: lastUpdated is not null if any writes succeeded ---
            if (successfulWrites > 0) {
              const lastUpdated = slaveDB.getLastUpdated(PRODUCT_ID);
              if (lastUpdated === null) {
                return false;
              }
            }

            replicationManager.stop();
            return true;
          }
        ),
        { numRuns: 100 }
      );
    },
    30000 // 30 s timeout — 100 runs × ~100 ms each
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Standard Unit Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('ReplicationManager — unit tests', () => {
  test('after 1 successful write + 100ms, slave equals master', async () => {
    const masterDB = new MasterDB(100);
    const slaveDB = new SlaveDB();
    const replicationManager = new ReplicationManager(masterDB, slaveDB, {
      replicationDelayMs: 0,
    });

    replicationManager.start();
    masterDB.decrementStock(PRODUCT_ID, 10);

    await sleep(100);

    expect(slaveDB.getStock(PRODUCT_ID)).toBe(masterDB.getStock(PRODUCT_ID));
    expect(slaveDB.getLastUpdated(PRODUCT_ID)).not.toBeNull();

    replicationManager.stop();
  });

  test('after 0 successful writes (all fail), no replication event is sent to slave', async () => {
    // initialStock of 5, try to decrement by 100 — this will fail
    const masterDB = new MasterDB(5);
    const slaveDB = new SlaveDB();
    const replicationManager = new ReplicationManager(masterDB, slaveDB, {
      replicationDelayMs: 0,
    });

    replicationManager.start();
    const result = masterDB.decrementStock(PRODUCT_ID, 100); // fails
    expect(result.success).toBe(false);

    await sleep(100);

    // No replication event was emitted; slave stays at its uninitialised default.
    expect(slaveDB.getLastUpdated(PRODUCT_ID)).toBeNull();
    // slave returns 0 (default), master unchanged at 5 — no write was replicated
    expect(slaveDB.getStock(PRODUCT_ID)).toBe(0);
    expect(masterDB.getStock(PRODUCT_ID)).toBe(5);

    replicationManager.stop();
  });

  test('ReplicationManager with replicationDelayMs=50: slave converges within 100ms', async () => {
    const masterDB = new MasterDB(200);
    const slaveDB = new SlaveDB();
    const replicationManager = new ReplicationManager(masterDB, slaveDB, {
      replicationDelayMs: 50,
    });

    replicationManager.start();
    masterDB.decrementStock(PRODUCT_ID, 25);

    // After full 100ms — slave must have converged (50ms delay < 100ms window)
    await sleep(100);

    expect(slaveDB.getStock(PRODUCT_ID)).toBe(masterDB.getStock(PRODUCT_ID));
    expect(slaveDB.getLastUpdated(PRODUCT_ID)).not.toBeNull();

    replicationManager.stop();
  });
});
