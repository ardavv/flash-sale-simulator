'use strict';

const fc = require('fast-check');
const { performance } = require('perf_hooks');
const MetricsCollector = require('../metricsCollector');

// Melakukan pembajakan (mocking) pada pustaka bawaan Node perf_hooks
// agar fungsi performance.now() bisa dikontrol tanpa ketergantungan pada jam sistem
jest.mock('perf_hooks', () => {
  return {
    performance: {
      now: jest.fn()
    }
  };
});

describe('MetricsCollector - Feature: flash-sale-simulator, Property 7: Kebenaran Kalkulasi Metrik Performa', () => {
  afterEach(() => {
    // Pastikan mock bersih sebelum pengujian lain
    jest.clearAllMocks();
  });

  test('menghitung throughputRps dengan akurat berdasar rumus (waktu > 0ms)', () => {
    return fc.assert(
      fc.property(
        // Generasi selisih waktu eksekusi acak antara 1ms hingga 100000ms
        fc.float({ min: 1, max: 100000 }),
        // Generasi jumlah request sukses
        fc.integer({ min: 0, max: 100000 }),
        (executionTimeMs, successCount) => {
          // Mocking: start() akan mengembalikan 100.0, finalize() mengembalikan 100.0 + delta
          const baseTime = 100.0;
          performance.now.mockReturnValueOnce(baseTime);
          performance.now.mockReturnValueOnce(baseTime + executionTimeMs);

          const collector = new MetricsCollector('sess-1', 'parallel', 10, successCount);
          collector.start();

          // Modifikasi jumlah kesuksesan langsung tanpa perlu looping recordSuccess
          // sekadar untuk menguji kebenaran algoritma fungsi finalize()
          collector.successCount = successCount;

          const result = collector.finalize();

          // Validasi waktu tempuh identik dengan ekspektasi (margin error 5 digit desimal)
          expect(result.executionTimeMs).toBeCloseTo(executionTimeMs, 5);

          // Rumus ekspektasi manual: (sukses / detik)
          const expectedRps = successCount / (executionTimeMs / 1000);
          
          expect(result.throughputRps).toBeCloseTo(expectedRps, 5);
          expect(Number.isFinite(result.throughputRps)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('menghindari nilai Infinity atau NaN ketika waktu eksekusi secepat kilat (0ms)', () => {
    return fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10000 }),
        (successCount) => {
          const baseTime = 555.5;
          // Mocking waktu yang sama (0ms elapsed time)
          performance.now.mockReturnValueOnce(baseTime);
          performance.now.mockReturnValueOnce(baseTime);

          const collector = new MetricsCollector('sess-2', 'sequential', 1, successCount);
          collector.start();
          collector.successCount = successCount;

          const result = collector.finalize();

          // Waktu dipastikan nol
          expect(result.executionTimeMs).toBe(0);

          // Validasi perlindungan fallback (tidak boleh Infinity / NaN)
          expect(result.throughputRps).not.toBe(Infinity);
          expect(result.throughputRps).not.toBeNaN();
          
          // Memastikan ia menggunakan fallback yang sudah kita siapkan
          // (menyamakan throughput dengan successCount)
          expect(result.throughputRps).toBe(successCount);
        }
      )
    );
  });
});
