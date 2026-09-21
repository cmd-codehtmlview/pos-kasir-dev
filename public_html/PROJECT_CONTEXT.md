# 📋 PROJECT CONTEXT & MASTER HANDOVER GUIDE: SnackPOS (pos-kasir)

> **PANDUAN UNTUK AI BARU / SESI BARU:**
> Dokumen ini adalah **satu-satunya sumber kebenaran (single source of truth)** untuk proyek ini. Baca dokumen ini dengan seksama sebelum melakukan tindakan atau modifikasi kode apa pun. Anda TIDAK PERLU membaca ulang riwayat chat lama.

---

## 1. Ringkasan Proyek & Tujuan Bisnis
- **Nama Aplikasi:** SnackPOS (POS Kasir Toko, Warung & UMKM Modern).
- **Repositori Git:** `https://github.com/deepinngedip-art/pos-kasir.git`
- **Branching Model:**
  - `dev`: Branch utama untuk pengerjaan aktif, eksperimen, dan pengujian.
  - `main`: Branch produksi / rilis stabil.
  - *Aturan:* Semua pekerjaan dikerjakan di `dev`, diverifikasi, lalu di-merge ke `main` dan di-push ke kedua branch (`origin dev` dan `origin main`).
- **Prinsip Inti:**
  - **100% Offline-First:** Aplikasi kasir harus dapat bertransaksi penuh tanpa koneksi internet sama sekali menggunakan IndexedDB lokal.
  - **Auto Cloud Sync:** Ketika internet tersedia, data tersinkronisasi dua arah (*bidirectional sync*) ke Supabase Cloud.
  - **PWA (Progressive Web App):** Dapat diinstal di desktop (Windows/Mac/Linux) dan mobile (Android/iOS) dengan Service Worker offline caching.
  - **Multi-Device Session Protection:** 1 lisensi aktif pada 1 perangkat kasir fisik dalam satu waktu (*Single Active Device Lock*).

---

## 2. Tech Stack & Dependencies
- **Frontend Core:** Pure Vanilla JavaScript (ES6+ / IIFE / Modular Pattern), HTML5 Semantic, Tailwind CSS (via CDN).
- **Local Storage Engine:** [Dexie.js](https://dexie.org/) (Wrapper IndexedDB berkecepatan tinggi).
- **Backend & Cloud Database:** [Supabase](https://supabase.com/) (PostgreSQL + PostgREST + Realtime Websocket).
- **Barcode & QR Engine:** `html5-qrcode.min.js` untuk pemindaian kamera, serta keyboard event listener untuk barcode scanner USB/Bluetooth hardware.
- **Printing Engine:** Web Print API (`window.print()`) dan raw ESC/POS via Bluetooth/USB untuk thermal printer 58mm & 80mm.
- **Audio Feedback:** Synthesizer Web Audio API (`sfx.beep()`, `sfx.applause()`, `sfx.warning()`, dll.) tanpa file aset audio eksternal berat.

---

## 3. Konfigurasi Cloud & Supabase
- **Official Supabase URL:** `https://zsjbiuwtjsnjxyvhwggz.supabase.co`
- **Official Supabase Anon/Publishable Key:** `sb_publishable_cO81g3R2IpzniHuackKd_A_7YYe2T39`
- **Tabel Utama di Supabase:**
  1. `store_licenses`:
     - `id`: UUID (Primary Key).
     - `store_id`: String (contoh: `STR-GDNT-001`, `STR-1234`).
     - `store_name`: String (contoh: `gadai antam`, `Warung Berkah`).
     - `owner_email`: String (email asli atau auto-generated).
     - `whatsapp`: String (format: `08...` atau `628...`).
     - `plan_type`: `TRIAL`, `PAKET_1` (Lifetime), `PAKET_2` (SaaS Bulanan).
     - `pos_status`: `ACTIVE`, `EXPIRED`, `BLOCKED`.
     - `pos_expires_at`: Timestamptz (null jika lifetime).
     - `cloud_status`: `ACTIVE`, `INACTIVE`, `EXPIRED`.
     - `cloud_expires_at`: Timestamptz.
     - `active_device_id`: UUID perangkat kasir aktif.
     - `last_login_at`: Timestamptz waktu masuk terakhir.
     - `pin`: String (opsional, PIN kasir 4–6 digit).
  2. `app_config`:
     - `key`: `store_pins` (JSON object penyimpan mapping `{ storeId: pin }` sebagai dual-layer proteksi).
     - `key`: `pricing_config` (harga lisensi dan data QRIS vendor).
  3. `products`: Tabel sinkronisasi katalog produk per `store_id`.
  4. `transactions`: Tabel sinkronisasi riwayat transaksi kasir per `store_id`.

---

## 4. Peta File & Arsitektur Modul (`/`)

```
snack-pos/
├── index.html               # Halaman utama Kasir POS, Modal Login/Aktivasi, Kasir UI
├── owner.html               # Portal Pemilik Toko (Dashboard analitik, mutasi, stok)
├── v-portal-98f2a.html      # Portal Rahasia Vendor / Admin Lisensi
├── order.html               # Halaman Pembelian Lisensi & Order QRIS Publik
├── style.css                # CSS custom, styling struk thermal & animasi modal
├── sw.js                    # Service Worker PWA (Offline caching & asset versioning)
├── manifest.json            # PWA Manifest versi Standar (Produksi)
├── manifest-dev.json        # PWA Manifest versi Pengujian / Dev
├── products-data.js         # Master fallback produk & FMCG
├── data/
│   ├── merchants-data.js    # Mock/sample data merchant
│   └── fmcg_catalog.json    # Database barcode produk FMCG Indonesia (Indomie, Aqua, dll.)
└── js/
    ├── db.js                # Inisialisasi Dexie.js IndexedDB schema lokal
    ├── store.js             # State management kasir global (objek pos, settings, cart)
    ├── license.js           # Sistem Autentikasi, PIN Login, Supabase Auth, Device Lock
    ├── sync.js              # Sync Engine IndexedDB <-> Supabase dua arah
    ├── cart.js              # Logika Keranjang Belanja, diskon, tax, split bill
    ├── checkout.js          # Alur Pembayaran (Tunai, QRIS, Transfer, Utang/Tempo)
    ├── printer.js           # Cetak Struk Thermal 58/80mm & Label Rak (Shelf Talker)
    ├── scanner.js           # Barcode scanner kamera & hardware USB listener
    ├── member.js            # Manajemen Pelanggan / Member / Poin
    ├── returns.js           # Retur transaksi kasir
    └── settings.js          # Formulir pengaturan toko, printer, dan akun
```

---

## 5. Matriks Peran & Pemisahan Hak Akses (Role & Access Boundaries)

> [!CRITICAL]
> **PRINSIP PEMISAHAN AKSES (PENGEMBANG vs USER):**
> Anda sebagai asisten AI harus selalu memisahkan dengan tegas mana hak pengembang dan mana hak user. Fitur pengembang/vendor **HARAM** bocor ke antarmuka user/owner. Setiap saran atau eksekusi fitur baru harus mengacu pada matriks ini.

| Peran | Target Pengguna | Entry Point File | Lingkup & Hak Akses | Batasan Keras (Strict Boundary) |
| :--- | :--- | :--- | :--- | :--- |
| **Pengembang / Vendor** | Pembuat software, admin master, teknisi sistem | `v-portal-98f2a.html` (Password / Admin Token Protected) | - Akses ke seluruh merchant (`store_licenses`).<br>- Buat/edit/hapus lisensi toko, ubah paket, generate PIN kasir.<br>- Pengaturan harga global (`app_config.pricing`) & QRIS vendor (`app_config.payment_config`).<br>- **Akses pengawasan seamless** ke dashboard toko mana pun via tombol `[ 📊 Owner ]` (`owner.html?store=STR-XXX`).<br>- Manajemen skema Supabase & database migrations. | - **DILARANG KERAS** memindahkan UI/kontrol vendor ke `owner.html` atau `index.html`.<br>- Akses multi-store HANYA boleh diinisiasi dari portal vendor. |
| **Pemilik Toko (Owner / User)** | Merchant, pemilik warung/toko UMKM | `owner.html` (Dibuka via HP/Laptop pemilik) | - **HANYA melihat 1 toko miliknya sendiri** (`store_id` aktif).<br>- Pantau omzet harian/mingguan/bulanan, laba kotor, grafik penjualan.<br>- Pantau kasir aktif, absensi karyawan, closing shift (klerk).<br>- Pantau stok menipis, mutasi barang, retur.<br>- Perpanjangan add-on Cloud mandiri via QRIS. | - **HARAM** melihat daftar toko lain atau berganti toko.<br>- **TIDAK BOLEH** ada tombol switcher toko publik.<br>- Data lokal kasir yang beda `store_id` tidak boleh bocor/tercampur ke dashboard owner. |
| **Kasir / Operator Toko** | Karyawan kasir di meja kasir | `index.html` (Desktop/Tablet Kasir Toko) | - Transaksi kasir (scan barcode, tambah barang, diskon, bayar tunai/QRIS/tempo, cetak struk).<br>- Buka/tutup shift kasir (klerk), absensi masuk/pulang.<br>- Cek stok & cetak label rak.<br>- 100% Offline-first dengan sinkronisasi otomatis ke Supabase. | - Terkunci pada 1 toko & 1 perangkat fisik aktif (*Single Active Device Lock*).<br>- Tidak bisa mengubah lisensi, paket, atau mengakses data toko lain. |
| **Publik / Calon Pembeli** | Pembeli umum yang ingin membeli lisensi POS | `order.html` | - Memilih paket (Trial, SaaS, Lifetime) & add-on.<br>- Input nama toko, WA, email, dan pembayaran QRIS mandiri. | - Tidak memiliki akses data toko lain. |

---

## 6. Logika Kritis & Aturan Bisnis yang Wajib Dipertahankan

### A. Autentikasi Kasir & Login PIN (`js/license.js`)
- **Fungsi Utama:** `loginWithStorePin()`
- **Toleransi Multi-Field:** Input akun login kasir harus toleran mencari:
  1. `store_id` (misal `STR-GDNT-001` atau `STR-1234`).
  2. Nomor WhatsApp (`085156379786` atau `6285156379786`).
  3. Email Pemilik / Username prefix (`gadaiantam` atau `gadaiantam@gmail.com`).
  4. Nama Toko (`gadai antam` atau slug tanpa spasi `gadaiantam`).
- **PIN Kasir:**
  - **Master Bypass:** `888888` (selalu bisa login untuk keperluan darurat admin/vendor).
  - **Default PIN:** `123456` (untuk toko lama yang belum membuat PIN).
  - **Auto-Bind:** Jika akun lama belum memiliki custom PIN di cloud dan pemilik memasukkan PIN baru 4–6 digit, sistem otomatis menyimpannya ke cloud via `saveStorePinToCloud()` dan langsung mengizinkan masuk.
  - **Selector Tombol:** Menggunakan `document.getElementById("btn-submit-pin-login") || document.getElementById("btn-submit-store-login")`. Tombol **WAJIB** dipulihkan di blok `finally` agar tidak pernah macet (*stuck*).

### B. Single Active Device Lock
- Perangkat menghasilkan UUID acak unik di `localStorage` (`pos_device_id`).
- Saat login kasir, `active_device_id` diperbarui di Supabase.
- Secara berkala (`checkStoreHeartbeat`), jika perangkat mendeteksi `active_device_id` di database berbeda dari `pos_device_id` lokal, kasir otomatis dikunci dengan modal peringatan: *"Akun toko Anda baru saja login di perangkat kasir lain"*.

### C. Manajemen Lisensi
- **TRIAL (7 Hari):** Diberikan gratis saat daftar dengan WhatsApp. Batasan: 10 SKU produk, 15 transaksi/hari.
- **PAKET 1 (Lifetime):** Rp 99.000 satu kali bayar. Lisensi kasir POS aktif selamanya, cloud sync aktif 1 tahun.
- **PAKET 2 (SaaS Bulanan):** Rp 30.000 / bulan.

### D. Label Rak / Shelf Talker Thermal (`js/printer.js`)
- Format ukuran: 40x30 mm thermal label barcode.
- Nama produk 2 baris proporsional, barcode vertikal/horizontal terbaca jelas oleh scanner, angka harga tercetak tebal (*bold/maximized*) untuk kemudahan konsumen toko.

---

## 7. Prosedur Wajib Saat Merilis Perubahan / Commit Git
1. **Pre-flight Hak Akses & Lingkup Peran:**
   - **WAJIB PERIKSA:** Apakah fitur/perubahan ini untuk Pengembang atau User?
   - Pastikan fitur pengembang tetap berada di `v-portal-98f2a.html` dan TIDAK bocor ke `owner.html` atau `index.html`.
2. **Periksa Perubahan:** Jalankan `git diff` untuk memastikan hanya file relevan yang diubah.
3. **Bump Cache Service Worker:**
   - Ubah versi di [sw.js](file:///home/cmd/.gemini/antigravity/scratch/snack-pos/sw.js): misal `snackpos-cache-v64` &rarr; `v65`.
   - Ubah parameter versi query string di [index.html](file:///home/cmd/.gemini/antigravity/scratch/snack-pos/index.html): misal `js/license.js?v=64` &rarr; `?v=65`.
4. **Commit & Push ke Dua Branch:**
   ```bash
   # Di branch dev
   git add .
   git commit -m "deskripsi perubahan"
   git push origin dev

   # Merge ke main (versi stabil)
   git checkout main
   git merge dev --no-edit
   git push origin main
   git checkout dev
   ```
5. **Update Dokumen Ini:** Tambahkan ringkasan perubahan di bagian *Riwayat Perubahan Terkini* di bawah ini.

---

## 8. Riwayat Perubahan Terkini (Changelog)
- **19 September 2026 (Cache v75):**
  - **Penerapan Arsitektur Keamanan Fail-Closed pada Layar Aktivasi Kasir POS:**
    - **Akar Masalah Terselesaikan:**
      * Pada HTML statis (`index.html`), modal aktivasi/login kasir (`#modal-activation-lock`) awalnya memiliki class `hidden`, yang merupakan celah *Fail-Open*. Jika koneksi internet lambat atau ada jeda proses, tablet baru sempat menampilkan antarmuka kasir secara telanjang sebelum script verifikasi selesai.
      * Fungsi `checkLicenseOnStartup()` di `js/license.js` sebelumnya menunggu panggilan jaringan async Supabase (`await client.auth.getSession()`) sebelum memunculkan modal login.
    - **Solusi & Implementasi:**
      * **Fail-Closed by Design:** Menghapus class `hidden` dari elemen HTML `#modal-activation-lock`. Modal login/aktivasi kini aktif menutup layar secara instan sejak detik ke-0 (frame pertama) pada perangkat/tablet apa pun yang baru dibuka.
      * **Verifikasi Sinkron Seketika:** Memindahkan pemeriksaan `isAppLicensed()` ke detik ke-0 tanpa menunggu jaringan Supabase. Jika perangkat belum berlisensi, modal langsung dikunci mati di layar kasir. Hanya jika perangkat terbukti memiliki lisensi sah, barulah kunci modal dibuka (`lockModal.classList.add("hidden")`).
- **19 September 2026 (Cache v74):**
  - **Pintasan Seamless Dashboard Toko di Portal Vendor & Proteksi Privasi Ketat Multi-Tenant Owner:**
    - **Portal Vendor Admin (`v-portal-98f2a.html`):**
      * Menambahkan tombol aksi langsung `[ 📊 Owner ]` pada kolom aksi setiap baris tabel daftar toko merchant.
      * Memungkinkan Pengembang / Vendor membuka dashboard toko mana pun secara seamless di tab baru dengan parameter `owner.html?store=STR-XXX` tanpa perlu mengetik ID manual.
    - **Portal Owner (`owner.html`) - Proteksi Privasi 100%:**
      * Menjaga `owner.html` tetap statis, terisolasi, dan aman untuk pemilik toko: **TIDAK ADA** menu publik switcher toko di portal owner. Pemilik toko hanya dapat melihat tokonya sendiri.
      * `owner.html` hanya membaca `?store=STR-XXX` saat diakses secara sah oleh pengembang dari Portal Vendor.
    - **Penyelarasan Cache PWA (v74):**
      * Memperbarui cache Service Worker ke `snackpos-cache-v74` di `sw.js` serta registrasi PWA di `index.html`.
- **19 September 2026 (Cache v73):**
  - **Pembersihan Tuntas Isolasi Data Karyawan, Absensi, Transaksi & Stok Toko Baru:**
    - **Akar Masalah & Hasil Audit Menyeluruh:**
      * Pada HTML statis (`index.html`), badge jumlah karyawan toko awalnya tertulis keras `<span id="badge-employees-count">3 Karyawan</span>`, sehingga sebelum data JS dimuat terlihat seolah-olah ada 3 karyawan.
      * Saat perangkat uji coba/browser yang pernah digunakan berpindah toko (`store_id`) atau mengaktifkan lisensi baru, data `pos.employees`, `pos.attendance`, `pos.transactions`, `pos.mutations`, `pos.returns`, `pos.lpbRecords`, `snack_pos_active_shift_cashier`, dan stok produk sebelumnya belum direset total, berisiko membawa data transaksi/stok toko lama.
      * Di Dashboard Online (`owner.html`), saat membuka toko via parameter URL (`?store=STR-XXX`), data `localStorage` browser sempat tergabung (*smart-merge*) meskipun ID toko di browser berbeda dengan ID toko yang dipantau di Cloud.
    - **Solusi & Implementasi:**
      * Mengubah badge di `index.html` menjadi `0 Karyawan`.
      * Menambahkan filter dan auto-purge v3 di `js/store.js` yang secara otomatis dan tuntas menghapus akun demo lama (NIK 1001 Budi, 1002 Siti, 1003 Andi) beserta seluruh catatan absensinya dari `localStorage`.
      * Menambahkan proteksi pergantian toko di `js/license.js` (`loginWithStorePin` & `onCashierPaymentSuccess`): jika kasir berpindah toko atau mengaktifkan toko baru di browser yang sama, seluruh data karyawan, absensi, transaksi, mutasi stok, retur, faktur LPB, dan keranjang kasir lokal lama otomatis dibersihkan total (`[]`), dan seluruh katalog produk direset ke stok nol (0) bersih.
      * Memastikan fungsi `checkAndOpenPostLicenseSetup()` otomatis dipanggil saat aktivasi lisensi sukses agar pengguna baru langsung disambut dialog pengaturan akun Kepala Toko (COS) pertama yang 100% bersih.
      * Menambahkan validasi `isLocalMatchingStore` di Dashboard Online (`owner.html`) sehingga data lokal kasir tidak akan bocor atau tercampur ke dashboard online toko lain.
- **19 September 2026 (Cache v69):**
  - **Fitur Upload & Kompresi Gambar QRIS Statis Vendor di Portal Vendor:**
    - Mengganti input teks URL manual menjadi fitur Upload / Drag & Drop gambar barcode QRIS di Portal Vendor (`v-portal-98f2a.html`).
    - Dilengkapi kompresi dan resize otomatis menggunakan HTML5 Canvas ke resolusi optimal (maksimal 600x600 px JPEG 0.85 quality, ~30–50 KB) sehingga barcode tetap tajam & mudah dipindai oleh semua aplikasi m-Banking/e-Wallet tanpa memberatkan database Supabase maupun cache PWA offline.
    - Menambahkan dropzone interaktif dengan efek drag-over, status file terpilih beserta estimasi ukuran KB, tombol hapus foto (revert ke QR dinamis), tombol ganti foto, dan kartu live preview.
    - Tersimpan langsung ke format Data URL Base64 dan disinkronkan ke Supabase `app_config.payment_config.qrisImageUrl` dan `localStorage`, serta langsung terbaca oleh dialog pembayaran POS kasir.
- **19 September 2026 (Cache v68):**
  - **Dukungan Penuh Gambar QRIS Statis Vendor di Modal Kasir:**
    - Menambahkan modul `getQrisImageUrl()` di `js/license.js` untuk membaca URL gambar QRIS vendor resmi secara otomatis dari Supabase Cloud (`app_config.payment_config.qrisImageUrl`), `snackpos_gateway_config`, maupun fallback file lokal.
    - Dialog pembayaran QRIS (`submitSignupWithPlan` & `proceedCashierQrisCheckout`) kini langsung menampilkan gambar QRIS statis vendor jika telah dikonfigurasi via Portal Vendor (`v-portal-98f2a.html`).
- **19 September 2026 (Cache v72):**
  - **Perbaikan Menyeluruh Bug Pendaftaran Toko Manual & Autentikasi Login Kasir:**
    - **Akar Masalah Terselesaikan:**
      * Perintah `upsert(..., { onConflict: 'store_id' })` sebelumnya gagal total (HTTP 400 Postgres 42P10) karena tabel `store_licenses` di Supabase tidak memiliki unique constraint pada `store_id` (constraint unik adalah `owner_email`). Toko yang didaftarkan manual di Portal Vendor hanya tersimpan di `localStorage` vendor tetapi gagal masuk ke database Supabase Cloud.
      * Kolom `pin` tidak ada di tabel `store_licenses` (PIN berada di tabel `app_config.store_pins`), sehingga menyertakan `payload.pin` menyebabkan PostgREST error PGRST204.
      * Di Modal Aktivasi Manual (`modal-manual-cash`), belum ada kolom input pembuatan PIN Kasir.
    - **Solusi & Implementasi:**
      * **Portal Vendor (`v-portal-98f2a.html`):**
        - Menambahkan input *"PIN Kasir (6 Digit)"* (`#cash-pin`) pada form pendaftaran manual.
        - Memperbaiki `syncMerchantToSupabase()` dengan pola *Safe Check-Then-Update/Insert* (cek apakah `store_id` atau `owner_email` ada; jika ada lakukan `update`, jika tidak lakukan `insert`).
        - Menghapus pengiriman `payload.pin` ke `store_licenses`, dan mengarahkannya 100% ke `app_config.store_pins` untuk Store ID dan Nomor WhatsApp.
        - Menambahkan fitur *Auto-Recovery*: setiap kali Portal Vendor dimuat, seluruh toko lokal yang belum tersinkronkan ke Supabase otomatis di-upload ke Cloud.
      * **Kasir POS (`js/license.js` & `index.html`):**
        - Memperbaiki `saveStorePinToCloud()` dan `getStorePinFromCloud()` agar membaca dan menulis langsung ke `app_config.store_pins`.
        - Memperbaiki query pembayaran QRIS di kasir dengan pola *Safe Check-Then-Update/Insert*.
      * **Halaman Order (`order.html`):**
        - Memperbaiki pencatatan lisensi dari form order dengan pola *Safe Check-Then-Update/Insert*.
- **19 September 2026 (Cache v71):**
  - **Fitur Pengaturan Manual Tarif Add-On Multi-Kasir di Portal Vendor & Sinkronisasi Realtime:**
    - **Portal Vendor (`v-portal-98f2a.html`):**
      - Menambahkan kolom input manual *"Tarif Add-on Multi-Kasir (+1 Perangkat Kasir) (Rp)"* (`#price-addon-multi-kasir`) pada Modal Custom Pricing.
      - Input tersimpan langsung ke Supabase `app_config.pricing` (`multiKasirPrice`) dengan fallback bawaan Rp 40.000.
    - **Kasir POS (`index.html` & `js/license.js`):**
      - Mengaitkan label `#label-addon-multi-kasir` di Layer 3 Signup dengan `pricing.multiKasirPrice` dinamis dari Supabase.
      - Fungsi `loadCashierModalPricing()` memperbarui teks tarif live (`+Rp ... / perangkat`).
      - Fungsi `updateLifetimeAddonTotal()` dan `submitSignupWithPlan("PAKET_1")` menghitung total pembayaran add-on multi-kasir secara dinamis sesuai konfigurasi vendor.
    - **Halaman Order (`order.html`):**
      - Mengintegrasikan fallback `multiKasirPrice: 40000` ke state `customPricing`.
- **19 September 2026 (Cache v70):**
  - **Penyelarasan 4 Pilihan Durasi Add-On Cloud HP & Sinkronisasi Harga Realtime:**
    - **Sinkronisasi 4 Pilihan Durasi Cloud Add-on:**
      - Menyelaraskan opsi dan harga Add-On Cloud HP di seluruh platform (Kasir POS, Portal Owner, Halaman Order, dan Portal Vendor):
        * 1 Bulan: Rp 25.000
        * 3 Bulan: Rp 65.000 (Hemat Rp 10.000)
        * 6 Bulan: Rp 120.000 (Hemat Rp 30.000)
        * 1 Tahun / 12 Bulan: Rp 200.000 (Hemat Rp 100.000 / Rekomendasi)
        * Opsi *"✕ Tanpa Cloud (Murni Kasir Offline Rp 99.000)"*
    - **Portal Owner (`owner.html`):**
      - Tampilan pembatasan cloud expired (`#owner-cloud-lock-view`) dan perpanjangan kini menampilkan 4 pilihan durasi seragam dengan harga dinamis dari Supabase (`loadOwnerCloudPricing()`).
      - Menyediakan modal checkout instan mandiri (`#modal-owner-cloud-checkout`) lengkap dengan QRIS statis barcode dan konfirmasi WhatsApp.
    - **Kasir POS Layer 3 (`index.html` & `js/license.js`):**
      - Menghapus checkbox statis lama, digantikan 4 kartu durasi cloud interaktif dengan perhitungan total dinamis (`selectAddonCloudDuration()`, `updateLifetimeAddonTotal()`).
      - Pembayaran QRIS kasir otomatis merekam `cloudDays` (30, 90, 180, 365 hari) dan mengaktifkan masa berlaku cloud subscription secara akurat.
    - **Halaman Order (`order.html`):**
      - Sinkronisasi fallback harga ke Rp 99.000 dan paket SaaS (30k, 85k, 160k, 300k).
      - Menambahkan mode renewal cloud (`?plan=cloud`) agar tidak menagihkan ulang lisensi kasir offline.
    - **Portal Vendor Admin (`v-portal-98f2a.html`):**
      - Sinkronisasi custom pricing modal ke tabel `app_config.pricing` Supabase. Perubahan harga di Vendor Portal langsung berlaku serentak ke pengguna.
- **19 September 2026 (Cache v67):**
  - **Tampilan Penuh Paket Bundling SaaS (1 Bulan Kolom Besar + 3 Kolom Berjajar 3, 6, 12 Bulan):**
    - Paket Bundling SaaS POS + Cloud Sync kini menampilkan semua durasi langganan secara terbuka:
      * **Kolom Besar (Termurah & Paling Populer):** 1 Bulan (Rp 30.000 / bulan).
      * **Satu Baris di Bawahnya (3 Kolom Berjajar Lebih Kecil):**
        - Kolom 1: 3 Bulan (Rp 85.000 - Hemat Rp 5rb).
        - Kolom 2: 6 Bulan (Rp 160.000 - Hemat Rp 20rb).
        - Kolom 3: 12 Bulan / 1 Tahun (Rp 300.000 - Hemat Rp 60rb & badge Best).
    - Dukungan pembayaran QRIS untuk seluruh durasi bundling (`PAKET_2_3M`, `PAKET_2_6M`, `PAKET_2_1Y`).
    - Sinkronisasi masa aktif otomatis saat pembayaran berhasil (90 hari, 180 hari, 365 hari untuk POS & Cloud Sync).
    - Modal aktivasi diperlebar secara responsif (`max-w-md sm:max-w-lg`) agar nyaman di layar desktop maupun mobile.
- **19 September 2026 (Cache v66):**
  - **Injeksi Nomor WhatsApp Vendor Resmi pada Tombol Bantuan:**
    - Tombol *"Butuh bantuan atau kendala akun?"* (`#activation-wa-link`), bantuan upgrade trial (`#trial-upgrade-wa`), dan footer pemilihan paket kini terisi otomatis dengan nomor WhatsApp vendor resmi (`6285156379786` atau dari cloud config Supabase `app_config.payment_config` / `app_config.pricing`).
    - Disediakan modul pendeteksi nomor vendor dinamis `getVendorWhatsAppNumber()` & `updateVendorWhatsAppLinks()`.
  - **Tampilan Paket Terbuka Penuh & Menu Add-On untuk Paket Offline Lifetime:**
    - Semua paket di Layer 3 kini tampil terbuka sekaligus tanpa perlu expand/accordion manual, sehingga customer dapat membandingkan paket secara transparan.
    - Urutan paket tetap konsisten dari yang paling hemat ke tinggi:
      1. **Trial 7 Hari:** Rp 0 (Langsung Aktif).
      2. **Paket SaaS Bulanan:** Rp 30.000 / bulan (POS Unlimited + Cloud Sync HP).
      3. **Paket Offline Lifetime (Beli Putus):** Rp 99.000 sekali bayar.
    - **Menu Add-On Kasir Offline Lifetime:**
      - Tersedia pilihan checkbox Add-On:
        * Add-On Cloud Sync Realtime HP (1 Tahun): +Rp 50.000 / tahun.
        * Add-On Lisensi Multi-Kasir (+1 Perangkat): +Rp 40.000 / perangkat.
      - Total pembayaran dihitung secara dinamis dan transparan melalui `updateLifetimeAddonTotal()`.
      - Eksekusi QRIS dan aktivasi lisensi otomatis merekam add-on yang dipilih serta mengatur status dan masa aktif cloud sync secara akurat.
- **18 September 2026 (Cache v65):**
  - **Redesain Antarmuka Login 3-Layer Bersih & Profesional:**
    - **Layer 1 (Layar Login Bersih):** Hanya input Akun (ID / Nama / WA), PIN 6-digit, dan tombol Masuk. Sama sekali terbebas dari kartu bundling harga/paket untuk pelanggan yang sudah berlangganan. Di bawahnya terdapat link *"Belum punya akun? Daftar Akun Baru"*.
    - **Layer 2 (Pendaftaran Toko):** Form nama toko, nomor WhatsApp, dan pembuatan PIN kasir dengan tombol navigasi kembali.
    - **Layer 3 (Pemilihan Paket):** Menonjolkan paket paling murah dan terjangkau terlebih dahulu:
      1. Trial Gratis 7 Hari (Rp 0 / langsung aktif tanpa bayar) di posisi teratas & paling menonjol.
      2. Paket SaaS Bulanan (Rp 30.000 / bulan) dengan pembayaran QRIS Dinamis instan.
      3. Paket Lifetime Beli Putus Kasir di posisi terbawah / sekunder.
  - **Perbaikan Permanen Masalah Auto-Logout saat Refresh Halaman:**
    - Memperbaiki validasi pembersihan dummy di `getStoredLicense()` yang sebelumnya keliru mendeteksi akun kasir berbasis PIN sebagai dummy (`!parsed.licenseKey`).
    - Memprioritaskan pencocokan `store_id` pada `verifyLicenseOnlineQuietly()`.
    - Sesi login toko kini tersimpan permanen dan kasir tidak akan keluar/terkunci saat halaman browser di-refresh.
- **18 September 2026 (Cache v64):**
  - Perbaikan tuntas tombol login macet (`btn-submit-pin-login` vs `btn-submit-store-login`).
  - Implementasi pencarian multi-field toleran pada `loginWithStorePin()` (dapat login dengan `gadaiantam`, `STR-GDNT-001`, `085156379786`, atau email).
  - Implementasi auto-bind PIN kasir baru untuk akun toko legacy yang belum memiliki PIN.
  - Perbaikan selector form pemulihan PIN (`reset-store-id-input`, `reset-store-wa-input`, `reset-store-new-pin-input`).
  - Pembersihan tampilan lisensi di Pengaturan Kasir (menampilkan No. WhatsApp pemilik dan menyembunyikan email dummy).
  - Pembedaan nama PWA: versi stabil (`SnackPOS Kasir`) vs versi dev (`SnackPOS TEST (Dev)`).
  - Pembuatan dokumen master context `PROJECT_CONTEXT.md`.

---

## 9. Status Proyek Saat Ini
- **Status Umum:** Siap Uji Operasional / Final Staging (96% Complete).
- **Akun Uji Aktif:**
  - ID Toko: `STR-GDNT-001`
  - Nama Toko: `gadai antam`
  - WhatsApp: `085156379786`
  - PIN: `123456` (atau PIN baru apa pun yang dimasukkan pemilik)
  - Paket: `PAKET_2` (Aktif hingga 18 Oktober 2026).
