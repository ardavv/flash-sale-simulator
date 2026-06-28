'use strict';

const { Worker } = require('worker_threads');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const MetricsCollector = require('../metrics/metricsCollector');

/**
 * ParallelRunner bertugas menjalankan simulasi beban dengan mendistribusikan
 * sekumpulan total permintaan (requests) kepada serangkaian Worker Thread
 * secara paralel dan merangkum metrik performanya.
 */
class ParallelRunner {
  /**
   * @param {string} gatewayUrl - URL lengkap endpoint pemesanan (mis. http://localhost:3000/order)
   * @param {number} totalRequests - Jumlah total request yang ingin ditembakkan
   * @param {number} workerCount - Jumlah pasukan Worker Thread yang dikerahkan
   * @param {number} timeoutMs - Batas waktu tunggu (timeout) tiap request
   */
  constructor(gatewayUrl, totalRequests, workerCount, timeoutMs = 10000) {
    this.gatewayUrl = gatewayUrl;
    this.totalRequests = totalRequests;
    this.workerCount = workerCount;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Memulai orkestrasi paralel.
   * @returns {Promise<Object>} Mengembalikan objek MetricsResult
   */
  async run() {
    return new Promise((resolve, reject) => {
      // Menyiapkan pencatat statistik
      const sessionId = uuidv4();
      const collector = new MetricsCollector(sessionId, 'parallel', this.workerCount, this.totalRequests);
      
      // Menghitung pembagian beban pesanan (distribusi adil)
      const baseSize = Math.floor(this.totalRequests / this.workerCount);
      let remainder = this.totalRequests % this.workerCount;

      let workersFinished = 0;
      const workerPath = path.resolve(__dirname, '../worker/requestWorker.js');

      // Mulai mengukur waktu persis sebelum thread disebar
      collector.start();

      // Pengamanan instan jika permintaan bernilai kosong
      if (this.workerCount === 0 || this.totalRequests === 0) {
        return resolve(collector.finalize());
      }

      for (let i = 0; i < this.workerCount; i++) {
        // Alokasikan sisa pembagian (remainder) satu per satu ke worker awal
        const currentWorkerSize = baseSize + (remainder > 0 ? 1 : 0);
        remainder--;
        
        // Buat muatan data (payload) request untuk worker spesifik ini
        const requests = [];
        for (let j = 0; j < currentWorkerSize; j++) {
          requests.push({
            requestId: uuidv4(),
            productId: 'FLASH-ITEM-001',
            quantity: 1 // Default pengambilan satu barang tiap klik
          });
        }

        // Jika worker ini tidak kebagian tugas, langsung catat selesai
        if (requests.length === 0) {
          workersFinished++;
          if (workersFinished === this.workerCount) {
             resolve(collector.finalize());
          }
          continue;
        }

        // Jalankan (Spawn) Worker baru
        const worker = new Worker(workerPath, {
          workerData: {
            gatewayUrl: this.gatewayUrl,
            requests,
            timeoutMs: this.timeoutMs
          }
        });

        // Mendengarkan laporan dari alam worker
        worker.on('message', (msg) => {
          if (msg.type === 'result') {
             // Pencatatan kesuksesan/kegagalan secara real-time
            if (msg.status === 'success') {
              collector.recordSuccess(msg.responseTimeMs);
            } else {
              collector.recordFailure(msg.statusCode);
            }
          } else if (msg.type === 'done') {
            // Worker memberi tahu bahwa tugasnya telah usai.
            // Kita akan melacak rampungnya sistem di event 'exit' agar ke-catch
            // walaupun worker hancur/crash di tengah jalan, namun bisa juga dilacak di sini.
          }
        });

        worker.on('error', (err) => {
          // Tangani jika terjadi crash tak terduga dalam sistem per-worker
          // (misalnya kehabisan RAM thread)
          console.error(`[Worker ${i}] Encountered an error:`, err);
        });

        // Event exit selalu terpanggil di akhir siklus hidup worker, entah dia beres atau hancur
        worker.on('exit', (code) => {
          if (code !== 0) {
            console.error(`[Worker ${i}] Stopped unexpectedly with exit code ${code}`);
          }
          
          workersFinished++;
          
          // Setelah semua pekerja menuntaskan kewajibannya (atau gugur)
          if (workersFinished === this.workerCount) {
            // Hentikan timer dan resolve hasilnya
            resolve(collector.finalize());
          }
        });
      }
    });
  }
}

module.exports = ParallelRunner;
