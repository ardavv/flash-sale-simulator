# Client Simulator

Client Simulator digunakan untuk melakukan load testing (stress test) ke Order Gateway dengan mensimulasikan banyak request pembelian secara bersamaan menggunakan Worker Threads bawaan Node.js.

## Arsitektur Komponen

1. **ParallelRunner (simulator/runner/parallelRunner.js)**: Membagi total request secara merata ke sejumlah Worker Threads yang ditentukan. Dilengkapi penanganan error per worker agar tidak menyebabkan aplikasi utama hang jika ada thread yang crash.
2. **SequentialRunner (simulator/runner/sequentialRunner.js)**: Mengirimkan request satu per satu secara berurutan menggunakan `await fetch(...)`. Berfungsi sebagai pembanding untuk menghitung metrik peningkatan performa (Speedup).
3. **RequestWorker (simulator/worker/requestWorker.js)**: Worker thread yang bertugas mengirimkan HTTP POST request ke Gateway menggunakan API `fetch` dan `AbortController` untuk pembatasan timeout (10 detik).
4. **MetricsCollector (simulator/metrics/metricsCollector.js)**: Mengumpulkan data statistik hasil simulasi (jumlah sukses/gagal, waktu eksekusi, dan throughput). Memiliki proteksi pembagian dengan nol jika eksekusi sangat cepat (0ms).
5. **MetricsReporter (simulator/metrics/metricsReporter.js)**: Menampilkan ringkasan metrik di terminal dalam bentuk tabel, menyimpan hasil ke file JSON di direktori `simulator/results/`, dan mengirimkannya ke Dashboard Server melalui HTTP POST.

## Opsi Command Line Interface (CLI)

Jalankan simulator menggunakan format parameter berikut:

| Argumen | Deskripsi | Default / Fallback |
|----------|-----------|--------------------|
| `--mode` | Mode simulasi: `sequential` atau `parallel` (Wajib diisi) | - |
| `--requests` | Jumlah total request yang dikirimkan | `100` |
| `--workers` | Jumlah Worker Threads (hanya berlaku pada mode `parallel`) | `4` |

## Cara Menjalankan

Jalankan perintah berikut di dalam direktori `simulator/` (Pastikan Order Gateway port 3000 sudah aktif):

**Menjalankan Mode Sequential:**
```bash
cd simulator
node index.js --mode=sequential --requests=1000
```

**Menjalankan Mode Parallel:**
```bash
cd simulator
node index.js --mode=parallel --requests=5000 --workers=50
```
