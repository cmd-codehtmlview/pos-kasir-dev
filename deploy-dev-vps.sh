#!/bin/bash
set -e

echo "=========================================================="
echo "🚀 DEPLOYMENT JALUR DEV STAGING - SNACKPOS"
echo "=========================================================="

echo "📥 [1/3] Sinkronisasi Kode Branch DEV dari GitHub ke VPS..."
if [ ! -d "/var/www/pos-kasir-dev" ]; then
    echo "Cloning repositori branch dev ke /var/www/pos-kasir-dev..."
    git clone -b dev https://github.com/cmd-codehtmlview/pos-kasir-dev.git /var/www/pos-kasir-dev
else
    echo "Memperbarui folder /var/www/pos-kasir-dev..."
    cd /var/www/pos-kasir-dev
    git fetch origin dev
    git reset --hard origin/dev
fi

echo "🌐 [2/3] Menerapkan Konfigurasi Nginx (Rute /dev/ Tanpa Cache)..."
if [ -f "/var/www/pos-kasir-dev/nginx/pos-kasir.conf" ]; then
    cp /var/www/pos-kasir-dev/nginx/pos-kasir.conf /etc/nginx/sites-available/pos-kasir
    nginx -t
    systemctl reload nginx
fi

echo "🛡️ [3/3] Menyesuaikan Izin Folder..."
chown -R www-data:www-data /var/www/pos-kasir-dev/public_html
chmod -R 755 /var/www/pos-kasir-dev/public_html

echo ""
echo "=========================================================="
echo "✅ JALUR DEV BERHASIL DI-DEPLOY & AKTIF!"
echo "👉 Link Uji Coba DEV (HP/Laptop) : https://2.27.165.72.sslip.io/dev/"
echo "👉 Link Kasir Toko (Produksi)    : https://2.27.165.72.sslip.io/"
echo "=========================================================="

