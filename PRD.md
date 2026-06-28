# Product Requirement Document (PRD) - Flash Sale Simulator & Performance Dashboard

## 1. Project Overview
* [cite_start]**Tema:** E-Commerce / Marketplace[cite: 7].
* [cite_start]**Topik Spesifik:** Analisis dan Implementasi Arsitektur Terdistribusi Berperforma Tinggi pada Sistem Flash Sale[cite: 2, 4].
* [cite_start]**Tujuan:** Mensimulasikan kondisi lonjakan lalu lintas data (*high-concurrency*) saat berebutan stok barang, mengukur efisiensi komputasi paralel, serta memvisualisasikannya ke dalam dashboard monitoring[cite: 22, 63].

## 2. System Architecture & Component Specification
[cite_start]Sistem menggunakan arsitektur multi-service terdistribusi yang memisahkan gerbang permintaan dengan pemrosesan data[cite: 22, 33]:

### A. Client Simulator Node (Parallel Computing Module)
* [cite_start]Menggunakan teknik **Multithreading** atau **Multiprocessing** untuk mengeksekusi instruksi secara bersamaan[cite: 41, 42].
* [cite_start]Bertugas mengirimkan 5.000 HTTP POST requests ke Node 1 secara serentak dalam satu detik untuk mensimulasikan kondisi riil flash sale[cite: 44, 45].
* [cite_start]Berfungsi sebagai alat uji performa (*benchmark tool*)[cite: 57, 63].

### B. Node 1: Order Gateway Service (Distributed Module - HTTP Server)
* [cite_start]Dibangun menggunakan **Express.js** dengan menerapkan **Asynchronous Programming**[cite: 36, 43].
* [cite_start]Hanya bertugas menerima request masuk dari Client Simulator, memvalidasi payload, lalu meneruskannya secara instan ke Node 2 melalui koneksi **TCP Socket**[cite: 52].
* [cite_start]Node ini tidak terhubung langsung ke database[cite: 37, 38].

### C. Node 2: Inventory Coordinator Service (Distributed Module - TCP Server)
* [cite_start]Dibangun murni menggunakan raw **TCP Socket Server** (Modul `net` bawaan Node.js)[cite: 36, 52].
* [cite_start]Menerima kiriman pesan string dari Node 1 untuk diproses[cite: 56].
* [cite_start]Mengimplementasikan dua kelas basis data tiruan di memori untuk simulasi[cite: 53]:
  * [cite_start]**Master DB Class:** Menangani operasi pemotongan stok (*Write operation*) menggunakan mekanisme locking untuk mencegah *overselling*[cite: 70, 73].
  * [cite_start]**Slave DB Class:** Menerima salinan data dari Master secara otomatis menggunakan **Simulasi Replication**[cite: 54].

### D. Frontend: Performance Monitoring Dashboard (Kiro UI Component)
* Aplikasi web satu halaman untuk menampilkan visualisasi data dari backend.
* Menampilkan grafik perbandingan metrik kinerja secara real-time.
* [cite_start]Menampilkan sinkronisasi jumlah sisa stok antara Master DB dan Slave DB[cite: 54, 70].

## 3. Performance Metrics & Benchmarking Requirement
[cite_start]Sistem wajib mencatat dan membandingkan dua skenario pemrosesan (Sequential vs Parallel/Distributed) berdasarkan metrik berikut[cite: 58]:
* [cite_start]**Execution Time ($T$):** Total durasi waktu penyelesaian seluruh request[cite: 64].
* [cite_start]**Speedup ($S$):** Efisiensi komputasi paralel dengan rumus $S = \frac{T_{sequential}}{T_{parallel}}$[cite: 65].
* [cite_start]**Throughput:** Jumlah request sukses yang ditangani per detik (Requests Per Second)[cite: 66].

## 4. System Constraints & Challenges to Solve
[cite_start]Sistem harus mampu menangani dan mendokumentasikan penyelesaian terhadap tiga masalah berikut[cite: 69, 76]:
1. [cite_start]**Sinkronisasi Data (Race Condition):** Mengunci data stok agar tidak bernilai minus[cite: 70].
2. [cite_start]**Konsistensi Database:** Menjaga keakuratan data hasil replikasi dari Master ke Slave[cite: 54, 73].
3. [cite_start]**Latency Jaringan:** Optimalisasi pesan string pada komunikasi antar-node via TCP Socket[cite: 56, 72].