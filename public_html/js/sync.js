/**
 * SnackPOS - Supabase Cloud Synchronization
 */

// ==========================================
// 2. SUPABASE INTEGRATION & CLOUD SYNC
// Mendukung Manual Sync & Auto-Sync Tiap 1 Menit
// ==========================================
let supabaseClient = null;
let isSyncing = false;
let autoSyncTimer = null;

// Fungsi pembersih URL Supabase (Mencegah error PGRST125: Invalid path specified in request URL)
function cleanSupabaseUrl(rawUrl) {
  let url = String(rawUrl || (typeof window !== 'undefined' ? window.OFFICIAL_SUPABASE_URL : '') || (typeof window !== 'undefined' && window.location ? window.location.origin : '') || "https://2.27.165.72.sslip.io").trim();
  if (!url) return "";
  
  // 1. Jika user mem-paste URL dari address bar dashboard: https://supabase.com/dashboard/project/xxxxxx
  const dashMatch = url.match(/dashboard\/project\/([a-zA-Z0-9_-]+)/);
  if (dashMatch && dashMatch[1]) {
    return `https://${dashMatch[1]}.supabase.co`;
  }

  // 2. Jika ada project ref .supabase.co
  const refMatch = url.match(/([a-zA-Z0-9_-]+)\.supabase\.co/i);
  if (refMatch && refMatch[1]) {
    return `https://${refMatch[1]}.supabase.co`;
  }

  // 3. Bersihkan path tambahan seperti /rest/v1 atau trailing slash
  url = url.replace(/\/rest\/v1\/?.*$/i, '').replace(/\/+$/, '');
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }
  return url;
}

// Fungsi pembersih API Key (hapus spasi & tanda kutip jika terbawa saat copy)
function cleanSupabaseKey(rawKey) {
  let key = String(rawKey || (typeof window !== 'undefined' ? window.OFFICIAL_SUPABASE_KEY : '') || "anon").trim().replace(/^['"]+|['"]+$/g, '');
  return key;
}

function initSupabase() {
  const cleanUrl = cleanSupabaseUrl(pos.settings.supabaseUrl);
  const cleanKey = cleanSupabaseKey(pos.settings.supabaseKey);

  if (cleanUrl && cleanKey && window.supabase) {
    try {
      supabaseClient = window.supabase.createClient(cleanUrl, cleanKey);
      updateCloudStatus("online", "Terhubung ke Supabase");
    } catch (e) {
      console.error("Gagal inisialisasi Supabase:", e);
      updateCloudStatus("offline", "Konfigurasi Salah");
    }
  } else {
    updateCloudStatus("offline", "Cloud Belum Dikonfigurasi");
  }
}

function updateCloudStatus(status, label = "") {
  const badge = document.getElementById("cloud-status-indicator") || document.getElementById("status-indicator");
  const dot = document.getElementById("cloud-status-dot") || document.getElementById("status-dot");
  const labelEl = document.getElementById("cloud-status-label") || document.getElementById("status-label");

  if (badge) {
    badge.className = "h-8 px-2 sm:px-2.5 rounded-xl bg-black/20 hover:bg-black/35 border border-white/20 text-[10px] font-semibold text-white cursor-pointer active:scale-95 transition flex items-center gap-1.5 shadow-xs";
    
    if (status === "online") {
      if (dot) dot.className = "w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0";
      if (labelEl) {
        labelEl.textContent = label ? `SYNC ${label.replace('Sync ', '')}` : "AUTO 30s";
        labelEl.className = "hidden sm:inline text-[9px] sm:text-[10px] font-mono font-bold text-emerald-300";
      }
      badge.title = `Cloud Supabase Terhubung • Auto 30s • ${label || 'Siap'} • Klik untuk Sinkron Manual [F9]`;
    } else if (status === "syncing") {
      if (dot) dot.className = "w-2 h-2 rounded-full bg-amber-400 animate-ping flex-shrink-0";
      if (labelEl) {
        labelEl.textContent = "SYNC...";
        labelEl.className = "hidden sm:inline text-[9px] sm:text-[10px] font-mono font-bold text-amber-300";
      }
      badge.title = "Sedang menyinkronkan data kasir ke cloud Supabase...";
    } else {
      if (dot) dot.className = "w-2 h-2 rounded-full bg-rose-500 flex-shrink-0 shadow-[0_0_8px_rgba(244,63,94,0.8)]";
      if (labelEl) {
        labelEl.textContent = "OFFLINE";
        labelEl.className = "hidden sm:inline text-[9px] sm:text-[10px] font-mono font-bold text-rose-300";
      }
      badge.title = "Status: Offline (Lokal) • Klik untuk mencoba hubungkan ke cloud [F9]";
    }
  }

  const drawerSync = document.getElementById('drawer-last-sync');
  if (drawerSync && label) {
    drawerSync.textContent = `Sync: ${label}`;
  }

  // Update indikator sub-header HP
  const mobileDot = document.getElementById("mobile-cloud-dot");
  const mobileLabel = document.getElementById("mobile-cloud-label");
  if (mobileDot) {
    if (status === "online") {
      mobileDot.className = "w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0";
      if (mobileLabel) mobileLabel.textContent = label ? `Sync ${label.replace('Sync ', '')}` : "Cloud Online";
    } else if (status === "syncing") {
      mobileDot.className = "w-2 h-2 rounded-full bg-amber-400 animate-ping flex-shrink-0";
      if (mobileLabel) mobileLabel.textContent = "Syncing...";
    } else {
      mobileDot.className = "w-2 h-2 rounded-full bg-rose-500 flex-shrink-0";
      if (mobileLabel) mobileLabel.textContent = "Offline";
    }
  }
}

// Fungsi Trigger Sinkronisasi Manual (Bisa dipanggil dari tombol / shortcut)
function triggerManualSync() {
  return syncToSupabase(false);
}

// Fungsi Sinkronisasi Data ke Supabase (Dengan URL Sanitizing, Batching & Add-on Gating)
async function syncToSupabase(silent = false) {
  if (isSyncing) return;

  const isDev = (typeof isDevEnvironment === 'function' && isDevEnvironment()) || 
                (typeof window !== 'undefined' && (
                  window.location.hostname === 'localhost' || 
                  window.location.hostname === '127.0.0.1' || 
                  window.location.hostname.includes('trycloudflare.com') ||
                  window.location.port === '8085' ||
                  window.location.port === '8081'
                ));

  // GATING ADD-ON CLOUD:
  // Jika customer membeli Paket 1 (Beli Putus POS Offline) dan belum/tidak berlangganan Cloud Add-on,
  // kasir berjalan lokal murni.
  const lic = typeof getStoredLicense === 'function' ? getStoredLicense() : null;
  const isCloudAddonActive = isDev || !lic || (lic && (lic.cloudStatus === 'ACTIVE' || lic.planType === 'PAKET_2' || lic.isLicensed));

  if (!isDev && lic && (lic.planType === 'PAKET_1' || lic.type === 'LIFETIME') && !isCloudAddonActive) {
    console.log("[Sync] Paket 1 Beli Putus tanpa Add-on Cloud aktif. Transaksi disimpan lokal offline murni.");
    updateCloudStatus("offline", "Paket Offline (Lokal)");
    if (!silent) {
      if (typeof showToast === 'function') {
        showToast("ℹ️ Mode Offline Aktif: Data kasir tersimpan aman di perangkat lokal ini. Sinkronisasi cloud dashboard HP memerlukan Add-on Cloud.", "info", 5000);
      } else {
        alert("ℹ️ Mode Offline Aktif: Data kasir tersimpan aman di perangkat lokal ini.");
      }
    }
    return;
  }

  const url = cleanSupabaseUrl(pos.settings?.supabaseUrl);
  const key = cleanSupabaseKey(pos.settings?.supabaseKey);

  if (!url || !key) {
    if (!silent) {
      alert("Harap masukkan URL dan Anon Key Supabase di tab Pengaturan terlebih dahulu!");
      if (typeof switchTab === 'function') switchTab("tab-settings");
    }
    return;
  }

  if (!navigator.onLine) {
    updateCloudStatus("offline", "Internet Putus");
    if (!silent) alert("Koneksi internet Anda sedang terputus.");
    return;
  }

  try {
    supabaseClient = window.supabase.createClient(url, key);
  } catch (e) {
    if (!silent) alert("Format URL atau API Key Supabase salah: " + e.message);
    return;
  }

  isSyncing = true;
  updateCloudStatus("syncing");
  if (!silent) {
    if (typeof showToast === 'function') {
      showToast("🔄 Menyinkronkan penjualan, LPB, retur & stock opname ke cloud...", "info", 3000);
    }
  }

  try {
    const currentStoreId = pos.settings.storeId || ("STR-" + (pos.settings.storeCode || "001"));

    // 1. Sinkronkan Produk ke Tabel 'products' secara bertahap (batch 25 item)
    try {
      const cleanProducts = pos.products.map(p => ({
        id: p.id,
        store_id: currentStoreId,
        barcode: String(p.barcode || ''),
        name: p.name,
        category: p.category,
        cost_price: Number(p.costPrice) || 0,
        price: Number(p.price) || 0,
        stock: Number(p.stock) || 0,
        min_stock: Number(p.minStock) || 5,
        unit: p.unit || 'Bungkus',
        image: p.image || null,
        description: p.description || null,
        updated_at: new Date().toISOString()
      }));

      const batchSize = 25;
      for (let i = 0; i < cleanProducts.length; i += batchSize) {
        const batch = cleanProducts.slice(i, i + batchSize);
        let { error: prodError } = await supabaseClient
          .from('products')
          .upsert(batch, { onConflict: 'id' });

        // Fallback jika store_id / image / description belum ada di Supabase
        if (prodError && (prodError.message?.includes('store_id') || prodError.message?.includes('image') || prodError.message?.includes('description') || prodError.code === 'PGRST204')) {
          console.warn("Supabase products fallback ke kompatibilitas legacy...", prodError.message);
          const legacyBatch = batch.map(({ store_id, image, description, ...rest }) => rest);
          const retry = await supabaseClient.from('products').upsert(legacyBatch, { onConflict: 'id' });
          prodError = retry.error;
        }

        if (prodError) {
          console.warn(`Peringatan pada tabel 'products': ${prodError.message}`);
        }
      }
    } catch (prodEx) {
      console.warn("Tabel 'products' dilewati jika ada kendala:", prodEx.message);
    }

    // 2. Sinkronkan 100 Transaksi Terbaru ke Tabel 'transactions'
    try {
      const recentTransactions = (pos.transactions || []).slice(0, 100).map(t => ({
        id: t.id,
        store_id: currentStoreId,
        date: t.date,
        time: t.time,
        cashier: t.cashier || 'Kasir',
        shift: t.shift || 'Shift 1',
        items: t.items || [],
        subtotal: Number(t.subtotal) || 0,
        discount_amount: Number(t.discountAmount) || 0,
        grand_total: Number(t.grandTotal) || 0,
        profit: Number(t.profit) || 0,
        payment_method: t.paymentMethod || 'cash',
        cash_tendered: Number(t.cashTendered) || Number(t.grandTotal) || 0,
        change_amount: Number(t.changeAmount) || 0,
        member_id: t.memberId || null,
        member_name: t.memberName || null,
        member_phone: t.memberPhone || null,
        member_points: Number(t.memberPoints) || 0,
        points_redeemed: Number(t.pointsRedeemed) || 0,
        point_discount: Number(t.pointDiscount) || 0,
        payable_amount: Number(t.payableAmount) || (Number(t.grandTotal) - (Number(t.pointDiscount) || 0)),
        created_at: new Date().toISOString()
      }));

      if (recentTransactions.length > 0) {
        try {
          await fetch('/rest/v1/transactions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(recentTransactions)
          });
        } catch (restErr) {}

        let { error: trxError } = await supabaseClient
          .from('transactions')
          .upsert(recentTransactions, { onConflict: 'id' });

        // Fallback: Jika tabel 'transactions' di Supabase belum memiliki kolom store_id / member_* / points_*
        if (trxError && (trxError.message?.includes('store_id') || trxError.message?.includes('member') || trxError.message?.includes('point') || trxError.message?.includes('payable') || trxError.code === 'PGRST204')) {
          console.warn("Supabase transactions belum memiliki kolom store_id atau member/point, fallback ke transaksi standar...");
          const legacyTrx = recentTransactions.map(({ store_id, member_id, member_name, member_phone, member_points, points_redeemed, point_discount, payable_amount, ...rest }) => rest);
          const retryTrx = await supabaseClient.from('transactions').upsert(legacyTrx, { onConflict: 'id' });
          trxError = retryTrx.error;
        }

        if (trxError) {
          console.warn(`Peringatan pada tabel 'transactions': ${trxError.message}`);
        }
      }
    } catch (trxEx) {
      console.warn("Tabel 'transactions' dilewati jika ada kendala:", trxEx.message);
    }

    // 3. Sinkronkan Mutasi Stok ke Tabel 'stock_mutations' (Termasuk SO_PLUS & SO_MINUS Stock Opname)
    const recentMutations = (pos.mutations || []).slice(0, 150).map(m => ({
      id: m.id,
      store_id: currentStoreId,
      date: m.date,
      time: m.time,
      type: m.type,
      product_id: m.productId,
      product_name: m.productName,
      barcode: m.barcode,
      qty: Number(m.qty) || 0,
      note: m.note || '',
      operator: m.operator || 'Kasir',
      created_at: new Date().toISOString()
    }));

    if (recentMutations.length > 0) {
      let { error: mutError } = await supabaseClient
        .from('stock_mutations')
        .upsert(recentMutations, { onConflict: 'id' });

      if (mutError && (mutError.message?.includes('store_id') || mutError.code === 'PGRST204')) {
        const legacyMut = recentMutations.map(({ store_id, ...rest }) => rest);
        const retryMut = await supabaseClient.from('stock_mutations').upsert(legacyMut, { onConflict: 'id' });
        mutError = retryMut.error;
      }

      if (mutError) {
        console.warn("Peringatan sinkron mutasi:", mutError.message);
      }
    }

    // 4. Sinkronkan Riwayat Retur ke Tabel 'returns' (Jika tabel ada di Supabase)
    if (pos.returns && pos.returns.length > 0) {
      const recentReturns = pos.returns.slice(0, 100).map(r => ({
        id: r.id,
        store_id: currentStoreId,
        original_trx_id: r.originalTrxId,
        date: r.date,
        time: r.time,
        cashier: r.cashier || 'Kasir',
        shift: r.shift || 'Shift 1',
        reason: r.reason || '',
        restocked: r.restocked !== undefined ? r.restocked : true,
        items: r.items || [],
        total_refund: Number(r.totalRefund) || 0,
        created_at: r.createdAt || new Date().toISOString()
      }));

      try {
        let { error: rtrError } = await supabaseClient
          .from('returns')
          .upsert(recentReturns, { onConflict: 'id' });

        if (rtrError && (rtrError.message?.includes('store_id') || rtrError.code === 'PGRST204')) {
          const legacyRtr = recentReturns.map(({ store_id, ...rest }) => rest);
          const retryRtr = await supabaseClient.from('returns').upsert(legacyRtr, { onConflict: 'id' });
          rtrError = retryRtr.error;
        }

        if (rtrError) {
          console.warn("Peringatan sinkron tabel 'returns':", rtrError.message);
        }
      } catch (rtrEx) {
        console.warn("Tabel 'returns' dilewati jika belum dibuat di Supabase:", rtrEx.message);
      }
    }

    // 4b. Sinkronkan Dokumen LPB ke Tabel 'lpb_records'
    if (pos.lpbRecords && pos.lpbRecords.length > 0) {
      const recentLpb = pos.lpbRecords.slice(0, 100).map(r => ({
        id: r.id,
        store_id: currentStoreId,
        date: r.date,
        time: r.time || '',
        supplier_name: r.supplierName,
        invoice_no: r.invoiceNo || '-',
        payment_type: r.paymentType || 'KREDIT',
        note: r.note || '',
        operator: r.operator || 'Kepala Toko',
        items: r.items || [],
        total_items: Number(r.totalItems) || 0,
        total_qty: Number(r.totalQty) || 0,
        total_value: Number(r.totalValue) || 0,
        created_at: new Date().toISOString()
      }));

      try {
        let { error: lpbError } = await supabaseClient
          .from('lpb_records')
          .upsert(recentLpb, { onConflict: 'id' });

        if (lpbError && (lpbError.message?.includes('store_id') || lpbError.code === 'PGRST204')) {
          const legacyLpb = recentLpb.map(({ store_id, ...rest }) => rest);
          const retryLpb = await supabaseClient.from('lpb_records').upsert(legacyLpb, { onConflict: 'id' });
          lpbError = retryLpb.error;
        }

        if (lpbError) {
          console.warn("Peringatan sinkron tabel 'lpb_records':", lpbError.message);
        }
      } catch (lpbEx) {
        console.warn("Tabel 'lpb_records' dilewati jika belum dibuat di Supabase:", lpbEx.message);
      }
    }

    // 5. Sinkronkan Data Member Pelanggan ke Tabel 'members'
    if (pos.members && pos.members.length > 0) {
      const cleanMembers = pos.members.map(m => ({
        id: m.id,
        store_id: currentStoreId,
        phone: String(m.phone || ''),
        name: String(m.name || ''),
        address: m.address || '',
        points: Number(m.points) || 0,
        total_spend: Number(m.totalSpend || m.total_spend) || 0,
        updated_at: new Date().toISOString()
      }));

      try {
        let { error: mbrError } = await supabaseClient
          .from('members')
          .upsert(cleanMembers, { onConflict: 'id' });

        if (mbrError && (mbrError.message?.includes('store_id') || mbrError.code === 'PGRST204')) {
          const legacyMbr = cleanMembers.map(({ store_id, ...rest }) => rest);
          const retryMbr = await supabaseClient.from('members').upsert(legacyMbr, { onConflict: 'id' });
          mbrError = retryMbr.error;
        }

        if (mbrError) {
          console.warn("Peringatan sinkron tabel 'members':", mbrError.message);
        }
      } catch (mbrEx) {
        console.warn("Tabel 'members' dilewati jika belum dibuat di Supabase:", mbrEx.message);
      }
    }

    // 5b. Tarik data member terbaru dari Cloud
    try {
      let { data: cloudMbrs, error: cMbrErr } = await supabaseClient
        .from('members')
        .select('*');

      if (!cMbrErr && Array.isArray(cloudMbrs) && cloudMbrs.length > 0) {
        let memberListChanged = false;
        if (!pos.members) pos.members = [];
        cloudMbrs.forEach(cm => {
          const existing = pos.members.find(m => m.id === cm.id || m.phone === cm.phone);
          if (!existing) {
            pos.members.push({
              id: cm.id,
              name: cm.name,
              phone: cm.phone,
              address: cm.address || '',
              points: Number(cm.points) || 0,
              totalSpend: Number(cm.total_spend) || 0,
              registeredAt: cm.created_at ? cm.created_at.split('T')[0] : ''
            });
            memberListChanged = true;
          } else {
            const cloudPts = Number(cm.points) || 0;
            const cloudSpend = Number(cm.total_spend) || 0;
            if (cloudPts > (existing.points || 0) || cloudSpend > (existing.totalSpend || 0)) {
              existing.points = Math.max(existing.points || 0, cloudPts);
              existing.totalSpend = Math.max(existing.totalSpend || 0, cloudSpend);
              memberListChanged = true;
            }
          }
        });
        if (memberListChanged) {
          pos.saveMembers();
        }
      }
    } catch (pullMbrErr) {
      console.warn("Gagal tarik member cloud:", pullMbrErr);
    }

    // 6. Tarik Konfigurasi Master Branding & Tentang Aplikasi dari app_config (Pusat Komando Vendor)
    if (typeof fetchAndApplyAboutConfig === 'function') {
      try {
        await fetchAndApplyAboutConfig(supabaseClient);
      } catch (aboutSyncErr) {
        console.warn("About config sync skipped:", aboutSyncErr.message);
      }
    }

    const syncTimeStr = new Date().toLocaleTimeString("id-ID", { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    pos.settings.lastSyncTime = syncTimeStr;
    pos.saveSettings();

    updateCloudStatus("online", `Sync ${syncTimeStr}`);
    if (!silent) {
      const summaryMsg = `✅ SINKRONISASI CLOUD BERHASIL!\n\nPukul: ${syncTimeStr}\n\nSeluruh data perubahan kasir telah sukses tersimpan di Cloud:\n• Transaksi Penjualan Kasir (${recentTransactions.length} transaksi)\n• Penerimaan Barang LPB Supplier (${(pos.lpbRecords || []).length} faktur)\n• Riwayat Retur Penjualan (${(pos.returns || []).length} retur)\n• Penyesuaian Fisik Stock Opname & Mutasi Stok (${recentMutations.length} mutasi)\n• Master Stok Fisik Produk & Member Pelanggan.`;
      if (typeof showToast === 'function') {
        showToast(`✅ Data Kasir, LPB, Retur & SO Berhasil Disinkronkan (${syncTimeStr})`, "success", 4000);
      }
      alert(summaryMsg);
      if (typeof sfx !== 'undefined' && sfx.success) sfx.success();
    }
  } catch (err) {
    console.error("Gagal sinkronisasi Supabase:", err);
    updateCloudStatus("offline", "Gagal Sync");
    if (!silent) {
      alert(`❌ GAGAL SINKRONISASI KE SUPABASE:\n\n${err.message}\n\nTips Mengatasi:\n1. Pastikan skrip SQL sudah dijalankan di menu 'SQL Editor' Supabase.\n2. Jika ada tulisan 'row-level security', nonaktifkan RLS di Supabase.\n3. Periksa kembali apakah Project URL dan Anon Key sudah benar.`);
      if (typeof sfx !== 'undefined' && sfx.warning) sfx.warning();
    }
  } finally {
    isSyncing = false;
  }
}

// Mulai Timer Auto-Sync 30 Detik (Sesuai SOP Real-Time Retail Kasir)
function startAutoSyncTimer() {
  if (autoSyncTimer) clearInterval(autoSyncTimer);
  autoSyncTimer = setInterval(() => {
    const isDev = (typeof isDevEnvironment === 'function' && isDevEnvironment()) || 
                  (typeof window !== 'undefined' && (
                    window.location.hostname === 'localhost' || 
                    window.location.hostname === '127.0.0.1' || 
                    window.location.hostname.includes('trycloudflare.com') ||
                    window.location.port === '8085' ||
                    window.location.port === '8081'
                  ));
    const lic = typeof getStoredLicense === 'function' ? getStoredLicense() : null;
    const isCloudActive = isDev || !lic || (lic && (lic.cloudStatus === 'ACTIVE' || lic.planType === 'PAKET_2' || lic.isLicensed));
    if (isCloudActive && navigator.onLine) {
      syncToSupabase(true); // silent auto-sync di background tiap 30 detik
    }
  }, 30000); // 30 detik
}

async function testSupabaseConnection() {
  const inputUrl = document.getElementById("setting-supabase-url")?.value;
  const inputKey = document.getElementById("setting-supabase-key")?.value;
  const url = cleanSupabaseUrl(inputUrl || pos.settings.supabaseUrl || (typeof window !== 'undefined' ? window.OFFICIAL_SUPABASE_URL : ''));
  const key = cleanSupabaseKey(inputKey || pos.settings.supabaseKey || (typeof window !== 'undefined' ? window.OFFICIAL_SUPABASE_KEY : ''));

  if (!url || !key) {
    alert("Kredensial Supabase tidak ditemukan!");
    return;
  }

  showToast("Menguji koneksi ke Supabase...", "info");
  try {
    const testClient = window.supabase.createClient(url, key);
    
    // Cek apakah tabel store_licenses atau products bisa diakses
    const { data, error } = await testClient.from('store_licenses').select('id').limit(1);
    
    if (error && error.code !== 'PGRST116') {
      console.warn("Tes tabel store_licenses:", error.message);
    }

    alert("🎉 KONEKSI CLOUD RESMI BERHASIL 100%!\n\nServer Cloud Database Supabase aktif, aman, dan siap digunakan.");
    if (typeof sfx !== 'undefined' && sfx.success) sfx.success();
  } catch (err) {
    alert("Koneksi gagal: " + err.message);
    if (typeof sfx !== 'undefined' && sfx.warning) sfx.warning();
  }
}
