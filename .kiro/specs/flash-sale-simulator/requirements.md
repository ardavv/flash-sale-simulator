# Requirements Document

## Introduction

Flash Sale E-Commerce Simulator adalah sistem terdistribusi berperforma tinggi yang dirancang untuk mensimulasikan kondisi lonjakan lalu lintas (*high-concurrency*) pada skenario flash sale. Sistem ini dibangun sebagai proyek akhir mata kuliah "Komputasi Paralel dan Terdistribusi" dengan tujuan:

1. Mensimulasikan 5.000 permintaan pembelian serentak menggunakan teknik *multithreading* (`worker_threads`)
2. Memproses permintaan secara terdistribusi melalui arsitektur multi-node (HTTP Gateway → TCP Inventory)
3. Mencegah *overselling* dengan mekanisme *mutex locking* pada operasi stok
4. Mengukur metrik performa: *Execution Time*, *Speedup*, dan *Throughput*
5. Memvisualisasikan metrik real-time dan sinkronisasi data Master/Slave DB melalui dashboard web

Sistem terdiri dari empat komponen utama: **Client Simulator**, **Order Gateway (Node 1)**, **Inventory Coordinator (Node 2)**, dan **Frontend Dashboard**.

---

## Glossary

- **Client_Simulator**: Modul komputasi paralel yang menggunakan `worker_threads` Node.js untuk mengirimkan permintaan HTTP secara serentak
- **Order_Gateway**: Layanan Node 1 berbasis Express.js yang bertugas sebagai gerbang penerimaan dan validasi permintaan
- **Inventory_Coordinator**: Layanan Node 2 berbasis raw TCP Socket Server yang mengelola stok barang
- **Master_DB**: Kelas basis data tiruan di memori yang menangani operasi tulis (*write*) dengan mekanisme mutex locking
- **Slave_DB**: Kelas basis data tiruan di memori yang menerima replikasi data dari Master_DB secara otomatis
- **Dashboard**: Aplikasi web satu halaman yang menampilkan visualisasi metrik performa dan status sinkronisasi stok
- **Worker_Thread**: Unit eksekusi paralel yang dibuat oleh `worker_threads` Node.js untuk mengirimkan permintaan HTTP
- **Mutex**: Mekanisme penguncian (*lock*) yang memastikan hanya satu operasi tulis yang mengakses stok pada satu waktu
- **TCP_Socket**: Koneksi berbasis protokol TCP menggunakan modul `net` bawaan Node.js untuk komunikasi antar-node
- **Flash_Sale**: Skenario penjualan kilat dengan stok terbatas yang memicu lonjakan permintaan serentak
- **Race_Condition**: Kondisi di mana dua atau lebih proses mengakses data yang sama secara bersamaan dan menghasilkan hasil yang tidak konsisten
- **Overselling**: Kondisi di mana jumlah stok terjual melebihi stok yang tersedia
- **Sequential_Mode**: Mode eksekusi di mana permintaan dikirim satu per satu secara berurutan (digunakan sebagai pembanding baseline)
- **Parallel_Mode**: Mode eksekusi di mana permintaan dikirim secara serentak menggunakan banyak Worker_Thread
- **Throughput**: Jumlah permintaan yang berhasil diproses per detik (Requests Per Second / RPS)
- **Speedup**: Rasio perbandingan performa, dihitung sebagai `T_sequential / T_parallel`
- **Execution_Time**: Durasi total waktu dari pengiriman permintaan pertama hingga diterimanya respons terakhir
- **Payload**: Data JSON yang dikirimkan dalam setiap permintaan HTTP, berisi identitas produk dan jumlah yang dibeli

---

## Requirements

### Kebutuhan 1: Client Simulator — Pengiriman Permintaan Paralel

**User Story:** Sebagai mahasiswa yang menguji performa sistem, saya ingin mengirimkan 5.000 permintaan pembelian secara serentak, sehingga saya dapat mensimulasikan kondisi flash sale yang sesungguhnya dan mengukur kemampuan sistem terdistribusi.

#### Kriteria Penerimaan

1. THE Client_Simulator SHALL mendukung dua mode eksekusi: `sequential` dan `parallel`, yang ditentukan melalui parameter konfigurasi atau argumen baris perintah sebelum simulasi dimulai
2. WHEN Parallel_Mode dipilih, THE Client_Simulator SHALL membuat antara 1 hingga 5.000 Worker_Thread sesuai parameter konfigurasi `workerCount` untuk mendistribusikan pengiriman permintaan
3. WHEN Sequential_Mode dipilih, THE Client_Simulator SHALL mengirimkan permintaan satu per satu secara berurutan tanpa membuat Worker_Thread tambahan
4. THE Client_Simulator SHALL mengirimkan tepat 5.000 HTTP POST requests ke Order_Gateway dalam satu sesi simulasi, dengan setiap Worker_Thread menerima porsi permintaan yang merata (`floor(5000 / workerCount)`)
5. WHEN semua Worker_Thread selesai diinisialisasi, THE Client_Simulator SHALL memulai pengiriman permintaan secara serentak dalam jendela waktu tidak lebih dari 100 milidetik antar thread pertama dan terakhir yang mulai mengirim
6. THE Client_Simulator SHALL mencatat waktu mulai (*start time*) menggunakan `Date.now()` atau `performance.now()` tepat sebelum permintaan pertama dikirimkan dan waktu selesai (*end time*) tepat setelah respons terakhir diterima atau dicatat sebagai gagal
7. WHEN satu sesi simulasi selesai (semua permintaan mendapat respons atau dicatat gagal), THE Client_Simulator SHALL menghitung dan mencetak ke konsol: Execution_Time dalam milidetik, Throughput dalam RPS, jumlah permintaan berhasil, dan jumlah permintaan gagal
8. IF sebuah Worker_Thread tidak menerima respons dalam 10 detik atau koneksi ditolak, THEN THE Client_Simulator SHALL mencatat permintaan tersebut sebagai gagal tanpa menghentikan Worker_Thread lainnya
9. THE Client_Simulator SHALL mengirimkan Payload berformat JSON pada setiap permintaan dengan field `productId` bertipe string (non-kosong) dan `quantity` bertipe integer dalam rentang 1–100
10. IF parameter mode yang diberikan bukan `sequential` atau `parallel`, THEN THE Client_Simulator SHALL mencetak pesan kesalahan yang menjelaskan nilai yang valid dan menghentikan eksekusi tanpa mengirim permintaan apapun

---

### Kebutuhan 2: Order Gateway — Penerimaan dan Validasi Permintaan HTTP

**User Story:** Sebagai sistem terdistribusi, saya ingin memiliki gerbang yang menerima dan memvalidasi setiap permintaan masuk sebelum diteruskan, sehingga hanya permintaan yang valid yang diproses lebih lanjut dan beban jaringan dapat diminimalkan.

#### Kriteria Penerimaan

1. THE Order_Gateway SHALL mendengarkan permintaan HTTP POST masuk pada sebuah port yang dapat dikonfigurasi
2. WHEN sebuah HTTP POST request diterima, THE Order_Gateway SHALL memvalidasi bahwa Payload berisi field `productId` bertipe string dan `quantity` bertipe integer positif
3. IF Payload tidak mengandung field `productId` atau `quantity`, THEN THE Order_Gateway SHALL mengembalikan respons HTTP 400 dengan pesan kesalahan yang menjelaskan field yang tidak valid
4. IF nilai `quantity` dalam Payload kurang dari atau sama dengan nol, THEN THE Order_Gateway SHALL mengembalikan respons HTTP 400 dengan pesan kesalahan yang deskriptif
5. WHEN Payload dinyatakan valid, THE Order_Gateway SHALL meneruskan Payload ke Inventory_Coordinator melalui TCP_Socket dalam format string JSON
6. WHEN Inventory_Coordinator mengembalikan hasil pemrosesan melalui TCP_Socket, THE Order_Gateway SHALL meneruskan hasil tersebut sebagai respons HTTP ke Client_Simulator
7. THE Order_Gateway SHALL memproses setiap permintaan masuk secara asinkron sehingga permintaan lain tidak diblokir selama pemrosesan berlangsung
8. THE Order_Gateway SHALL menjaga koneksi TCP_Socket yang persisten ke Inventory_Coordinator agar tidak membuat koneksi baru pada setiap permintaan
9. IF koneksi TCP_Socket ke Inventory_Coordinator terputus, THEN THE Order_Gateway SHALL mencoba menghubungkan kembali (*reconnect*) dengan interval 1 detik hingga berhasil atau mencapai 5 kali percobaan
10. IF koneksi TCP_Socket gagal dipulihkan setelah 5 kali percobaan, THEN THE Order_Gateway SHALL mengembalikan respons HTTP 503 kepada Client_Simulator dengan pesan bahwa layanan tidak tersedia

---

### Kebutuhan 3: Inventory Coordinator — Pengelolaan Stok dengan Mutex

**User Story:** Sebagai sistem inventori, saya ingin memproses setiap permintaan pembelian secara aman dengan mekanisme penguncian, sehingga stok tidak pernah bernilai negatif meskipun ribuan permintaan datang secara bersamaan.

#### Kriteria Penerimaan

1. THE Inventory_Coordinator SHALL mendengarkan koneksi TCP masuk pada sebuah port yang dapat dikonfigurasi
2. WHEN sebuah pesan string diterima melalui TCP_Socket, THE Inventory_Coordinator SHALL mem-*parse* pesan tersebut sebagai JSON untuk mendapatkan `productId` dan `quantity`
3. IF pesan yang diterima bukan JSON yang valid, THEN THE Inventory_Coordinator SHALL mengirimkan pesan respons kesalahan bertipe string JSON kembali ke Order_Gateway tanpa menghentikan layanan
4. WHEN sebuah permintaan pengurangan stok diterima, THE Inventory_Coordinator SHALL mengakuisisi Mutex sebelum mengakses Master_DB untuk membaca atau menulis data stok
5. WHILE Mutex sedang dipegang oleh satu operasi, THE Inventory_Coordinator SHALL mengantrikan permintaan lain hingga Mutex dilepaskan
6. WHEN Mutex berhasil diakuisisi, THE Inventory_Coordinator SHALL membaca stok saat ini dari Master_DB, lalu mengurangi stok sebesar nilai `quantity` jika stok mencukupi
7. IF stok pada Master_DB tidak mencukupi untuk memenuhi `quantity` yang diminta, THEN THE Inventory_Coordinator SHALL melepaskan Mutex dan mengirimkan respons kegagalan tanpa mengubah nilai stok
8. WHEN operasi pengurangan stok pada Master_DB berhasil, THE Inventory_Coordinator SHALL melepaskan Mutex dan memperbarui data pada Slave_DB melalui mekanisme simulasi replikasi
9. THE Master_DB SHALL memastikan nilai stok tidak pernah bernilai kurang dari nol pada kondisi apapun
10. WHEN sebuah sesi simulasi dimulai, THE Inventory_Coordinator SHALL menerima pesan inisialisasi untuk mengatur nilai stok awal pada Master_DB dan Slave_DB

---

### Kebutuhan 4: Simulasi Replikasi Master-Slave Database

**User Story:** Sebagai sistem yang mensimulasikan arsitektur database terdistribusi, saya ingin Master_DB mereplikasi datanya ke Slave_DB secara otomatis setiap kali terjadi perubahan, sehingga Slave_DB selalu mencerminkan keadaan terkini dari Master_DB.

#### Kriteria Penerimaan

1. WHEN sebuah operasi tulis berhasil diselesaikan pada Master_DB, THE Master_DB SHALL mengirimkan notifikasi replikasi ke Slave_DB yang berisi data stok terbaru
2. WHEN Slave_DB menerima notifikasi replikasi dari Master_DB, THE Slave_DB SHALL memperbarui nilai stoknya sesuai data yang dikirimkan Master_DB
3. THE Slave_DB SHALL hanya menerima pembaruan data dari Master_DB dan tidak mengizinkan operasi tulis langsung dari sumber lain
4. WHEN data stok Master_DB berubah, THE Slave_DB SHALL menyelesaikan pembaruan datanya dalam rentang waktu yang tidak melebihi 100 milidetik setelah notifikasi replikasi dikirimkan
5. WHEN diminta oleh Dashboard, THE Inventory_Coordinator SHALL menyediakan nilai stok saat ini dari Master_DB dan Slave_DB secara bersamaan melalui sebuah endpoint status
6. THE Slave_DB SHALL menyimpan cap waktu (*timestamp*) dari pembaruan terakhir yang diterima dari Master_DB

---

### Kebutuhan 5: Pengukuran dan Pelaporan Metrik Performa

**User Story:** Sebagai mahasiswa yang menganalisis sistem, saya ingin sistem mencatat dan melaporkan metrik performa secara otomatis setelah setiap sesi simulasi, sehingga saya dapat membandingkan efisiensi eksekusi Sequential_Mode versus Parallel_Mode secara kuantitatif.

#### Kriteria Penerimaan

1. THE Client_Simulator SHALL mengukur Execution_Time untuk setiap sesi simulasi sebagai selisih antara waktu selesai dan waktu mulai dalam satuan milidetik
2. WHEN sesi Sequential_Mode dan sesi Parallel_Mode telah selesai dijalankan, THE Client_Simulator SHALL menghitung Speedup menggunakan rumus `S = T_sequential / T_parallel`
3. THE Client_Simulator SHALL menghitung Throughput sebagai jumlah permintaan yang berhasil dibagi Execution_Time dalam satuan detik, dinyatakan sebagai Requests Per Second (RPS)
4. WHEN satu sesi simulasi selesai, THE Client_Simulator SHALL menyimpan hasil metrik (Execution_Time, Throughput, jumlah berhasil, jumlah gagal, mode) ke dalam sebuah berkas JSON dengan nama yang menyertakan cap waktu sesi
5. THE Client_Simulator SHALL mencatat jumlah permintaan yang berhasil (mendapat respons HTTP 200) dan jumlah yang gagal (respons non-200 atau error jaringan) secara terpisah
6. WHEN data metrik dari dua mode telah tersedia, THE Client_Simulator SHALL mengirimkan data tersebut ke Dashboard melalui sebuah mekanisme (misal: REST endpoint atau WebSocket) untuk ditampilkan secara visual

---

### Kebutuhan 6: Frontend Dashboard — Visualisasi Real-Time

**User Story:** Sebagai pengguna yang memantau sistem, saya ingin melihat metrik performa dan status stok dalam sebuah dashboard web, sehingga saya dapat memahami kondisi sistem secara visual tanpa perlu membaca log secara manual.

#### Kriteria Penerimaan

1. THE Dashboard SHALL menampilkan halaman web tunggal yang dapat diakses melalui browser pada sebuah port yang dapat dikonfigurasi
2. WHEN data metrik performa dari Client_Simulator tersedia, THE Dashboard SHALL menampilkan nilai Execution_Time, Throughput, dan Speedup dalam bentuk yang mudah dibaca
3. THE Dashboard SHALL menampilkan perbandingan Execution_Time antara Sequential_Mode dan Parallel_Mode dalam sebuah grafik batang (*bar chart*)
4. THE Dashboard SHALL menampilkan nilai stok saat ini dari Master_DB dan Slave_DB secara berdampingan untuk memperlihatkan status sinkronisasi replikasi
5. WHEN nilai stok Master_DB dan Slave_DB berbeda (dalam jeda replikasi), THE Dashboard SHALL menandai kondisi tersebut secara visual (misal: warna berbeda atau indikator)
6. THE Dashboard SHALL memperbarui tampilan data stok Master_DB dan Slave_DB secara periodik dengan interval tidak lebih dari 2 detik menggunakan mekanisme polling atau WebSocket
7. WHEN sebuah sesi simulasi sedang berjalan, THE Dashboard SHALL menampilkan indikator status bahwa simulasi sedang aktif
8. IF Dashboard tidak dapat terhubung ke backend untuk mengambil data, THEN THE Dashboard SHALL menampilkan pesan kesalahan koneksi yang jelas kepada pengguna

---

### Kebutuhan 7: Konfigurasi dan Inisialisasi Sistem

**User Story:** Sebagai pengembang yang menjalankan sistem, saya ingin semua parameter penting dapat dikonfigurasi sebelum sistem dijalankan, sehingga saya dapat dengan mudah mengubah skenario pengujian tanpa mengubah kode sumber.

#### Kriteria Penerimaan

1. THE Order_Gateway SHALL membaca konfigurasi port HTTP dan alamat/port TCP_Socket ke Inventory_Coordinator dari variabel lingkungan atau berkas konfigurasi saat pertama kali dijalankan
2. THE Inventory_Coordinator SHALL membaca konfigurasi port TCP dan nilai stok awal produk dari variabel lingkungan atau berkas konfigurasi saat pertama kali dijalankan
3. THE Client_Simulator SHALL membaca konfigurasi URL target Order_Gateway, jumlah total permintaan, jumlah Worker_Thread, dan mode eksekusi dari berkas konfigurasi atau argumen baris perintah
4. WHEN sistem dijalankan tanpa berkas konfigurasi, THE Order_Gateway dan THE Inventory_Coordinator SHALL menggunakan nilai default yang telah ditentukan (misalnya: port Gateway = 3000, port Inventory = 4000, stok awal = 1.000 unit)
5. THE Inventory_Coordinator SHALL menyediakan sebuah endpoint atau perintah untuk mereset nilai stok ke nilai awal tanpa perlu merestart layanan, sehingga pengujian dapat diulang tanpa downtime

---

### Kebutuhan 8: Komunikasi Antar-Node via TCP Socket

**User Story:** Sebagai sistem yang mengoptimalkan latensi, saya ingin komunikasi antara Order_Gateway dan Inventory_Coordinator menggunakan format pesan yang ringkas dan efisien, sehingga waktu transmisi data melalui jaringan dapat diminimalkan.

#### Kriteria Penerimaan

1. THE Order_Gateway SHALL mengirimkan setiap Payload ke Inventory_Coordinator sebagai satu baris string JSON yang diakhiri karakter newline (`\n`) sebagai pemisah pesan
2. THE Inventory_Coordinator SHALL mem-*parse* setiap pesan yang diakhiri karakter newline (`\n`) sebagai satu unit pesan yang lengkap
3. THE Inventory_Coordinator SHALL mengirimkan setiap respons kembali ke Order_Gateway sebagai satu baris string JSON yang diakhiri karakter newline (`\n`)
4. IF sebuah pesan TCP diterima dalam beberapa fragmen (karena buffering jaringan), THEN THE Inventory_Coordinator SHALL menggabungkan fragmen tersebut hingga karakter newline ditemukan sebelum mem-*parse* pesan
5. THE Order_Gateway SHALL mengaitkan setiap respons yang diterima dari Inventory_Coordinator dengan permintaan HTTP yang menunggu menggunakan mekanisme identifikasi unik per permintaan (misal: UUID dalam Payload)

---

### Kebutuhan 9: Penanganan Kesalahan dan Ketahanan Sistem

**User Story:** Sebagai sistem yang berjalan dalam kondisi beban tinggi, saya ingin setiap node menangani kondisi kesalahan dengan baik, sehingga satu kegagalan tidak menyebabkan seluruh sistem berhenti.

#### Kriteria Penerimaan

1. WHEN Order_Gateway mengalami kesalahan yang tidak tertangkap (*unhandled exception*), THE Order_Gateway SHALL mencatat detail kesalahan ke konsol dengan format terstruktur tanpa mematikan proses server
2. WHEN Inventory_Coordinator mengalami kesalahan yang tidak tertangkap, THE Inventory_Coordinator SHALL mencatat detail kesalahan ke konsol dengan format terstruktur tanpa mematikan proses server
3. IF sebuah koneksi TCP_Socket dari Order_Gateway terputus secara tiba-tiba, THEN THE Inventory_Coordinator SHALL membersihkan sumber daya yang terkait dengan koneksi tersebut dan terus melayani koneksi lain
4. IF Mutex tidak dilepaskan dalam waktu 5 detik (indikasi deadlock), THEN THE Inventory_Coordinator SHALL secara paksa melepaskan Mutex dan mencatat peristiwa tersebut sebagai peringatan kritis
5. THE Inventory_Coordinator SHALL mencatat setiap kejadian: permintaan masuk, hasil operasi stok (berhasil/gagal/stok habis), dan pelepasan Mutex ke log dengan cap waktu

---

### Kebutuhan 10: Dokumentasi Teknis Proyek

**User Story:** Sebagai mahasiswa yang mengerjakan proyek kuliah, saya ingin dokumentasi teknis yang lengkap dihasilkan bersama kode, sehingga setiap fase pengembangan dan keputusan arsitektur dapat dinilai oleh dosen.

#### Kriteria Penerimaan

1. THE Sistem SHALL memiliki berkas `ARCHITECTURE.md` yang mendokumentasikan diagram arsitektur seluruh node, protokol komunikasi yang digunakan, dan kontrak format data (Payload dan respons) antar-node
2. THE Sistem SHALL memiliki berkas `dev-log.md` yang mencatat setiap fase pengembangan: deskripsi singkat pekerjaan, tantangan yang ditemui, dan solusi yang diterapkan
3. THE Sistem SHALL memiliki berkas `README.md` di setiap folder komponen (`simulator/`, `gateway/`, `inventory/`, `dashboard/`) yang menjelaskan cara menjalankan komponen tersebut secara independen
4. WHEN sebuah sesi simulasi selesai, THE Client_Simulator SHALL menghasilkan laporan ringkas (*summary report*) yang mencakup semua metrik performa dalam format yang dapat disalin ke laporan akademik
