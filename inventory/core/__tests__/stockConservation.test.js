'use strict';

// Feature: flash-sale-simulator, Property 2: Konservasi Stok (Stock Conservation Invariant)

const fc = require('fast-check');
const MasterDB = require('../../db/masterDB');

// ─── Property-Based Test ──────────────────────────────────────────────────────

/**
 * Property 2: Konservasi Stok (Stock Conservation Invariant)
 *
 * Validates: Requirements 3.6, 3.7, 3.9
 *
 * For any initialStock and any sequence of decrementStock requests:
 *   masterDB.getStock('FLASH-ITEM-001') + sum(successfulQuantities) === initialStock
 *
 * And the remaining stock must never be negative:
 *   masterDB.getStock('FLASH-ITEM-001') >= 0
 */
describe('Property 2: Konservasi Stok (Stock Conservation Invariant)', () => {
  test('PBT — remaining + sold === initialStock for any (initialStock, requests[]) sequence', () => {
    /**
     * **Validates: Requirements 3.6, 3.7, 3.9**
     */
    fc.assert(
      fc.property(
        // initialStock: integer 1–500
        fc.integer({ min: 1, max: 500 }),
        // requests[]: array of 1–100 items, each with quantity 1–10
        fc.array(
          fc.record({ quantity: fc.integer({ min: 1, max: 10 }) }),
          { minLength: 1, maxLength: 100 }
        ),
        (initialStock, requests) => {
          const db = new MasterDB(initialStock);
          const productId = 'FLASH-ITEM-001';

          // Run all decrementStock calls sequentially and collect results
          const results = requests.map((req) =>
            db.decrementStock(productId, req.quantity)
          );

          // Sum quantities for which decrementStock succeeded
          const sumSuccessfulQuantities = requests.reduce((acc, req, idx) => {
            return results[idx].success ? acc + req.quantity : acc;
          }, 0);

          const remainingStock = db.getStock(productId);

          // Invariant 1 — stock conservation: no units lost or created
          const conserved = remainingStock + sumSuccessfulQuantities === initialStock;

          // Invariant 2 — stock never goes negative
          const nonNegative = remainingStock >= 0;

          return conserved && nonNegative;
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ─── Standard Unit Tests ──────────────────────────────────────────────────────

describe('Konservasi Stok — standard unit tests', () => {
  const PRODUCT = 'FLASH-ITEM-001';

  test('10 requests of qty 50 against initialStock 100: only 2 succeed, remaining = 0, sold = 100', () => {
    const db = new MasterDB(100);
    const results = [];

    for (let i = 0; i < 10; i++) {
      results.push(db.decrementStock(PRODUCT, 50));
    }

    const successCount = results.filter((r) => r.success).length;
    const sumSold = results
      .filter((r) => r.success)
      .reduce((acc, r, idx) => {
        // Map back to quantity via index isn't straightforward after filter;
        // use the fact that each successful decrement reduced stock by 50.
        return acc + 50;
      }, 0);

    expect(successCount).toBe(2);
    expect(db.getStock(PRODUCT)).toBe(0);
    expect(sumSold).toBe(100);
    // Conservation
    expect(db.getStock(PRODUCT) + sumSold).toBe(100);
  });

  test('mixed quantities: conservation holds for a known sequence', () => {
    // initialStock = 20, requests: [qty 7, qty 8, qty 9, qty 3]
    // Pass 1: 20 - 7 = 13 ✓ (success)
    // Pass 2: 13 - 8 = 5  ✓ (success)
    // Pass 3: 5  < 9      ✗ (fail, remainingStock stays 5)
    // Pass 4: 5  - 3 = 2  ✓ (success)
    const initialStock = 20;
    const requests = [
      { quantity: 7 },
      { quantity: 8 },
      { quantity: 9 },
      { quantity: 3 },
    ];
    const db = new MasterDB(initialStock);

    const results = requests.map((req) =>
      db.decrementStock(PRODUCT, req.quantity)
    );

    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
    expect(results[2].success).toBe(false); // insufficient stock
    expect(results[3].success).toBe(true);

    const sumSold = requests.reduce(
      (acc, req, idx) => (results[idx].success ? acc + req.quantity : acc),
      0
    );
    const remaining = db.getStock(PRODUCT);

    // 7 + 8 + 3 = 18 sold, 2 remaining
    expect(sumSold).toBe(18);
    expect(remaining).toBe(2);

    // Conservation invariant
    expect(remaining + sumSold).toBe(initialStock);

    // Non-negative invariant
    expect(remaining).toBeGreaterThanOrEqual(0);
  });

  test('single request that exactly exhausts stock conserves correctly', () => {
    const initialStock = 50;
    const db = new MasterDB(initialStock);

    const result = db.decrementStock(PRODUCT, 50);

    expect(result.success).toBe(true);
    expect(db.getStock(PRODUCT)).toBe(0);
    expect(db.getStock(PRODUCT) + 50).toBe(initialStock);
  });

  test('all requests fail when every quantity exceeds initialStock', () => {
    const initialStock = 5;
    const db = new MasterDB(initialStock);

    const requests = [10, 20, 30].map((q) => ({ quantity: q }));
    const results = requests.map((req) =>
      db.decrementStock(PRODUCT, req.quantity)
    );

    const sumSold = requests.reduce(
      (acc, req, idx) => (results[idx].success ? acc + req.quantity : acc),
      0
    );

    expect(sumSold).toBe(0);
    expect(db.getStock(PRODUCT)).toBe(initialStock);
    expect(db.getStock(PRODUCT) + sumSold).toBe(initialStock);
  });
});
