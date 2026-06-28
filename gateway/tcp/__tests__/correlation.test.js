'use strict';

const fc = require('fast-check');
const RequestCorrelator = require('../requestCorrelator');

describe('RequestCorrelator - Feature: flash-sale-simulator, Property 4: Korelasi Request-Response TCP Tidak Silang', () => {
  let correlator;

  beforeEach(() => {
    correlator = new RequestCorrelator();
  });

  test('mengembalikan respons ke requestId yang identik tanpa tertukar secara asinkron', () => {
    return fc.assert(
      fc.asyncProperty(
        // 1. Bangkitkan kumpulan UUID unik untuk melambangkan requestId
        fc.uniqueArray(fc.uuid(), { minLength: 1, maxLength: 50 }),
        // 2. Bangkitkan array penundaan (delay dalam ms) untuk mengacak urutan eksekusi resolve()
        fc.array(fc.integer({ min: 0, max: 20 }), { minLength: 50, maxLength: 50 }),
        async (requestIds, delays) => {
          // Register semua requestId ke correlator (mensimulasikan request masuk bersamaan)
          const promises = requestIds.map(id => correlator.register(id, 5000));
          
          expect(correlator.getPendingCount()).toBe(requestIds.length);

          // Trigger fungsi resolve() secara asinkron dengan penundaan waktu yang diacak
          requestIds.forEach((id, index) => {
            const delay = delays[index] || 0;
            setTimeout(() => {
              // Memberikan payload respons yang sengaja ditandai dengan ID milik request tersebut
              correlator.resolve(id, { expectedId: id, success: true });
            }, delay);
          });

          // Tunggu hingga seluruh promise diselesaikan oleh pemanggilan setTimeout di atas
          const results = await Promise.all(promises);

          // Asersi: Buktikan setiap hasil berkorespondensi mutlak dengan ID awalnya.
          // Jika ada respons yang menyilang (crossover), asersi ini akan gagal seketika.
          results.forEach((result, index) => {
            expect(result.expectedId).toBe(requestIds[index]);
          });

          // Karena semua sudah di-resolve, pending count harus kembali ke 0
          expect(correlator.getPendingCount()).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('menolak (reject) promise secara otomatis jika batas waktu timeout terlewati', async () => {
    // Membajak (mock) timer internal node.js agar tidak perlu menunggu sungguhan
    jest.useFakeTimers();

    const promise = correlator.register('timeout-test-id', 3000);
    expect(correlator.getPendingCount()).toBe(1);
    
    // Majukan waktu sebesar 3001ms untuk memicu kejadian batas waktu (timeout)
    jest.advanceTimersByTime(3001);
    
    // Promise harus me-reject dengan error ETIMEDOUT
    await expect(promise).rejects.toThrow(/timeout/i);
    expect(correlator.getPendingCount()).toBe(0);

    // Kembalikan fungsionalitas timer ke kondisi normal
    jest.useRealTimers();
  });
});
