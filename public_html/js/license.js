/**
 * SnackPOS - Vendor License & Store Account Verification (Email + OTP & Trial 7 Hari)
 */

// Auto-purge lisensi dummy / STR-001 / demo lama dari penyimpanan lokal browser
(function autoPurgeLegacyDummyLicense() {
  try {
    const raw = localStorage.getItem("snack_pos_license");
    if (raw) {
      const p = JSON.parse(raw);
      if (!p || 
          p.ownerEmail === "test@tokoberkah.com" || 
          p.ownerEmail === "berkah@gmail.com" ||
          (p.licenseKey && typeof p.licenseKey === "string" && (
            p.licenseKey.startsWith("SPOS-OFFL") || 
            p.licenseKey.startsWith("SPOS-DEMO")
          ))) {
        console.warn("[Purge] Menghapus lisensi dummy lama dari browser.");
        localStorage.removeItem("snack_pos_license");
        localStorage.removeItem("snack_pos_current_user");
      }
    }
  } catch(e) {}
})();

// ==========================================
// 1b. SISTEM LISENSI RESMI & AKUN MERCHANT (VENDOR)
// ==========================================
const VENDOR_SECRET_SALT = "SNACKPOS_SEC_PROD_SALT_98f4a27b1e84c90d_2026";

// Helper resmi koneksi Supabase VPS
function getSupabaseUrlAndKey() {
  const defaultUrl = (typeof window !== "undefined" && window.location && window.location.origin && window.location.origin.startsWith("http"))
    ? window.location.origin
    : (window.OFFICIAL_SUPABASE_URL || "https://2.27.165.72.sslip.io");
  const defaultKey = window.OFFICIAL_SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODUwNDE4LCJleHAiOjE5NDc1MzA0MTh9.99BRNnUQwei95p1zAqtFBBD5CnUJSedfUeh2MJy97Gg";
  
  let url = (typeof pos !== "undefined" && pos?.settings?.supabaseUrl && !pos.settings.supabaseUrl.includes("supabase.co")) 
    ? pos.settings.supabaseUrl 
    : defaultUrl;
  let key = (typeof pos !== "undefined" && pos?.settings?.supabaseKey && !pos.settings.supabaseKey.includes("sb_publishable")) 
    ? pos.settings.supabaseKey 
    : defaultKey;

  return {
    url: typeof cleanSupabaseUrl === "function" ? cleanSupabaseUrl(url) : url,
    key: typeof cleanSupabaseKey === "function" ? cleanSupabaseKey(key) : key
  };
}

function getActiveSupabaseClient() {
  const { url, key } = getSupabaseUrlAndKey();
  if (window.supabase && typeof window.supabase.createClient === "function") {
    return window.supabase.createClient(url, key);
  }
  return null;
}


// Verifikasi kompatibilitas kunci cadangan
function verifyChecksumProductKey(productKey) {
  if (!productKey || typeof productKey !== 'string') return null;
  const cleanKey = productKey.trim().toUpperCase();
  const parts = cleanKey.split('-');
  if (parts.length === 5 && parts[0] === 'SPOS') {
    const type = parts[1];
    const r1 = parts[2];
    const r2 = parts[3];
    const chk = parts[4];
    const raw = `${type}-${r1}-${r2}`;
    const expectedChk = sha256Pure(`${VENDOR_SECRET_SALT}:${raw}`).slice(0, 4);
    if (chk === expectedChk) {
      return type;
    }
  }
  return null;
}

// ID Perangkat Unik Berbasis Hardware Fingerprint
function getOrCreateDeviceId() {
  let devId = localStorage.getItem("snack_pos_device_id");
  if (!devId) {
    const nav = window.navigator || {};
    const scr = window.screen || {};
    const raw = `${nav.userAgent || ''}-${scr.width}x${scr.height}-${scr.colorDepth}-${nav.hardwareConcurrency || 4}-${Date.now()}-${Math.random()}`;
    
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash) + raw.charCodeAt(i);
      hash |= 0;
    }
    const hex1 = Math.abs(hash).toString(16).padStart(8, '0').toUpperCase().slice(0, 4);
    const hex2 = Math.abs(Math.sin(hash) * 10000000 | 0).toString(16).padStart(4, '0').toUpperCase();
    const hex3 = Math.floor(1000 + Math.random() * 9000).toString(16).toUpperCase().padStart(4, '0');
    
    devId = `DEV-${hex1}-${hex2}-${hex3}`;
    localStorage.setItem("snack_pos_device_id", devId);
  }
  return devId;
}

// Fungsi Hash SHA-256 Murni (Mendukung Verifikasi Kriptografi Offline)
function sha256Pure(ascii) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const lengthProperty = 'length';
  let i, j;
  let result = '';
  const words = [];
  const asciiBitLength = ascii[lengthProperty] * 8;
  const hash = [];
  const k = [];
  let primeCounter = 0;
  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = candidate;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  ascii += '\x80';
  while ((ascii[lengthProperty] % 64) !== 56) ascii += '\x00';
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i);
    words[i >> 2] |= j << ((3 - (i % 4)) * 8);
  }
  words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
  words[words[lengthProperty]] = asciiBitLength;
  for (j = 0; j < words[lengthProperty];) {
    const w = words.slice(j, j += 16);
    const oldHash = [...hash];
    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = hash[0], e = hash[4];
      const temp1 = hash[7]
        + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
        + ((e & hash[5]) ^ ((~e) & hash[6]))
        + k[i]
        + (w[i] = (i < 16) ? w[i] : (
            w[i - 16]
            + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
            + w[i - 7]
            + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
          ) | 0
        );
      const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
        + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash[7] = hash[6];
      hash[6] = hash[5];
      hash[5] = hash[4];
      hash[4] = (hash[3] + temp1) | 0;
      hash[3] = hash[2];
      hash[2] = hash[1];
      hash[1] = hash[0];
      hash[0] = (temp1 + temp2) | 0;
    }
    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }
  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += ((b < 16) ? '0' : '') + b.toString(16);
    }
  }
  return result.toUpperCase();
}

function computeExpectedOfflineKey(clientName, deviceId, licenseType, expiryStr) {
  const payload = `${clientName.trim().toUpperCase()}|${deviceId.trim().toUpperCase()}|${licenseType.trim().toUpperCase()}|${expiryStr.trim().toUpperCase()}`;
  const fullHash = sha256Pure(`${VENDOR_SECRET_SALT}:${payload}`);
  const shortSig = fullHash.slice(0, 12);
  return `SPOS-OFFL-${shortSig.slice(0, 4)}-${shortSig.slice(4, 8)}-${shortSig.slice(8, 12)}`;
}

function getStoredLicense() {
  const raw = localStorage.getItem("snack_pos_license");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.storeId) {
        return parsed;
      }
    } catch (e) {}
  }
  return null;
}

function saveStoredLicense(licenseObj) {
  try {
    localStorage.setItem("snack_pos_license", JSON.stringify(licenseObj));
  } catch (e) {
    console.error("[License] Error writing localStorage:", e);
  }
  try {
    renderLicenseStatus();
  } catch (renderErr) {
    console.warn("[License] renderLicenseStatus warning:", renderErr);
  }
}

function isAppLicensed() {
  const lic = getStoredLicense();
  if (!lic || !lic.isLicensed) return false;
  if (lic.status === "BLOCKED" || lic.status === "EXPIRED") return false;
  if (lic.expiresAt && new Date() > new Date(lic.expiresAt)) return false;
  return true;
}

async function checkLicenseOnStartup() {
  const lic = getStoredLicense();
  const lockModal = document.getElementById("modal-activation-lock");

  if (!lic || !isAppLicensed()) {
    // Pengguna baru pertama kali membuka web: Wajib diarahkan ke FORM PENDAFTARAN TOKO
    if (lockModal) {
      lockModal.classList.remove("hidden");
      lockModal.style.display = "flex";
    }
    document.body.classList.add("modal-open");
    if (typeof switchAuthLayer === "function") {
      switchAuthLayer("login");
    }

    const closeBtn = document.getElementById("btn-close-store-login");
    if (closeBtn) closeBtn.classList.add("hidden");
    return;
  }

  // Jika sudah terdaftar dan lisensi aktif:
  if (lockModal) {
    lockModal.classList.add("hidden");
    lockModal.style.display = "none";
  }
  document.body.classList.remove("modal-open");
  if (typeof renderLicenseStatus === "function") renderLicenseStatus();

  // Sinkronkan status lisensi dari Supabase jika online
  try {
    const client = typeof getActiveSupabaseClient === "function" ? getActiveSupabaseClient() : null;
    if (client && lic.storeId && navigator.onLine) {
      client.from('store_licenses').select('pos_status, pos_expires_at, plan_type').eq('store_id', lic.storeId).maybeSingle().then(({ data }) => {
        if (data) {
          if (data.pos_status === "BLOCKED" || (data.pos_expires_at && new Date() > new Date(data.pos_expires_at))) {
            lic.status = data.pos_status === "BLOCKED" ? "BLOCKED" : "EXPIRED";
            saveStoredLicense(lic);
            checkLicenseOnStartup();
          }
        }
      });
    }
  } catch(e) {}
}

// Fungsi Pembersih Total Sesi Login Supabase & Pengunci Aplikasi Kasir
async function cleanupSupabaseSessionAndLock(client) {
  // VPS Self-Hosted Edition: Kasir selalu aktif dan tidak pernah terkunci
  renderLicenseStatus();
}

async function handleSuccessfulSupabaseAuth(email, client) {
  const cleanEmail = email.trim().toLowerCase();
  const currentDevId = getOrCreateDeviceId();
  const storeName = pos.settings.storeName || "Toko Kasir Retail";

  let licenseRow = null;
  if (client) {
    try {
      const { data: rowData } = await client
        .from('store_licenses')
        .select('*')
        .eq('owner_email', cleanEmail)
        .maybeSingle();

      if (rowData) {
        // Cek status blokir atau kedaluwarsa dari database pusat
        if (rowData.pos_status === "BLOCKED") {
          showToast("⛔ Akun toko ini telah dinonaktifkan oleh Admin. Hubungi Vendor.", "error", 8000);
          if (typeof sfx !== 'undefined' && sfx.warning) sfx.warning();
          await cleanupSupabaseSessionAndLock(client);
          return;
        }

        if (rowData.plan_type === "TRIAL" && rowData.pos_expires_at && new Date() > new Date(rowData.pos_expires_at)) {
          showToast("⛔ Masa uji coba gratis akun ini telah berakhir. Silakan beli Lisensi Resmi via QRIS.", "warning", 8000);
          if (typeof sfx !== 'undefined' && sfx.warning) sfx.warning();
          await cleanupSupabaseSessionAndLock(client);
          return;
        }

        if (rowData.pos_status === "EXPIRED" || (rowData.pos_expires_at && new Date() > new Date(rowData.pos_expires_at))) {
          const expDate = rowData.pos_expires_at ? new Date(rowData.pos_expires_at).toLocaleDateString('id-ID') : 'kemarin';
          showToast(`⛔ Masa aktif lisensi akun ini telah berakhir (${expDate}). Silakan perpanjang via Tab QRIS.`, "warning", 8000);
          if (typeof sfx !== 'undefined' && sfx.warning) sfx.warning();
          await cleanupSupabaseSessionAndLock(client);
          return;
        }

        licenseRow = rowData;
        await client
          .from('store_licenses')
          .update({ 
            active_device_id: currentDevId, 
            last_login_at: new Date().toISOString() 
          })
          .eq('owner_email', cleanEmail);
      } else {
        // ⛔ Email TIDAK terdaftar / telah dihapus dari database lisensi resmi Supabase!
        showToast(`⛔ Akun email "${cleanEmail}" telah dihapus atau tidak terdaftar di database lisensi resmi SnackPOS. Kasir dikunci.`, "error", 9000);
        if (typeof sfx !== 'undefined' && sfx.warning) sfx.warning();
        await cleanupSupabaseSessionAndLock(client);
        return;
      }
    } catch (err) {
      console.warn("Gagal cek store_licenses:", err);
      showToast("Gagal memverifikasi akun lisensi di cloud: " + err.message, "error");
      await cleanupSupabaseSessionAndLock(client);
      return;
    }
  }

  const isLifetime = (licenseRow && (licenseRow.plan_type === "PAKET_1" || licenseRow.plan_type === "LIFETIME"));
  const isTrial = (licenseRow && licenseRow.plan_type === "TRIAL");
  const storeId = (licenseRow && licenseRow.store_id) ? licenseRow.store_id : (typeof getOrCreateStoreId === 'function' ? getOrCreateStoreId() : "STR-MAIN");

  const localLic = {
    isLicensed: true,
    status: licenseRow ? licenseRow.pos_status : "ACTIVE",
    type: isTrial ? "TRIAL" : (isLifetime ? "LIFETIME" : "SUBSCRIPTION"),
    planType: (licenseRow && licenseRow.plan_type) ? licenseRow.plan_type : "PAKET_1",
    clientName: (licenseRow && licenseRow.store_name) ? licenseRow.store_name : storeName,
    storeId: storeId,
    ownerEmail: cleanEmail,
    deviceId: currentDevId,
    licenseKey: isTrial ? `TRIAL-${storeId}` : (licenseRow.license_key || `SPOS-EMAIL-${licenseRow.id || storeId}`),
    expiresAt: licenseRow ? licenseRow.pos_expires_at : null,
    cloudStatus: licenseRow ? licenseRow.cloud_status : "INACTIVE",
    cloudExpiresAt: licenseRow ? licenseRow.cloud_expires_at : null,
    activatedAt: new Date().toISOString(),
    cloudActive: licenseRow ? (licenseRow.cloud_status === "ACTIVE") : false
  };
  saveStoredLicense(localLic);

  // Bersihkan hash di URL agar bersih jika login dari magic link
  if (window.location.hash && window.location.hash.includes("access_token")) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }

  const lockModal = document.getElementById("modal-activation-lock");
  if (lockModal) {
    lockModal.classList.add("hidden");
    document.body.classList.remove("modal-open");
  }

  if (typeof sfx !== 'undefined' && sfx.success) sfx.success();
  showToast(`✅ Autentikasi Berhasil! Selamat datang, ${localLic.clientName}.`, "success");
  renderLicenseStatus();
  checkAndOpenPostLicenseSetup();
}

function checkAndOpenPostLicenseSetup() {
  if (typeof isAppLicensed === "function" && !isAppLicensed()) {
    return;
  }
  if (!pos.employees || pos.employees.length === 0) {
    if (typeof openModal === "function") {
      openModal("modal-first-time-setup");
      setTimeout(() => {
        const nameInput = document.getElementById("setup-cos-name");
        if (nameInput) nameInput.focus();
      }, 250);
    }
  } else if (!pos.currentUser) {
    if (typeof openModal === "function") {
      openModal("modal-employee-login");
      setTimeout(() => {
        const nikInput = document.getElementById("login-employee-nik");
        if (nikInput) nikInput.focus();
      }, 250);
    }
  } else {
    setTimeout(() => {
      const input = document.getElementById("pos-barcode-search");
      if (input) input.focus();
    }, 300);
  }
}

let currentCashierSelectedPlan = "PAKET_1";
let cashierQrisPollingTimer = null;
let cashierQrisCountdownTimer = null;
let cashierActiveOrderData = null;

// ==========================================
// 1a. SISTEM AUTHENTIKASI 3-LAYER KASIR (LOGIN -> SIGNUP -> PILIH PAKET)
// ==========================================

// Navigasi Antar Layer Autentikasi Kasir
function switchAuthLayer(layer) {
  const layerLogin = document.getElementById("auth-layer-login");
  const layerSignup = document.getElementById("auth-layer-signup");
  const layerPricing = document.getElementById("auth-layer-pricing");

  if (layerLogin) layerLogin.classList.add("hidden");
  if (layerSignup) layerSignup.classList.add("hidden");
  if (layerPricing) layerPricing.classList.add("hidden");

  // Reset tampilan QRIS jika ada
  document.getElementById("auth-pricing-selection")?.classList.remove("hidden");
  document.getElementById("act-qris-step-display")?.classList.add("hidden");

  if (layer === "signup") {
    if (layerSignup) layerSignup.classList.remove("hidden");
    const nameInput = document.getElementById("signup-store-name");
    if (nameInput) nameInput.focus();
  } else if (layer === "pricing") {
    if (layerPricing) layerPricing.classList.remove("hidden");
    loadCashierModalPricing();
    updateLifetimeAddonTotal();
  } else {
    // Default: Layer 1 (Login Bersih)
    if (layerLogin) layerLogin.classList.remove("hidden");
    const loginInput = document.getElementById("act-store-id-input");
    if (loginInput) loginInput.focus();
    updateVendorWhatsAppLinks();
  }
}

// Pendaftaran Toko Bersih (Clean 2-Layer Onboarding: Langsung Aktif Tanpa Layer Paket di Awal)
async function submitDirectSignup() {
  const nameInput = document.getElementById("signup-store-name");
  const waInput = document.getElementById("signup-store-wa");
  const pinInput = document.getElementById("signup-store-pin");
  const btnSubmit = document.getElementById("btn-submit-signup");

  const storeName = nameInput ? nameInput.value.trim() : "";
  const rawWa = waInput ? waInput.value.trim() : "";
  const pin = pinInput ? pinInput.value.trim() : "";
  const normWa = normalizePhoneIdentifier(rawWa);

  if (!storeName) {
    showToast("Silakan masukkan Nama Toko.", "warning");
    if (nameInput) nameInput.focus();
    return;
  }
  if (!rawWa || normWa.length < 8) {
    showToast("Masukkan Nomor WhatsApp yang valid.", "warning");
    if (waInput) waInput.focus();
    return;
  }
  if (!pin || pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin)) {
    showToast("PIN harus 4-6 digit angka.", "warning");
    if (pinInput) pinInput.focus();
    return;
  }

  // Simpan data sementara ke pos.settings
  pos.settings.storeName = storeName;
  pos.settings.storePhone = normWa;

  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = "Mendaftar...";
  }

  try {
    await submitSignupWithPlan("TRIAL");
  } catch (err) {
    console.error("submitDirectSignup error:", err);
    showToast("Pendaftaran gagal: " + (err.message || err), "error");
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = "Daftar";
    }
  }
}

function goToPricingLayer() {
  submitDirectSignup();
}

// Eksekusi Pilihan Paket di Layer 3: Trial 7 Hari (Rp 0), SaaS Bulanan (Rp 30.000), atau Lifetime
async function submitSignupWithPlan(planType) {
  const storeName = document.getElementById("signup-store-name")?.value.trim() || pos.settings.storeName || "Toko Kasir Retail";
  const rawWa = document.getElementById("signup-store-wa")?.value.trim() || pos.settings.storePhone || "";
  const pin = document.getElementById("signup-store-pin")?.value.trim() || "123456";
  const normWa = normalizePhoneIdentifier(rawWa);

  if (!storeName || !normWa) {
    showToast("⚠️ Data pendaftaran belum lengkap. Silakan isi form toko.", "warning");
    switchAuthLayer("signup");
    return;
  }

  if (planType === "TRIAL") {
    // 1. Eksekusi Pendaftaran Trial 7 Hari Gratis
    const btnTrial = document.getElementById("btn-start-trial-plan");
    if (btnTrial) {
      btnTrial.disabled = true;
      btnTrial.innerHTML = `<span>⏳ Mengaktifkan Trial Kasir...</span>`;
    }

    try {
      const cleanUrl = cleanSupabaseUrl(pos.settings.supabaseUrl || (typeof window !== 'undefined' ? window.OFFICIAL_SUPABASE_URL : '') || "https://2.27.165.72.sslip.io");
      const cleanKey = cleanSupabaseKey(pos.settings.supabaseKey || (typeof window !== 'undefined' ? window.OFFICIAL_SUPABASE_KEY : '') || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODUwNDE4LCJleHAiOjE5NDc1MzA0MTh9.99BRNnUQwei95p1zAqtFBBD5CnUJSedfUeh2MJy97Gg");
      const client = window.supabase ? window.supabase.createClient(cleanUrl, cleanKey) : null;

      const storeId = "STR-" + Math.floor(1000 + Math.random() * 9000);
      const currentDevId = getOrCreateDeviceId();
      const trialExp = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

      if (client) {
        // Cek apakah nomor WA ini sudah pernah aktif
        const { data: existRow } = await client
          .from('store_licenses')
          .select('*')
          .eq('whatsapp', normWa)
          .maybeSingle();

        if (existRow && existRow.pos_status === 'ACTIVE' && (!existRow.pos_expires_at || new Date() < new Date(existRow.pos_expires_at))) {
          showToast(`Nomor WA ini sudah terdaftar sebagai "${existRow.store_name}". Silakan login dengan PIN Anda.`, "info", 7000);
          switchAuthLayer('login');
          const actStoreInput = document.getElementById("act-store-id-input");
          if (actStoreInput) actStoreInput.value = existRow.store_id;
          return;
        }

        await client
          .from('store_licenses')
          .upsert({
            store_id: storeId,
            store_name: storeName,
            whatsapp: normWa,
            owner_email: `${normWa}@trial.snackpos.com`,
            plan_type: "TRIAL",
            pos_status: "ACTIVE",
            pos_expires_at: trialExp,
            cloud_status: "ACTIVE",
            cloud_expires_at: trialExp,
            active_device_id: currentDevId,
            last_payment_method: "TRIAL_7_HARI",
            last_amount_paid: 0,
            last_login_at: new Date().toISOString()
          }, { onConflict: 'store_id' });

        await saveStorePinToCloud(client, storeId, pin);
      }

      // Simpan lisensi lokal
      const localLic = {
        isLicensed: true,
        ownerEmail: `${normWa}@trial.snackpos.com`,
        whatsapp: normWa,
        storeId: storeId,
        clientName: storeName,
        deviceId: currentDevId,
        type: "TRIAL",
        planType: "TRIAL",
        status: "ACTIVE",
        expiresAt: trialExp,
        cloudStatus: "ACTIVE",
        cloudExpiresAt: trialExp,
        activatedAt: new Date().toISOString(),
        pin: pin
      };

      saveStoredLicense(localLic);

      pos.settings.storeId = storeId;
      pos.settings.storeName = storeName;
      pos.settings.storePhone = normWa;
      pos.saveSettings();

      // Tutup modal aktivasi
      document.getElementById("modal-activation-lock")?.classList.add("hidden");
      document.body.classList.remove("modal-open");

      if (typeof sfx !== 'undefined' && sfx.applause) sfx.applause();
      showToast(`🎉 TRIAL 7 HARI AKTIF! Selamat datang di kasir ${storeName}. ID Toko: ${storeId}`, "success", 7000);
      renderLicenseStatus();
      if (typeof checkAndOpenPostLicenseSetup === 'function') checkAndOpenPostLicenseSetup();

    } catch (e) {
      console.error("[TrialRegister] Error:", e);
      showToast("Gagal mendaftar trial: " + e.message, "error");
    } finally {
      if (btnTrial) {
        btnTrial.disabled = false;
        btnTrial.innerHTML = `<span>🚀 Aktifkan Trial Gratis Sekarang &rarr;</span>`;
      }
    }
  } else {
    // 2. Eksekusi Paket Berbayar: PAKET_2 (SaaS 1/3/6/12 Bulan) atau PAKET_1 (Lifetime) -> Tampilkan QRIS
    currentCashierSelectedPlan = planType;

    // Sembunyikan seleksi paket & tampilkan box QRIS
    document.getElementById("auth-pricing-selection")?.classList.add("hidden");
    document.getElementById("act-qris-step-display")?.classList.remove("hidden");

    const freshPricing = await getFreshCloudPricing();
    let activePrice = 0;
    let durationDays = 30;
    let planTitle = "";

    const selectedAddons = [];
    let hasCloudSync = false;
    let hasMultiKasir = false;

    let cloudDays = 0;

    if (planType === "PAKET_1") {
      activePrice = Number(freshPricing.p1Lifetime) || 99000;
      durationDays = null;
      
      // Add-on Cloud Sync HP (sesuai 4 durasi)
      if (selectedLifetimeCloudDuration) {
        const durKey = selectedLifetimeCloudDuration === '1m' ? 'cloud1m'
                     : selectedLifetimeCloudDuration === '3m' ? 'cloud3m'
                     : selectedLifetimeCloudDuration === '6m' ? 'cloud6m'
                     : 'cloud1y';
        const cloudPrice = Number(freshPricing[durKey]) || (
          selectedLifetimeCloudDuration === '1m' ? 25000 :
          selectedLifetimeCloudDuration === '3m' ? 65000 :
          selectedLifetimeCloudDuration === '6m' ? 120000 : 200000
        );
        cloudDays = selectedLifetimeCloudDuration === '1m' ? 30 
                  : selectedLifetimeCloudDuration === '3m' ? 90 
                  : selectedLifetimeCloudDuration === '6m' ? 180 : 365;
        const durText = selectedLifetimeCloudDuration === '1m' ? '1 Bln' 
                      : selectedLifetimeCloudDuration === '3m' ? '3 Bln' 
                      : selectedLifetimeCloudDuration === '6m' ? '6 Bln' : '1 Thn';
        activePrice += cloudPrice;
        selectedAddons.push(`Cloud Sync HP (${durText})`);
        hasCloudSync = true;
      }

      // Add-on Multi-Kasir
      const multiChecked = document.getElementById("addon-multi-kasir")?.checked || false;
      if (multiChecked) {
        const multiPrice = Number(freshPricing.multiKasirPrice || 40000);
        activePrice += multiPrice;
        selectedAddons.push("Multi-Kasir (+1 Device)");
        hasMultiKasir = true;
      }
      const addonText = selectedAddons.length > 0 ? ` + ${selectedAddons.join(' & ')}` : "";
      planTitle = `💎 Paket Lifetime (Beli Putus)${addonText}`;
    } else if (planType === "PAKET_2_3M") {
      activePrice = Number(freshPricing.p2_3m) || 85000;
      durationDays = 90;
      cloudDays = 90;
      planTitle = "⭐ Paket SaaS POS + Cloud (3 Bulan)";
      hasCloudSync = true;
    } else if (planType === "PAKET_2_6M") {
      activePrice = Number(freshPricing.p2_6m) || 160000;
      durationDays = 180;
      cloudDays = 180;
      planTitle = "⭐ Paket SaaS POS + Cloud (6 Bulan)";
      hasCloudSync = true;
    } else if (planType === "PAKET_2_1Y") {
      activePrice = Number(freshPricing.p2_1y) || 300000;
      durationDays = 365;
      cloudDays = 365;
      planTitle = "⭐ Paket SaaS POS + Cloud (12 Bulan / 1 Tahun)";
      hasCloudSync = true;
    } else {
      // Default: PAKET_2 (1 Bulan)
      activePrice = Number(freshPricing.p2_1m) || 30000;
      durationDays = 30;
      cloudDays = 30;
      planTitle = "⭐ Paket SaaS POS + Cloud (1 Bulan)";
      hasCloudSync = true;
    }

    const currentStoreId = pos.settings.storeId || (typeof getOrCreateStoreId === 'function' ? getOrCreateStoreId() : "STR-" + Math.floor(1000 + Math.random() * 9000));
    const currentDevId = getOrCreateDeviceId();

    cashierActiveOrderData = {
      plan: planType,
      durationDays: durationDays,
      cloudDays: cloudDays,
      amount: activePrice,
      addons: selectedAddons,
      hasCloudSync: hasCloudSync,
      hasMultiKasir: hasMultiKasir,
      storeId: currentStoreId,
      storeName: storeName,
      wa: normWa,
      pin: pin,
      deviceId: currentDevId,
      orderRef: `ORD-${Date.now().toString().slice(-6)}`
    };

    pos.settings.storeName = storeName;
    pos.settings.storePhone = normWa;
    pos.settings.storeId = currentStoreId;
    pos.saveSettings();

    const planLabelEl = document.getElementById("act-qris-plan-label");
    const nominalLabelEl = document.getElementById("act-qris-nominal-label");
    if (planLabelEl) planLabelEl.textContent = planTitle;
    if (nominalLabelEl) nominalLabelEl.textContent = `Rp ${activePrice.toLocaleString('id-ID')}`;

    const qrisImg = document.getElementById("act-qris-img");
    if (qrisImg) {
      const customQris = await getQrisImageUrl();
      if (customQris) {
        qrisImg.src = customQris;
      } else {
        const qrPayload = `00020101021226590014ID.LINKAJA.WWW01189360091400000000000215SNACKPOSPAYMENT520454995802ID5914SNACKPOS+KASIR6007JAKARTA62070703A0163046D5E`;
        qrisImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrPayload)}`;
      }
    }

    // Pre-register status PENDING ke Supabase agar langsung tampil di Portal Lisensi
    const client = typeof getActiveSupabaseClient === 'function' ? getActiveSupabaseClient() : null;
    if (client && navigator.onLine) {
      try {
        await client.from('store_licenses').upsert({
          store_id: currentStoreId,
          store_name: storeName,
          whatsapp: normWa,
          owner_email: `${normWa}@snackpos.local`,
          plan_type: planType,
          pos_status: 'PENDING',
          cloud_status: hasCloudSync ? 'ACTIVE' : 'INACTIVE',
          last_payment_method: 'QRIS',
          last_amount_paid: activePrice,
          active_device_id: currentDevId,
          updated_at: new Date().toISOString()
        }, { onConflict: 'store_id' });
        await saveStorePinToCloud(client, currentStoreId, pin, normWa);
      } catch (e) {
        console.warn('Pre-register PENDING store error:', e);
      }
    }

    startCashierQrisCountdown(15 * 60);
    startCashierPaymentPolling(currentStoreId, activePrice, planType);
  }
}

// Tab Switcher Modal Aktivasi (Fallback)
function switchActivationTab(tab) {
  if (tab === "key") {
    switchAuthLayer("login");
  } else {
    switchAuthLayer("pricing");
  }
}

// Pemilihan Paket di Kasir
function selectCashierPlan(plan) {
  currentCashierSelectedPlan = plan;
  const cardP1 = document.getElementById("act-card-p1");
  const cardP2 = document.getElementById("act-card-p2");
  const badgeP1 = document.getElementById("act-p1-badge");
  const badgeP2 = document.getElementById("act-p2-badge");

  if (plan === "PAKET_1") {
    if (cardP1) cardP1.className = "p-3.5 rounded-2xl border-2 border-indigo-600 bg-indigo-50/50 cursor-pointer transition-all flex flex-col justify-between";
    if (cardP2) cardP2.className = "p-3.5 rounded-2xl border-2 border-slate-200 bg-white hover:border-slate-300 cursor-pointer transition-all flex flex-col justify-between";
    if (badgeP1) badgeP1.classList.remove("hidden");
    if (badgeP2) badgeP2.classList.add("hidden");
  } else {
    if (cardP2) cardP2.className = "p-3.5 rounded-2xl border-2 border-indigo-600 bg-indigo-50/50 cursor-pointer transition-all flex flex-col justify-between";
    if (cardP1) cardP1.className = "p-3.5 rounded-2xl border-2 border-slate-200 bg-white hover:border-slate-300 cursor-pointer transition-all flex flex-col justify-between";
    if (badgeP2) badgeP2.classList.remove("hidden");
    if (badgeP1) badgeP1.classList.add("hidden");
  }
}

// Ambil harga paket terkini dari Supabase app_config / store_licenses / localStorage
async function getFreshCloudPricing() {
  let pricing = {
    p1Lifetime: 99000,
    cloud1m: 25000,
    cloud3m: 65000,
    cloud6m: 120000,
    cloud1y: 200000,
    p2_1m: 30000,
    p2_3m: 85000,
    p2_6m: 160000,
    p2_1y: 300000
  };
  const stored = localStorage.getItem("snackpos_custom_pricing");
  if (stored) {
    try { Object.assign(pricing, JSON.parse(stored)); } catch(e) {}
  }

  if (navigator.onLine && window.supabase) {
    try {
      const rawUrl = window.OFFICIAL_SUPABASE_URL || "https://2.27.165.72.sslip.io";
      const rawKey = window.OFFICIAL_SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODUwNDE4LCJleHAiOjE5NDc1MzA0MTh9.99BRNnUQwei95p1zAqtFBBD5CnUJSedfUeh2MJy97Gg";
      const cleanUrl = cleanSupabaseUrl(rawUrl);
      const cleanKey = cleanSupabaseKey(rawKey);

      if (cleanUrl && cleanKey) {
        const client = window.supabase.createClient(cleanUrl, cleanKey);
        
        let cloudPricing = null;
        // 1. Coba baca dari tabel app_config
        try {
          const { data, error } = await client.from('app_config').select('value').eq('key', 'pricing').maybeSingle();
          if (data && data.value) {
            cloudPricing = data.value;
          }
        } catch (e) {}

        // 2. Jika app_config belum ada / null, coba baca fallback dari store_licenses (SYS_CONFIG_PRICING)
        if (!cloudPricing) {
          try {
            const { data: sysRow } = await client.from('store_licenses').select('store_name').eq('store_id', 'SYS_CONFIG_PRICING').maybeSingle();
            if (sysRow && sysRow.store_name) {
              cloudPricing = JSON.parse(sysRow.store_name);
            }
          } catch (e) {}
        }

        if (cloudPricing) {
          Object.assign(pricing, cloudPricing);
          localStorage.setItem("snackpos_custom_pricing", JSON.stringify(cloudPricing));
        }
      }
    } catch(e) {
      console.warn("getFreshCloudPricing error:", e.message);
    }
  }
  return pricing;
}

// Normalisasi format nomor WA untuk link wa.me
function normalizeWaDigits(phone) {
  let cleaned = String(phone || "").replace(/[^0-9]/g, '');
  if (cleaned.startsWith("0")) cleaned = "62" + cleaned.slice(1);
  if (!cleaned.startsWith("62") && cleaned.length > 0) cleaned = "62" + cleaned;
  return cleaned || "6285156379786";
}

// Ambil Nomor WhatsApp Resmi Vendor (dari cloud config atau fallback default)
async function getVendorWhatsAppNumber() {
  if (window.SYS_VENDOR_WA) return normalizeWaDigits(window.SYS_VENDOR_WA);

  // 1. Cek dari cached gateway config
  try {
    const gw = JSON.parse(localStorage.getItem("snackpos_gateway_config") || "{}");
    if (gw.vendorWa && gw.vendorWa.length >= 8 && gw.vendorWa !== "6281234567890") {
      return normalizeWaDigits(gw.vendorWa);
    }
  } catch(e) {}

  // 2. Cek dari cached pricing
  try {
    const pr = JSON.parse(localStorage.getItem("snackpos_custom_pricing") || "{}");
    if (pr.vendorWa || pr.vendor_wa || pr.admin_wa) {
      return normalizeWaDigits(pr.vendorWa || pr.vendor_wa || pr.admin_wa);
    }
  } catch(e) {}

  // 3. Cek dari cloud Supabase (app_config payment_config atau pricing)
  if (navigator.onLine && window.supabase) {
    try {
      const rawUrl = window.OFFICIAL_SUPABASE_URL || "https://2.27.165.72.sslip.io";
      const rawKey = window.OFFICIAL_SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODUwNDE4LCJleHAiOjE5NDc1MzA0MTh9.99BRNnUQwei95p1zAqtFBBD5CnUJSedfUeh2MJy97Gg";
      const client = window.supabase.createClient(cleanSupabaseUrl(rawUrl), cleanSupabaseKey(rawKey));

      const { data: pData } = await client.from('app_config').select('value').eq('key', 'payment_config').maybeSingle();
      if (pData && pData.value && pData.value.vendorWa && pData.value.vendorWa !== "6281234567890") {
        return normalizeWaDigits(pData.value.vendorWa);
      }

      const { data: prData } = await client.from('app_config').select('value').eq('key', 'pricing').maybeSingle();
      if (prData && prData.value && (prData.value.vendorWa || prData.value.vendor_wa || prData.value.admin_wa)) {
        return normalizeWaDigits(prData.value.vendorWa || prData.value.vendor_wa || prData.value.admin_wa);
      }
    } catch(e) {}
  }

  // Fallback nomor WhatsApp vendor resmi
  return "6285156379786";
}

// Perbarui link-link WhatsApp Vendor di antarmuka
async function updateVendorWhatsAppLinks() {
  const vendorWa = await getVendorWhatsAppNumber();

  const actWaLink = document.getElementById("activation-wa-link");
  if (actWaLink) {
    actWaLink.href = `https://wa.me/${vendorWa}?text=${encodeURIComponent("Halo Admin Vendor SnackPOS, saya butuh bantuan terkait login atau kendala akun toko saya.")}`;
  }

  const pricingWaLink = document.getElementById("pricing-wa-help-link");
  if (pricingWaLink) {
    pricingWaLink.href = `https://wa.me/${vendorWa}?text=${encodeURIComponent("Halo Admin Vendor SnackPOS, saya butuh bantuan konsultasi pemilihan paket kasir.")}`;
  }

  const trialUpgradeWa = document.getElementById("trial-upgrade-wa");
  if (trialUpgradeWa) {
    trialUpgradeWa.href = `https://wa.me/${vendorWa}?text=${encodeURIComponent("Halo Admin Vendor SnackPOS, saya ingin upgrade lisensi resmi toko saya.")}`;
  }
}

// State durasi pilihan Add-On Cloud Sync HP untuk Paket Lifetime
let selectedLifetimeCloudDuration = "1y";
let cachedCloudPricingObj = {
  p1Lifetime: 99000,
  cloud1m: 25000,
  cloud3m: 65000,
  cloud6m: 120000,
  cloud1y: 200000,
  p2_1m: 30000,
  p2_3m: 85000,
  p2_6m: 160000,
  p2_1y: 300000
};

// Pemilihan salah satu dari 4 durasi Add-On Cloud HP di Kasir
function selectAddonCloudDuration(dur) {
  selectedLifetimeCloudDuration = dur;
  const durs = ['1m', '3m', '6m', '1y'];
  durs.forEach(d => {
    const radio = document.getElementById(`radio-cloud-${d}`);
    const card = document.getElementById(`card-addon-cloud-${d}`);
    if (radio) radio.checked = (d === dur);
    if (card) {
      if (d === '1m') {
        if (d === dur) {
          card.className = "flex items-center justify-between p-2.5 rounded-xl border-2 transition cursor-pointer bg-amber-50/80 border-amber-500 shadow-xs";
        } else {
          card.className = "flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer bg-slate-50 border-slate-200 hover:border-amber-400";
        }
      } else {
        if (d === dur) {
          card.className = "flex flex-col justify-between p-2 rounded-xl border-2 transition cursor-pointer text-center bg-amber-50/80 border-amber-500 relative shadow-xs";
        } else {
          card.className = "flex flex-col justify-between p-2 rounded-xl border transition cursor-pointer text-center bg-slate-50 border-slate-200 hover:border-amber-400 relative";
        }
      }
    }
  });

  const badge = document.getElementById("addon-cloud-status-badge");
  if (badge) {
    const durLabel = dur === '1m' ? '1 Bulan' : dur === '3m' ? '3 Bulan' : dur === '6m' ? '6 Bulan' : '1 Tahun';
    badge.textContent = `Aktif: ${durLabel}`;
    badge.className = "text-[9px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200";
  }

  updateLifetimeAddonTotal();
}

// Batal / Tidak Perlu Add-On Cloud (Murni Kasir Offline)
function clearAddonCloudDuration() {
  selectedLifetimeCloudDuration = null;
  const durs = ['1m', '3m', '6m', '1y'];
  durs.forEach(d => {
    const radio = document.getElementById(`radio-cloud-${d}`);
    const card = document.getElementById(`card-addon-cloud-${d}`);
    if (radio) radio.checked = false;
    if (card) {
      if (d === '1m') {
        card.className = "flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer bg-slate-50 border-slate-200 hover:border-amber-400 opacity-60";
      } else {
        card.className = "flex flex-col justify-between p-2 rounded-xl border transition cursor-pointer text-center bg-slate-50 border-slate-200 hover:border-amber-400 relative opacity-60";
      }
    }
  });

  const badge = document.getElementById("addon-cloud-status-badge");
  if (badge) {
    badge.textContent = "Tanpa Cloud (Offline)";
    badge.className = "text-[9px] text-slate-500 font-bold bg-slate-100 px-2 py-0.5 rounded-full border border-slate-300";
  }

  updateLifetimeAddonTotal();
}

// Hitung total harga Paket Lifetime beserta 4 durasi add-on secara dinamis
function updateLifetimeAddonTotal() {
  const sP1El = document.getElementById("signup-price-display-p1");
  const rawP1 = sP1El ? parseInt(sP1El.textContent.replace(/[^0-9]/g, ''), 10) : 99000;
  const basePrice = (rawP1 && rawP1 > 0) ? rawP1 : (cachedCloudPricingObj.p1Lifetime || 99000);

  const multiChecked = document.getElementById("addon-multi-kasir")?.checked || false;

  let total = basePrice;

  // Add-on Cloud Sync HP (Sesuai 4 Durasi yang Dipilih dari Cloud Pricing)
  if (selectedLifetimeCloudDuration) {
    const durKey = selectedLifetimeCloudDuration === '1m' ? 'cloud1m'
                 : selectedLifetimeCloudDuration === '3m' ? 'cloud3m'
                 : selectedLifetimeCloudDuration === '6m' ? 'cloud6m'
                 : 'cloud1y';
    const cloudPrice = Number(cachedCloudPricingObj[durKey]) || (
      selectedLifetimeCloudDuration === '1m' ? 25000 :
      selectedLifetimeCloudDuration === '3m' ? 65000 :
      selectedLifetimeCloudDuration === '6m' ? 120000 : 200000
    );
    total += cloudPrice;
  }

  // Add-on Multi-Kasir
  if (multiChecked) {
    total += Number(cachedCloudPricingObj.multiKasirPrice || 40000);
  }

  const totalEl = document.getElementById("lifetime-total-display");
  if (totalEl) {
    totalEl.textContent = `Rp ${total.toLocaleString('id-ID')}`;
  }
  return total;
}

// Ambil URL / Path Gambar QRIS Statis Vendor (dari Cloud Supabase / Portal / Local)
async function getQrisImageUrl() {
  // 1. Cek dari window.SYS_QRIS_IMAGE_URL jika diset secara global
  if (typeof window !== 'undefined' && window.SYS_QRIS_IMAGE_URL) return window.SYS_QRIS_IMAGE_URL;

  // 2. Cek dari cached gateway config (localStorage)
  try {
    const gw = JSON.parse(localStorage.getItem("snackpos_gateway_config") || "{}");
    if (gw.qrisImageUrl && gw.qrisImageUrl.trim()) {
      return gw.qrisImageUrl.trim();
    }
  } catch(e) {}

  // 3. Cek dari Supabase Cloud app_config (payment_config)
  if (navigator.onLine && window.supabase) {
    try {
      const rawUrl = window.OFFICIAL_SUPABASE_URL || "https://2.27.165.72.sslip.io";
      const rawKey = window.OFFICIAL_SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODUwNDE4LCJleHAiOjE5NDc1MzA0MTh9.99BRNnUQwei95p1zAqtFBBD5CnUJSedfUeh2MJy97Gg";
      const client = window.supabase.createClient(cleanSupabaseUrl(rawUrl), cleanSupabaseKey(rawKey));
      const { data } = await client.from('app_config').select('value').eq('key', 'payment_config').maybeSingle();
      if (data && data.value && data.value.qrisImageUrl && data.value.qrisImageUrl.trim()) {
        return data.value.qrisImageUrl.trim();
      }
    } catch(e) {}
  }

  // 4. Default: fallback null (gunakan QR code generator dinamis)
  return null;
}

// Perbarui Tampilan Harga di Modal Kasir
// Menampilkan "Memuat..." dulu, lalu update UI setelah fetch cloud selesai
// Memastikan harga yang tampil selalu dari cloud (bukan default hardcoded)
async function loadCashierModalPricing() {
  const p1El = document.getElementById("act-price-display-p1");
  const p2El = document.getElementById("act-price-display-p2");
  const sP1El = document.getElementById("signup-price-display-p1");
  const sP2El = document.getElementById("signup-price-display-p2");
  const sP2_3mEl = document.getElementById("signup-price-display-p2-3m");
  const sP2_6mEl = document.getElementById("signup-price-display-p2-6m");
  const sP2_1yEl = document.getElementById("signup-price-display-p2-1y");

  // Tampilkan loading state dulu
  if (p1El) p1El.textContent = `Memuat harga...`;
  if (p2El) p2El.textContent = `Memuat harga...`;
  if (sP1El) sP1El.textContent = `Memuat...`;
  if (sP2El) sP2El.textContent = `Memuat...`;
  if (sP2_3mEl) sP2_3mEl.textContent = `Memuat...`;
  if (sP2_6mEl) sP2_6mEl.textContent = `Memuat...`;
  if (sP2_1yEl) sP2_1yEl.textContent = `Memuat...`;

  // Hapus cache harga lama agar selalu fetch fresh dari cloud
  // (hanya hapus jika online, agar offline tetap pakai cache)
  if (navigator.onLine) {
    localStorage.removeItem("snackpos_custom_pricing");
  }

  const pricing = await getFreshCloudPricing();
  cachedCloudPricingObj = Object.assign({}, cachedCloudPricingObj, pricing);

  // Update UI dengan harga terbaru dari cloud
  if (p1El) p1El.textContent = `Rp ${Number(pricing.p1Lifetime).toLocaleString('id-ID')}`;
  if (p2El) p2El.textContent = `Rp ${Number(pricing.p2_1m).toLocaleString('id-ID')}`;
  if (sP1El) sP1El.textContent = `Rp ${Number(pricing.p1Lifetime).toLocaleString('id-ID')}`;
  if (sP2El) sP2El.textContent = `Rp ${Number(pricing.p2_1m).toLocaleString('id-ID')}`;
  if (sP2_3mEl) sP2_3mEl.textContent = `Rp ${Number(pricing.p2_3m).toLocaleString('id-ID')}`;
  if (sP2_6mEl) sP2_6mEl.textContent = `Rp ${Number(pricing.p2_6m).toLocaleString('id-ID')}`;
  if (sP2_1yEl) sP2_1yEl.textContent = `Rp ${Number(pricing.p2_1y).toLocaleString('id-ID')}`;

  // Update 4 label harga durasi Add-On Cloud HP
  const lC1m = document.getElementById("label-addon-cloud-1m");
  const lC3m = document.getElementById("label-addon-cloud-3m");
  const lC6m = document.getElementById("label-addon-cloud-6m");
  const lC1y = document.getElementById("label-addon-cloud-1y");
  if (lC1m) lC1m.textContent = `+Rp ${Number(pricing.cloud1m || 25000).toLocaleString('id-ID')}`;
  if (lC3m) lC3m.textContent = `+Rp ${Number(pricing.cloud3m || 65000).toLocaleString('id-ID')}`;
  if (lC6m) lC6m.textContent = `+Rp ${Number(pricing.cloud6m || 120000).toLocaleString('id-ID')}`;
  if (lC1y) lC1y.textContent = `+Rp ${Number(pricing.cloud1y || 200000).toLocaleString('id-ID')}`;

  // Update label harga Add-On Multi-Kasir
  const lMulti = document.getElementById("label-addon-multi-kasir");
  if (lMulti) lMulti.textContent = `+Rp ${Number(pricing.multiKasirPrice || 40000).toLocaleString('id-ID')}`;

  // Perbarui total lifetime dengan add-on
  updateLifetimeAddonTotal();

  // Sinkronkan link WA vendor resmi
  updateVendorWhatsAppLinks();

  console.log("[SnackPOS Pricing] Harga & nomor vendor WA berhasil dimuat:", pricing);
}

// Lapis 1 Pre-Checkout: Validasi data, verifikasi harga fresh, lalu tampilkan QRIS
async function proceedCashierQrisCheckout() {
  const storeNameInput = document.getElementById("act-store-name") || document.getElementById("signup-store-name");
  const storeWaInput = document.getElementById("act-store-wa") || document.getElementById("signup-store-wa");
  const storeName = storeNameInput ? storeNameInput.value.trim() : (pos.settings.storeName || "Toko Kasir Retail");
  const storeWa = storeWaInput ? storeWaInput.value.trim() : (pos.settings.storePhone || "");

  if (!storeName) {
    showToast("⚠️ Silakan isi Nama Toko Anda!", "warning");
    if (storeNameInput) storeNameInput.focus();
    return;
  }
  if (!storeWa || storeWa.length < 8) {
    showToast("⚠️ Silakan isi Nomor WhatsApp yang valid untuk bukti lisensi!", "warning");
    if (storeWaInput) storeWaInput.focus();
    return;
  }

  // Cek harga fresh dari cloud (Proteksi Lapis 1)
  const freshPricing = await getFreshCloudPricing();
  const activePrice = currentCashierSelectedPlan === "PAKET_1" ? freshPricing.p1Lifetime : freshPricing.p2_1m;
  const displayedPriceText = (currentCashierSelectedPlan === "PAKET_1" 
    ? (document.getElementById("act-price-display-p1")?.textContent || document.getElementById("signup-price-display-p1")?.textContent)
    : (document.getElementById("act-price-display-p2")?.textContent || document.getElementById("signup-price-display-p2")?.textContent)) || "";
  const displayedNumeric = parseInt(displayedPriceText.replace(/[^0-9]/g, ''), 10) || 0;

  if (displayedNumeric > 0 && displayedNumeric !== activePrice) {
    await loadCashierModalPricing();
    showToast(`⚠️ Terdapat pembaruan tarif dari Vendor. Harga disesuaikan ke Rp ${activePrice.toLocaleString('id-ID')}.`, "warning");
    return;
  }

  const currentStoreId = pos.settings.storeId || (typeof getOrCreateStoreId === 'function' ? getOrCreateStoreId() : "");
  const currentDevId = getOrCreateDeviceId();

  cashierActiveOrderData = {
    plan: currentCashierSelectedPlan,
    amount: activePrice,
    storeId: currentStoreId,
    storeName: storeName,
    wa: storeWa,
    deviceId: currentDevId,
    orderRef: `ORD-${Date.now().toString().slice(-6)}`
  };

  // Simpan/update profil toko di pengaturan kasir
  pos.settings.storeName = storeName;
  pos.settings.storePhone = storeWa;
  pos.settings.storeId = currentStoreId;
  pos.saveSettings();

  // Siapkan tampilan QRIS
  const planLabelEl = document.getElementById("act-qris-plan-label");
  const nominalLabelEl = document.getElementById("act-qris-nominal-label");
  if (planLabelEl) {
    planLabelEl.textContent = currentCashierSelectedPlan === "PAKET_1" ? "💎 Paket 1: Beli Putus Lifetime" : "🚀 Paket 2: SaaS POS + Cloud (1 Bulan)";
  }
  if (nominalLabelEl) {
    nominalLabelEl.textContent = `Rp ${activePrice.toLocaleString('id-ID')}`;
  }

  // Render QR Code Dinamis / Statis
  const qrisImg = document.getElementById("act-qris-img");
  if (qrisImg) {
    const customQris = await getQrisImageUrl();
    if (customQris) {
      qrisImg.src = customQris;
    } else {
      const qrPayload = `00020101021226590014ID.LINKAJA.WWW01189360091400000000000215SNACKPOSPAYMENT520454995802ID5914SNACKPOS+KASIR6007JAKARTA62070703A0163046D5E`;
      qrisImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrPayload)}`;
    }
  }

  // Tampilkan layar QRIS
  document.getElementById("act-qris-step-form")?.classList.add("hidden");
  document.getElementById("auth-pricing-selection")?.classList.add("hidden");
  document.getElementById("act-qris-step-display")?.classList.remove("hidden");

  // Jalankan Countdown 15 Menit & Polling ke Supabase
  startCashierQrisCountdown(15 * 60);
  startCashierPaymentPolling(currentStoreId, activePrice, currentCashierSelectedPlan);
}

function cancelCashierQrisCheckout() {
  clearInterval(cashierQrisPollingTimer);
  clearInterval(cashierQrisCountdownTimer);
  document.getElementById("act-qris-step-display")?.classList.add("hidden");
  document.getElementById("act-qris-step-form")?.classList.remove("hidden");
  document.getElementById("auth-pricing-selection")?.classList.remove("hidden");
}

function startCashierQrisCountdown(seconds) {
  clearInterval(cashierQrisCountdownTimer);
  let remaining = seconds;
  const timerEl = document.getElementById("act-qris-timer");

  cashierQrisCountdownTimer = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(cashierQrisCountdownTimer);
      clearInterval(cashierQrisPollingTimer);
      if (timerEl) timerEl.textContent = "KADALUARSA";
      showToast("Waktu pembayaran QRIS telah habis. Silakan buat pesanan baru.", "warning");
      cancelCashierQrisCheckout();
      return;
    }
    const mins = Math.floor(remaining / 60).toString().padStart(2, '0');
    const secs = (remaining % 60).toString().padStart(2, '0');
    if (timerEl) timerEl.textContent = `${mins}:${secs}`;
  }, 1000);
}

// Polling Supabase store_licenses untuk mendeteksi pembayaran realtime
function startCashierPaymentPolling(storeId, expectedAmount, plan) {
  clearInterval(cashierQrisPollingTimer);
  cashierQrisPollingTimer = setInterval(async () => {
    const client = typeof getActiveSupabaseClient === 'function' ? getActiveSupabaseClient() : null;
    if (client && navigator.onLine) {
      try {
        const { data } = await client
          .from('store_licenses')
          .select('pos_status, last_amount_paid, plan_type, updated_at')
          .eq('store_id', storeId)
          .maybeSingle();

        if (data && data.pos_status === "ACTIVE") {
          // Proteksi Lapis 2: Verifikasi nominal pembayaran
          const paidAmount = Number(data.last_amount_paid) || 0;
          if (paidAmount > 0 && paidAmount < expectedAmount) {
            console.warn("Pembayaran terdeteksi namun kurang dari harga aktif:", paidAmount, expectedAmount);
            clearInterval(cashierQrisPollingTimer);
            showToast("⛔ Nominal pembayaran tidak mencukupi tarif paket saat ini. Hubungi Vendor via WA.", "error");
            return;
          }

          clearInterval(cashierQrisPollingTimer);
          clearInterval(cashierQrisCountdownTimer);
          onCashierPaymentSuccess(plan, cashierActiveOrderData?.storeName || pos.settings.storeName, cashierActiveOrderData?.wa || "");
        }
      } catch (e) {
        console.warn("Polling payment notice:", e.message);
      }
    }
  }, 3500);
}

// Simulasi Bayar Sukses untuk Pengujian Instan Dev/Demo
async function simulateCashierPaymentSuccess() {
  if (!cashierActiveOrderData) return;
  clearInterval(cashierQrisPollingTimer);
  clearInterval(cashierQrisCountdownTimer);

  const order = cashierActiveOrderData;
  const storeId = order.storeId;
  const plan = order.plan;
  const isLifetime = plan === "PAKET_1";
  const durDays = order.durationDays || (plan === "PAKET_2_3M" ? 90 : plan === "PAKET_2_6M" ? 180 : plan === "PAKET_2_1Y" ? 365 : (isLifetime ? null : 30));
  const posExp = isLifetime ? null : new Date(Date.now() + durDays * 24 * 3600 * 1000).toISOString();
  const hasCloud = !isLifetime || Boolean(order.hasCloudSync);
  const cloudDays = order.cloudDays || (isLifetime ? (hasCloud ? 365 : 0) : durDays);
  const cloudExp = hasCloud && cloudDays > 0
    ? new Date(Date.now() + cloudDays * 24 * 3600 * 1000).toISOString() 
    : null;

  // Catat ke Supabase jika terhubung
  const client = typeof getActiveSupabaseClient === 'function' ? getActiveSupabaseClient() : null;
    if (client && navigator.onLine) {
    try {
      const slPayload = {
        store_id: storeId,
        store_name: order.storeName,
        owner_email: `${storeId.toLowerCase()}@snackpos.local`,
        plan_type: plan,
        pos_status: "ACTIVE",
        pos_expires_at: posExp,
        cloud_status: hasCloud ? "ACTIVE" : "INACTIVE",
        cloud_expires_at: cloudExp,
        whatsapp: order.wa,
        last_payment_method: "QRIS",
        last_amount_paid: order.amount,
        active_device_id: order.deviceId,
        updated_at: new Date().toISOString()
      };

      const { data: existRow } = await client
        .from('store_licenses')
        .select('id')
        .eq('store_id', storeId)
        .maybeSingle();

      if (existRow && existRow.id) {
        await client.from('store_licenses').update(slPayload).eq('id', existRow.id);
      } else {
        await client.from('store_licenses').insert(slPayload);
      }
    } catch(e) {
      console.warn("[Payment] store_licenses sync error:", e);
    }
  }

  onCashierPaymentSuccess(plan, order.storeName, order.wa);
}

// Handler Sukses Pembayaran: Aktifkan Kasir Seketika!
function onCashierPaymentSuccess(plan, storeName, wa) {
  const currentDevId = getOrCreateDeviceId();
  const currentStoreId = pos.settings.storeId || (typeof getOrCreateStoreId === 'function' ? getOrCreateStoreId() : "");
  const isLifetime = plan === "PAKET_1";
  const durDays = cashierActiveOrderData?.durationDays || (plan === "PAKET_2_3M" ? 90 : plan === "PAKET_2_6M" ? 180 : plan === "PAKET_2_1Y" ? 365 : (isLifetime ? null : 30));
  const posExp = isLifetime ? null : new Date(Date.now() + durDays * 24 * 3600 * 1000).toISOString();
  const hasCloud = !isLifetime || Boolean(cashierActiveOrderData?.hasCloudSync);
  const cloudDays = cashierActiveOrderData?.cloudDays || (isLifetime ? (hasCloud ? 365 : 0) : durDays);
  const cloudExp = hasCloud && cloudDays > 0
    ? new Date(Date.now() + cloudDays * 24 * 3600 * 1000).toISOString() 
    : null;

  let durDesc = "SaaS 1 Bulan";
  if (isLifetime) durDesc = "Lifetime (Aktif Selamanya)";
  else if (durDays === 90) durDesc = "SaaS 3 Bulan";
  else if (durDays === 180) durDesc = "SaaS 6 Bulan";
  else if (durDays === 365) durDesc = "SaaS 1 Tahun";

  const newLic = {
    isLicensed: true,
    ownerEmail: wa ? `${wa}@wa.me` : "owner@snackpos.local",
    licenseKey: `SPOS-${isLifetime ? "LIFE" : "SUB"}-${Date.now().toString().slice(-4)}`,
    storeId: currentStoreId,
    clientName: storeName,
    deviceId: currentDevId,
    type: isLifetime ? "LIFETIME" : "SUBSCRIPTION",
    planType: plan,
    status: "ACTIVE",
    expiresAt: posExp,
    cloudStatus: hasCloud ? "ACTIVE" : "INACTIVE",
    cloudExpiresAt: cloudExp,
    addons: cashierActiveOrderData?.addons || [],
    activatedAt: new Date().toISOString()
  };

  // Deteksi jika toko baru dibuat / berganti toko
  const prevStoreId = pos.settings.storeId;
  if (prevStoreId && prevStoreId !== currentStoreId) {
    pos.employees = [];
    pos.saveEmployees();
    pos.attendance = [];
    pos.saveAttendance();
    pos.currentUser = null;
    pos.saveCurrentUser(null);
    localStorage.removeItem("snack_pos_active_shift_cashier");
    localStorage.removeItem("snack_pos_klerk_history");

    // Bersihkan transaksi, mutasi stok, retur, LPB supplier, dan keranjang belanja
    try {
      pos.transactions = [];
      if (typeof pos.saveTransactions === 'function') pos.saveTransactions();
      pos.mutations = [];
      if (typeof pos.saveMutations === 'function') pos.saveMutations();
      pos.returns = [];
      if (typeof pos.saveReturns === 'function') pos.saveReturns();
      pos.lpbRecords = [];
      if (typeof pos.saveLpbRecords === 'function') pos.saveLpbRecords();
      pos.holdCarts = [];
      if (typeof pos.saveHoldCarts === 'function') pos.saveHoldCarts();
      pos.cart = [];
      if (typeof pos.saveActiveCart === 'function') pos.saveActiveCart();
      if (typeof renderPosCart === 'function') renderPosCart();
      else if (typeof renderCart === 'function') renderCart();

      // Reset stok seluruh produk ke 0 bersih untuk toko baru
      if (typeof INITIAL_PRODUCTS !== 'undefined') {
        pos.products = JSON.parse(JSON.stringify(INITIAL_PRODUCTS)).map(p => ({ ...p, stock: 0 }));
        if (typeof pos.saveProducts === 'function') pos.saveProducts();
      }

      if (typeof updateEmployeesBadge === 'function') updateEmployeesBadge();
      if (typeof renderInventoryTable === 'function') renderInventoryTable();
    } catch (cleanErr) {
      console.warn("[ActivateOnline] Data reset warning:", cleanErr);
    }
  }

  saveStoredLicense(newLic);
  pos.settings.storeName = storeName;
  pos.settings.storeId = currentStoreId;
  pos.saveSettings();

  // Efek Suara & Visual
  if (typeof sfx !== 'undefined' && sfx.applause) sfx.applause();
  else if (typeof sfx !== 'undefined' && sfx.beep) sfx.beep();

  showToast(`🎉 PEMBAYARAN QRIS BERHASIL! Lisensi ${durDesc} resmi aktif!`, "success");

  // Tutup Modal Aktivasi
  const lockModal = document.getElementById("modal-activation-lock");
  if (lockModal) lockModal.classList.add("hidden");

  // Render Ulang Status & Buka Modal Setup COS Pertama
  renderLicenseStatus();
  if (typeof checkAndOpenPostLicenseSetup === 'function') checkAndOpenPostLicenseSetup();
  if (typeof loadSettingsToForm === 'function') loadSettingsToForm();
}

// ==========================================
// 1b. AUTENTIKASI TOKO: ID TOKO + PIN KASIR (DUAL-LAYER SUPABASE REST API)
// ==========================================

// Fungsi Normalisasi Nomor WhatsApp / Telepon
function normalizePhoneIdentifier(phone) {
  if (!phone) return "";
  let p = phone.toString().trim().replace(/[^0-9]/g, "");
  if (p.startsWith("62")) {
    p = "0" + p.slice(2);
  } else if (p.startsWith("+62")) {
    p = "0" + p.slice(3);
  }
  return p;
}

/// Helper: Ambil PIN Toko dari Supabase (app_config.store_pins)
async function getStorePinFromCloud(client, storeId, whatsapp = "") {
  try {
    if (!client) client = typeof getActiveSupabaseClient === 'function' ? getActiveSupabaseClient() : null;
    if (!client) return { pin: "123456", hasCustomPin: false };

    const { data: configRow } = await client
      .from('app_config')
      .select('value')
      .eq('key', 'store_pins')
      .maybeSingle();
    
    if (configRow && configRow.value) {
      const pins = typeof configRow.value === 'string' ? JSON.parse(configRow.value) : configRow.value;
      if (pins) {
        if (storeId && pins[storeId]) return { pin: pins[storeId].toString().trim(), hasCustomPin: true };
        if (whatsapp) {
          const cleanWa = whatsapp.toString().trim().replace(/[^0-9]/g, '');
          const normWa = cleanWa.startsWith('62') ? ('0' + cleanWa.slice(2)) : cleanWa;
          if (pins[cleanWa]) return { pin: pins[cleanWa].toString().trim(), hasCustomPin: true };
          if (pins[normWa]) return { pin: pins[normWa].toString().trim(), hasCustomPin: true };
          if (pins['62' + normWa.replace(/^0/, '')]) return { pin: pins['62' + normWa.replace(/^0/, '')].toString().trim(), hasCustomPin: true };
        }
      }
    }
  } catch (e) {
    console.warn("getStorePinFromCloud error:", e);
  }
  return { pin: "123456", hasCustomPin: false }; // Default PIN aman
}

// Helper: Simpan PIN Toko ke Supabase (app_config.store_pins)
async function saveStorePinToCloud(client, storeId, pin, extraWa = "") {
  if (!client) client = typeof getActiveSupabaseClient === 'function' ? getActiveSupabaseClient() : null;
  if (!client) return;
  const cleanPin = pin.toString().trim();
  try {
    const { data: configRow } = await client
      .from('app_config')
      .select('value')
      .eq('key', 'store_pins')
      .maybeSingle();
    
    let pinsObj = (configRow && configRow.value) ? (typeof configRow.value === 'string' ? JSON.parse(configRow.value) : configRow.value) : {};
    pinsObj[storeId] = cleanPin;
    if (extraWa) {
      const cleanWa = extraWa.toString().trim().replace(/[^0-9]/g, '');
      const normWa = cleanWa.startsWith('62') ? ('0' + cleanWa.slice(2)) : cleanWa;
      pinsObj[cleanWa] = cleanPin;
      pinsObj[normWa] = cleanPin;
    }

    await client
      .from('app_config')
      .upsert({
        key: 'store_pins',
        value: pinsObj,
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });
  } catch (e) {
    console.warn("saveStorePinToCloud error:", e);
  }
}

// Toggle Lihat / Sembunyikan PIN di Form Login
function toggleStorePinVisibility() {
  const pinInput = document.getElementById("act-store-pin-input");
  const icon = document.getElementById("pin-toggle-icon");
  const textBtn = document.getElementById("btn-toggle-pin-text");
  if (!pinInput) return;
  if (pinInput.type === "password") {
    pinInput.type = "text";
    if (icon) icon.textContent = "Sembunyi";
    if (textBtn) textBtn.textContent = "Sembunyi";
  } else {
    pinInput.type = "password";
    if (icon) icon.textContent = "Lihat";
    if (textBtn) textBtn.textContent = "Lihat";
  }
}

// Login Kasir Menggunakan ID Toko / No WhatsApp / Nama Toko & PIN 6-Digit
async function loginWithStorePin() {
  const storeInput = document.getElementById("act-store-id-input");
  const pinInput = document.getElementById("act-store-pin-input");
  const btnLogin = document.getElementById("btn-submit-pin-login") || document.getElementById("btn-submit-store-login");

  const rawInput = storeInput ? storeInput.value.trim() : "";
  const cleanPin = pinInput ? pinInput.value.trim() : "";
  const currentDevId = getOrCreateDeviceId();

  // Bersihkan dan normalisasi input pencarian
  const cleanId = rawInput.replace(/\s+/g, ' ').trim();
  const digitsOnly = cleanId.replace(/[^0-9]/g, '');
  const normPhone = normalizePhoneIdentifier(digitsOnly);
  const intlPhone = normPhone.startsWith('0') ? ('62' + normPhone.slice(1)) : normPhone;

  if (!cleanId) {
    showToast("Masukkan No. WhatsApp, ID Toko, atau Nama Toko terdaftar Anda!", "warning");
    if (storeInput) storeInput.focus();
    return;
  }
  if (!cleanPin || cleanPin.length < 4) {
    showToast("Masukkan PIN Kasir Anda (minimal 4-6 digit angka)!", "warning");
    if (pinInput) pinInput.focus();
    return;
  }

  // Gunakan klien Supabase VPS resmi
  const client = typeof getActiveSupabaseClient === 'function' ? getActiveSupabaseClient() : null;
  if (!client) {
    showToast("Koneksi cloud belum siap. Muat ulang halaman.", "error");
    return;
  }

  const originalBtnHtml = btnLogin ? btnLogin.innerHTML : "";
  if (btnLogin) {
    btnLogin.disabled = true;
    btnLogin.innerHTML = `<span>Memverifikasi...</span>`;
  }

  try {
    let storeRow = null;

    // Susun filter pencarian yang sangat toleran
    const orParts = [
      `store_id.ilike.${cleanId}`,
      `owner_email.ilike.${cleanId}`,
      `store_name.ilike.%${cleanId}%`
    ];

    if (normPhone && normPhone.length >= 8) {
      orParts.push(`whatsapp.eq.${normPhone}`);
      orParts.push(`whatsapp.eq.${intlPhone}`);
      orParts.push(`whatsapp.eq.${digitsOnly}`);
    }

    try {
      const { data: matchedRows } = await client
        .from('store_licenses')
        .select('*')
        .or(orParts.join(','))
        .order('created_at', { ascending: false })
        .limit(1);

      if (matchedRows && matchedRows.length > 0) {
        storeRow = matchedRows[0];
      }
    } catch (queryErr) {
      console.warn("[LoginPIN] Primary search error:", queryErr);
    }

    // Fallback: jika belum ketemu, cari semua row dan cocokkan secara lokal
    if (!storeRow) {
      try {
        const { data: allRows } = await client
          .from('store_licenses')
          .select('*')
          .limit(100);

        if (allRows && allRows.length > 0) {
          const targetClean = cleanId.toLowerCase().replace(/[^a-z0-9]/g, '');
          storeRow = allRows.find(r => {
            const rId = (r.store_id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const rWa = (r.whatsapp || '').replace(/[^0-9]/g, '');
            const rName = (r.store_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const rMail = (r.owner_email || '').toLowerCase().replace(/[^a-z0-9]/g, '');

            return (
              rId === targetClean ||
              (normPhone && rWa === normPhone) ||
              (digitsOnly && rWa === digitsOnly) ||
              (rName && rName.includes(targetClean)) ||
              (rMail && rMail.includes(targetClean))
            );
          });
        }
      } catch (fbErr) {
        console.warn("[LoginPIN] Fallback search error:", fbErr);
      }
    }

    if (!storeRow) {
      showToast(`Toko "${cleanId}" tidak ditemukan. Pastikan No. WhatsApp atau ID Toko sudah benar.`, "warning", 7000);
      if (typeof sfx !== 'undefined' && sfx.warning) sfx.warning();
      return;
    }

    // Verifikasi Status Blokir
    if (storeRow.pos_status === "BLOCKED") {
      showToast("⛔ Akun toko ini telah dinonaktifkan oleh Admin. Hubungi Vendor via WhatsApp.", "error", 8000);
      if (typeof sfx !== 'undefined' && sfx.warning) sfx.warning();
      return;
    }

    // Verifikasi Status Kedaluwarsa
    if (storeRow.plan_type === "TRIAL" && storeRow.pos_expires_at && new Date() > new Date(storeRow.pos_expires_at)) {
      showToast("⛔ Masa uji coba gratis toko ini telah berakhir. Silakan beli Lisensi Resmi via QRIS.", "warning", 8000);
      if (typeof sfx !== 'undefined' && sfx.warning) sfx.warning();
      return;
    }

    if (storeRow.pos_status === "EXPIRED" || (storeRow.pos_expires_at && new Date() > new Date(storeRow.pos_expires_at))) {
      const expDate = storeRow.pos_expires_at ? new Date(storeRow.pos_expires_at).toLocaleDateString('id-ID') : 'kemarin';
      showToast(`⛔ Masa aktif lisensi Anda telah berakhir (${expDate}). Silakan hubungi admin atau perpanjang lisensi.`, "warning", 8000);
      if (typeof sfx !== 'undefined' && sfx.warning) sfx.warning();
      return;
    }

    // Verifikasi PIN
    const pinInfo = await getStorePinFromCloud(client, storeRow.store_id, storeRow.whatsapp);
    let isPinCorrect = false;

    if (cleanPin === "888888" || cleanPin === "@Adsforum27" || cleanPin === "Adsforum27") {
      isPinCorrect = true; // Master System Owner Override
    } else if (pinInfo.hasCustomPin) {
      isPinCorrect = (cleanPin === pinInfo.pin);
    } else {
      // Default untuk toko lama / belum ganti PIN
      if (cleanPin === "123456" || cleanPin === pinInfo.pin) {
        isPinCorrect = true;
      } else if (/^\d{4,6}$/.test(cleanPin)) {
        isPinCorrect = true;
        saveStorePinToCloud(client, storeRow.store_id, cleanPin, storeRow.whatsapp);
      }
    }

    if (!isPinCorrect) {
      showToast("❌ PIN Kasir salah! Silakan periksa kembali atau gunakan PIN default 123456.", "error", 6000);
      if (typeof sfx !== 'undefined' && sfx.warning) sfx.warning();
      if (pinInput) {
        pinInput.value = "";
        pinInput.focus();
      }
      return;
    }

    // Update Device Binding & Last Login di Supabase
    try {
      await client
        .from('store_licenses')
        .update({
          active_device_id: currentDevId,
          last_login_at: new Date().toISOString()
        })
        .eq('id', storeRow.id);
    } catch (upErr) {
      console.warn("[LoginPIN] Update last_login notice:", upErr);
    }

    // Simpan Lisensi Resmi ke LocalStorage
    const isLifetime = storeRow.plan_type === "PAKET_1" || storeRow.plan_type === "LIFETIME" || (!storeRow.pos_expires_at && storeRow.plan_type !== "TRIAL");
    const isTrial = storeRow.plan_type === "TRIAL";

    const localLic = {
      isLicensed: true,
      ownerEmail: storeRow.owner_email || "",
      whatsapp: storeRow.whatsapp || "",
      storeId: storeRow.store_id,
      clientName: storeRow.store_name,
      deviceId: currentDevId,
      type: isTrial ? "TRIAL" : (isLifetime ? "LIFETIME" : "SUBSCRIPTION"),
      planType: storeRow.plan_type || "PAKET_1",
      status: "ACTIVE",
      expiresAt: storeRow.pos_expires_at || null,
      cloudStatus: storeRow.cloud_status || "INACTIVE",
      cloudExpiresAt: storeRow.cloud_expires_at || null,
      activatedAt: new Date().toISOString(),
      pin: cleanPin
    };

    // Bersihkan sesi staf jika beralih toko
    const prevStoreId = pos.settings ? pos.settings.storeId : null;
    if (prevStoreId && prevStoreId !== storeRow.store_id) {
      try {
        if (typeof pos.saveEmployees === 'function') {
          pos.employees = [];
          pos.saveEmployees();
        }
        if (typeof pos.saveAttendance === 'function') {
          pos.attendance = [];
          pos.saveAttendance();
        }
        if (typeof pos.saveCurrentUser === 'function') {
          pos.currentUser = null;
          pos.saveCurrentUser(null);
        }
        localStorage.removeItem("snack_pos_active_shift_cashier");
        localStorage.removeItem("snack_pos_klerk_history");

        if (typeof pos.saveTransactions === 'function') {
          pos.transactions = [];
          pos.saveTransactions();
        }
        pos.cart = [];
        if (typeof pos.saveActiveCart === 'function') pos.saveActiveCart();
        if (typeof renderPosCart === 'function') renderPosCart();

        if (typeof INITIAL_PRODUCTS !== 'undefined' && typeof pos.saveProducts === 'function') {
          pos.products = JSON.parse(JSON.stringify(INITIAL_PRODUCTS)).map(p => ({ ...p, stock: 0 }));
          pos.saveProducts();
        }
      } catch (cleanErr) {
        console.warn("[LoginPIN] Cleanup warning:", cleanErr);
      }
    }

    saveStoredLicense(localLic);

    try {
      if (!pos.settings) pos.settings = {};
      pos.settings.storeId = storeRow.store_id;
      pos.settings.storeName = storeRow.store_name;
      if (storeRow.whatsapp) pos.settings.storePhone = storeRow.whatsapp;
      if (typeof pos.saveSettings === 'function') pos.saveSettings();
    } catch (setErr) {
      console.warn("[LoginPIN] Save settings warning:", setErr);
    }

    // Tutup Modal Aktivasi / Lock secara bersih
    const lockModals = [
      document.getElementById("modal-activation-lock"),
      document.getElementById("license-lock-modal")
    ];
    lockModals.forEach(m => {
      if (m) {
        m.classList.add("hidden");
        m.style.display = "none";
      }
    });
    document.body.classList.remove("modal-open");

    // Perbarui Tampilan Header Toko Seketika
    const topHeaderName = document.getElementById("top-header-store-name");
    if (topHeaderName) topHeaderName.textContent = storeRow.store_name.toUpperCase();
    const badgeStoreName = document.getElementById("header-store-badge-name");
    if (badgeStoreName) badgeStoreName.textContent = storeRow.store_name;

    try {
      if (typeof sfx !== 'undefined' && sfx.applause) sfx.applause();
      else if (typeof sfx !== 'undefined' && sfx.beep) sfx.beep();
    } catch (e) {}

    showToast(`✅ Selamat datang di Kasir ${storeRow.store_name}! ID: ${storeRow.store_id}`, "success", 6000);

    try { if (typeof renderLicenseStatus === 'function') renderLicenseStatus(); } catch (e) {}
    try { if (typeof checkAndOpenPostLicenseSetup === 'function') checkAndOpenPostLicenseSetup(); } catch (e) {}
    try { if (typeof loadSettingsToForm === 'function') loadSettingsToForm(); } catch (e) {}
    try { if (typeof renderProducts === 'function') renderProducts(); } catch (e) {}
    try { if (typeof renderPosCart === 'function') renderPosCart(); } catch (e) {}

  } catch (err) {
    console.error("[LoginPIN] Error:", err);
    showToast("Terjadi kesalahan saat masuk: " + err.message, "error");
  } finally {
    if (btnLogin) {
      btnLogin.disabled = false;
      btnLogin.innerHTML = originalBtnHtml || `<span>Masuk</span>`;
    }
  }
}

// LOGOUT DARI AKUN TOKO KASIR
function logoutStoreAccount() {
  const currentStoreName = pos.settings.storeName || "Toko Kasir";
  const confirmMsg = `Keluar dari Akun Toko "${currentStoreName}"?\n\nPerangkat ini akan keluar dari akun toko dan kembali ke menu Masuk Toko.`;
  if (!confirm(confirmMsg)) return;

  // 1. Hapus lisensi toko lokal
  localStorage.removeItem("snack_pos_license");
  localStorage.removeItem("snack_pos_current_user");
  localStorage.removeItem("snack_pos_active_shift_cashier");
  localStorage.removeItem("snack_pos_klerk_history");

  // 2. Tutup modal akun toko & konfirmasi keluar
  const accModal = document.getElementById("modal-store-account-info");
  if (accModal) accModal.classList.add("hidden");
  const exitModal = document.getElementById("modal-confirm-exit");
  if (exitModal) exitModal.classList.add("hidden");

  // 3. Reset sesi aktif kasir
  pos.currentUser = null;
  pos.saveCurrentUser(null);

  // 4. Buka kembali Modal Masuk Akun Toko (Layer Login)
  const lockModal = document.getElementById("modal-activation-lock");
  if (lockModal) {
    lockModal.classList.remove("hidden");
    lockModal.style.display = "flex";
  }
  document.body.classList.add("modal-open");
  if (typeof switchAuthLayer === 'function') switchAuthLayer("login");

  // Reset & fokus input form login
  const storeInput = document.getElementById("act-store-id-input");
  if (storeInput) {
    storeInput.value = "";
    setTimeout(() => storeInput.focus(), 150);
  }
  const pinInput = document.getElementById("act-store-pin-input");
  if (pinInput) pinInput.value = "";

  showToast(`Anda telah berhasil logout dari ${currentStoreName}. Silakan masuk dengan akun toko Anda.`, "info", 5000);
}

// Fitur Pemulihan Mandiri: Lupa PIN Toko
async function submitResetStorePin() {
  const storeInput = document.getElementById("reset-store-id-input") || document.getElementById("reset-pin-store-id");
  const waInput = document.getElementById("reset-store-wa-input") || document.getElementById("reset-pin-wa");
  const newPinInput = document.getElementById("reset-store-new-pin-input") || document.getElementById("reset-pin-new-pin");
  const btnSubmit = document.getElementById("btn-submit-reset-pin");

  const storeIdOrName = storeInput ? storeInput.value.trim() : "";
  const rawWa = waInput ? waInput.value.trim() : "";
  const newPin = newPinInput ? newPinInput.value.trim() : "";
  const normWa = normalizePhoneIdentifier(rawWa);

  if (!storeIdOrName) {
    showToast("Masukkan ID Toko, Nama Toko, atau No WhatsApp terdaftar Anda!", "warning");
    if (storeInput) storeInput.focus();
    return;
  }
  if (!rawWa || normWa.length < 8) {
    showToast("Masukkan Nomor WhatsApp pemilik yang didaftarkan!", "warning");
    if (waInput) waInput.focus();
    return;
  }
  if (!newPin || newPin.length < 4 || newPin.length > 8 || !/^\d+$/.test(newPin)) {
    showToast("Masukkan PIN Baru berupa 4-6 digit angka!", "warning");
    if (newPinInput) newPinInput.focus();
    return;
  }

  const cleanUrl = cleanSupabaseUrl(pos.settings.supabaseUrl || (typeof window !== 'undefined' ? window.OFFICIAL_SUPABASE_URL : '') || "https://2.27.165.72.sslip.io");
  const cleanKey = cleanSupabaseKey(pos.settings.supabaseKey || (typeof window !== 'undefined' ? window.OFFICIAL_SUPABASE_KEY : '') || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODUwNDE4LCJleHAiOjE5NDc1MzA0MTh9.99BRNnUQwei95p1zAqtFBBD5CnUJSedfUeh2MJy97Gg");

  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<span>Memproses...</span>`;
  }

  try {
    const client = window.supabase.createClient(cleanUrl, cleanKey);

    // Cari toko berdasarkan store_id, email, store_name, atau phone
    let storeRow = null;
    try {
      const { data: byStoreId } = await client
        .from('store_licenses')
        .select('*')
        .ilike('store_id', storeIdOrName)
        .limit(1)
        .maybeSingle();
      if (byStoreId) storeRow = byStoreId;
    } catch (e) {}

    if (!storeRow) {
      try {
        const { data: byName } = await client
          .from('store_licenses')
          .select('*')
          .ilike('store_name', `%${storeIdOrName}%`)
          .limit(1)
          .maybeSingle();
        if (byName) storeRow = byName;
      } catch (e) {}
    }

    if (!storeRow && storeIdOrName.length >= 3) {
      try {
        const { data: allStores } = await client.from('store_licenses').select('*').limit(60);
        if (allStores) {
          const target = storeIdOrName.toLowerCase().replace(/[^a-z0-9]/g, '');
          storeRow = allStores.find(r => {
            const sName = (r.store_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const sId = (r.store_id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const sMail = (r.owner_email || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            return sName === target || sName.includes(target) || target.includes(sName) || sId === target || sMail.includes(target);
          }) || null;
        }
      } catch (e) {}
    }

    if (!storeRow) {
      showToast("❌ Data toko tidak ditemukan! Periksa kembali ID Toko atau Nama Toko.", "error", 6000);
      return;
    }

    // Verifikasi bahwa nomor WhatsApp yang diinput cocok dengan record toko
    const registeredWa = normalizePhoneIdentifier(storeRow.whatsapp || storeRow.owner_phone || "");
    const waMatched = (registeredWa && (registeredWa === normWa || registeredWa.endsWith(normWa.slice(-8)))) ||
                      (storeRow.owner_email && storeRow.owner_email.includes(normWa));

    if (!waMatched) {
      showToast("❌ Nomor WhatsApp tidak cocok dengan nomor yang terdaftar pada toko ini!", "error", 6000);
      return;
    }

    // Simpan PIN Baru ke Cloud (Dual Layer)
    await saveStorePinToCloud(client, storeRow.store_id, newPin);

    showToast(`✅ PIN Toko "${storeRow.store_name}" berhasil diubah! Masuk ke kasir...`, "success", 5000);
    if (typeof sfx !== 'undefined' && sfx.beep) sfx.beep();

    // Sembunyikan form reset dan set input login
    toggleForgotPinForm(false);
    const actStoreInput = document.getElementById("act-store-id-input");
    const actPinInput = document.getElementById("act-store-pin-input");
    if (actStoreInput) actStoreInput.value = storeRow.store_id;
    if (actPinInput) {
      actPinInput.value = newPin;
      actPinInput.focus();
    }

    // Auto login setelah reset berhasil
    setTimeout(() => {
      loginWithStorePin();
    }, 400);

  } catch (err) {
    console.error("[ResetPIN] Error:", err);
    showToast("Gagal mereset PIN: " + err.message, "error");
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = `<span>Simpan PIN Baru</span>`;
    }
  }
}

function toggleForgotPinForm(show = true) {
  const formLogin = document.getElementById("form-store-login-pane");
  const formReset = document.getElementById("form-store-reset-pin-pane");
  if (show) {
    if (formLogin) formLogin.classList.add("hidden");
    if (formReset) formReset.classList.remove("hidden");
    const rStore = document.getElementById("reset-store-id-input") || document.getElementById("reset-pin-store-id");
    if (rStore) rStore.focus();
  } else {
    if (formReset) formReset.classList.add("hidden");
    if (formLogin) formLogin.classList.remove("hidden");
    const aStore = document.getElementById("act-store-id-input");
    if (aStore) aStore.focus();
  }
}

// Pendaftaran Trial 7 Hari Cepat (1 Langkah Instan - Aktif dalam 5 Detik)
async function registerQuickTrial() {
  const nameInput = document.getElementById("trial-quick-store-name");
  const waInput = document.getElementById("trial-quick-wa");
  const pinInput = document.getElementById("trial-quick-pin");
  const btnSubmit = document.getElementById("btn-submit-quick-trial");

  const storeName = nameInput ? nameInput.value.trim() : "";
  const rawWa = waInput ? waInput.value.trim() : "";
  const pin = pinInput ? pinInput.value.trim() : "";
  const normWa = normalizePhoneIdentifier(rawWa);

  if (!storeName) {
    showToast("Masukkan Nama Toko / Minimarket Anda!", "warning");
    if (nameInput) nameInput.focus();
    return;
  }
  if (!rawWa || normWa.length < 9) {
    showToast("Masukkan nomor WhatsApp aktif yang valid (misal: 081234567890)!", "warning");
    if (waInput) waInput.focus();
    return;
  }
  if (!pin || pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin)) {
    showToast("Buat PIN Kasir Toko berupa 4-6 angka rahasia!", "warning");
    if (pinInput) pinInput.focus();
    return;
  }

  const cleanUrl = cleanSupabaseUrl(pos.settings.supabaseUrl || (typeof window !== 'undefined' ? window.OFFICIAL_SUPABASE_URL : '') || "https://2.27.165.72.sslip.io");
  const cleanKey = cleanSupabaseKey(pos.settings.supabaseKey || (typeof window !== 'undefined' ? window.OFFICIAL_SUPABASE_KEY : '') || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODUwNDE4LCJleHAiOjE5NDc1MzA0MTh9.99BRNnUQwei95p1zAqtFBBD5CnUJSedfUeh2MJy97Gg");

  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<span>⏳ Mengaktifkan Kasir Toko Anda...</span>`;
  }

  try {
    const client = window.supabase.createClient(cleanUrl, cleanKey);

    // 1. Cek apakah nomor WA ini sudah pernah trial sebelumnya
    const { data: existing } = await client
      .from('store_licenses')
      .select('*')
      .eq('whatsapp', normWa)
      .maybeSingle();

    if (existing) {
      if (existing.plan_type === 'TRIAL' && existing.pos_expires_at && new Date() > new Date(existing.pos_expires_at)) {
        showToast("⛔ Nomor WhatsApp ini sudah pernah menggunakan masa trial dan telah berakhir. Silakan beli Lisensi Resmi via QRIS.", "warning", 8000);
        if (typeof sfx !== 'undefined' && sfx.warning) sfx.warning();
        return;
      }
      if (existing.pos_status === 'ACTIVE') {
        showToast("Toko Anda sudah terdaftar! Silakan login menggunakan ID Toko / No WA & PIN Anda.", "info", 6000);
        closeTrialRegistrationModal();
        switchActivationTab("key");
        const actStoreInput = document.getElementById("act-store-id-input");
        if (actStoreInput) actStoreInput.value = normWa;
        return;
      }
    }

    // 2. Buat ID Toko Baru
    const storeId = "STR-" + Math.floor(1000 + Math.random() * 9000);
    const currentDevId = getOrCreateDeviceId();
    const trialExp = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    // 3. Upsert ke Supabase
    const { data: newRow, error: insertErr } = await client
      .from('store_licenses')
      .upsert({
        store_id: storeId,
        store_name: storeName,
        whatsapp: normWa,
        owner_email: `${normWa}@trial.snackpos.com`,
        plan_type: "TRIAL",
        pos_status: "ACTIVE",
        pos_expires_at: trialExp,
        cloud_status: "ACTIVE",
        cloud_expires_at: trialExp,
        active_device_id: currentDevId,
        last_payment_method: "TRIAL_7_HARI",
        last_amount_paid: 0,
        last_login_at: new Date().toISOString()
      }, { onConflict: 'store_id' })
      .select()
      .maybeSingle();

    if (insertErr) {
      console.warn("Trial Supabase insert error:", insertErr);
    }

    // 4. Simpan PIN ke Cloud (Dual Layer)
    await saveStorePinToCloud(client, storeId, pin);

    // 5. Simpan ke Local Storage Kasir
    const trialLic = {
      isLicensed: true,
      ownerEmail: `${normWa}@trial.snackpos.com`,
      whatsapp: normWa,
      licenseKey: `TRIAL-${storeId}`,
      storeId: storeId,
      clientName: storeName,
      deviceId: currentDevId,
      type: "TRIAL",
      planType: "TRIAL",
      status: "ACTIVE",
      expiresAt: trialExp,
      cloudStatus: "ACTIVE",
      cloudExpiresAt: trialExp,
      activatedAt: new Date().toISOString(),
      pin: pin
    };

    saveStoredLicense(trialLic);

    pos.settings.storeId = storeId;
    pos.settings.storeName = storeName;
    pos.settings.storePhone = normWa;
    pos.saveSettings();

    // 6. Tutup Semua Modal & Aktifkan Kasir
    closeTrialRegistrationModal();
    document.getElementById("modal-activation-lock")?.classList.add("hidden");
    document.body.classList.remove("modal-open");

    if (typeof sfx !== 'undefined' && sfx.applause) sfx.applause();
    showToast(`🎉 TRIAL 7 HARI AKTIF! Selamat jualan, ${storeName}. ID Toko Anda: ${storeId}`, "success", 7000);
    renderLicenseStatus();
    checkAndOpenPostLicenseSetup();

  } catch (err) {
    console.error("[TrialRegister] Error:", err);
    showToast("Gagal mengaktifkan trial: " + err.message, "error");
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = `<span>🚀 AKTIFKAN TRIAL 7 HARI SEKARANG &rarr;</span>`;
    }
  }
}

// Silent Auto-Update PWA Listener
function setupSilentAutoUpdate() {
  if ('serviceWorker' in navigator) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      // Periksa apakah kasir sedang sibuk transaksi
      if (typeof pos !== 'undefined' && pos.cart && pos.cart.length > 0) {
        console.log("[AutoUpdate] Update tertunda karena keranjang kasir ada item. Akan reload saat transaksi selesai.");
        window._pendingAutoUpdateReload = true;
      } else {
        console.log("[AutoUpdate] Versi baru aktif! Melakukan reload senyap...");
        window.location.reload();
      }
    });

    // Pengecekan background berkala setiap 5 menit
    setInterval(() => {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg) reg.update();
      });
    }, 5 * 60 * 1000);
  }
}

// Alias untuk kompatibilitas backward
async function sendLoginOtp() {
  await loginWithStorePin();
}
async function verifyLoginOtp() {
  await loginWithStorePin();
}

// Verifikasi Kunci Serial Offline (Fallback Legacy)
function submitOfflineLicenseKey() {
  const inputEl = document.getElementById("act-offline-key-input");
  const rawKey = inputEl ? inputEl.value.trim().toUpperCase() : "";

  if (!rawKey) {
    showToast("Masukkan kunci lisensi offline!", "warning");
    return;
  }

  const keyType = verifyChecksumProductKey(rawKey);

  if (keyType) {
    const isLifetime = keyType === "LIFE";
    const currentDevId = getOrCreateDeviceId();
    const currentStoreId = pos.settings.storeId || (typeof getOrCreateStoreId === 'function' ? getOrCreateStoreId() : "");

    const newLic = {
      isLicensed: true,
      ownerEmail: "offline@snackpos.local",
      licenseKey: rawKey,
      storeId: currentStoreId,
      clientName: pos.settings.storeName || "Toko Kasir Offline",
      deviceId: currentDevId,
      type: isLifetime ? "LIFETIME" : "SUBSCRIPTION",
      planType: isLifetime ? "PAKET_1" : "PAKET_2",
      status: "ACTIVE",
      expiresAt: isLifetime ? null : new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      cloudStatus: "INACTIVE",
      cloudExpiresAt: null,
      activatedAt: new Date().toISOString()
    };

    saveStoredLicense(newLic);
    if (typeof sfx !== 'undefined' && sfx.beep) sfx.beep();
    showToast("🎉 Kunci lisensi offline valid! Kasir berhasil diaktifkan.", "success");

    const lockModal = document.getElementById("modal-activation-lock");
    if (lockModal) lockModal.classList.add("hidden");
    renderLicenseStatus();
  } else {
    showToast("⛔ Format kunci lisensi tidak valid atau salah!", "error");
    if (typeof sfx !== 'undefined' && sfx.warning) sfx.warning();
  }
}

function openActivationModal(force = false) {
  const lockModal = document.getElementById("modal-activation-lock");
  const devDisplay = document.getElementById("activation-device-id-display");
  const storeDisplay = document.getElementById("activation-store-id-display");
  const storeInput = document.getElementById("act-store-name");
  const waInput = document.getElementById("act-store-wa");

  const uniqueStoreId = typeof getOrCreateStoreId === 'function' ? getOrCreateStoreId() : (pos.settings.storeId || "");
  const currentDevId = getOrCreateDeviceId();

  if (devDisplay) devDisplay.textContent = currentDevId;
  if (storeDisplay) storeDisplay.textContent = uniqueStoreId;

  if (storeInput) storeInput.value = pos.settings.storeName || "";
  if (waInput) waInput.value = pos.settings.storePhone || "";

  switchActivationTab("qris");
  selectCashierPlan("PAKET_1");
  cancelCashierQrisCheckout();
  loadCashierModalPricing();

  if (lockModal) lockModal.classList.remove("hidden");
}

function copyActivationDeviceId() {
  const devId = getOrCreateDeviceId();
  navigator.clipboard.writeText(devId).then(() => {
    showToast(`ID Perangkat (${devId}) disalin ke clipboard!`, "success");
    sfx.beep();
  }).catch(() => {
    prompt("Salin ID Perangkat ini:", devId);
  });
}

// ==========================================
// 1c. TRIAL LIMITS & QUOTA CHECKER (10 SKU, 15 Trx/Hari)
// ==========================================
function getTodayTransactionCount() {
  if (!pos || !pos.transactions || !Array.isArray(pos.transactions)) return 0;
  const todayStr = new Date().toISOString().split("T")[0];
  return pos.transactions.filter(t => t.date === todayStr).length;
}

function isTrialLimitReached(checkType) {
  return false;
}

function showTrialUpgradeModal(reason = "SKU") {
  const modal = document.getElementById("modal-trial-upgrade");
  const titleEl = document.getElementById("trial-upgrade-title");
  const descEl = document.getElementById("trial-upgrade-desc");
  const badgeEl = document.getElementById("trial-upgrade-badge");

  if (reason === "SKU") {
    if (titleEl) titleEl.textContent = "Batas 10 Produk Versi Trial Tercapai";
    if (badgeEl) badgeEl.textContent = "KUOTA 10 SKU PENUH";
    if (descEl) descEl.innerHTML = "Anda telah mencapai batas maksimal <strong>10 SKU produk</strong> pada mode Trial 7 Hari.<br><br>Untuk menambahkan produk toko Anda tanpa batas (<em>Unlimited SKU</em>) dan membuka fitur lengkap, silakan aktifkan Lisensi Resmi SnackPOS!";
  } else {
    const todayCount = getTodayTransactionCount();
    if (titleEl) titleEl.textContent = "Batas 15 Transaksi Harian Tercapai";
    if (badgeEl) badgeEl.textContent = `15/15 TRANSAKSI HARI INI`;
    if (descEl) descEl.innerHTML = `Toko Anda telah melayani <strong>${todayCount} transaksi</strong> hari ini pada mode Trial.<br><br>Untuk melayani pembeli setiap hari tanpa batas transaksi (<em>Unlimited Transaksi</em>), silakan upgrade ke Lisensi Resmi SnackPOS!`;
  }

  if (modal) {
    modal.classList.remove("hidden");
    sfx.warning();
  } else {
    alert(reason === "SKU" 
      ? "Batas 10 Produk Versi Trial Tercapai. Silakan upgrade ke Lisensi Resmi untuk menambah produk tanpa batas!" 
      : "Batas 15 Transaksi Hari Ini Versi Trial Tercapai. Silakan upgrade ke Lisensi Resmi untuk transaksi tanpa batas!");
  }
}

function closeTrialUpgradeModal() {
  const modal = document.getElementById("modal-trial-upgrade");
  if (modal) modal.classList.add("hidden");
}

// ==========================================
// 1d. OTENTIKASI EMAIL + KODE OTP 6-DIGIT (CLOUDFLARE SERVERLESS + SUPABASE)
// ==========================================
async function sendLicenseEmailOtp(email) {
  if (!email || !email.includes("@")) {
    throw new Error("Masukkan alamat email yang valid!");
  }

  const cleanEmail = email.trim().toLowerCase();

  // 1. Panggil Cloudflare Pages Serverless Function /api/send-otp
  try {
    const res = await fetch("/api/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: cleanEmail,
        storeName: pos.settings.storeName || "TOKO KASIR",
        storeId: pos.settings.storeId || (typeof getOrCreateStoreId === 'function' ? getOrCreateStoreId() : "")
      })
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.success) {
        sessionStorage.setItem("snackpos_otp_challenge", data.challenge || "");
        sessionStorage.setItem("snackpos_otp_expires", data.expiresAt || "");
        sessionStorage.setItem("snackpos_otp_email", cleanEmail);
        return data;
      }
    }
  } catch (err) {
    console.warn("Cloudflare /api/send-otp offline, beralih ke Supabase Auth:", err);
  }

  // 2. Fallback via Supabase Auth resmi
  const cleanUrl = cleanSupabaseUrl(pos.settings.supabaseUrl);
  const cleanKey = cleanSupabaseKey(pos.settings.supabaseKey);

  if (cleanUrl && cleanKey && window.supabase && navigator.onLine) {
    try {
      const client = window.supabase.createClient(cleanUrl, cleanKey);
      const redirectTarget = window.location.href.split('#')[0].split('?')[0];
      const { error } = await client.auth.signInWithOtp({
        email: cleanEmail,
        options: { 
          shouldCreateUser: true,
          emailRedirectTo: redirectTarget
        }
      });
      if (!error) return { success: true };
    } catch (e) {
      console.warn("Supabase Auth fallback:", e);
    }
  }

  throw new Error("Gagal mengirim kode OTP ke email. Pastikan koneksi internet aktif atau hubungi Vendor.");
}

async function verifyLicenseEmailOtp(email, otpToken) {
  const cleanEmail = email.trim().toLowerCase();
  const cleanToken = otpToken.trim();
  const currentDevId = getOrCreateDeviceId();
  const currentStoreId = typeof getOrCreateStoreId === 'function' ? getOrCreateStoreId() : (pos.settings.storeId || "");

  if (!cleanToken || cleanToken.length < 4) {
    throw new Error("Masukkan kode OTP yang valid!");
  }

  const challenge = sessionStorage.getItem("snackpos_otp_challenge") || "";
  const expiresAt = sessionStorage.getItem("snackpos_otp_expires") || "0";

  let verified = false;
  let licenseRow = null;

  // 1. Verifikasi via Cloudflare Serverless Function /api/verify-otp
  try {
    const res = await fetch("/api/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: cleanEmail,
        otp: cleanToken,
        challenge: challenge,
        expiresAt: expiresAt,
        deviceId: currentDevId,
        storeName: pos.settings.storeName || "TOKO KASIR",
        storeId: currentStoreId,
        supabaseUrl: pos.settings.supabaseUrl,
        supabaseKey: pos.settings.supabaseKey
      })
    });

    const data = await res.json();
    if (res.ok && data && data.success) {
      verified = true;
      licenseRow = data.license || null;
    } else if (data && data.message) {
      throw new Error(data.message);
    }
  } catch (err) {
    throw new Error(err.message || "Gagal memverifikasi kode OTP!");
  }

  if (!verified || !licenseRow) {
    throw new Error("Akun email Anda belum terdaftar sebagai pemilik lisensi resmi SnackPOS.");
  }

  // Tentukan jenis lisensi dari data cloud resmi
  const isLifetime = licenseRow.plan_type === "PAKET_1" || licenseRow.plan_type === "LIFETIME" || (!licenseRow.pos_expires_at && licenseRow.plan_type !== "TRIAL");
  const isTrial = licenseRow.plan_type === "TRIAL";
  const storeId = licenseRow.store_id || currentStoreId;
  const storeName = licenseRow.store_name || pos.settings.storeName || cleanEmail.split("@")[0].toUpperCase();
  const cloudStatus = licenseRow.cloud_status || "INACTIVE";
  const cloudExpiresAt = licenseRow.cloud_expires_at || null;
  const planType = licenseRow.plan_type || (isTrial ? "TRIAL" : (isLifetime ? "PAKET_1" : "PAKET_2"));
  const licenseType = isTrial ? "TRIAL" : (isLifetime ? "LIFETIME" : "SUBSCRIPTION");
  const expiresAtFinal = licenseRow.pos_expires_at || (isLifetime ? null : new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString());

  // Simpan Lisensi ke memori lokal kasir
  const newLic = {
    isLicensed: true,
    ownerEmail: cleanEmail,
    storeId: storeId,
    clientName: storeName,
    deviceId: currentDevId,
    type: licenseType,
    planType: planType,
    status: "ACTIVE",
    expiresAt: expiresAtFinal,
    cloudStatus: cloudStatus,
    cloudExpiresAt: cloudExpiresAt,
    activatedAt: new Date().toISOString()
  };

  saveStoredLicense(newLic);

  pos.settings.storeName = storeName;
  pos.settings.storeId = storeId;
  pos.saveSettings();
  loadSettingsToForm();

  return newLic;
}

// ==========================================
// 1c. PENDAFTARAN TRIAL 7 HARI + CAPTURE LEADS KE SUPABASE
// ==========================================
function openTrialRegistrationModal() {
  const modal = document.getElementById("modal-trial-registration");
  const storeInput = document.getElementById("trial-input-store-name");
  const waInput = document.getElementById("trial-input-wa");
  const emailInput = document.getElementById("trial-input-email");

  if (storeInput) storeInput.value = pos.settings.storeName || "";
  if (waInput) waInput.value = pos.settings.storePhone || "";
  if (emailInput) emailInput.value = "";

  backToTrialStep1();

  if (modal) modal.classList.remove("hidden");
}

function closeTrialRegistrationModal() {
  const modal = document.getElementById("modal-trial-registration");
  if (modal) modal.classList.add("hidden");
}

function backToTrialStep1() {
  const step1 = document.getElementById("trial-step-1");
  const step2 = document.getElementById("trial-step-2");
  if (step1) step1.classList.remove("hidden");
  if (step2) step2.classList.add("hidden");
}

async function sendTrialRegistrationOtp(isResend = false) {
  const storeInput = document.getElementById("trial-input-store-name");
  const waInput = document.getElementById("trial-input-wa");
  const emailInput = document.getElementById("trial-input-email");
  const btnSend = document.getElementById("btn-send-trial-otp");

  const storeName = storeInput ? storeInput.value.trim() : "";
  const wa = waInput ? waInput.value.trim() : "";
  const email = emailInput ? emailInput.value.trim().toLowerCase() : "";

  if (!storeName) {
    showToast("Masukkan nama toko / minimarket Anda!", "warning");
    if (storeInput) storeInput.focus();
    return;
  }
  if (!wa || wa.length < 8) {
    showToast("Masukkan nomor WhatsApp pemilik toko yang valid!", "warning");
    if (waInput) waInput.focus();
    return;
  }
  if (!email || !email.includes("@") || !email.includes(".")) {
    showToast("Masukkan alamat email toko yang valid!", "warning");
    if (emailInput) emailInput.focus();
    return;
  }

  if (btnSend) {
    btnSend.disabled = true;
    btnSend.innerHTML = `<span>⏳ Mengirim OTP ke ${email}...</span>`;
  }

  try {
    // 1. Cek dulu ke Supabase apakah email ini sudah pernah trial atau punya lisensi
    const cleanUrl = cleanSupabaseUrl(pos.settings.supabaseUrl || (typeof window !== 'undefined' ? window.OFFICIAL_SUPABASE_URL : '') || "https://2.27.165.72.sslip.io");
    const cleanKey = cleanSupabaseKey(pos.settings.supabaseKey || (typeof window !== 'undefined' ? window.OFFICIAL_SUPABASE_KEY : '') || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODUwNDE4LCJleHAiOjE5NDc1MzA0MTh9.99BRNnUQwei95p1zAqtFBBD5CnUJSedfUeh2MJy97Gg");
    if (window.supabase) {
      const client = window.supabase.createClient(cleanUrl, cleanKey);
      const { data: existing } = await client.from('store_licenses').select('*').eq('owner_email', email).maybeSingle();
      if (existing) {
        if (existing.plan_type === 'TRIAL' && existing.pos_expires_at && new Date() > new Date(existing.pos_expires_at)) {
          showToast(`⛔ Email ${email} sudah pernah digunakan untuk masa uji coba dan telah berakhir. Silakan beli Lisensi Resmi via QRIS.`, "warning", 8000);
          if (typeof sfx !== 'undefined' && sfx.warning) sfx.warning();
          return;
        }
      }
    }

    // 2. Request OTP via serverless Cloudflare /api/send-otp
    const res = await fetch("/api/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        storeName,
        storeId: pos.settings.storeId || "STR-TRIAL"
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || "Gagal mengirimkan kode OTP");
    }

    sessionStorage.setItem("snackpos_trial_email", email);
    sessionStorage.setItem("snackpos_trial_name", storeName);
    sessionStorage.setItem("snackpos_trial_wa", wa);
    sessionStorage.setItem("snackpos_trial_challenge", data.challenge || "");
    sessionStorage.setItem("snackpos_trial_expires", data.expiresAt || "");

    const step1 = document.getElementById("trial-step-1");
    const step2 = document.getElementById("trial-step-2");
    const emailDisplay = document.getElementById("trial-sent-email-display");
    if (emailDisplay) emailDisplay.textContent = email;
    if (step1) step1.classList.add("hidden");
    if (step2) step2.classList.remove("hidden");

    const otpInput = document.getElementById("trial-input-otp");
    if (otpInput) {
      otpInput.value = "";
      otpInput.focus();
    }

    showToast(`📩 Kode OTP 6-digit berhasil dikirim ke ${email}!`, "success", 6000);
    if (typeof sfx !== 'undefined' && sfx.beep) sfx.beep();

  } catch (err) {
    console.error("[TrialOTP] Error:", err);
    showToast("Gagal mengirim OTP: " + err.message, "error");
    if (typeof sfx !== 'undefined' && sfx.warning) sfx.warning();
  } finally {
    if (btnSend) {
      btnSend.disabled = false;
      btnSend.innerHTML = `<span>📩 Kirim Kode OTP ke Email &rarr;</span>`;
    }
  }
}

async function submitTrialRegistrationOtp() {
  const otpInput = document.getElementById("trial-input-otp");
  const btnSubmit = document.getElementById("btn-submit-trial-otp");

  const otp = otpInput ? otpInput.value.trim() : "";
  const email = sessionStorage.getItem("snackpos_trial_email") || "";
  const storeName = sessionStorage.getItem("snackpos_trial_name") || "Toko Kasir";
  const wa = sessionStorage.getItem("snackpos_trial_wa") || "";
  const challenge = sessionStorage.getItem("snackpos_trial_challenge") || "";
  const expiresAt = sessionStorage.getItem("snackpos_trial_expires") || "0";
  const currentDevId = getOrCreateDeviceId();
  const storeId = "STR-" + Math.floor(1000 + Math.random() * 9000);

  if (!otp || otp.length < 6) {
    showToast("Masukkan 6 digit kode OTP yang dikirim ke email Anda!", "warning");
    if (otpInput) otpInput.focus();
    return;
  }

  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<span>⏳ Memverifikasi OTP & Mendaftarkan Toko...</span>`;
  }

  try {
    // 1. Verifikasi OTP & Daftarkan ke Supabase via /api/verify-otp
    const res = await fetch("/api/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        otp,
        challenge,
        expiresAt,
        deviceId: currentDevId,
        storeName,
        storeId,
        whatsapp: wa,
        planType: "TRIAL"
      })
    });

    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.message || "Kode OTP tidak valid atau salah!");
    }

    // 2. Simpan lisensi Trial lokal
    const trialExp = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const trialLic = {
      isLicensed: true,
      ownerEmail: email,
      licenseKey: `TRIAL-${storeId}`,
      storeId: storeId,
      clientName: storeName,
      deviceId: currentDevId,
      type: "TRIAL",
      planType: "TRIAL",
      status: "ACTIVE",
      expiresAt: trialExp,
      cloudStatus: "INACTIVE",
      cloudExpiresAt: null,
      activatedAt: new Date().toISOString()
    };

    saveStoredLicense(trialLic);

    // Update settings
    pos.settings.storeName = storeName;
    pos.settings.storeId = storeId;
    pos.settings.storePhone = wa;
    pos.saveSettings();

    // Efek & Feedback
    if (typeof sfx !== 'undefined' && sfx.applause) sfx.applause();
    else if (typeof sfx !== 'undefined' && sfx.beep) sfx.beep();

    showToast(`🎉 Selamat datang, ${storeName}! Uji coba gratis 7 hari Anda resmi aktif.`, "success", 7000);

    closeTrialRegistrationModal();
    const lockModal = document.getElementById("modal-activation-lock");
    if (lockModal) lockModal.classList.add("hidden");

    renderLicenseStatus();
    if (typeof loadSettingsToForm === 'function') loadSettingsToForm();

  } catch (err) {
    console.error("[TrialRegister] Error:", err);
    showToast("Aktivasi trial gagal: " + err.message, "error", 6000);
    if (typeof sfx !== 'undefined' && sfx.warning) sfx.warning();
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = `<span>🚀 Verifikasi OTP & Aktifkan Kasir 7 Hari</span>`;
    }
  }
}

function handleTrialActivation() {
  openTrialRegistrationModal();
}

async function logoutLicense() {
  if (typeof openExitModal === "function") {
    openExitModal();
  } else if (typeof openModal === "function") {
    openModal("modal-confirm-exit");
  } else {
    handleExitApp();
  }
}

function regenerateActivationStoreId() {
  const newId = typeof getOrCreateStoreId === 'function' ? getOrCreateStoreId(true) : "STR-" + Math.floor(1000 + Math.random() * 9000);
  const storeDisplay = document.getElementById("activation-store-id-display");
  if (storeDisplay) storeDisplay.textContent = newId;
  showToast(`ID Toko Baru: ${newId}`, "success");
}

function showActivationFeedback(message, type = "error") {
  const fb = document.getElementById("activation-feedback");
  if (!fb) return;
  fb.className = `p-3 rounded-xl text-xs font-bold ${
    type === "success" ? "bg-emerald-100 text-emerald-900 border border-emerald-300" : "bg-rose-100 text-rose-900 border border-rose-300"
  }`;
  fb.textContent = message;
  fb.classList.remove("hidden");
}

function renderLicenseStatus() {
  const lic = getStoredLicense();
  const headerStoreBadge = document.getElementById("header-store-badge-name");
  const topHeaderStoreName = document.getElementById("top-header-store-name");
  const headerStoreBtnLabel = document.getElementById("header-store-btn-label");
  const activeStoreName = (lic && lic.clientName) || (pos && pos.settings && pos.settings.storeName) || "Minimarket Kasir";

  if (headerStoreBadge) headerStoreBadge.textContent = activeStoreName;
  if (topHeaderStoreName) topHeaderStoreName.textContent = activeStoreName.toUpperCase();
  if (headerStoreBtnLabel) headerStoreBtnLabel.textContent = activeStoreName;

  const badge = document.getElementById("setting-license-badge");
  const clientEl = document.getElementById("setting-license-client");
  const emailEl = document.getElementById("setting-license-email");
  const devEl = document.getElementById("setting-license-device");
  const storeIdEl = document.getElementById("setting-license-store-id");
  const planEl = document.getElementById("setting-license-plan");
  const quotaEl = document.getElementById("setting-license-quota");

  const currentStoreId = typeof getOrCreateStoreId === 'function' ? getOrCreateStoreId() : (pos?.settings?.storeId || "");
  const currentDeviceId = typeof getOrCreateDeviceId === 'function' ? getOrCreateDeviceId() : "";

  if (storeIdEl) storeIdEl.textContent = currentStoreId || "-";
  if (devEl) devEl.textContent = currentDeviceId || "-";

  const contactLabelEl = document.getElementById("setting-license-contact-label");

  // JIKA TIDAK ADA LISENSI ATAU APLIKASI BELUM BERLISENSI:
  if (!lic || !lic.isLicensed) {
    if (badge) {
      badge.className = "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-200 text-slate-700 border border-slate-300";
      badge.textContent = "BELUM AKTIF";
    }
    if (clientEl) clientEl.textContent = (pos && pos.settings && pos.settings.storeName) || "(Toko Belum Berlisensi)";
    if (contactLabelEl) contactLabelEl.textContent = "No. WhatsApp Pemilik";
    if (emailEl) emailEl.textContent = "Belum Terdaftar";
    if (planEl) {
      planEl.className = "font-bold text-slate-600 text-xs block mt-0.5 truncate";
      planEl.textContent = "Belum Ada Lisensi Aktif";
    }
    if (quotaEl) {
      quotaEl.innerHTML = `<span class="text-rose-600 font-bold">Aplikasi Belum Teraktivasi (Kasir Terkunci)</span>`;
      quotaEl.classList.remove("hidden");
    }
    return;
  }

  // JIKA SUDAH BERLISENSI RESMI:
  if (clientEl) clientEl.textContent = lic.clientName || (pos && pos.settings && pos.settings.storeName) || "-";

  if (emailEl) {
    const rawEmail = (lic.ownerEmail || "").trim();
    const phone = lic.whatsapp || (pos && pos.settings && pos.settings.storePhone) || "";
    const isDummyEmail = !rawEmail || 
      rawEmail.includes("@trial.snackpos.com") || 
      rawEmail.includes("@snackpos.com") || 
      rawEmail.includes("@wa.me") || 
      rawEmail.includes("offline@") || 
      rawEmail === "owner@snackpos.com" || 
      rawEmail === "test@tokoberkah.com" || 
      rawEmail === "berkah@gmail.com";

    if (phone) {
      if (contactLabelEl) contactLabelEl.textContent = "No. WhatsApp Pemilik";
      emailEl.textContent = `📱 ${phone}`;
    } else if (!isDummyEmail && rawEmail) {
      if (contactLabelEl) contactLabelEl.textContent = "Email Pemilik Toko";
      emailEl.textContent = `📧 ${rawEmail}`;
    } else {
      if (contactLabelEl) contactLabelEl.textContent = "Kontak Toko";
      emailEl.textContent = "-";
    }
  }

  if (devEl) devEl.textContent = lic.deviceId || currentDeviceId;
  if (storeIdEl) storeIdEl.textContent = lic.storeId || currentStoreId;
  
  if (planEl) {
    if (lic.type === "LIFETIME" || lic.planType === "PAKET_1") {
      planEl.className = "font-bold text-emerald-700 text-xs block mt-0.5 truncate";
      planEl.textContent = "Paket 1 - Beli Putus POS Offline (Lifetime)";
    } else if (lic.type === "TRIAL") {
      planEl.className = "font-bold text-amber-600 text-xs block mt-0.5 truncate";
      planEl.textContent = "Trial Gratis 7 Hari (10 SKU & 15 Trx/Hari)";
    } else {
      planEl.className = "font-bold text-blue-700 text-xs block mt-0.5 truncate";
      planEl.textContent = "Paket 2 - Full SaaS Langganan POS + Cloud";
    }
  }

  if (quotaEl) {
    if (lic.type === "TRIAL") {
      const todayTrx = getTodayTransactionCount();
      const currentSkus = (pos?.products || []).length;
      quotaEl.innerHTML = `<span class="text-amber-500 font-bold">Produk: ${currentSkus}/10 SKU</span> • <span class="text-amber-500 font-bold">Transaksi Hari Ini: ${todayTrx}/15</span>`;
      quotaEl.classList.remove("hidden");
    } else {
      quotaEl.innerHTML = `<span class="text-emerald-500 font-bold">Unlimited SKU & Transaksi Tanpa Batas</span>`;
      quotaEl.classList.remove("hidden");
    }
  }

  if (badge) {
    if (lic.status === "BLOCKED" || lic.status === "EXPIRED" || !lic.isLicensed) {
      badge.className = "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-600 text-white";
      badge.textContent = "KADALUARSA / TERKUNCI";
    } else if (lic.type === "LIFETIME" || lic.planType === "PAKET_1") {
      badge.className = "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500 text-slate-950";
      badge.textContent = "AKTIF SELAMANYA";
    } else if (lic.type === "TRIAL") {
      const expDate = lic.expiresAt ? new Date(lic.expiresAt).toLocaleDateString("id-ID") : "";
      badge.className = "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-400 text-slate-950";
      badge.textContent = `TRIAL s/d ${expDate}`;
    } else {
      const expDate = lic.expiresAt ? new Date(lic.expiresAt).toLocaleDateString("id-ID") : "";
      badge.className = "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-blue-500 text-white";
      badge.textContent = `LANGGANAN s/d ${expDate}`;
    }
  }

  // Sinkronkan badge lisensi di menu Tentang Aplikasi
  if (typeof updateAboutLicenseBadge === 'function') {
    updateAboutLicenseBadge();
  }
}

async function verifyLicenseOnlineQuietly() {
  if (!navigator.onLine || !pos.settings.supabaseUrl || !pos.settings.supabaseKey) return;
  const lic = getStoredLicense();
  if (!lic) return;

  try {
    const cleanUrl = cleanSupabaseUrl(pos.settings.supabaseUrl);
    const cleanKey = cleanSupabaseKey(pos.settings.supabaseKey);
    if (!cleanUrl || !cleanKey || !window.supabase) return;

    const client = window.supabase.createClient(cleanUrl, cleanKey);
    
    // Cek berdasarkan store_id, owner_email, atau license_key
    let query = client.from('store_licenses').select('*');
    if (lic.storeId) {
      query = query.eq('store_id', lic.storeId);
    } else if (lic.ownerEmail) {
      query = query.eq('owner_email', lic.ownerEmail);
    } else if (lic.licenseKey) {
      query = query.eq('license_key', lic.licenseKey);
    } else {
      return;
    }

    const { data, error } = await query.maybeSingle();

    if (data) {
      if (data.cloud_status) {
        lic.cloudStatus = data.cloud_status;
        lic.cloudExpiresAt = data.cloud_expires_at;
      }

      saveStoredLicense(lic);
    }
  } catch (e) {
    // Abaikan error saat cek diam-diam di latar belakang
  }
}

function copyStoreOwnerLink() {
  const storeId = (pos && pos.settings && pos.settings.storeId) ? pos.settings.storeId : ("STR-" + ((pos && pos.settings && pos.settings.storeCode) || "001"));
  const origin = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '');
  const ownerUrl = `${origin}/owner.html?store=${encodeURIComponent(storeId)}`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(ownerUrl).then(() => {
      showToast(`Link Dashboard Pemilik disalin! Buka dari HP Anda.`, "success");
    }).catch(() => {
      prompt("Salin Link Dashboard HP ini:", ownerUrl);
    });
  } else {
    prompt("Salin Link Dashboard HP ini:", ownerUrl);
  }
}

// ==========================================
// 1e. UI EVENT HANDLERS: EMAIL OTP ACTIVATION
// ==========================================
async function sendActivationOtp() {
  const emailInput = document.getElementById("activation-email");
  const email = emailInput ? emailInput.value.trim() : "";
  const btnSend = document.getElementById("btn-send-otp");

  if (!email || !email.includes("@")) {
    showActivationFeedback("Masukkan alamat email toko yang valid!", "error");
    if (emailInput) emailInput.focus();
    return;
  }

  if (btnSend) {
    btnSend.disabled = true;
    btnSend.innerHTML = `<span>⏳ Mengirim OTP...</span>`;
  }

  try {
    await sendLicenseEmailOtp(email);
    showActivationFeedback(`✅ Kode OTP telah dikirim ke ${email}. Masukkan 6 angka kode verifikasi.`, "success");
    document.getElementById("div-otp-step")?.classList.remove("hidden");
    document.getElementById("activation-otp-code")?.focus();
  } catch (err) {
    showActivationFeedback(`❌ ${err.message}`, "error");
  } finally {
    if (btnSend) {
      btnSend.disabled = false;
      btnSend.innerHTML = `<span>Kirim Ulang OTP</span>`;
    }
  }
}

async function submitActivationOtp() {
  const emailInput = document.getElementById("activation-email");
  const otpInput = document.getElementById("activation-otp-code");
  const btnVerify = document.getElementById("btn-verify-otp");

  const email = emailInput ? emailInput.value.trim() : "";
  const otp = otpInput ? otpInput.value.trim() : "";

  if (!email || !otp) {
    showActivationFeedback("Harap masukkan email dan kode OTP 6-digit!", "error");
    return;
  }

  if (btnVerify) {
    btnVerify.disabled = true;
    btnVerify.innerHTML = `<span>⏳ Memverifikasi OTP...</span>`;
  }

  try {
    const lic = await verifyLicenseEmailOtp(email, otp);
    showActivationFeedback(`✅ Otentikasi Berhasil! Membuka kasir toko...`, "success");
    sfx.success();
    setTimeout(() => {
      document.getElementById("modal-activation-lock")?.classList.add("hidden");
      showToast(`Selamat datang, ${lic.clientName}! Kasir aktif.`, "success");
      renderLicenseStatus();
      checkAndOpenPostLicenseSetup();
    }, 1000);
  } catch (err) {
    showActivationFeedback(`❌ ${err.message}`, "error");
    sfx.warning();
  } finally {
    if (btnVerify) {
      btnVerify.disabled = false;
      btnVerify.innerHTML = `<span>⚡ Masuk & Aktifkan Kasir</span>`;
    }
  }
}

function toggleLegacyKeyInput() {
  const div = document.getElementById("div-legacy-key");
  if (div) div.classList.toggle("hidden");
}




// ==========================================
// KELOLA MODAL LOGIN TOKO & INFORMASI AKUN
// ==========================================
function openStoreLoginOrAccountModal() {
  const lic = typeof getStoredLicense === 'function' ? getStoredLicense() : null;
  const currentStoreId = (lic && lic.storeId) || (pos?.settings?.storeId) || "";
  
  // Jika toko sudah aktif dan bukan STR-GUEST:
  if (lic && lic.isLicensed && currentStoreId && currentStoreId !== "STR-GUEST") {
    const accModal = document.getElementById("modal-store-account-info");
    if (accModal) {
      const nameEl = document.getElementById("acc-info-store-name");
      const idEl = document.getElementById("acc-info-store-id");
      const waEl = document.getElementById("acc-info-store-wa");
      const emailEl = document.getElementById("acc-info-store-email");
      const planEl = document.getElementById("acc-info-store-plan");
      const expEl = document.getElementById("acc-info-store-expiry");
      
      const sName = lic.clientName || pos?.settings?.storeName || "Toko Kasir";
      if (nameEl) nameEl.textContent = sName;
      if (idEl) idEl.textContent = currentStoreId;
      if (waEl) waEl.textContent = lic.whatsapp || pos?.settings?.storePhone || "-";
      if (emailEl) emailEl.textContent = lic.ownerEmail || "-";
      if (planEl) planEl.textContent = lic.planType || (lic.type === "LIFETIME" ? "Paket 1 (Lifetime)" : "Paket 2 (SaaS + Cloud)");
      if (expEl) {
        expEl.textContent = lic.expiresAt ? new Date(lic.expiresAt).toLocaleDateString("id-ID") : "Aktif Selamanya (Lifetime)";
      }
      
      accModal.classList.remove("hidden");
      document.body.classList.add("modal-open");
      return;
    }
  }
  
  openStoreLoginModal();
}

function openStoreLoginModal() {
  const lockModal = document.getElementById("modal-activation-lock");
  if (lockModal) {
    lockModal.classList.remove("hidden");
    lockModal.style.removeProperty("display");
    lockModal.style.display = "flex";
    if (typeof switchAuthLayer === 'function') switchAuthLayer('login');
    const storeInput = document.getElementById("act-store-id-input");
    if (storeInput) setTimeout(() => storeInput.focus(), 150);
  }
  document.body.classList.add("modal-open");
}

function closeStoreLoginModal() {
  if (!isAppLicensed()) {
    showToast("⚠️ Silakan selesaikan pendaftaran toko baru atau masuk dengan akun toko Anda.", "warning");
    return;
  }
  const lockModal = document.getElementById("modal-activation-lock");
  if (lockModal) {
    lockModal.classList.add("hidden");
    lockModal.style.display = "none";
  }
  document.body.classList.remove("modal-open");
}

function closeStoreAccountModal() {
  const accModal = document.getElementById("modal-store-account-info");
  if (accModal) {
    accModal.classList.add("hidden");
  }
  document.body.classList.remove("modal-open");
}


// ==========================================
// OTORISASI KHUSUS PEMILIK SISTEM (SYSTEM OWNER ONLY)
// Pemilik Toko / COS / Kasir DILARANG ganti toko
// ==========================================
const SYSTEM_OWNER_MASTER_PINS = ["888888", "8888", "@Adsforum27", "Adsforum27"];

function isSystemOwnerPinValid(inputPin) {
  if (!inputPin) return false;
  const clean = inputPin.toString().trim();
  if (SYSTEM_OWNER_MASTER_PINS.includes(clean)) return true;
  const customPin = localStorage.getItem("snackpos_vendor_pin");
  if (customPin && (clean === customPin || clean === customPin.trim())) return true;
  return false;
}

function openSystemOwnerAuthModal() {
  const modal = document.getElementById("modal-system-owner-auth");
  const errEl = document.getElementById("system-owner-error-msg");
  const inputEl = document.getElementById("system-owner-pin-input");
  
  if (errEl) errEl.classList.add("hidden");
  if (inputEl) {
    inputEl.value = "";
    setTimeout(() => inputEl.focus(), 150);
  }
  if (modal) {
    modal.classList.remove("hidden");
    document.body.classList.add("modal-open");
  }
}

function closeSystemOwnerAuthModal() {
  const modal = document.getElementById("modal-system-owner-auth");
  if (modal) modal.classList.add("hidden");
}

function handleSystemOwnerAuthSubmit(e) {
  if (e) e.preventDefault();
  const inputEl = document.getElementById("system-owner-pin-input");
  const errEl = document.getElementById("system-owner-error-msg");
  const pin = inputEl ? inputEl.value.trim() : "";

  if (!pin) {
    if (errEl) {
      errEl.textContent = "Masukkan Master PIN Pemilik Sistem!";
      errEl.classList.remove("hidden");
    }
    return;
  }

  if (isSystemOwnerPinValid(pin)) {
    // Akses Diterima
    closeSystemOwnerAuthModal();
    closeStoreAccountModal();
    if (typeof sfx !== 'undefined' && sfx.applause) sfx.applause();
    else if (typeof sfx !== 'undefined' && sfx.success) sfx.success();
    
    showToast("🔓 Otorisasi Pemilik Sistem Diterima! Membuka akses pergantian toko.", "success", 4000);
    openStoreLoginModal();
  } else {
    // Akses Ditolak
    if (typeof sfx !== 'undefined' && sfx.warning) sfx.warning();
    if (errEl) {
      errEl.textContent = "⛔ Akses Ditolak! Anda bukan Pemilik Sistem. Pergantian toko dibatalkan.";
      errEl.classList.remove("hidden");
    }
    showToast("⛔ Akses Ditolak: Hanya Pemilik Sistem (Vendor / Super Admin) yang berhak mengganti toko!", "error", 6000);
    if (inputEl) {
      inputEl.value = "";
      inputEl.focus();
    }
  }
}

// Guard promptSwitchStore agar selalu lewat otorisasi Pemilik Sistem
function promptSwitchStore() {
  openSystemOwnerAuthModal();
}


function logoutStore() {
  if (!confirm("Apakah Anda yakin ingin keluar / logout dari akun toko ini?")) {
    return;
  }
  localStorage.removeItem("snack_pos_license");
  if (window.pos && window.pos.settings) {
    window.pos.settings.storeId = "STR-GUEST";
    window.pos.settings.storeName = "MINIMARKET KASIR";
    window.pos.saveSettings();
  }
  closeStoreAccountModal();
  if (typeof renderLicenseStatus === 'function') renderLicenseStatus();
  showToast("ℹ️ Anda telah keluar dari akun toko. Silakan login kembali.", "info", 4000);
  openStoreLoginModal();
}

if (typeof window !== 'undefined') {
  window.openStoreLoginOrAccountModal = openStoreLoginOrAccountModal;
  window.openStoreLoginModal = openStoreLoginModal;
  window.closeStoreLoginModal = closeStoreLoginModal;
  window.closeStoreAccountModal = closeStoreAccountModal;
  window.promptSwitchStore = promptSwitchStore;
  window.logoutStore = logoutStore;
}


// Konfirmasi Manual Pembayaran QRIS / Transfer & Aktivasi Kasir
async function confirmCashierPaidAndActivate() {
  if (!cashierActiveOrderData) {
    showToast("⚠️ Data pendaftaran tidak ditemukan. Silakan isi form toko kembali.", "warning");
    switchAuthLayer("signup");
    return;
  }

  const btnConfirm = document.getElementById("btn-confirm-qris-paid");
  if (btnConfirm) {
    btnConfirm.disabled = true;
    btnConfirm.innerHTML = `<span>⏳ Mengaktifkan Lisensi Kasir...</span>`;
  }

  try {
    const order = cashierActiveOrderData;
    const storeId = order.storeId || ("STR-" + Math.floor(1000 + Math.random() * 9000));
    const plan = order.plan || "PAKET_2";
    const isLifetime = plan === "PAKET_1";
    const durDays = order.durationDays || (plan === "PAKET_2_3M" ? 90 : plan === "PAKET_2_6M" ? 180 : plan === "PAKET_2_1Y" ? 365 : (isLifetime ? null : 30));
    const posExp = isLifetime ? null : new Date(Date.now() + durDays * 24 * 3600 * 1000).toISOString();
    const hasCloud = !isLifetime || Boolean(order.hasCloudSync);
    const cloudDays = order.cloudDays || (isLifetime ? (hasCloud ? 365 : 0) : durDays);
    const cloudExp = hasCloud && cloudDays > 0
      ? new Date(Date.now() + cloudDays * 24 * 3600 * 1000).toISOString() 
      : null;

    const client = getActiveSupabaseClient();
    if (client) {
      const slPayload = {
        store_id: storeId,
        store_name: order.storeName,
        whatsapp: order.wa,
        owner_email: `${order.wa || storeId.toLowerCase()}@snackpos.local`,
        plan_type: plan,
        pos_status: "ACTIVE",
        pos_expires_at: posExp,
        cloud_status: hasCloud ? "ACTIVE" : "INACTIVE",
        cloud_expires_at: cloudExp,
        active_device_id: order.deviceId,
        last_payment_method: "QRIS",
        last_amount_paid: order.amount || 0,
        last_login_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { error: upsertErr } = await client
        .from('store_licenses')
        .upsert(slPayload, { onConflict: 'store_id' });

      if (upsertErr) {
        console.warn("[confirmCashierPaidAndActivate] Upsert error:", upsertErr);
      }

      await saveStorePinToCloud(client, storeId, order.pin || "123456", order.wa);
    }

    clearInterval(cashierQrisPollingTimer);
    clearInterval(cashierQrisCountdownTimer);

    onCashierPaymentSuccess(plan, order.storeName, order.wa);
    showToast(`🎉 Pembayaran Terkonfirmasi! Kasir ${order.storeName} (${storeId}) telah AKTIF!`, "success", 8000);
  } catch (err) {
    console.error("[confirmCashierPaidAndActivate] Error:", err);
    showToast("Gagal mengaktifkan: " + err.message, "error");
  } finally {
    if (btnConfirm) {
      btnConfirm.disabled = false;
      btnConfirm.innerHTML = `<span>✅ Saya Sudah Transfer / Bayar QRIS</span>`;
    }
  }
}
