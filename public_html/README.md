# 🥨 SnackPOS - Sistem Kasir Minimarket & Portal Owner

Aplikasi Point of Sale (POS) modern bertema kasir ritel minimarket untuk toko snack dan oleh-oleh khas Indonesia. Dibangun menggunakan teknologi web modern murni (*Vanilla JavaScript, Tailwind CSS, Chart.js, dan Supabase Database*), tanpa perlu proses build atau instalasi Node.js/npm.

---

## 🌟 Fitur Utama

1. **Antarmuka Kasir Cepat (Speed POS Style)**
   - Display LED Digital raksasa untuk total belanja, pembayaran, dan kembalian.
   - Dukungan tombol pintas kasir minimarket **F1 s/d F10**.
   - Mode Scan Cepat Barcode / PLU dan Mode Layar Sentuh (*Touchscreen* foto snack).
   - Penanganan Hold Cart (Parkir Transaksi) dan Void Barang.

2. **Modul Retur Penjualan dengan Syarat Nomor Struk**
   - Validasi keaslian nomor struk transaksi asli.
   - Proteksi retur maksimal agar tidak melebihi jumlah pembelian.
   - Penambahan stok fisik otomatis kembali ke rak.
   - Cetak struk thermal bukti retur.

3. **Modul Stock Opname (SO) Toko & Mutasi Barang**
   - Perbandingan stok fisik rak vs data komputer dengan indikator selisih (+/-).
   - Eksekusi penyesuaian stok otomatis (*Adjust SO*).
   - Penerimaan pasokan barang dari supplier (LPB) dan pencatatan barang rusak/expired.

4. **Portal Pemantauan Eksekutif Khusus Owner (`owner.html`)**
   - Pemantauan omzet, laba bersih, dan margin keuntungan secara realtime dari mana saja (HP/Laptop).
   - Grafik interaktif tren omzet 14 hari dan proporsi metode bayar (Tunai vs QRIS vs Transfer).
   - 10 Snack Terlaris (*Best Sellers*).
   - Peringatan stok menipis dilengkapi tombol langsung kirim Purchase Order (PO) via WhatsApp ke supplier.
   - Auto-refresh otomatis setiap 30 detik.

5. **Integrasi Cloud Database Supabase & Mode Offline**
   - Sinkronisasi otomatis setiap 1 menit dan sinkronisasi manual tombol `[F9]`.
   - Tetap berfungsi 100% saat tidak ada koneksi internet (offline-first).

6. **Sistem Lisensi Komersial & Product Key (Vendor Edition)**
   - Kunci aktivasi perangkat (*Device Fingerprinting*).
   - Verifikasi online (Supabase) dan tanda tangan kriptografi offline (SHA-256).

---

## 🚀 Panduan Menjalankan

### Cara 1: Akses Online Langsung
- **Aplikasi Kasir (Live PWA)**: `https://pos-kasir-coj.pages.dev/index.html`
- **Portal Owner (Monitoring)**: `https://pos-kasir-coj.pages.dev/owner.html`

### Cara 2: Akses via GitHub Pages
- **Layar Kasir**: `https://deepinngedip-art.github.io/pos-kasir/index.html`
- **Portal Owner**: `https://deepinngedip-art.github.io/pos-kasir/owner.html`

### Cara 3: Menjalankan di Komputer Lokal (Untuk Developer/Tim)
Tidak memerlukan instalasi Node.js atau `npm`. Cukup clone dan buka langsung:
```bash
# Clone repositori
git clone https://github.com/deepinngedip-art/pos-kasir.git

# Jalankan server lokal bawaan Python (atau ekstensi Live Server di VS Code)
cd pos-kasir
python3 run_pos.py
```
Lalu buka browser ke `http://localhost:8080`.

---

## 🤝 Alur Kolaborasi Tim Developer

1. Buat branch baru untuk setiap fitur atau perbaikan: `git checkout -b feature/nama-fitur`.
2. Lakukan commit dan push ke branch tersebut.
3. Buat **Pull Request (PR)** ke branch `main` untuk direview.
4. Saat branch `main` dimerge, Cloudflare Pages akan otomatis mendeploy versi terbaru dalam hitungan detik.

---

## 📁 Struktur Berkas

- `index.html` : Layar utama kasir POS.
- `owner.html` : Portal monitoring khusus pemilik toko.
- `js/` : Modul-modul aplikasi kasir terisolasi (store, license, cart, checkout, scanner, member, returns, klerk, so, inventory, reports, settings, employees, app).
- `products-data.js` : Katalog 100 produk snack Indonesia dan riwayat transaksi.
- `style.css` : Tampilan tema kasir ritel modern dan display LED.
- `supabase_schema.sql` : Skrip database untuk Supabase.
- `vendor_keygen.py` : Tool generator Product Key untuk penjual aplikasi.

