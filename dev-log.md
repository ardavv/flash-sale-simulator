# Development Log — Flash Sale E-Commerce Simulator

Proyek akhir mata kuliah **Komputasi Paralel dan Terdistribusi**.
Log ini mencatat setiap fase pengembangan: pekerjaan yang dilakukan, tantangan yang ditemui, dan solusi yang diterapkan.

---

## Fase 1 — Task 1: Setup Struktur Proyek dan Konfigurasi Dasar

**Tanggal:** Sesi implementasi pertama

### Pekerjaan yang Dilakukan
- Membuat seluruh struktur direktori proyek sesuai desain: `simulator/`, `gateway/`, `inventory/`, `dashboard/` beserta subfolder (`runner/`, `worker/`, `metrics/`, `results/`, `routes/`, `middleware/`, `tcp/`, `utils/`, `server/`, `core/`, `db/`, `css/`, `js/`)
- Membuat `package.json` di root (npm workspaces) dan di tiap komponen dengan dependensi yang tepat:
  - `gateway/`: `express ^4.18.2`, `uuid ^9.0.0`
  - `simulator/`: `uuid ^9.0.0`
  - Dev dependencies semua komponen: `jest ^29.7.0`, `fast-check ^3.14.0`
- Mengimplementasikan `config.js` di `simulator/`, `gateway/`, dan `inventory/` dengan nilai default yang dapat di-override via environment variables
- Mengimplementasikan `utils/logger.js` di `gateway/` dan `inventory/` dengan factory `createLogger(component)` yang menghasilkan logger berformat `[ISO_TIMESTAMP] [LEVEL] [COMPONENT] MESSAGE {context_json}`
- Membuat placeholder files untuk semua modul yang akan diimplementasikan di task berikutnya

### Tantangan
- Memastikan versi dependensi di-pin secara eksplisit (tidak menggunakan open range) untuk reproducibility

### Solusi
- Menggunakan versi exact/caret yang sudah stabil (`express ^4.18.2`, `jest ^29.7.0`, `fast-check ^3.14.0`)
- Logger menggunakan `process.stdout.write` / `process.stderr.write` langsung (bukan `console.log`) untuk kontrol penuh atas format output

---

## Fase 2 — Task 2: Implementasi Inventory Coordinator — Layer Database

**Tanggal:** Sesi implementasi kedua

### Pekerjaan yang Dilakukan

#### Task 2.1 — MasterDB (`inventory/db/masterDB.js`)
- Mengimplementasikan class `MasterDB extends EventEmitter`
- Constructor menerima `number` atau `Map<productId, number>` sebagai initial stock
- `decrementStock(productId, quantity, requestId)` — synchronous, enforces Req 3.9 (stock ≥ 0), emit `'write'` event setelah write berhasil (Req 4.1), track `version` dan `writeLog`
- `reset(productId, stock?)` — restore ke initial stock atau nilai eksplisit, reset version ke 0
- `onWrite(listener)` — register EventEmitter listener untuk replikasi
- **19 unit tests** di `inventory/db/__tests__/masterDB.test.js` — semua passing ✅

#### Task 2.4 — SlaveDB (`inventory/db/slaveDB.js`)
- Mengimplementasikan class `SlaveDB` — read-only replica
- Satu-satunya cara update: `applyReplication(productId, stock, timestamp)` (Req 4.3)
- `getReplicationLag()` — ms sejak replication terakhir di semua produk
- Menerima timestamp dalam format `Date`, ISO string, atau ms number
- **14 unit tests** di `inventory/db/__tests__/slaveDB.test.js` — semua passing ✅

#### Task 2.5 — ReplicationManager (`inventory/core/replicationManager.js`)
- Mengimplementasikan class `ReplicationManager` yang subscribe ke `MasterDB.onWrite`
- `start()` / `stop()` untuk lifecycle management
- Configurable `replicationDelayMs` (default 0ms) untuk memenuhi batas < 100ms (Req 4.4)
- **4 unit tests** — semua passing ✅

#### Task 2.2 — Property Test: Stok Tidak Pernah Negatif (Optional)
- `fast-check`, 100 runs, `Promise.all` concurrent requests
- Membuktikan stock ≥ 0 dan conservation invariant untuk semua kombinasi input
- File: `inventory/core/__tests__/stockSafety.test.js`

#### Task 2.3 — Property Test: Konservasi Stok (Optional)
- `fast-check`, 200 runs, sequential requests
- `remainingStock + sum(successfulQuantities) === initialStock` selalu terpenuhi
- File: `inventory/core/__tests__/stockConservation.test.js`

#### Task 2.6 — Property Test: Konvergensi Replikasi (Optional)
- `fast-check`, 100 runs, `await sleep(100)` setelah write ops
- `slaveDB.getStock() === masterDB.getStock()` setelah maksimal 100ms (Req 4.4)
- File: `inventory/db/__tests__/replication.test.js`

### Tantangan
- Desain mengharuskan `decrementStock` synchronous (mutex di luar), sementara property test perlu mensimulasikan "concurrent" access
- Property test replication membutuhkan timeout Jest custom (30 detik) karena 100 runs × 100ms sleep = ~10 detik

### Solusi
- `decrementStock` tetap synchronous — Node.js single-threaded menjamin atomic execution per call. `Promise.all` dengan `Promise.resolve()` wrapper tetap menguji stock conservation dengan benar karena microtask queue diselesaikan satu per satu
- Menambahkan `test(..., timeout)` parameter ke PBT replication test untuk menghindari Jest default 5s timeout

---

## Fase 3 — Task 3: Implementasi Inventory Coordinator — Mutex dan Business Logic

**Tanggal:** Sesi implementasi ketiga

### Pekerjaan yang Dilakukan

#### Task 3.1 — Mutex (`inventory/core/mutex.js`)
- Mengimplementasikan class `Mutex` berbasis async Promise-chain queue
- `acquire()` — fast path (unlocked) vs slow path (enqueue Promise resolver)
- `_buildRelease()` factory: mengembalikan fungsi `release()` yang idempotent, dengan watchdog `setTimeout` untuk force-release
- Force-release setelah `mutexTimeoutMs` (default 5000ms): memanggil `release()` secara internal dan log `[WARN] [MUTEX] [CRITICAL] Mutex force-released` (Req 9.4)
- FIFO ordering dijamin karena `_queue.shift()` mengambil waiter pertama
- **11 unit tests** di `inventory/core/__tests__/mutex.test.js` — semua passing ✅
  - Serial execution, FIFO ordering, isLocked, queueLength
  - Force-release dengan `jest.useFakeTimers()`
  - Concurrent 10 tasks tanpa deadlock

#### Task 3.2 — InventoryService (`inventory/core/inventoryService.js`)
- Mengimplementasikan class `InventoryService` yang mengorkestrasikan Mutex + MasterDB + SlaveDB
- `processOrder(productId, quantity, requestId)`:
  - Acquire mutex → `decrementStock` → release di `finally` block (deadlock-safe)
  - Return `{ requestId, status, remainingStock, reason? }`
- `getStatus(productId?)`:
  - Snapshot simultaneous master + slave (Req 4.5)
  - Return `{ masterStock, slaveStock, slaveLastUpdated, replicationLag, isSynced, mutexQueueLength }`
- `reset(productId)`: mutex-protected reset ke initial stock (Req 7.5)
- Structured logging untuk setiap operasi
- **11 unit tests** di `inventory/core/__tests__/inventoryService.test.js` — semua passing ✅
  - 100 concurrent orders pada stock 50 → tepat 50 sukses, stock = 0 (tidak pernah negatif)
  - Mutex release on exception (mock DB yang throw)

### Tantangan
- Memastikan `release()` dipanggil bahkan ketika `decrementStock` melempar exception
- Force-release timeout harus di-clear saat `release()` dipanggil normal untuk mencegah spurious release

### Solusi
- Menggunakan `try...finally` pattern di seluruh `processOrder` dan `reset` — `release()` selalu dipanggil
- `_buildRelease()` menyimpan `timeoutHandle` dalam closure dan memanggil `clearTimeout(timeoutHandle)` sebagai langkah pertama di dalam `release()`
- `release()` dibuat idempotent dengan flag `released` untuk mencegah double-release

---

## Fase 4 — Task 5, 6, dan 7: Integrasi Komunikasi TCP & HTTP Gateway

**Tanggal:** Sesi implementasi keempat

### Pekerjaan yang Dilakukan

#### Task 5.1, 5.2, 5.3 — TCP Server Inventory & Entry Point
- Mengimplementasikan `TcpServer` di `inventory/server/tcpServer.js` berbasis modul `net`.
- Menerapkan arsitektur stream berbasis *buffer* untuk menangani isu fragmentasi jaringan (memisahkan *chunk* masuk berdasarkan delimiter karakter `\n`).
- Menulis property test (`fc.asyncProperty`) untuk memastikan penggabungan fragmen *JSON* dalam ukuran acak tak pernah gagal, dengan toleransi terhadap malformasi payload. Test lulus 100%.
- Menyatukan lapis Data (`DB`), Bisnis (`InventoryService`), dan Jaringan (`TcpServer`) ke dalam *entry point* `inventory/index.js`. 

#### Task 6.1, 6.2, 6.3 — Request Correlator & TCP Client
- Mengembangkan `RequestCorrelator` yang bertugas memetakan balasan asinkron TCP ke HTTP Promise berdasarkan parameter `requestId`.
- Membangun Property Test korelasi di mana pesanan yang dilontarkan bersamaan dibalas dengan penundaan `setTimeout` acak, memastikan bahwa tak ada *Promise* yang menyilang (*no crossover*). Lulus 100%.
- Membangun `TcpClient` lengkap dengan kapabilitas auto-reconnect. Apabila koneksi terputus, ia tak hanya mencoba menyambung ulang tiap detik, melainkan secara sigap memanggil `correlator.rejectAll()` untuk melepas ikatan HTTP yang pending, mengubah responsnya menjadi 503 secara instan alih-alih menggantung selamanya.

#### Task 7.1, 7.2, 7.3, 7.4 — Gateway HTTP Server & Middleware
- Membuat Express Middleware `validatePayload` (`gateway/middleware/validatePayload.js`) untuk mem-filter parameter `productId` dan `quantity`.
- Menerapkan Property Test untuk Middleware ini. Seluruh muatan terlarang *(negatif, float, spasi kosong, dll.)* dipastikan ditolak *(HTTP 400)*.
- Membuat desain *Factory Function* di rute Express (`gateway/routes/orderRoutes.js`) guna menginjeksi `TcpClient` dan `RequestCorrelator`.
- Menyatukan semuanya pada fondasi `gateway/index.js`, sebuah Gateway HTTP (pada port 3000) terpasang penangkap `uncaughtException` yang menembak TCP Server Inventori (port 4000) dan menanti balasannya.

### Tantangan
- Terdapat ketiadaan fungsi `rejectAll` pada implementasi draf awal `RequestCorrelator`, yang akan menyebabkan error saat `TcpClient` terputus dan memanggilnya.
- Penulisan sintaks Property Test `fast-check` versi asinkron cukup riskan terhadap kesalahan format peletakan `predicate` (yang memicu `TypeError: p is not a function`).

### Solusi
- Menambahkan metode `rejectAll` dan `reject` pada correlator yang mengiterasi seluruh iterasi Map memori, membersihkan timer (mencegah *memory leak*), dan membersihkan entri secara massal.
- Mengoreksi penulisan `fc.property()` dan `fc.asyncProperty()` dengan penempatan struktur parameter *fat-arrow function* yang tepat di argumen terakhir.

---

## Fase 5 — Task 9: Simulator Klien Pembombardir (Load Generator)

**Tanggal:** Sesi implementasi kelima

### Pekerjaan yang Dilakukan

#### Task 9.1 — Eksekutor Beban (Worker Thread)
- Mengimplementasikan `requestWorker.js` yang bertugas sebagai *Thread* independen.
- Memakai `fetch` bawaan Node (dipadukan dengan `AbortController` untuk batas *timeout* 10 detik) alih-alih dependensi eksternal.
- Setiap kali transaksi HTTP diproses (atau terputus karena `ECONNREFUSED`/`AbortError`), worker ini akan melemparkan pesannya (keberhasilan/kegagalan beserta kecepatan respons) ke pelari utama *(Main Thread)* melalui `parentPort.postMessage`.

#### Task 9.2 & 9.3 — Kolektor Metrik dan Uji Matematis
- Menciptakan `MetricsCollector` dengan algoritma kalkulasi presisi tinggi menggunakan `performance.now()`.
- Mengimplementasikan pengaman (*safeguard*) logika apabila simulasi selesai secara instan (*0 ms*) agar metrik *Throughput* tidak memuntahkan cacat matematis berupa pembagian dengan nol (*Infinity* / *NaN*).
- Menulis dan meloloskan Property Test `metrics.test.js` dengan menyimulasikan laju waktu secara prediktif (menipu modul `perf_hooks` via Jest).

#### Task 9.4 & 9.5 — Algoritma Paralel dan Sekuensial
- **SequentialRunner**: Membombardir *Gateway* secara linear, memblokir interaksi perulangan `for` hingga pesanan tuntas dengan perintah `await`. Bertindak sebagai pijakan perbandingan awal *(Baseline)*.
- **ParallelRunner**: Mendistribusikan puluhan ribu *request* secara merata ke dalam pasukan *Worker Threads*. Turut membagikan sisa pembagian (*remainder*) secara teliti, serta melindungi pelari agar tak membeku selamanya ketika ada *Worker* yang tumbang *(Crash)* dengan memantau *event* `exit`.

#### Task 9.6 & 9.7 — Visualisasi dan Titik Masuk (CLI)
- Menyiapkan `MetricsReporter` untuk mempercantik hasil dalam wujud matriks tabel (`console.table`), sekaligus mencetaknya permanen dalam sebuah dokumen rekam jejak `JSON`. Modul ini dibekali insting pembuatan direktori otomatis.
- Membangun antarmuka CLI pada `simulator/index.js` dengan parser argumen nol-dependensi (`process.argv`), memfasilitasi parameter seperti `--mode`, `--requests`, dan `--workers`. Pintu pelindung `process.exit(1)` diletakkan untuk menjamin penutupan yang bersih pada kondisi kritis.

### Tantangan
- Terjadinya kesalahan peletakan penutup kurung *Property Test* yang memicu error Jest `TypeError: p is not a function`.
- Pembagian dengan nol pada hitungan *Throughput (RPS)* ketika durasi simulasi sekuensial dieksekusi mendekati 0 milidetik, berpotensi memecahkan antarmuka Visualisasi di fase *Dashboard* selanjutnya.

### Solusi
- Penyesuaian sintaks secara akurat di dalam parameter ujung fungsi `fc.property`.
- Membekali hitungan RPS dengan kondisi cadangan (`fallback`) menggunakan limit kasar (*fallback = successCount*) sehingga yang dikeluarkan adalah angka konkret, bukan `Infinity` maupun `NaN`.

---

## Status Saat Ini

| Task | Status |
|------|--------|
| 1. Setup proyek | ✅ Selesai |
| 2. Inventory DB Layer | ✅ Selesai (termasuk semua optional PBT) |
| 3. Mutex + InventoryService | ✅ Selesai |
| 4. Checkpoint — Inventory Core | ✅ Dilewati (berdasar log semua tes sukses) |
| 5. TCP Server | ✅ Selesai |
| 6. Order Gateway TCP | ✅ Selesai |
| 7. Order Gateway HTTP | ✅ Selesai |
| 8. Checkpoint — Gateway Integration | ✅ Selesai |
| 9. Client Simulator | ✅ Selesai |
| 10. Frontend Dashboard | ⏳ Sedang Dikerjakan |
| 11. Checkpoint — Dashboard & Simulator | ⏳ Menunggu |
| 12. Integrasi & Wiring | ⏳ Menunggu |
| 13. Final Checkpoint | ⏳ Menunggu |
