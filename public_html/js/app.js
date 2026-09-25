/**
 * SnackPOS - Main Application Entry Point & Keyboard Router
 */

// ==========================================
// 11. NAVIGATION & MODALS
// ==========================================
function switchTab(tabId) {
  if (tabId === "tab-reports") {
    const isAuth = typeof isCurrentUserAuthorizedForFinancials === "function" 
      ? isCurrentUserAuthorizedForFinancials() 
      : (typeof hasPermissionForAction === "function" && pos && pos.currentUser ? hasPermissionForAction(pos.currentUser, "VIEW_FINANCIALS") : true);
    
    if (!isAuth) {
      if (typeof requestSupervisorAuth === "function") {
        requestSupervisorAuth("VIEW_FINANCIALS", () => {
          _doSwitchTab("tab-reports");
        }, "Otorisasi Diperlukan: Akses Menu Laporan Penjualan & Keuangan Toko membutuhkan otorisasi Supervisor / Pejabat Toko.");
        return;
      } else {
        alert("Akses ditolak: Anda tidak memiliki hak otorisasi untuk melihat laporan keuangan.");
        return;
      }
    }
  }

  _doSwitchTab(tabId);
}

function _doSwitchTab(tabId) {
  const tabs = ["tab-pos", "tab-inventory", "tab-reports", "tab-settings"];
  tabs.forEach(t => {
    const el = document.getElementById(t);
    const navBtn = document.getElementById(`nav-${t}`);
    const mobKey = t.replace('tab-', '');
    const mobBtn = document.getElementById(`mob-nav-${mobKey}`);

    if (el) el.classList.toggle("hidden", t !== tabId);
    if (navBtn) {
      navBtn.classList.toggle("bg-alfa-yellow", t === tabId);
      navBtn.classList.toggle("text-slate-900", t === tabId);
      navBtn.classList.toggle("text-white", t !== tabId);
    }
    if (mobBtn) {
      mobBtn.classList.toggle("text-yellow-400", t === tabId);
      mobBtn.classList.toggle("text-slate-400", t !== tabId);
    }
  });

  const footerSettingBtn = document.getElementById("btn-footer-settings");
  if (footerSettingBtn) {
    const isSetting = tabId === "tab-settings";
    footerSettingBtn.classList.toggle("bg-amber-500", isSetting);
    footerSettingBtn.classList.toggle("text-slate-950", isSetting);
    footerSettingBtn.classList.toggle("ring-2", isSetting);
    footerSettingBtn.classList.toggle("ring-amber-300", isSetting);
  }

  const mobBottomBar = document.getElementById("pos-mobile-bottom-bar");
  if (mobBottomBar) {
    mobBottomBar.classList.toggle("hidden", tabId !== "tab-pos");
  }

  if (tabId === "tab-pos") {
    renderPosCart();
    // Biarkan keyboard tetap tersembunyi; kasir cukup klik kolom jika ingin mengetik manual
  }
  if (tabId === "tab-inventory") renderInventoryTable();
  if (tabId === "tab-reports") renderReports();
  if (tabId === "tab-settings") {
    loadSettingsToForm();
    renderEmployeeTable();
  }

  // Scroll to top smoothly on tab switch
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==========================================
// 7. KEYBOARD SHORTCUTS KASIR RETAIL MINIMARKET (F1 - F10 & ESC)
// F1: Cari Produk, F2: Scan Barcode, F3: Retur Struk, F4: Pending/Unpending, F5: Void,
// F6: Stock Opname, F7: Mutasi LPB, F8: Klerk Closing Shift, F9: Sync, F10: Laporan, ESC: Batal
// ==========================================
function setupKeyboardShortcuts() {
  window.addEventListener("keydown", (e) => {
    // Jika modal aktivasi lisensi, duplikasi aplikasi, atau setup akun perdana terbuka, jangan tangkap shortcut
    const activationModal = document.getElementById("modal-activation-lock");
    if (activationModal && !activationModal.classList.contains("hidden")) {
      return;
    }
    const duplicateModal = document.getElementById("modal-duplicate-instance");
    if (duplicateModal && !duplicateModal.classList.contains("hidden")) {
      return;
    }
    const setupModal = document.getElementById("modal-first-time-setup");
    if (setupModal && !setupModal.classList.contains("hidden")) {
      return;
    }

    const key = e.key;
    const code = e.code;

    if (key === "Escape" || code === "Escape") {
      const sisDrawer = document.getElementById('sis-drawer');
      if (sisDrawer && !sisDrawer.classList.contains('translate-x-full')) {
        if (typeof toggleSisDrawer === 'function') toggleSisDrawer();
        return;
      }
      const loginModal = document.getElementById("modal-employee-login");
      if (loginModal && !loginModal.classList.contains("hidden") && !pos.currentUser) {
        return; // Jangan tutup modal login saat kasir terkunci / belum login
      }
      closeAllModals();
      return;
    }

    // Shortcut Alt+C untuk buka Scanner Barcode Kamera Kasir
    if ((e.altKey && (key === "c" || key === "C")) || (e.ctrlKey && (key === "b" || key === "B"))) {
      e.preventDefault();
      openPosCameraScanner();
      return;
    }

    if (key === "F1" || code === "F1") {
      e.preventDefault();
      openFindProductModal();
      return;
    }

    if (key === "F2" || code === "F2") {
      e.preventDefault();
      focusBarcodeScanner();
      return;
    }

    if (key === "F3" || code === "F3") {
      e.preventDefault();
      openReturModal();
      return;
    }

    if (key === "F4" || code === "F4") {
      e.preventDefault();
      togglePendingCart();
      return;
    }

    if (key === "F5" || code === "F5") {
      e.preventDefault();
      voidSelectedItem();
      return;
    }

    if (key === "F6" || code === "F6") {
      e.preventDefault();
      openStockOpnameModal();
      return;
    }

    if (key === "F7" || code === "F7") {
      e.preventDefault();
      openMutationModal();
      return;
    }

    if (key === "F8" || code === "F8") {
      e.preventDefault();
      openKlerkModal();
      return;
    }

    if ((key === "End" || (e.ctrlKey && key === "Enter")) && pos.cart.length > 0) {
      e.preventDefault();
      openCheckoutModal();
      return;
    }

    if (key === "F9" || code === "F9") {
      e.preventDefault();
      syncToSupabase(false);
      return;
    }

    if (key === "F10" || code === "F10") {
      e.preventDefault();
      switchTab("tab-reports");
      return;
    }

    // ==========================================
    // HARDWARE SCANNER AUTO-DETECT (BUFFER INTERCEPTOR)
    // Otomatis mengenali tembakan scanner barcode fisik (USB/Wireless/Bluetooth)
    // sekalipun kursor kasir tidak sedang fokus di kotak input!
    // ==========================================
    const activeEl = document.activeElement;
    const isSpecialInput = activeEl && (
      (activeEl.tagName === "INPUT" && activeEl.id !== "pos-barcode-search" && activeEl.id !== "scanner-test-input") ||
      activeEl.tagName === "TEXTAREA" ||
      activeEl.isContentEditable
    );

    if (isSpecialInput) {
      globalScannerBuffer = "";
      return;
    }

    const currentTime = Date.now();
    const timeDelta = currentTime - lastKeyScanTime;
    lastKeyScanTime = currentTime;

    if (key === "Enter") {
      clearTimeout(window._scannerAutoEnterTimer);
      if (globalScannerBuffer.length >= 3) {
        const barcodeScanned = globalScannerBuffer.trim();
        globalScannerBuffer = "";

        // Jika modal tes scanner terbuka, arahkan ke pengujian
        const testModal = document.getElementById("modal-scanner-test");
        if (testModal && !testModal.classList.contains("hidden")) {
          e.preventDefault();
          handleScannerTestResult(barcodeScanned, timeDelta);
          return;
        }

        // Jika sedang di tab POS kasir
        const tabPos = document.getElementById("tab-pos");
        if (tabPos && !tabPos.classList.contains("hidden")) {
          e.preventDefault();
          processScannedBarcode(barcodeScanned);
          return;
        }
      } else {
        globalScannerBuffer = "";
      }
      return;
    }

    // Tangkap karakter cetak tunggal
    if (key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      // Kecepatan scanner barcode hardware biasanya 10-45ms per karakter
      if (timeDelta > 95 && globalScannerBuffer.length > 0 && activeEl?.id !== "pos-barcode-search" && activeEl?.id !== "scanner-test-input") {
        globalScannerBuffer = "";
      }
      globalScannerBuffer += key;

      clearTimeout(window._scannerBufferResetTimer);
      window._scannerBufferResetTimer = setTimeout(() => {
        globalScannerBuffer = "";
      }, 250);

      // SCANNER AUTO-ENTER: Langsung tambahkan produk ke keranjang belanja
      // seketika scanner hardware selesai mengirim burst angka (jeda 130ms),
      // sehingga tidak perlu konfigurasi Carriage Return / Enter fisik pada scanner!
      if (pos.settings.scannerAutoEnter !== false) {
        clearTimeout(window._scannerAutoEnterTimer);
        window._scannerAutoEnterTimer = setTimeout(() => {
          if (globalScannerBuffer.length >= 3) {
            const barcodeScanned = globalScannerBuffer.trim();
            globalScannerBuffer = "";

            const testModal = document.getElementById("modal-scanner-test");
            if (testModal && !testModal.classList.contains("hidden")) {
              handleScannerTestResult(barcodeScanned, 30);
              return;
            }

            const tabPos = document.getElementById("tab-pos");
            if (tabPos && !tabPos.classList.contains("hidden")) {
              processScannedBarcode(barcodeScanned);
            }
          }
        }, 130);
      }
    }
  });

  // Listener langsung pada kotak input barcode kasir (Enter & Auto-Enter Input)
  const barcodeInput = document.getElementById("pos-barcode-search");
  if (barcodeInput) {
    barcodeInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        clearTimeout(window._barcodeInputAutoTimer);
        const code = barcodeInput.value.trim();
        if (!code) return;
        processScannedBarcode(code);
      }
    });

    // Otomatis deteksi ketika scanner menembak langsung ke input box
    barcodeInput.addEventListener("input", () => {
      if (pos.settings.scannerAutoEnter === false) return;
      const val = barcodeInput.value.trim();
      if (!val) return;

      // 1. Cek kecocokan persis barcode/ID (instant match saat digit terakhir scanner masuk)
      const exactMatch = pos.products.find(p => p.barcode === val || p.id.toLowerCase() === val.toLowerCase());
      if (exactMatch && val.length >= 4) {
        clearTimeout(window._barcodeInputAutoTimer);
        processScannedBarcode(val);
        return;
      }

      // 2. Debounce cepat (180ms) jika scanner hardware mengetik cepat tanpa akhiran Enter
      clearTimeout(window._barcodeInputAutoTimer);
      window._barcodeInputAutoTimer = setTimeout(() => {
        const currentVal = barcodeInput.value.trim();
        if (currentVal.length >= 3) {
          const match = pos.products.find(p => p.barcode === currentVal || p.id.toLowerCase() === currentVal.toLowerCase());
          if (match) {
            processScannedBarcode(currentVal);
          }
        }
      }, 180);
    });
  }

  // Listener langsung pada kotak input uji coba scanner
  const testInput = document.getElementById("scanner-test-input");
  if (testInput) {
    testInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        clearTimeout(window._testInputAutoTimer);
        const val = testInput.value.trim();
        if (val) {
          handleScannerTestResult(val);
        }
      }
    });

    testInput.addEventListener("input", () => {
      if (pos.settings.scannerAutoEnter === false) return;
      clearTimeout(window._testInputAutoTimer);
      window._testInputAutoTimer = setTimeout(() => {
        const val = testInput.value.trim();
        if (val.length >= 3) {
          handleScannerTestResult(val, 30);
        }
      }, 180);
    });
  }
}

// Live Digital Clock (Jam & Tanggal Real-Time Vertikal)
function updateLiveClock() {
  const dateEl = document.getElementById("live-date");
  const clockEl = document.getElementById("live-clock");
  const mobileClockEl = document.getElementById("mobile-live-clock");
  const now = new Date();
  const dateStr = now.toLocaleDateString("id-ID", {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
  });
  const timeStr = now.toLocaleTimeString("id-ID");
  if (dateEl) dateEl.textContent = dateStr;
  if (clockEl) {
    if (!dateEl) clockEl.textContent = `${dateStr} • ${timeStr}`;
    else clockEl.textContent = timeStr;
  }
  if (mobileClockEl) {
    mobileClockEl.textContent = timeStr;
  }
}

// Jalankan jam segera agar tidak pernah tertunda / hanya titik-titik
updateLiveClock();
setInterval(updateLiveClock, 1000);

// ============================================================
// SINGLE-INSTANCE GUARD (MENCEGAH BANYAK JENDELA/TAB TERBUKA BERSAMAAN)
// ============================================================
const APP_INSTANCE_LOCK_NAME = 'snack_pos_primary_instance_lock';
let isAppPrimaryInstance = false;
let appInstanceRelease = null;
let appInstanceChannel = null;
let originalDocumentTitle = document.title || "SnackPOS - Kasir Minimarket";

function initSingleInstanceGuard() {
  // 1. PWA LaunchQueue Consumer (ketika shortcut desktop / taskbar diklik saat app sudah running)
  if ('launchQueue' in window && typeof window.launchQueue.setConsumer === 'function') {
    try {
      window.launchQueue.setConsumer((launchParams) => {
        showToast("ℹ️ Aplikasi Kasir sudah aktif dibuka di jendela ini.", "info", 4500);
        if (typeof sfx !== 'undefined' && sfx.beep) sfx.beep();
        flashActiveWindowIndicator();
        const input = document.getElementById("pos-barcode-search");
        if (input) input.focus();
      });
    } catch (e) {
      console.warn("launchQueue warning:", e);
    }
  }

  // 2. BroadcastChannel untuk komunikasi antar tab / jendela browser
  try {
    if ('BroadcastChannel' in window) {
      appInstanceChannel = new BroadcastChannel('snack_pos_instance_channel');
      appInstanceChannel.onmessage = (event) => {
        const data = event.data;
        if (!data) return;

        if (data.type === 'PING_EXISTING') {
          if (isAppPrimaryInstance) {
            appInstanceChannel.postMessage({ type: 'EXISTING_RUNNING' });
            flashActiveWindowIndicator();
            showToast("ℹ️ Shortcut/tab baru mencoba dibuka. Sesi kasir tetap aktif di jendela ini.", "info", 5000);
          }
        } else if (data.type === 'FOCUS_REQUEST') {
          if (isAppPrimaryInstance) {
            flashActiveWindowIndicator();
            showToast("🔔 Jendela kasir ini adalah sesi utama yang sedang aktif!", "warning", 5000);
          }
        } else if (data.type === 'TAKEOVER_SESSION') {
          if (isAppPrimaryInstance) {
            isAppPrimaryInstance = false;
            if (appInstanceRelease) {
              appInstanceRelease();
              appInstanceRelease = null;
            }
            showDuplicateInstanceModal(true);
          }
        }
      };
    }
  } catch (e) {
    console.warn("BroadcastChannel init warning:", e);
  }

  // 3. Web Locks API (standar Chrome/Chromium PWA)
  if ('locks' in navigator && typeof navigator.locks.request === 'function') {
    navigator.locks.request(APP_INSTANCE_LOCK_NAME, { ifAvailable: true }, async (lock) => {
      if (!lock) {
        // Lock tidak didapat = Ada jendela / tab lain yang sedang aktif!
        isAppPrimaryInstance = false;
        showDuplicateInstanceModal(false);
        if (appInstanceChannel) {
          appInstanceChannel.postMessage({ type: 'PING_EXISTING' });
        }
        return;
      }

      // Berhasil mendapatkan lock = Ini adalah jendela utama
      isAppPrimaryInstance = true;
      await new Promise((resolve) => {
        appInstanceRelease = resolve;
        window.addEventListener('beforeunload', resolve);
      });
    });
  } else {
    // Fallback sederhana berbasis storage timestamp untuk browser tanpa Web Locks
    initStorageHeartbeatFallback();
  }
}

function initStorageHeartbeatFallback() {
  const currentTabId = "tab_" + Math.random().toString(36).substr(2, 9);
  const now = Date.now();
  const lastHeartbeat = parseInt(localStorage.getItem("snack_pos_active_heartbeat") || "0");
  
  if (now - lastHeartbeat < 4000) {
    isAppPrimaryInstance = false;
    showDuplicateInstanceModal(false);
    return;
  }

  isAppPrimaryInstance = true;
  localStorage.setItem("snack_pos_active_heartbeat", now.toString());
  localStorage.setItem("snack_pos_active_tab_id", currentTabId);

  setInterval(() => {
    if (isAppPrimaryInstance) {
      localStorage.setItem("snack_pos_active_heartbeat", Date.now().toString());
    }
  }, 2500);

  window.addEventListener("storage", (e) => {
    if (e.key === "snack_pos_active_tab_id" && e.newValue !== currentTabId && isAppPrimaryInstance) {
      isAppPrimaryInstance = false;
      showDuplicateInstanceModal(true);
    }
  });
}

function flashActiveWindowIndicator() {
  if (typeof sfx !== 'undefined' && sfx.beep) sfx.beep();
  const baseTitle = originalDocumentTitle;
  document.title = "🔔 [KASIR AKTIF DI SINI] - " + baseTitle;
  setTimeout(() => {
    document.title = baseTitle;
  }, 4000);
}

function showDuplicateInstanceModal(wasTakenOver = false) {
  const modal = document.getElementById("modal-duplicate-instance");
  const headlineEl = document.getElementById("duplicate-instance-headline");
  const messageEl = document.getElementById("duplicate-instance-message");
  if (!modal) return;

  if (headlineEl) {
    headlineEl.textContent = wasTakenOver 
      ? "Sesi Kasir Dialihkan ke Jendela Lain" 
      : "Aplikasi Kasir Sudah Berjalan di Jendela Lain";
  }
  if (messageEl) {
    messageEl.textContent = wasTakenOver
      ? "Sesi kasir utama telah diambil alih oleh jendela/tab kasir lain. Jendela ini dinonaktifkan untuk menjaga keamanan data dan integritas stok."
      : "Aplikasi Kasir SnackPOS sudah aktif berjalan di jendela atau tab lain pada komputer ini. Untuk mencegah duplikasi transaksi dan selisih stok kasir, silakan gunakan jendela yang sudah terbuka tersebut.";
  }

  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function switchToExistingInstance() {
  if (appInstanceChannel) {
    appInstanceChannel.postMessage({ type: 'FOCUS_REQUEST' });
  }
  showToast("Jendela kasir aktif telah diberi sinyal 🔔. Silakan klik jendela kasir tersebut di taskbar Anda.", "info", 5000);
}

function closeCurrentDuplicateTab() {
  try {
    window.close();
  } catch (e) {}

  const btn = document.getElementById("btn-close-duplicate-tab");
  if (btn) {
    btn.innerHTML = "<span>✕</span><span>Silakan tutup tab ini (Tekan Ctrl + W)</span>";
    btn.classList.add("bg-rose-100", "text-rose-800");
  }
}

function takeOverSessionHere() {
  if (appInstanceChannel) {
    appInstanceChannel.postMessage({ type: 'TAKEOVER_SESSION' });
  }
  const modal = document.getElementById("modal-duplicate-instance");
  if (modal) modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  isAppPrimaryInstance = true;
  showToast("✅ Sesi kasir utama berhasil dialihkan ke jendela ini.", "success");
  if (typeof sfx !== 'undefined' && sfx.success) sfx.success();
}

// ==========================================
// MODUL KELUAR / TUTUP KASIR (EXIT HANDLER)
// ==========================================
function openExitModal() {
  if (typeof openModal === "function") {
    openModal("modal-confirm-exit");
  } else {
    handleExitApp();
  }
}

function handleExitApp() {
  // Simpan keranjang kasir jika ada item
  if (typeof pos !== 'undefined' && pos && typeof pos.saveActiveCart === 'function') {
    try { pos.saveActiveCart(); } catch(e) {}
  }

  if (typeof closeModal === "function") {
    closeModal("modal-confirm-exit");
  }

  const exitScreen = document.getElementById("screen-app-exited");
  if (exitScreen) {
    exitScreen.classList.remove("hidden");
  }

  // Coba tutup tab / jendela browser
  try {
    window.open('', '_self', '');
    window.close();
  } catch (e) {}
}

function reopenCashierSession() {
  const exitScreen = document.getElementById("screen-app-exited");
  if (exitScreen) {
    exitScreen.classList.add("hidden");
  }
  if (typeof switchTab === "function") {
    switchTab("tab-pos");
  }
  if (typeof showToast === "function") {
    showToast("Sesi kasir berhasil dibuka kembali.", "success");
  }
}

// Inisialisasi Aplikasi Kasir
function initApp() {
  try { initSingleInstanceGuard(); } catch (e) { console.error("Error initSingleInstanceGuard:", e); }
  updateLiveClock();

  try { checkLicenseOnStartup(); } catch (e) { console.error("Error checkLicense:", e); }
  try { renderEmployeeHeader(); } catch (e) { console.error("Error renderEmployeeHeader:", e); }
  try { renderEmployeeTable(); } catch (e) { console.error("Error renderEmployeeTable:", e); }
  try { renderAttendanceTable(); } catch (e) { console.error("Error renderAttendanceTable:", e); }
  try { renderPosCart(); } catch (e) { console.error("Error renderPosCart:", e); }
  try { updatePendingUI(); } catch (e) { console.error("Error updatePendingUI:", e); }
  try { loadSettingsToForm(); } catch (e) { console.error("Error loadSettingsToForm:", e); }
  try { setupKeyboardShortcuts(); } catch (e) { console.error("Error setupKeyboardShortcuts:", e); }
  try { initSupabase(); } catch (e) { console.error("Error initSupabase:", e); }
  try { startAutoSyncTimer(); } catch (e) { console.error("Error startAutoSyncTimer:", e); }
  try { renderReturnsHistoryTable(); } catch (e) { console.error("Error renderReturnsHistoryTable:", e); }
  try { renderStockOpnameHistoryTable(); } catch (e) { console.error("Error renderStockOpnameHistoryTable:", e); }
  try { renderKlerkHistoryTable(); } catch (e) { console.error("Error renderKlerkHistoryTable:", e); }
  try { initUniversalPrinterDriver(); } catch (e) { console.error("Error initUniversalPrinterDriver:", e); }

  // Alur Inisialisasi Akun Kasir:
  // 1. Jika aplikasi belum berlisensi, jangan buka modal setup/login dulu!
  //    Biarkan modal-activation-lock aktif di layar agar pengguna menyelesaikan aktivasi lisensi / trial 7 hari.
  if (typeof isAppLicensed === "function" && !isAppLicensed()) {
    return;
  }

  // 2. Jika sudah berlisensi, buka form setup COS perdana atau login kasir
  if (typeof checkAndOpenPostLicenseSetup === "function") {
    checkAndOpenPostLicenseSetup();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
