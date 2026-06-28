'use strict';

// Feature: flash-sale-simulator, Property 1: Stok Tidak Pernah Negatif (Anti-Overselling)

/**
 * Validates: Requirements 3.4, 3.5, 3.6, 3.7, 3.9
 *
 * Property 1 — Stok Tidak Pernah Negatif (Anti-Overselling)
 *
 * For any initial stock value and any number of concurrent decrement requests
 * (including cases where total quantity exceeds initial stock), the stock in
 * MasterDB must never go below zero after all operations complete.
 *
 * Node.js is single-threaded: even though Promise.all schedules all
 * decrementStock calls "concurrently" as microtasks, each synchronous
 * decrementStock call runs to completion before the next one starts.
 * This means the built-in stock check (currentStock < quantity → reject)
 * is sufficient to prevent overselling without an external mutex.
 *
 * The property test also verifies Stock Conservation:
 *   finalStock + sum(successfulQuantities) === initialStock
 */

const fc = require('fast-check');
const MasterDB = require('../../db/masterDB');

const PRODUCT_ID = 'FLASH-ITEM-001';

// ─── Helper ──────────────────────────────────────────────────────────────────

/**
 * Runs all decrement operations "concurrently" by wrapping each in
 * Promise.resolve() so they are scheduled as microtasks, then awaits all.
 *
 * @param {MasterDB} masterDB
 * @param {Array<{quantity: number}>} requests
 * @returns {Promise<Array<{success: boolean, remainingStock: number}>>}
 */
async function runConcurrent(masterDB, requests) {
  return Promise.all(
    requests.map(({ quantity }) =>
      Promise.resolve(masterDB.decrementStock(PRODUCT_ID, quantity))
    )
  );
}

// ─── Property-Based Tests ────────────────────────────────────────────────────

describe('Property 1 — Stok Tidak Pernah Negatif (Anti-Overselling)', () => {
  /**
   * **Validates: Requirements 3.4, 3.5, 3.6, 3.7, 3.9**
   *
   * For any initialStock (1–1000) and any array of 5–50 requests (each
   * quantity 1–20), after running all decrements concurrently:
   *   1. finalStock >= 0 always holds
   *   2. finalStock + sum(successfulQuantities) === initialStock (conservation)
   */
  test('stok tidak pernah negatif dan konservasi stok terpenuhi', async () => {
    await fc.assert(
      fc.asyncProperty(
        // initialStock: integer 1–1000
        fc.integer({ min: 1, max: 1000 }),
        // requests: 5–50 items, each quantity 1–20
        // Total quantity is intentionally unrestricted so it can exceed initialStock
        fc.array(
          fc.record({ quantity: fc.integer({ min: 1, max: 20 }) }),
          { minLength: 5, maxLength: 50 }
        ),
        async (initialStock, requests) => {
          const masterDB = new MasterDB(initialStock);

          const results = await runConcurrent(masterDB, requests);

          const finalStock = masterDB.getStock(PRODUCT_ID);

          // Property 1a: Stock never goes negative
          expect(finalStock).toBeGreaterThanOrEqual(0);

          // Property 1b: Conservation invariant
          // finalStock + sum(successfulQuantities) === initialStock
          // Pair each result with its original request quantity to sum sold units.
          const successfulQty = results.reduce((sum, result, idx) => {
            return result.success ? sum + requests[idx].quantity : sum;
          }, 0);

          expect(finalStock + successfulQty).toBe(initialStock);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Concrete Edge-Case Tests ─────────────────────────────────────────────────

describe('MasterDB — Concrete edge cases (anti-overselling)', () => {
  test('1000 concurrent requests of qty 1, stock 500 → remaining exactly 0, sold exactly 500', async () => {
    const initialStock = 500;
    const masterDB = new MasterDB(initialStock);

    const requests = Array.from({ length: 1000 }, () => ({ quantity: 1 }));
    const results = await runConcurrent(masterDB, requests);

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;
    const finalStock = masterDB.getStock(PRODUCT_ID);

    // Exactly 500 requests should succeed (one per unit of stock)
    expect(successCount).toBe(500);
    expect(failCount).toBe(500);

    // Stock is exactly drained to 0
    expect(finalStock).toBe(0);

    // Conservation: stock consumed = initial stock
    expect(successCount * 1 + finalStock).toBe(initialStock);
  });

  test('all requests with quantity > initialStock → all fail, stock unchanged', async () => {
    const initialStock = 10;
    const masterDB = new MasterDB(initialStock);

    // Every request wants more than the total stock — all must fail
    const requests = Array.from({ length: 20 }, () => ({ quantity: 11 }));
    const results = await runConcurrent(masterDB, requests);

    const successCount = results.filter((r) => r.success).length;
    const finalStock = masterDB.getStock(PRODUCT_ID);

    expect(successCount).toBe(0);
    expect(finalStock).toBe(initialStock); // completely unchanged
  });

  test('single request exactly equal to stock → succeeds, stock reaches 0', async () => {
    const masterDB = new MasterDB(50);
    const results = await runConcurrent(masterDB, [{ quantity: 50 }]);

    expect(results[0].success).toBe(true);
    expect(masterDB.getStock(PRODUCT_ID)).toBe(0);
  });

  test('stock is never negative even when total demand far exceeds stock', async () => {
    const initialStock = 100;
    const masterDB = new MasterDB(initialStock);

    // 200 requests of qty 2 → total demand = 400, far above 100
    const requests = Array.from({ length: 200 }, () => ({ quantity: 2 }));
    await runConcurrent(masterDB, requests);

    expect(masterDB.getStock(PRODUCT_ID)).toBeGreaterThanOrEqual(0);
  });
});
