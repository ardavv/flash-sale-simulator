'use strict';

const { v4: uuidv4 } = require('uuid');
const MetricsCollector = require('../metrics/metricsCollector');

/**
 * SequentialRunner merupakan kebalikan dari eksekusi paralel. Runner ini bertugas
 * untuk menguji skenario terburuk (worst-case), di mana sistem menembakkan ribuan
 * permintaan API secara murni sekuensial (satu per satu mengantre).
 * Berguna sebagai baseline perbandingan "Speedup".
 */
class SequentialRunner {
  /**
   * @param {string} gatewayUrl - URL lengkap API gateway (contoh: http://localhost:3000/order)
   * @param {number} totalRequests - Jumlah pesanan yang akan disimulasikan
   * @param {number} timeoutMs - Batas waktu maksimal menunggu tiap respons
   */
  constructor(gatewayUrl, totalRequests, timeoutMs = 10000) {
    this.gatewayUrl = gatewayUrl;
    this.totalRequests = totalRequests;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Mengeksekusi permintaan API satu demi satu.
   * @returns {Promise<Object>} Mengembalikan objek MetricsResult dari pencatat metrik
   */
  async run() {
    const sessionId = uuidv4();
    
    // Inisialisasi kolektor dengan mode 'sequential' dan asumsi 1 buah worker/thread
    const collector = new MetricsCollector(sessionId, 'sequential', 1, this.totalRequests);
    
    // Mulai perekaman waktu kinerja di detik ke 0
    collector.start();

    // Memproses setiap pesanan dari index 0 hingga totalRequests secara ketat (sekuensial)
    for (let i = 0; i < this.totalRequests; i++) {
      const requestId = uuidv4();
      const startTime = Date.now();
      
      let statusCode = null;
      let success = false;

      try {
        const abortController = new AbortController();
        const timeoutHandle = setTimeout(() => {
          abortController.abort();
        }, this.timeoutMs);

        // AWAIT sangat penting di sini. Tidak ada request baru yang dibuat
        // sebelum request lama ini benar-benar dikembalikan oleh Gateway.
        const response = await fetch(this.gatewayUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            productId: 'FLASH-ITEM-001', 
            quantity: 1 
          }),
          signal: abortController.signal
        });

        // Bersihkan timer
        clearTimeout(timeoutHandle);
        statusCode = response.status;
        
        if (statusCode === 200) {
          success = true;
        }

        // Sedot dan buang alur body respons agar Node.js dapat melakukan Garbage Collection 
        // dan menghindari memory leak pada perulangan yang sangat besar
        await response.text();

      } catch (error) {
        // Pemetaan error sama persis dengan yang ada pada worker paralel
        if (error.name === 'AbortError') {
          statusCode = 408; // Representasi Timeout
        } else if (error.cause && error.cause.code === 'ECONNREFUSED') {
          statusCode = 503; // Gateway tak dapat dijangkau
        } else if (error.code === 'ECONNREFUSED') {
          statusCode = 503;
        } else {
          statusCode = 500;
        }
      }

      // Hitung selisih waktu
      const responseTimeMs = Date.now() - startTime;

      // Catat ke dalam Collector
      if (success) {
        collector.recordSuccess(responseTimeMs);
      } else {
        collector.recordFailure(statusCode);
      }
    }

    // Akhiri stopwatch dan retur rincian metrik final
    return collector.finalize();
  }
}

module.exports = SequentialRunner;
