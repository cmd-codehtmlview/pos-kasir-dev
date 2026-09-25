#!/bin/bash
# ==============================================================================
# SnackPOS - Official Release Gatekeeper Script (Dev -> Main / Produksi)
# Skrip ini memindahkan pembaruan teruji dari 'dev' ke 'main' secara aman.
# ==============================================================================
set -e

VPS_HOST="2.27.165.72"
VPS_USER="root"
SSH_KEY="scratch/id_ed25519"
PROD_DIR="/var/www/pos-kasir"
DEV_DIR="/var/www/pos-kasir-dev"

echo "=========================================================="
echo "🚀 SNACKPOS - GERBANG RILIS SATU PINTU (DEV -> PRODUKSI)"
echo "=========================================================="
echo "Status Saat Ini:"
git branch --show-current
git log -n 1 --oneline

echo ""
echo "⚠️  PERINGATAN:"
echo "Tindakan ini akan mempromosikan seluruh pembaruan dari branch 'dev'"
echo "ke branch 'main' dan memperbarui URL Toko Riil (https://$VPS_HOST.sslip.io/)."
echo ""
read -p "Apakah Anda yakin ingin merilis ke PRODUKSI sekarang? (y/N): " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo "❌ Rilis dibatalkan. Tidak ada perubahan yang dibuat pada versi produksi."
  exit 0
fi

echo ""
echo "📦 [1/4] Memeriksa status git lokal..."
CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "dev" ]]; then
  echo "❌ Anda harus berada di branch 'dev' untuk menjalankan rilis ini!"
  exit 1
fi

if [[ -n $(git status --porcelain | grep -v "scratch/") ]]; then
  echo "❌ Terdapat perubahan yang belum di-commit di branch dev. Harap commit terlebih dahulu!"
  exit 1
fi

echo "🔀 [2/4] Menggabungkan (Merge) branch 'dev' ke 'main'..."
git checkout main
git merge dev -m "feat(release): official release from dev $(date '+%Y-%m-%d %H:%M:%S')"
git push origin main
git checkout dev

echo "🛡️ [3/4] Membuat Auto-Backup folder produksi di VPS ($VPS_HOST)..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$VPS_USER@$VPS_HOST" \
  "BACKUP_NAME=\"$PROD_DIR/public_html.bak_\$(date +%Y%m%d_%H%M%S)\" && cp -r $PROD_DIR/public_html \$BACKUP_NAME && echo \"✅ Backup tersimpan: \$BACKUP_NAME\""

echo "🚀 [4/4] Menyinkronkan file public_html ke folder produksi..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$VPS_USER@$VPS_HOST" \
  "rsync -av --delete $DEV_DIR/public_html/ $PROD_DIR/public_html/ && chown -R www-data:www-data $PROD_DIR/public_html && systemctl reload nginx"

echo ""
echo "=========================================================="
echo "🎉 RILIS PRODUKSI BERHASIL TUNTAS!"
echo "=========================================================="
echo "🛒 URL Produksi (Toko Riil) : https://$VPS_HOST.sslip.io/"
echo "🧪 URL Dev (Pengujian)      : https://$VPS_HOST.sslip.io/dev/"
echo "📊 Portal Owner Produksi    : https://$VPS_HOST.sslip.io/owner.html"
echo "=========================================================="
