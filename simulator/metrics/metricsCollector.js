'use strict';

const { performance } = require('perf_hooks');

/**
 * MetricsCollector bertanggung jawab untuk mengagregasi dan menghitung 
 * metrik kinerja (seperti throughput dan execution time) selama simulasi berlangsung.
 */
class MetricsCollector {
  /**
   * @param {string} sessionId - ID unik (UUID) untuk run saat ini
   * @param {string} mode - Mode eksekusi: 'parallel' atau 'sequential'
   * @param {number} workerCount - Jumlah worker (thread) yang dikerahkan
   * @param {number} totalRequests - Target total pemesanan
   */
  constructor(sessionId, mode, workerCount, totalRequests) {
    this.sessionId = sessionId;
    this.mode = mode;
    this.workerCount = workerCount;
    this.totalRequests = totalRequests;
    
    this.successCount = 0;
    this.failCount = 0;
    
    // Opsional: Untuk menghitung waktu respons rata-rata (latency)
    this.totalResponseTimeMs = 0; 
    
    this.startTime = null;
    this.endTime = null;
  }

  /**
   * Memulai pencatatan stopwatch simulasi.
   * Harus dipanggil tepat sebelum request pertama dilontarkan (atau worker di-spawn).
   */
  start() {
    this.startTime = performance.now();
  }

  /**
   * Mencatat satu kejadian request sukses dan durasi tempuhnya.
   * @param {number} responseTimeMs - Waktu tempuh spesifik dari request
   */
  recordSuccess(responseTimeMs) {
    this.successCount++;
    this.totalResponseTimeMs += (responseTimeMs || 0);
  }

  /**
   * Mencatat satu kejadian request gagal.
   * @param {string|number} reason - Kode error atau pesan kegagalan (misal: 408, 503)
   */
  recordFailure(reason) {
    this.failCount++;
    // (Opsional) jika kita ingin membuat peta (Map) dari daftar alasan kegagalan
    // dapat ditambahkan di sini.
  }

  /**
   * Menghentikan stopwatch, mengkalkulasi metrik akhir, dan merangkumnya.
   * @returns {Object} Objek MetricsResult
   */
  finalize() {
    // Catat waktu akhir
    this.endTime = performance.now();
    
    // Kalkulasi Execution Time
    let executionTimeMs = 0;
    if (this.startTime !== null && this.endTime !== null) {
      executionTimeMs = this.endTime - this.startTime;
    }

    // Kalkulasi Throughput (Requests Per Second)
    // Melindungi agar tidak terjadi division by zero jika sistem terlalu cepat (0ms)
    let throughputRps = 0;
    if (executionTimeMs > 0) {
      throughputRps = this.successCount / (executionTimeMs / 1000);
    } else if (this.successCount > 0) {
      // Menghindari hasil tak terhingga (Infinity) jika executionTimeMs = 0
      throughputRps = this.successCount; 
    }

    // Rangkum seluruh data
    return {
      sessionId: this.sessionId,
      mode: this.mode,
      workerCount: this.workerCount,
      totalRequests: this.totalRequests,
      successCount: this.successCount,
      failCount: this.failCount,
      executionTimeMs,
      throughputRps,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = MetricsCollector;
