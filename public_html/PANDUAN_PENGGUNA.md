# Buku Panduan Pengguna: SnackPOS (Edisi Kasir Retail Minimarket)

Selamat datang di **SnackPOS Edisi Kasir Retail Minimarket**! Aplikasi kasir ini mengadopsi alur kerja, tombol fungsi, dan efisiensi sistem kasir retail modern yang dipadukan dengan database cloud **Supabase** serta modul **Stock Opname (SO)**.

---

## ⚡ 1. Cara Menjalankan Aplikasi

1. Buka folder `snack-pos`.
2. Klik ganda file **`index.html`** di browser komputer Anda (Chrome, Edge, dll.), ATAU jalankan perintah terminal:
   ```bash
   python3 run_pos.py
   ```
3. Layar kasir retail modern siap digunakan!

---

## ⌨️ 2. Daftar Tombol Cepat Keyboard Kasir (F1 - F10)

Anda bisa menggunakan tombol keyboard langsung atau mengklik tombol warna-warni di bagian bawah layar:

| Tombol | Fungsi | Keterangan |
|---|---|---|
| **F1** | **Cari Snack** | Membuka jendela pencarian cepat 100 produk snack dengan foto gambar. |
| **F2** | **Scan PLU / Barcode** | Memindahkan kursor langsung ke kolom tembak barcode scanner. |
| **F3** | **Retur Struk** | Memproses retur barang belanjaan konsumen berdasarkan nomor struk. |
| **F4** | **Pending Transaksi** | Menunda transaksi pembeli saat antrean berikutnya ingin dilayani duluan. |
| **F5** | **Void Item** | Menghapus barang yang salah scan dari daftar belanjaan. |
| **F6** | **Stock Opname (SO)** | Membuka aplikasi hitung fisik di rak dan rekonsiliasi nilai laba rugi. |
| **F7** | **Mutasi Barang (LPB)** | Input pasokan barang masuk dari supplier atau mutasi inventaris. |
| **F8** | **Klerk / Closing Shift** | Rekonsiliasi uang komputer vs fisik di laci kasir saat pergantian shift. |
| **F9** | **Sync Cloud** | Sinkronisasi manual ke database Supabase seketika. |
| **F10**| **Laporan Penjualan** | Membuka rekap omzet, laba rugi, Stock Opname, dan ekspor CSV. |
| **ESC**| **Batal / Keluar** | Menutup jendela popup/modal yang sedang terbuka. |

---

## 📋 3. Panduan Fitur Stock Opname (SO Toko)

*Sama persis seperti rutinitas Stock Opname retail modern untuk mencocokkan stok fisik di rak dengan komputer:*

1. Tekan tombol **`[F6] SO Toko`** di keyboard atau klik tombol ungu di bawah.
2. Di tabel SO:
   * Kolom **Stok Komputer** menampilkan angka stok di sistem saat ini.
   * Kolom **Hitungan Fisik Rak** adalah tempat Anda memasukkan hasil hitungan fisik di rak toko (bisa diketik atau scan barcode produk satu per satu).
3. Perhatikan indikator selisih:
   * **Biru (+)**: Barang berlebih (*Plus*).
   * **Merah (-)**: Barang hilang / susut (*Minus*).
   * **Hijau (0)**: Jumlah fisik dan komputer pas (*Cocok*).
4. Klik tombol **`⚡ EKSEKUSI PENYESUAIAN STOK (ADJUST SO)`**.
5. Stok komputer akan seketika di-update mengikuti stok fisik di rak dan berita acara selisih otomatis dicatat ke riwayat mutasi serta disinkronkan ke Supabase!

---

## 📦 4. Panduan Mutasi Barang (LPB Supplier & Barang Rusak)

Tekan tombol **`[F7] Mutasi LPB`**:
1. **Barang Masuk (LPB)**:
   * Pilih nama snack, pilih jenis *Barang Masuk (LPB Supplier)*, isi jumlah pasokan baru, dan tulis no faktur supplier.
   * Stok barang akan bertambah otomatis.
2. **Barang Rusak / Expired**:
   * Pilih jenis *Barang Rusak / Expired*, isi jumlah barang yang rusak, dan tulis keterangannya.
   * Stok barang akan berkurang otomatis dan dicatat sebagai beban kerugian.

---

## ☁️ 5. Panduan Menghubungkan ke Database Cloud Supabase

Aplikasi ini memiliki fitur **Sinkronisasi Otomatis Tiap 1 Menit** di latar belakang jika ada internet, dan tetap bisa transaksi lancar jika offline.

### Langkah Menghubungkan:
1. Buka dashboard Supabase Anda di browser ([https://supabase.com](https://supabase.com)).
2. Masuk ke menu **SQL Editor** (ikon `>_` di menu kiri).
3. Buka file **`supabase_schema.sql`** yang ada di folder `snack-pos`, salin (copy) seluruh kodenya, tempel (paste) di SQL Editor Supabase, lalu klik tombol hijau **RUN**.
4. Masuk ke menu **Project Settings** (ikon gerigi ⚙️) -> klik **API**.
5. Salin:
   * **Project URL**
   * **Project API Keys (`anon` public)**
6. Buka aplikasi SnackPOS di browser -> klik tab **`⚙️ Setting & Supabase`**.
7. Tempelkan URL dan Key di kolom yang tersedia, klik **Tes Koneksi**, lalu klik **Simpan Pengaturan**.
8. Indikator di pojok kanan atas akan berubah menjadi **`🟢 ONLINE (Auto-Sync 1 Mnt)`**!

---

## 📊 6. Laporan Laba Rugi 30 Hari & Ekspor Excel

Tekan tombol **`[F10] Laporan`**:
* Anda bisa melihat rekap **30 hari terakhir**: Total Omzet, Total Modal HPP, Laba Bersih, Rata-rata Margin %, serta Top 10 Snack Terlaris.
* Klik tombol **`📥 Export Excel / CSV`** untuk mengunduh rekap transaksi ke spreadsheet Excel untuk pembukuan bulanan toko Anda.

---

## 🔄 7. Panduan Fitur Retur Penjualan Kasir (Syarat Nomor Struk)

Sama seperti standar operasional di ritel modern, pembeli hanya dapat mengembalikan barang jika menyertakan **Nomor Struk Belanja**.

### ⚖️ Perbedaan VOID vs RETUR:
* **VOID (`[F5]` / Tombol Merah)**: Digunakan saat kasir masih menginput belanjaan di layar kasir (transaksi **belum dibayar**). Menghapus item yang salah scan.
* **RETUR (`[RETUR]` / Tombol Oranye)**: Digunakan untuk transaksi belanja yang **sudah selesai dan sudah dicetak struknya**. Pelanggan datang kembali membawa barang dan struk belanja untuk meminta pengembalian dana (*refund*) dan barang dikembalikan ke toko.

### 📋 Langkah-langkah Melakukan Retur:
1. **Buka Menu Retur**:
   * Klik tombol **`🔄 Retur Struk`** di header atas, ATAU
   * Klik tombol **`[RETUR]`** di baris tombol fungsi bagian bawah layar, ATAU
   * Di tab **`[F10] Laporan`**, klik tombol **`Retur`** di samping nomor struk terkait pada tabel riwayat transaksi.
2. **Masukkan Nomor Struk Transaksi**:
   * Ketik atau scan barcode nomor struk belanja pelanggan (contoh: `TRX-20260911-0168`).
   * Anda juga bisa mengklik salah satu chip **Struk Terbaru** untuk memilih struk dengan cepat.
   * Klik tombol **`🔍 Cari Struk`** (atau tekan Enter).
3. **Verifikasi Barang & Tentukan Qty Retur**:
   * Sistem akan menampilkan data struk: Tanggal belanja, nama kasir, total belanja, dan daftar snack yang dibeli.
   * Masukkan jumlah snack yang ingin diretur menggunakan tombol `+` / `-` atau ketik langsung.
   * *Fitur Proteksi Retur*: Sistem secara cerdas membatasi jumlah retur maksimal sesuai sisa barang yang belum diretur sebelumnya agar tidak terjadi kecurangan/retur dobel.
4. **Pilih Alasan & Pengembalian Stok**:
   * Pilih alasan retur (misal: *Kemasan Rusak / Bocor*, *Salah Beli Varian*, *Kualitas Melempem / Cacat*, dll.).
   * Pastikan opsi **"Tambahkan Kembali ke Stok Jual (Stok Bertambah) ✅"** tetap dicentang agar stok barang di rak toko otomatis ditambahkan kembali.
5. **Cek Nominal Refund & Eksekusi**:
   * Banner hitam di bawah akan menampilkan **TOTAL DANA REFUND KE PELANGGAN** yang wajib dikembalikan secara tunai.
   * Klik tombol **`⚡ PROSES RETUR & CETAK STRUK RETUR`**.
6. **Cetak Struk Bukti Retur Thermal**:
   * Struk bukti retur thermal (ukuran 58mm / 80mm) akan langsung tampil di layar lengkap dengan rincian barang, total pengembalian uang, serta kolom **Tanda Tangan Kasir** dan **Tanda Tangan Pelanggan**.
   * Klik tombol **`🖨️ Cetak Struk Retur`** untuk mencetak ke printer thermal.
7. **Pencatatan Otomatis & Supabase Cloud**:
   * Stok snack seketika bertambah di sistem komputer.
   * Riwayat mutasi stok `RETURN_SALE` tercatat otomatis di modul mutasi.
   * Riwayat retur tersimpan di tab Laporan dan disinkronkan ke cloud Supabase!

