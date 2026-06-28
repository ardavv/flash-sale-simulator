'use strict';

const SequentialRunner = require('./runner/sequentialRunner');
const ParallelRunner = require('./runner/parallelRunner');
const MetricsReporter = require('./metrics/metricsReporter');

/**
 * Entry point utama (CLI) untuk menjalankan skenario Flash Sale Simulator.
 * Menguraikan perintah baris argumen dan mendalangi eksekusi pelari-pelarinya.
 */
async function bootstrap() {
  // Nilai Argumen Default (Fallback)
  let mode = null;
  let requests = 100;
  let workers = 4;

  // 1. Parsing argumen baris perintah murni (process.argv) tanpa dependensi tambahan
  process.argv.forEach(arg => {
    if (arg.startsWith('--mode=')) {
      mode = arg.split('=')[1].toLowerCase();
    } else if (arg.startsWith('--requests=')) {
      requests = parseInt(arg.split('=')[1], 10) || 100;
    } else if (arg.startsWith('--workers=')) {
      workers = parseInt(arg.split('=')[1], 10) || 4;
    }
  });

  // Validasi keamanan: mode wajib ada dan hanya boleh dua varian ini
  if (!mode || (mode !== 'sequential' && mode !== 'parallel')) {
    console.error('Error: Argumen --mode wajib diisi dengan nilai yang valid.');
    console.error('Penggunaan yang benar: node simulator/index.js --mode=<sequential|parallel> [--requests=100] [--workers=4]');
    process.exit(1);
  }

  // Gateway URL dapat diganti dinamis lewat variabel sistem, atau turun ke fallback hardcode
  const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000/order';

  console.log(`\n=============================================`);
  console.log(`🚀 INISIALISASI FLASH SALE SIMULATOR CLI 🚀`);
  console.log(`=============================================`);
  console.log(`-> Target Gateway : ${gatewayUrl}`);
  console.log(`-> Mode Operasi   : ${mode.toUpperCase()}`);
  console.log(`-> Kapasitas Beban: ${requests} Pesanan`);
  if (mode === 'parallel') {
    console.log(`-> Amunisi Thread : ${workers} Worker(s)`);
  }
  console.log(`=============================================\n`);

  // 2. Terapkan logika pencabangan Pola Strategi (Strategy Pattern)
  let runner;
  if (mode === 'parallel') {
    runner = new ParallelRunner(gatewayUrl, requests, workers);
  } else {
    // Mode Sequential secara inheren mengabaikan angka argumen workers
    runner = new SequentialRunner(gatewayUrl, requests);
  }

  console.log(`Mengeksekusi gelombang serangan pesanan secara ${mode.toUpperCase()}... Harap tunggu.\n`);
  
  // 3. Eksekusi fungsi mesin utama dan tangkap data mentahnya
  const metricsResult = await runner.run();
  
  // 4. Teruskan rekam jejak tersebut ke sang Jurnalis Data (Metrics Reporter)
  MetricsReporter.report(metricsResult);
}

// 5. Panggil fungsi utama dengan penjagaan global mutlak dari crash yang terselip
bootstrap().catch(err => {
  console.error('\n[FATAL ERROR] Kegagalan luar biasa terjadi pada simulasi:');
  console.error(err.message);
  console.error(err.stack);
  // Kode "1" melambangkan abnormal/fatal exit kepada sistem operasi Host
  process.exit(1);
});
