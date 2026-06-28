'use strict';

const { parentPort, workerData } = require('worker_threads');

// Pastikan skrip ini benar-benar berjalan di dalam konteks worker thread
if (!parentPort) {
  console.error('Skrip ini hanya boleh dijalankan sebagai worker thread.');
  process.exit(1);
}

const { gatewayUrl, requests, timeoutMs = 10000 } = workerData;

/**
 * Fungsi utama untuk memproses sekumpulan array permintaan (requests)
 * secara bertahap dalam thread ini.
 */
async function runRequests() {
  let successCount = 0;
  let failCount = 0;

  for (const reqObj of requests) {
    const { requestId, productId, quantity } = reqObj;
    const startTime = Date.now();
    
    let requestStatus = 'failed';
    let statusCode = null;

    try {
      // Menyiapkan pengendali timeout menggunakan AbortController bawaan Node/Web API
      const abortController = new AbortController();
      const timeoutHandle = setTimeout(() => {
        abortController.abort();
      }, timeoutMs);

      // Menggunakan fetch bawaan (tersedia mulai dari Node 18)
      const response = await fetch(gatewayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, quantity }),
        signal: abortController.signal
      });

      // Bersihkan timer karena request selesai sebelum batas waktu habis
      clearTimeout(timeoutHandle);
      
      statusCode = response.status;
      
      // Jika status code sukses (biasanya 200 dari Gateway)
      if (statusCode === 200) {
        requestStatus = 'success';
        successCount++;
      } else {
        requestStatus = 'failed';
        failCount++;
      }
      
      // Membuang isi respons agar memori tidak bocor (mencegah memory leak)
      await response.text(); 
      
    } catch (error) {
      failCount++;
      
      // Penanganan error jaringan (Timeout atau ECONNREFUSED)
      if (error.name === 'AbortError') {
        // Melambangkan Timeout
        statusCode = 408; 
      } else if (error.cause && error.cause.code === 'ECONNREFUSED') {
        // Melambangkan Gateway tidak bisa dihubungi
        statusCode = 503; 
      } else if (error.code === 'ECONNREFUSED') {
         statusCode = 503;
      } else {
        // Kegagalan internal lainnya
        statusCode = 500; 
      }
    }

    const responseTimeMs = Date.now() - startTime;

    // Kirim pesan pelaporan secara individual per request ke Main Thread (runner)
    parentPort.postMessage({
      type: 'result',
      requestId,
      status: requestStatus,
      responseTimeMs,
      statusCode
    });
  }

  // Kirim laporan rekapitulasi saat semua request di worker ini usai
  parentPort.postMessage({
    type: 'done',
    successCount,
    failCount
  });
}

// Mulai eksekusi
runRequests().catch(err => {
  // Tangkap error jika loop meledak di luar ekspektasi
  parentPort.postMessage({
    type: 'done',
    successCount: 0,
    failCount: requests.length // Anggap seluruhnya gagal
  });
});
