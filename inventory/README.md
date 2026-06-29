# Inventory Coordinator

Inventory Coordinator adalah komponen yang berfungsi untuk menyimpan data stok barang dan mengelola transaksi pengurangan stok pada sistem simulasi Flash Sale ini. Komponen ini dirancang untuk menjaga konsistensi stok agar tidak terjadi overselling (stok bernilai negatif) di bawah beban konkurensi tinggi, serta mendistribusikan data stok ke basis data replika (slave).

## Arsitektur Komponen

1. **MasterDB (inventory/db/masterDB.js)**: Menyimpan data stok utama. Semua operasi pengurangan stok dilakukan di sini untuk memastikan konsistensi.
2. **SlaveDB (inventory/db/slaveDB.js)**: Replikasi basis data bersifat read-only. Digunakan untuk melayani request pembacaan status stok tanpa mengganggu basis data utama.
3. **Replication Manager (inventory/core/replicationManager.js)**: Mengelola proses sinkronisasi data dari MasterDB ke SlaveDB berdasarkan event penulisan data stok.
4. **Mutex (inventory/core/mutex.js)**: Menggunakan antrean Promise (FIFO) untuk memastikan operasi pengurangan stok berjalan secara bergantian (thread-safe). Dilengkapi dengan timeout force-release otomatis (default 5 detik) untuk mencegah deadlock.
5. **TcpServer (inventory/server/tcpServer.js)**: Server TCP yang berjalan di port 4000 untuk menerima request dari Order Gateway. Dilengkapi dengan parser buffer berbasis delimiter `\n` untuk menangani fragmentasi paket jaringan.

## Konfigurasi Parameter (Environment Variables)

| Variabel | Deskripsi | Default |
|----------|-----------|---------|
| `INVENTORY_PORT` | Port server TCP Inventory | `4000` |
| `INITIAL_STOCK` | Jumlah stok awal barang | `1000` |

## Cara Menjalankan

Jalankan perintah berikut di dalam direktori `inventory/`:

```bash
cd inventory
node index.js
```

Jika ingin menggunakan port yang berbeda:
```bash
INVENTORY_PORT=4001 node index.js
```
