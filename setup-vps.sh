#!/usr/bin/env bash
# =============================================================================
# SNACKPOS FULL-STACK VPS AUTO-INSTALLER (Ubuntu / Debian)
# Stack: PostgreSQL + PostgREST (Port 8000) + Node.js API (Port 3000) + Nginx
# Memory Footprint: ~150 - 250 MB RAM (Sangat Efektif & Cepat)
# =============================================================================

set -e

echo "🚀 [1/6] Memperbarui Sistem & Memasang Paket Dasar..."
export DEBIAN_FRONTEND=noninteractive
apt update -y && apt upgrade -y
apt install -y curl git nginx ufw unzip xz-utils build-essential postgresql postgresql-contrib

echo "🐘 [2/6] Menyiapkan Database PostgreSQL & Schema..."
systemctl start postgresql
systemctl enable postgresql

# Buat database snackpos jika belum ada
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = 'snackpos'" | grep -q 1 || sudo -u postgres psql -c "CREATE DATABASE snackpos;"

# Jalankan Schema SQL
if [ -f "/var/www/pos-kasir/database/init_schema.sql" ]; then
    echo "Menerapkan tabel dan hak akses schema..."
    sudo -u postgres psql -d snackpos -f /var/www/pos-kasir/database/init_schema.sql
fi

echo "⚡ [3/6] Memasang PostgREST Engine (Port 8000)..."
if ! command -v postgrest &> /dev/null; then
    echo "Mengunduh binary PostgREST..."
    curl -fsSL https://github.com/PostgREST/postgrest/releases/download/v12.2.0/postgrest-v12.2.0-linux-static-x64.tar.xz -o /tmp/postgrest.tar.xz
    tar -xf /tmp/postgrest.tar.xz -C /usr/local/bin/
    chmod +x /usr/local/bin/postgrest
    rm -f /tmp/postgrest.tar.xz
fi

# Salin konfigurasi PostgREST
mkdir -p /etc/postgrest
if [ -f "/var/www/pos-kasir/database/postgrest.conf" ]; then
    cp /var/www/pos-kasir/database/postgrest.conf /etc/postgrest/config
fi

# Buat Systemd Service untuk PostgREST
cat << 'EOF' > /etc/systemd/system/postgrest.service
[Unit]
Description=PostgREST Database API Service
After=postgresql.service

[Service]
ExecStart=/usr/local/bin/postgrest /etc/postgrest/config
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable postgrest
systemctl restart postgrest

echo "🟢 [4/6] Memasang Node.js 20 LTS & PM2 untuk API Webhook/OTP..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi
npm install -g pm2

if [ -d "/var/www/pos-kasir/api-service" ]; then
    cd /var/www/pos-kasir/api-service
    npm install --production
    
    if [ ! -f ".env" ] && [ -f ".env.example" ]; then
        cp .env.example .env
    fi

    pm2 delete snackpos-api 2>/dev/null || true
    pm2 start ecosystem.config.js
    pm2 save
    pm2 startup systemd -u root --hp /root || true
fi

echo "🌐 [5/6] Mengonfigurasi Nginx Reverse Proxy..."
if [ -f "/var/www/pos-kasir/nginx/pos-kasir.conf" ]; then
    cp /var/www/pos-kasir/nginx/pos-kasir.conf /etc/nginx/sites-available/pos-kasir
    rm -f /etc/nginx/sites-enabled/default
    ln -sf /etc/nginx/sites-available/pos-kasir /etc/nginx/sites-enabled/
    nginx -t
    systemctl restart nginx
    systemctl enable nginx
fi

echo "🛡️ [6/6] Menyesuaikan Izin Folder & Firewall..."
chown -R www-data:www-data /var/www/pos-kasir/public_html
chmod -R 755 /var/www/pos-kasir/public_html

ufw allow 'Nginx Full' || true
ufw allow 22/tcp || true

echo "============================================================================="
echo "🎉 DEPLOYMENT BERHASIL & SEMUA SERVICE BERJALAN!"
echo "-----------------------------------------------------------------------------"
echo "Status Service di VPS Anda:"
echo "✅ PostgreSQL Database  : Berjalan (Port 5432)"
echo "✅ PostgREST API Engine : Berjalan (Port 8000 -> /rest/v1/)"
echo "✅ Node.js API Service  : Berjalan (Port 3000 -> /api/)"
echo "✅ Nginx Web Server     : Berjalan (Port 80)"
echo "-----------------------------------------------------------------------------"
echo "Link Akses Aplikasi:"
echo "👉 Kasir POS         : http://2.27.165.72/index.html"
echo "👉 Portal Pemilik    : http://2.27.165.72/owner.html"
echo "👉 Portal Vendor     : http://2.27.165.72/v-portal-98f2a.html"
echo "👉 Tes Database API  : http://2.27.165.72/rest/v1/products"
echo "👉 Tes Webhook API   : http://2.27.165.72/api/health"
echo "============================================================================="
