/**
 * SnackPOS - Store Settings, Backup & Accordion UI
 */

// Normalisasi nomor WhatsApp ke standar internasional tanpa tanda baca (628...)
function formatWhatsAppNumber(phone) {
  if (!phone) return "6281234567890";
  let cleaned = String(phone).trim().replace(/[^0-9]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  } else if (cleaned.startsWith('8')) {
    cleaned = '62' + cleaned;
  }
  if (!cleaned.startsWith('62') && cleaned.length > 0) {
    cleaned = '62' + cleaned;
  }
  return cleaned.length >= 9 ? cleaned : "6281234567890";
}
window.formatWhatsAppNumber = formatWhatsAppNumber;

function isDevEnvironment() {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  const p = window.location.port;
  const path = window.location.pathname;
  return h.startsWith('dev.') || h.includes('-dev.') || h.includes('dev-') || h.includes('preview') || 
         h.includes('trycloudflare.com') || h.includes('pages.dev') || h.includes('ngrok') ||
         h === 'localhost' || h === '127.0.0.1' || p === '8080' || p === '8081' || p === '8085' || path.includes('/dev');
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
  const sisTaglineEl = document.getElementById("sis-profile-tagline");
  if (sisTaglineEl) sisTaglineEl.value = pos.settings.storeTagline || "";
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
  const radioWebusb = document.getElementById("printer-mode-webusb");
  const radioRawbt = document.getElementById("printer-mode-rawbt");
  const radioSys = document.getElementById("printer-mode-system");
  if (radioBt) radioBt.checked = printerMode === 'bluetooth';
  if (radioWebusb) radioWebusb.checked = printerMode === 'webusb';
  if (radioRawbt) radioRawbt.checked = printerMode === 'rawbt';
  if (radioSys) radioSys.checked = printerMode === 'system';

  const autoPrintEl = document.getElementById("setting-auto-print-receipt");
  if (autoPrintEl) autoPrintEl.checked = pos.settings.autoPrintReceipt !== false;

  const feedLinesEl = document.getElementById("setting-printer-feed-lines");
  if (feedLinesEl) feedLinesEl.value = pos.settings.printerFeedLines || 3;

  if (typeof updatePrinterStatusBadge === "function") {
    updatePrinterStatusBadge();
  }

  // Load Kontak Bantuan Toko
  const helpdeskWaEl = document.getElementById("setting-helpdesk-wa");
  if (helpdeskWaEl) helpdeskWaEl.value = formatWhatsAppNumber(pos.settings.helpdeskWa || "6281234567890");
  const helpdeskEmailEl = document.getElementById("setting-helpdesk-email");
  if (helpdeskEmailEl) helpdeskEmailEl.value = pos.settings.helpdeskEmail || "helpdesk@snackpos.local";

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
  if (typeof applyAboutConfigToUI === 'function') applyAboutConfigToUI();
}

function saveStoreSettings() {
  pos.settings.storeName = document.getElementById("setting-store-name")?.value.trim() || "TOKO SNACK BERKAH";
  pos.settings.storeId = getOrCreateStoreId();
  pos.settings.storeTagline = document.getElementById("setting-store-tagline")?.value.trim() || "";
  const sisTaglineEl = document.getElementById("sis-profile-tagline");
  if (sisTaglineEl) sisTaglineEl.value = pos.settings.storeTagline;
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

  // Simpan Kontak Helpdesk Toko
  const helpdeskWaInput = document.getElementById("setting-helpdesk-wa")?.value.trim();
  if (helpdeskWaInput) {
    const formattedWa = formatWhatsAppNumber(helpdeskWaInput);
    pos.settings.helpdeskWa = formattedWa;
    const el = document.getElementById("setting-helpdesk-wa");
    if (el) el.value = formattedWa;
  }
  const helpdeskEmailInput = document.getElementById("setting-helpdesk-email")?.value.trim();
  if (helpdeskEmailInput) pos.settings.helpdeskEmail = helpdeskEmailInput;

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
    'webusb': 'Direct WebUSB (Kabel USB ESC/POS)',
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
  "sec-payment-gateway", "sec-license", "sec-about", "sec-backup"
];

function contactHelpdeskWhatsApp() {
  const currentCfg = (typeof getActiveAboutConfig === 'function') ? getActiveAboutConfig() : null;
  const configuredWa = document.getElementById("setting-helpdesk-wa")?.value || (pos && pos.settings && pos.settings.helpdeskWa) || (currentCfg ? currentCfg.helpdeskWa : "6281234567890");
  const waNum = formatWhatsAppNumber(configuredWa);
  const storeName = (pos && pos.settings && pos.settings.storeName) ? pos.settings.storeName : "Toko SnackPOS";
  const appVer = currentCfg ? currentCfg.appVersion : "v2.4.2";
  const text = encodeURIComponent(`Halo Tim Support SnackPOS, saya dari ${storeName} (Terminal POS: ${appVer}). Mohon bantuan teknis operasional kasir.`);
  const waUrl = `https://wa.me/${waNum}?text=${text}`;
  
  const win = window.open(waUrl, '_blank');
  if (!win || win.closed || typeof win.closed === 'undefined') {
    window.location.href = waUrl;
  }
}
window.contactHelpdeskWhatsApp = contactHelpdeskWhatsApp;

function toggleSettingSection(secId) {
  const targetContent = document.getElementById(`content-${secId}`);
  const targetChevron = document.getElementById(`chevron-${secId}`);
  if (!targetContent) return;

  const isCurrentlyOpen = !targetContent.classList.contains("hidden");

  // Proteksi khusus modul sensitif jika tidak memiliki izin MANAGE_EMPLOYEES (Data Karyawan, QRIS Payment, Backup Database)
  if (!isCurrentlyOpen && (secId === "sec-employees" || secId === "sec-payment-gateway" || secId === "sec-backup")) {
    if (typeof hasPermissionForAction === "function" && !hasPermissionForAction(pos.currentUser, "MANAGE_EMPLOYEES")) {
      const desc = secId === "sec-payment-gateway"
        ? "Otorisasi Akses Pengaturan QRIS & Rekening Toko (Khusus Pejabat)"
        : (secId === "sec-backup"
            ? "Otorisasi Akses Backup & Restore Database Toko (Khusus Pejabat)"
            : "Otorisasi Akses Manajemen Karyawan Toko (Khusus COS)");
      requestSupervisorAuth("MANAGE_EMPLOYEES", desc, () => {
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
  const currentPos = window.pos || pos;
  if (!currentPos) return;

  const backup = {
    backupDate: new Date().toISOString(),
    version: "2.0.0-retail",
    settings: currentPos.settings || {},
    products: currentPos.products || [],
    transactions: currentPos.transactions || [],
    mutations: currentPos.mutations || [],
    members: currentPos.members || [],
    employees: currentPos.employees || [],
    lpbRecords: currentPos.lpbRecords || [],
    returns: currentPos.returns || [],
    klerkHistory: currentPos.klerkHistory || []
  };

  try {
    const jsonStr = JSON.stringify(backup, null, 2);
    const today = new Date().toISOString().split("T")[0];
    const fileName = `Backup_SnackPOS_Retail_${today}.json`;
    const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.setAttribute("download", fileName);
    link.rel = "noopener";
    link.target = "_self";
    // CRITICAL: JANGAN gunakan display:none karena Chrome Android memblokir klik tersembunyi
    link.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0.01;pointer-events:none;";
    document.body.appendChild(link);
    link.click();
    
    setTimeout(() => {
      try {
        if (link.parentNode) link.parentNode.removeChild(link);
        URL.revokeObjectURL(url);
      } catch(e){}
    }, 2000);

    if (typeof showToast === "function") {
      showToast("💾 Cadangan database (.json) berhasil diunduh!", "success");
    }
    if (window.sfx && typeof window.sfx.beep === "function") {
      window.sfx.beep();
    }
  } catch (err) {
    console.error("Gagal mendownload backup blob, mencoba fallback data URI:", err);
    try {
      const jsonStr = JSON.stringify(backup, null, 2);
      const today = new Date().toISOString().split("T")[0];
      const fileName = `Backup_SnackPOS_Retail_${today}.json`;
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonStr);
      const link = document.createElement("a");
      link.href = dataUri;
      link.download = fileName;
      link.setAttribute("download", fileName);
      link.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0.01;pointer-events:none;";
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (link.parentNode) link.parentNode.removeChild(link);
      }, 1000);
      if (typeof showToast === "function") showToast("💾 File cadangan berhasil dibuat!", "success");
      if (window.sfx && typeof window.sfx.beep === "function") window.sfx.beep();
    } catch(fallbackErr) {
      alert("Gagal mengunduh file cadangan: " + (err.message || err));
    }
  }
}

function restoreDatabaseBackup(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const currentPos = window.pos || pos;
  if (!currentPos) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed.products || !parsed.settings) {
        throw new Error("Format file JSON cadangan tidak valid!");
      }

      const prodCount = (parsed.products || []).length;
      const trxCount = (parsed.transactions || []).length;
      const dateStr = parsed.backupDate ? parsed.backupDate.split("T")[0] : "Lokal";

      if (confirm(`Pulihkan data dari backup (${dateStr})?\n\n• Produk: ${prodCount} SKU\n• Transaksi: ${trxCount} struk\n\nPerhatian: Data lokal saat ini akan digantikan oleh isi file cadangan ini.`)) {
        currentPos.products = parsed.products || [];
        currentPos.settings = { ...currentPos.settings, ...parsed.settings };
        currentPos.transactions = parsed.transactions || [];
        currentPos.mutations = parsed.mutations || [];
        if (parsed.members) currentPos.members = parsed.members;
        if (parsed.employees) currentPos.employees = parsed.employees;
        if (parsed.lpbRecords) currentPos.lpbRecords = parsed.lpbRecords;
        if (parsed.returns) currentPos.returns = parsed.returns;
        if (parsed.klerkHistory) currentPos.klerkHistory = parsed.klerkHistory;
        currentPos.cart = [];

        currentPos.saveProducts();
        currentPos.saveSettings();
        currentPos.saveTransactions();
        currentPos.saveMutations();
        if (typeof currentPos.saveMembers === "function") currentPos.saveMembers();
        if (typeof currentPos.saveEmployees === "function") currentPos.saveEmployees();
        if (typeof currentPos.saveLpbRecords === "function") currentPos.saveLpbRecords();
        if (typeof currentPos.saveReturns === "function") currentPos.saveReturns();
        if (typeof currentPos.saveKlerkHistory === "function") currentPos.saveKlerkHistory();

        if (typeof loadSettingsToForm === "function") loadSettingsToForm();
        if (typeof renderPosCart === "function") renderPosCart();
        if (typeof renderReports === "function") renderReports();
        if (typeof renderInventoryTable === "function") renderInventoryTable();
        if (typeof initSupabase === "function") initSupabase();

        if (typeof showToast === "function") showToast("✅ Database lokal berhasil dipulihkan!", "success");
        if (window.sfx && typeof window.sfx.success === "function") window.sfx.success();

        // Refresh ringkasan di modal backup jika masih terbuka
        if (typeof initSisBackupModal === "function") initSisBackupModal();
      }
    } catch (err) {
      alert("Gagal membaca file backup: " + err.message);
    } finally {
      // Reset input agar bisa pilih file yang sama kembali jika diperlukan
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

function initSisBackupModal() {
  const currentPos = window.pos || pos;
  const prodCount = (currentPos && currentPos.products) ? currentPos.products.length : 0;
  const trxCount = (currentPos && currentPos.transactions) ? currentPos.transactions.length : 0;
  const memCount = (currentPos && currentPos.members) ? currentPos.members.length : 0;

  const elProd = document.getElementById("sis-backup-prod-count");
  const elTrx = document.getElementById("sis-backup-trx-count");
  const elMem = document.getElementById("sis-backup-mem-count");

  if (elProd) elProd.textContent = `${prodCount.toLocaleString('id-ID')} SKU`;
  if (elTrx) elTrx.textContent = `${trxCount.toLocaleString('id-ID')} Struk`;
  if (elMem) elMem.textContent = `${memCount.toLocaleString('id-ID')} Orang`;
}

if (typeof window !== "undefined") {
  window.downloadDatabaseBackup = downloadDatabaseBackup;
  window.restoreDatabaseBackup = restoreDatabaseBackup;
  window.initSisBackupModal = initSisBackupModal;
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

// ==========================================
// MASTER BRANDING & ABOUT APLIKASI (CLOUD SYNC)
// ==========================================
const DEFAULT_APP_ABOUT_CONFIG = {
  appName: "SnackPOS Cloud Retail Edition",
  appVersion: "v2.4.2 (Build 2026.09.22)",
  devName: "SnackPOS Engineering Team",
  helpdeskWa: "6281234567890",
  helpdeskEmail: "support@snackpos.local",
  releaseNotes: "• Fitur Sinkronisasi Otomatis 30 Detik ke Cloud (Indikator Hijau & Manual Push)\n• Pencarian Cepat Produk (Live Typing, Lihat Semua, & Barcode Camera)\n• Valuasi Toko Rapi & Responsif (1 Baris Collapsible)\n• Panduan Lengkap SOP Kasir & Pintasan F1-F12",
  updatedAt: "2026-09-22T00:00:00.000Z"
};

function getActiveAboutConfig() {
  const stored = localStorage.getItem("snackpos_about_config");
  if (stored) {
    try {
      return { ...DEFAULT_APP_ABOUT_CONFIG, ...JSON.parse(stored) };
    } catch(e) {}
  }
  return { ...DEFAULT_APP_ABOUT_CONFIG };
}

// Menentukan status & badge lisensi berdasarkan Paket Pembelian Lisensi Toko (snack_pos_license)
function getStoreLicenseBadgeInfo() {
  const lic = typeof getStoredLicense === 'function' ? getStoredLicense() : null;
  if (!lic || !lic.isLicensed) {
    return {
      text: "BELUM BERLISENSI",
      className: "px-3 py-1 bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-black shrink-0"
    };
  }

  if (lic.status === "BLOCKED" || lic.status === "EXPIRED") {
    return {
      text: "LISENSI KADALUARSA / TERKUNCI",
      className: "px-3 py-1 bg-rose-100 text-rose-800 border border-rose-300 rounded-xl text-xs font-black shrink-0"
    };
  }

  if (lic.type === "LIFETIME" || lic.planType === "PAKET_1") {
    return {
      text: "💎 PAKET 1 - LIFETIME ENTERPRISE",
      className: "px-3 py-1 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-black shrink-0"
    };
  }

  if (lic.type === "TRIAL") {
    const exp = lic.expiresAt ? new Date(lic.expiresAt).toLocaleDateString("id-ID") : "";
    return {
      text: `🎁 TRIAL 7 HARI${exp ? ' (s/d ' + exp + ')' : ''}`,
      className: "px-3 py-1 bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-xs font-black shrink-0"
    };
  }

  // PAKET 2 / Langganan Cloud
  const exp = lic.expiresAt ? new Date(lic.expiresAt).toLocaleDateString("id-ID") : "";
  let durLabel = "🔄 PAKET 2 - LANGGANAN CLOUD";
  if (lic.cloudDuration === "365" || lic.planType === "PAKET_2_1Y") durLabel = "👑 PAKET 2 (1 TAHUN)";
  else if (lic.cloudDuration === "180" || lic.planType === "PAKET_2_6M") durLabel = "🔄 PAKET 2 (6 BULAN)";
  else if (lic.cloudDuration === "90" || lic.planType === "PAKET_2_3M") durLabel = "🔄 PAKET 2 (3 BULAN)";
  else if (lic.cloudDuration === "30" || lic.planType === "PAKET_2_1M") durLabel = "🔄 PAKET 2 (1 BULAN)";

  return {
    text: `${durLabel}${exp ? ' (s/d ' + exp + ')' : ''}`,
    className: "px-3 py-1 bg-blue-100 text-blue-800 border border-blue-300 rounded-xl text-xs font-black shrink-0"
  };
}

function updateAboutLicenseBadge() {
  const badgeInfo = getStoreLicenseBadgeInfo();
  const licEl = document.getElementById("about-display-license");
  if (licEl) {
    licEl.textContent = badgeInfo.text;
    licEl.className = badgeInfo.className;
  }
  const mockupLic = document.getElementById("mockup-about-license");
  if (mockupLic) {
    mockupLic.textContent = badgeInfo.text;
    mockupLic.className = badgeInfo.className.replace('text-xs', 'text-[9px]');
  }
}

function applyAboutConfigToUI(cfg) {
  const c = cfg || getActiveAboutConfig();

  // 1. Badge versi di tombol accordion menu setting
  const badgeVer = document.getElementById("about-badge-version");
  if (badgeVer) badgeVer.textContent = c.appVersion || DEFAULT_APP_ABOUT_CONFIG.appVersion;

  // 2. Display nama aplikasi & versi di dalam sec-about
  const nameEl = document.getElementById("about-display-app-name");
  if (nameEl) nameEl.textContent = c.appName || DEFAULT_APP_ABOUT_CONFIG.appName;

  const verBuildEl = document.getElementById("about-display-version-build");
  if (verBuildEl) {
    const vMatch = (c.appVersion || "").match(/^(v[^\s(]+)(?:\s*\((?:Build\s*)?([^)]+)\))?/i);
    const verPart = vMatch ? vMatch[1] : (c.appVersion || "v2.4.2");
    const buildPart = vMatch && vMatch[2] ? vMatch[2] : "2026.09.22";
    verBuildEl.innerHTML = `Versi: <strong class="text-indigo-600">${verPart}</strong> • Build: <strong class="text-slate-700">${buildPart}</strong>`;
  }

  // Sinkronkan status lisensi kasir secara otomatis dengan paket pembelian lisensi toko aktif
  updateAboutLicenseBadge();

  const devEl = document.getElementById("about-display-dev-name");
  if (devEl) devEl.textContent = c.devName || DEFAULT_APP_ABOUT_CONFIG.devName;

  // 3. Release Notes
  const notesContainer = document.getElementById("about-display-release-notes");
  if (notesContainer && c.releaseNotes) {
    const lines = c.releaseNotes.split("\n").filter(l => l.trim().length > 0);
    const listHtml = lines.map(l => `<li>${l.replace(/^[-*•]\s*/, '')}</li>`).join("");
    notesContainer.innerHTML = `
      <span class="text-[11px] font-bold text-indigo-950 uppercase tracking-wider block mb-1">
        ✨ Pembaruan Rilis ${c.appVersion || 'Terbaru'}:
      </span>
      <ul class="text-[11px] text-indigo-900/90 space-y-0.5 list-disc list-inside">
        ${listHtml}
      </ul>
    `;
  }

  // 4. Input kontak WhatsApp & Email Helpdesk di form settings
  const inputWa = document.getElementById("setting-helpdesk-wa");
  if (inputWa && (!inputWa.value || inputWa.value === DEFAULT_APP_ABOUT_CONFIG.helpdeskWa)) {
    if (pos && pos.settings && pos.settings.helpdeskWa) {
      inputWa.value = formatWhatsAppNumber(pos.settings.helpdeskWa);
    } else if (c.helpdeskWa) {
      inputWa.value = formatWhatsAppNumber(c.helpdeskWa);
    }
  }
  const inputEmail = document.getElementById("setting-helpdesk-email");
  if (inputEmail && (!inputEmail.value || inputEmail.value === DEFAULT_APP_ABOUT_CONFIG.helpdeskEmail)) {
    if (pos && pos.settings && pos.settings.helpdeskEmail) {
      inputEmail.value = pos.settings.helpdeskEmail;
    } else if (c.helpdeskEmail) {
      inputEmail.value = c.helpdeskEmail;
    }
  }

  // 5. Update di mockup-pos.html jika elemen ada
  const mockupName = document.getElementById("mockup-about-name");
  if (mockupName) mockupName.textContent = c.appName;
  const mockupVer = document.getElementById("mockup-about-ver");
  if (mockupVer) mockupVer.textContent = c.appVersion;
  const mockupDev = document.getElementById("mockup-about-dev");
  if (mockupDev) mockupDev.textContent = c.devName;
}

async function fetchAndApplyAboutConfig(providedClient = null) {
  applyAboutConfigToUI();
  const client = providedClient || (typeof supabaseClient !== 'undefined' && supabaseClient) || (typeof window !== 'undefined' && window.supabaseClient);
  if (!client || !navigator.onLine) return;

  try {
    const { data, error } = await client
      .from('app_config')
      .select('value, updated_at')
      .eq('key', 'app_about_config')
      .maybeSingle();

    if (!error && data && data.value) {
      const merged = { ...DEFAULT_APP_ABOUT_CONFIG, ...data.value };
      if (data.updated_at) merged.updatedAt = data.updated_at;
      localStorage.setItem("snackpos_about_config", JSON.stringify(merged));
      applyAboutConfigToUI(merged);
    }
  } catch (e) {
    console.warn("[About Config] Gagal fetch dari Supabase:", e.message);
  }
}

// Inisialisasi awal saat settings.js dimuat
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    applyAboutConfigToUI();
    setTimeout(() => {
      fetchAndApplyAboutConfig();
    }, 1500);
  });
}


