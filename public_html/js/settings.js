/**
 * SnackPOS - Store Settings, Backup & Accordion UI
 */

function isDevEnvironment() {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  const p = window.location.port;
  const path = window.location.pathname;
  return h.startsWith('dev.') || h.includes('-dev.') || h.includes('dev-') || h.includes('preview') || 
         h === 'localhost' || h === '127.0.0.1' || p === '8080' || p === '8081' || path.includes('/dev');
}

// Fungsi menjamin Store ID unik dan tidak bentrok
function getOrCreateStoreId() {
  const currentPos = (typeof window !== 'undefined' && window.pos) ? window.pos : null;
  if (isDevEnvironment()) {
    const devStoreId = "DEV-001";
    if (currentPos && currentPos.settings) {
      currentPos.settings.storeId = devStoreId;
      if (!currentPos.settings.storeName || currentPos.settings.storeName === "TOKO SNACK BERKAH") {
        currentPos.settings.storeName = "SNACKPOS (DEV TEST)";
      }
      currentPos.saveSettings();
    }
    return devStoreId;
  }
  if (currentPos && currentPos.settings && currentPos.settings.storeId && currentPos.settings.storeId !== "STR-001") {
    return currentPos.settings.storeId;
  }
  const storedLic = localStorage.getItem("snack_pos_license");
  if (storedLic) {
    try {
      const parsed = JSON.parse(storedLic);
      if (parsed.storeId && parsed.storeId !== "STR-001") {
        if (currentPos && currentPos.settings) {
          currentPos.settings.storeId = parsed.storeId;
          currentPos.saveSettings();
        }
        return parsed.storeId;
      }
    } catch(e) {}
  }
  // Generate random 4-karakter alfanumerik (contoh: STR-8F2K)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const newId = `STR-${code}`;
  if (currentPos && currentPos.settings) {
    currentPos.settings.storeId = newId;
    currentPos.saveSettings();
  }
  return newId;
}

function copyStoreIdToClipboard() {
  const storeId = (pos && pos.settings && pos.settings.storeId) ? pos.settings.storeId : getOrCreateStoreId();
  if (navigator.clipboard) {
    navigator.clipboard.writeText(storeId).then(() => {
      showToast(`📋 Store ID ${storeId} berhasil disalin!`, "success");
    }).catch(() => {
      prompt("Salin Store ID Anda:", storeId);
    });
  } else {
    prompt("Salin Store ID Anda:", storeId);
  }
}

// ==========================================
// 10. PENGATURAN TOKO & BACKUP
// ==========================================
function loadSettingsToForm() {
  const storeNameEl = document.getElementById("setting-store-name");
  if (storeNameEl) storeNameEl.value = pos.settings.storeName;
  const storeIdInputEl = document.getElementById("setting-store-id");
  const uniqueStoreId = getOrCreateStoreId();
  if (storeIdInputEl) {
    storeIdInputEl.value = uniqueStoreId;
    storeIdInputEl.readOnly = true;
  }
  const taglineEl = document.getElementById("setting-store-tagline");
  if (taglineEl) taglineEl.value = pos.settings.storeTagline || "";
  const codeEl = document.getElementById("setting-store-code");
  if (codeEl) codeEl.value = pos.settings.storeCode || "T088";
  const posNumEl = document.getElementById("setting-pos-number");
  if (posNumEl) posNumEl.value = pos.settings.posNumber || "01";
  const addrEl = document.getElementById("setting-store-address");
  if (addrEl) addrEl.value = pos.settings.storeAddress || "";
  const phoneEl = document.getElementById("setting-store-phone");
  if (phoneEl) phoneEl.value = pos.settings.storePhone || "";
  const supaUrlEl = document.getElementById("setting-supabase-url");
  if (supaUrlEl) supaUrlEl.value = pos.settings.supabaseUrl || (typeof window !== 'undefined' ? window.OFFICIAL_SUPABASE_URL : '') || "https://2.27.165.72.sslip.io";
  const supaKeyEl = document.getElementById("setting-supabase-key");
  if (supaKeyEl) supaKeyEl.value = pos.settings.supabaseKey || (typeof window !== 'undefined' ? window.OFFICIAL_SUPABASE_KEY : '') || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODUwNDE4LCJleHAiOjE5NDc1MzA0MTh9.99BRNnUQwei95p1zAqtFBBD5CnUJSedfUeh2MJy97Gg";
  const footerEl = document.getElementById("setting-receipt-footer");
  if (footerEl) footerEl.value = pos.settings.receiptFooter || "";
  const paperWidth = pos.settings.paperWidth || "58mm";
  const paperWidthEl = document.getElementById("setting-paper-width");
  if (paperWidthEl) paperWidthEl.value = paperWidth;

  const r58 = document.getElementById("paper-size-58mm");
  const r80 = document.getElementById("paper-size-80mm");
  if (r58) r58.checked = (paperWidth === "58mm");
  if (r80) r80.checked = (paperWidth === "80mm");

  const badgePaper = document.getElementById("badge-paper-width");
  if (badgePaper) {
    badgePaper.textContent = paperWidth === "80mm" ? "Kertas: 80mm (48 Karakter)" : "Kertas: 58mm (32 Karakter)";
    badgePaper.className = `px-2.5 py-0.5 rounded-full text-[10px] font-black ${paperWidth === "80mm" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"}`;
  }

  const soundEl = document.getElementById("setting-enable-sound");
  if (soundEl) soundEl.checked = !!pos.settings.enableSound;

  // Setting Scanner Barcode Auto-Enter
  const autoEnterEl = document.getElementById("setting-scanner-auto-enter");
  const isAutoEnter = pos.settings.scannerAutoEnter !== false;
  if (autoEnterEl) autoEnterEl.checked = isAutoEnter;
  const badgeScanner = document.getElementById("badge-scanner-mode");
  if (badgeScanner) {
    badgeScanner.textContent = isAutoEnter ? "Auto-Enter Aktif" : "Auto-Enter Nonaktif";
    badgeScanner.className = `px-2 py-0.5 rounded-full text-[10px] font-bold ${isAutoEnter ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`;
  }

  // Pengaturan Printer Thermal ESC/POS (VSC / Bluetooth / RawBT / Kabel)
  const printerMode = pos.settings.printerDriverMode || 'bluetooth';
  const radioBt = document.getElementById("printer-mode-bluetooth");
  const radioRawbt = document.getElementById("printer-mode-rawbt");
  const radioSys = document.getElementById("printer-mode-system");
  if (radioBt) radioBt.checked = printerMode === 'bluetooth';
  if (radioRawbt) radioRawbt.checked = printerMode === 'rawbt';
  if (radioSys) radioSys.checked = printerMode === 'system';

  const autoPrintEl = document.getElementById("setting-auto-print-receipt");
  if (autoPrintEl) autoPrintEl.checked = pos.settings.autoPrintReceipt !== false;

  const feedLinesEl = document.getElementById("setting-printer-feed-lines");
  if (feedLinesEl) feedLinesEl.value = pos.settings.printerFeedLines || 3;

  if (typeof updatePrinterStatusBadge === "function") {
    updatePrinterStatusBadge();
  }

  // Sinkronisasi Kasir Aktif & Shift ke Form Setting
  const activeUserPreview = document.getElementById("setting-active-user-preview");
  if (activeUserPreview) {
    if (pos.currentUser) {
      activeUserPreview.textContent = `${pos.currentUser.nik} • ${pos.currentUser.name} (${pos.currentUser.shift || "Shift 1"})`;
    } else {
      activeUserPreview.textContent = "Belum Ada Kasir Login (Terkunci)";
    }
  }

  // Aturan Poin Loyalitas Member
  const pointStepEl = document.getElementById("setting-member-point-step");
  const pointValEl = document.getElementById("setting-member-point-value");
  if (pointStepEl) pointStepEl.value = pos.settings.memberPointSpendStep !== undefined ? pos.settings.memberPointSpendStep : 200;
  if (pointValEl) pointValEl.value = pos.settings.memberPointRedeemValue !== undefined ? pos.settings.memberPointRedeemValue : 1;

  // Pengaturan Payment Gateway & QRIS Kasir
  const qrisModeEl = document.getElementById("setting-qris-mode");
  if (qrisModeEl) qrisModeEl.value = pos.settings.qrisMode || "MIDTRANS";
  const midEnvEl = document.getElementById("setting-midtrans-env");
  if (midEnvEl) midEnvEl.value = pos.settings.midtransEnvironment || "SANDBOX";
  const midClientEl = document.getElementById("setting-midtrans-client-key");
  if (midClientEl) midClientEl.value = pos.settings.midtransClientKey || "";
  const midServerEl = document.getElementById("setting-midtrans-server-key");
  if (midServerEl) midServerEl.value = pos.settings.midtransServerKey || "";

  const qrisUrlEl = document.getElementById("setting-qris-image-url");
  if (qrisUrlEl) qrisUrlEl.value = pos.settings.qrisStaticImageUrl || "";
  const qrisMerchantEl = document.getElementById("setting-qris-merchant-name");
  if (qrisMerchantEl) qrisMerchantEl.value = pos.settings.qrisMerchantName || pos.settings.storeName || "";

  const bankNameEl = document.getElementById("setting-bank-name");
  if (bankNameEl) bankNameEl.value = pos.settings.bankName || "BCA";
  const bankAccEl = document.getElementById("setting-bank-account-no");
  if (bankAccEl) bankAccEl.value = pos.settings.bankAccountNumber || "";
  const bankHolderEl = document.getElementById("setting-bank-account-holder");
  if (bankHolderEl) bankHolderEl.value = pos.settings.bankAccountHolder || "";

  updateQrisPreview();
  onQrisModeChange();

  // Header toko & kasir
  const topStoreName = document.getElementById("top-header-store-name");
  if (topStoreName) topStoreName.textContent = pos.settings.storeName;
  const topCashier = document.getElementById("top-header-cashier");
  if (topCashier) topCashier.textContent = `Kode: ${pos.settings.storeCode} • POS: ${pos.settings.posNumber}`;

  renderEmployeeHeader();
  renderAttendanceTable();

  // Tampilkan status lisensi produk
  renderLicenseStatus();
  updateSettingsStatusBadges();
}

function saveStoreSettings() {
  pos.settings.storeName = document.getElementById("setting-store-name")?.value.trim() || "TOKO SNACK BERKAH";
  pos.settings.storeId = getOrCreateStoreId();
  pos.settings.storeTagline = document.getElementById("setting-store-tagline")?.value.trim() || "";
  pos.settings.storeCode = document.getElementById("setting-store-code")?.value.trim() || "T088";
  pos.settings.posNumber = document.getElementById("setting-pos-number")?.value.trim() || "01";
  pos.settings.storeAddress = document.getElementById("setting-store-address")?.value.trim() || "";
  const supaUrlInput = document.getElementById("setting-supabase-url")?.value;
  const supaKeyInput = document.getElementById("setting-supabase-key")?.value;
  pos.settings.supabaseUrl = cleanSupabaseUrl(supaUrlInput || pos.settings.supabaseUrl || (typeof window !== 'undefined' ? window.OFFICIAL_SUPABASE_URL : '') || "https://zsjbiuwtjsnjxyvhwggz.supabase.co");
  pos.settings.supabaseKey = cleanSupabaseKey(supaKeyInput || pos.settings.supabaseKey || (typeof window !== 'undefined' ? window.OFFICIAL_SUPABASE_KEY : '') || "sb_publishable_cO81g3R2IpzniHuackKd_A_7YYe2T39");
  pos.settings.receiptFooter = document.getElementById("setting-receipt-footer")?.value.trim() || "";
  const paperRadio80 = document.getElementById("paper-size-80mm");
  pos.settings.paperWidth = paperRadio80 && paperRadio80.checked ? "80mm" : (document.getElementById("setting-paper-width")?.value || "58mm");
  pos.settings.enableSound = !!document.getElementById("setting-enable-sound")?.checked;

  const autoEnterEl = document.getElementById("setting-scanner-auto-enter");
  if (autoEnterEl) {
    pos.settings.scannerAutoEnter = !!autoEnterEl.checked;
  }

  // Simpan Aturan Poin Member
  const stepInput = document.getElementById("setting-member-point-step");
  const valInput = document.getElementById("setting-member-point-value");
  if (stepInput) {
    const rawStep = parseInt(stepInput.value, 10);
    pos.settings.memberPointSpendStep = isNaN(rawStep) || rawStep < 0 ? 200 : rawStep;
  }
  if (valInput) {
    const rawVal = parseInt(valInput.value, 10);
    pos.settings.memberPointRedeemValue = isNaN(rawVal) || rawVal < 1 ? 1 : rawVal;
  }

  // Simpan Pengaturan Payment Gateway & QRIS
  pos.settings.qrisMode = document.getElementById("setting-qris-mode")?.value || "MIDTRANS";
  pos.settings.midtransEnvironment = document.getElementById("setting-midtrans-env")?.value || "SANDBOX";
  pos.settings.midtransClientKey = document.getElementById("setting-midtrans-client-key")?.value.trim() || "";
  pos.settings.midtransServerKey = document.getElementById("setting-midtrans-server-key")?.value.trim() || "";
  pos.settings.qrisStaticImageUrl = document.getElementById("setting-qris-image-url")?.value.trim() || "";
  pos.settings.qrisMerchantName = document.getElementById("setting-qris-merchant-name")?.value.trim() || "";
  pos.settings.bankName = document.getElementById("setting-bank-name")?.value.trim() || "BCA";
  pos.settings.bankAccountNumber = document.getElementById("setting-bank-account-no")?.value.trim() || "";
  pos.settings.bankAccountHolder = document.getElementById("setting-bank-account-holder")?.value.trim() || "";

  // Simpan Pengaturan Printer Kasir
  let selectedPrinterMode = 'bluetooth';
  if (document.getElementById("printer-mode-rawbt")?.checked) selectedPrinterMode = 'rawbt';
  else if (document.getElementById("printer-mode-system")?.checked) selectedPrinterMode = 'system';
  pos.settings.printerDriverMode = selectedPrinterMode;
  pos.settings.autoPrintReceipt = !!document.getElementById("setting-auto-print-receipt")?.checked;
  pos.settings.printerFeedLines = parseInt(document.getElementById("setting-printer-feed-lines")?.value, 10) || 3;

  pos.saveSettings();
  loadSettingsToForm();
  initSupabase();

  // Sinkronkan perubahan identitas toko ke cloud Supabase secara instan
  syncStoreProfileToCloud();

  showToast("Pengaturan Toko, Payment Gateway & Scanner berhasil disimpan!", "success");
  sfx.beep();
}

// Sinkronisasi profil toko (Nama Toko, WhatsApp, Alamat) ke Supabase store_licenses
async function syncStoreProfileToCloud() {
  if (!navigator.onLine) return;
  const currentStoreId = pos.settings.storeId || getOrCreateStoreId();
  const storeName = pos.settings.storeName || "TOKO SNACK BERKAH";
  const storePhone = pos.settings.storePhone || "";

  // 1. Coba via supabaseClient aktif
  if (typeof supabaseClient !== 'undefined' && supabaseClient) {
    try {
      const { data: existing } = await supabaseClient
        .from('store_licenses')
        .select('id, store_id')
        .eq('store_id', currentStoreId)
        .maybeSingle();

      if (existing) {
        await supabaseClient
          .from('store_licenses')
          .update({
            store_name: storeName,
            whatsapp: storePhone,
            updated_at: new Date().toISOString()
          })
          .eq('store_id', currentStoreId);
        console.log("Profil toko tersinkron ke cloud Supabase:", currentStoreId, storeName);
      }
    } catch (e) {
      console.warn("syncStoreProfileToCloud via client gagal:", e.message);
    }
  }

  // 2. Juga perbarui lisensi lokal agar konsisten
  const storedLic = localStorage.getItem("snack_pos_license");
  if (storedLic) {
    try {
      const lic = JSON.parse(storedLic);
      lic.clientName = storeName;
      lic.storeId = currentStoreId;
      localStorage.setItem("snack_pos_license", JSON.stringify(lic));
      renderLicenseStatus();
    } catch (e) {}
  }
}

// Ubah mode printer kasir langsung dari radio button
function changePrinterDriverMode(mode) {
  pos.settings.printerDriverMode = mode;
  pos.saveSettings();
  const labelMap = {
    'bluetooth': 'Direct Web Bluetooth (VSC BLE)',
    'rawbt': 'Jembatan RawBT Android',
    'system': 'Dialog Sistem OS / Kabel USB'
  };
  showToast(`Metode cetak printer diatur ke: ${labelMap[mode] || mode}`, "info");
  if (typeof updatePrinterStatusBadge === 'function') {
    updatePrinterStatusBadge();
  }
}

// Ubah ukuran kertas struk thermal (58mm / 80mm) langsung dari radio button atau select
function changePaperWidth(width) {
  pos.settings.paperWidth = width || "58mm";
  pos.saveSettings();

  const r58 = document.getElementById("paper-size-58mm");
  const r80 = document.getElementById("paper-size-80mm");
  if (r58) r58.checked = (pos.settings.paperWidth === "58mm");
  if (r80) r80.checked = (pos.settings.paperWidth === "80mm");

  const sel = document.getElementById("setting-paper-width");
  if (sel) sel.value = pos.settings.paperWidth;

  const badge = document.getElementById("badge-paper-width");
  if (badge) {
    badge.textContent = pos.settings.paperWidth === "80mm" ? "Kertas: 80mm (48 Karakter)" : "Kertas: 58mm (32 Karakter)";
    badge.className = `px-2.5 py-0.5 rounded-full text-[10px] font-black ${pos.settings.paperWidth === "80mm" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"}`;
  }

  if (typeof updatePrinterStatusBadge === "function") {
    updatePrinterStatusBadge();
  }
  updateSettingsStatusBadges();

  showToast(`Ukuran kertas thermal diatur ke: ${pos.settings.paperWidth} (${pos.settings.paperWidth === '80mm' ? '48 Kolom Karakter' : '32 Kolom Karakter'})`, "info");
}

// Toggle Scanner Auto-Enter langsung dari checkbox
function toggleScannerAutoEnter(enabled) {
  pos.settings.scannerAutoEnter = !!enabled;
  pos.saveSettings();
  const badgeScanner = document.getElementById("badge-scanner-mode");
  if (badgeScanner) {
    badgeScanner.textContent = enabled ? "Auto-Enter Aktif" : "Auto-Enter Nonaktif";
    badgeScanner.className = `px-2 py-0.5 rounded-full text-[10px] font-bold ${enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`;
  }
  showToast(`Scanner Auto-Enter ${enabled ? "Aktif! Produk langsung masuk list belanja saat scan." : "Nonaktif (perlu Enter untuk memasukkan)." }`, enabled ? "success" : "info");
}

// ==========================================
// PENGATURAN SUB-MENU ACCORDION (EXPAND / COLLAPSE) & SEARCH
// ==========================================
const ALL_SETTING_SECTIONS = [
  "sec-store", "sec-scanner", "sec-printer", 
  "sec-employees", "sec-attendance", "sec-member-points", 
  "sec-payment-gateway", "sec-supabase", "sec-license", "sec-backup"
];

function toggleSettingSection(secId) {
  const targetContent = document.getElementById(`content-${secId}`);
  const targetChevron = document.getElementById(`chevron-${secId}`);
  if (!targetContent) return;

  const isCurrentlyOpen = !targetContent.classList.contains("hidden");

  // Proteksi khusus modul data karyawan jika tidak memiliki izin MANAGE_EMPLOYEES
  if (!isCurrentlyOpen && secId === "sec-employees") {
    if (typeof hasPermissionForAction === "function" && !hasPermissionForAction(pos.currentUser, "MANAGE_EMPLOYEES")) {
      requestSupervisorAuth("MANAGE_EMPLOYEES", "Otorisasi Akses Manajemen Karyawan Toko (Khusus COS)", () => {
        executeToggleSettingSection(secId, false);
      });
      return;
    }
  }

  executeToggleSettingSection(secId, isCurrentlyOpen);
}

function executeToggleSettingSection(secId, isCurrentlyOpen) {
  const targetContent = document.getElementById(`content-${secId}`);
  const targetChevron = document.getElementById(`chevron-${secId}`);
  if (!targetContent) return;

  // Opsi A: Single Accordion / Auto-Collapse
  // Tutup semua section yang lain terlebih dahulu
  ALL_SETTING_SECTIONS.forEach(id => {
    const content = document.getElementById(`content-${id}`);
    const chevron = document.getElementById(`chevron-${id}`);
    const item = document.getElementById(`setting-item-${id}`);
    if (content) content.classList.add("hidden");
    if (chevron) {
      chevron.textContent = "▼";
      chevron.classList.remove("text-blue-600");
    }
    if (item) item.classList.remove("bg-slate-50/70");
  });

  // Jika sebelumnya tertutup, sekarang buka
  if (!isCurrentlyOpen) {
    targetContent.classList.remove("hidden");
    if (targetChevron) {
      targetChevron.textContent = "▲";
      targetChevron.classList.add("text-blue-600");
    }
    const item = document.getElementById(`setting-item-${secId}`);
    if (item) item.classList.add("bg-slate-50/70");
  }
}

function expandAllSettingSections(expand) {
  ALL_SETTING_SECTIONS.forEach(id => {
    const content = document.getElementById(`content-${id}`);
    const chevron = document.getElementById(`chevron-${id}`);
    const item = document.getElementById(`setting-item-${id}`);
    if (content) content.classList.toggle("hidden", !expand);
    if (chevron) {
      chevron.textContent = expand ? "▲" : "▼";
      if (expand) chevron.classList.add("text-blue-600");
      else chevron.classList.remove("text-blue-600");
    }
    if (item) {
      if (expand) item.classList.add("bg-slate-50/70");
      else item.classList.remove("bg-slate-50/70");
    }
  });
}

function updateSettingsStatusBadges() {
  if (!pos || !pos.settings) return;

  // 1. Identitas Toko
  const badgeStore = document.getElementById("badge-status-sec-store");
  if (badgeStore) {
    const pWidth = pos.settings.paperWidth || "58mm";
    badgeStore.textContent = `${pos.settings.storeName || "Toko"} • ${pWidth}`;
  }

  // 2. Scanner Barcode
  const badgeScanner = document.getElementById("badge-scanner-mode");
  if (badgeScanner) {
    const isAuto = pos.settings.scannerAutoEnter !== false;
    badgeScanner.textContent = isAuto ? "Auto-Enter Aktif" : "Auto-Enter Nonaktif";
    badgeScanner.className = `px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold ${isAuto ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`;
  }

  // 3. Printer Struk
  if (typeof updatePrinterStatusBadge === "function") {
    try { updatePrinterStatusBadge(); } catch (e) {}
  }

  // 4. Karyawan Toko
  const badgeEmp = document.getElementById("badge-employees-count");
  if (badgeEmp) {
    const empList = pos.employees || [];
    badgeEmp.textContent = `${empList.length} Karyawan`;
  }

  // 5. Absensi Shift
  const badgeAtt = document.getElementById("badge-attendance-status");
  if (badgeAtt) {
    const attCount = (pos.attendance && pos.attendance.length) || 0;
    badgeAtt.textContent = attCount > 0 ? `${attCount} Log Absen` : "Log Presensi";
  }

  // 6. Poin Member
  const badgePoints = document.getElementById("badge-member-points");
  if (badgePoints) {
    const step = pos.settings.memberPointSpendStep;
    if (step && Number(step) > 0) {
      badgePoints.textContent = `Aktif (Rp ${Number(step).toLocaleString("id-ID")})`;
      badgePoints.className = "px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-rose-100 text-rose-800";
    } else {
      badgePoints.textContent = "Poin Nonaktif";
      badgePoints.className = "px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-slate-100 text-slate-600";
    }
  }

  // 7. Payment Gateway
  const badgePayment = document.getElementById("badge-payment-gateway");
  if (badgePayment) {
    const qrisMode = pos.settings.qrisMode || "MIDTRANS";
    if (qrisMode === "MIDTRANS") {
      const env = pos.settings.midtransEnvironment === "PRODUCTION" ? "Live" : "Sandbox";
      badgePayment.textContent = `Midtrans (${env})`;
      badgePayment.className = "px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-indigo-100 text-indigo-800";
    } else if (qrisMode === "STATIC") {
      badgePayment.textContent = "QRIS Statis Toko";
      badgePayment.className = "px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-emerald-100 text-emerald-800";
    } else {
      badgePayment.textContent = "Simulasi Kasir";
      badgePayment.className = "px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-slate-100 text-slate-700";
    }
  }

  // 8. Supabase Cloud
  const badgeSupa = document.getElementById("badge-supabase-status");
  if (badgeSupa) {
    if (pos.settings.supabaseUrl && pos.settings.supabaseKey) {
      badgeSupa.textContent = "Cloud Terhubung";
      badgeSupa.className = "px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-teal-100 text-teal-800";
    } else {
      badgeSupa.textContent = "Belum Diatur";
      badgeSupa.className = "px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-slate-100 text-slate-500";
    }
  }

  // 9. Status Lisensi
  if (typeof renderLicenseStatus === "function") {
    try { renderLicenseStatus(); } catch (e) {}
  }
}

function filterSettingsSections(query) {
  const q = (query || "").trim().toLowerCase();
  const clearBtn = document.getElementById("btn-clear-settings-search");
  if (clearBtn) clearBtn.classList.toggle("hidden", !q);

  ALL_SETTING_SECTIONS.forEach(id => {
    const item = document.getElementById(`setting-item-${id}`);
    const content = document.getElementById(`content-${id}`);
    const chevron = document.getElementById(`chevron-${id}`);
    if (!item) return;

    if (!q) {
      item.classList.remove("hidden");
      if (content) content.classList.add("hidden");
      if (chevron) {
        chevron.textContent = "▼";
        chevron.classList.remove("text-blue-600");
      }
      item.classList.remove("bg-slate-50/70");
      return;
    }

    const textToSearch = item.textContent.toLowerCase();
    const match = textToSearch.includes(q);

    item.classList.toggle("hidden", !match);
    if (match && content) {
      content.classList.remove("hidden");
      if (chevron) {
        chevron.textContent = "▲";
        chevron.classList.add("text-blue-600");
      }
      item.classList.add("bg-slate-50/70");
    }
  });

  // Sembunyikan container grup jika semua item di dalamnya disembunyikan
  for (let g = 1; g <= 4; g++) {
    const groupEl = document.getElementById(`settings-group-${g}`);
    if (groupEl) {
      const visibleItems = groupEl.querySelectorAll(".setting-item:not(.hidden)");
      groupEl.classList.toggle("hidden", !!q && visibleItems.length === 0);
    }
  }
}

function clearSettingsSearch() {
  const input = document.getElementById("settings-search-input");
  if (input) {
    input.value = "";
    filterSettingsSections("");
    input.focus();
  }
}

function downloadDatabaseBackup() {
  const backup = {
    backupDate: new Date().toISOString(),
    version: "2.0.0-retail",
    settings: pos.settings,
    products: pos.products,
    transactions: pos.transactions,
    mutations: pos.mutations
  };

  const str = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup, null, 2));
  const link = document.createElement("a");
  link.setAttribute("href", str);
  link.setAttribute("download", `Backup_SnackPOS_Retail_${new Date().toISOString().split("T")[0]}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast("File backup database berhasil disimpan!", "success");
}

function restoreDatabaseBackup(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed.products || !parsed.settings) throw new Error("Format file tidak valid!");

      if (confirm("Ganti seluruh data saat ini dengan file cadangan ini?")) {
        pos.products = parsed.products;
        pos.settings = { ...pos.settings, ...parsed.settings };
        pos.transactions = parsed.transactions || [];
        pos.mutations = parsed.mutations || [];
        pos.cart = [];

        pos.saveProducts();
        pos.saveSettings();
        pos.saveTransactions();
        pos.saveMutations();

        loadSettingsToForm();
        renderPosCart();
        renderReports();
        initSupabase();

        showToast("Database berhasil dipulihkan!", "success");
        sfx.success();
      }
    } catch (err) {
      alert("Gagal membaca file backup: " + err.message);
    }
  };
  reader.readAsText(file);
}

// ==========================================
// PENGATURAN PAYMENT GATEWAY & QRIS KASIR
// ==========================================
function onQrisModeChange() {
  const mode = document.getElementById("setting-qris-mode")?.value || "MIDTRANS";
  const divMidtrans = document.getElementById("div-setting-midtrans");
  const divStatic = document.getElementById("div-setting-static-qris");

  if (divMidtrans) divMidtrans.classList.toggle("hidden", mode !== "MIDTRANS");
  if (divStatic) divStatic.classList.toggle("hidden", mode !== "STATIC");
}

function handleQrisImageUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast("Format file harus berupa gambar (JPG, PNG, WebP)!", "warning");
    return;
  }
  const reader = new FileReader();
  reader.onload = function(e) {
    const dataUrl = e.target.result;
    const urlInput = document.getElementById("setting-qris-image-url");
    if (urlInput) urlInput.value = dataUrl;
    updateQrisPreview(dataUrl);
    showToast("Gambar QRIS berhasil diunggah!", "success");
  };
  reader.readAsDataURL(file);
}

function updateQrisPreviewFromUrl() {
  const url = document.getElementById("setting-qris-image-url")?.value.trim();
  updateQrisPreview(url);
}

function updateQrisPreview(src) {
  const imgUrl = src !== undefined ? src : (pos.settings.qrisStaticImageUrl || "");
  const img = document.getElementById("preview-qris-img");
  const placeholder = document.getElementById("preview-qris-placeholder");
  if (!img || !placeholder) return;

  if (imgUrl) {
    img.src = imgUrl;
    img.classList.remove("hidden");
    placeholder.classList.add("hidden");
  } else {
    img.src = "";
    img.classList.add("hidden");
    placeholder.classList.remove("hidden");
  }
}

function jumpToPaymentSettings() {
  switchTab('tab-settings');
  const content = document.getElementById('content-sec-payment-gateway');
  if (content && content.classList.contains('hidden')) {
    toggleSettingSection('sec-payment-gateway');
  }
  const container = document.getElementById('setting-container-payment-gateway');
  if (container) {
    container.scrollIntoView({ behavior: 'smooth', block: 'center' });
    container.classList.add('ring-2', 'ring-indigo-500');
    setTimeout(() => container.classList.remove('ring-2', 'ring-indigo-500'), 2000);
  }
}

