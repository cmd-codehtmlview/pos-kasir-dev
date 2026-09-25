/**
 * SnackPOS - Employee Login, Roles & Supervisor Auth
 */

// ==========================================
// 10. SISTEM LOGIN KARYAWAN & OTORISASI SUPERVISOR (RETAIL MINIMARKET ROLE)
// COS (Chief of Store), ACOS (Asst. Chief of Store), CREW (Kasir)
// ==========================================
let pendingSupervisorCallback = null;

function renderEmployeeHeader() {
  const badgeEl = document.getElementById("header-user-badge");
  const infoEl = document.getElementById("header-user-info");
  const shiftEl = document.getElementById("header-shift-info");

  const hour = new Date().getHours();
  const defaultShift = (hour >= 6 && hour < 14) ? "Shift 1 (Pagi)" : (hour >= 14 && hour < 22) ? "Shift 2 (Siang)" : "Shift 3 (Malam)";

  if (pos.currentUser) {
    const u = pos.currentUser;
    if (badgeEl) {
      badgeEl.textContent = u.role;
      if (u.role === "COS") {
        badgeEl.className = "px-1.5 py-0.5 rounded bg-red-600 text-white font-black text-[9px] uppercase tracking-wider shadow-xs";
      } else if (u.role === "ACOS") {
        badgeEl.className = "px-1.5 py-0.5 rounded bg-blue-600 text-white font-black text-[9px] uppercase tracking-wider shadow-xs";
      } else {
        badgeEl.className = "px-1.5 py-0.5 rounded bg-emerald-600 text-white font-black text-[9px] uppercase tracking-wider shadow-xs";
      }
    }
    if (infoEl) {
      infoEl.textContent = `${u.nik} • ${u.name}`;
    }
    if (shiftEl) {
      shiftEl.textContent = u.shift || pos.settings.shiftName || defaultShift;
    }
  } else {
    if (badgeEl) {
      badgeEl.textContent = "TERKUNCI";
      badgeEl.className = "px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-bold text-[9px] uppercase";
    }
    if (infoEl) {
      infoEl.textContent = "Belum Login Kasir";
    }
    if (shiftEl) {
      shiftEl.textContent = "-";
    }
  }

  // Singkronkan info preview di form Setting jika ada
  const activeUserPreview = document.getElementById("setting-active-user-preview");
  if (activeUserPreview) {
    if (pos.currentUser) {
      activeUserPreview.textContent = `${pos.currentUser.nik} • ${pos.currentUser.name} (${pos.currentUser.shift || pos.settings.shiftName || defaultShift})`;
    } else {
      activeUserPreview.textContent = "Belum Ada Kasir Login (Terkunci)";
    }
  }

  updateDashboardButtonState();
}

function handleEmployeeLogin(event) {
  if (event && event.preventDefault) event.preventDefault();

  const nik = document.getElementById("login-employee-nik")?.value.trim();
  const pin = document.getElementById("login-employee-pin")?.value.trim();
  const errEl = document.getElementById("login-error-msg");

  const emp = (pos.employees || []).find(e => e.nik === nik);
  if (!emp) {
    if (errEl) {
      errEl.textContent = `NIK "${nik}" tidak ditemukan di database karyawan toko!`;
      errEl.classList.remove("hidden");
    }
    sfx.warning();
    return;
  }

  if (emp.pin !== pin) {
    if (errEl) {
      errEl.textContent = "PIN keamanan salah! Masukkan PIN yang sesuai.";
      errEl.classList.remove("hidden");
    }
    sfx.warning();
    return;
  }

  // ========================================================
  // SINGLE CASHIER SHIFT LOCK (GEMBOK KASIR STANDAR RETAIL)
  // Satu kasir yang sedang aktif tidak boleh login/diganti dengan NIK lain
  // sebelum NIK pertama menyelesaikan Klerk [F8] (Closing Shift)
  // ========================================================
  const activeShiftCashier = localStorage.getItem("snack_pos_active_shift_cashier");
  if (activeShiftCashier && activeShiftCashier !== emp.nik) {
    // Periksa apakah kasir sebelumnya benar-benar sudah melakukan transaksi (ada uang di laci)
    const unklerkedTrx = typeof getUnklerkedTransactionsForCashier === "function"
      ? getUnklerkedTransactionsForCashier({ nik: activeShiftCashier })
      : [];
    const unklerkedReturns = typeof getUnklerkedReturnsForCashier === "function"
      ? getUnklerkedReturnsForCashier({ nik: activeShiftCashier })
      : [];

    if (unklerkedTrx.length === 0 && unklerkedReturns.length === 0) {
      // Kasir sebelumnya BELUM pernah bertransaksi sama sekali!
      // Bebas langsung berganti ke NIK kasir baru tanpa perlu transaksi & tanpa perlu Klerk
      localStorage.setItem("snack_pos_active_shift_cashier", emp.nik);
    } else {
      // Kasir sebelumnya SUDAH MELAKUKAN TRANSAKSI!
      // Wajib Klerk terlebih dahulu untuk pertanggungjawaban uang fisik di laci,
      // kecuali di-override oleh Pejabat Toko (COS / ACOS)
      if (emp.role === "COS" || emp.role === "ACOS") {
        const activeEmp = (pos.employees || []).find(e => e.nik === activeShiftCashier);
        const activeName = activeEmp ? activeEmp.name : activeShiftCashier;
        const confirmOverride = confirm(
          `⚠️ PERINGATAN: SHIFT MASIH AKTIF UNTUK KASIR LAIN!\n\n` +
          `Terminal kasir ini sedang aktif dan memiliki transaksi atas nama:\n` +
          `• NIK: ${activeShiftCashier}\n` +
          `• Nama: ${activeName}\n\n` +
          `Sebagai Pejabat Toko ${emp.role} (${emp.name}), apakah Anda ingin melakukan OVERRIDE DARURAT untuk mengambil alih kasir ini?`
        );
        if (!confirmOverride) {
          return;
        }
        localStorage.setItem("snack_pos_active_shift_cashier", emp.nik);
        if (typeof showToast === "function") {
          showToast(`⚡ Override Shift oleh ${emp.role} (${emp.name})`, "info");
        }
      } else {
        const activeEmp = (pos.employees || []).find(e => e.nik === activeShiftCashier);
        const activeName = activeEmp ? activeEmp.name : activeShiftCashier;
        if (errEl) {
          errEl.textContent = `Shift kasir masih aktif dan memiliki transaksi untuk ${activeName} (NIK: ${activeShiftCashier})! Kasir tersebut wajib Klerk [F8] terlebih dahulu sebelum berganti NIK. Hubungi COS/ACOS jika perlu alih tugas darurat.`;
          errEl.classList.remove("hidden");
        }
        sfx.warning();
        return;
      }
    }
  } else {
    localStorage.setItem("snack_pos_active_shift_cashier", emp.nik);
  }

  const hour = new Date().getHours();
  const defaultShift = (hour >= 6 && hour < 14) ? "Shift 1 (Pagi)" : (hour >= 14 && hour < 22) ? "Shift 2 (Siang)" : "Shift 3 (Malam)";
  const selectedShift = document.getElementById("login-employee-shift")?.value || emp.shift || defaultShift;
  emp.shift = selectedShift;

  // Catat riwayat absensi masuk karyawan
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toLocaleTimeString("id-ID");
  if (!pos.attendance) pos.attendance = [];
  const attRecord = {
    id: `ABS-${dateStr.replace(/-/g, "")}-${emp.nik}-${Date.now().toString().slice(-4)}`,
    date: dateStr,
    time: timeStr,
    nik: emp.nik,
    name: emp.name,
    role: emp.role,
    shift: selectedShift,
    type: "MASUK"
  };
  pos.attendance.unshift(attRecord);
  pos.saveAttendance();

  financialsTempUnlocked = false; // Reset unlock sementara saat login kasir baru
  if (errEl) errEl.classList.add("hidden");
  pos.saveCurrentUser(emp);
  pos.settings.cashierName = emp.name;
  pos.settings.shiftName = selectedShift;
  pos.saveSettings();

  renderEmployeeHeader();
  renderAttendanceTable();
  if (typeof renderReports === "function") renderReports();
  if (typeof renderInventoryTable === "function") renderInventoryTable();
  closeModal("modal-employee-login");

  // Restore & render keranjang belanja aktif jika ada transaksi yang belum selesai
  if (typeof renderPosCart === "function") {
    try {
      renderPosCart();
      if (pos.cart && pos.cart.length > 0) {
        showToast(`Melanjutkan transaksi sebelumnya: ${pos.cart.length} item aktif di keranjang! 🛒`, "info", 5000);
      }
    } catch (e) {}
  }

  showToast(`Absen Masuk Berhasil! Selamat bertugas, ${emp.role} - ${emp.name} (${selectedShift})!`, "success");
  sfx.success();
}

function handleFirstTimeSetup(event) {
  if (event && event.preventDefault) event.preventDefault();

  const name = document.getElementById("setup-cos-name")?.value.trim();
  const nik = document.getElementById("setup-cos-nik")?.value.trim();
  const phone = document.getElementById("setup-cos-phone")?.value.trim() || "-";
  const shift = document.getElementById("setup-cos-shift")?.value || "Shift 1";
  const pin = document.getElementById("setup-cos-pin")?.value.trim();
  const pinConfirm = document.getElementById("setup-cos-pin-confirm")?.value.trim();
  const errEl = document.getElementById("setup-cos-error-msg");

  if (!name || !nik || !pin || !pinConfirm) {
    if (errEl) {
      errEl.textContent = "Harap lengkapi semua kolom wajib bertanda bintang (*)!";
      errEl.classList.remove("hidden");
      errEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    sfx.warning();
    return;
  }

  if (pin.length < 4) {
    if (errEl) {
      errEl.textContent = "PIN keamanan minimal harus 4 digit angka!";
      errEl.classList.remove("hidden");
      errEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    sfx.warning();
    return;
  }

  if (pin !== pinConfirm) {
    if (errEl) {
      errEl.textContent = "Konfirmasi PIN tidak cocok dengan PIN baru!";
      errEl.classList.remove("hidden");
      errEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    sfx.warning();
    return;
  }

  // Akun COS Perdana: Mendapatkan seluruh 8 hak akses otorisasi penuh
  const cosEmployee = {
    nik: nik,
    name: name,
    role: "COS",
    pin: pin,
    shift: shift,
    phone: phone,
    canVoid: true,
    canRetur: true,
    canStockOpname: true,
    canBlindKlerk: true,
    canViewFinancials: true,
    canManageEmployees: true,
    canManageProducts: true,
    canStockMutation: true
  };

  pos.employees = [cosEmployee];
  pos.saveEmployees();

  // Catat absensi perdana
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toLocaleTimeString("id-ID");
  if (!pos.attendance) pos.attendance = [];
  pos.attendance.unshift({
    id: `ABS-${dateStr.replace(/-/g, "")}-${cosEmployee.nik}-01`,
    date: dateStr,
    time: timeStr,
    nik: cosEmployee.nik,
    name: cosEmployee.name,
    role: cosEmployee.role,
    shift: shift,
    type: "MASUK"
  });
  pos.saveAttendance();

  // Login otomatis sebagai COS baru
  localStorage.setItem("snack_pos_active_shift_cashier", cosEmployee.nik);
  pos.saveCurrentUser(cosEmployee);
  pos.settings.cashierName = cosEmployee.name;
  pos.settings.cashierNik = cosEmployee.nik;
  pos.settings.shiftName = shift;
  pos.saveSettings();

  financialsTempUnlocked = false;
  if (errEl) errEl.classList.add("hidden");

  closeModal("modal-first-time-setup");
  renderEmployeeHeader();
  renderEmployeeTable();
  renderAttendanceTable();
  if (typeof renderReports === "function") renderReports();
  if (typeof renderInventoryTable === "function") renderInventoryTable();

  showToast(`🎉 Selamat Datang! Akun COS ${cosEmployee.name} (${cosEmployee.nik}) aktif. Terminal kasir siap digunakan.`, "success", 6000);
  sfx.success();

  if (document.activeElement && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur();
  }
}

function lockCashierScreen() {
  financialsTempUnlocked = false;
  pos.saveCurrentUser(null);
  renderEmployeeHeader();
  if (typeof renderReports === "function") renderReports();
  if (typeof renderInventoryTable === "function") renderInventoryTable();

  if (!pos.employees || pos.employees.length === 0) {
    openModal("modal-first-time-setup");
    setTimeout(() => {
      const nameInput = document.getElementById("setup-cos-name");
      if (nameInput) nameInput.focus();
    }, 150);
    return;
  }

  openModal("modal-employee-login");
  const nikInput = document.getElementById("login-employee-nik");
  const pinInput = document.getElementById("login-employee-pin");
  const errEl = document.getElementById("login-error-msg");
  if (nikInput) nikInput.value = "";
  if (pinInput) pinInput.value = "";
  if (errEl) errEl.classList.add("hidden");
  setTimeout(() => nikInput?.focus(), 150);
  showToast("Layar kasir dikunci. Silakan login kembali.", "info");
}

function confirmOrLockCashier() {
  const drawer = document.getElementById("sis-drawer");
  if (drawer && !drawer.classList.contains("translate-x-full")) {
    if (typeof toggleSisDrawer === "function") {
      toggleSisDrawer();
    }
  }
  lockCashierScreen();
}
window.confirmOrLockCashier = confirmOrLockCashier;

// ==========================================
// KONTROL AKSES KEUANGAN & DASHBOARD OWNER (RBAC)
// ==========================================
let financialsTempUnlocked = false;

function isCurrentUserAuthorizedForFinancials() {
  return true;
}

function openOwnerDashboardWithAuth() {
  if (isCurrentUserAuthorizedForFinancials()) {
    try {
      localStorage.setItem("snack_pos_owner_auth_token", Date.now().toString());
    } catch (e) {}
    window.open("owner.html", "_blank");
  } else {
    requestSupervisorAuth("OPEN_OWNER_DASHBOARD", "Otorisasi Akses Portal Dashboard Online Owner (Khusus COS)", (supervisor) => {
      try {
        localStorage.setItem("snack_pos_owner_auth_token", Date.now().toString());
      } catch (e) {}
      showToast(`Akses Dashboard Online diizinkan oleh ${supervisor.name} (${supervisor.role})`, "success");
      window.open("owner.html", "_blank");
    });
  }
}

function toggleFinancialCensorWithAuth() {
  if (financialsTempUnlocked) {
    financialsTempUnlocked = false;
    if (typeof renderReports === "function") renderReports();
    if (typeof renderInventoryTable === "function") renderInventoryTable();
    updateDashboardButtonState();
    showToast("Angka finansial & laba rugi laporan disensor kembali.", "info");
    return;
  }

  if (isCurrentUserAuthorizedForFinancials()) {
    showToast("Akun aktif sudah memiliki izin melihat angka laporan finansial.", "info");
    return;
  }

  requestSupervisorAuth("VIEW_FINANCIALS", "Otorisasi Membuka Sensor Angka Laporan Finansial (Khusus COS)", (supervisor) => {
    financialsTempUnlocked = true;
    if (typeof renderReports === "function") renderReports();
    if (typeof renderInventoryTable === "function") renderInventoryTable();
    updateDashboardButtonState();
    showToast(`Sensor Laporan Finansial dibuka oleh ${supervisor.name} (${supervisor.role})`, "success");
    sfx.success();
  });
}

function updateDashboardButtonState() {
  const isAuth = isCurrentUserAuthorizedForFinancials();

  // Tab Settings
  const btnSettings = document.getElementById("btn-open-owner-dashboard-settings");
  if (btnSettings) {
    if (isAuth) {
      btnSettings.innerHTML = `<span>📊</span><span>Dashboard Online ↗</span>`;
      btnSettings.title = "Buka Dashboard Laporan Pemantauan Online Toko (Multi-Device)";
      btnSettings.className = "px-3 py-1.5 bg-slate-900 hover:bg-black text-amber-300 border border-amber-400/40 rounded-xl text-xs font-black shadow-xs flex items-center gap-1.5 transition-all cursor-pointer";
    } else {
      btnSettings.innerHTML = `<span>🔒</span><span>Dashboard Online</span>`;
      btnSettings.title = "Akses Terbatas: Memerlukan Otorisasi PIN COS/Owner";
      btnSettings.className = "px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-slate-300 border border-slate-700 rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all cursor-pointer";
    }
  }

  // Tab Reports
  const btnReports = document.getElementById("btn-open-owner-dashboard-reports");
  if (btnReports) {
    if (isAuth) {
      btnReports.innerHTML = `<span>📊</span><span>Dashboard Online ↗</span>`;
      btnReports.title = "Buka Dashboard Laporan Pemantauan Online Toko (Multi-Device)";
      btnReports.className = "px-3 py-1.5 sm:py-2 bg-slate-900 hover:bg-black text-amber-300 border border-amber-400/40 rounded-xl text-xs font-black shadow-xs flex items-center gap-1.5 transition-all cursor-pointer";
    } else {
      btnReports.innerHTML = `<span>🔒</span><span>Dashboard Online</span>`;
      btnReports.title = "Akses Terbatas: Memerlukan Otorisasi PIN COS/Owner";
      btnReports.className = "px-3 py-1.5 sm:py-2 bg-slate-800 hover:bg-slate-900 text-slate-300 border border-slate-700 rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all cursor-pointer";
    }
  }

  // Toggle button on Reports
  const btnCensor = document.getElementById("btn-toggle-financial-censor");
  const txtCensor = document.getElementById("btn-toggle-financial-censor-text");
  if (btnCensor && txtCensor) {
    if (isAuth) {
      btnCensor.innerHTML = `<span>🔓</span><span id="btn-toggle-financial-censor-text">${financialsTempUnlocked ? "Kunci Sensor" : "Laporan Terbuka"}</span>`;
      btnCensor.className = "px-3 py-1.5 sm:py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer";
      btnCensor.title = financialsTempUnlocked ? "Klik untuk mengunci kembali sensor angka laporan" : "Anda memiliki izin akses laporan finansial terbuka.";
    } else {
      btnCensor.innerHTML = `<span>🔒</span><span id="btn-toggle-financial-censor-text">Buka Sensor Angka</span>`;
      btnCensor.className = "px-3 py-1.5 sm:py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer";
      btnCensor.title = "Klik untuk memasukkan PIN Pejabat Toko (COS) dan membuka sensor angka laporan";
    }
  }
}

let currentSupervisorActionType = null;

function hasPermissionForAction(user, actionType) {
  if (!user) return true;
  if (actionType === "VOID_ITEM" || actionType === "VOID_CART") {
    return user.canVoid !== undefined ? user.canVoid : (user.role === "COS" || user.role === "ACOS");
  }
  if (actionType === "RETUR_SALE") {
    return user.canRetur !== undefined ? user.canRetur : (user.role === "COS" || user.role === "ACOS");
  }
  if (actionType === "STOCK_OPNAME") {
    return user.canStockOpname !== undefined ? user.canStockOpname : (user.role === "COS" || user.role === "ACOS");
  }
  if (actionType === "BLIND_KLERK") {
    return user.canBlindKlerk !== undefined ? user.canBlindKlerk : true;
  }
  if (actionType === "VIEW_FINANCIALS" || actionType === "OPEN_OWNER_DASHBOARD") {
    return user.canViewFinancials !== undefined ? user.canViewFinancials : (user.role === "COS");
  }
  if (actionType === "MANAGE_EMPLOYEES") {
    return user.canManageEmployees !== undefined ? user.canManageEmployees : (user.role === "COS");
  }
  if (actionType === "MANAGE_PRODUCTS") {
    return user.canManageProducts !== undefined ? user.canManageProducts : (user.role === "COS" || user.role === "ACOS");
  }
  if (actionType === "STOCK_MUTATION") {
    return user.canStockMutation !== undefined ? user.canStockMutation : (user.role === "COS" || user.role === "ACOS");
  }
  return (user.role === "COS" || user.role === "ACOS");
}

function requestSupervisorAuth(actionType, arg2, arg3) {
  let actionDesc = "Tindakan Kasir Dibatasi";
  let onApproved = null;

  if (typeof arg2 === "function") {
    onApproved = arg2;
    if (typeof arg3 === "string") actionDesc = arg3;
  } else if (typeof arg3 === "function") {
    onApproved = arg3;
    if (typeof arg2 === "string") actionDesc = arg2;
  } else if (typeof arg2 === "string") {
    actionDesc = arg2;
  }

  // Jika kasir aktif berstatus COS atau memiliki izin mandiri untuk aksi ini, langsung loloskan
  if (pos.currentUser && (pos.currentUser.role === 'COS' || hasPermissionForAction(pos.currentUser, actionType))) {
    if (typeof onApproved === 'function') {
      onApproved(pos.currentUser);
    }
    return;
  }

  currentSupervisorActionType = actionType;
  pendingSupervisorCallback = onApproved;
  const descEl = document.getElementById("auth-action-description");
  const nikSelect = document.getElementById("auth-supervisor-nik");
  const pinInput = document.getElementById("auth-supervisor-pin");
  const errEl = document.getElementById("auth-error-msg");

  if (descEl) descEl.textContent = actionDesc || "Tindakan Kasir Dibatasi";
  if (pinInput) pinInput.value = "";
  if (errEl) errEl.classList.add("hidden");

  // Isi dropdown pejabat toko secara dinamis
  if (nikSelect) {
    const supervisors = (pos.employees || []).filter(e => e.role === "COS" || e.role === "ACOS");
    let optionsHtml = `<option value="AUTO">⚡ Verifikasi Cepat (Cukup Masukkan PIN Pejabat)</option>`;
    if (supervisors.length > 0) {
      optionsHtml += supervisors.map(s => 
        `<option value="${s.nik}">🛡️ ${s.role} - ${s.name} (NIK: ${s.nik})</option>`
      ).join("");
    }
    nikSelect.innerHTML = optionsHtml;
    // Defaultkan ke supervisor pertama jika ada, atau AUTO
    nikSelect.value = supervisors.length > 0 ? supervisors[0].nik : "AUTO";
  }

  openModal("modal-supervisor-auth");
  setTimeout(() => pinInput?.focus(), 150);
}

function handleSupervisorAuthSubmit(event) {
  if (event && event.preventDefault) event.preventDefault();

  const nik = (document.getElementById("auth-supervisor-nik")?.value || "").trim();
  const pin = (document.getElementById("auth-supervisor-pin")?.value || "").trim();
  const errEl = document.getElementById("auth-error-msg");

  if (!pin) {
    if (errEl) {
      errEl.textContent = "Harap masukkan PIN Pejabat Toko!";
      errEl.classList.remove("hidden");
    }
    sfx.warning();
    return;
  }

  let supervisor = null;
  const employees = Array.isArray(pos.employees) ? pos.employees : [];

  // 1. Jika NIK spesifik dipilih dan bukan "AUTO"
  if (nik && nik !== "AUTO") {
    supervisor = employees.find(e => String(e.nik) === nik);
    if (supervisor) {
      const pinMatches = (
        String(supervisor.pin).trim() === pin ||
        (supervisor.role === "COS" && (
          (pos.settings && (String(pos.settings.supervisorPin).trim() === pin || String(pos.settings.cosPin).trim() === pin)) ||
          pin === "1234"
        ))
      );
      if (!pinMatches) {
        // Cek apakah PIN cocok dengan supervisor COS/ACOS lain di toko
        const altSupervisor = employees.find(e => 
          (e.role === "COS" || e.role === "ACOS") && String(e.pin).trim() === pin
        );
        if (altSupervisor) {
          supervisor = altSupervisor;
        } else {
          if (errEl) {
            errEl.textContent = `PIN Pejabat untuk ${supervisor.name} (${supervisor.role}) salah!`;
            errEl.classList.remove("hidden");
          }
          sfx.warning();
          return;
        }
      }
    }
  }

  // 2. Jika mode AUTO atau NIK tidak ditemukan: cari Pejabat Toko berdasarkan PIN yang dimasukkan
  if (!supervisor) {
    // Cari karyawan Pejabat Toko (COS/ACOS) dengan PIN yang sesuai
    supervisor = employees.find(e => 
      (e.role === "COS" || e.role === "ACOS" || hasPermissionForAction(e, currentSupervisorActionType)) && 
      String(e.pin).trim() === pin
    );

    // Fallback: cek ke setting supervisorPin / cosPin / universal default PIN "1234"
    if (!supervisor) {
      const isSettingsPin = (
        (pos.settings && (String(pos.settings.supervisorPin).trim() === pin || String(pos.settings.cosPin).trim() === pin)) ||
        pin === "1234"
      );
      if (isSettingsPin) {
        supervisor = employees.find(e => e.role === "COS") || employees.find(e => e.role === "ACOS") || {
          nik: "COS-01",
          name: "Kepala Toko (COS)",
          role: "COS",
          canVoid: true,
          canRetur: true,
          canStockOpname: true,
          canBlindKlerk: true,
          canViewFinancials: true,
          canManageEmployees: true,
          canManageProducts: true,
          canStockMutation: true
        };
      }
    }
  }

  if (!supervisor) {
    if (errEl) {
      errEl.textContent = "PIN Pejabat Toko (COS/ACOS) tidak cocok!";
      errEl.classList.remove("hidden");
    }
    sfx.warning();
    return;
  }

  // Cek apakah karyawan pemberi otorisasi memiliki hak akses untuk aksi ini
  if (!hasPermissionForAction(supervisor, currentSupervisorActionType)) {
    if (errEl) {
      errEl.textContent = `User ${supervisor.name} (${supervisor.role}) tidak memiliki izin untuk aksi ini!`;
      errEl.classList.remove("hidden");
    }
    sfx.warning();
    return;
  }

  if (errEl) errEl.classList.add("hidden");
  closeModal("modal-supervisor-auth");

  showToast(`Otorisasi disetujui oleh ${supervisor.role} - ${supervisor.name} ✅`, "success");
  sfx.success();

  if (typeof pendingSupervisorCallback === "function") {
    const cb = pendingSupervisorCallback;
    pendingSupervisorCallback = null;
    cb(supervisor);
  }
}

function cancelSupervisorAuth() {
  pendingSupervisorCallback = null;
  currentSupervisorActionType = null;
  closeModal("modal-supervisor-auth");
  showToast("Otorisasi dibatalkan.", "info");
}

// ==========================================
// 12. MANAJEMEN USER & HAK AKSES KARYAWAN (COS / ACOS / CREW)
// ==========================================

function renderEmployeeTable() {
  const tbody = document.getElementById("employee-list-tbody");
  if (!tbody) return;

  const employees = pos.employees || [];
  if (employees.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-400 text-xs">Belum ada user karyawan terdaftar.</td></tr>`;
    return;
  }

  tbody.innerHTML = employees.map(emp => {
    const isCos = emp.role === "COS";
    const isAcos = emp.role === "ACOS";
    const badgeBg = isCos ? 'bg-red-100 text-red-800 border-red-200' : isAcos ? 'bg-blue-100 text-blue-800 border-blue-200' : 'bg-emerald-100 text-emerald-800 border-emerald-200';

    return `
      <tr class="hover:bg-slate-50 text-xs">
        <td class="py-2.5 px-3">
          <div class="font-bold text-slate-900">${emp.name}</div>
          <div class="text-[10px] font-mono text-slate-400">NIK: ${emp.nik} • ${emp.shift || 'Shift 1'}</div>
        </td>
        <td class="py-2.5 px-3 text-center">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-black border uppercase ${badgeBg}">
            ${emp.role}
          </span>
        </td>
        <td class="py-2.5 px-3 text-center">
          <span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${emp.canVoid ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
            ${emp.canVoid ? '✅ Boleh' : '❌ Dilarang'}
          </span>
        </td>
        <td class="py-2.5 px-3 text-center">
          <span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${emp.canRetur ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
            ${emp.canRetur ? '✅ Boleh' : '❌ Dilarang'}
          </span>
        </td>
        <td class="py-2.5 px-3 text-center">
          <span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${emp.canStockOpname ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
            ${emp.canStockOpname ? '✅ Boleh' : '❌ Dilarang'}
          </span>
        </td>
        <td class="py-2.5 px-3 text-right">
          <div class="flex items-center justify-end gap-1">
            <button 
              type="button" 
              onclick="openEmployeeModal('${emp.nik}')" 
              class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              title="Edit Karyawan"
            >
              ✏️
            </button>
            <button 
              type="button" 
              onclick="deleteEmployee('${emp.nik}')" 
              class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              title="Hapus Karyawan"
            >
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  const badgeEmp = document.getElementById("badge-employees-count");
  if (badgeEmp) badgeEmp.textContent = `${employees.length} Karyawan`;
}

function renderAttendanceTable() {
  const tbody = document.getElementById("attendance-list-tbody");
  if (!tbody) return;

  const records = pos.attendance || [];
  if (records.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-6 text-slate-400 font-medium">
          Belum ada catatan absensi karyawan toko. Masuk kasir dengan NIK & PIN untuk mencatat absensi.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = records.map(r => {
    let roleBadge = 'bg-emerald-100 text-emerald-800 border-emerald-300';
    if (r.role === 'COS') roleBadge = 'bg-red-100 text-red-800 border-red-300';
    if (r.role === 'ACOS') roleBadge = 'bg-blue-100 text-blue-800 border-blue-300';

    let shiftColor = 'bg-amber-100 text-amber-800';
    if (r.shift && r.shift.includes('2')) shiftColor = 'bg-indigo-100 text-indigo-800';
    if (r.shift && r.shift.includes('3')) shiftColor = 'bg-purple-100 text-purple-800';

    return `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="py-2.5 px-3 font-mono text-slate-600">
          <span class="font-bold text-slate-900">${r.date}</span>
          <span class="text-slate-400 text-[10px] ml-1">${r.time}</span>
        </td>
        <td class="py-2.5 px-3 font-mono font-bold text-slate-800">${r.nik}</td>
        <td class="py-2.5 px-3 font-bold text-slate-900">${r.name}</td>
        <td class="py-2.5 px-3 text-center">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-black border ${roleBadge}">${r.role}</span>
        </td>
        <td class="py-2.5 px-3 text-center">
          <span class="px-2 py-0.5 rounded-lg text-[10px] font-bold ${shiftColor}">${r.shift}</span>
        </td>
        <td class="py-2.5 px-3 text-center">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">✅ Hadir</span>
        </td>
      </tr>
    `;
  }).join("");

  const badgeAtt = document.getElementById("badge-attendance-status");
  if (badgeAtt) {
    badgeAtt.textContent = records.length > 0 ? `${records.length} Log Absen` : "Log Presensi";
  }
}

function openEmployeeModal(nik = null) {
  if (!hasPermissionForAction(pos.currentUser, "MANAGE_EMPLOYEES")) {
    requestSupervisorAuth("MANAGE_EMPLOYEES", "Otorisasi Kelola Data & Hak Akses Karyawan (Khusus COS)", () => {
      openEmployeeModal(nik);
    });
    return;
  }

  const title = document.getElementById("employee-modal-title");
  const origNikInput = document.getElementById("emp-form-original-nik");
  const nikInput = document.getElementById("emp-form-nik");
  const nameInput = document.getElementById("emp-form-name");
  const pinInput = document.getElementById("emp-form-pin");
  const roleInput = document.getElementById("emp-form-role");
  const shiftInput = document.getElementById("emp-form-shift");

  const permVoid = document.getElementById("emp-perm-void");
  const permRetur = document.getElementById("emp-perm-retur");
  const permSo = document.getElementById("emp-perm-so");
  const permKlerk = document.getElementById("emp-perm-klerk");
  const permFinancials = document.getElementById("emp-perm-financials");
  const permManageEmp = document.getElementById("emp-perm-manage-emp");
  const permManageProd = document.getElementById("emp-perm-manage-prod");
  const permStockMut = document.getElementById("emp-perm-stock-mut");

  if (nik) {
    const emp = (pos.employees || []).find(e => e.nik === nik);
    if (!emp) return;

    if (title) title.textContent = `Edit Karyawan (${emp.name})`;
    if (origNikInput) origNikInput.value = emp.nik;
    if (nikInput) nikInput.value = emp.nik;
    if (nameInput) nameInput.value = emp.name;
    if (pinInput) pinInput.value = emp.pin || "1234";
    if (roleInput) roleInput.value = emp.role || "CREW";
    if (shiftInput) shiftInput.value = emp.shift || "Shift 1";

    if (permVoid) permVoid.checked = !!emp.canVoid;
    if (permRetur) permRetur.checked = !!emp.canRetur;
    if (permSo) permSo.checked = !!emp.canStockOpname;
    if (permKlerk) permKlerk.checked = emp.canBlindKlerk !== undefined ? !!emp.canBlindKlerk : true;
    if (permFinancials) permFinancials.checked = emp.canViewFinancials !== undefined ? !!emp.canViewFinancials : (emp.role === "COS");
    if (permManageEmp) permManageEmp.checked = emp.canManageEmployees !== undefined ? !!emp.canManageEmployees : (emp.role === "COS");
    if (permManageProd) permManageProd.checked = emp.canManageProducts !== undefined ? !!emp.canManageProducts : (emp.role === "COS" || emp.role === "ACOS");
    if (permStockMut) permStockMut.checked = emp.canStockMutation !== undefined ? !!emp.canStockMutation : (emp.role === "COS" || emp.role === "ACOS");
  } else {
    if (title) title.textContent = "Tambah Karyawan Baru";
    if (origNikInput) origNikInput.value = "";
    if (nikInput) {
      const nextNik = String(1000 + (pos.employees?.length || 0) + 1);
      nikInput.value = nextNik;
    }
    if (nameInput) nameInput.value = "";
    if (pinInput) pinInput.value = "";
    if (roleInput) roleInput.value = "CREW";
    if (shiftInput) shiftInput.value = "Shift 1";

    if (permVoid) permVoid.checked = false;
    if (permRetur) permRetur.checked = false;
    if (permSo) permSo.checked = false;
    if (permKlerk) permKlerk.checked = true;
    if (permFinancials) permFinancials.checked = false;
    if (permManageEmp) permManageEmp.checked = false;
    if (permManageProd) permManageProd.checked = false;
    if (permStockMut) permStockMut.checked = false;
  }

  openModal("modal-employee-form");
  setTimeout(() => nameInput?.focus(), 150);
}

function onEmployeeRoleChange(role) {
  const permVoid = document.getElementById("emp-perm-void");
  const permRetur = document.getElementById("emp-perm-retur");
  const permSo = document.getElementById("emp-perm-so");
  const permKlerk = document.getElementById("emp-perm-klerk");
  const permFinancials = document.getElementById("emp-perm-financials");
  const permManageEmp = document.getElementById("emp-perm-manage-emp");
  const permManageProd = document.getElementById("emp-perm-manage-prod");
  const permStockMut = document.getElementById("emp-perm-stock-mut");

  // Preset otomatis berdasarkan standar peran toko
  if (role === "COS") {
    if (permVoid) permVoid.checked = true;
    if (permRetur) permRetur.checked = true;
    if (permSo) permSo.checked = true;
    if (permKlerk) permKlerk.checked = true;
    if (permFinancials) permFinancials.checked = true;
    if (permManageEmp) permManageEmp.checked = true;
    if (permManageProd) permManageProd.checked = true;
    if (permStockMut) permStockMut.checked = true;
  } else if (role === "ACOS") {
    if (permVoid) permVoid.checked = true;
    if (permRetur) permRetur.checked = true;
    if (permSo) permSo.checked = true;
    if (permKlerk) permKlerk.checked = true;
    if (permFinancials) permFinancials.checked = false;
    if (permManageEmp) permManageEmp.checked = false;
    if (permManageProd) permManageProd.checked = true;
    if (permStockMut) permStockMut.checked = true;
  } else {
    // CREW: Default hanya Klerk Mandiri (Blind View) yang aktif
    if (permVoid) permVoid.checked = false;
    if (permRetur) permRetur.checked = false;
    if (permSo) permSo.checked = false;
    if (permKlerk) permKlerk.checked = true;
    if (permFinancials) permFinancials.checked = false;
    if (permManageEmp) permManageEmp.checked = false;
    if (permManageProd) permManageProd.checked = false;
    if (permStockMut) permStockMut.checked = false;
  }
}

function handleSaveEmployee(event) {
  if (event && event.preventDefault) event.preventDefault();

  if (!hasPermissionForAction(pos.currentUser, "MANAGE_EMPLOYEES")) {
    requestSupervisorAuth("MANAGE_EMPLOYEES", "Otorisasi Simpan Data Karyawan (Khusus COS)", () => {
      handleSaveEmployee(event);
    });
    return;
  }

  const origNik = document.getElementById("emp-form-original-nik")?.value.trim();
  const nik = document.getElementById("emp-form-nik")?.value.trim();
  const name = document.getElementById("emp-form-name")?.value.trim();
  const pin = document.getElementById("emp-form-pin")?.value.trim();
  const role = document.getElementById("emp-form-role")?.value || "CREW";
  const shift = document.getElementById("emp-form-shift")?.value.trim() || "Shift 1";

  const canVoid = !!document.getElementById("emp-perm-void")?.checked;
  const canRetur = !!document.getElementById("emp-perm-retur")?.checked;
  const canStockOpname = !!document.getElementById("emp-perm-so")?.checked;
  const canBlindKlerk = !!document.getElementById("emp-perm-klerk")?.checked;
  const canViewFinancials = !!document.getElementById("emp-perm-financials")?.checked;
  const canManageEmployees = !!document.getElementById("emp-perm-manage-emp")?.checked;
  const canManageProducts = !!document.getElementById("emp-perm-manage-prod")?.checked;
  const canStockMutation = !!document.getElementById("emp-perm-stock-mut")?.checked;

  if (!nik || !name || !pin) {
    showToast("Harap isi NIK, Nama, dan PIN karyawan!", "warning");
    sfx.warning();
    return;
  }

  if (pin.length < 4) {
    showToast("PIN keamanan kasir minimal harus 4 digit angka!", "warning");
    sfx.warning();
    return;
  }

  // Cek duplikasi NIK
  const dup = (pos.employees || []).find(e => e.nik === nik && e.nik !== origNik);
  if (dup) {
    showToast(`NIK ${nik} sudah terdaftar untuk ${dup.name}!`, "error");
    sfx.warning();
    return;
  }

  if (origNik) {
    // Mode Edit
    const emp = pos.employees.find(e => e.nik === origNik);
    if (emp) {
      emp.nik = nik;
      emp.name = name;
      emp.pin = pin;
      emp.role = role;
      emp.shift = shift;
      emp.canVoid = canVoid;
      emp.canRetur = canRetur;
      emp.canStockOpname = canStockOpname;
      emp.canBlindKlerk = canBlindKlerk;
      emp.canViewFinancials = canViewFinancials;
      emp.canManageEmployees = canManageEmployees;
      emp.canManageProducts = canManageProducts;
      emp.canStockMutation = canStockMutation;

      if (pos.currentUser && pos.currentUser.nik === origNik) {
        pos.saveCurrentUser(emp);
        renderEmployeeHeader();
        if (typeof renderReports === "function") renderReports();
        if (typeof renderInventoryTable === "function") renderInventoryTable();
        updateDashboardButtonState();
      }
    }
  } else {
    // Mode Tambah Baru
    pos.employees.push({
      nik,
      name,
      pin,
      role,
      shift,
      canVoid,
      canRetur,
      canStockOpname,
      canBlindKlerk,
      canViewFinancials,
      canManageEmployees,
      canManageProducts,
      canStockMutation
    });
  }

  pos.saveEmployees();
  renderEmployeeTable();
  closeModal("modal-employee-form");
  showToast(`Karyawan "${name}" (${role}) berhasil disimpan!`, "success");
  sfx.success();
}

function deleteEmployee(nik) {
  if (!hasPermissionForAction(pos.currentUser, "MANAGE_EMPLOYEES")) {
    requestSupervisorAuth("MANAGE_EMPLOYEES", "Otorisasi Menghapus Data Karyawan (Khusus COS)", () => {
      deleteEmployee(nik);
    });
    return;
  }

  const emp = (pos.employees || []).find(e => e.nik === nik);
  if (!emp) return;

  if (pos.employees.length <= 1) {
    showToast("Tidak dapat menghapus user terakhir! Minimal harus ada 1 user.", "warning");
    sfx.warning();
    return;
  }

  if (!confirm(`Hapus akun karyawan "${emp.name}" (NIK: ${emp.nik} - ${emp.role})?`)) {
    return;
  }

  pos.employees = pos.employees.filter(e => e.nik !== nik);
  pos.saveEmployees();

  if (pos.currentUser && pos.currentUser.nik === nik) {
    lockCashierScreen();
  }

  renderEmployeeTable();
  showToast(`Karyawan "${emp.name}" berhasil dihapus.`, "info");
}

function toggleCosPinVisibility(inputId, btnEl) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === "password") {
    input.type = "text";
    if (btnEl) btnEl.textContent = "🙈";
  } else {
    input.type = "password";
    if (btnEl) btnEl.textContent = "👁️";
  }
}

