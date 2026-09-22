/**
 * SnackPOS - SIS Analytics, Shift Report & Daily Cash Recap (Fase 4)
 * Engineering Team: SnackPOS Engineering Team
 */

// ==========================================
// 1. LAPORAN PENJUALAN SHIFT KASIR (#sis-modal-report)
// ==========================================

function getTodayTransactions() {
  if (!window.pos || !Array.isArray(pos.transactions)) return [];
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  return pos.transactions.filter(t => {
    if (!t) return false;
    if (t.date && (t.date.startsWith(todayStr) || t.date === todayStr)) return true;
    if (t.createdAt && t.createdAt.startsWith(todayStr)) return true;
    return false;
  });
}

function initSisReportModal() {
  const todayTrx = getTodayTransactions();

  // 1. Hitung Omzet Bersih & Laba
  let totalTurnover = 0;
  let totalProfit = 0;
  let cashAmount = 0;
  let cashCount = 0;
  let qrisAmount = 0;
  let qrisCount = 0;
  const productCount = {};

  todayTrx.forEach(t => {
    const payable = Number(t.payableAmount !== undefined ? t.payableAmount : (t.grandTotal !== undefined ? t.grandTotal : t.total)) || 0;
    totalTurnover += payable;

    // Laba
    if (t.profit !== undefined && t.profit !== null) {
      totalProfit += Number(t.profit) || 0;
    } else {
      // Estimasi default 20% margin ritel
      totalProfit += Math.round(payable * 0.2);
    }

    // Metode Bayar
    const method = String(t.paymentMethod || t.payment || 'cash').toLowerCase();
    if (method === 'cash' || method === 'tunai') {
      cashAmount += payable;
      cashCount++;
    } else {
      qrisAmount += payable;
      qrisCount++;
    }

    // Top Produk
    (t.items || []).forEach(it => {
      const pName = it.name || 'Produk';
      const qty = Number(it.qty) || 1;
      productCount[pName] = (productCount[pName] || 0) + qty;
    });
  });

  const marginPercent = totalTurnover > 0 ? ((totalProfit / totalTurnover) * 100).toFixed(1) : '0.0';

  // 2. Render Statistik ke UI
  const turnoverEl = document.getElementById('sis-report-net-turnover');
  const trxCountEl = document.getElementById('sis-report-trx-count');
  const profitEl = document.getElementById('sis-report-net-profit');
  const marginEl = document.getElementById('sis-report-profit-margin');
  const cashSalesEl = document.getElementById('sis-report-cash-sales');
  const qrisSalesEl = document.getElementById('sis-report-qris-sales');
  const topProductsEl = document.getElementById('sis-report-top-products');

  const fmt = typeof formatRupiah === 'function' ? formatRupiah : (val) => 'Rp ' + Number(val || 0).toLocaleString('id-ID');

  if (turnoverEl) turnoverEl.textContent = fmt(totalTurnover);
  if (trxCountEl) trxCountEl.textContent = `${todayTrx.length} Transaksi Selesai`;
  if (profitEl) profitEl.textContent = `+${fmt(totalProfit)}`;
  if (marginEl) marginEl.textContent = `Margin Laba: ${marginPercent}%`;
  if (cashSalesEl) cashSalesEl.textContent = `${fmt(cashAmount)} (${cashCount} nota)`;
  if (qrisSalesEl) qrisSalesEl.textContent = `${fmt(qrisAmount)} (${qrisCount} nota)`;

  // 3. Render Top 5 Produk
  if (topProductsEl) {
    const topEntries = Object.entries(productCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (topEntries.length === 0) {
      topProductsEl.innerHTML = `
        <div class="p-3 text-center text-slate-400 bg-white border border-dashed border-slate-200 rounded-xl text-xs">
          Belum ada produk terjual hari ini.
        </div>
      `;
    } else {
      topProductsEl.innerHTML = topEntries.map(([name, qty], idx) => `
        <div class="flex items-center justify-between p-2 bg-white rounded-xl border border-slate-200/80">
          <span class="font-bold text-slate-900 truncate pr-2">${idx + 1}. ${name}</span>
          <span class="font-mono font-black text-slate-900 shrink-0">${qty} PCS</span>
        </div>
      `).join('');
    }
  }
}

function printSisShiftReportReceipt() {
  const todayTrx = getTodayTransactions();
  const s = (pos && pos.settings) || {};
  const storeName = s.storeName || 'SNACK TIME EXPRESS';
  const cashier = (pos.currentUser && pos.currentUser.name) || s.cashierName || 'Kasir';
  const shift = (pos.currentUser && pos.currentUser.shift) || s.shiftName || 'Shift 1';
  const fmt = typeof formatRupiah === 'function' ? formatRupiah : (val) => 'Rp ' + Number(val || 0).toLocaleString('id-ID');

  let totalTurnover = 0;
  let cashAmount = 0;
  let qrisAmount = 0;
  const productCount = {};

  todayTrx.forEach(t => {
    const payable = Number(t.payableAmount !== undefined ? t.payableAmount : (t.grandTotal !== undefined ? t.grandTotal : t.total)) || 0;
    totalTurnover += payable;

    const method = String(t.paymentMethod || t.payment || 'cash').toLowerCase();
    if (method === 'cash' || method === 'tunai') {
      cashAmount += payable;
    } else {
      qrisAmount += payable;
    }

    (t.items || []).forEach(it => {
      const pName = it.name || 'Produk';
      const qty = Number(it.qty) || 1;
      productCount[pName] = (productCount[pName] || 0) + qty;
    });
  });

  const top3 = Object.entries(productCount).sort((a, b) => b[1] - a[1]).slice(0, 3);
  let topStr = '';
  top3.forEach(([name, qty], i) => {
    topStr += `${i + 1}. ${name.slice(0, 20).padEnd(20)} ${String(qty).padStart(4)} PCS\n`;
  });

  const slip = 
    `--------------------------------\n` +
    `     LAPORAN PENJUALAN SHIFT    \n` +
    `      ${storeName.toUpperCase()}\n` +
    `--------------------------------\n` +
    `KASIR  : ${cashier}\n` +
    `SHIFT  : ${shift}\n` +
    `WAKTU  : ${new Date().toLocaleString('id-ID')}\n` +
    `STRUK  : ${todayTrx.length} Transaksi Selesai\n` +
    `--------------------------------\n` +
    `OMZET BERSIH : ${fmt(totalTurnover)}\n` +
    `TUNAI DI LACI: ${fmt(cashAmount)}\n` +
    `QRIS/TRANSFER: ${fmt(qrisAmount)}\n` +
    `--------------------------------\n` +
    (topStr ? `PRODUK PALING LARIS:\n${topStr}--------------------------------\n` : '') +
    `Ttd Kasir,         Ttd Supervisor,\n\n\n\n` +
    `(${cashier})          (Pejabat Toko)\n` +
    `--------------------------------\n\n\n`;

  if (typeof printRawTextEscPos === 'function' && window.isPrinterConnected) {
    printRawTextEscPos(slip);
    if (typeof showMockupToast === 'function') {
      showMockupToast('🖨️ Laporan Shift berhasil dikirim ke printer thermal!', 'success');
    }
  } else {
    console.log(slip);
    alert("🖨️ CETAK LAPORAN PENJUALAN SHIFT:\n\n" + slip);
  }
}

// ==========================================
// 2. REKAP KAS & TRANSAKSI HARIAN (#sis-modal-recap)
// ==========================================

function initSisRecapModal() {
  const todayTrx = getTodayTransactions();
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  let totalTurnover = 0;
  let cashSales = 0;
  let qrisSales = 0;
  let transferSales = 0;
  let pointDiscount = 0;

  todayTrx.forEach(t => {
    const payable = Number(t.payableAmount !== undefined ? t.payableAmount : (t.grandTotal !== undefined ? t.grandTotal : t.total)) || 0;
    totalTurnover += payable;

    const method = String(t.paymentMethod || t.payment || 'cash').toLowerCase();
    if (method === 'cash' || method === 'tunai') {
      cashSales += payable;
    } else if (method === 'transfer') {
      transferSales += payable;
    } else {
      qrisSales += payable;
    }

    pointDiscount += Number(t.pointDiscount || 0);
  });

  // Retur hari ini dari pos.returns
  let returnAmount = 0;
  if (window.pos && Array.isArray(pos.returns)) {
    const todayReturns = pos.returns.filter(r => {
      if (!r) return false;
      return (r.date && r.date.startsWith(todayStr)) || (r.createdAt && r.createdAt.startsWith(todayStr));
    });
    returnAmount = todayReturns.reduce((acc, r) => acc + (Number(r.refundAmount) || 0), 0);
  }

  // Setoran brankas / Cash Drop hari ini dari localStorage
  let cashDropAmount = 0;
  try {
    const stored = localStorage.getItem('snack_pos_cashdrops');
    if (stored) {
      const drops = JSON.parse(stored);
      if (Array.isArray(drops)) {
        const todayDrops = drops.filter(d => d.date && d.date.startsWith(todayStr));
        cashDropAmount = todayDrops.reduce((acc, d) => acc + (Number(d.amount) || 0), 0);
      }
    }
  } catch(e) {}

  // Modal awal laci kasir (default 200.000)
  const initialCash = Number(pos?.settings?.initialCash) || 200000;
  const drawerCash = Math.max(0, initialCash + cashSales - returnAmount - cashDropAmount);

  const fmt = typeof formatRupiah === 'function' ? formatRupiah : (val) => 'Rp ' + Number(val || 0).toLocaleString('id-ID');

  const turnoverEl = document.getElementById('sis-recap-net-turnover');
  const countEl = document.getElementById('sis-recap-trx-count');
  const cashEl = document.getElementById('sis-recap-cash-in');
  const qrisEl = document.getElementById('sis-recap-qris-in');
  const transferEl = document.getElementById('sis-recap-transfer-in');
  const pointsEl = document.getElementById('sis-recap-points-cut');
  const returnEl = document.getElementById('sis-recap-return-cut');
  const cashdropEl = document.getElementById('sis-recap-cashdrop-cut');
  const drawerCashEl = document.getElementById('sis-recap-drawer-cash');
  const drawerNoteEl = document.getElementById('sis-recap-drawer-note');

  if (turnoverEl) turnoverEl.textContent = fmt(totalTurnover);
  if (countEl) countEl.textContent = `${todayTrx.length} Struk Selesai`;
  if (cashEl) cashEl.textContent = fmt(cashSales);
  if (qrisEl) qrisEl.textContent = fmt(qrisSales);
  if (transferEl) transferEl.textContent = fmt(transferSales);
  if (pointsEl) pointsEl.textContent = `-${fmt(pointDiscount)}`;
  if (returnEl) returnEl.textContent = `-${fmt(returnAmount)}`;
  if (cashdropEl) cashdropEl.textContent = `-${fmt(cashDropAmount)}`;
  if (drawerCashEl) drawerCashEl.textContent = fmt(drawerCash);
  if (drawerNoteEl) drawerNoteEl.textContent = `(Termasuk modal kasir ${fmt(initialCash)})`;
}

function printSisDailyRecapReceipt() {
  const todayTrx = getTodayTransactions();
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const s = (pos && pos.settings) || {};
  const storeName = s.storeName || 'SNACK TIME EXPRESS';
  const fmt = typeof formatRupiah === 'function' ? formatRupiah : (val) => 'Rp ' + Number(val || 0).toLocaleString('id-ID');

  let totalTurnover = 0;
  let cashSales = 0;
  let qrisSales = 0;
  let transferSales = 0;
  let pointDiscount = 0;

  todayTrx.forEach(t => {
    const payable = Number(t.payableAmount !== undefined ? t.payableAmount : (t.grandTotal !== undefined ? t.grandTotal : t.total)) || 0;
    totalTurnover += payable;

    const method = String(t.paymentMethod || t.payment || 'cash').toLowerCase();
    if (method === 'cash' || method === 'tunai') {
      cashSales += payable;
    } else if (method === 'transfer') {
      transferSales += payable;
    } else {
      qrisSales += payable;
    }

    pointDiscount += Number(t.pointDiscount || 0);
  });

  let returnAmount = 0;
  if (window.pos && Array.isArray(pos.returns)) {
    const todayReturns = pos.returns.filter(r => (r.date && r.date.startsWith(todayStr)) || (r.createdAt && r.createdAt.startsWith(todayStr)));
    returnAmount = todayReturns.reduce((acc, r) => acc + (Number(r.refundAmount) || 0), 0);
  }

  let cashDropAmount = 0;
  try {
    const stored = localStorage.getItem('snack_pos_cashdrops');
    if (stored) {
      const drops = JSON.parse(stored);
      if (Array.isArray(drops)) {
        const todayDrops = drops.filter(d => d.date && d.date.startsWith(todayStr));
        cashDropAmount = todayDrops.reduce((acc, d) => acc + (Number(d.amount) || 0), 0);
      }
    }
  } catch(e) {}

  const initialCash = Number(pos?.settings?.initialCash) || 200000;
  const drawerCash = Math.max(0, initialCash + cashSales - returnAmount - cashDropAmount);

  const slip = 
    `================================\n` +
    `  REKAP KAS & TRANSAKSI HARIAN  \n` +
    `      ${storeName.toUpperCase()}\n` +
    `================================\n` +
    `TANGGAL: ${new Date().toLocaleDateString('id-ID')}\n` +
    `WAKTU  : ${new Date().toLocaleTimeString('id-ID')} WIB\n` +
    `TOTAL  : ${todayTrx.length} Struk Berhasil\n` +
    `--------------------------------\n` +
    `OMZET BERSIH    : ${fmt(totalTurnover)}\n` +
    `--------------------------------\n` +
    `RINCIAN PEMBAYARAN MASUK:\n` +
    `  Tunai (Cash)  : ${fmt(cashSales)}\n` +
    `  QRIS / E-Money: ${fmt(qrisSales)}\n` +
    `  Transfer Bank : ${fmt(transferSales)}\n` +
    `--------------------------------\n` +
    `PENGURANGAN & SETORAN:\n` +
    `  Potongan Poin : -${fmt(pointDiscount)}\n` +
    `  Retur Belanja : -${fmt(returnAmount)}\n` +
    `  Tarik Kas (Drop): -${fmt(cashDropAmount)}\n` +
    `--------------------------------\n` +
    `UANG FISIK DALAM LACI KASIR:\n` +
    `  ${fmt(drawerCash)}\n` +
    `  (Termasuk modal laci ${fmt(initialCash)})\n` +
    `================================\n` +
    `Mengetahui,\n\n\n\n` +
    `Kepala Toko / COS      Supervisor\n` +
    `================================\n\n\n`;

  if (typeof printRawTextEscPos === 'function' && window.isPrinterConnected) {
    printRawTextEscPos(slip);
    if (typeof showMockupToast === 'function') {
      showMockupToast('🖨️ Rekap Harian Kasir berhasil dikirim ke printer thermal!', 'success');
    }
  } else {
    console.log(slip);
    alert("🖨️ CETAK REKAP KAS HARIAN:\n\n" + slip);
  }
}
