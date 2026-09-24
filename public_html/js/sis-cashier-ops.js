/**
 * SnackPOS - SIS Cashier Operations Subsystem (Fase 2)
 * Menghubungkan Retur Belanja (#3), Cash Drop (#4), dan Setting PIN Otorisasi (#12)
 * ke database riil pos.transactions, pos.products, pos.mutations, pos.returns, pos.settings
 */

// =========================================================================
// 1. SIS RETUR BELANJA KONSUMEN (#sis-modal-retur)
// =========================================================================

window.activeReturTransaction = null;
window.returSelectedItems = {};

function initSisReturModal() {
  window.activeReturTransaction = null;
  window.returSelectedItems = {};

  const invInput = document.getElementById('sis-retur-invoice-input');
  const itemsContainer = document.getElementById('sis-retur-items-container');
  const refundEl = document.getElementById('sis-retur-total-refund');
  const recentChipsContainer = document.getElementById('sis-retur-recent-chips');

  if (refundEl) refundEl.textContent = "Rp 0";

  // Render recent 3-5 transactions as quick click chips
  if (recentChipsContainer) {
    const trxs = (pos && Array.isArray(pos.transactions)) ? pos.transactions.slice(0, 4) : [];
    if (trxs.length === 0) {
      recentChipsContainer.innerHTML = `<span class="text-[10px] text-slate-400">Belum ada riwayat transaksi</span>`;
    } else {
      recentChipsContainer.innerHTML = trxs.map(t => {
        const id = t.id || t.invoiceNumber;
        const total = (t.grandTotal || t.total || 0).toLocaleString('id-ID');
        return `
          <button 
            type="button" 
            onclick="selectSisReturRecentTrx('${id}')" 
            class="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-800 font-mono text-[10px] font-bold transition border border-slate-200 cursor-pointer"
          >
            #${id} (Rp ${total})
          </button>
        `;
      }).join("");
    }
  }

  // Pre-fill with most recent transaction if available
  const latestTrx = (pos && Array.isArray(pos.transactions) && pos.transactions.length > 0) ? pos.transactions[0] : null;
  if (invInput) {
    invInput.value = latestTrx ? (latestTrx.id || latestTrx.invoiceNumber) : '';
  }

  if (latestTrx) {
    loadSisTransactionDetails(latestTrx);
  } else if (itemsContainer) {
    itemsContainer.innerHTML = `
      <div class="p-4 text-center text-slate-400 bg-white border border-dashed border-slate-200 rounded-xl text-xs">
        Masukkan nomor struk transaksi atau pilih struk terakhir di atas.
      </div>
    `;
  }
}

function selectSisReturRecentTrx(trxId) {
  const invInput = document.getElementById('sis-retur-invoice-input');
  if (invInput) invInput.value = trxId;
  searchSisTransactionForRetur();
}

function searchSisTransactionForRetur() {
  const invInput = document.getElementById('sis-retur-invoice-input');
  const query = (invInput?.value || "").trim().toLowerCase();

  if (!query) {
    alert("Harap masukkan nomor struk transaksi!");
    if (invInput) invInput.focus();
    return;
  }

  const trxs = (pos && Array.isArray(pos.transactions)) ? pos.transactions : [];
  const found = trxs.find(t => 
    (t.id && t.id.toLowerCase() === query) || 
    (t.invoiceNumber && t.invoiceNumber.toLowerCase() === query) ||
    (t.id && t.id.toLowerCase().includes(query))
  );

  if (!found) {
    const toastMsg = `⚠️ Transaksi "${query}" tidak ditemukan di riwayat penjualan!`;
    if (typeof showMockupToast === 'function') {
      showMockupToast(toastMsg, 'warning');
    } else if (typeof showToast === 'function') {
      showToast(toastMsg, 'warning');
    }
    return;
  }

  loadSisTransactionDetails(found);
  const toastMsg = `🔍 Transaksi #${found.id || found.invoiceNumber} berhasil dimuat!`;
  if (typeof showMockupToast === 'function') {
    showMockupToast(toastMsg, 'success');
  } else if (typeof showToast === 'function') {
    showToast(toastMsg, 'success');
  }
}

function loadSisTransactionDetails(trx) {
  window.activeReturTransaction = trx;
  window.returSelectedItems = {};

  const itemsContainer = document.getElementById('sis-retur-items-container');
  if (!itemsContainer) return;

  const items = trx.items || [];
  if (items.length === 0) {
    itemsContainer.innerHTML = `
      <div class="p-4 text-center text-slate-400 bg-white border border-dashed border-slate-200 rounded-xl text-xs">
        Transaksi ini tidak memiliki rincian item produk.
      </div>
    `;
    recalcSisReturRefund();
    return;
  }

  itemsContainer.innerHTML = items.map((item, idx) => {
    const prodId = item.id || item.productId;
    const maxQty = item.qty || 1;
    const unitPrice = item.price || 0;

    return `
      <div class="p-2.5 bg-white border border-slate-200/90 rounded-xl flex items-center justify-between text-[11px] shadow-2xs gap-2">
        <label class="flex items-center gap-2.5 min-w-0 cursor-pointer flex-1">
          <input 
            type="checkbox" 
            id="sis-retur-check-${idx}" 
            onchange="toggleSisReturItemSelection(${idx}, '${prodId}', ${unitPrice}, ${maxQty})" 
            class="w-4 h-4 text-blue-600 rounded cursor-pointer"
          />
          <div class="min-w-0">
            <span class="font-bold text-slate-900 block truncate">${item.name}</span>
            <span class="text-[10px] text-slate-400 font-mono block">@Rp ${unitPrice.toLocaleString('id-ID')} • Beli: <strong>${maxQty}</strong> ${item.unit || 'PCS'}</span>
          </div>
        </label>

        <div class="flex items-center gap-2 shrink-0">
          <span class="text-[10px] text-slate-500 font-medium">Qty Retur:</span>
          <div class="flex items-center border border-slate-300 rounded-lg overflow-hidden bg-slate-50">
            <button 
              type="button" 
              onclick="stepSisReturQty(${idx}, '${prodId}', -1, ${maxQty}, ${unitPrice})" 
              class="w-6 h-6 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-200 cursor-pointer"
            >-</button>
            <input 
              type="number" 
              id="sis-retur-qty-${idx}" 
              value="1" 
              min="1" 
              max="${maxQty}" 
              oninput="onSisReturQtyInput(${idx}, '${prodId}', ${maxQty}, ${unitPrice})" 
              class="w-10 text-center font-mono font-bold text-xs bg-white border-x border-slate-200 focus:outline-none"
            />
            <button 
              type="button" 
              onclick="stepSisReturQty(${idx}, '${prodId}', 1, ${maxQty}, ${unitPrice})" 
              class="w-6 h-6 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-200 cursor-pointer"
            >+</button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  recalcSisReturRefund();
}

function toggleSisReturItemSelection(idx, prodId, unitPrice, maxQty) {
  const check = document.getElementById(`sis-retur-check-${idx}`);
  const qtyInput = document.getElementById(`sis-retur-qty-${idx}`);
  const qty = parseInt(qtyInput?.value, 10) || 1;

  if (check && check.checked) {
    window.returSelectedItems[prodId] = {
      index: idx,
      productId: prodId,
      qty: Math.min(qty, maxQty),
      unitPrice: unitPrice
    };
  } else {
    delete window.returSelectedItems[prodId];
  }

  recalcSisReturRefund();
}

function stepSisReturQty(idx, prodId, delta, maxQty, unitPrice) {
  const qtyInput = document.getElementById(`sis-retur-qty-${idx}`);
  const check = document.getElementById(`sis-retur-check-${idx}`);
  let cur = parseInt(qtyInput?.value, 10) || 1;
  cur = Math.max(1, Math.min(maxQty, cur + delta));

  if (qtyInput) qtyInput.value = cur;

  if (check && check.checked) {
    window.returSelectedItems[prodId] = {
      index: idx,
      productId: prodId,
      qty: cur,
      unitPrice: unitPrice
    };
    recalcSisReturRefund();
  }
}

function onSisReturQtyInput(idx, prodId, maxQty, unitPrice) {
  const qtyInput = document.getElementById(`sis-retur-qty-${idx}`);
  const check = document.getElementById(`sis-retur-check-${idx}`);
  let cur = parseInt(qtyInput?.value, 10) || 1;
  cur = Math.max(1, Math.min(maxQty, cur));

  if (qtyInput) qtyInput.value = cur;

  if (check && check.checked) {
    window.returSelectedItems[prodId] = {
      index: idx,
      productId: prodId,
      qty: cur,
      unitPrice: unitPrice
    };
    recalcSisReturRefund();
  }
}

function recalcSisReturRefund() {
  const refundEl = document.getElementById('sis-retur-total-refund');
  let totalRefund = 0;

  Object.values(window.returSelectedItems).forEach(item => {
    totalRefund += (item.qty * item.unitPrice);
  });

  if (refundEl) {
    refundEl.textContent = `Rp ${totalRefund.toLocaleString('id-ID')}`;
  }
}

function processSisRetur() {
  const trx = window.activeReturTransaction;
  if (!trx) {
    alert("Harap cari dan pilih transaksi yang ingin diretur terlebih dahulu!");
    return;
  }

  const selectedKeys = Object.keys(window.returSelectedItems);
  if (selectedKeys.length === 0) {
    alert("Harap centang minimal 1 item produk yang akan diretur!");
    return;
  }

  const reasonSelect = document.getElementById('sis-retur-reason');
  const reason = reasonSelect?.value || "Kemasan Rusak / Cacat Pabrik";

  let totalRefund = 0;
  const returnedItemsList = [];

  selectedKeys.forEach(prodId => {
    const itemConfig = window.returSelectedItems[prodId];
    const origItem = (trx.items || []).find(it => (it.id === prodId || it.productId === prodId));
    if (origItem) {
      const subtotal = itemConfig.qty * itemConfig.unitPrice;
      totalRefund += subtotal;

      returnedItemsList.push({
        id: prodId,
        barcode: origItem.barcode || '',
        name: origItem.name,
        unit: origItem.unit || 'PCS',
        qty: itemConfig.qty,
        unitPrice: itemConfig.unitPrice,
        subtotal: subtotal
      });

      // Kembalikan stok fisik produk ke database
      const prod = (pos.products || []).find(p => p.id === prodId || p.barcode === origItem.barcode);
      if (prod) {
        prod.stock = (parseInt(prod.stock, 10) || 0) + itemConfig.qty;

        // Catat mutasi masuk hasil retur
        if (!Array.isArray(pos.mutations)) pos.mutations = [];
        pos.mutations.unshift({
          id: `MUT-${Date.now()}-${prodId}`,
          productId: prod.id,
          productName: prod.name,
          barcode: prod.barcode,
          type: 'IN',
          qty: itemConfig.qty,
          reason: `Retur Konsumen Struk #${trx.id || trx.invoiceNumber} (${reason})`,
          timestamp: new Date().toISOString()
        });
      }
    }
  });

  // Catat ke riwayat retur pos.returns
  if (!Array.isArray(pos.returns)) pos.returns = [];
  const returId = `RET-${Date.now()}`;
  const returRecord = {
    id: returId,
    originalInvoiceId: trx.id || trx.invoiceNumber,
    date: new Date().toISOString(),
    items: returnedItemsList,
    totalRefund: totalRefund,
    reason: reason,
    cashier: pos.currentUser ? pos.currentUser.name : 'Kasir Toko',
    timestamp: Date.now()
  };
  pos.returns.unshift(returRecord);

  // Simpan data
  if (typeof pos.saveProducts === 'function') pos.saveProducts();
  if (typeof pos.saveMutations === 'function') pos.saveMutations();
  if (typeof pos.saveReturns === 'function') pos.saveReturns();

  if (typeof renderInventoryTable === 'function') renderInventoryTable();
  if (typeof renderPosCart === 'function') renderPosCart();

  // Cetak Nota Retur Otomatis
  printSisReturReceipt(returRecord);

  const toastMsg = `↩️ Retur Sukses! Restitusi Rp ${totalRefund.toLocaleString('id-ID')} dicatat & nota retur dicetak.`;
  if (typeof showMockupToast === 'function') {
    showMockupToast(toastMsg, 'success');
  } else if (typeof showToast === 'function') {
    showToast(toastMsg, 'success');
  }

  closeSisModal('sis-modal-retur');
}

function printSisReturReceipt(retRecord) {
  const store = (pos && pos.settings) ? pos.settings : {};
  const storeName = store.storeName || "SNACKPOS STORE";
  const storeAddress = store.storeAddress || "Jl. Raya Retail No. 88";
  const dateStr = new Date().toLocaleString('id-ID');

  let receiptText = "";
  receiptText += "================================\n";
  receiptText += `${storeName.toUpperCase().padStart(16 + Math.floor(storeName.length / 2))}\n`;
  receiptText += `${storeAddress.padStart(16 + Math.floor(storeAddress.length / 2))}\n`;
  receiptText += "================================\n";
  receiptText += `NOTA RETUR BARANG & RESTITUSI\n`;
  receiptText += `No. Retur : ${retRecord.id}\n`;
  receiptText += `Ref Struk : #${retRecord.originalInvoiceId}\n`;
  receiptText += `Waktu     : ${dateStr}\n`;
  receiptText += `Kasir     : ${retRecord.cashier}\n`;
  receiptText += `Alasan    : ${retRecord.reason}\n`;
  receiptText += "--------------------------------\n";
  
  (retRecord.items || []).forEach(it => {
    receiptText += `${it.name}\n`;
    receiptText += `  +${it.qty} ${it.unit} x Rp ${it.unitPrice.toLocaleString('id-ID')} = Rp ${it.subtotal.toLocaleString('id-ID')}\n`;
  });

  receiptText += "--------------------------------\n";
  receiptText += `TOTAL KEMBALI UANG : Rp ${retRecord.totalRefund.toLocaleString('id-ID')}\n`;
  receiptText += "================================\n";
  receiptText += "\n";
  receiptText += " Ttd Konsumen     Ttd Pejabat Toko\n\n\n";
  receiptText += " (          )      (            )\n";
  receiptText += "================================\n\n\n";

  if (typeof printRawTextEscPos === 'function') {
    printRawTextEscPos(receiptText);
  } else {
    console.log("Nota Retur Plain Text:\n", receiptText);
  }
}


// =========================================================================
// 2. SIS SETORAN KAS / CASH DROP BRANKAS (#sis-modal-cashdrop)
// =========================================================================

function initSisCashDropModal() {
  const today = new Date().toISOString().slice(0, 10);
  const trxs = (pos && Array.isArray(pos.transactions)) ? pos.transactions : [];

  // Hitung total penjualan tunai hari ini
  const cashSales = trxs
    .filter(t => t.date && t.date.slice(0, 10) === today && (!t.paymentMethod || t.paymentMethod.toUpperCase() === 'CASH'))
    .reduce((sum, t) => sum + (t.grandTotal || t.total || 0), 0);

  // Hitung setoran kas yang sudah dilakukan hari ini
  let existingDrops = [];
  try {
    const raw = localStorage.getItem('snack_pos_cashdrops');
    existingDrops = raw ? JSON.parse(raw) : [];
  } catch (e) {
    existingDrops = [];
  }

  const todayDrops = existingDrops
    .filter(d => d.timestamp && d.timestamp.slice(0, 10) === today)
    .reduce((sum, d) => sum + (d.amount || 0), 0);

  const netCashInDrawer = Math.max(0, cashSales - todayDrops);

  const drawerCashEl = document.getElementById('sis-cashdrop-drawer-cash');
  if (drawerCashEl) {
    drawerCashEl.textContent = `Rp ${netCashInDrawer.toLocaleString('id-ID')}`;
  }

  const amountInput = document.getElementById('sis-cashdrop-amount');
  if (amountInput) {
    // Default 1 juta atau sisa kas jika kurang dari 1 juta
    amountInput.value = netCashInDrawer >= 1000000 ? "1000000" : (netCashInDrawer > 0 ? String(netCashInDrawer) : "500000");
  }

  const supervisorInput = document.getElementById('sis-cashdrop-supervisor');
  if (supervisorInput) {
    const cos = (pos.employees || []).find(e => e.role === 'COS' || e.role === 'ACOS');
    supervisorInput.value = cos ? `${cos.name} (${cos.role})` : "Ahmad COS (Kepala Toko)";
  }

  const notesInput = document.getElementById('sis-cashdrop-notes');
  if (notesInput) {
    const hhmm = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    notesInput.value = `Tarik kas pengamanan laci jam ${hhmm}`;
  }
}

function setSisCashDropPreset(amount) {
  const amountInput = document.getElementById('sis-cashdrop-amount');
  if (amountInput) {
    amountInput.value = String(amount);
  }
}

function setSisCashDropAllRemaining() {
  const today = new Date().toISOString().slice(0, 10);
  const trxs = (pos && Array.isArray(pos.transactions)) ? pos.transactions : [];
  const cashSales = trxs
    .filter(t => t.date && t.date.slice(0, 10) === today && (!t.paymentMethod || t.paymentMethod.toUpperCase() === 'CASH'))
    .reduce((sum, t) => sum + (t.grandTotal || t.total || 0), 0);

  let existingDrops = [];
  try {
    const raw = localStorage.getItem('snack_pos_cashdrops');
    existingDrops = raw ? JSON.parse(raw) : [];
  } catch (e) {
    existingDrops = [];
  }

  const todayDrops = existingDrops
    .filter(d => d.timestamp && d.timestamp.slice(0, 10) === today)
    .reduce((sum, d) => sum + (d.amount || 0), 0);

  const netCash = Math.max(0, cashSales - todayDrops);
  const amountInput = document.getElementById('sis-cashdrop-amount');
  if (amountInput) {
    amountInput.value = String(netCash);
  }
}

function saveSisCashDrop() {
  const amountInput = document.getElementById('sis-cashdrop-amount');
  const supInput = document.getElementById('sis-cashdrop-supervisor');
  const notesInput = document.getElementById('sis-cashdrop-notes');

  const rawAmount = parseFloat((amountInput?.value || "").replace(/\./g, "").replace(/,/g, ""));
  if (isNaN(rawAmount) || rawAmount <= 0) {
    alert("Harap masukkan nominal setoran kas yang valid (lebih dari Rp 0)!");
    if (amountInput) amountInput.focus();
    return;
  }

  const supervisor = (supInput?.value || "").trim() || "Pejabat Toko";
  const notes = (notesInput?.value || "").trim() || "Tarik kas pengamanan laci brankas";
  const cashier = pos.currentUser ? pos.currentUser.name : "Kasir Toko";

  const dropRecord = {
    id: `CDP-${Date.now()}`,
    amount: rawAmount,
    supervisor: supervisor,
    cashier: cashier,
    notes: notes,
    timestamp: new Date().toISOString()
  };

  try {
    const raw = localStorage.getItem('snack_pos_cashdrops');
    const drops = raw ? JSON.parse(raw) : [];
    drops.unshift(dropRecord);
    localStorage.setItem('snack_pos_cashdrops', JSON.stringify(drops));
  } catch (e) {
    console.warn("Save cash drop error:", e);
  }

  // Cetak Bukti Setoran Kas ke Printer
  printSisCashDropSlip(dropRecord);

  const toastMsg = `📥 Setoran Cash Drop Rp ${rawAmount.toLocaleString('id-ID')} Berhasil Dicatat & Dicetak!`;
  if (typeof showMockupToast === 'function') {
    showMockupToast(toastMsg, 'success');
  } else if (typeof showToast === 'function') {
    showToast(toastMsg, 'success');
  }

  closeSisModal('sis-modal-cashdrop');
}

function printSisCashDropSlip(dropRecord) {
  const store = (pos && pos.settings) ? pos.settings : {};
  const storeName = store.storeName || "SNACKPOS STORE";
  const dateStr = new Date().toLocaleString('id-ID');

  let slipText = "";
  slipText += "================================\n";
  slipText += `${storeName.toUpperCase().padStart(16 + Math.floor(storeName.length / 2))}\n`;
  slipText += "   BUKTI SETORAN KAS BRANKAS    \n";
  slipText += "          (CASH DROP)           \n";
  slipText += "================================\n";
  slipText += `No. Bukti : ${dropRecord.id}\n`;
  slipText += `Waktu     : ${dateStr}\n`;
  slipText += `Kasir     : ${dropRecord.cashier}\n`;
  slipText += `Penerima  : ${dropRecord.supervisor}\n`;
  slipText += `Catatan   : ${dropRecord.notes}\n`;
  slipText += "--------------------------------\n";
  slipText += `NOMINAL : Rp ${dropRecord.amount.toLocaleString('id-ID')}\n`;
  slipText += "================================\n\n";
  slipText += "  Yang Menyetor     Penerima Kas\n\n\n";
  slipText += ` (${dropRecord.cashier.slice(0, 10)})     (${dropRecord.supervisor.slice(0, 10)})\n`;
  slipText += "================================\n\n\n";

  if (typeof printRawTextEscPos === 'function') {
    printRawTextEscPos(slipText);
  } else {
    console.log("Slip Cash Drop:\n", slipText);
  }
}


// =========================================================================
// 3. SIS GANTI PIN PRIBADI KASIR (SELF PIN) (#sis-modal-pin)
// =========================================================================

function initSisPinModal() {
  const userCard = document.getElementById('sis-self-pin-user-card');
  const formEl = document.getElementById('sis-self-pin-form');
  const noUserEl = document.getElementById('sis-self-pin-no-user');
  const submitBtn = document.getElementById('sis-self-pin-submit-btn');

  const nameEl = document.getElementById('sis-self-pin-name');
  const nikEl = document.getElementById('sis-self-pin-nik');
  const roleEl = document.getElementById('sis-self-pin-role');

  const oldPinInput = document.getElementById('sis-self-pin-old');
  const newPinInput = document.getElementById('sis-self-pin-new');
  const confirmPinInput = document.getElementById('sis-self-pin-confirm');

  if (oldPinInput) oldPinInput.value = '';
  if (newPinInput) newPinInput.value = '';
  if (confirmPinInput) confirmPinInput.value = '';

  const activeUser = (window.pos && pos.currentUser) ? pos.currentUser : null;

  if (!activeUser) {
    if (userCard) userCard.classList.add('hidden');
    if (formEl) formEl.classList.add('hidden');
    if (noUserEl) noUserEl.classList.remove('hidden');
    if (submitBtn) submitBtn.classList.add('hidden');
    return;
  }

  if (userCard) userCard.classList.remove('hidden');
  if (formEl) formEl.classList.remove('hidden');
  if (noUserEl) noUserEl.classList.add('hidden');
  if (submitBtn) submitBtn.classList.remove('hidden');

  if (nameEl) nameEl.textContent = activeUser.name || 'Kasir';
  if (nikEl) nikEl.textContent = `NIK: ${activeUser.nik || '-'}`;
  if (roleEl) {
    roleEl.textContent = activeUser.role || 'CREW';
    if (activeUser.role === 'COS') {
      roleEl.className = 'px-2 py-0.5 rounded-lg bg-red-100 text-red-800 font-black text-[10px] uppercase tracking-wider shrink-0';
    } else if (activeUser.role === 'ACOS') {
      roleEl.className = 'px-2 py-0.5 rounded-lg bg-blue-100 text-blue-800 font-black text-[10px] uppercase tracking-wider shrink-0';
    } else {
      roleEl.className = 'px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 font-black text-[10px] uppercase tracking-wider shrink-0';
    }
  }

  setTimeout(() => {
    if (oldPinInput) oldPinInput.focus();
  }, 100);
}

function saveSisSelfPin() {
  const activeUser = (window.pos && pos.currentUser) ? pos.currentUser : null;
  if (!activeUser) {
    alert("Belum ada kasir yang login saat ini!");
    return;
  }

  const oldPinInput = document.getElementById('sis-self-pin-old');
  const newPinInput = document.getElementById('sis-self-pin-new');
  const confirmPinInput = document.getElementById('sis-self-pin-confirm');

  const oldPin = (oldPinInput?.value || "").trim();
  const newPin = (newPinInput?.value || "").trim();
  const confirmPin = (confirmPinInput?.value || "").trim();

  if (!oldPin) {
    alert("Masukkan PIN lama Anda saat ini!");
    if (oldPinInput) oldPinInput.focus();
    return;
  }

  // Verifikasi PIN lama harus sesuai dengan PIN aktif karyawan
  if (String(activeUser.pin) !== String(oldPin)) {
    alert("PIN lama yang Anda masukkan salah!");
    if (oldPinInput) {
      oldPinInput.value = '';
      oldPinInput.focus();
    }
    return;
  }

  if (!newPin || newPin.length < 4 || newPin.length > 8 || !/^\d+$/.test(newPin)) {
    alert("PIN Baru harus berupa 4 sampai 8 digit angka numerik!");
    if (newPinInput) newPinInput.focus();
    return;
  }

  if (newPin === oldPin) {
    alert("PIN Baru tidak boleh sama dengan PIN Lama!");
    if (newPinInput) newPinInput.focus();
    return;
  }

  if (newPin !== confirmPin) {
    alert("Konfirmasi PIN Baru tidak cocok! Mohon ketik ulang dengan benar.");
    if (confirmPinInput) {
      confirmPinInput.value = '';
      confirmPinInput.focus();
    }
    return;
  }

  // Simpan PIN baru ke activeUser
  activeUser.pin = newPin;
  if (typeof pos.saveCurrentUser === 'function') {
    pos.saveCurrentUser(activeUser);
  }

  // Sinkronkan ke daftar employees
  if (Array.isArray(pos.employees)) {
    const emp = pos.employees.find(e => e.nik === activeUser.nik);
    if (emp) {
      emp.pin = newPin;
    }
    if (typeof pos.saveEmployees === 'function') {
      pos.saveEmployees();
    } else {
      try {
        localStorage.setItem("snack_pos_employees", JSON.stringify(pos.employees));
      } catch (e) {}
    }
  }

  // Jika yang login adalah COS / ACOS, sinkronkan juga supervisorPin / acosPin
  if (pos.settings) {
    if (activeUser.role === 'COS') {
      pos.settings.supervisorPin = newPin;
      pos.settings.cosPin = newPin;
      if (typeof pos.saveSettings === 'function') pos.saveSettings();
    } else if (activeUser.role === 'ACOS') {
      pos.settings.acosPin = newPin;
      if (typeof pos.saveSettings === 'function') pos.saveSettings();
    }
  }

  const toastMsg = `🔐 PIN Anda berhasil diperbarui!`;
  if (typeof showMockupToast === 'function') {
    showMockupToast(toastMsg, 'success');
  } else if (typeof showToast === 'function') {
    showToast(toastMsg, 'success');
  }

  closeSisModal('sis-modal-pin');
}

// Export to window
if (typeof window !== 'undefined') {
  window.initSisReturModal = initSisReturModal;
  window.selectSisReturRecentTrx = selectSisReturRecentTrx;
  window.searchSisTransactionForRetur = searchSisTransactionForRetur;
  window.loadSisTransactionDetails = loadSisTransactionDetails;
  window.toggleSisReturItemSelection = toggleSisReturItemSelection;
  window.stepSisReturQty = stepSisReturQty;
  window.onSisReturQtyInput = onSisReturQtyInput;
  window.recalcSisReturRefund = recalcSisReturRefund;
  window.processSisRetur = processSisRetur;
  window.printSisReturReceipt = printSisReturReceipt;

  window.initSisCashDropModal = initSisCashDropModal;
  window.setSisCashDropPreset = setSisCashDropPreset;
  window.setSisCashDropAllRemaining = setSisCashDropAllRemaining;
  window.saveSisCashDrop = saveSisCashDrop;
  window.printSisCashDropSlip = printSisCashDropSlip;

  window.initSisPinModal = initSisPinModal;
  window.saveSisSelfPin = saveSisSelfPin;
  window.saveSisPin = saveSisSelfPin; // Alias backward-compatibility
}
