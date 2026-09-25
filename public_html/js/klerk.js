/**
 * SnackPOS - Cashier Shift Closing & Klerk Settlement (F8)
 */

// ==========================================
// 6.5. MODUL KLERK / CLOSING SHIFT KASIR RETAIL [F8]
// Rekonsiliasi Saldo Kas Komputer vs Uang Fisik di Laci Kasir
// ==========================================
let klerkCurrentData = {
  activeUser: null,
  initialCash: 200000,
  cashSales: 0,
  cashRefunds: 0,
  qrisSales: 0,
  edcSales: 0,
  expectedCash: 200000,
  totalTrxCount: 0,
  physicalTotal: 0,
  variance: 0,
  status: "KLOP",
  denominations: {}
};

// Flag kontrol apakah angka omzet komputer dibuka oleh supervisor (COS / ACOS)
let isBlindKlerkRevealed = false;
let activeKlerkRecord = null;
let lastCompletedKlerk = null;
let klerkShouldLogoutAfter = false;

/**
 * Cek apakah kasir tertentu sudah pernah melakukan closing klerk hari ini
 */
function checkCashierHasKlerkedToday(cashierUser) {
  const todayStr = new Date().toISOString().split("T")[0];
  const nik = cashierUser ? cashierUser.nik : (pos.currentUser ? pos.currentUser.nik : null);
  const name = cashierUser ? cashierUser.name : (pos.currentUser ? pos.currentUser.name : null);

  return (pos.klerkHistory || []).some(k => {
    if (k.date !== todayStr) return false;
    if (nik && k.cashierNik && k.cashierNik === nik) return true;
    if (name && k.cashierName && k.cashierName === name) return true;
    return false;
  });
}

/**
 * Ambil record klerk terakhir hari ini untuk kasir tertentu
 */
function getLatestKlerkTodayForCashier(cashierUser) {
  const todayStr = new Date().toISOString().split("T")[0];
  const nik = cashierUser ? cashierUser.nik : (pos.currentUser ? pos.currentUser.nik : null);
  const name = cashierUser ? cashierUser.name : (pos.currentUser ? pos.currentUser.name : null);

  const list = (pos.klerkHistory || []).filter(k => {
    if (k.date !== todayStr) return false;
    if (nik && k.cashierNik && k.cashierNik === nik) return true;
    if (name && k.cashierName && k.cashierName === name) return true;
    return false;
  });

  return list.length > 0 ? list[0] : null;
}

/**
 * Ambil transaksi yang BELUM di-klerk (klerkId null) untuk kasir ini
 */
function getUnklerkedTransactionsForCashier(cashierUser) {
  const todayStr = new Date().toISOString().split("T")[0];
  let nik = cashierUser ? cashierUser.nik : (pos.currentUser ? pos.currentUser.nik : null);
  let name = cashierUser ? cashierUser.name : (pos.currentUser ? pos.currentUser.name : null);

  if (nik && !name && Array.isArray(pos.employees)) {
    const f = pos.employees.find(e => e.nik === nik);
    if (f) name = f.name;
  }
  if (!nik && name && Array.isArray(pos.employees)) {
    const f = pos.employees.find(e => e.name === name);
    if (f) nik = f.nik;
  }

  const lastKlerk = getLatestKlerkTodayForCashier(cashierUser || { nik, name });

  let lastKlerkTime = 0;
  if (lastKlerk) {
    lastKlerkTime = lastKlerk.createdAt ? new Date(lastKlerk.createdAt).getTime() : (lastKlerk.time ? new Date(`${lastKlerk.date}T${lastKlerk.time}`).getTime() : 0);
  }

  return (pos.transactions || []).filter(t => {
    // 1. Hanya transaksi hari ini
    if (t.date !== todayStr) return false;

    // 2. Transaksi yang sudah tercatat di klerkId tertentu tidak boleh dihitung lagi
    if (t.klerkId) return false;

    // 3. Jika ada klerk sebelumnya hari ini, periksa apakah transaksi dibuat sebelum klerk tersebut
    if (lastKlerkTime > 0) {
      const trxTime = t.createdAt ? new Date(t.createdAt).getTime() : 0;
      if (trxTime > 0 && trxTime <= lastKlerkTime) {
        return false;
      }
    }

    // 4. Filter NIK kasir jika ada, atau nama kasir
    if (nik) {
      if (t.cashierNik) return t.cashierNik === nik;
      if (name && t.cashier) return t.cashier === name;
      return false;
    }
    if (name) {
      return t.cashier === name;
    }
    return true;
  });
}

/**
 * Ambil retur penjualan yang BELUM di-klerk untuk kasir ini
 */
function getUnklerkedReturnsForCashier(cashierUser) {
  const todayStr = new Date().toISOString().split("T")[0];
  let nik = cashierUser ? cashierUser.nik : (pos.currentUser ? pos.currentUser.nik : null);
  let name = cashierUser ? cashierUser.name : (pos.currentUser ? pos.currentUser.name : null);

  if (nik && !name && Array.isArray(pos.employees)) {
    const f = pos.employees.find(e => e.nik === nik);
    if (f) name = f.name;
  }
  if (!nik && name && Array.isArray(pos.employees)) {
    const f = pos.employees.find(e => e.name === name);
    if (f) nik = f.nik;
  }

  const lastKlerk = getLatestKlerkTodayForCashier(cashierUser || { nik, name });

  let lastKlerkTime = 0;
  if (lastKlerk) {
    lastKlerkTime = lastKlerk.createdAt ? new Date(lastKlerk.createdAt).getTime() : 0;
  }

  return (pos.returns || []).filter(r => {
    if (r.date !== todayStr) return false;
    if (r.klerkId) return false;

    if (lastKlerkTime > 0) {
      const retTime = r.createdAt ? new Date(r.createdAt).getTime() : 0;
      if (retTime > 0 && retTime <= lastKlerkTime) {
        return false;
      }
    }

    if (nik) {
      if (r.cashierNik) return r.cashierNik === nik;
      if (name && r.cashier) return r.cashier === name;
      return false;
    }
    if (name) {
      return r.cashier === name;
    }
    return true;
  });
}

function openKlerkModal() {
  const activeUser = pos.currentUser || {
    nik: pos.settings.cashierNik || "1001",
    name: pos.settings.cashierName || "Kasir 1",
    role: "CREW",
    shift: pos.settings.shiftName || "Shift 1"
  };

  // Reset status Blind Klerk setiap kali modal dibuka baru
  isBlindKlerkRevealed = false;

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const timeFormatted = now.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }) + " • " + now.toLocaleTimeString("id-ID");

  // Isi header sesi kasir
  const cashierEl = document.getElementById("klerk-info-cashier");
  const shiftEl = document.getElementById("klerk-info-shift");
  const timeEl = document.getElementById("klerk-info-time");
  const posEl = document.getElementById("klerk-info-pos");
  const supervisorEl = document.getElementById("klerk-supervisor");

  if (cashierEl) cashierEl.textContent = `${activeUser.nik} • ${activeUser.name} (${activeUser.role})`;
  if (shiftEl) shiftEl.textContent = `${activeUser.shift || pos.settings.shiftName || 'Shift 1'}`;
  if (timeEl) timeEl.textContent = timeFormatted;
  if (posEl) posEl.textContent = pos.settings.posNumber || "POS 01";
  if (supervisorEl) {
    if (activeUser.role === "COS" || activeUser.role === "ACOS") {
      supervisorEl.value = `${activeUser.role} ${activeUser.name} (${activeUser.nik})`;
    } else {
      supervisorEl.value = "COS / ACOS Pejabat Toko";
    }
  }

  // Ambil transaksi & retur yang belum diklerk untuk kasir ini
  const userTrx = getUnklerkedTransactionsForCashier(activeUser);
  const userReturns = getUnklerkedReturnsForCashier(activeUser);
  const hasKlerkedToday = checkCashierHasKlerkedToday(activeUser);
  const lastKlerkToday = getLatestKlerkTodayForCashier(activeUser);

  // Jika kasir ini sudah pernah klerk sebelumnya dan belum ada transaksi baru:
  // Nilai transaksi = 0 dan banner pencegah double klerk ditampilkan
  const isAlreadyKlerkedSession = hasKlerkedToday && userTrx.length === 0;

  const closedBanner = document.getElementById("klerk-already-closed-banner");
  const closedText = document.getElementById("klerk-already-closed-text");
  if (closedBanner) {
    if (isAlreadyKlerkedSession) {
      closedBanner.classList.remove("hidden");
      if (closedText) {
        closedText.innerHTML = `<strong>SESI SUDAH DI-KLERK (${lastKlerkToday ? lastKlerkToday.id : ''}):</strong> Kasir ini sudah menyelesaikan closing Klerk sebelumnya. Nilai transaksi baru yang bisa diklerk = Rp 0. Tidak bisa melakukan double klerk. Silakan buat transaksi penjualan baru terlebih dahulu.`;
      }
    } else {
      closedBanner.classList.add("hidden");
    }
  }

  let cashSales = 0;
  let cashSalesCount = 0;
  let qrisSales = 0;
  let edcSales = 0;
  let transferSales = 0;
  let otherNonCashSales = 0;

  userTrx.forEach(t => {
    const method = (t.paymentMethod || "").toLowerCase().trim();
    const payable = Number(t.payableAmount ?? t.grandTotal) || 0;

    // SETORAN KASIR HANYA TUNAI MURNI (tidak termasuk non-tunai)
    if (method === "cash" || method === "tunai" || method.startsWith("cash+") || method.startsWith("tunai+")) {
      cashSales += payable;
      cashSalesCount++;
    } else if (method.startsWith("qris")) {
      qrisSales += payable;
    } else if (method.startsWith("edc") || method.startsWith("debit")) {
      edcSales += payable;
    } else if (method.startsWith("transfer")) {
      transferSales += payable;
    } else {
      otherNonCashSales += payable;
    }
  });

  // Hitung retur tunai shift ini
  let cashRefunds = 0;
  let cashRefundsCount = 0;
  userReturns.forEach(r => {
    cashRefunds += Number(r.totalRefund) || 0;
    cashRefundsCount++;
  });

  // Modal awal: jika kasir sudah pernah klerk dan tidak ada transaksi baru, set 0
  const defaultInitial = isAlreadyKlerkedSession ? 0 : 200000;
  const initialInput = document.getElementById("klerk-initial-cash");
  if (initialInput) initialInput.value = defaultInitial;

  // Reset input pecahan
  ["100k", "50k", "20k", "10k", "5k", "2k", "1k", "coin"].forEach(denom => {
    const el = document.getElementById(`klerk-d-${denom}`);
    if (el) el.value = 0;
  });

  const manualTotalInput = document.getElementById("klerk-manual-total-input");
  if (manualTotalInput) manualTotalInput.value = "";
  const noteInput = document.getElementById("klerk-note");
  if (noteInput) noteInput.value = "";

  // Simpan kalkulasi ke state
  klerkCurrentData = {
    activeUser: activeUser,
    todayStr: todayStr,
    timeFormatted: timeFormatted,
    initialCash: defaultInitial,
    cashSales: cashSales,
    cashSalesCount: cashSalesCount,
    cashRefunds: cashRefunds,
    cashRefundsCount: cashRefundsCount,
    qrisSales: qrisSales,
    edcSales: edcSales,
    transferSales: transferSales,
    totalTrxCount: userTrx.length,
    physicalTotal: 0,
    variance: 0,
    status: "KLOP",
    denominations: {}
  };

  // Pengaturan UI Blind Klerk: jika kasir tidak punya izin canViewFinancials dan bukan COS
  const user = activeUser || pos.currentUser;
  const canSeeFinancials = (user && (user.role === "COS" || user.canViewFinancials === true));
  const isBlind = !canSeeFinancials && !isBlindKlerkRevealed;

  const btnReveal = document.getElementById("btn-reveal-klerk");
  const blindBanner = document.getElementById("klerk-blind-banner");
  if (btnReveal) {
    if (isBlind) btnReveal.classList.remove("hidden");
    else btnReveal.classList.add("hidden");
  }
  if (blindBanner) {
    if (isBlind) blindBanner.classList.remove("hidden");
    else blindBanner.classList.add("hidden");
  }

  // Update elemen ringkasan komputer
  const cashSalesEl = document.getElementById("klerk-cash-sales");
  const cashSalesCountEl = document.getElementById("klerk-cash-sales-count");
  const cashRefundsEl = document.getElementById("klerk-cash-refunds");
  const cashRefundsCountEl = document.getElementById("klerk-cash-refunds-count");
  const qrisSalesEl = document.getElementById("klerk-qris-sales");
  const edcSalesEl = document.getElementById("klerk-edc-sales");
  const totalTrxCountEl = document.getElementById("klerk-total-trx-count");

  if (isBlind) {
    if (cashSalesEl) cashSalesEl.textContent = "••••••••";
    if (cashSalesCountEl) cashSalesCountEl.textContent = `•• struk tunai`;
    if (cashRefundsEl) cashRefundsEl.textContent = "••••••••";
    if (cashRefundsCountEl) cashRefundsCountEl.textContent = `•• retur tunai`;
    if (qrisSalesEl) qrisSalesEl.textContent = "••••••••";
    if (edcSalesEl) edcSalesEl.textContent = "••••••••";
    if (totalTrxCountEl) totalTrxCountEl.textContent = `•• Struk`;
  } else {
    if (cashSalesEl) cashSalesEl.textContent = formatRupiah(cashSales);
    if (cashSalesCountEl) cashSalesCountEl.textContent = `${cashSalesCount} struk tunai`;
    if (cashRefundsEl) cashRefundsEl.textContent = formatRupiah(cashRefunds);
    if (cashRefundsCountEl) cashRefundsCountEl.textContent = `${cashRefundsCount} retur tunai`;
    if (qrisSalesEl) qrisSalesEl.textContent = formatRupiah(qrisSales);
    if (edcSalesEl) edcSalesEl.textContent = formatRupiah(edcSales);
    if (totalTrxCountEl) totalTrxCountEl.textContent = `${userTrx.length} Struk`;
  }

  calculateKlerkTotals();
  openModal("modal-klerk");
}

function calculateKlerkTotals() {
  const initialCash = Number(document.getElementById("klerk-initial-cash")?.value) || 0;
  klerkCurrentData.initialCash = initialCash;

  const expectedCash = initialCash + klerkCurrentData.cashSales - klerkCurrentData.cashRefunds;
  klerkCurrentData.expectedCash = expectedCash;

  const user = klerkCurrentData.activeUser || pos.currentUser;
  const canSeeFinancials = (user && (user.role === "COS" || user.canViewFinancials === true));
  const isBlind = !canSeeFinancials && !isBlindKlerkRevealed;

  const expectedEl = document.getElementById("klerk-expected-cash");
  if (expectedEl) {
    expectedEl.textContent = isBlind ? "•••••••• (Blind Klerk)" : formatRupiah(expectedCash);
  }

  const d100k = Number(document.getElementById("klerk-d-100k")?.value) || 0;
  const d50k = Number(document.getElementById("klerk-d-50k")?.value) || 0;
  const d20k = Number(document.getElementById("klerk-d-20k")?.value) || 0;
  const d10k = Number(document.getElementById("klerk-d-10k")?.value) || 0;
  const d5k = Number(document.getElementById("klerk-d-5k")?.value) || 0;
  const d2k = Number(document.getElementById("klerk-d-2k")?.value) || 0;
  const d1k = Number(document.getElementById("klerk-d-1k")?.value) || 0;
  const dcoin = Number(document.getElementById("klerk-d-coin")?.value) || 0;

  klerkCurrentData.denominations = {
    "100000": d100k,
    "50000": d50k,
    "20000": d20k,
    "10000": d10k,
    "5000": d5k,
    "2000": d2k,
    "1000": d1k,
    "coin": dcoin
  };

  const denomSum = (d100k * 100000) + (d50k * 50000) + (d20k * 20000) + 
                   (d10k * 10000) + (d5k * 5000) + (d2k * 2000) + 
                   (d1k * 1000) + dcoin;

  let physicalTotal = denomSum;
  const manualInput = document.getElementById("klerk-manual-total-input");
  // Jika pecahan diisi > 0, sync manual input
  if (denomSum > 0 && manualInput) {
    manualInput.value = denomSum;
  } else if (denomSum === 0 && manualInput && manualInput.value) {
    physicalTotal = Number(manualInput.value) || 0;
  }

  klerkCurrentData.physicalTotal = physicalTotal;
  const physicalDisplay = document.getElementById("klerk-physical-total-display");
  if (physicalDisplay) physicalDisplay.textContent = formatRupiah(physicalTotal);

  // Hitung Selisih
  const diff = physicalTotal - expectedCash;
  klerkCurrentData.variance = diff;

  const diffAmountEl = document.getElementById("klerk-diff-amount");
  const diffBox = document.getElementById("klerk-diff-box");
  const statusBadge = document.getElementById("klerk-status-badge");
  const statusDesc = document.getElementById("klerk-status-desc");

  // Jika Blind Klerk aktif untuk CREW, rahasiakan status selisih di layar komputer
  if (isBlind) {
    if (diffAmountEl) {
      diffAmountEl.textContent = "•••••••• (Blind Klerk)";
      diffAmountEl.className = "text-amber-500 font-black";
    }
    if (diffBox) {
      diffBox.className = "p-4 rounded-2xl border-2 transition-all bg-amber-50/80 border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3";
    }
    if (statusBadge) {
      statusBadge.className = "mt-1 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-500 text-slate-950 shadow-xs";
      statusBadge.innerHTML = "<span>🔒</span><span>Status Selisih Dirahasiakan (Blind Klerk)</span>";
    }
    if (statusDesc) {
      statusDesc.textContent = "Sistem Blind Klerk aktif untuk kasir CREW. Hasil selisih & omzet komputer akan tercetak lengkap di struk thermal setelah closing atau dibuka dengan PIN Pejabat Toko.";
    }
    // Tetap tentukan status internal untuk data riwayat & struk
    if (physicalTotal === 0 && expectedCash > 0) {
      klerkCurrentData.status = "PENDING";
    } else if (diff === 0) {
      klerkCurrentData.status = "KLOP";
    } else if (diff > 0) {
      klerkCurrentData.status = "SURPLUS";
    } else {
      klerkCurrentData.status = "MINUS";
    }
  } else if (physicalTotal === 0 && expectedCash > 0) {
    klerkCurrentData.status = "PENDING";
    if (diffAmountEl) {
      diffAmountEl.textContent = `-${formatRupiah(expectedCash)}`;
      diffAmountEl.className = "text-slate-500 font-black";
    }
    if (diffBox) diffBox.className = "p-4 rounded-2xl border-2 transition-all bg-slate-50 border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3";
    if (statusBadge) {
      statusBadge.className = "mt-1 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-slate-200 text-slate-700";
      statusBadge.innerHTML = "<span>⚪</span><span>Menunggu Hitungan Kasir</span>";
    }
    if (statusDesc) statusDesc.textContent = "Masukkan rincian uang fisik di laci untuk menghitung selisih kas.";
  } else if (diff === 0) {
    klerkCurrentData.status = "KLOP";
    if (diffAmountEl) {
      diffAmountEl.textContent = "Rp 0 (Klop / Pas)";
      diffAmountEl.className = "text-emerald-600 font-black";
    }
    if (diffBox) diffBox.className = "p-4 rounded-2xl border-2 transition-all bg-emerald-50/80 border-emerald-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3";
    if (statusBadge) {
      statusBadge.className = "mt-1 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-600 text-white shadow-xs";
      statusBadge.innerHTML = "<span>✅</span><span>KLOP / PAS (Uang Sesuai)</span>";
    }
    if (statusDesc) statusDesc.textContent = "Saldo kas fisik di laci sama persis dengan perhitungan sistem kasir. Sangat baik!";
  } else if (diff > 0) {
    klerkCurrentData.status = "SURPLUS";
    if (diffAmountEl) {
      diffAmountEl.textContent = `+${formatRupiah(diff)} (Lebih)`;
      diffAmountEl.className = "text-blue-700 font-black";
    }
    if (diffBox) diffBox.className = "p-4 rounded-2xl border-2 transition-all bg-blue-50/80 border-blue-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3";
    if (statusBadge) {
      statusBadge.className = "mt-1 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-blue-600 text-white shadow-xs";
      statusBadge.innerHTML = `<span>📈</span><span>LEBIH (+${formatRupiah(diff)})</span>`;
    }
    if (statusDesc) statusDesc.textContent = "Uang fisik di laci melebihi perhitungan sistem kasir (Surplus kas).";
  } else {
    klerkCurrentData.status = "MINUS";
    if (diffAmountEl) {
      diffAmountEl.textContent = `-${formatRupiah(Math.abs(diff))} (Kurang)`;
      diffAmountEl.className = "text-rose-600 font-black";
    }
    if (diffBox) diffBox.className = "p-4 rounded-2xl border-2 transition-all bg-rose-50/80 border-rose-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3";
    if (statusBadge) {
      statusBadge.className = "mt-1 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-rose-600 text-white shadow-xs";
      statusBadge.innerHTML = `<span>🚨</span><span>KURANG (-${formatRupiah(Math.abs(diff))})</span>`;
    }
    if (statusDesc) statusDesc.textContent = "Uang fisik di laci kurang dari perhitungan sistem kasir (Kasir nombok/selisih minus).";
  }
}

function onKlerkManualTotalInput() {
  const manualInput = document.getElementById("klerk-manual-total-input");
  const val = Number(manualInput?.value) || 0;

  // Kosongkan pecahan jika user input langsung total fisik
  ["100k", "50k", "20k", "10k", "5k", "2k", "1k", "coin"].forEach(denom => {
    const el = document.getElementById(`klerk-d-${denom}`);
    if (el) el.value = 0;
  });

  calculateKlerkTotals();
}

function saveAndPrintKlerk(logoutAfter = false) {
  const user = klerkCurrentData.activeUser || pos.currentUser;
  const eligibleTrx = getUnklerkedTransactionsForCashier(user);
  const hasKlerkedToday = checkCashierHasKlerkedToday(user);

  // CEGAH DOUBLE KLERK jika sesi kasir ini sudah pernah diklerk dan belum ada transaksi baru
  if (hasKlerkedToday && eligibleTrx.length === 0) {
    showToast(`⚠️ Tidak bisa double klerk! Sesi kasir [${user?.nik || ''}] ${user?.name || ''} sudah selesai di-klerk sebelumnya. Nilai transaksi = 0. Silakan buat transaksi penjualan baru terlebih dahulu.`, "warning");
    return;
  }

  const canBlindKlerk = typeof hasPermissionForAction === "function" ? hasPermissionForAction(user, "BLIND_KLERK") : true;

  // Jika kasir CREW tidak memiliki izin klerk mandiri, wajib minta persetujuan supervisor
  if (!canBlindKlerk && user && user.role === "CREW") {
    if (typeof requestSupervisorAuth === "function") {
      requestSupervisorAuth("BLIND_KLERK", "Otorisasi Closing Shift Kasir (Pendampingan Pejabat Toko)", (supervisor) => {
        const supervisorEl = document.getElementById("klerk-supervisor");
        if (supervisorEl) supervisorEl.value = `${supervisor.role} ${supervisor.name} (${supervisor.nik})`;
        executeSaveAndPrintKlerk(logoutAfter, false);
      });
      return;
    }
  }

  const isBlind = (!user || (!user.canViewFinancials && user.role !== "COS")) && !isBlindKlerkRevealed;
  executeSaveAndPrintKlerk(logoutAfter, isBlind);
}

function executeSaveAndPrintKlerk(logoutAfter = false, isBlindClose = false) {
  const note = document.getElementById("klerk-note")?.value.trim() || "";
  const supervisor = document.getElementById("klerk-supervisor")?.value.trim() || (isBlindClose ? "Setoran Mandiri (Blind Klerk)" : "Pejabat Toko");

  if (klerkCurrentData.physicalTotal === 0 && klerkCurrentData.expectedCash > 0) {
    if (!confirm("Total uang fisik di laci masih Rp 0. Apakah Anda yakin ingin menyimpan Klerk ini?")) {
      return;
    }
  }

  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toLocaleTimeString("id-ID");
  const klerkId = `KLR-${dateStr.replace(/-/g, "")}-${String(pos.klerkHistory.length + 1).padStart(3, "0")}`;

  const eligibleTrx = getUnklerkedTransactionsForCashier(klerkCurrentData.activeUser);
  const eligibleReturns = getUnklerkedReturnsForCashier(klerkCurrentData.activeUser);

  const klerkRecord = {
    id: klerkId,
    date: dateStr,
    time: timeStr,
    cashierNik: klerkCurrentData.activeUser.nik,
    cashierName: klerkCurrentData.activeUser.name,
    cashierRole: klerkCurrentData.activeUser.role,
    shift: klerkCurrentData.activeUser.shift || "Shift 1",
    posNumber: pos.settings.posNumber || "POS 01",
    storeName: pos.settings.storeName || "TOKO MINIMARKET",
    initialCash: klerkCurrentData.initialCash,
    cashSales: klerkCurrentData.cashSales,
    cashRefunds: klerkCurrentData.cashRefunds,
    expectedCash: klerkCurrentData.expectedCash,
    qrisSales: klerkCurrentData.qrisSales,
    edcSales: klerkCurrentData.edcSales,
    transferSales: klerkCurrentData.transferSales || 0,
    totalTrxCount: klerkCurrentData.totalTrxCount,
    denominations: { ...klerkCurrentData.denominations },
    physicalCash: klerkCurrentData.physicalTotal,
    variance: klerkCurrentData.variance,
    status: klerkCurrentData.status === "PENDING" ? (klerkCurrentData.variance === 0 ? "KLOP" : (klerkCurrentData.variance > 0 ? "SURPLUS" : "MINUS")) : klerkCurrentData.status,
    note: note || (isBlindClose ? "Closing shift mandiri (Blind Klerk)" : (klerkCurrentData.variance === 0 ? "Laci klop normal" : "Klerk closing shift")),
    supervisor: supervisor,
    isBlindClose: isBlindClose,
    transactionIds: eligibleTrx.map(t => t.id),
    returnIds: eligibleReturns.map(r => r.id),
    createdAt: now.toISOString()
  };

  // Tandai transaksi & retur ini sudah diklerk sehingga tidak dapat di-double klerk
  eligibleTrx.forEach(t => {
    t.klerkId = klerkRecord.id;
    t.klerkedAt = klerkRecord.createdAt;
  });
  pos.saveTransactions();

  eligibleReturns.forEach(r => {
    r.klerkId = klerkRecord.id;
    r.klerkedAt = klerkRecord.createdAt;
  });
  pos.saveReturns();

  pos.klerkHistory.unshift(klerkRecord);
  pos.saveKlerkHistory();

  lastCompletedKlerk = klerkRecord;
  activeKlerkRecord = klerkRecord;
  klerkShouldLogoutAfter = logoutAfter;

  // Render Struk Thermal Klerk (selalu tampilkan angka asli lengkap untuk struk yang sudah diklerk)
  renderKlerkReceipt(klerkRecord);
  closeModal("modal-klerk");
  openModal("modal-receipt-klerk");

  // Struk klerk tidak langsung tercetak saat selesai klerk (sesuai instruksi user)
  // Kasir melihat preview struk dan menekan tombol cetak secara manual

  sfx.beep();
  showToast(isBlindClose ? `Setoran Blind Klerk ${klerkRecord.id} berhasil disimpan!` : `Klerk closing shift ${klerkRecord.id} berhasil disimpan!`, "success");
  renderKlerkHistoryTable();

  // Sesi transaksi kasir telah selesai di-closing/klerk, lepaskan gembok shift
  localStorage.removeItem("snack_pos_active_shift_cashier");
}

function onCloseKlerkReceiptModal() {
  closeModal("modal-receipt-klerk");
  if (klerkShouldLogoutAfter) {
    klerkShouldLogoutAfter = false;
    localStorage.removeItem("snack_pos_active_shift_cashier");
    lockCashierScreen();
  }
}

/**
 * Otorisasi Pejabat Toko (COS / ACOS) untuk membuka omzet & selisih Blind Klerk di layar kasir
 */
function revealBlindKlerkWithPin() {
  if (typeof requestSupervisorAuth === "function") {
    requestSupervisorAuth(
      "VIEW_KLERK",
      "Buka Tampilan Omzet & Selisih Klerk (Blind Klerk)",
      (supervisor) => {
        isBlindKlerkRevealed = true;
        const banner = document.getElementById("klerk-blind-banner");
        if (banner) banner.classList.add("hidden");
        const btnReveal = document.getElementById("btn-reveal-klerk");
        if (btnReveal) btnReveal.classList.add("hidden");

        const cashSalesEl = document.getElementById("klerk-cash-sales");
        const cashSalesCountEl = document.getElementById("klerk-cash-sales-count");
        const cashRefundsEl = document.getElementById("klerk-cash-refunds");
        const cashRefundsCountEl = document.getElementById("klerk-cash-refunds-count");
        const qrisSalesEl = document.getElementById("klerk-qris-sales");
        const edcSalesEl = document.getElementById("klerk-edc-sales");
        const totalTrxCountEl = document.getElementById("klerk-total-trx-count");

        if (cashSalesEl) cashSalesEl.textContent = formatRupiah(klerkCurrentData.cashSales);
        if (cashSalesCountEl) cashSalesCountEl.textContent = `${klerkCurrentData.cashSalesCount} struk tunai`;
        if (cashRefundsEl) cashRefundsEl.textContent = formatRupiah(klerkCurrentData.cashRefunds);
        if (cashRefundsCountEl) cashRefundsCountEl.textContent = `${klerkCurrentData.cashRefundsCount} retur tunai`;
        if (qrisSalesEl) qrisSalesEl.textContent = formatRupiah(klerkCurrentData.qrisSales);
        if (edcSalesEl) edcSalesEl.textContent = formatRupiah(klerkCurrentData.edcSales);
        if (totalTrxCountEl) totalTrxCountEl.textContent = `${klerkCurrentData.totalTrxCount} Struk`;

        const supervisorEl = document.getElementById("klerk-supervisor");
        if (supervisorEl) supervisorEl.value = `${supervisor.role} ${supervisor.name} (${supervisor.nik})`;

        calculateKlerkTotals();
        if (typeof showToast === "function") {
          showToast(`🔓 Omzet & Selisih Klerk dibuka oleh ${supervisor.role} (${supervisor.name})`, "info");
        }
      }
    );
  } else {
    const pin = prompt("Masukkan PIN Pejabat Toko (COS / ACOS):");
    const found = (pos.employees || []).find(e => (e.role === "COS" || e.role === "ACOS") && e.pin === pin);
    if (found) {
      isBlindKlerkRevealed = true;
      calculateKlerkTotals();
      if (typeof showToast === "function") {
        showToast(`🔓 Omzet & Selisih Klerk dibuka oleh ${found.name}`, "info");
      }
    } else {
      alert("PIN Pejabat Toko salah!");
    }
  }
}

function renderKlerkReceipt(k) {
  activeKlerkRecord = k;
  const container = document.getElementById("thermal-receipt-klerk-content");
  if (!container) return;

  const is80 = pos.settings.paperWidth === "80mm";
  container.className = `thermal-receipt ${is80 ? 'width-80' : 'width-58'}`;

  const isPlus = k.variance > 0;
  const isMinus = k.variance < 0;
  const diffLabel = isPlus ? `+${formatRupiah(k.variance)} (LEBIH)` : (isMinus ? `-${formatRupiah(Math.abs(k.variance))} (KURANG)` : 'Rp 0 (KLOP / PAS)');

  const denoms = k.denominations || {};
  let denomRows = "";
  const denomKeys = [
    { label: "100.000", val: 100000, key: "100000" },
    { label: " 50.000", val: 50000, key: "50000" },
    { label: " 20.000", val: 20000, key: "20000" },
    { label: " 10.000", val: 10000, key: "10000" },
    { label: "  5.000", val: 5000, key: "5000" },
    { label: "  2.000", val: 2000, key: "2000" },
    { label: "  1.000", val: 1000, key: "1000" }
  ];

  denomKeys.forEach(d => {
    const count = Number(denoms[d.key]) || 0;
    if (count > 0) {
      denomRows += `
        <div class="flex justify-between text-[11px] font-mono">
          <span>${d.label} x ${count}</span>
          <span>${formatRupiah(count * d.val)}</span>
        </div>
      `;
    }
  });

  if (Number(denoms.coin) > 0) {
    denomRows += `
      <div class="flex justify-between text-[11px] font-mono">
        <span>Koin Logam</span>
        <span>${formatRupiah(Number(denoms.coin))}</span>
      </div>
    `;
  }

  if (!denomRows) {
    denomRows = `
      <div class="flex justify-between text-[11px] font-mono italic text-slate-500">
        <span>Input Total Langsung</span>
        <span>${formatRupiah(k.physicalCash)}</span>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="text-center font-mono text-xs leading-tight pb-2 border-b border-dashed border-slate-400">
      <div class="font-black text-sm uppercase">${pos.settings.storeName || 'TOKO MINIMARKET'}</div>
      <div class="text-[10px] text-slate-600">${pos.settings.storeAddress || 'JL. RAYA UTAMA NO. 88'}</div>
      <div class="text-[10px] text-slate-500">TELP: ${pos.settings.storePhone || '021-5551234'}</div>
      <div class="mt-2 py-0.5 px-2 bg-slate-900 text-white font-black text-[11px] inline-block uppercase">
        BUKTI SETORAN KASIR (KLERK)
      </div>
      <div class="text-[10px] text-slate-600 mt-0.5">SETTLEMENT END OF SHIFT</div>
    </div>

    <div class="py-2 text-[11px] font-mono leading-relaxed border-b border-dashed border-slate-400 space-y-0.5">
      <div class="flex justify-between">
        <span>No. Klerk</span>
        <span class="font-bold">${k.id}</span>
      </div>
      <div class="flex justify-between">
        <span>Waktu</span>
        <span>${k.date} ${k.time}</span>
      </div>
      <div class="flex justify-between">
        <span>Kasir</span>
        <span class="font-bold">[${k.cashierNik}] ${k.cashierName}</span>
      </div>
      <div class="flex justify-between">
        <span>Shift / POS</span>
        <span>${k.shift} • ${k.posNumber}</span>
      </div>
    </div>

    <!-- Rincian Kas Komputer (Setoran Tunai) -->
    <div class="py-2 text-[11px] font-mono leading-relaxed border-b border-dashed border-slate-400 space-y-1">
      <div class="font-bold uppercase text-[10px] text-slate-700">Perhitungan Komputer (Setoran Tunai):</div>
      <div class="flex justify-between">
        <span>Modal Awal Laci</span>
        <span>${formatRupiah(k.initialCash)}</span>
      </div>
      <div class="flex justify-between">
        <span>Penjualan Tunai (+)</span>
        <span>${formatRupiah(k.cashSales)}</span>
      </div>
      ${k.cashRefunds > 0 ? `
      <div class="flex justify-between text-rose-700">
        <span>Retur Tunai (-)</span>
        <span>-${formatRupiah(k.cashRefunds)}</span>
      </div>` : ''}
      <div class="flex justify-between font-bold pt-1 border-t border-dotted border-slate-300">
        <span>Total Saldo Kas Tunai</span>
        <span>${formatRupiah(k.expectedCash)}</span>
      </div>
    </div>

    <!-- Rincian Non-Tunai -->
    <div class="py-2 text-[10px] font-mono leading-relaxed border-b border-dashed border-slate-400 space-y-0.5 text-slate-600">
      <div class="font-bold uppercase text-[9px] text-slate-700">Non-Tunai (Info Rekonsiliasi):</div>
      <div class="flex justify-between">
        <span>QRIS</span>
        <span>${formatRupiah(k.qrisSales || 0)}</span>
      </div>
      <div class="flex justify-between">
        <span>EDC / Debit</span>
        <span>${formatRupiah(k.edcSales || 0)}</span>
      </div>
      <div class="flex justify-between">
        <span>Total Transaksi Shift</span>
        <span>${k.totalTrxCount || 0} Struk</span>
      </div>
      <div class="text-[9px] text-slate-400 italic pt-0.5">* Non-tunai tidak masuk ke fisik setoran kasir</div>
    </div>

    <!-- Rincian Fisik Laci -->
    <div class="py-2 text-[11px] font-mono leading-relaxed border-b border-dashed border-slate-400 space-y-1">
      <div class="font-bold uppercase text-[10px] text-slate-700">Rincian Fisik di Laci:</div>
      ${denomRows}
      <div class="flex justify-between font-black pt-1 border-t border-dotted border-slate-400 text-xs">
        <span>TOTAL UANG FISIK</span>
        <span>${formatRupiah(k.physicalCash)}</span>
      </div>
    </div>

    <!-- Hasil Selisih -->
    <div class="py-2 text-[11px] font-mono leading-relaxed border-b border-dashed border-slate-400 space-y-1">
      <div class="flex justify-between font-black text-xs ${isMinus ? 'text-rose-700' : (isPlus ? 'text-blue-700' : 'text-slate-900')}">
        <span>SELISIH KAS TUNAI</span>
        <span>${diffLabel}</span>
      </div>
      <div class="text-[10px] text-slate-600 italic">
        Catatan: ${k.note || '-'}
      </div>
    </div>

    <!-- Tanda Tangan Kasir & Pejabat Toko -->
    <div class="pt-4 pb-2 text-[10px] font-mono text-center">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <div>Kasir Bertugas,</div>
          <div class="h-10"></div>
          <div class="font-bold border-t border-dotted border-slate-400 pt-0.5">( ${k.cashierName || 'Kasir'} )</div>
        </div>
        <div>
          <div>Pejabat Toko,</div>
          <div class="h-10"></div>
          <div class="font-bold border-t border-dotted border-slate-400 pt-0.5">( ${k.supervisor || 'Pejabat'} )</div>
        </div>
      </div>
      <div class="mt-4 text-[9px] text-slate-400">Dicetak oleh Sistem Kasir Retail • Bukti Setoran Resmi</div>
    </div>
  `;
}

function openKlerkReceiptModal(k) {
  activeKlerkRecord = k;
  renderKlerkReceipt(k);
  openModal("modal-receipt-klerk");
}

function printKlerkReceipt() {
  const k = activeKlerkRecord || lastCompletedKlerk;
  if (!k) {
    showToast("Data struk klerk tidak ditemukan!", "warning");
    return;
  }
  if (typeof printKlerkReceiptUniversal === "function") {
    printKlerkReceiptUniversal(k);
  } else {
    printKlerkReceiptSystem();
  }
}

function printKlerkReceiptSystem() {
  const k = activeKlerkRecord || lastCompletedKlerk;
  if (!k) {
    showToast("Data struk klerk tidak ditemukan!", "warning");
    return;
  }
  if (typeof preparePrintableKlerkReceipt === "function") {
    preparePrintableKlerkReceipt(k);
  }
  window.print();
}

function reprintKlerkDirect(k) {
  if (!k) return;
  activeKlerkRecord = k;
  showToast(`Mencetak ulang struk klerk ${k.id}...`, "info");
  if (typeof printKlerkReceiptUniversal === "function") {
    printKlerkReceiptUniversal(k);
  } else {
    openKlerkReceiptModal(k);
  }
}

function reprintKlerkDirectById(id) {
  const k = (pos.klerkHistory || []).find(item => item.id === id);
  if (!k) {
    showToast("Data klerk tidak ditemukan!", "warning");
    return;
  }
  reprintKlerkDirect(k);
}

function openKlerkReceiptModalById(id) {
  const k = (pos.klerkHistory || []).find(item => item.id === id);
  if (!k) {
    showToast("Data klerk tidak ditemukan!", "warning");
    return;
  }
  openKlerkReceiptModal(k);
}

function reprintKlerkWithAuthDirect(id) {
  if (typeof isCurrentUserAuthorizedForFinancials === "function" && !isCurrentUserAuthorizedForFinancials()) {
    if (typeof requestSupervisorAuth === "function") {
      requestSupervisorAuth("VIEW_FINANCIALS", "Otorisasi Cetak Ulang Struk Klerk Closing Shift", () => {
        window.financialsTempUnlocked = true;
        if (typeof renderKlerkHistoryTable === "function") renderKlerkHistoryTable();
        reprintKlerkDirectById(id);
      });
      return;
    }
  }
  reprintKlerkDirectById(id);
}

function openKlerkReceiptWithAuthDirect(id) {
  if (typeof isCurrentUserAuthorizedForFinancials === "function" && !isCurrentUserAuthorizedForFinancials()) {
    if (typeof requestSupervisorAuth === "function") {
      requestSupervisorAuth("VIEW_FINANCIALS", "Otorisasi Melihat Struk Klerk Closing Shift", () => {
        window.financialsTempUnlocked = true;
        if (typeof renderKlerkHistoryTable === "function") renderKlerkHistoryTable();
        openKlerkReceiptModalById(id);
      });
      return;
    }
  }
  openKlerkReceiptModalById(id);
}

function renderKlerkHistoryTable() {
  const tbody = document.getElementById("klerk-history-table-body");
  if (!tbody) return;

  const history = pos.klerkHistory || [];
  if (history.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="py-8 text-center text-slate-400 text-xs">
          Belum ada riwayat Klerk closing shift pada sesi kasir ini.
        </td>
      </tr>
    `;
    return;
  }

  const isAuth = typeof isCurrentUserAuthorizedForFinancials === "function" ? isCurrentUserAuthorizedForFinancials() : true;

  tbody.innerHTML = history.map(k => {
    const diff = Number(k.variance) || 0;
    let badge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">✅ KLOP</span>`;
    let diffColor = "text-emerald-700";
    let diffText = "Rp 0";
    if (diff > 0) {
      badge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">📈 LEBIH</span>`;
      diffColor = "text-blue-700";
      diffText = `+${formatRupiah(diff)}`;
    } else if (diff < 0) {
      badge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">📉 KURANG</span>`;
      diffColor = "text-rose-700";
      diffText = `-${formatRupiah(Math.abs(diff))}`;
    }

    const cashSalesStr = isAuth ? formatRupiah(k.cashSales) : `<span class="text-slate-400 font-mono" title="Omzet disensor">••••••</span>`;
    const physicalCashStr = isAuth ? formatRupiah(k.physicalCash) : `<span class="text-slate-400 font-mono" title="Fisik kas laci disensor">••••••</span>`;
    const diffStr = isAuth ? diffText : `<span class="text-slate-400 font-mono" title="Selisih kas disensor">••••••</span>`;
    const badgeStr = isAuth ? badge : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">🔒 SENSOR</span>`;

    return `
      <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs">
        <td class="py-2 px-2.5 sm:px-3 font-mono font-bold text-amber-800">${k.id}</td>
        <td class="hidden sm:table-cell py-2 px-3 text-slate-600">${k.date} <span class="text-slate-400 text-[10px]">${k.time}</span></td>
        <td class="py-2 px-2.5 sm:px-3">
          <div class="font-bold text-slate-800">${k.cashierName || 'Kasir'}</div>
          <div class="text-[10px] font-mono text-amber-700">${k.shift || 'Shift 1'} • [${k.cashierNik || ''}]</div>
        </td>
        <td class="hidden md:table-cell py-2 px-3 font-mono text-slate-600 text-right">
          ${isAuth ? formatRupiah(k.initialCash) : `<span class="text-slate-400 font-mono">••••••</span>`}
        </td>
        <td class="hidden lg:table-cell py-2 px-3 font-mono text-emerald-700 font-bold text-right">
          ${cashSalesStr}
        </td>
        <td class="py-2 px-2.5 sm:px-3 font-mono font-black text-slate-900 text-right">
          ${physicalCashStr}
        </td>
        <td class="py-2 px-2.5 sm:px-3 font-mono font-black text-center ${diffColor}">
          ${diffStr}
        </td>
        <td class="py-2 px-2.5 sm:px-3 text-center">
          ${badgeStr}
        </td>
        <td class="py-2 px-2 sm:px-3 text-right whitespace-nowrap">
          <button onclick="reprintKlerkWithAuthDirect('${k.id}')" class="px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded font-bold text-[11px] cursor-pointer shadow-2xs mr-1" title="Cetak Ulang Langsung ke Printer Thermal">
            🖨️ Cetak Ulang
          </button>
          <button onclick="openKlerkReceiptWithAuthDirect('${k.id}')" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-bold text-[11px] cursor-pointer shadow-2xs" title="Lihat Pratinjau Struk Klerk">
            👁️ Struk
          </button>
        </td>
      </tr>
    `;
  }).join("");
}
