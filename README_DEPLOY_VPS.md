# 🚀 PANDUAN DEPLOYMENT ALL-IN-ONE SNACKPOS (POSTGRESQL + POSTGREST + NODE.JS + NGINX)

Paket ini adalah **solusi terbaik dan tuntas** yang mengimplementasikan arsitektur:
- **PostgreSQL 15/16** : Database mandiri di VPS Anda.
- **PostgREST** : Engine REST API berkecepatan tinggi (kompatibel 100% dengan `@supabase/supabase-js` di front-end).
- **Node.js (Express.js) + PM2** : Pengganti Cloudflare Functions untuk Midtrans, Tripay, dan OTP.
- **Nginx** : Web server, static file caching, dan reverse proxy.
- **Total Konsumsi RAM** : Hanya **~150 - 250 MB RAM**! Sangat ringan, cepat, dan stabil di VPS Anda (`2.27.165.72`).

---

## 🛠️ CARA INSTALASI DI VPS (2 LANGKAH SAJA)

### Langkah 1: Upload Folder ke VPS

Buka **PowerShell** di komputer Windows Anda (bukan di terminal SSH), lalu jalankan:

```powershell
scp -r E:\POS_ALFA\5_6159015271769055794\pos-kasir-vps\* root@2.27.165.72:/var/www/pos-kasir/
```
*(Atau gunakan **FileZilla / WinSCP** ke Host: `2.27.165.72`, User: `root`, lalu copy isi folder `pos-kasir-vps` ke `/var/www/pos-kasir/`).*

---

### Langkah 2: Jalankan Skrip Auto-Installer di VPS

Buka terminal SSH ke VPS:
```bash
ssh root@2.27.165.72
```

Jalankan perintah ini di VPS:
```bash
chmod +x /var/www/pos-kasir/setup-vps.sh
/var/www/pos-kasir/setup-vps.sh
```

Tunggu sekitar 1–2 menit sampai muncul pesan:
`🎉 DEPLOYMENT BERHASIL & SEMUA SERVICE BERJALAN!`

---

## 🌐 PENGUJIAN AKSES

Setelah skrip selesai, seluruh sistem langsung aktif:
* 🛒 **Aplikasi Kasir POS** : `http://2.27.165.72/index.html`
* 📊 **Portal Owner (Laporan)** : `http://2.27.165.72/owner.html`
* 🔑 **Portal Vendor Admin** : `http://2.27.165.72/v-portal-98f2a.html`
* 🐘 **Database PostgREST API** : `http://2.27.165.72/rest/v1/products`
* ⚡ **API Webhook & OTP** : `http://2.27.165.72/api/health`
