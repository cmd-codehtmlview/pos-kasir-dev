# PROJECT CONTEXT & RIWAYAT PENGEMBANGAN: SnackPOS (pos-kasir-dev)

> Dokumen ini dibuat agar AI Assistant (Antigravity / Claude Code / Copilot) di perangkat laptop atau akun lain dapat langsung memahami seluruh konteks, arsitektur, histori keputusan, dan standar aturan pengembangan projek ini tanpa kehilangan konteks sebelumnya.

---

## 📌 1. Ringkasan & Identitas Projek

* **Nama Aplikasi**: **SnackPOS** (Aplikasi Kasir POS Toko Retail, Minimarket & F&B).
* **Komponen Utama**:
  1. **Aplikasi Kasir Utama (POS)**: `public_html/index.html` (transaksi cepat, barcode scan, keranjang, multi-metode pembayaran, struk thermal, shift klerk kasir).
  2. **Portal Owner (Back-Office & Mobile Dashboard)**: `public_html/owner.html` (KPI omzet real-time, laba kotor, DSI ketahanan stok, valuasi aset HPP, grafik metode bayar, monitoring transaksi live ala TikTok Seller Center).
  3. **Halaman Pembelian & Upgrade Lisensi**: `public_html/order.html` (pembayaran QRIS dinamis/statis, aktivasi cloud sync, add-on).
  4. **Aplikasi Android**: `android/` (dibungkus menggunakan Capacitor JS menjadi APK).
* **Tech Stack**:
  * **Frontend**: Pure HTML5, Modular JavaScript (`public_html/js/*.js`), Tailwind CSS (via CDN), Chart.js.
  * **Database & Cloud**: Supabase Self-Hosted pada VPS (`https://2.27.165.72.sslip.io`).
  * **Hardware Interop**: Web Bluetooth API untuk Thermal Printer ESC/POS (58mm & 80mm).

---

## 🌐 2. Lingkungan Server & Git Architecture

* **Git Repository**: `https://github.com/cmd-codehtmlview/pos-kasir-dev.git`
* **Active Working Branch**: **`dev`** *(Semua pekerjaan wajib di branch `dev`)*.
* **Server VPS Development**:
  * **IP / Host**: `2.27.165.72`
  * **Web Root Dev**: `/var/www/pos-kasir-dev/`
  * **URL Live Dev**: `https://2.27.165.72.sslip.io/dev/index.html`
  * **URL Portal Owner**: `https://2.27.165.72.sslip.io/dev/owner.html`
* ⚠️ **ATURAN MUTLAK**:
  * **JANGAN PERNAH menyentuh folder production `/var/www/pos-kasir/`** di VPS tanpa izin eksplisit pengguna!
  * Semua pengujian dan deployment hanya ditujukan ke `/var/www/pos-kasir-dev/`.

---

## 🎨 3. Keputusan Desain & Aturan Keras Pengguna (Design Rules)

Pengguna memiliki preferensi desain yang sangat spesifik dan ketat:

### A. Menu Autentikasi / Onboarding Awal (`#modal-activation-lock`)
1. **Hanya 2 Layer Bersih**:
   * **Layer 1: Login** (`#auth-layer-login`): ID Toko / No. HP (`#act-store-id-input`), PIN (`#act-store-pin-input`), tombol `Masuk`, link `Lupa PIN?`, dan tombol beralih `Belum punya akun? Daftar`.
   * **Layer 2: Daftar** (`#auth-layer-signup`): Nama Toko (`#signup-store-name`), Nomor WhatsApp (`#signup-store-wa`), PIN (`#signup-store-pin`), tombol `Daftar` (langsung aktif mode starter/trial tanpa layer harga di awal), dan tombol beralih `Sudah punya akun? Masuk`.
2. **PILIHAN PAKET / PRICING DIHAPUS DARI MODAL AWAL**:
   * Pemilihan paket/upgrade diletakkan **di dalam aplikasi** (misal saat mengakses menu/fitur tertentu yang membutuhkan upgrade, diarahkan ke `order.html` atau `#modal-trial-upgrade`).
3. **MUTLAK TANPA IKON & TANPA EMOJI**:
   * Tidak boleh ada emoji/simbol apapun di modal login & signup (`⚡`, `👁️`, `✕`, `💬`, `✨`, `🎉`, `🚀`, `🔒`, `🔐`, panah `→`, dll).
   * Tombol lihat PIN wajib teks bersih: `Lihat` / `Sembunyi` (bukan emoji mata).
   * Tombol tutup modal: teks `Tutup` (bukan tanda silang `✕`).
4. **MUTLAK TANPA EMBEL-EMBEL KATA / SLOGAN**:
   * Hapus seluruh kalimat marketing, tips bertele-tele, atau instruksi panjang. Hanya tampilkan label kolom dan nama tombol aksi secara to-the-point.
5. **Ukuran Minimalis**: Container ramping `max-w-sm rounded-2xl` dengan border flat netral.

### B. Header Aplikasi Kasir
* Tombol **"Isi Dummy"** dan **"Reset"** sudah dihapus permanen karena aplikasi masuk tahap produksi.
* Fokus kasir tunggal: Label kasir (POS 01) dan tombol login cepat portal owner dihapus dari header.
* Jarak antara header dengan seksi konten/periode dibuat rapat dan proporsional.

### C. Tema (Dual Mode)
* Menggunakan **Dual Mode (Light & Dark)** dengan toggle switch minimalis di header.
* **Default tema: Dark**.
* Pada mode Light: Tampilan dibuat flat bersih, putih seragam ala **TikTok Seller Center** (tanpa glow atau bayangan gelap tebal).
* Detail aksen warna (seperti detik sync, produk dianalisis, nomor member) harus seragam terang di mode putih.

### D. Metode Pembayaran & Chart
* Pada lingkaran chart metode pembayaran maupun ringkasan teks di bawahnya, wajib menampilkan **nominal Rupiah** di samping persentase (contoh: `QRIS: 45.5% (Rp 1.250.000)`).

### E. Closing Shift Kasir (Klerk Kasir / X-Z Report)
* Tombol **"↺ Hitung Ulang"** dihapus permanen untuk mencegah manipulasi kasir.
* Setelah closing disimpan, shift kasir sah dan terkunci secara permanen. Transaksi baru otomatis masuk ke shift berikutnya.

### F. Navigasi & Cetak Struk
* Dialog konfirmasi `beforeunload` browser telah dibersihkan agar saat beralih antara kasir dan Portal Owner tidak muncul popup native yang mengganggu.

---

## 📂 4. Struktur File & Modul Penting

```
pos-kasir-dev/
├── public_html/
│   ├── index.html           # UI Kasir utama & seluruh modal sistem
│   ├── owner.html           # UI Portal Owner (KPI, DSI, CRM, analytics)
│   ├── order.html           # UI Pembelian paket & lisensi via QRIS
│   ├── js/
│   │   ├── pos.js           # Core kasir, keranjang, katalog produk, barcode, stock opname
│   │   ├── license.js       # Autentikasi toko, aktivasi lisensi, Supabase sync, reset PIN
│   │   ├── printer.js       # Driver Bluetooth thermal printer (ESC/POS)
│   │   └── owner.js         # Logika analytics, DSI, chart omzet, live transactions
├── android/                 # Projek Android Capacitor
├── deploy-dev-vps.sh        # Skrip deploy otomatis ke VPS dev
└── PROJECT_CONTEXT.md       # File konteks ini
```

---

## 🚀 5. Perintah Standar (Cheat Sheet)

### Menjalankan di Lokal Laptop:
* Pasang ekstensi **Live Server** di VS Code -> Klik kanan `public_html/index.html` -> **Open with Live Server**.

### Git Sync:
* Tarik update terbaru: `git pull origin dev`
* Simpan perubahan:
  ```bash
  git add .
  git commit -m "feat/fix: deskripsi perubahan"
  git push origin dev
  ```

---

## 💡 6. Prompt Untuk AI Assistant di Laptop

Jika Anda membuka sesi Antigravity baru di laptop, cukup kirimkan prompt ini di obrolan pertama:

> *"Halo! Saya sedang melanjutkan pengerjaan projek SnackPOS di laptop. Silakan baca file `PROJECT_CONTEXT.md` di root repository untuk memahami seluruh arsitektur, standar desain, dan riwayat keputusan sebelumnya. Pastikan kita selalu bekerja di branch `dev` dan mematuhi seluruh aturan desain (misal: tanpa emoji/fluff di auth, tema flat, dll). Apa yang bisa kita lanjutkan sekarang?"*

