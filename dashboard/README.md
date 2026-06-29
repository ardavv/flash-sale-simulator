# Frontend Dashboard

Dashboard visual ini digunakan untuk menampilkan data metrik performa (Sequential vs Parallel) dan memantau sinkronisasi stok antara Master DB dan Slave DB secara real-time.

## Arsitektur Komponen

1. **Dashboard Server (dashboard/server.js)**: Server Express yang berjalan di port 8080 untuk menyajikan file statis (HTML, CSS, JS) dan menyediakan endpoint API:
   - `/health`: Cek kesehatan server.
   - `POST /api/metrics`: Menerima kiriman data metrik hasil simulasi dari simulator.
   - `GET /api/metrics`: Melayani request pembacaan metrik terbaru untuk frontend.
   - `GET /api/status`: Proxy ke Gateway untuk mengecek stok dengan sistem cache 2 detik untuk menghindari beban berlebih pada database.
2. **Main App (dashboard/js/app.js)**: Mengatur alur polling data ke `/api/status` dan `/api/metrics` setiap 2 detik.
3. **Stock Display (dashboard/js/stockDisplay.js)**: Memperbarui tampilan stok Master vs Slave di halaman utama. Jika stok tidak sama atau terjadi desinkronisasi, status tampilan akan berubah menjadi merah (Divergent), dan hijau (Synced) jika stok sama.
4. **Metrics Panel (dashboard/js/metricsPanel.js)**: Menampilkan komparasi performa secara bersandingan dan menghitung Speedup Factor ($T_{sequential} / T_{parallel}$) menggunakan `sessionStorage` agar data tidak hilang saat refresh halaman.
5. **Charts (dashboard/js/charts.js)**: Menggunakan pustaka Chart.js untuk menampilkan grafik perbandingan Execution Time (ms) dan Throughput (RPS).

## Konfigurasi Parameter (Environment Variables)

| Variabel | Deskripsi | Default |
|----------|-----------|---------|
| `DASHBOARD_PORT` | Port server HTTP Dashboard | `8080` |
| `GATEWAY_URL` | URL target Order Gateway | `http://localhost:3000` |

## Cara Menjalankan

Jalankan perintah berikut di dalam direktori `dashboard/`:

```bash
cd dashboard
node server.js
```

Setelah server berjalan, akses dashboard melalui browser di alamat `http://localhost:8080`.
