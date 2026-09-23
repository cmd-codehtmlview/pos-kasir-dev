/**
 * SnackPOS - Checkout, Payment (Tender) & Thermal Receipt
 */

// ==========================================
// 4. PEMBAYARAN KASIR (TENDER)
// ==========================================
let currentPaymentMethod = "cash";
let cashTenderAmount = 0;
let lastCompletedTransaction = null;
let checkoutPointsRedeemed = 0;
let checkoutPointDiscount = 0;
let checkoutPayableAmount = 0;

function openCheckoutModal() {
  if (pos.cart.length === 0) {
    showToast("Keranjang transaksi masih kosong!", "warning");
    sfx.warning();
    return;
  }

  const totals = getCartTotals();
  cashTenderAmount = 0;
  currentPaymentMethod = "cash";
  checkoutPointsRedeemed = 0;
  checkoutPointDiscount = 0;
  checkoutPayableAmount = totals.grandTotal;

  // Inisialisasi Box Poin Member jika ada member terpasang
  const pointsBox = document.getElementById("checkout-member-points-box");
  const splitSubtext = document.getElementById("checkout-split-subtext");
  const nameBalEl = document.getElementById("checkout-member-name-balance");
  const rateBadge = document.getElementById("checkout-member-rate-badge");
  const redeemInput = document.getElementById("checkout-redeem-points-input");
  const pointDiscDisp = document.getElementById("checkout-point-discount-display");
  const payableDisp = document.getElementById("checkout-payable-after-points");

  if (pos.activeMember) {
    const member = (pos.members || []).find(m => m.id === pos.activeMember.id) || pos.activeMember;
    const memberPoints = Number(member.points) || 0;
    const rate = Number(pos.settings.memberPointRedeemValue) || 1;

    if (pointsBox) pointsBox.classList.remove("hidden");
    if (nameBalEl) nameBalEl.textContent = `${member.name} • Saldo: ${formatAngka(memberPoints)} Poin (Senilai ${formatRupiah(memberPoints * rate)})`;
    if (rateBadge) rateBadge.textContent = `1 Poin = ${formatRupiah(rate)}`;
    if (redeemInput) {
      redeemInput.value = "";
      redeemInput.max = memberPoints;
    }
    if (pointDiscDisp) pointDiscDisp.textContent = "-Rp 0";
    if (payableDisp) payableDisp.textContent = formatRupiah(totals.grandTotal);
  } else {
    if (pointsBox) pointsBox.classList.add("hidden");
  }

  if (splitSubtext) {
    splitSubtext.classList.add("hidden");
    splitSubtext.textContent = "";
  }

  document.getElementById("checkout-grand-total").textContent = formatRupiah(totals.grandTotal);
  
  const cashInput = document.getElementById("cash-received-input");
  if (cashInput) {
    cashInput.value = "";
    if (document.activeElement === cashInput) {
      cashInput.blur();
    }
  }

  selectPaymentMethod("cash");
  updateChangeDisplay();
  openModal("modal-checkout");
}

function onPointsRedeemChange(val) {
  if (!pos.activeMember) return;
  const member = (pos.members || []).find(m => m.id === pos.activeMember.id) || pos.activeMember;
  const memberPoints = Number(member.points) || 0;
  const rate = Number(pos.settings.memberPointRedeemValue) || 1;
  const totals = getCartTotals();

  // Maksimal poin yang bisa ditukar: tidak melebihi saldo member dan tidak melebihi total tagihan
  const maxPointsNeeded = Math.ceil(totals.grandTotal / rate);
  const maxPointsAllowed = Math.min(memberPoints, maxPointsNeeded);

  let pts = parseInt(String(val).replace(/[^0-9]/g, ""), 10) || 0;
  if (pts < 0) pts = 0;
  if (pts > maxPointsAllowed) pts = maxPointsAllowed;

  const redeemInput = document.getElementById("checkout-redeem-points-input");
  if (redeemInput && String(redeemInput.value) !== String(pts)) {
    redeemInput.value = pts > 0 ? pts : "";
  }

  checkoutPointsRedeemed = pts;
  checkoutPointDiscount = Math.min(totals.grandTotal, pts * rate);
  checkoutPayableAmount = Math.max(0, totals.grandTotal - checkoutPointDiscount);

  // Update Tampilan DOM
  const pointDiscDisp = document.getElementById("checkout-point-discount-display");
  const payableDisp = document.getElementById("checkout-payable-after-points");
  const grandTotalDisp = document.getElementById("checkout-grand-total");
  const splitSubtext = document.getElementById("checkout-split-subtext");

  if (pointDiscDisp) pointDiscDisp.textContent = `-${formatRupiah(checkoutPointDiscount)}`;
  if (payableDisp) payableDisp.textContent = formatRupiah(checkoutPayableAmount);

  if (checkoutPointsRedeemed > 0) {
    if (grandTotalDisp) grandTotalDisp.textContent = formatRupiah(checkoutPayableAmount);
    if (splitSubtext) {
      splitSubtext.classList.remove("hidden");
      splitSubtext.textContent = `(Total Belanja: ${formatRupiah(totals.grandTotal)} - Potongan Poin: ${formatRupiah(checkoutPointDiscount)})`;
    }
  } else {
    if (grandTotalDisp) grandTotalDisp.textContent = formatRupiah(totals.grandTotal);
    if (splitSubtext) {
      splitSubtext.classList.add("hidden");
      splitSubtext.textContent = "";
    }
  }

  if (currentPaymentMethod === "qris" || currentPaymentMethod === "transfer") {
    cashTenderAmount = checkoutPayableAmount;
  }

  updateChangeDisplay();
}

function setQuickRedeemPoints(mode) {
  if (!pos.activeMember) return;
  const member = (pos.members || []).find(m => m.id === pos.activeMember.id) || pos.activeMember;
  const memberPoints = Number(member.points) || 0;
  const rate = Number(pos.settings.memberPointRedeemValue) || 1;
  const totals = getCartTotals();

  if (mode === "max") {
    const maxPointsNeeded = Math.ceil(totals.grandTotal / rate);
    const maxPointsAllowed = Math.min(memberPoints, maxPointsNeeded);
    onPointsRedeemChange(maxPointsAllowed);
    sfx.beep();
  } else if (mode === "reset") {
    onPointsRedeemChange(0);
    sfx.beep();
  }
}

function selectPaymentMethod(method) {
  currentPaymentMethod = method;
  const cashSection = document.getElementById("cash-payment-section");
  const qrisSection = document.getElementById("qris-payment-section");
  const transferSection = document.getElementById("transfer-payment-section");

  const tabCash = document.getElementById("tab-method-cash");
  const tabQris = document.getElementById("tab-method-qris");
  const tabTransfer = document.getElementById("tab-method-transfer");

  [tabCash, tabQris, tabTransfer].forEach(tab => {
    if (tab) {
      tab.classList.remove("bg-alfa-red", "text-white", "shadow-sm");
      tab.classList.add("bg-slate-100", "text-slate-600");
    }
  });

  const activeTab = document.getElementById(`tab-method-${method}`);
  if (activeTab) {
    activeTab.classList.add("bg-alfa-red", "text-white", "shadow-sm");
    activeTab.classList.remove("bg-slate-100", "text-slate-600");
  }

  if (cashSection) cashSection.classList.toggle("hidden", method !== "cash");
  if (qrisSection) qrisSection.classList.toggle("hidden", method !== "qris");
  if (transferSection) transferSection.classList.toggle("hidden", method !== "transfer");

  if (method === "qris" || method === "transfer") {
    cashTenderAmount = checkoutPayableAmount;
  }

  if (method === "qris") {
    renderCheckoutQris();
  } else if (method === "transfer") {
    renderCheckoutTransfer();
  }

  updateChangeDisplay();
}

function renderCheckoutQris() {
  const titleEl = document.getElementById("checkout-qris-title");
  const amountEl = document.getElementById("checkout-qris-amount");
  const imgEl = document.getElementById("checkout-qris-img");
  const noteEl = document.getElementById("checkout-qris-note");

  const payable = checkoutPayableAmount || 0;
  if (amountEl) amountEl.textContent = formatRupiah(payable);

  const mode = pos.settings.qrisMode || "MIDTRANS";

  if (mode === "STATIC" && pos.settings.qrisStaticImageUrl) {
    if (titleEl) titleEl.textContent = pos.settings.qrisMerchantName || "QRIS Toko Resmi";
    if (imgEl) imgEl.src = pos.settings.qrisStaticImageUrl;
    if (noteEl) noteEl.innerHTML = `Minta pembeli scan QR di atas dan masukkan nominal <strong>${formatRupiah(payable)}</strong>.`;
  } else {
    // Dynamic QRIS via QR Server / Midtrans
    const storeName = encodeURIComponent(pos.settings.storeName || "SNACKPOS");
    const qrData = `00020101021226590014ID.LINKAJA.WWW01189360091400000000000215${storeName}520454995802ID5914${storeName}6007JAKARTA62070703A01540${payable}6304`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrData)}`;

    if (titleEl) titleEl.textContent = pos.settings.midtransClientKey ? "QRIS Dinamis Midtrans" : "QRIS Dinamis Toko";
    if (imgEl) imgEl.src = qrUrl;
    if (noteEl) noteEl.innerHTML = `Minta pembeli scan dengan DANA, GoPay, ShopeePay, OVO, atau m-Banking. Nominal otomatis <strong>${formatRupiah(payable)}</strong>.`;
  }
}

function renderCheckoutTransfer() {
  const amountEl = document.getElementById("checkout-transfer-amount");
  const bankEl = document.getElementById("checkout-bank-name");
  const accEl = document.getElementById("checkout-bank-acc");
  const holderEl = document.getElementById("checkout-bank-holder");

  const payable = checkoutPayableAmount || 0;
  if (amountEl) amountEl.textContent = formatRupiah(payable);
  if (bankEl) bankEl.textContent = pos.settings.bankName || "BCA";
  if (accEl) accEl.textContent = pos.settings.bankAccountNumber || "Belum diatur";
  if (holderEl) holderEl.textContent = pos.settings.bankAccountHolder || (pos.settings.storeName || "-");
}

function copyTransferAccount() {
  const acc = pos.settings.bankAccountNumber;
  if (!acc) {
    showToast("Nomor rekening belum diatur di Pengaturan Toko!", "warning");
    return;
  }
  navigator.clipboard.writeText(acc).then(() => {
    showToast(`Nomor rekening ${acc} disalin!`, "success");
  });
}

function setQuickCash(type) {
  const payable = checkoutPayableAmount;
  const input = document.getElementById("cash-received-input");

  if (type === "exact") {
    cashTenderAmount = payable;
  } else if (typeof type === "number") {
    cashTenderAmount = type;
  } else if (type === "+2k") {
    cashTenderAmount = (cashTenderAmount || 0) + 2000;
  } else if (type === "+5k") {
    cashTenderAmount = (cashTenderAmount || 0) + 5000;
  }

  if (input) input.value = cashTenderAmount;
  sfx.beep();
  updateChangeDisplay();
}

function onCashInputChange(val) {
  cashTenderAmount = parseInt(String(val).replace(/[^0-9]/g, "")) || 0;
  updateChangeDisplay();
}

function updateChangeDisplay() {
  const payable = checkoutPayableAmount;
  const changeEl = document.getElementById("checkout-change-amount");
  const changeStatusEl = document.getElementById("checkout-change-status");
  const btnProcess = document.getElementById("btn-process-payment");
  const ledChange = document.getElementById("led-change-amount");

  // Jika tagihan lunas 100% menggunakan poin member
  if (payable === 0) {
    if (changeEl) changeEl.textContent = formatRupiah(0);
    if (ledChange) ledChange.textContent = "LUNAS POIN";
    if (changeStatusEl) {
      changeStatusEl.textContent = "LUNAS DENGAN POIN MEMBER";
      changeStatusEl.className = "text-xs font-extrabold text-indigo-600";
    }
    if (btnProcess) btnProcess.disabled = false;
    return;
  }

  if (currentPaymentMethod !== "cash") {
    if (changeEl) changeEl.textContent = formatRupiah(0);
    if (btnProcess) btnProcess.disabled = false;
    return;
  }

  const diff = cashTenderAmount - payable;

  if (cashTenderAmount === 0) {
    if (changeEl) changeEl.textContent = formatRupiah(0);
    if (changeStatusEl) {
      changeStatusEl.textContent = "Masukkan nominal uang diterima";
      changeStatusEl.className = "text-xs font-semibold text-slate-400";
    }
    if (btnProcess) btnProcess.disabled = true;
    return;
  }

  if (diff >= 0) {
    if (changeEl) changeEl.textContent = formatRupiah(diff);
    if (ledChange) ledChange.textContent = formatRupiah(diff);
    if (changeStatusEl) {
      changeStatusEl.textContent = diff === 0 ? "UANG PAS" : "KEMBALIAN";
      changeStatusEl.className = "text-xs font-extrabold text-emerald-600";
    }
    if (btnProcess) btnProcess.disabled = false;
  } else {
    if (changeEl) changeEl.textContent = `-${formatRupiah(Math.abs(diff))}`;
    if (ledChange) ledChange.textContent = "UANG KURANG";
    if (changeStatusEl) {
      changeStatusEl.textContent = "UANG KURANG!";
      changeStatusEl.className = "text-xs font-extrabold text-rose-600";
    }
    if (btnProcess) btnProcess.disabled = true;
  }
}

function processPayment() {
  // Validasi Batas Maksimal 15 Transaksi / Hari untuk Mode Trial
  if (typeof isTrialLimitReached === "function" && isTrialLimitReached("TRANSACTION")) {
    showTrialUpgradeModal("TRANSACTION");
    return;
  }

  const totals = getCartTotals();
  const payable = checkoutPayableAmount;

  if (payable > 0 && currentPaymentMethod === "cash" && cashTenderAmount < payable) {
    showToast("Uang yang dibayarkan masih kurang!", "error");
    sfx.warning();
    return;
  }

  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toLocaleTimeString("id-ID", { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const invoiceNumber = `TRX-${dateStr.replace(/-/g, "")}-${String(pos.transactions.length + 1).padStart(4, "0")}`;

  // Kurangi stok di lokal komputer (berbasis kuantiti pcs)
  pos.cart.forEach(cartItem => {
    const p = pos.products.find(prod => prod.id === cartItem.id);
    if (p) {
      p.stock = Math.max(0, p.stock - cartItem.qty);
    }
  });
  pos.saveProducts();

  // Tentukan nama metode pembayaran
  let finalPaymentMethod = currentPaymentMethod;
  if (checkoutPointsRedeemed > 0) {
    if (payable === 0) {
      finalPaymentMethod = "point";
    } else {
      finalPaymentMethod = `${currentPaymentMethod}+point`;
    }
  }

  const activeCashierUser = pos.currentUser || {
    nik: pos.settings.cashierNik || "1001",
    name: pos.settings.cashierName || "Kasir 1",
    role: "CREW",
    shift: pos.settings.shiftName || "Shift 1"
  };

  const transaction = {
    id: invoiceNumber,
    date: dateStr,
    time: timeStr,
    createdAt: now.toISOString(),
    cashier: activeCashierUser.name,
    cashierNik: activeCashierUser.nik,
    cashierRole: activeCashierUser.role,
    shift: activeCashierUser.shift || pos.settings.shiftName || "Shift 1 (Pagi)",
    klerkId: null,
    items: [...pos.cart],
    subtotal: totals.subtotal,
    discountAmount: totals.discountAmount,
    taxAmount: 0,
    grandTotal: totals.grandTotal,
    pointsRedeemed: checkoutPointsRedeemed,
    pointDiscount: checkoutPointDiscount,
    payableAmount: payable,
    totalCost: totals.totalCost,
    profit: totals.estimatedProfit,
    paymentMethod: finalPaymentMethod,
    cashTendered: payable === 0 ? 0 : (currentPaymentMethod === "cash" ? cashTenderAmount : payable),
    changeAmount: payable === 0 ? 0 : (currentPaymentMethod === "cash" ? Math.max(0, cashTenderAmount - payable) : 0)
  };

  // Akumulasi & Pengurangan Poin Loyalitas Member
  if (pos.activeMember) {
    const member = (pos.members || []).find(m => m.id === pos.activeMember.id) || pos.activeMember;
    if (member) {
      // 1. Kurangi poin yang digunakan bayar
      const currentPts = Number(member.points) || 0;
      const pointsAfterRedeem = Math.max(0, currentPts - checkoutPointsRedeemed);

      // 2. Hitung poin baru dari sisa belanja bersih yang dibayar uang (bukan dari poin)
      const step = Number(pos.settings.memberPointSpendStep);
      const earnedPoints = (step > 0 && payable > 0) ? Math.floor(payable / step) : 0;

      member.points = pointsAfterRedeem + earnedPoints;
      member.totalSpend = (Number(member.totalSpend) || 0) + payable;
      pos.saveMembers();

      if (typeof syncSingleMemberToCloud === 'function') {
        syncSingleMemberToCloud(member).catch(() => {});
      }

      transaction.member = {
        id: member.id,
        name: member.name,
        phone: member.phone,
        pointsRedeemed: checkoutPointsRedeemed,
        pointsEarned: earnedPoints,
        totalPoints: member.points
      };
      transaction.memberId = member.id;
      transaction.memberName = member.name;
      transaction.memberPhone = member.phone;
      transaction.memberPoints = earnedPoints;
      transaction.memberTotalPoints = member.points;
      transaction.pointsRedeemed = checkoutPointsRedeemed;
      transaction.pointDiscount = checkoutPointDiscount;
    }
  }

  pos.transactions.unshift(transaction);
  pos.saveTransactions();

  // Catat ke Log Mutasi Barang Keluar (Sales)
  pos.cart.forEach(cartItem => {
    pos.mutations.unshift({
      id: `MUT-${Date.now().toString().slice(-6)}`,
      date: dateStr,
      time: timeStr,
      type: "OUT_SALE",
      productId: cartItem.id,
      productName: cartItem.name,
      barcode: cartItem.barcode,
      qty: -cartItem.qty,
      note: `Penjualan Kasir (${invoiceNumber})`,
      operator: pos.settings.cashierName
    });
  });
  pos.saveMutations();

  lastCompletedTransaction = transaction;

  sfx.success();
  closeModal("modal-checkout");
  clearCart(true);
  detachMemberFromCart();

  // Sync langsung transaksi ini ke Supabase / Cloud
  if (typeof syncSingleTransactionToCloud === "function") {
    syncSingleTransactionToCloud(transaction);
  }
  if (navigator.onLine && typeof syncToSupabase === "function") {
    syncToSupabase(true);
  }

  openReceiptModal(transaction);
  showToast("Transaksi Kasir Berhasil Diproses!", "success");

  // Auto-Print Struk ke Printer VSC Bluetooth / RawBT / Kiosk
  if (pos.settings.autoPrintReceipt !== false && typeof printReceiptUniversal === "function") {
    setTimeout(() => {
      printReceiptUniversal(transaction, true);
    }, 150);
  }
}

// Render Struk Thermal Kasir
function renderReceiptHtml(transaction) {
  if (!transaction) return '';
  const is80 = pos.settings.paperWidth === "80mm";

  const paymentLabelMap = {
    cash: "TUNAI",
    qris: "QRIS",
    transfer: "DEBIT / EDC",
    point: "POIN MEMBER",
    "cash+point": "TUNAI + POIN",
    "qris+point": "QRIS + POIN",
    "transfer+point": "DEBIT + POIN"
  };

  const items = transaction.items || [];
  const itemsHtml = items.map(item => {
    const itemTotal = (item.price || 0) * (item.qty || 1);
    const wholesaleTag = item.isWholesale ? ' <span class="font-bold text-[9px] text-slate-800">[Grosir]</span>' : '';
    return `
      <div class="mb-1">
        <div class="font-bold text-left">${item.name || 'Produk'}${wholesaleTag}</div>
        <div class="flex justify-between text-slate-700">
          <span>${item.qty || 1} ${item.unit || 'pcs'} x ${formatAngka(item.price || 0)}</span>
          <span class="font-bold">${formatAngka(itemTotal)}</span>
        </div>
        ${item.wholesaleSaved > 0 ? `<div class="text-[9px] text-emerald-800 font-mono italic">Hemat Grosir: ${formatRupiah(item.wholesaleSaved)}</div>` : ''}
      </div>
    `;
  }).join("");

  const storeName = pos.settings.storeName || "TOKO SNACK BERKAH";
  const storeTagline = pos.settings.storeTagline || "";
  const storeAddress = pos.settings.storeAddress || "";
  const storePhone = pos.settings.storePhone ? `Telp: ${pos.settings.storePhone}` : "";

  return `
    <div class="text-center mb-2">
      <div class="font-black text-base tracking-wider uppercase">${storeName}</div>
      ${storeTagline ? `<div class="text-[10px] text-slate-600 leading-tight">${storeTagline}</div>` : ''}
      ${storeAddress ? `<div class="text-[10px] text-slate-600 leading-tight mt-0.5">${storeAddress}</div>` : ''}
      ${storePhone ? `<div class="text-[10px] text-slate-600 leading-tight">${storePhone}</div>` : ''}
    </div>

    <div class="receipt-dashed-line"></div>

    <div class="text-[10px] leading-relaxed">
      <div class="flex justify-between">
        <span>No. Struk</span>
        <span class="font-bold font-mono">${transaction.id || '-'}</span>
      </div>
      <div class="flex justify-between">
        <span>Waktu</span>
        <span>${transaction.date || ''} ${transaction.time || ''}</span>
      </div>
      <div class="flex justify-between">
        <span>Kasir</span>
        <span>${transaction.cashier || 'Kasir'} (${transaction.shift || '1'})</span>
      </div>
    </div>

    <div class="receipt-dashed-line"></div>

    <div class="text-[11px] my-1.5">
      ${itemsHtml}
    </div>

    <div class="receipt-dashed-line"></div>

    <div class="text-[11px] leading-relaxed">
      <div class="flex justify-between">
        <span>Subtotal</span>
        <span>${formatAngka(transaction.subtotal || transaction.grandTotal || 0)}</span>
      </div>
      ${transaction.discountAmount > 0 ? `
        <div class="flex justify-between text-rose-600">
          <span>Diskon Promo</span>
          <span>-${formatAngka(transaction.discountAmount)}</span>
        </div>
      ` : ''}
      <div class="flex justify-between font-extrabold text-xs pt-1 border-t border-dashed border-slate-400 mt-1">
        <span>TOTAL BELANJA</span>
        <span class="text-sm font-bold">${formatRupiah(transaction.grandTotal || 0)}</span>
      </div>
      ${(transaction.pointDiscount > 0 || (transaction.pointsRedeemed > 0)) ? `
        <div class="flex justify-between text-indigo-700 font-bold">
          <span>Potongan Poin (${formatAngka(transaction.pointsRedeemed || 0)} Poin)</span>
          <span>-${formatRupiah(transaction.pointDiscount || 0)}</span>
        </div>
        <div class="flex justify-between font-bold text-slate-800">
          <span>Sisa Tagihan</span>
          <span>${formatRupiah(transaction.payableAmount !== undefined ? transaction.payableAmount : ((transaction.grandTotal || 0) - (transaction.pointDiscount || 0)))}</span>
        </div>
      ` : ''}
      <div class="flex justify-between mt-1">
        <span>Bayar (${paymentLabelMap[transaction.paymentMethod] || (transaction.paymentMethod || 'TUNAI').toUpperCase()})</span>
        <span>${formatAngka(transaction.cashTendered || transaction.amountPaid || transaction.grandTotal || 0)}</span>
      </div>
      <div class="flex justify-between font-bold">
        <span>Kembalian</span>
        <span>${formatAngka(transaction.changeAmount || transaction.change || 0)}</span>
      </div>
    </div>

    ${(() => {
      const member = transaction.member || (transaction.memberName || transaction.memberId ? {
        id: transaction.memberId,
        name: transaction.memberName,
        phone: transaction.memberPhone,
        pointsRedeemed: transaction.pointsRedeemed || 0,
        pointsEarned: transaction.memberPoints || 0,
        totalPoints: transaction.memberTotalPoints !== undefined ? transaction.memberTotalPoints : (transaction.totalPoints || 0)
      } : null);

      if (!member || (!member.name && !member.id)) return '';

      const redeemed = Number(transaction.pointsRedeemed || member.pointsRedeemed || 0);
      const earned = Number(member.pointsEarned !== undefined ? member.pointsEarned : (transaction.memberPoints || 0));
      const totalPts = Number(member.totalPoints !== undefined ? member.totalPoints : (transaction.memberTotalPoints !== undefined ? transaction.memberTotalPoints : 0));

      return `
        <div class="receipt-dashed-line"></div>
        <div class="text-[10px] leading-tight space-y-0.5 font-mono">
          <div class="flex justify-between font-bold text-slate-900">
            <span>MEMBER</span>
            <span>${member.name || 'Member'}</span>
          </div>
          <div class="flex justify-between text-slate-600">
            <span>NO. HP</span>
            <span>${member.phone || '-'}</span>
          </div>
          ${redeemed > 0 ? `
            <div class="flex justify-between font-bold text-rose-600">
              <span>POIN DITUKAR</span>
              <span>-${formatAngka(redeemed)} Poin</span>
            </div>
          ` : ''}
          <div class="flex justify-between font-bold text-emerald-700">
            <span>POIN DIPEROLEH</span>
            <span>+${formatAngka(earned)} Poin</span>
          </div>
          <div class="flex justify-between font-bold text-slate-800">
            <span>TOTAL SALDO POIN</span>
            <span>${formatAngka(totalPts)} Poin</span>
          </div>
        </div>
      `;
    })()}

    <div class="receipt-double-line"></div>

    <div class="text-center text-[10px] text-slate-600 mt-2 space-y-0.5 whitespace-pre-line">
      ${pos.settings.receiptFooter || 'Terima kasih atas kunjungan Anda!\nBarang yang sudah dibeli tidak dapat ditukar/dikembalikan.'}
    </div>
  `;
}

// Render Struk Thermal Kasir
function openReceiptModal(trx = null) {
  const transaction = trx || lastCompletedTransaction;
  if (!transaction) return;
  lastCompletedTransaction = transaction;

  const receiptContent = document.getElementById("thermal-receipt-content");
  const is80 = pos.settings.paperWidth === "80mm";
  if (receiptContent) {
    receiptContent.className = `thermal-receipt ${is80 ? 'width-80' : 'width-58'}`;
    receiptContent.innerHTML = renderReceiptHtml(transaction);
  }

  // Langsung siapkan juga container cetak printable-receipt-container agar langsung siap tanpa delay
  preparePrintableReceipt(transaction);

  openModal("modal-receipt");
}

function openReceiptModalById(trxId) {
  const transaction = (pos.transactions || []).find(t => String(t.id) === String(trxId)) || 
                      (lastCompletedTransaction && String(lastCompletedTransaction.id) === String(trxId) ? lastCompletedTransaction : null);
  if (!transaction) {
    if (typeof showToast === 'function') showToast("Data transaksi tidak ditemukan!", "warning");
    return;
  }
  openReceiptModal(transaction);
}

async function reprintTransactionById(trxId) {
  const transaction = (pos.transactions || []).find(t => String(t.id) === String(trxId)) || 
                      (lastCompletedTransaction && String(lastCompletedTransaction.id) === String(trxId) ? lastCompletedTransaction : null);
  if (!transaction) {
    if (typeof showToast === 'function') showToast("Data transaksi tidak ditemukan untuk dicetak ulang!", "warning");
    return;
  }

  lastCompletedTransaction = transaction;
  preparePrintableReceipt(transaction);

  // Jika printer Bluetooth Web terhubung langsung, cetak cepat via Bluetooth
  if (typeof isBluetoothConnected === 'function' && isBluetoothConnected()) {
    if (typeof showToast === 'function') showToast(`Mencetak ulang struk #${transaction.id} ke printer Bluetooth...`, "info");
    if (typeof printReceiptUniversal === 'function') {
      await printReceiptUniversal(transaction);
    }
    return;
  }

  // Jika Bluetooth belum terhubung, buka modal pratinjau struk agar kasir bisa lihat dan cetak via sistem/Bluetooth
  openReceiptModal(transaction);
  if (typeof showToast === 'function') showToast(`Pratinjau struk #${transaction.id} siap dicetak.`, "info");
}

function preparePrintableReceipt(trx = null) {
  const target = document.getElementById("printable-receipt-container");
  if (!target) return;

  const is80 = pos.settings && pos.settings.paperWidth === "80mm";

  // 1. Prioritas Utama: Jika modal cetak label sedang terbuka, siapkan label produk
  const isLabelOpen = !document.getElementById("modal-print-label")?.classList.contains("hidden");
  if (isLabelOpen) {
    if (typeof preparePrintableLabels === "function") {
      preparePrintableLabels();
    }
    return;
  }

  // 2. Jika modal retur atau klerk terbuka, salin dari modal terkait
  const isReturOpen = !document.getElementById("modal-receipt-retur")?.classList.contains("hidden");
  const isKlerkOpen = !document.getElementById("modal-receipt-klerk")?.classList.contains("hidden");
  if (isKlerkOpen) {
    const src = document.getElementById("thermal-receipt-klerk-content");
    if (src && src.innerHTML.trim().length > 0) {
      target.innerHTML = src.innerHTML;
      target.className = src.className || `thermal-receipt ${is80 ? 'width-80' : 'width-58'}`;
      target.classList.remove("hidden");
      return;
    }
  } else if (isReturOpen) {
    const src = document.getElementById("thermal-receipt-retur-content");
    if (src && src.innerHTML.trim().length > 0) {
      target.innerHTML = src.innerHTML;
      target.className = src.className || `thermal-receipt ${is80 ? 'width-80' : 'width-58'}`;
      target.classList.remove("hidden");
      return;
    }
  }

  // 3. Struk Transaksi Penjualan (transaksi saat ini atau transaksi terakhir)
  const transaction = trx || lastCompletedTransaction;
  if (transaction) {
    target.innerHTML = renderReceiptHtml(transaction);
    target.className = `thermal-receipt ${is80 ? 'width-80' : 'width-58'}`;
    target.classList.remove("hidden");
    return;
  }

  // 4. Fallback modal-receipt
  const isReceiptOpen = !document.getElementById("modal-receipt")?.classList.contains("hidden");
  if (isReceiptOpen) {
    const src = document.getElementById("thermal-receipt-content");
    if (src && src.innerHTML.trim().length > 0) {
      target.innerHTML = src.innerHTML;
      target.className = src.className || `thermal-receipt ${is80 ? 'width-80' : 'width-58'}`;
      target.classList.remove("hidden");
      return;
    }
  }
}

function printReceiptSystem() {
  preparePrintableReceipt(lastCompletedTransaction);
  setTimeout(() => {
    window.print();
  }, 80);
}

function printReceipt() {
  if (typeof printReceiptUniversal === "function") {
    printReceiptUniversal(lastCompletedTransaction);
    return;
  }
  printReceiptSystem();
}

window.renderReceiptHtml = renderReceiptHtml;
window.openReceiptModalById = openReceiptModalById;
window.reprintTransactionById = reprintTransactionById;
window.printReceiptSystem = printReceiptSystem;

// Sync Transaksi Tunggal Langsung ke PostgREST / Supabase Cloud
async function syncSingleTransactionToCloud(trx) {
  if (!trx || !navigator.onLine) return;
  try {
    const currentStoreId = (typeof pos !== 'undefined' && pos.settings && pos.settings.storeId) || 'STR-001';
    const payload = [{
      id: trx.id,
      store_id: currentStoreId,
      date: trx.date,
      time: trx.time,
      cashier: trx.cashier || 'Kasir',
      shift: trx.shift || 'Shift 1',
      items: trx.items || [],
      subtotal: Number(trx.subtotal) || 0,
      discount_amount: Number(trx.discountAmount) || 0,
      grand_total: Number(trx.grandTotal) || 0,
      profit: Number(trx.profit) || 0,
      payment_method: trx.paymentMethod || 'cash',
      cash_tendered: Number(trx.cashTendered) || Number(trx.grandTotal) || 0,
      change_amount: Number(trx.changeAmount) || 0,
      member_id: trx.memberId || null,
      member_name: trx.memberName || null,
      member_phone: trx.memberPhone || null,
      member_points: Number(trx.memberPoints) || 0,
      points_redeemed: Number(trx.pointsRedeemed) || 0,
      point_discount: Number(trx.pointDiscount) || 0,
      payable_amount: Number(trx.payableAmount) || (Number(trx.grandTotal) - (Number(trx.pointDiscount) || 0)),
      created_at: new Date().toISOString()
    }];

    const res = await fetch('/rest/v1/transactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      console.log(`[TransactionCloud] Transaksi ${trx.id} berhasil disinkronkan ke Supabase!`);
    } else {
      console.warn(`[TransactionCloud] Respon server:`, res.status, await res.text());
    }
  } catch (err) {
    console.warn('[TransactionCloud] Gagal sync transaksi via /rest/v1/transactions:', err);
  }
}
