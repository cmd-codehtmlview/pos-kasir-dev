/**
 * SnackPOS - Employee Login, Roles & Supervisor Auth
 */

// ==========================================
// 10. SISTEM LOGIN KARYAWAN & OTORISASI SUPERVISOR (RETAIL MINIMARKET ROLE)
// COS (Chief of Store), ACOS (Asst. Chief of Store), CREW (Kasir)
// ==========================================
let pendingSupervisorCallback = null;

/**
 * Mencari sesi shift kasir aktif yang saat ini memiliki transaksi belum di-Clerk
 */
function findActiveUnklerkedShift() {
  const todayStr = new Date().toISOString().split("T")[0];
  const savedNik = localStorage.getItem("snack_pos_active_shift_cashier");

  // Ambil transaksi & retur hari ini yang belum diklerk (klerkId null/empty)
  const unklerkedTrx = (pos.transactions || []).filter(t => t.date === todayStr && !t.klerkId);
  const unklerkedRet = (pos.returns || []).filter(r => r.date === todayStr && !r.klerkId);

  // Jika tidak ada transaksi sama sekali yang menggantung hari ini, shift bersih (bebas login NIK lain)
  if (unklerkedTrx.length === 0 && unklerkedRet.length === 0) {
    return null;
  }

  let activeNik = savedNik;
  let activeName = null;

  // Telusuri dari transaksi belum diklerk terbaru
  for (let i = unklerkedTrx.length - 1; i >= 0; i--) {
    const t = unklerkedTrx[i];
    if (t.cashierNik) {
      activeNik = t.cashierNik;
      activeName = t.cashier;
      break;
    } else if (t.cashier && !activeName) {
      activeName = t.cashier;
    }
  }

  if (!activeNik && unklerkedRet.length > 0) {
    for (let i = unklerkedRet.length - 1; i >= 0; i--) {
      const r = unklerkedRet[i];
      if (r.cashierNik) {
        activeNik = r.cashierNik;
        activeName = r.cashier;
        break;
      } else if (r.cashier && !activeName) {
        activeName = r.cashier;
      }
    }
  }

  if (!activeNik && activeName && Array.isArray(pos.employees)) {
    const foundEmp = pos.employees.find(e => e.name === activeName);
    if (foundEmp) activeNik = foundEmp.nik;
  }

  if (activeNik && !activeName && Array.isArray(pos.employees)) {
    const foundEmp = pos.employees.find(e => e.nik === activeNik);
    if (foundEmp) activeName = foundEmp.name;
  }

  if (!activeNik) {
    activeNik = pos.settings?.cashierNik || (pos.employees && pos.employees[0] ? pos.employees[0].nik : null);
    activeName = pos.settings?.cashierName || (pos.employees && pos.employees[0] ? pos.employees[0].name : "Kasir Sebelumnya");
  }

  return {
    nik: activeNik,
    name: activeName || activeNik || "Kasir Sebelumnya",
    trxCount: unklerkedTrx.length,
    returnCount: unklerkedRet.length,
    totalCount: unklerkedTrx.length + unklerkedRet.length
  };
}
window.findActiveUnklerkedShift = findActiveUnklerkedShift;

/**
 * Konfirmasi dan lakukan Kunci Layar / Logout Kasir (Aman untuk Mobile & Desktop)
 */
function confirmOrLockCashier() {
  const current = pos.currentUser;
  const name = current ? current.name : (pos.settings?.cashierName || "Kasir");
  const nik = current ? current.nik : (pos.settings?.cashierNik || "-");

  const activeShift = typeof findActiveUnklerkedShift === "function" ? findActiveUnklerkedShift() : null;
  let confirmMsg = `Apakah Anda yakin ingin mengunci layar & logout dari sesi kasir ${name} (${nik})?`;

  if (activeShift && (activeShift.nik === nik || !nik)) {
    confirmMsg += `\n\n📌 Catatan Penting:\nAnda memiliki ${activeShift.totalCount} transaksi aktif yang belum di-Clerk.\nAnda harus login kembali dengan NIK ${activeShift.nik} jika ingin melanjutkan transaksi atau melakukan Closing Kasir [F8]. NIK lain tidak dapat login sebelum Klerk selesai.`;
  }

  if (confirm(confirmMsg)) {
    if (typeof toggleSisDrawer === "function") {
      const drawer = document.getElementById("sis-drawer");
      if (drawer && !drawer.classList.contains("translate-x-full")) {
        toggleSisDrawer();
      }
    }
    lockCashierScreen();
  }
}
window.confirmOrLockCashier = confirmOrLockCashier;

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
  // Aturan Logika: Jika kasir login sudah ada transaksi yang belum di-Clerk,
  // TIDAK BOLEH login dengan NIK lain sebelum kasir tersebut melakukan Clerk!
  // ========================================================
  const activeUnklerkedShift = findActiveUnklerkedShift();
  if (activeUnklerkedShift && activeUnklerkedShift.nik && activeUnklerkedShift.nik !== emp.nik) {
    const unklerkedNik = activeUnklerkedShift.nik;
    const unklerkedName = activeUnklerkedShift.name;
    const totalActs = activeUnklerkedShift.totalCount || (activeUnklerkedShift.trxCount + activeUnklerkedShift.returnCount);

    if (errEl) {
      errEl.innerHTML = `
        <div class="text-left space-y-1.5 p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs">
          <p class="font-black flex items-center gap-1.5 text-xs text-rose-900">
            <span>⛔</span> <span>SHIFT KASIR MASIH AKTIF &amp; BELUM CLERK!</span>
          </p>
          <p class="text-[11px] leading-relaxed">
            Terminal kasir ini memiliki <strong>${totalActs} transaksi aktif</strong> atas nama kasir <strong>${unklerkedName} (NIK: ${unklerkedNik})</strong> yang belum di-Closing/Clerk.
          </p>
          <p class="text-[11px] text-rose-950 font-bold bg-white/90 p-2 rounded-lg border border-rose-200 leading-normal">
            ⚠️ NIK lain (<strong>${emp.nik} - ${emp.name}</strong>) tidak boleh login sebelum kasir <strong>${unklerkedName}</strong> menyelesaikan Closing/Clerk [F8] untuk serah terima laci kas.
          </p>
        </div>
      `;
      errEl.classList.remove("hidden");
    }
    sfx.warning();
    return;
  }

  localStorage.setItem("snack_pos_active_shift_cashier", emp.nik);

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

/**
 * Menyiapkan form modal login kasir (memeriksa gembok shift dan menampilkan status shift berjalan)
 */
function prepareEmployeeLoginModal() {
  const nikInput = document.getElementById("login-employee-nik");
  const pinInput = document.getElementById("login-employee-pin");
  const errEl = document.getElementById("login-error-msg");
  if (nikInput) nikInput.value = "";
  if (pinInput) pinInput.value = "";
  if (errEl) {
    errEl.innerHTML = "";
    errEl.classList.add("hidden");
  }

  // Periksa apakah ada shift kasir aktif yang belum di-clerk
  const activeShift = typeof findActiveUnklerkedShift === "function" ? findActiveUnklerkedShift() : null;
  const lockNoticeEl = document.getElementById("login-active-shift-notice");
  if (lockNoticeEl) {
    if (activeShift && activeShift.nik) {
      lockNoticeEl.innerHTML = `
        <div class="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs shadow-2xs">
          <p class="font-black flex items-center gap-1.5 text-amber-900">
            <span>🔒</span> <span>SESI KASIR SEDANG BERJALAN</span>
          </p>
          <p class="text-[11px] text-amber-900 mt-1 leading-relaxed">
            Kasir aktif: <strong>${activeShift.name} (NIK: ${activeShift.nik})</strong> memiliki <strong>${activeShift.totalCount} transaksi aktif</strong> yang belum di-Clerk.
          </p>
          <p class="text-[10px] text-amber-800 font-bold mt-1.5 bg-amber-100/70 p-1.5 rounded-lg border border-amber-200">
            * Hanya NIK ${activeShift.nik} yang dapat login untuk melanjutkan atau melakukan Tutup Kasir / Clerk [F8].
          </p>
        </div>
      `;
      lockNoticeEl.classList.remove("hidden");
      if (nikInput) nikInput.value = activeShift.nik;
      setTimeout(() => pinInput?.focus(), 150);
    } else {
      lockNoticeEl.classList.add("hidden");
      lockNoticeEl.innerHTML = "";
      setTimeout(() => nikInput?.focus(), 150);
    }
  } else {
    if (activeShift && activeShift.nik && nikInput) {
      nikInput.value = activeShift.nik;
      setTimeout(() => pinInput?.focus(), 150);
    } else {
      setTimeout(() => nikInput?.focus(), 150);
    }
  }
}
window.prepareEmployeeLoginModal = prepareEmployeeLoginModal;

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
  showToast("Layar kasir dikunci. Silakan login kembali.", "info");
}

// ==========================================
// KONTROL AKSES KEUANGAN & DASHBOARD OWNER (RBAC)
// ==========================================
let financialsTempUnlocked = false;

function isCurrentUserAuthorizedForFinancials() {
  if (financialsTempUnlocked) return true;
  if (!pos.employees || pos.employees.length === 0) return true;
  if (!pos.currentUser) return false;
  // Selaraskan dengan data karyawan terbaru dari pos.employees jika ada
  const latestEmp = (pos.employees || []).find(e => e.nik === pos.currentUser.nik);
  const u = latestEmp || pos.currentUser;
  return u.role === "COS" || u.canViewFinancials === true;
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
    if (typeof renderKlerkHistoryTable === "function") renderKlerkHistoryTable();
    if (typeof initSisReportModal === "function") initSisReportModal();
    if (typeof initSisRecapModal === "function") initSisRecapModal();
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
    if (typeof renderKlerkHistoryTable === "function") renderKlerkHistoryTable();
    if (typeof initSisReportModal === "function") initSisReportModal();
    if (typeof initSisRecapModal === "function") initSisRecapModal();
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

  // Toggle button on SIS Shift Report Modal
  const btnSisReport = document.getElementById("btn-toggle-sis-report-censor");
  const txtSisReport = document.getElementById("btn-toggle-sis-report-censor-text");
  if (btnSisReport && txtSisReport) {
    if (isAuth) {
      btnSisReport.innerHTML = `<span>🔓</span><span id="btn-toggle-sis-report-censor-text">${financialsTempUnlocked ? "Kunci Sensor" : "Laporan Terbuka"}</span>`;
      btnSisReport.className = "px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-[11px] font-bold flex items-center gap-1 shadow-2xs transition-all cursor-pointer";
    } else {
      btnSisReport.innerHTML = `<span>🔒</span><span id="btn-toggle-sis-report-censor-text">Buka Sensor</span>`;
      btnSisReport.className = "px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-purple-200 rounded-xl text-[11px] font-bold flex items-center gap-1 shadow-2xs transition-all cursor-pointer";
    }
  }

  // Toggle button on SIS Daily Recap Modal
  const btnSisRecap = document.getElementById("btn-toggle-sis-recap-censor");
  const txtSisRecap = document.getElementById("btn-toggle-sis-recap-censor-text");
  if (btnSisRecap && txtSisRecap) {
    if (isAuth) {
      btnSisRecap.innerHTML = `<span>🔓</span><span id="btn-toggle-sis-recap-censor-text">${financialsTempUnlocked ? "Kunci Sensor" : "Laporan Terbuka"}</span>`;
      btnSisRecap.className = "px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-[11px] font-bold flex items-center gap-1 shadow-2xs transition-all cursor-pointer";
    } else {
      btnSisRecap.innerHTML = `<span>🔒</span><span id="btn-toggle-sis-recap-censor-text">Buka Sensor</span>`;
      btnSisRecap.className = "px-2.5 py-1 bg-white hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-[11px] font-bold flex items-center gap-1 shadow-2xs transition-all cursor-pointer";
    }
  }
}

let currentSupervisorActionType = null;

function hasPermissionForAction(user, actionType) {
  if (!user) return true;
  if (actionType === 'MANAGE_PRODUCTS') return true;
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

function requestSupervisorAuth(actionType, actionDesc, onApproved) {
  if (actionType === 'MANAGE_PRODUCTS' || !pos.currentUser || (pos.currentUser && pos.currentUser.role === 'COS')) {
    if (typeof onApproved === 'function') {
      onApproved(pos.currentUser || { nik: '1001', name: 'Kepala Toko', role: 'COS' });
    }
    return;
  }
  // Jika user aktif sudah memiliki hak mandiri untuk aksi ini, langsung eksekusi tanpa popup otorisasi
  if (pos.currentUser && hasPermissionForAction(pos.currentUser, actionType)) {
    onApproved(pos.currentUser);
    return;
  }

  currentSupervisorActionType = actionType;
  pendingSupervisorCallback = onApproved;
  const descEl = document.getElementById("auth-action-description");
  const nikInput = document.getElementById("auth-supervisor-nik");
  const pinInput = document.getElementById("auth-supervisor-pin");
  const errEl = document.getElementById("auth-error-msg");

  if (descEl) descEl.textContent = actionDesc || "Tindakan Kasir Dibatasi";
  if (nikInput) nikInput.value = "";
  if (pinInput) pinInput.value = "";
  if (errEl) errEl.classList.add("hidden");

  openModal("modal-supervisor-auth");
  setTimeout(() => nikInput?.focus(), 150);
}

function handleSupervisorAuthSubmit(event) {
  if (event && event.preventDefault) event.preventDefault();

  const nik = document.getElementById("auth-supervisor-nik")?.value.trim();
  const pin = document.getElementById("auth-supervisor-pin")?.value.trim();
  const errEl = document.getElementById("auth-error-msg");

  const supervisor = (pos.employees || []).find(e => e.nik === nik);
  if (!supervisor) {
    if (errEl) {
      errEl.textContent = `NIK "${nik}" tidak terdaftar di data karyawan toko!`;
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

  if (supervisor.pin !== pin) {
    if (errEl) {
      errEl.textContent = "PIN Pejabat / Pengawas Salah!";
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

