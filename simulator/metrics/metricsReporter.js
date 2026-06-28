'use strict';

const fs = require('fs');
const path = require('path');

/**
 * MetricsReporter bertugas untuk mengambil hasil komputasi dari MetricsCollector
 * dan mempresentasikannya kepada pengguna melalui layar terminal 
 * serta menyimpannya dalam dokumen arsip JSON permanen.
 */
class MetricsReporter {
  /**
   * Menghasilkan laporan dari objek hasil metrik
   * @param {Object} metricsResult - Objek kembalian dari MetricsCollector.finalize()
   */
  static report(metricsResult) {
    // 1. Tampilkan Visualisasi Rapi ke Terminal menggunakan console.table
    console.log('\n=============================================');
    console.log('           LAPORAN METRIK SIMULASI           ');
    console.log('=============================================');
    
    // Buat format tabel yang lebih manusiawi agar mudah dibaca
    const tableData = {
      'Mode Eksekusi': metricsResult.mode.toUpperCase(),
      'Total Pesanan': metricsResult.totalRequests,
      'Jumlah Worker': metricsResult.workerCount,
      'Transaksi Sukses': metricsResult.successCount,
      'Transaksi Gagal': metricsResult.failCount,
      'Waktu Eksekusi (ms)': Number(metricsResult.executionTimeMs).toFixed(3),
      'Throughput (RPS)': Number(metricsResult.throughputRps).toFixed(3)
    };
    
    console.table(tableData);
    console.log('=============================================\n');

    // 2. Persiapkan Penyimpanan Arsip Permanen (Log Files)
    // __dirname merujuk ke /simulator/metrics, jadi kita naik 1 level ke /simulator lalu masuk ke /results
    const resultsDir = path.resolve(__dirname, '../results');
    
    // Syarat wajib: buat folder secara otomatis beserta seluruh rantai induknya jika belum eksis
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    // 3. Bangun format nama dokumen JSON spesifik
    const timestampMs = Date.now();
    const fileName = `result-${metricsResult.mode}-${timestampMs}.json`;
    const filePath = path.join(resultsDir, fileName);

    // Tulis objek utuh ke fail dalam bentuk JSON rapi (indentasi 2 spasi)
    fs.writeFileSync(filePath, JSON.stringify(metricsResult, null, 2), 'utf-8');
    
    console.log(`[INFO] Rekam jejak simulasi ini berhasil diarsipkan di:`);
    console.log(`       -> ${filePath}\n`);
    
    return filePath;
  }
}

module.exports = MetricsReporter;
