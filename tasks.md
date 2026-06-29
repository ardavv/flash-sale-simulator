# Implementation Plan: Flash Sale E-Commerce Simulator

## Overview

Rencana implementasi ini membangun sistem terdistribusi Flash Sale Simulator secara bertahap, mulai dari infrastruktur bersama, lalu setiap komponen secara independen, hingga integrasi akhir. Setiap tugas membangun di atas tugas sebelumnya agar tidak ada kode yang "menggantung" tanpa terintegrasi.

---

## Tasks

- [x] 1. Setup struktur proyek dan konfigurasi dasar
  - Buat direktori `simulator/`, `gateway/`, `inventory/`, `dashboard/` beserta subfolder sesuai desain
  - Buat file `package.json` di root dan setiap komponen dengan dependensi: `express`, `uuid`, dan dev dependencies `jest`, `fast-check`
  - Buat file `config.js` di `simulator/`, `gateway/`, dan `inventory/` dengan nilai default (port Gateway = 3000, port Inventory = 4000, stok awal = 1000, workerCount = 50, totalRequests = 5000)
  - Buat `utils/logger.js` di `gateway/` dan `inventory/` dengan format `[ISO_TIMESTAMP] [LEVEL] [COMPONENT] MESSAGE {context_json}`
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 2. Implementasi Inventory Coordinator — Layer Database
  - [x] 2.1 Implementasi `MasterDB` (`inventory/db/masterDB.js`)
    - Implementasikan class `MasterDB` dengan konstruktor `(initialStock)`, `getStock(productId)`, `decrementStock(productId, quantity)`, `reset(productId, stock)`, dan `onWrite(listener)` via `EventEmitter`
    - `decrementStock` harus mengembalikan `{ success, remainingStock }` dan tidak boleh membuat stok negatif
    - _Requirements: 3.6, 3.9, 4.1_

  - [x]* 2.2 Tulis property test untuk MasterDB — Stok Tidak Pernah Negatif
    - **Property 1: Stok Tidak Pernah Negatif (Anti-Overselling)**
    - Generate N concurrent requests secara acak dengan total quantity melebihi stok, jalankan dengan `Promise.all`, assert `stock >= 0` selalu terpenuhi
    - **Validates: Requirements 3.4, 3.5, 3.6, 3.7, 3.9**
    - File: `inventory/core/__tests__/stockSafety.test.js`

  - [x]* 2.3 Tulis property test untuk MasterDB — Konservasi Stok
    - **Property 2: Konservasi Stok (Stock Conservation Invariant)**
    - Generate `(initialStock, requests[])` secara acak, jalankan semua, assert `remainingStock + sum(successfulQuantities) = initialStock`
    - **Validates: Requirements 3.6, 3.7, 3.9**
    - File: `inventory/core/__tests__/stockConservation.test.js`

  - [x] 2.4 Implementasi `SlaveDB` (`inventory/db/slaveDB.js`)
    - Implementasikan class `SlaveDB` dengan `applyReplication(productId, stock, timestamp)`, `getStock(productId)`, `getLastUpdated(productId)`, dan `getReplicationLag()`
    - SlaveDB hanya boleh diupdate melalui `applyReplication`; tidak ada write langsung dari luar
    - _Requirements: 4.2, 4.3, 4.6_

  - [x] 2.5 Implementasi `ReplicationManager` (`inventory/core/replicationManager.js`)
    - Subscribe ke event `onWrite` dari MasterDB, lalu panggil `slaveDB.applyReplication(...)` dengan delay simulasi (opsional, default 0ms agar memenuhi batas < 100ms)
    - _Requirements: 4.1, 4.2, 4.4_

  - [x]* 2.6 Tulis property test untuk ReplicationManager — Konvergensi Replikasi
    - **Property 3: Konvergensi Replikasi Slave ke Master**
    - Generate write ops secara acak, `await sleep(100)`, assert `slaveDB.getStock() === masterDB.getStock()` untuk semua productId
    - **Validates: Requirements 4.1, 4.2, 4.4**
    - File: `inventory/db/__tests__/replication.test.js`

- [x] 3. Implementasi Inventory Coordinator — Mutex dan Business Logic
  - [x] 3.1 Implementasi `Mutex` (`inventory/core/mutex.js`)
    - Implementasikan class `Mutex` dengan `acquire()` (mengembalikan fungsi `release`), `isLocked()`, dan `queueLength()` menggunakan pola async Promise chain
    - Tambahkan force-release otomatis jika mutex tidak dilepas dalam `mutexTimeoutMs` (default 5000ms), log `[CRITICAL] Mutex force-released`
    - _Requirements: 3.4, 3.5, 9.4_

  - [x] 3.2 Implementasi `InventoryService` (`inventory/core/inventoryService.js`)
    - Implementasikan `processOrder(productId, quantity, requestId)` yang mengakuisisi mutex, baca stok, kurangi jika cukup, lepas mutex, trigger replikasi
    - Implementasikan `getStatus()` yang mengembalikan `{ masterStock, slaveStock, slaveLastUpdated, isSynced, mutexQueueLength }`
    - Implementasikan `reset(productId)` untuk reset stok ke nilai awal tanpa restart
    - _Requirements: 3.4, 3.5, 3.6, 3.7, 3.8, 4.5, 7.5_

- [~] 4. Checkpoint — Inventory Core
  - Pastikan semua unit test untuk `MasterDB`, `SlaveDB`, `Mutex`, dan `InventoryService` lolos. Tanya kepada user jika ada pertanyaan.

- [x] 5. Implementasi Inventory Coordinator — TCP Server
  - [x] 5.1 Implementasi `TcpServer` (`inventory/server/tcpServer.js`)
    - Terima koneksi TCP, buffer stream, pisahkan pesan berdasarkan karakter `\n`, parse JSON
    - Handle fragmented messages (gabungkan buffer hingga `\n` ditemukan)
    - Jika pesan bukan JSON valid, kirim `{ requestId: null, status: "error", reason: "invalid_json" }` tanpa crash
    - Ketika koneksi terputus, bersihkan resource terkait koneksi tersebut
    - _Requirements: 3.2, 3.3, 8.2, 8.4, 9.3_

  - [x]* 5.2 Tulis property test untuk TcpServer — Round-Trip Parsing TCP
    - **Property 6: Round-Trip Parsing Pesan TCP**
    - Generate arbitrary JSON objects, serialize + `\n`, split menjadi fragmen acak, gabungkan, parse, assert hasil identik dengan objek asli
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
    - File: `inventory/server/__tests__/tcpParser.test.js`

  - [x] 5.3 Implementasi entry point Inventory Coordinator (`inventory/index.js`)
    - Inisialisasi `MasterDB`, `SlaveDB`, `ReplicationManager`, `Mutex`, `InventoryService`, dan `TcpServer`
    - Inject dependencies ke `InventoryService`
    - Handle pesan TCP tipe `order`, `status`, `reset`, dan `init` dengan memanggil metode yang sesuai di `InventoryService`
    - Register `process.on('uncaughtException', ...)` untuk logging tanpa crash
    - _Requirements: 3.1, 3.10, 7.2, 9.2, 9.5_

- [x] 6. Implementasi Order Gateway — TCP Client dan Request Correlator
  - [x] 6.1 Implementasi `RequestCorrelator` (`gateway/tcp/requestCorrelator.js`)
    - Implementasikan `register(requestId, timeoutMs)` yang mengembalikan `Promise<tcpResponse>`
    - Implementasikan `resolve(requestId, data)` yang me-resolve promise yang sesuai
    - Implementasikan `getPendingCount()` untuk monitoring
    - Jika timeout terlewati, reject promise dengan error timeout
    - _Requirements: 2.7, 8.5_

  - [x]* 6.2 Tulis property test untuk RequestCorrelator — Korelasi Request-Response TCP
    - **Property 4: Korelasi Request-Response TCP Tidak Silang**
    - Generate batch UUID messages secara acak, resolve dengan data yang sesuai, assert setiap response.requestId === sent requestId
    - **Validates: Requirements 8.5**
    - File: `gateway/tcp/__tests__/correlation.test.js`

  - [x] 6.3 Implementasi `TcpClient` (`gateway/tcp/tcpClient.js`)
    - Implementasikan koneksi TCP persisten dengan `connect()`, `send(messageObj)`, `isConnected()`, `onDisconnect(callback)`, dan `destroy()`
    - Auto-reconnect dengan interval 1 detik, maksimal 5 kali percobaan
    - Setiap `send` menghasilkan pesan JSON diakhiri `\n`; parse respons berdasarkan `\n` delimiter
    - _Requirements: 2.8, 2.9, 2.10_

- [x] 7. Implementasi Order Gateway — HTTP Server dan Validasi
  - [x] 7.1 Implementasi `validatePayload` middleware (`gateway/middleware/validatePayload.js`)
    - Validasi `productId` adalah string non-kosong → 400 jika tidak
    - Validasi `quantity` adalah integer positif (> 0, bukan float) → 400 jika tidak
    - Jika valid, lanjutkan ke `next()`
    - _Requirements: 2.2, 2.3, 2.4_

  - [x]* 7.2 Tulis property test untuk validatePayload — Validasi Payload Komprehensif
    - **Property 5: Validasi Payload Komprehensif**
    - Generate arbitrary `{ productId, quantity }` termasuk invalid values (empty string, negative, float, null, dll.), assert HTTP 400 untuk invalid dan lanjut ke next() untuk valid
    - **Validates: Requirements 2.2, 2.3, 2.4**
    - File: `gateway/middleware/__tests__/validate.test.js`

  - [x] 7.3 Implementasi route `/order` dan `/status` (`gateway/routes/orderRoutes.js`)
    - `POST /order`: generate `requestId` (UUID v4), register ke `RequestCorrelator`, kirim ke `TcpClient`, tunggu respons, kembalikan ke client
    - `GET /status`: kirim pesan TCP tipe `status` ke Inventory, kembalikan respons sebagai JSON
    - Return HTTP 503 jika TcpClient tidak terkoneksi atau timeout
    - _Requirements: 2.1, 2.5, 2.6, 2.7_

  - [x] 7.4 Implementasi entry point Order Gateway (`gateway/index.js`)
    - Inisialisasi Express, `TcpClient`, `RequestCorrelator`, mount middleware dan routes
    - Register `process.on('uncaughtException', ...)` untuk logging tanpa crash
    - Baca konfigurasi dari `config.js` atau environment variables
    - _Requirements: 2.1, 7.1, 9.1_

- [x] 8. Checkpoint — Gateway dan Inventory Integration
  - Pastikan semua test unit untuk middleware, correlator, dan TCP client lolos. Uji coba interaksi API berhasil.

- [x] 9. Implementasi Client Simulator — Worker Thread dan Runner
  - [x] 9.1 Implementasi `requestWorker.js` (`simulator/worker/requestWorker.js`)
    - Baca `workerData` (`{ gatewayUrl, requests, timeoutMs }`)
    - Iterasi setiap request dalam `requests` array, kirim HTTP POST ke `gatewayUrl`
    - Kirim `{ type: "result", requestId, status, responseTimeMs, statusCode }` via `parentPort.postMessage()`
    - Kirim `{ type: "done", successCount, failCount }` saat selesai
    - Handle timeout 10 detik dan `ECONNREFUSED` sebagai failure
    - _Requirements: 1.2, 1.8, 1.9_

  - [x] 9.2 Implementasi `MetricsCollector` (`simulator/metrics/metricsCollector.js`)
    - Implementasikan `start()`, `recordSuccess(responseTimeMs)`, `recordFailure(reason)`, dan `finalize()` yang mengembalikan `MetricsResult`
    - `finalize()` harus menghasilkan `executionTimeMs`, `throughputRps`, `successCount`, `failCount`, `sessionId`, `mode`, `workerCount`, `totalRequests`, `timestamp`
    - _Requirements: 1.6, 1.7, 5.1, 5.3, 5.5_

  - [x]* 9.3 Tulis property test untuk MetricsCollector — Kebenaran Kalkulasi Metrik
    - **Property 7: Kebenaran Kalkulasi Metrik Performa**
    - Generate arbitrary `(startTime, endTime, successCount, failCount)` dengan `endTime > startTime`, assert `executionTimeMs = endTime - startTime`, `throughputRps = successCount / (executionTimeMs / 1000)`, `successCount + failCount = totalRequests`
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.5**
    - File: `simulator/metrics/__tests__/calculations.test.js`

  - [x] 9.4 Implementasi `ParallelRunner` (`simulator/runner/parallelRunner.js`)
    - Spawn `workerCount` Worker Threads, distribusikan `totalRequests` secara merata (`floor(totalRequests / workerCount)`)
    - Kumpulkan hasil dari semua worker via `worker.on('message', ...)`
    - Gunakan `MetricsCollector` untuk mengumpulkan hasil dan panggil `finalize()` setelah semua worker selesai
    - _Requirements: 1.2, 1.4, 1.5_

  - [x] 9.5 Implementasi `SequentialRunner` (`simulator/runner/sequentialRunner.js`)
    - Kirim permintaan satu per satu secara berurutan tanpa Worker Thread
    - Gunakan `MetricsCollector` untuk mengumpulkan hasil
    - _Requirements: 1.3_

  - [x] 9.6 Implementasi `MetricsReporter` (`simulator/metrics/metricsReporter.js`)
    - Implementasikan `printSummary(result)` menggunakan `console.table`
    - Implementasikan `saveToFile(result)` menyimpan ke `results/metrics-{timestamp}.json`
    - Implementasikan `sendToDashboard(result, dashboardUrl)` via HTTP POST
    - _Requirements: 1.7, 5.4, 5.6_

  - [x] 9.7 Implementasi entry point Client Simulator (`simulator/index.js`)
    - Baca konfigurasi dari `config.js` atau argumen baris perintah
    - Validasi mode: jika bukan `sequential` atau `parallel`, cetak error dan `process.exit(1)`
    - Pilih runner berdasarkan mode, jalankan, kirim hasil ke `MetricsReporter`
    - Untuk menghitung Speedup: jika file hasil mode lain tersedia di `results/`, baca dan hitung `S = T_sequential / T_parallel`
    - _Requirements: 1.1, 1.6, 1.10, 5.2, 5.4_

- [~] 10. Implementasi Frontend Dashboard
  - [ ] 10.1 Implementasi Dashboard Server (`dashboard/server.js`)
    - Buat HTTP server untuk menyajikan static files `index.html`, `css/`, `js/`
    - Implementasikan `GET /api/metrics`, `POST /api/metrics`, `GET /api/status` (proxy ke Order Gateway dengan cache 2 detik), dan `GET /health`
    - _Requirements: 6.1, 6.6, 6.8_

  - [ ] 10.2 Implementasi halaman Dashboard (`dashboard/index.html`, `dashboard/css/style.css`)
    - Buat layout grid satu halaman dengan panel: Metrics (Execution Time, Throughput, Speedup), Bar Chart, Stock Display (Master vs Slave), status indikator simulasi
    - Style CSS: warna berbeda untuk kondisi Master/Slave tidak sinkron vs sinkron
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ] 10.3 Implementasi JavaScript Dashboard (`dashboard/js/app.js`, `charts.js`, `stockDisplay.js`, `metricsPanel.js`)
    - `app.js`: inisialisasi polling setiap 2 detik ke `/api/status` dan `/api/metrics`, bind event handlers, tampilkan error jika koneksi gagal
    - `charts.js`: Bar chart perbandingan Execution Time Sequential vs Parallel menggunakan Chart.js (CDN)
    - `stockDisplay.js`: tampilkan Master Stock vs Slave Stock, indikator divergence jika berbeda
    - `metricsPanel.js`: render nilai Execution Time, Throughput, Speedup
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

- [~] 11. Checkpoint — Dashboard dan Simulator
  - Pastikan semua property test dan unit test lolos. Tanya kepada user jika ada pertanyaan.

- [ ] 12. Integrasi dan Wiring Komponen
  - [ ] 12.1 Buat file `README.md` untuk setiap komponen
    - Tulis `simulator/README.md`, `gateway/README.md`, `inventory/README.md`, `dashboard/README.md` masing-masing dengan instruksi cara menjalankan komponen secara independen
    - _Requirements: 10.3_

  - [ ]* 12.2 Tulis integration test end-to-end — Anti-Overselling
    - Test 5000 permintaan serentak tidak menyebabkan overselling (stok >= 0 setelah semua operasi)
    - Test TCP message fragmentation ditangani dengan benar
    - Test gateway melakukan reconnect ke inventory setelah koneksi TCP terputus
    - **Validates: Requirements 3.4, 3.9, 8.4, 2.9**

  - [ ]* 12.3 Tulis integration test end-to-end — Parallel < Sequential (Speedup > 1)
    - **Property 8: Keunggulan Waktu Eksekusi Parallel vs Sequential**
    - Jalankan kedua mode dalam kondisi sistem yang sama, assert `tParallel < tSequential` sehingga `speedup > 1`
    - **Validates: Requirements 5.2, 1.4, 1.5**
    - File: `simulator/__tests__/performance.test.js`

- [~] 13. Final Checkpoint — Semua Komponen Terintegrasi
  - Pastikan semua test (unit, property, integration) lolos. Tanya kepada user jika ada pertanyaan.

---

## Notes

- Tasks bertanda `*` bersifat opsional dan dapat dilewati untuk MVP yang lebih cepat
- Setiap task mereferensikan requirements spesifik untuk traceability
- Checkpoint memastikan validasi bertahap sebelum melanjutkan ke tahap berikutnya
- Property tests menggunakan `fast-check` dengan minimal 100 iterasi per property
- Unit tests menggunakan `jest` sebagai test runner
- Semua komponen menggunakan Node.js; tidak ada konversi bahasa yang diperlukan

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1", "2.4"] },
    { "id": 1, "tasks": ["2.2", "2.3", "2.5", "6.1"] },
    { "id": 2, "tasks": ["2.6", "3.1", "6.2", "6.3"] },
    { "id": 3, "tasks": ["3.2", "5.1", "7.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "7.2", "7.3", "9.2"] },
    { "id": 5, "tasks": ["6.3", "7.4", "9.1", "9.3"] },
    { "id": 6, "tasks": ["9.4", "9.5", "10.1"] },
    { "id": 7, "tasks": ["9.6", "10.2", "10.3"] },
    { "id": 8, "tasks": ["9.7", "12.1"] },
    { "id": 9, "tasks": ["12.2", "12.3"] }
  ]
}
```
