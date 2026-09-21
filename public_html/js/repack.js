/**
 * SnackPOS - Modul Repacking Produk (Bulk / Bal / Dus -> Eceran / Pcs)
 * Menangani konversi stok grosir ke eceran, kalkulasi HPP otomatis, 
 * pencatatan mutasi ganda (OUT_REPACK & IN_REPACK), serta cetak stiker barcode kemasan baru.
 */

let activeRepackTab = "form"; // "form" | "history"

/**
 * Buka modal repacking
 * @param {string|null} preselectedSourceId - ID produk asal opsional jika diklik dari tabel produk
 */
function openRepackModal(preselectedSourceId = null) {
  const sourceSearch = document.getElementById("repack-source-search");
  const targetSearch = document.getElementById("repack-target-search");
  if (sourceSearch) sourceSearch.value = "";
  if (targetSearch) targetSearch.value = "";

  populateRepackDropdowns(preselectedSourceId);
  switchRepackTab("form");
  resetRepackForm();
  if (preselectedSourceId) {
    const sourceSelect = document.getElementById("repack-source-select");
    if (sourceSelect) sourceSelect.value = preselectedSourceId;
    onRepackSourceChange();
  }
  openModal("modal-repack");

  // Jika produk asal sudah ditentukan, fokuskan ke input Qty Asal
  if (preselectedSourceId) {
    setTimeout(() => {
      const qtyInput = document.getElementById("repack-source-qty");
      if (qtyInput) {
        qtyInput.focus();
        qtyInput.select();
      }
    }, 150);
  }
}

/**
 * Tutup modal repacking
 */
function closeRepackModal() {
  closeModal("modal-repack");
}

/**
 * Beralih antar tab di dalam modal repacking
 * @param {"form"|"history"} tab 
 */
function switchRepackTab(tab) {
  activeRepackTab = tab;
  const formSection = document.getElementById("repack-tab-form-content");
  const historySection = document.getElementById("repack-tab-history-content");
  const btnTabForm = document.getElementById("btn-repack-tab-form");
  const btnTabHistory = document.getElementById("btn-repack-tab-history");

  if (formSection) formSection.classList.toggle("hidden", tab !== "form");
  if (historySection) historySection.classList.toggle("hidden", tab !== "history");

  if (btnTabForm) {
    btnTabForm.className = tab === "form" 
      ? "px-4 py-2 text-xs font-black rounded-xl bg-indigo-700 text-white shadow-xs" 
      : "px-4 py-2 text-xs font-bold rounded-xl text-slate-600 hover:bg-slate-100";
  }

  if (btnTabHistory) {
    btnTabHistory.className = tab === "history" 
      ? "px-4 py-2 text-xs font-black rounded-xl bg-indigo-700 text-white shadow-xs" 
      : "px-4 py-2 text-xs font-bold rounded-xl text-slate-600 hover:bg-slate-100";
  }

  if (tab === "history") {
    renderRepackHistoryTable();
  } else {
    calculateRepackPreview();
  }
}

/**
 * Mengisi dropdown pilihan produk asal dan produk tujuan
 */
function populateRepackDropdowns(preselectedSourceId = null, preselectedTargetId = null) {
  const sourceSelect = document.getElementById("repack-source-select");
  const targetSelect = document.getElementById("repack-target-select");
  if (!sourceSelect || !targetSelect) return;

  const sortedProducts = [...pos.products].sort((a, b) => a.name.localeCompare(b.name, 'id'));

  const optionsHtml = sortedProducts.map(p => {
    return `<option value="${p.id}">${p.name} (${p.barcode}) - Stok: ${p.stock} ${p.unit}</option>`;
  }).join("");

  sourceSelect.innerHTML = `<option value="">-- Pilih Produk Asal (Bahan Baku / Bal / Dus) --</option>` + optionsHtml;
  targetSelect.innerHTML = `<option value="">-- Pilih Produk Tujuan (Hasil Repack / Pcs) --</option>` + optionsHtml;

  if (preselectedSourceId) {
    sourceSelect.value = preselectedSourceId;
  }
  if (preselectedTargetId) {
    targetSelect.value = preselectedTargetId;
  }

  onRepackSourceChange();
  onRepackTargetChange();
}

/**
 * Filter live pilihan produk asal atau produk tujuan berdasarkan ketikan / scan barcode kamera
 * @param {"source"|"target"} type 
 * @param {string} query 
 */
function filterRepackProducts(type, query = "") {
  const q = (query || "").toLowerCase().trim();
  const selectEl = document.getElementById(type === "source" ? "repack-source-select" : "repack-target-select");
  if (!selectEl) return;

  const currentVal = selectEl.value;
  const filtered = pos.products.filter(p => {
    if (!q) return true;
    return (p.name && p.name.toLowerCase().includes(q)) || 
           (p.barcode && p.barcode.toLowerCase().includes(q)) ||
           (p.id && p.id.toLowerCase().includes(q));
  });

  const defaultText = type === "source" 
    ? "-- Pilih Produk Asal (Bahan Baku / Bal / Dus) --" 
    : "-- Pilih Produk Tujuan (Hasil Repack / Pcs) --";

  let html = `<option value="">${defaultText}</option>`;
  filtered.forEach(p => {
    html += `<option value="${p.id}">${p.name} (${p.barcode}) - Stok: ${p.stock} ${p.unit}</option>`;
  });
  selectEl.innerHTML = html;

  // Cek apakah ada barcode atau ID yang cocok persis (misal hasil scan kamera barcode)
  const exactMatch = filtered.find(p => p.barcode === q || (p.barcode && p.barcode.trim() === q) || (p.id && p.id.toLowerCase() === q));
  if (exactMatch) {
    selectEl.value = exactMatch.id;
    showToast(`⚡ ${type === 'source' ? 'Bahan Asal' : 'Produk Hasil'}: ${exactMatch.name}`, "success");
    if (typeof sfx !== 'undefined' && sfx.beep) sfx.beep();
  } else if (filtered.some(p => p.id === currentVal)) {
    selectEl.value = currentVal;
  } else if (filtered.length === 1 && q.length >= 2) {
    selectEl.value = filtered[0].id;
  }

  if (type === "source") {
    onRepackSourceChange();
  } else {
    onRepackTargetChange();
  }
}

/**
 * Handler ketika produk asal dipilih
 */
function onRepackSourceChange() {
  const sourceSelect = document.getElementById("repack-source-select");
  const badgeStock = document.getElementById("repack-source-stock-badge");
  const badgeCost = document.getElementById("repack-source-cost-badge");
  const unitLabel = document.getElementById("repack-source-unit-label");

  const sourceId = sourceSelect ? sourceSelect.value : "";
  const source = pos.products.find(p => p.id === sourceId);

  if (source) {
    if (badgeStock) badgeStock.textContent = `${source.stock} ${source.unit}`;
    if (badgeCost) badgeCost.textContent = formatRupiah(source.costPrice || 0);
    if (unitLabel) unitLabel.textContent = source.unit || "Bal/Kg";
  } else {
    if (badgeStock) badgeStock.textContent = "-";
    if (badgeCost) badgeCost.textContent = "Rp 0";
    if (unitLabel) unitLabel.textContent = "Satuan";
  }

  calculateRepackPreview();
}

/**
 * Handler ketika produk tujuan dipilih
 */
function onRepackTargetChange() {
  const targetSelect = document.getElementById("repack-target-select");
  const badgeStock = document.getElementById("repack-target-stock-badge");
  const badgePrice = document.getElementById("repack-target-price-badge");
  const badgeCost = document.getElementById("repack-target-cost-badge");
  const unitLabel = document.getElementById("repack-target-unit-label");

  const targetId = targetSelect ? targetSelect.value : "";
  const target = pos.products.find(p => p.id === targetId);

  if (target) {
    if (badgeStock) badgeStock.textContent = `${target.stock} ${target.unit}`;
    if (badgePrice) badgePrice.textContent = formatRupiah(target.price || 0);
    if (badgeCost) badgeCost.textContent = formatRupiah(target.costPrice || 0);
    if (unitLabel) unitLabel.textContent = target.unit || "Pcs";
  } else {
    if (badgeStock) badgeStock.textContent = "-";
    if (badgePrice) badgePrice.textContent = "Rp 0";
    if (badgeCost) badgeCost.textContent = "Rp 0";
    if (unitLabel) unitLabel.textContent = "Pcs";
  }

  calculateRepackPreview();
}

/**
 * Kalkulasi interaktif real-time ringkasan repacking
 */
function calculateRepackPreview() {
  const sourceSelect = document.getElementById("repack-source-select");
  const targetSelect = document.getElementById("repack-target-select");
  const qtySourceInput = document.getElementById("repack-source-qty");
  const qtyTargetInput = document.getElementById("repack-target-qty");
  const packagingCostInput = document.getElementById("repack-packaging-cost");
  const alertBox = document.getElementById("repack-validation-alert");

  const sourceId = sourceSelect ? sourceSelect.value : "";
  const targetId = targetSelect ? targetSelect.value : "";
  const qtySource = parseFloat(qtySourceInput ? qtySourceInput.value : 0) || 0;
  const qtyTarget = parseFloat(qtyTargetInput ? qtyTargetInput.value : 0) || 0;
  const packagingCostPerPcs = parseFloat(packagingCostInput ? packagingCostInput.value : 0) || 0;

  const source = pos.products.find(p => p.id === sourceId);
  const target = pos.products.find(p => p.id === targetId);

  // Validasi error visual
  let errorMessage = "";
  if (sourceId && targetId && sourceId === targetId) {
    errorMessage = "⚠️ Produk Asal dan Produk Tujuan tidak boleh sama!";
  } else if (source && qtySource > source.stock) {
    errorMessage = `⚠️ Stok produk asal tidak mencukupi! (Tersedia: ${source.stock} ${source.unit}, Diminta: ${qtySource} ${source.unit})`;
  } else if (qtySource <= 0 && sourceId) {
    errorMessage = "⚠️ Jumlah asal yang di-repack harus lebih dari 0!";
  } else if (qtyTarget <= 0 && targetId) {
    errorMessage = "⚠️ Jumlah hasil kemasan (Pcs) harus lebih dari 0!";
  }

  if (alertBox) {
    if (errorMessage) {
      alertBox.textContent = errorMessage;
      alertBox.classList.remove("hidden");
    } else {
      alertBox.classList.add("hidden");
    }
  }

  // Elemen-elemen preview
  const prevSourceStockEl = document.getElementById("repack-prev-source-stock");
  const prevTargetStockEl = document.getElementById("repack-prev-target-stock");
  const prevNewHppEl = document.getElementById("repack-prev-new-hpp");
  const prevWeightedHppEl = document.getElementById("repack-prev-weighted-hpp");
  const prevTotalCostEl = document.getElementById("repack-prev-total-cost");
  const prevRevenueEl = document.getElementById("repack-prev-revenue");
  const prevMarginEl = document.getElementById("repack-prev-margin");

  if (!source || !target || qtySource <= 0 || qtyTarget <= 0) {
    if (prevSourceStockEl) prevSourceStockEl.textContent = source ? `${source.stock} ${source.unit}` : "-";
    if (prevTargetStockEl) prevTargetStockEl.textContent = target ? `${target.stock} ${target.unit}` : "-";
    if (prevNewHppEl) prevNewHppEl.textContent = "Rp 0";
    if (prevWeightedHppEl) prevWeightedHppEl.textContent = "Rp 0";
    if (prevTotalCostEl) prevTotalCostEl.textContent = "Rp 0";
    if (prevRevenueEl) prevRevenueEl.textContent = "Rp 0";
    if (prevMarginEl) prevMarginEl.textContent = "0%";
    return;
  }

  // Hitungan stok
  const remainSourceStock = source.stock - qtySource;
  const newTargetStock = target.stock + qtyTarget;

  // Hitungan HPP
  const sourceCostTotal = qtySource * (source.costPrice || 0);
  const totalPackagingCost = qtyTarget * packagingCostPerPcs;
  const totalCost = sourceCostTotal + totalPackagingCost;
  const unitHpp = Math.round(totalCost / qtyTarget);

  // Weighted Average HPP (dengan sisa stok lama di produk tujuan)
  const oldTargetStock = Math.max(0, target.stock);
  const oldTargetCostTotal = oldTargetStock * (target.costPrice || 0);
  const weightedHpp = Math.round((oldTargetCostTotal + totalCost) / (oldTargetStock + qtyTarget));

  // Potensi omzet & laba
  const potentialRevenue = qtyTarget * (target.price || 0);
  const potentialProfit = potentialRevenue - totalCost;
  const marginPercent = potentialRevenue > 0 ? Math.round((potentialProfit / potentialRevenue) * 100) : 0;

  if (prevSourceStockEl) {
    prevSourceStockEl.innerHTML = `<span class="text-slate-500">${source.stock}</span> ➔ <span class="font-bold text-rose-600">${remainSourceStock} ${source.unit}</span>`;
  }
  if (prevTargetStockEl) {
    prevTargetStockEl.innerHTML = `<span class="text-slate-500">${target.stock}</span> ➔ <span class="font-bold text-emerald-600">${newTargetStock} ${target.unit}</span>`;
  }
  if (prevTotalCostEl) prevTotalCostEl.textContent = formatRupiah(totalCost);
  if (prevNewHppEl) prevNewHppEl.textContent = `${formatRupiah(unitHpp)} / ${target.unit}`;
  if (prevWeightedHppEl) prevWeightedHppEl.textContent = `${formatRupiah(weightedHpp)} / ${target.unit}`;
  if (prevRevenueEl) prevRevenueEl.textContent = formatRupiah(potentialRevenue);
  if (prevMarginEl) {
    prevMarginEl.textContent = `${marginPercent >= 0 ? '+' : ''}${marginPercent}%`;
    prevMarginEl.className = marginPercent >= 0 ? "text-emerald-600 font-black" : "text-rose-600 font-black";
  }
}

/**
 * Eksekusi repacking stok
 */
function executeRepacking() {
  const sourceSelect = document.getElementById("repack-source-select");
  const targetSelect = document.getElementById("repack-target-select");
  const qtySourceInput = document.getElementById("repack-source-qty");
  const qtyTargetInput = document.getElementById("repack-target-qty");
  const packagingCostInput = document.getElementById("repack-packaging-cost");
  const noteInput = document.getElementById("repack-note");
  const hppModeRadios = document.getElementsByName("repack-hpp-mode");

  const sourceId = sourceSelect ? sourceSelect.value : "";
  const targetId = targetSelect ? targetSelect.value : "";
  const qtySource = parseFloat(qtySourceInput ? qtySourceInput.value : 0) || 0;
  const qtyTarget = parseFloat(qtyTargetInput ? qtyTargetInput.value : 0) || 0;
  const packagingCostPerPcs = parseFloat(packagingCostInput ? packagingCostInput.value : 0) || 0;
  const noteText = (noteInput ? noteInput.value.trim() : "") || "Repacking Kemasan Toko";

  let hppMode = "new"; // "new" | "weighted" | "keep"
  if (hppModeRadios) {
    for (const r of hppModeRadios) {
      if (r.checked) {
        hppMode = r.value;
        break;
      }
    }
  }

  if (!sourceId || !targetId) {
    showToast("Silakan pilih Produk Asal dan Produk Tujuan!", "warning");
    return;
  }
  if (sourceId === targetId) {
    showToast("Produk Asal dan Produk Tujuan tidak boleh sama!", "error");
    return;
  }
  if (qtySource <= 0 || qtyTarget <= 0) {
    showToast("Jumlah Qty Asal dan Qty Hasil harus lebih dari 0!", "warning");
    return;
  }

  const source = pos.products.find(p => p.id === sourceId);
  const target = pos.products.find(p => p.id === targetId);

  if (!source || !target) {
    showToast("Data produk tidak ditemukan!", "error");
    return;
  }

  if (qtySource > source.stock) {
    const confirmMinus = confirm(`Stok ${source.name} hanya tersedia ${source.stock} ${source.unit}.\nApakah Anda tetap ingin melanjutkan repacking? (Stok akan menjadi minus)`);
    if (!confirmMinus) return;
  }

  // Hitungan HPP
  const sourceCostTotal = qtySource * (source.costPrice || 0);
  const totalPackagingCost = qtyTarget * packagingCostPerPcs;
  const totalCost = sourceCostTotal + totalPackagingCost;
  const unitHpp = Math.round(totalCost / qtyTarget);

  const oldTargetStock = Math.max(0, target.stock);
  const oldTargetCostTotal = oldTargetStock * (target.costPrice || 0);
  const weightedHpp = Math.round((oldTargetCostTotal + totalCost) / (oldTargetStock + qtyTarget));

  // Terapkan penyesuaian stok
  source.stock -= qtySource;
  target.stock += qtyTarget;

  // Terapkan HPP baru ke produk tujuan sesuai opsi
  const oldTargetCostPrice = target.costPrice || 0;
  if (hppMode === "new") {
    target.costPrice = unitHpp;
  } else if (hppMode === "weighted") {
    target.costPrice = weightedHpp;
  }

  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toLocaleTimeString("id-ID");
  const operatorName = (pos.currentUser && pos.currentUser.name) || (pos.settings && pos.settings.cashierName) || "Kepala Toko";

  const repackDocId = `RPK-${dateStr.replace(/-/g, "")}-${String((pos.repackLogs ? pos.repackLogs.length : 0) + 1).padStart(4, "0")}`;

  // 1. Catat Mutasi Keluar Bahan Baku (OUT_REPACK)
  pos.mutations.unshift({
    id: `MUT-${dateStr.replace(/-/g, "")}-${String(pos.mutations.length + 1).padStart(4, "0")}`,
    date: dateStr,
    time: timeStr,
    type: "OUT_REPACK",
    productId: source.id,
    productName: source.name,
    barcode: source.barcode,
    qty: -qtySource,
    note: `Repack ke: ${target.name} (+${qtyTarget} ${target.unit}) [${repackDocId}] - ${noteText}`,
    operator: operatorName
  });

  // 2. Catat Mutasi Masuk Produk Hasil (IN_REPACK)
  pos.mutations.unshift({
    id: `MUT-${dateStr.replace(/-/g, "")}-${String(pos.mutations.length + 1).padStart(4, "0")}`,
    date: dateStr,
    time: timeStr,
    type: "IN_REPACK",
    productId: target.id,
    productName: target.name,
    barcode: target.barcode,
    qty: qtyTarget,
    note: `Hasil repack dari: ${source.name} (-${qtySource} ${source.unit}) [${repackDocId}] - ${noteText}`,
    operator: operatorName
  });

  // 3. Catat Dokumen Log Repacking
  if (!pos.repackLogs) pos.repackLogs = [];
  const repackRecord = {
    id: repackDocId,
    date: dateStr,
    time: timeStr,
    sourceId: source.id,
    sourceName: source.name,
    sourceBarcode: source.barcode,
    sourceQty: qtySource,
    sourceUnit: source.unit,
    sourceCostPrice: source.costPrice || 0,
    targetId: target.id,
    targetName: target.name,
    targetBarcode: target.barcode,
    targetQty: qtyTarget,
    targetUnit: target.unit,
    targetPrice: target.price || 0,
    oldTargetCostPrice: oldTargetCostPrice,
    appliedCostPrice: target.costPrice,
    packagingCostPerPcs: packagingCostPerPcs,
    totalPackagingCost: totalPackagingCost,
    totalCost: totalCost,
    unitHpp: unitHpp,
    weightedHpp: weightedHpp,
    hppMode: hppMode,
    note: noteText,
    operator: operatorName,
    createdAt: new Date().toISOString()
  };

  pos.repackLogs.unshift(repackRecord);

  // Simpan data
  pos.saveProducts();
  pos.saveMutations();
  pos.saveRepackLogs();

  // Sinkronisasi Supabase jika aktif
  if (pos.settings && pos.settings.supabaseUrl && pos.settings.supabaseKey && navigator.onLine && typeof syncToSupabase === 'function') {
    syncToSupabase(true);
  }

  // Refresh UI
  renderInventoryTable();
  renderPosCart();
  if (typeof posViewMode !== 'undefined' && posViewMode === "touch" && typeof renderTouchGrid === 'function') {
    renderTouchGrid();
  }

  if (typeof sfx !== 'undefined' && sfx.success) sfx.success();

  // Tampilkan modal hasil sukses beserta shortcut cetak stiker barcode
  showRepackSuccessModal(repackRecord);
}

/**
 * Menampilkan kartu notifikasi sukses repacking dengan tombol aksi cetak stiker kemasan
 */
function showRepackSuccessModal(record) {
  const resultCard = document.getElementById("repack-success-card");
  const formCard = document.getElementById("repack-main-form-card");
  if (!resultCard || !formCard) {
    showToast(`✅ Berhasil Repacking ${record.sourceQty} ${record.sourceUnit} ➔ ${record.targetQty} ${record.targetUnit}!`, "success");
    closeRepackModal();
    return;
  }

  document.getElementById("repack-succ-id").textContent = record.id;
  document.getElementById("repack-succ-source-info").textContent = `${record.sourceName} (${record.sourceQty} ${record.sourceUnit})`;
  document.getElementById("repack-succ-target-info").textContent = `${record.targetName} (${record.targetQty} ${record.targetUnit})`;
  document.getElementById("repack-succ-hpp-info").textContent = `${formatRupiah(record.appliedCostPrice)} / ${record.targetUnit}`;
  document.getElementById("repack-succ-target-barcode").textContent = record.targetBarcode;

  // Tombol aksi cetak stiker
  const btnPrintSticker = document.getElementById("btn-repack-succ-print-sticker");
  if (btnPrintSticker) {
    btnPrintSticker.onclick = () => {
      closeRepackModal();
      printRepackTargetStickers(record.targetId, record.targetQty);
    };
  }

  // Tombol aksi cetak bukti transaksi
  const btnPrintReceipt = document.getElementById("btn-repack-succ-print-receipt");
  if (btnPrintReceipt) {
    btnPrintReceipt.onclick = () => {
      printRepackReceipt(record.id);
    };
  }

  formCard.classList.add("hidden");
  resultCard.classList.remove("hidden");
}

/**
 * Reset form repacking untuk transaksi baru
 */
function resetRepackForm() {
  const resultCard = document.getElementById("repack-success-card");
  const formCard = document.getElementById("repack-main-form-card");
  if (resultCard) resultCard.classList.add("hidden");
  if (formCard) formCard.classList.remove("hidden");

  const sourceSearch = document.getElementById("repack-source-search");
  const targetSearch = document.getElementById("repack-target-search");
  if (sourceSearch) sourceSearch.value = "";
  if (targetSearch) targetSearch.value = "";

  populateRepackDropdowns();

  const qtySourceInput = document.getElementById("repack-source-qty");
  const qtyTargetInput = document.getElementById("repack-target-qty");
  const packagingCostInput = document.getElementById("repack-packaging-cost");
  const noteInput = document.getElementById("repack-note");

  if (qtySourceInput) qtySourceInput.value = "1";
  if (qtyTargetInput) qtyTargetInput.value = "10";
  if (packagingCostInput) packagingCostInput.value = "0";
  if (noteInput) noteInput.value = "";

  calculateRepackPreview();
}

/**
 * Cetak stiker barcode untuk produk hasil repacking
 * @param {string} targetProductId 
 * @param {number} qty 
 */
function printRepackTargetStickers(targetProductId, qty = 1) {
  if (typeof selectedInventoryIds !== 'undefined' && typeof openBatchPrintModal === 'function') {
    selectedInventoryIds.clear();
    selectedInventoryIds.add(targetProductId);
    selectedInventoryIds.add(String(targetProductId));
    if (typeof updateInventorySelectAllCheckbox === 'function') updateInventorySelectAllCheckbox();
    if (typeof updateInventoryBatchBar === 'function') updateInventoryBatchBar();
    if (typeof renderInventoryTable === 'function') renderInventoryTable();
    
    // Buka modal cetak label format stiker barcode
    openBatchPrintModal('sticker');

    // Set jumlah cetak stiker sesuai Qty hasil repacking
    setTimeout(() => {
      const copyInput = document.getElementById("label-print-copies") || document.getElementById("label-copies-count");
      if (copyInput) {
        copyInput.value = Math.max(1, qty);
        if (typeof renderLabelPreview === 'function') renderLabelPreview();
      }
    }, 150);
  } else {
    showToast(`Produk siap: Barcode ${targetProductId} sejumlah ${qty} pcs.`, "info");
  }
}

/**
 * Merender tabel riwayat repacking
 */
function renderRepackHistoryTable() {
  const tbody = document.getElementById("repack-history-table-body");
  const emptyState = document.getElementById("repack-history-empty");
  if (!tbody) return;

  const logs = pos.repackLogs || [];

  if (logs.length === 0) {
    tbody.innerHTML = "";
    if (emptyState) emptyState.classList.remove("hidden");
    return;
  }

  if (emptyState) emptyState.classList.add("hidden");

  tbody.innerHTML = logs.slice(0, 50).map(m => {
    return `
      <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs transition-colors">
        <td class="py-2.5 px-3 font-mono font-bold text-indigo-900 whitespace-nowrap">
          <div>${m.id}</div>
          <div class="text-[10px] text-slate-400 font-normal">${m.date} ${m.time}</div>
        </td>
        <td class="py-2.5 px-3">
          <div class="font-bold text-slate-800">${m.sourceName}</div>
          <div class="text-[10px] text-rose-600 font-mono font-bold">
            -${m.sourceQty} ${m.sourceUnit} • Modal: ${formatRupiah(m.sourceCostPrice)}
          </div>
        </td>
        <td class="py-2.5 px-3">
          <div class="font-bold text-slate-800">${m.targetName}</div>
          <div class="text-[10px] text-emerald-600 font-mono font-bold">
            +${m.targetQty} ${m.targetUnit} • HPP: ${formatRupiah(m.appliedCostPrice)}
          </div>
        </td>
        <td class="py-2.5 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
          <div>${formatRupiah(m.totalCost)}</div>
          <div class="text-[10px] text-slate-400 font-normal">Kemasan: +${formatRupiah(m.totalPackagingCost || 0)}</div>
        </td>
        <td class="py-2.5 px-3 text-slate-500 text-[11px]">
          <div>${m.operator || 'Kasir'}</div>
          <div class="text-[10px] text-slate-400 italic truncate max-w-[120px]">${m.note || '-'}</div>
        </td>
        <td class="py-2.5 px-3 text-center whitespace-nowrap">
          <div class="flex items-center justify-center gap-1">
            <button 
              type="button"
              onclick="printRepackTargetStickers('${m.targetId}', ${m.targetQty})" 
              class="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg font-bold text-[11px] cursor-pointer" 
              title="Cetak Stiker Barcode Produk Hasil (${m.targetQty} pcs)"
            >
              🏷️ ${m.targetQty}
            </button>
            <button 
              type="button"
              onclick="printRepackReceipt('${m.id}')" 
              class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg font-bold text-[11px] cursor-pointer" 
              title="Cetak Dokumen Bukti Repacking"
            >
              📄
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

/**
 * Mencetak bukti transaksi repacking ke printer struk ESC/POS atau dialog sistem
 * @param {string} repackId 
 */
function printRepackReceipt(repackId) {
  const record = (pos.repackLogs || []).find(r => r.id === repackId);
  if (!record) {
    showToast("Dokumen repacking tidak ditemukan!", "error");
    return;
  }

  const storeName = ((pos.settings && pos.settings.storeName) || "TOKO SNACK BERKAH").toUpperCase();
  const storeAddress = (pos.settings && pos.settings.storeAddress) || "Jl. Raya Jajanan No. 88";
  const driverMode = (pos.settings && pos.settings.printerDriverMode) || 'bluetooth';

  // Format ESC/POS Thermal 58mm / 80mm
  const is80 = pos.settings && pos.settings.paperWidth === "80mm";
  const lineWidth = is80 ? 48 : 32;

  if (typeof EscPosBuilder !== 'undefined' && driverMode !== 'system') {
    const builder = new EscPosBuilder(lineWidth);
    builder.init()
      .alignCenter()
      .bold(true).text(storeName).newline()
      .bold(false).text(storeAddress).newline()
      .lineDashed('-')
      .bold(true).text("BUKTI REPACKING PRODUK").newline()
      .bold(false).text(record.id).newline()
      .lineDashed('-')
      .alignLeft()
      .text(`Waktu    : ${record.date} ${record.time}`).newline()
      .text(`Petugas  : ${record.operator || 'Kasir'}`).newline()
      .lineDashed('-')
      .bold(true).text("1. BAHAN ASAL (DIPOTONG):").newline().bold(false)
      .text(`Nama : ${record.sourceName}`).newline()
      .text(`Kode : ${record.sourceBarcode}`).newline()
      .text(`Qty  : -${record.sourceQty} ${record.sourceUnit}`).newline()
      .text(`Modal: ${formatRupiah(record.sourceCostPrice)} / ${record.sourceUnit}`).newline()
      .lineDashed('.')
      .bold(true).text("2. HASIL REPACK (DITAMBAH):").newline().bold(false)
      .text(`Nama : ${record.targetName}`).newline()
      .text(`Kode : ${record.targetBarcode}`).newline()
      .text(`Qty  : +${record.targetQty} ${record.targetUnit}`).newline()
      .text(`HPP  : ${formatRupiah(record.appliedCostPrice)} / ${record.targetUnit}`).newline()
      .lineDashed('.')
      .text(`Biaya Kemasan : ${formatRupiah(record.totalPackagingCost || 0)}`).newline()
      .bold(true).text(`Total Modal   : ${formatRupiah(record.totalCost)}`).newline().bold(false)
      .lineDashed('-')
      .alignCenter()
      .text(`Catatan: ${record.note || '-'}`).newline()
      .newline()
      .text("Dokumen Konversi Internal Toko").newline()
      .feed(4);

    const bytes = builder.build();

    if (driverMode === 'bluetooth' && typeof isBluetoothConnected === 'function' && isBluetoothConnected()) {
      sendBytesToBluetooth(bytes).then(() => {
        showToast("Bukti Repacking berhasil dicetak ke Printer Bluetooth!", "success");
      }).catch(err => {
        showToast("Gagal cetak Bluetooth: " + err.message, "error");
      });
      return;
    } else if (driverMode === 'rawbt') {
      printViaRawBT(bytes);
      return;
    }
  }

  // Fallback cetak sistem browser
  const printWindow = window.open('', '_blank', 'width=380,height=600');
  if (printWindow) {
    printWindow.document.write(`
      <html>
        <head>
          <title>Bukti Repacking - ${record.id}</title>
          <style>
            body { font-family: 'Courier New', monospace; font-size: 12px; padding: 15px; color: #000; width: 68mm; margin: 0 auto; }
            .text-center { text-align: center; }
            .font-bold { font-weight: bold; }
            .line { border-top: 1px dashed #000; margin: 8px 0; }
            .item { margin-bottom: 4px; }
            .flex-between { display: flex; justify-content: space-between; }
          </style>
        </head>
        <body onload="window.print(); setTimeout(() => window.close(), 500);">
          <div class="text-center font-bold" style="font-size: 14px;">${storeName}</div>
          <div class="text-center" style="font-size: 10px;">${storeAddress}</div>
          <div class="line"></div>
          <div class="text-center font-bold">BUKTI REPACKING PRODUK</div>
          <div class="text-center font-bold" style="font-size: 11px;">${record.id}</div>
          <div class="line"></div>
          <div class="item">Waktu   : ${record.date} ${record.time}</div>
          <div class="item">Petugas : ${record.operator || 'Kasir'}</div>
          <div class="line"></div>
          <div class="font-bold">[BAHAN ASAL DIPOTONG]</div>
          <div class="item">${record.sourceName}</div>
          <div class="flex-between"><span>Qty:</span><span class="font-bold">-${record.sourceQty} ${record.sourceUnit}</span></div>
          <div class="flex-between"><span>Modal:</span><span>${formatRupiah(record.sourceCostPrice)}</span></div>
          <div class="line" style="border-style: dotted;"></div>
          <div class="font-bold">[HASIL REPACK DITAMBAH]</div>
          <div class="item">${record.targetName}</div>
          <div class="flex-between"><span>Qty:</span><span class="font-bold">+${record.targetQty} ${record.targetUnit}</span></div>
          <div class="flex-between"><span>HPP Baru:</span><span class="font-bold">${formatRupiah(record.appliedCostPrice)} / ${record.targetUnit}</span></div>
          <div class="flex-between"><span>Harga Jual:</span><span>${formatRupiah(record.targetPrice)}</span></div>
          <div class="line" style="border-style: dotted;"></div>
          <div class="flex-between"><span>Biaya Kemasan:</span><span>${formatRupiah(record.totalPackagingCost || 0)}</span></div>
          <div class="flex-between font-bold" style="font-size: 13px;"><span>TOTAL MODAL:</span><span>${formatRupiah(record.totalCost)}</span></div>
          <div class="line"></div>
          <div class="text-center" style="font-size: 10px;">Catatan: ${record.note || '-'}</div>
          <div class="text-center" style="font-size: 10px; margin-top: 10px;">=== DOKUMEN INTERNAL TOKO ===</div>
        </body>
      </html>
    `);
    printWindow.document.close();
  }
}

