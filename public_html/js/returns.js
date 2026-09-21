/**
 * SnackPOS - Sales Returns & Receipt Verification (F3)
 */

// ==========================================
// 4b. MODUL RETUR PENJUALAN KASIR (SYARAT NOMOR STRUK)
// Mengembalikan Barang, Tambah Stok & Cetak Struk Retur
// ==========================================
let activeReturTrx = null;
let activeReturItemQtys = {}; // { [productId]: returnQty }
let lastCompletedRetur = null;

function getAlreadyReturnedQty(trxId, productId) {
  if (!pos.returns || pos.returns.length === 0) return 0;
  let returnedCount = 0;
  pos.returns.forEach(r => {
    if (r.originalTrxId === trxId && Array.isArray(r.items)) {
      r.items.forEach(item => {
        if (item.id === productId) {
          returnedCount += (Number(item.returnQty) || 0);
        }
      });
    }
  });
  return returnedCount;
}

function toggleReturRecentChips(forceState = null) {
  const chips = document.getElementById("retur-recent-chips");
  const label = document.getElementById("label-toggle-retur-recent");
  const icon = document.getElementById("icon-toggle-retur-recent");
  if (!chips) return;

  const isHidden = chips.classList.contains("hidden");
  const shouldShow = forceState !== null ? forceState : isHidden;

  if (shouldShow) {
    chips.classList.remove("hidden");
    if (label) label.textContent = "Sembunyikan";
    if (icon) icon.textContent = "▲";
  } else {
    chips.classList.add("hidden");
    if (label) label.textContent = "Tampilkan 5 Struk";
    if (icon) icon.textContent = "▼";
  }
}

function openReturModal(prefillInvoiceId = "") {
  requestSupervisorAuth("RETUR_SALE", "Retur Barang & Refund Struk Kasir [F3]", () => {
    executeOpenReturModal(prefillInvoiceId);
  });
}

function executeOpenReturModal(prefillInvoiceId = "") {
  activeReturTrx = null;
  activeReturItemQtys = {};

  const input = document.getElementById("retur-invoice-input");
  if (input) {
    input.value = prefillInvoiceId ? prefillInvoiceId.trim().toUpperCase() : "";
  }

  const infoBox = document.getElementById("retur-trx-info-box");
  const itemsSection = document.getElementById("retur-items-section");
  const emptyPlaceholder = document.getElementById("retur-empty-placeholder");
  const btnExec = document.getElementById("btn-execute-retur");
  const refundDisp = document.getElementById("retur-total-refund-display");

  if (infoBox) infoBox.classList.add("hidden");
  if (itemsSection) itemsSection.classList.add("hidden");
  if (emptyPlaceholder) emptyPlaceholder.classList.remove("hidden");
  if (btnExec) btnExec.disabled = true;
  if (refundDisp) refundDisp.textContent = "Rp 0";

  // Pastikan shortcut struk ditampilkan saat pertama buka modal jika belum ada prefill
  toggleReturRecentChips(!prefillInvoiceId);

  // Render 5 nomor struk transaksi terbaru sebagai shortcut kartu yang lega & informatif
  const chipsContainer = document.getElementById("retur-recent-chips");
  if (chipsContainer) {
    const recent5 = pos.transactions.slice(0, 5);
    if (recent5.length === 0) {
      chipsContainer.innerHTML = `<div class="col-span-full py-2 text-center text-xs text-slate-400 italic bg-slate-50 rounded-xl border border-dashed border-slate-200">Belum ada data transaksi toko yang tersimpan.</div>`;
    } else {
      chipsContainer.innerHTML = recent5.map(t => {
        const timeStr = t.date ? (t.date.split("T")[1]?.substring(0, 5) || t.date.substring(11, 16) || "") : "";
        const cashierShort = t.cashier ? (t.cashier.length > 10 ? t.cashier.substring(0, 9) + '…' : t.cashier) : "Kasir";
        const totalRp = formatRupiah(t.grandTotal || t.total || 0);
        return `
          <button 
            type="button" 
            onclick="selectRecentInvoiceForRetur('${t.id}')"
            class="min-w-[170px] sm:min-w-0 flex-shrink-0 sm:flex-shrink p-2.5 bg-white hover:bg-amber-50/90 border border-slate-200 hover:border-amber-400 rounded-xl text-left shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between gap-1 cursor-pointer group"
            title="Klik untuk memilih struk ${t.id}"
          >
            <div class="flex items-center justify-between gap-1">
              <span class="font-mono font-black text-xs text-slate-900 group-hover:text-amber-900 truncate">${t.id}</span>
              <span class="text-[10px] px-1.5 py-0.5 bg-slate-100 group-hover:bg-amber-200 text-slate-600 group-hover:text-amber-950 rounded font-semibold whitespace-nowrap">${timeStr || 'Struk'}</span>
            </div>
            <div class="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100">
              <span class="text-slate-500 text-[10px] truncate max-w-[70px]">${cashierShort}</span>
              <span class="font-mono font-bold text-emerald-700 text-xs">${totalRp}</span>
            </div>
          </button>
        `;
      }).join("");
    }
  }

  openModal("modal-retur-transaksi");

  if (prefillInvoiceId) {
    searchTransactionForRetur();
  } else {
    setTimeout(() => {
      if (input) {
        input.focus();
        input.select();
      }
    }, 150);
  }
}

function selectRecentInvoiceForRetur(invoiceId) {
  const input = document.getElementById("retur-invoice-input");
  if (input) input.value = invoiceId;
  searchTransactionForRetur();
}

function searchTransactionForRetur() {
  const input = document.getElementById("retur-invoice-input");
  if (!input) return;

  const query = input.value.trim().toUpperCase();
  if (!query) {
    showToast("Harap masukkan nomor struk transaksi belanja!", "warning");
    sfx.warning();
    input.focus();
    return;
  }

  // Cari transaksi berdasarkan ID struk
  const cleanQ = query.replace(/[^A-Z0-9]/g, '');
  const matched = pos.transactions.find(t => {
    const cleanId = t.id.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return t.id.toUpperCase() === query || cleanId === cleanQ || t.id.toUpperCase().includes(query);
  });

  if (!matched) {
    showToast(`Nomor Struk "${query}" tidak ditemukan di database kasir!`, "error");
    sfx.warning();
    input.select();
    return;
  }

  activeReturTrx = matched;
  activeReturItemQtys = {};

  // Sembunyikan chips shortcut agar area item retur terlihat lega dan tidak tertutup
  toggleReturRecentChips(false);

  // Tampilkan informasi transaksi belanja asal
  const infoBox = document.getElementById("retur-trx-info-box");
  const itemsSection = document.getElementById("retur-items-section");
  const emptyPlaceholder = document.getElementById("retur-empty-placeholder");
  const tbody = document.getElementById("retur-items-tbody");

  document.getElementById("retur-info-id").textContent = matched.id;
  document.getElementById("retur-info-datetime").textContent = `${matched.date} ${matched.time}`;
  document.getElementById("retur-info-cashier").textContent = `${matched.cashier || 'Kasir'} (${matched.shift || 'Shift 1'})`;
  document.getElementById("retur-info-total").textContent = `${formatRupiah(matched.grandTotal)} • ${(matched.paymentMethod || 'TUNAI').toUpperCase()}`;

  if (infoBox) infoBox.classList.remove("hidden");
  if (emptyPlaceholder) emptyPlaceholder.classList.add("hidden");
  if (itemsSection) itemsSection.classList.remove("hidden");

  // Render daftar item dari struk belanja
  let totalAvailableReturnable = 0;

  if (tbody && Array.isArray(matched.items)) {
    tbody.innerHTML = matched.items.map(item => {
      const alreadyReturned = getAlreadyReturnedQty(matched.id, item.id);
      const maxReturnable = Math.max(0, item.qty - alreadyReturned);
      activeReturItemQtys[item.id] = 0;
      totalAvailableReturnable += maxReturnable;

      if (maxReturnable > 0) {
        return `
          <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs">
            <td class="py-2.5 px-3">
              <div class="font-bold text-slate-900">${item.name}</div>
              <div class="text-[10px] text-slate-400 font-mono">PLU: ${item.barcode || item.id}</div>
            </td>
            <td class="py-2.5 px-3 text-center font-mono">
              <span class="font-bold text-slate-800">${item.qty} ${item.unit || 'pcs'}</span>
              ${alreadyReturned > 0 ? `<div class="text-[9px] text-rose-600 font-semibold">(Sdh retur: ${alreadyReturned})</div>` : ''}
            </td>
            <td class="py-2.5 px-3 text-center font-mono text-slate-600">
              ${formatRupiah(item.price)}
            </td>
            <td class="py-2.5 px-3 text-center bg-amber-50/70">
              <div class="flex items-center justify-center gap-1.5">
                <button 
                  type="button" 
                  onclick="adjustReturQty('${item.id}', -1, ${maxReturnable})" 
                  class="w-7 h-7 rounded-lg bg-slate-200 hover:bg-slate-300 font-black text-slate-800 flex items-center justify-center transition-colors"
                >-</button>
                <input 
                  type="number" 
                  id="retur-qty-${item.id}" 
                  min="0" 
                  max="${maxReturnable}" 
                  value="0"
                  oninput="onReturQtyChange('${item.id}', this.value, ${maxReturnable})"
                  class="w-12 py-1 text-center font-mono font-bold text-xs border border-amber-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button 
                  type="button" 
                  onclick="adjustReturQty('${item.id}', 1, ${maxReturnable})" 
                  class="w-7 h-7 rounded-lg bg-slate-200 hover:bg-slate-300 font-black text-slate-800 flex items-center justify-center transition-colors"
                >+</button>
              </div>
              <div class="text-[10px] text-slate-500 mt-1 font-semibold">Maks: ${maxReturnable} ${item.unit || 'pcs'}</div>
            </td>
            <td class="py-2.5 px-3 text-right font-mono font-bold text-amber-700" id="retur-subtotal-${item.id}">
              Rp 0
            </td>
          </tr>
        `;
      } else {
        return `
          <tr class="border-b border-slate-100 bg-slate-50/80 text-xs opacity-70">
            <td class="py-2.5 px-3 font-semibold text-slate-600">${item.name}</td>
            <td class="py-2.5 px-3 text-center font-mono">${item.qty} ${item.unit || 'pcs'}</td>
            <td class="py-2.5 px-3 text-center font-mono text-slate-500">${formatRupiah(item.price)}</td>
            <td class="py-2.5 px-3 text-center">
              <span class="px-2 py-0.5 bg-rose-100 text-rose-800 rounded-full font-bold text-[10px]">
                Semua Sudah Diretur
              </span>
            </td>
            <td class="py-2.5 px-3 text-right font-mono text-slate-400">Rp 0</td>
          </tr>
        `;
      }
    }).join("");
  }

  recalcReturTotals();
  sfx.beep();

  if (totalAvailableReturnable === 0) {
    showToast(`Semua barang pada struk "${matched.id}" sudah diretur sebelumnya!`, "warning");
  } else {
    showToast(`Struk "${matched.id}" terverifikasi! Tentukan barang & qty yang diretur.`, "success");
  }
}

function adjustReturQty(productId, delta, maxQty) {
  const current = activeReturItemQtys[productId] || 0;
  const nextVal = Math.max(0, Math.min(maxQty, current + delta));
  const input = document.getElementById(`retur-qty-${productId}`);
  if (input) input.value = nextVal;
  onReturQtyChange(productId, nextVal, maxQty);
}

function onReturQtyChange(productId, val, maxQty) {
  let parsed = parseInt(val) || 0;
  if (parsed < 0) parsed = 0;
  if (parsed > maxQty) parsed = maxQty;

  activeReturItemQtys[productId] = parsed;
  const input = document.getElementById(`retur-qty-${productId}`);
  if (input && parseInt(input.value) !== parsed) input.value = parsed;

  const item = activeReturTrx?.items?.find(i => i.id === productId);
  const subtotalEl = document.getElementById(`retur-subtotal-${productId}`);
  if (item && subtotalEl) {
    subtotalEl.textContent = formatRupiah(parsed * item.price);
  }

  recalcReturTotals();
}

function recalcReturTotals() {
  let totalRefund = 0;
  let totalQty = 0;

  if (activeReturTrx && Array.isArray(activeReturTrx.items)) {
    activeReturTrx.items.forEach(item => {
      const qty = activeReturItemQtys[item.id] || 0;
      if (qty > 0) {
        totalRefund += qty * item.price;
        totalQty += qty;
      }
    });
  }

  const refundDisp = document.getElementById("retur-total-refund-display");
  if (refundDisp) refundDisp.textContent = formatRupiah(totalRefund);

  const btnExec = document.getElementById("btn-execute-retur");
  if (btnExec) {
    btnExec.disabled = (totalQty === 0);
  }
}

function executeProcessRetur() {
  if (!activeReturTrx) return;

  const returnedItems = [];
  let totalRefund = 0;

  activeReturTrx.items.forEach(item => {
    const qty = activeReturItemQtys[item.id] || 0;
    if (qty > 0) {
      const refundSubtotal = qty * item.price;
      returnedItems.push({
        id: item.id,
        name: item.name,
        barcode: item.barcode || '',
        price: item.price,
        costPrice: item.costPrice || 0,
        unit: item.unit || 'Bungkus',
        returnQty: qty,
        refundSubtotal: refundSubtotal
      });
      totalRefund += refundSubtotal;
    }
  });

  if (returnedItems.length === 0) {
    showToast("Pilih minimal 1 barang yang akan diretur!", "warning");
    sfx.warning();
    return;
  }

  const reasonEl = document.getElementById("retur-reason-select");
  const restockCheck = document.getElementById("retur-restock-check");

  const reason = reasonEl ? reasonEl.value : "Kemasan Rusak / Bocor";
  const restock = restockCheck ? restockCheck.checked : true;
  const totalUnits = returnedItems.reduce((acc, i) => acc + i.returnQty, 0);

  const confirmMsg = `Konfirmasi Proses Retur Kasir Retail:\n\n` +
    `• No. Struk Belanja: ${activeReturTrx.id}\n` +
    `• Jumlah Barang Diretur: ${totalUnits} pcs\n` +
    `• Total Refund Uang Tunai: ${formatRupiah(totalRefund)}\n` +
    `• Alasan Retur: ${reason}\n` +
    `• Tambahkan Kembali ke Stok: ${restock ? 'YA (Stok Bertambah)' : 'TIDAK'}\n\n` +
    `Lanjutkan proses retur & cetak struk retur?`;

  if (!confirm(confirmMsg)) return;

  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toLocaleTimeString("id-ID", { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const returnId = `RTR-${dateStr.replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

  // 1. Jika opsi restok dicentang, kembalikan stok barang & catat mutasi stok
  if (restock) {
    returnedItems.forEach(retItem => {
      const prod = pos.products.find(p => p.id === retItem.id);
      if (prod) {
        prod.stock += retItem.returnQty;
      }

      pos.mutations.unshift({
        id: `MUT-RTR-${Date.now().toString().slice(-6)}-${retItem.id}`,
        date: dateStr,
        time: timeStr,
        type: "RETURN_SALE",
        productId: retItem.id,
        productName: retItem.name,
        barcode: retItem.barcode,
        qty: retItem.returnQty, // Bernilai positif karena menambah stok kembali
        note: `Retur Struk: ${activeReturTrx.id} (${reason})`,
        operator: pos.settings.cashierName || "Kasir"
      });
    });

    pos.saveProducts();
    pos.saveMutations();
  }

  // 2. Simpan Rekam Retur Penjualan
  const activeCashierUser = pos.currentUser || {
    nik: pos.settings.cashierNik || "1001",
    name: pos.settings.cashierName || "Kasir",
    role: "CREW",
    shift: pos.settings.shiftName || "Shift 1"
  };

  const returnRecord = {
    id: returnId,
    originalTrxId: activeReturTrx.id,
    date: dateStr,
    time: timeStr,
    createdAt: now.toISOString(),
    cashier: activeCashierUser.name,
    cashierNik: activeCashierUser.nik,
    cashierRole: activeCashierUser.role,
    shift: activeCashierUser.shift || pos.settings.shiftName || "Shift 1",
    klerkId: null,
    reason: reason,
    restocked: restock,
    items: returnedItems,
    totalRefund: totalRefund
  };

  pos.returns.unshift(returnRecord);
  pos.saveReturns();

  // 3. Perbarui seluruh tampilan UI terkait
  renderPosCart();
  renderInventoryTable();
  renderMutationHistoryTable();
  renderReturnsHistoryTable();
  renderReports();
  if (posViewMode === "touch") renderTouchGrid();

  // 4. Sinkronisasi instan retur ke Supabase jika terhubung
  if (pos.settings.supabaseUrl && pos.settings.supabaseKey && navigator.onLine) {
    if (!supabaseClient && window.supabase) {
      try {
        const u = cleanSupabaseUrl(pos.settings.supabaseUrl);
        const k = cleanSupabaseKey(pos.settings.supabaseKey);
        if (u && k) supabaseClient = window.supabase.createClient(u, k);
      } catch (e) {
        console.warn("Init supabase gagal di retur:", e);
      }
    }

    if (supabaseClient) {
      supabaseClient
        .from('returns')
        .upsert([{
          id: returnRecord.id,
          original_trx_id: returnRecord.originalTrxId,
          date: returnRecord.date,
          time: returnRecord.time,
          cashier: returnRecord.cashier,
          shift: returnRecord.shift,
          reason: returnRecord.reason,
          restocked: returnRecord.restocked,
          items: returnRecord.items,
          total_refund: Number(returnRecord.totalRefund) || 0,
          created_at: returnRecord.createdAt
        }], { onConflict: 'id' })
        .then(({ error }) => {
          if (error) console.warn("Peringatan sinkron instan retur:", error.message);
          else console.log("Retur sukses terkirim ke Supabase:", returnRecord.id);
        })
        .catch(e => console.warn("Catch retur:", e));
    }
    syncToSupabase(true);
  }

  sfx.beep();
  closeModal("modal-retur-transaksi");
  openReturReceiptModal(returnRecord);
  showToast(`Retur ${returnId} berhasil! Stok bertambah & dana refund siap dikembalikan.`, "success");
}

function openReturReceiptModal(returRecord) {
  if (!returRecord) return;
  lastCompletedRetur = returRecord;

  const receiptContent = document.getElementById("thermal-receipt-retur-content");
  if (!receiptContent) return;

  const is80 = pos.settings.paperWidth === "80mm";
  receiptContent.className = `thermal-receipt ${is80 ? 'width-80' : 'width-58'}`;

  const itemsHtml = returRecord.items.map(item => `
    <div class="mb-1">
      <div class="font-bold text-left">${item.name}</div>
      <div class="flex justify-between text-slate-700">
        <span>${item.returnQty} ${item.unit || 'pcs'} x ${formatAngka(item.price)}</span>
        <span class="font-bold">${formatAngka(item.refundSubtotal)}</span>
      </div>
    </div>
  `).join("");

  receiptContent.innerHTML = `
    <div class="text-center mb-2">
      <div class="font-black text-base tracking-wider uppercase">${pos.settings.storeName}</div>
      <div class="text-[10px] text-slate-600 leading-tight">${pos.settings.storeAddress}</div>
      <div class="text-[10px] text-slate-600 leading-tight">Telp: ${pos.settings.storePhone}</div>
      <div class="font-black text-xs mt-2 uppercase border-t border-b border-dashed border-slate-600 py-1 tracking-wider">
        *** STRUK BUKTI RETUR PENJUALAN ***
      </div>
    </div>

    <div class="text-[10px] leading-relaxed">
      <div class="flex justify-between">
        <span>No. Retur</span>
        <span class="font-bold font-mono text-rose-700">${returRecord.id}</span>
      </div>
      <div class="flex justify-between">
        <span>No. Struk Asal</span>
        <span class="font-bold font-mono">${returRecord.originalTrxId}</span>
      </div>
      <div class="flex justify-between">
        <span>Waktu Retur</span>
        <span>${returRecord.date} ${returRecord.time}</span>
      </div>
      <div class="flex justify-between">
        <span>Kasir / Shift</span>
        <span>${returRecord.cashier} (${returRecord.shift})</span>
      </div>
      <div class="flex justify-between">
        <span>Alasan Retur</span>
        <span class="italic font-bold">${returRecord.reason}</span>
      </div>
      <div class="flex justify-between">
        <span>Status Stok Rak</span>
        <span class="font-bold ${returRecord.restocked ? 'text-emerald-700' : 'text-slate-600'}">
          ${returRecord.restocked ? '✅ Stok Bertambah (Restok)' : '❌ Tidak Direstok'}
        </span>
      </div>
    </div>

    <div class="receipt-dashed-line"></div>

    <div class="text-[11px] my-1.5">
      ${itemsHtml}
    </div>

    <div class="receipt-dashed-line"></div>

    <div class="text-[11px] leading-relaxed">
      <div class="flex justify-between font-extrabold text-xs pt-1 border-t border-dashed border-slate-500 mt-1 text-rose-700">
        <span>TOTAL DANA REFUND</span>
        <span class="text-sm font-bold font-mono">${formatRupiah(returRecord.totalRefund)}</span>
      </div>
      <div class="flex justify-between mt-1 text-[10px] text-slate-600">
        <span>Metode Pengembalian</span>
        <span class="font-bold">UANG TUNAI KASIR</span>
      </div>
    </div>

    <div class="receipt-double-line"></div>

    <!-- Tanda Tangan Verifikasi Kasir & Pelanggan -->
    <div class="grid grid-cols-2 gap-4 text-center text-[10px] my-3 pt-1">
      <div>
        <div class="text-slate-600">Kasir / Pejabat Toko</div>
        <div class="h-9"></div>
        <div class="font-bold border-t border-dotted border-slate-400 pt-0.5">${returRecord.cashier}</div>
      </div>
      <div>
        <div class="text-slate-600">Pelanggan Penerima</div>
        <div class="h-9"></div>
        <div class="font-bold border-t border-dotted border-slate-400 pt-0.5">(....................)</div>
      </div>
    </div>

    <div class="text-center text-[9px] text-slate-500 mt-2 space-y-0.5 whitespace-pre-line">
      Barang retur telah diverifikasi keasliannya.\nStok komputer toko dan laporan laba rugi telah disesuaikan.\nTerima kasih.
    </div>
  `;

  openModal("modal-receipt-retur");
}

function printReturReceipt() {
  if (typeof printReturReceiptUniversal === "function") {
    printReturReceiptUniversal(lastCompletedRetur);
    return;
  }
  if (typeof preparePrintableReturReceipt === "function") {
    preparePrintableReturReceipt(lastCompletedRetur);
  }
  window.print();
}

function renderReturnsHistoryTable() {
  const tbody = document.getElementById("returns-table-body");
  if (!tbody) return;

  const returns = typeof getFilteredReturns === "function" ? getFilteredReturns() : (pos.returns || []);
  const isAuth = typeof isCurrentUserAuthorizedForFinancials === "function" ? isCurrentUserAuthorizedForFinancials() : true;

  if (returns.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="py-8 text-center text-slate-400 text-xs">
          Belum ada riwayat retur barang pada periode ini. Klik tombol <strong>+ Buat Retur Baru</strong> untuk memproses retur.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = returns.map(r => {
    const totalQty = r.items.reduce((s, i) => s + (i.returnQty || 0), 0);
    const itemNames = r.items.map(i => `${i.name} (${i.returnQty} pcs)`).join(", ");

    return `
      <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs">
        <td class="py-2 px-2.5 sm:px-3 font-mono font-bold text-rose-700">${r.id}</td>
        <td class="hidden sm:table-cell py-2 px-3 font-mono text-blue-700 font-bold">${r.originalTrxId}</td>
        <td class="hidden md:table-cell py-2 px-3 text-slate-600">${r.date} <span class="text-slate-400">${r.time}</span></td>
        <td class="hidden lg:table-cell py-2 px-3 text-slate-700">
          <div class="font-medium">${r.reason}</div>
          <div class="text-[10px] text-slate-400 truncate max-w-xs" title="${itemNames}">${totalQty} pcs: ${itemNames}</div>
        </td>
        <td class="py-2 px-2.5 sm:px-3 font-mono font-bold ${isAuth ? 'text-rose-600' : 'text-slate-400'}">
          ${isAuth ? formatRupiah(r.totalRefund) : `<span title="Nominal refund disensor untuk kasir">••••••</span>`}
        </td>
        <td class="hidden sm:table-cell py-2 px-3 text-center">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${r.restocked ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}">
            ${r.restocked ? '✅ Masuk Rak' : '❌ Tidak Restok'}
          </span>
        </td>
        <td class="hidden md:table-cell py-2 px-3 text-slate-600 font-medium">${r.cashier}</td>
        <td class="py-2 px-2 sm:px-3 text-right">
          <button 
            onclick='openReturReceiptModal(${JSON.stringify(r)})' 
            class="px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded font-bold text-[11px] shadow-2xs"
            title="Cetak Ulang Struk Retur"
          >
            Struk
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

function getFilteredStockOpname() {
  const allSo = (pos.mutations || []).filter(m => m.type === 'SO_PLUS' || m.type === 'SO_MINUS');
  const now = new Date();
  const localTodayStr = now.toISOString().split("T")[0];

  if (reportDateFilter === "today") {
    return allSo.filter(m => m.date === localTodayStr);
  } else if (reportDateFilter === "7days") {
    const d7 = new Date();
    d7.setDate(now.getDate() - 7);
    const d7Str = d7.toISOString().split("T")[0];
    return allSo.filter(m => m.date >= d7Str);
  } else if (reportDateFilter === "30days") {
    const d30 = new Date();
    d30.setDate(now.getDate() - 30);
    const d30Str = d30.toISOString().split("T")[0];
    return allSo.filter(m => m.date >= d30Str);
  }
  return allSo;
}

function renderStockOpnameHistoryTable() {
  const tbody = document.getElementById("so-history-table-body");
  if (!tbody) return;

  const soList = getFilteredStockOpname();

  if (soList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-8 text-center text-slate-400 text-xs">
          Belum ada riwayat Stock Opname pada periode ini. Klik <strong>+ SO Toko [F6]</strong> untuk melakukan audit fisik stok.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = soList.map(m => {
    const isPlus = m.type === 'SO_PLUS' || m.qty > 0;
    return `
      <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs">
        <td class="py-2 px-2.5 sm:px-3 font-mono font-bold text-purple-700">${m.id || '-'}</td>
        <td class="hidden sm:table-cell py-2 px-3 text-slate-600">${m.date} <span class="text-slate-400 text-[10px]">${m.time || ''}</span></td>
        <td class="py-2 px-2.5 sm:px-3">
          <div class="font-bold text-slate-800">${m.productName || '-'}</div>
          <div class="text-[10px] font-mono text-slate-400">PLU: ${m.barcode || m.productId || '-'}</div>
        </td>
        <td class="py-2 px-2.5 sm:px-3 text-center">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${isPlus ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
            ${isPlus ? '📈 Fisik Lebih (+)' : '📉 Fisik Kurang (-)'}
          </span>
        </td>
        <td class="py-2 px-2.5 sm:px-3 text-center font-mono font-black ${isPlus ? 'text-emerald-700' : 'text-rose-700'}">
          ${isPlus ? '+' : ''}${m.qty} pcs
        </td>
        <td class="hidden md:table-cell py-2 px-3 text-slate-600">${m.note || 'Penyesuaian SO'}</td>
        <td class="hidden lg:table-cell py-2 px-3 font-mono text-slate-700">${m.operator || 'Pejabat Toko'}</td>
      </tr>
    `;
  }).join("");
}
