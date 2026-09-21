/**
 * SnackPOS - Sales Analytics, PnL & CSV Export (F10)
 */

// ==========================================
// 9. LAPORAN PENJUALAN & LABA RUGI 30 HARI
// ==========================================
let reportDateFilter = "30days"; // 'today', '7days', '30days', 'all'

function setReportFilter(filter) {
  reportDateFilter = filter;
  ['today', '7days', '30days', 'all'].forEach(f => {
    const btn = document.getElementById(`filter-report-${f}`);
    if (btn) {
      btn.classList.toggle("bg-alfa-red", f === filter);
      btn.classList.toggle("text-white", f === filter);
      btn.classList.toggle("bg-white", f !== filter);
      btn.classList.toggle("text-slate-600", f !== filter);
    }
  });
  renderReports();
}

function getFilteredTransactions() {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  return pos.transactions.filter(t => {
    if (reportDateFilter === "all") return true;
    if (reportDateFilter === "today") return t.date === todayStr;

    const tDate = new Date(t.date);
    const diffDays = (today - tDate) / (1000 * 60 * 60 * 24);

    if (reportDateFilter === "7days") return diffDays <= 7;
    if (reportDateFilter === "30days") return diffDays <= 30;
    return true;
  });
}

function getFilteredReturns() {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  return (pos.returns || []).filter(r => {
    if (reportDateFilter === "all") return true;
    if (reportDateFilter === "today") return r.date === todayStr;

    const rDate = new Date(r.date);
    const diffDays = (today - rDate) / (1000 * 60 * 60 * 24);

    if (reportDateFilter === "7days") return diffDays <= 7;
    if (reportDateFilter === "30days") return diffDays <= 30;
    return true;
  });
}

function getFilteredLpbRecords() {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  return (pos.lpbRecords || []).filter(r => {
    if (reportDateFilter === "all") return true;
    if (reportDateFilter === "today") return r.date === todayStr;

    const rDate = new Date(r.date);
    const diffDays = (today - rDate) / (1000 * 60 * 60 * 24);

    if (reportDateFilter === "7days") return diffDays <= 7;
    if (reportDateFilter === "30days") return diffDays <= 30;
    return true;
  });
}

function renderReports() {
  const transactions = getFilteredTransactions();
  const returns = getFilteredReturns();

  // 1. Omzet & Refund Retur
  const totalOmzetGross = transactions.reduce((acc, t) => acc + (t.grandTotal || 0), 0);
  const totalRefund = returns.reduce((acc, r) => acc + (Number(r.totalRefund) || 0), 0);
  const totalOmzetNet = Math.max(0, totalOmzetGross - totalRefund);

  // 2. Modal (HPP) & Penyesuaian Laba Retur
  const grossCost = transactions.reduce((acc, t) => acc + (t.totalCost || 0), 0);
  let restockedCost = 0;
  let returnProfitLoss = 0;
  returns.forEach(r => {
    if (Array.isArray(r.items)) {
      r.items.forEach(item => {
        const costVal = (Number(item.costPrice) || 0) * (Number(item.returnQty) || 0);
        const subtotal = Number(item.refundSubtotal) || ((Number(item.price) || 0) * (Number(item.returnQty) || 0));
        if (r.restocked) {
          restockedCost += costVal;
          returnProfitLoss += (subtotal - costVal);
        } else {
          returnProfitLoss += subtotal;
        }
      });
    }
  });

  const netCost = Math.max(0, grossCost - restockedCost);
  const grossProfit = transactions.reduce((acc, t) => acc + (t.profit || 0), 0);

  // 3. Penyesuaian Nilai Stock Opname (SO) ke Laba Rugi
  const soList = getFilteredStockOpname();
  let soSurplusCost = 0;
  let soLossCost = 0;
  let soNetPcs = 0;

  soList.forEach(m => {
    const p = (pos.products || []).find(prod => prod.id === m.productId || prod.barcode === m.barcode);
    const cost = Number(m.costPrice) || (p ? (Number(p.costPrice) || Number(p.buyPrice) || 0) : 0);
    const qty = Number(m.qty) || 0;
    soNetPcs += qty;
    if (qty > 0) {
      soSurplusCost += qty * cost;
    } else if (qty < 0) {
      soLossCost += Math.abs(qty) * cost;
    }
  });

  const soCostAdjustment = soSurplusCost - soLossCost;
  const totalProfitNet = Math.max(0, grossProfit - returnProfitLoss + soCostAdjustment);

  const totalTrx = transactions.length;
  const totalReturnsCount = returns.length;
  const totalItemsSold = transactions.reduce((acc, t) => acc + t.items.reduce((s, i) => s + i.qty, 0), 0);
  const avgMargin = totalOmzetNet > 0 ? Math.round((totalProfitNet / totalOmzetNet) * 100) : 0;

  const isAuth = typeof isCurrentUserAuthorizedForFinancials === "function" ? isCurrentUserAuthorizedForFinancials() : true;

  const omzetGrossEl = document.getElementById("report-total-omzet-gross");
  const refundEl = document.getElementById("report-total-refund");
  const omzetNetEl = document.getElementById("report-total-omzet");
  const costEl = document.getElementById("report-total-cost");
  const soDiffEl = document.getElementById("report-total-so-diff");
  const soDetailEl = document.getElementById("report-so-detail");
  const profitEl = document.getElementById("report-total-profit");
  const trxCountEl = document.getElementById("report-total-transactions");
  const marginEl = document.getElementById("report-avg-margin");

  if (omzetGrossEl) {
    if (isAuth) {
      omzetGrossEl.textContent = formatRupiah(totalOmzetGross);
      omzetGrossEl.className = "text-sm sm:text-lg font-black text-slate-700 mt-0.5 sm:mt-1 font-mono";
    } else {
      omzetGrossEl.innerHTML = `<span class="text-slate-400 font-mono tracking-widest text-xs sm:text-base" title="Omzet kotor disensor untuk kasir">🔒 ••••••</span>`;
      omzetGrossEl.className = "text-sm sm:text-lg font-black text-slate-400 mt-0.5 sm:mt-1";
    }
  }

  if (refundEl) {
    if (isAuth) {
      refundEl.textContent = formatRupiah(totalRefund);
      refundEl.className = "text-sm sm:text-lg font-black text-rose-600 mt-0.5 sm:mt-1 font-mono";
    } else {
      refundEl.innerHTML = `<span class="text-rose-300 font-mono tracking-widest text-xs sm:text-base" title="Total refund disensor untuk kasir">🔒 ••••••</span>`;
      refundEl.className = "text-sm sm:text-lg font-black text-rose-300 mt-0.5 sm:mt-1";
    }
  }

  if (omzetNetEl) {
    if (isAuth) {
      omzetNetEl.textContent = formatRupiah(totalOmzetNet);
      omzetNetEl.className = "text-sm sm:text-lg font-black text-slate-950 mt-0.5 sm:mt-1 font-mono";
    } else {
      omzetNetEl.innerHTML = `<span class="text-slate-400 font-mono tracking-widest text-xs sm:text-base" title="Omzet bersih disensor untuk kasir">🔒 ••••••</span>`;
      omzetNetEl.className = "text-sm sm:text-lg font-black text-slate-400 mt-0.5 sm:mt-1";
    }
  }

  if (costEl) {
    if (isAuth) {
      costEl.textContent = formatRupiah(netCost);
      costEl.className = "text-sm sm:text-lg font-black text-slate-600 mt-0.5 sm:mt-1 font-mono";
    } else {
      costEl.innerHTML = `<span class="text-slate-400 font-mono tracking-widest text-xs sm:text-base" title="Informasi HPP disensor untuk kasir">🔒 ••••••</span>`;
      costEl.className = "text-sm sm:text-lg font-black text-slate-400 mt-0.5 sm:mt-1";
    }
  }

  if (soDiffEl) {
    if (isAuth) {
      if (soCostAdjustment > 0) {
        soDiffEl.textContent = `+ ${formatRupiah(soCostAdjustment)}`;
        soDiffEl.className = "text-sm sm:text-lg font-black text-emerald-600 mt-0.5 sm:mt-1 font-mono";
      } else if (soCostAdjustment < 0) {
        soDiffEl.textContent = `- ${formatRupiah(Math.abs(soCostAdjustment))}`;
        soDiffEl.className = "text-sm sm:text-lg font-black text-rose-600 mt-0.5 sm:mt-1 font-mono";
      } else {
        soDiffEl.textContent = "Rp 0";
        soDiffEl.className = "text-sm sm:text-lg font-black text-slate-700 mt-0.5 sm:mt-1 font-mono";
      }
    } else {
      soDiffEl.innerHTML = `<span class="text-purple-400 font-mono tracking-widest text-xs sm:text-base" title="Nilai rupiah selisih disensor untuk kasir">🔒 ••••••</span>`;
      soDiffEl.className = "text-sm sm:text-lg font-black text-purple-400 mt-0.5 sm:mt-1";
    }
  }

  if (soDetailEl) {
    soDetailEl.textContent = `Audit Fisik: ${soNetPcs >= 0 ? '+' : ''}${soNetPcs} pcs (${soList.length} SO)`;
  }

  if (profitEl) {
    if (isAuth) {
      profitEl.textContent = formatRupiah(totalProfitNet);
      profitEl.className = "text-sm sm:text-lg font-black text-emerald-600 mt-0.5 sm:mt-1 font-mono";
    } else {
      profitEl.innerHTML = `<span class="text-slate-400 font-mono tracking-widest text-xs sm:text-base" title="Informasi laba bersih disensor untuk kasir">🔒 ••••••</span>`;
      profitEl.className = "text-sm sm:text-lg font-black text-slate-400 mt-0.5 sm:mt-1";
    }
  }

  if (trxCountEl) trxCountEl.textContent = `${formatAngka(totalTrx)} Struk (${formatAngka(totalItemsSold)} pcs)`;
  if (marginEl) marginEl.textContent = isAuth ? `${avgMargin}%` : `••%`;

  // 4. Update KPI Kartu Penerimaan Barang (LPB per Supplier)
  const lpbList = getFilteredLpbRecords();
  const totalLpbVal = lpbList.reduce((acc, r) => acc + (Number(r.totalValue) || 0), 0);
  const totalLpbCount = lpbList.length;

  const lpbValEl = document.getElementById("report-total-lpb-val");
  const lpbCountEl = document.getElementById("report-total-lpb-count");
  if (lpbValEl) {
    if (isAuth) {
      lpbValEl.textContent = formatRupiah(totalLpbVal);
      lpbValEl.className = "text-sm sm:text-lg font-black text-teal-700 mt-0.5 sm:mt-1 font-mono";
    } else {
      lpbValEl.innerHTML = `<span class="text-slate-400 font-mono tracking-widest text-xs sm:text-base" title="Nominal LPB disensor untuk kasir">🔒 ••••••</span>`;
      lpbValEl.className = "text-sm sm:text-lg font-black text-slate-400 mt-0.5 sm:mt-1";
    }
  }
  if (lpbCountEl) {
    lpbCountEl.textContent = `${totalLpbCount} Dokumen Masuk`;
  }

  // Top 10 Snack Terlaris
  const snackMap = {};
  transactions.forEach(t => {
    t.items.forEach(i => {
      if (!snackMap[i.name]) snackMap[i.name] = { name: i.name, emoji: i.emoji, qty: 0, revenue: 0 };
      snackMap[i.name].qty += i.qty;
      snackMap[i.name].revenue += i.price * i.qty;
    });
  });

  const topSnacks = Object.values(snackMap).sort((a, b) => b.qty - a.qty).slice(0, 10);
  const topContainer = document.getElementById("top-snacks-container");
  if (topContainer) {
    const maxQty = topSnacks[0]?.qty || 1;
    topContainer.innerHTML = topSnacks.map((s, idx) => `
      <div class="space-y-1">
        <div class="flex justify-between text-xs font-semibold">
          <span>#${idx + 1} ${s.emoji || '🍪'} ${s.name}</span>
          <span class="font-mono text-alfa-red">${s.qty} pcs${isAuth ? ` (${formatRupiah(s.revenue)})` : ` <span class="text-slate-400 font-mono" title="Nominal penjualan disensor">(••••••)</span>`}</span>
        </div>
        <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
          <div class="bg-alfa-red h-2 rounded-full" style="width: ${Math.round((s.qty / maxQty) * 100)}%"></div>
        </div>
      </div>
    `).join("");
  }

  // Tabel Riwayat Transaksi
  const tbody = document.getElementById("transactions-table-body");
  if (tbody) {
    tbody.innerHTML = transactions.slice(0, 50).map(t => {
      const summary = t.items.map(i => `${i.name} (${i.qty})`).join(", ");
      return `
        <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs">
          <td class="py-2 px-2.5 sm:px-3 font-mono font-bold text-blue-700">${t.id}</td>
          <td class="hidden sm:table-cell py-2 px-3 text-slate-600">${t.date} <span class="text-slate-400">${t.time}</span></td>
          <td class="hidden md:table-cell py-2 px-3 text-slate-600">${t.cashier}</td>
          <td class="hidden lg:table-cell py-2 px-3 truncate max-w-xs text-slate-600" title="${summary}">${summary}</td>
          <td class="py-2 px-2.5 sm:px-3 font-mono font-bold ${isAuth ? 'text-slate-900' : 'text-slate-400'}">
            ${isAuth ? formatRupiah(t.grandTotal) : `<span title="Nominal total bayar disensor untuk kasir">••••••</span>`}
          </td>
          <td class="hidden sm:table-cell py-2 px-3 font-mono ${isAuth ? 'text-emerald-600 font-bold' : 'text-slate-400 font-medium'}">
            ${isAuth ? `+${formatRupiah(t.profit || 0)}` : `<span title="Laba bersih disensor untuk kasir">••••••</span>`}
          </td>
          <td class="hidden md:table-cell py-2 px-3 text-center">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${t.paymentMethod === 'cash' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}">
              ${t.paymentMethod}
            </span>
          </td>
          <td class="py-2 px-2 sm:px-3 text-right whitespace-nowrap">
            <button onclick="reprintTransactionById('${t.id}')" class="px-2 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded font-bold text-[11px] mr-1 cursor-pointer shadow-2xs" title="Cetak Ulang Struk Langsung ke Printer Thermal">
              🖨️ Cetak
            </button>
            <button onclick="openReceiptModalById('${t.id}')" class="px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded font-bold text-[11px] mr-1 cursor-pointer" title="Lihat & Pratinjau Struk Penjualan">
              👁️ Struk
            </button>
            <button onclick="openReturModal('${t.id}')" class="px-2 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded font-bold text-[11px] cursor-pointer" title="Retur Barang dengan No. Struk Ini">
              Retur
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  // Render Tabel Riwayat Retur, SO, Klerk & LPB
  renderReturnsHistoryTable();
  renderStockOpnameHistoryTable();
  renderKlerkHistoryTable();
  renderLpbReportsTable();

  // Pastikan tombol sensor laba di header menampilkan status yang sesuai
  if (typeof updateDashboardButtonState === "function") updateDashboardButtonState();
}

// Render Tabel Riwayat Penerimaan Barang (LPB per Supplier) di Tab Laporan Kasir
function renderLpbReportsTable() {
  const tbody = document.getElementById("report-lpb-table-body");
  if (!tbody) return;

  const lpbs = getFilteredLpbRecords();
  const isAuth = typeof isCurrentUserAuthorizedForFinancials === "function" ? isCurrentUserAuthorizedForFinancials() : true;

  if (lpbs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="py-8 text-center text-slate-400 text-xs">Belum ada data penerimaan barang (LPB) pada periode filter ini.</td></tr>`;
    return;
  }

  tbody.innerHTML = lpbs.map(r => {
    const totalValStr = isAuth ? formatRupiah(r.totalValue || 0) : `<span title="Nominal LPB disensor untuk kasir">••••••</span>`;
    const skuQty = `${r.totalItems || (r.items ? r.items.length : 0)} SKU / ${r.totalQty || 0} pcs`;
    return `
      <tr class="border-b border-slate-100 hover:bg-emerald-50/40 text-xs transition-colors">
        <td class="py-2.5 px-2.5 sm:px-3 font-mono font-bold text-emerald-700 whitespace-nowrap">${r.id}</td>
        <td class="hidden sm:table-cell py-2.5 px-3 text-slate-600 whitespace-nowrap">${r.date} <span class="text-slate-400 text-[10px]">${r.time || ''}</span></td>
        <td class="py-2.5 px-2.5 sm:px-3 font-bold text-slate-800">${r.supplierName || '-'}</td>
        <td class="hidden md:table-cell py-2.5 px-3 font-mono text-slate-500 text-[11px] whitespace-nowrap">${r.invoiceNo || '-'}</td>
        <td class="hidden lg:table-cell py-2.5 px-3 text-center whitespace-nowrap">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${
            r.paymentType === 'TUNAI' ? 'bg-emerald-100 text-emerald-800' :
            r.paymentType === 'TRANSFER' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
          }">${r.paymentType || 'KREDIT'}</span>
        </td>
        <td class="py-2.5 px-2.5 sm:px-3 text-center font-bold text-slate-700 whitespace-nowrap">${skuQty}</td>
        <td class="py-2.5 px-2.5 sm:px-3 text-right font-mono font-bold ${isAuth ? 'text-emerald-700' : 'text-slate-400'} whitespace-nowrap">
          ${totalValStr}
        </td>
        <td class="py-2.5 px-2.5 sm:px-3 text-right whitespace-nowrap">
          <button onclick="showLpbDetailModal('${r.id}')" class="px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg font-bold text-[11px] cursor-pointer" title="Lihat rincian item & cetak struk LPB">
            Lihat / Cetak
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

function exportTransactionsCSV() {
  const transactions = getFilteredTransactions();
  if (transactions.length === 0) {
    showToast("Tidak ada transaksi untuk diekspor!", "warning");
    return;
  }

  const isAuth = typeof isCurrentUserAuthorizedForFinancials === "function" ? isCurrentUserAuthorizedForFinancials() : true;

  let csv = "data:text/csv;charset=utf-8,";
  csv += "No Struk,Tanggal,Waktu,Kasir,Shift,Jumlah Item,Subtotal,Diskon,Grand Total,Total Modal,Laba Bersih,Metode\n";

  transactions.forEach(t => {
    const totalQty = t.items.reduce((s, i) => s + i.qty, 0);
    const subtotalVal = isAuth ? (t.subtotal || 0) : "***";
    const discountVal = isAuth ? (t.discountAmount || 0) : "***";
    const grandTotalVal = isAuth ? (t.grandTotal || 0) : "***";
    const costVal = isAuth ? (t.totalCost || 0) : "***";
    const profitVal = isAuth ? (t.profit || 0) : "***";
    csv += [
      t.id, t.date, t.time, `"${t.cashier}"`, `"${t.shift}"`,
      totalQty, subtotalVal, discountVal, grandTotalVal,
      costVal, profitVal, t.paymentMethod
    ].join(",") + "\n";
  });

  const returns = getFilteredReturns();
  if (returns.length > 0) {
    csv += "\n--- RIWAYAT RETUR BARANG & REFUND ---\n";
    csv += "No Retur,No Struk Asal,Tanggal,Waktu,Kasir,Alasan Retur,Total Refund,Status Restok\n";
    returns.forEach(r => {
      const refundVal = isAuth ? (r.totalRefund || 0) : "***";
      csv += [
        r.id, r.originalTrxId, r.date, r.time, `"${r.cashier}"`,
        `"${r.reason}"`, refundVal, r.restocked ? "Masuk Rak" : "Tidak Restok"
      ].join(",") + "\n";
    });
  }

  const lpbs = getFilteredLpbRecords();
  if (lpbs.length > 0) {
    csv += "\n--- RIWAYAT PENERIMAAN BARANG MASUK (LPB SUPPLIER) ---\n";
    csv += "No LPB,Tanggal,Waktu,Supplier,No Faktur,Metode Bayar,Total SKU,Total Qty,Total Nilai,Operator\n";
    lpbs.forEach(l => {
      const valStr = isAuth ? (l.totalValue || 0) : "***";
      csv += [
        l.id, l.date, l.time || '', `"${l.supplierName || ''}"`,
        `"${l.invoiceNo || ''}"`, l.paymentType || 'KREDIT',
        l.totalItems || (l.items ? l.items.length : 0),
        l.totalQty || 0, valStr, `"${l.operator || 'Kasir'}"`
      ].join(",") + "\n";
    });
  }

  const encoded = encodeURI(csv);
  const link = document.createElement("a");
  link.setAttribute("href", encoded);
  link.setAttribute("download", `Laporan_Penjualan_Retail_${new Date().toISOString().split("T")[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast(isAuth ? "File Laporan Excel/CSV berhasil diunduh!" : "Laporan Excel/CSV diunduh (Nominal rupiah disensor untuk kasir)", "success");
}
