Kamu adalah seorang senior fullstack developer yang sudah sangat berpengalaman di bidang web development dan juga sistem administrator.

Buatkan struktur proyek komplit untuk aplikasi "Internal File Manager" menggunakan Go (Golang) sebagai backend, React (Vite + TypeScript) sebagai frontend, dan MySQL sebagai database.

Aplikasi ini harus di-build menjadi SINGLE BINARY memanfaatkan fitur `go:embed` agar frontend React dibungkus di dalam eksekutabel Go. Aplikasi ini nantinya akan dideploy di server Ubuntu dan diletakkan di belakang Apache2 Reverse Proxy agar bisa diakses menggunakan domain khusus.

Terapkan spesifikasi teknis dan fitur berikut:
Fase 1:
1. STRUKTUR PROYEK
- Folder `backend/` untuk kode Go (gunakan Go standard library net/http atau framework ringan seperti Fiber/Echo/Gin — pilih yang paling optimal untuk streaming).
- Folder `frontend/` untuk kode React + Vite + TypeScript + Tailwind CSS.
- Sediakan file `Makefile` atau shell script untuk mengotomatisasi proses build: (1) Build React ke `frontend/dist`, (2) Build Go binary yang meng-embed folder dist tersebut.

Fase 2:
2. FITUR UTAMA & LOGIKA BACKEND (Go)
- File Upload & Download: Implementasikan chunk upload atau streaming langsung untuk menangani file berukuran besar secara efisien tanpa membuat RAM server bengkak.
- File Storage Backend: Untuk tahap awal, simpan file fisik di dalam direktori lokal server (misal di folder `./storage`), namun buatkan struktur kode yang modular (menggunakan interface) agar ke depannya mudah dimigrasikan ke S3 atau MinIO.
- Presigned/Secured URL untuk Download: Link download file tidak boleh statis/terbuka umum. Buat token sementara (berlalu dalam beberapa menit) untuk mengunduh file guna menjaga keamanan data internal.
- Validasi File: Validasi ukuran maksimum upload dan cek tipe file (MIME-type) yang diizinkan sebelum menyimpannya ke storage.

Fase 3:
3. SKEMA DATABASE (MySQL)
- Berikan file migrasi SQL atau script inisialisasi tabel untuk:
  - Tabel `users` (untuk autentikasi internal).
  - Tabel `files` (menyimpan metadata seperti: id, nama_file_asli, nama_file_sistem, path/lokasi, ukuran, mime_type, id_pengunggah, waktu_diunggah, waktu_dihapus untuk soft-delete).
  - Tabel `folders` (jika mendukung struktur direktori virtual, buat relasi self-referencing parent_id).

Fase 4:
4. ANTARMUKA USER (React)
- Desain UI yang bersih dan profesional menggunakan Tailwind CSS.
- Fitur utama UI:
  - Halaman Login internal.
  - Dasbor utama File Manager (tampilan Grid atau List).
  - Fitur Drag-and-Drop untuk upload file.
  - Progress bar penanda proses upload yang sedang berjalan.
  - Tombol unduh, hapus, dan generate link berbagi internal.

Fase 5:
5. KONFIGURASI REVERSE PROXY APACHE2 & PROFIL DEPLOYMENT
- Karena aplikasi ini akan berjalan di belakang Apache2 menggunakan domain, pastikan backend Go dapat membaca header proxy dengan benar (seperti `X-Forwarded-For`, `X-Forwarded-Proto`).
- Berikan contoh file konfigurasi VirtualHost Apache2 (`.conf`) yang mengarahkan traffic domain (Port 80/443) ke port internal aplikasi Go melalui `ProxyPass` dan `ProxyPassReverse`, serta pastikan konfigurasi tersebut mendukung upload file ukuran besar tanpa terkena timeout atau limitasi dari Apache (misal menyertakan `LimitRequestBody 0`).

Tolong buatkan boilerplate awal, struktur direktori, skema database, kode esensial main.go dengan go:embed, serta panduan konfigurasi Apache-nya.

tabel payment
kwitansi_id payment_type_id nominal