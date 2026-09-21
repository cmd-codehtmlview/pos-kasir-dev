# Buku Panduan Vendor: Strategi & Sistem Penjualan Lisensi SnackPOS

Dokumen ini adalah panduan rahasia operasional untuk **Anda sebagai Penjual/Pemilik Software (Vendor)** untuk menjual aplikasi kasir **SnackPOS - Kasir Retail Minimarket & Toko Modern** ke toko-toko retail, minimarket, toko snack, dan UMKM.

---

## 💼 1. Rekomendasi Model Bisnis & Harga Jual

Sebagai pemilik software, Anda bisa menawarkan beberapa pilihan paket harga yang menarik untuk calon pembeli:

| Paket Lisensi | Rekomendasi Harga Jual | Target Konsumen | Keuntungan untuk Anda |
|---|---|---|---|
| **Paket Beli Putus (Lifetime)** | Rp 1.500.000 – Rp 2.500.000 *(sekali bayar)* | Pemilik toko yang tidak mau repot bayar bulanan | Arus kas instan besar di awal |
| **Paket Langganan 1 Tahun** | Rp 600.000 – Rp 900.000 / tahun | Ritel menengah yang ingin biaya operasional murah | Pendapatan berulang (*recurring income*) tahunan |
| **Paket Langganan Bulanan** | Rp 50.000 – Rp 99.000 / bulan | UMKM / toko baru yang ingin modal awal kecil | Pendapatan stabil tiap bulan |
| **Jasa Setup Hardware (Opsional)** | Tambahan Rp 500.000 – Rp 1.000.000 | Toko yang butuh bantuan pasang printer thermal & barcode scanner | Nilai tambah (*high margin*) |

---

## 🔑 2. Cara Menerbitkan Product Key Menggunakan `vendor_keygen.py`

Kapan pun ada pembeli baru yang memesan software ke Anda:

1. Buka terminal di komputer Anda, masuk ke folder `snack-pos`, lalu jalankan:
   ```bash
   python3 vendor_keygen.py
   ```
2. Pilih jenis lisensi yang dibeli oleh pelanggan:
   * **[1] Beli Putus (LIFETIME)**: Aktif selamanya tanpa batas waktu.
   * **[2] Langganan 1 Tahun**: Otomatis aktif 365 hari ke depan.
   * **[3] Langganan 1 Bulan**: Otomatis aktif 30 hari ke depan.
   * **[4] Demo Trial 7 Hari**: Untuk calon pembeli yang ingin coba dulu sebelum bayar.
   * **[5] Khusus OFFLINE**: Untuk toko di pelosok yang tidak memiliki koneksi internet sama sekali.
3. Masukkan **Nama Toko Pembeli** (misal: *Toko Snack Barokah*).
4. Tool akan otomatis:
   * Menghasilkan **Product Key unik** (contoh: `SPOS-LIFE-8F2A-99BC-7E14`).
   * Menampilkan **skrip SQL** untuk disimpan di Supabase lisensi Anda.
   * Menampilkan **Draf Pesan WhatsApp resmi** yang siap Anda copy-paste dan kirim langsung ke pembeli!

---

## ☁️ 3. Menyiapkan Server Lisensi di Supabase

Agar Anda bisa memantau dan memblokir toko pembeli dari jarak jauh:

1. Buka akun Supabase Anda di [https://supabase.com](https://supabase.com).
2. Buat proyek baru khusus untuk Anda sebagai Vendor (misal: `snackpos-licensing`).
3. Buka menu **SQL Editor**, lalu jalankan file **`supabase_license_schema.sql`**.
4. Di tabel `licenses`, Anda akan melihat seluruh daftar Product Key yang Anda terbitkan.
5. Anda memegang kendali penuh:
   * **Ingin Memblokir Pembeli (misal belum lunas)?**
     Cukup ubah kolom `status` dari `ACTIVE` menjadi `BLOCKED`. Aplikasi kasir di tokonya akan otomatis terkunci kembali saat terhubung internet!
   * **Ingin Memperpanjang Langganan?**
     Cukup ubah tanggal pada kolom `expires_at`.

---

## 📴 4. Cara Aktivasi Jika Toko Pembeli 100% Offline (Tanpa Internet)

Jika pembeli Anda memiliki toko di daerah tanpa sinyal internet:

1. Minta pembeli untuk membuka aplikasi SnackPOS di komputernya.
2. Pada layar aktivasi, minta mereka memfoto / menyalin **Device ID** mereka (contoh: `DEV-7B8A-42F9-C102`).
3. Di komputer Anda, buka `python3 vendor_keygen.py` -> pilih menu **[5] Buat Kunci Aktivasi Khusus OFFLINE**.
4. Masukkan Nama Toko dan Device ID pembeli.
5. Tool akan menghasilkan Product Key offline terenkripsi (contoh: `SPOS-OFFL-813A-C3A7-E0FD`).
6. Kirim key tersebut ke pembeli melalui SMS/WhatsApp.
7. Pembeli memasukkan key tersebut ke aplikasinya. Aplikasi kasir akan seketika terbuka dan aktif selamanya tanpa memerlukan koneksi internet sama sekali!

---

## 🛡️ 5. Tips Keamanan Tambahan Sebelum Menjual ke Klien

1. **Jadikan Aplikasi Desktop (.exe)**:
   * Jika pembeli menggunakan sistem operasi Windows, Anda bisa membungkus aplikasi ini menjadi file `.exe` tunggal menggunakan tools seperti **PyInstaller** atau **NW.js/Electron**. Pembeli hanya menerima file installer instalasi biasa dan tidak bisa membongkar kode sumbernya.
2. **Kunci Rahasia Vendor (`SECRET_SALT`)**:
   * Jangan bagikan string `SECRET_SALT` yang ada di `vendor_keygen.py` dan `js/license.js` kepada siapa pun, karena kunci itulah yang menjamin keaslian Product Key buatan Anda.

_Selamat menjual dan mengembangkan bisnis software ritel Anda!_ 🚀

