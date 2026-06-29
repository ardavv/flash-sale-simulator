# Order Gateway

Order Gateway berfungsi sebagai perantara (proxy) yang menerima request HTTP REST dari client dan meneruskannya ke Inventory Coordinator menggunakan protokol TCP.

## Arsitektur Komponen

1. **HTTP Server**: Aplikasi Express yang berjalan di port 3000 untuk melayani endpoint `POST /order` and `GET /status`.
2. **ValidatePayload Middleware (gateway/middleware/validatePayload.js)**: Memvalidasi request body sebelum diproses. Request akan ditolak dengan status HTTP 400 jika `productId` kosong atau `quantity` bukan integer positif.
3. **TcpClient (gateway/tcp/tcpClient.js)**: Menghubungkan gateway dengan server TCP Inventory. Dilengkapi dengan logika auto-reconnect (maksimal 5 kali percobaan, jeda 1 detik).
4. **Request Correlator (gateway/tcp/requestCorrelator.js)**: Memetakan kembali respons TCP asinkron ke request HTTP yang sesuai menggunakan `requestId` unik (UUID v4) dan mengelola timeout request.

## Konfigurasi Parameter (Environment Variables)

| Variabel | Deskripsi | Default |
|----------|-----------|---------|
| `GATEWAY_PORT` | Port server HTTP Gateway | `3000` |
| `INVENTORY_HOST` | Host server TCP Inventory | `127.0.0.1` |
| `INVENTORY_PORT` | Port server TCP Inventory | `4000` |

## Cara Menjalankan

Pastikan server Inventory Coordinator sudah berjalan terlebih dahulu. Kemudian jalankan perintah berikut di dalam direktori `gateway/`:

```bash
cd gateway
node index.js
```
