/**
 * SnackPOS - Stock Opname & Inventory Mutation (F6 & F7)
 */

// ==========================================
// 5. MODUL STOCK OPNAME (SO) RETAIL MINIMARKET
// Menyesuaikan Stok Fisik Rak vs Stok Komputer
// ==========================================
let soPhysicalCounts = {}; // { [productId]: count }

function openStockOpnameModal() {
  soPhysicalCounts = {};
  // Defaultkan stok fisik sama dengan stok komputer awal
  pos.products.forEach(p => {
    soPhysicalCounts[p.id] = p.stock;
  });
  renderStockOpnameTable();
  openModal("modal-stock-opname");
}

function renderStockOpnameTable() {
  const tbody = document.getElementById("so-table-body");
  const searchInput = document.getElementById("so-search-input");
  const query = searchInput ? searchInput.value.toLowerCase().trim() : "";

  const filtered = pos.products.filter(p => {
    return !query || p.name.toLowerCase().includes(query) || p.barcode.includes(query);
  });

  let totalSelisihPlus = 0;
  let totalSelisihMinus = 0;
  let totalNominalSelisih = 0;

  tbody.innerHTML = filtered.map((p, idx) => {
    const fisik = soPhysicalCounts[p.id] !== undefined ? soPhysicalCounts[p.id] : p.stock;
    const selisih = fisik - p.stock;
    const nominalSelisih = selisih * p.costPrice;

    if (selisih > 0) totalSelisihPlus += selisih;
    if (selisih < 0) totalSelisihMinus += Math.abs(selisih);
    totalNominalSelisih += nominalSelisih;

    let selisihBadge = "";
    if (selisih > 0) {
      selisihBadge = `<span class="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full font-bold">+${selisih} (Plus)</span>`;
    } else if (selisih < 0) {
      selisihBadge = `<span class="px-2 py-0.5 bg-rose-100 text-rose-800 rounded-full font-bold">${selisih} (Minus/Hilang)</span>`;
    } else {
      selisihBadge = `<span class="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold">0 (Pas)</span>`;
    }

    return `
      <tr class="border-b border-slate-200 hover:bg-slate-50 text-xs">
        <td class="py-2.5 px-3 font-mono text-slate-400 text-center">${idx + 1}</td>
        <td class="py-2.5 px-3 font-mono font-bold text-blue-700">${p.barcode}</td>
        <td class="py-2.5 px-3 font-bold text-slate-800">${p.name}</td>
        <td class="py-2.5 px-3 text-center font-bold text-slate-700 bg-slate-50">${p.stock}</td>
        <td class="py-2.5 px-3 text-center">
          <input 
            type="number" 
            value="${fisik}"
            min="0"
            onchange="onSoCountChange('${p.id}', this.value)"
            class="w-16 px-2 py-1 border-2 border-slate-300 rounded-lg text-center font-black text-sm focus:border-alfa-red focus:outline-none"
          />
        </td>
        <td class="py-2.5 px-3 text-center">${selisihBadge}</td>
        <td class="py-2.5 px-3 text-right font-mono font-bold ${nominalSelisih < 0 ? 'text-rose-600' : nominalSelisih > 0 ? 'text-blue-600' : 'text-slate-400'}">
          ${formatRupiah(nominalSelisih)}
        </td>
      </tr>
    `;
  }).join("");

  // Update ringkasan SO
  const summaryPlus = document.getElementById("so-summary-plus");
  const summaryMinus = document.getElementById("so-summary-minus");
  const summaryNominal = document.getElementById("so-summary-nominal");

  if (summaryPlus) summaryPlus.textContent = `+${totalSelisihPlus} pcs`;
  if (summaryMinus) summaryMinus.textContent = `-${totalSelisihMinus} pcs`;
  if (summaryNominal) summaryNominal.textContent = formatRupiah(totalNominalSelisih);
}

function onSoCountChange(productId, val) {
  soPhysicalCounts[productId] = parseInt(val) || 0;
  renderStockOpnameTable();
}

function executeStockAdjustment() {
  requestSupervisorAuth("STOCK_OPNAME", "Penyesuaian Fisik Stock Opname Toko [F6]", (supervisor) => {
    executeSaveStockAdjustment(supervisor);
  });
}

function executeSaveStockAdjustment(supervisor = null) {
  let adjustedCount = 0;
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toLocaleTimeString("id-ID");
  const operatorName = supervisor ? `${supervisor.role} ${supervisor.name} (${supervisor.nik})` : (pos.currentUser ? `${pos.currentUser.role} ${pos.currentUser.name} (${pos.currentUser.nik})` : "Pejabat Toko");

  pos.products.forEach(p => {
    const fisik = soPhysicalCounts[p.id];
    if (fisik !== undefined && fisik !== p.stock) {
      const diff = fisik - p.stock;
      p.stock = fisik;
      adjustedCount++;

      const costPrice = p.costPrice || p.buyPrice || 0;
      const sellPrice = p.price || 0;

      // Catat ke Log Mutasi SO
      pos.mutations.unshift({
        id: `SO-${dateStr.replace(/-/g, "")}-${String(pos.mutations.length + 1).padStart(4, "0")}`,
        date: dateStr,
        time: timeStr,
        type: diff > 0 ? "SO_PLUS" : "SO_MINUS",
        productId: p.id,
        productName: p.name,
        barcode: p.barcode,
        qty: diff,
        costPrice: costPrice,
        sellPrice: sellPrice,
        totalCostDiff: diff * costPrice,
        totalSellDiff: diff * sellPrice,
        note: `Penyesuaian Fisik Stock Opname (${diff > 0 ? '+' : ''}${diff})`,
        operator: operatorName
      });
    }
  });

  if (adjustedCount === 0) {
    showToast("Semua stok fisik sudah sesuai dengan stok komputer, tidak ada yang perlu disesuaikan.", "info");
    return;
  }

  pos.saveProducts();
  pos.saveMutations();

  // Sync ke Supabase
  if (pos.settings.supabaseUrl && pos.settings.supabaseKey && navigator.onLine) {
    syncToSupabase(true);
  }

  closeModal("modal-stock-opname");
  renderPosCart();
  if (posViewMode === "touch") renderTouchGrid();
  renderReports();

  sfx.success();
  showToast(`Sukses! ${adjustedCount} produk berhasil disesuaikan dengan stok fisik.`, "success");
}

// ==========================================
// 6. MODUL PENERIMAAN BARANG (LPB MULTI-ITEM PER SUPPLIER)
// ==========================================

/** State keranjang draft LPB yang sedang dibuat */
let activeLpbDraft = { items: [] };
let currentLpbDetailId = null;

// ---- Buka Modal ----
function openMutationModal() {
  if (typeof hasPermissionForAction === "function" && !hasPermissionForAction(pos.currentUser, "STOCK_MUTATION")) {
    requestSupervisorAuth("STOCK_MUTATION", "Otorisasi Penerimaan Barang (LPB) / Mutasi Stok (Khusus Pejabat Toko)", () => {
      openMutationModal();
    });
    return;
  }

  // Reset draft baru setiap kali buka
  activeLpbDraft = { items: [] };

  // Reset & inisialisasi kolom pencarian produk LPB
  clearLpbProductSelection();
  populateMutationProductSelect();

  // Populate datalist supplier dari riwayat
  refreshLpbSupplierList();

  // Render UI awal
  renderLpbDraftTable();
  renderMutationHistoryTable();
  renderLpbHistoryTable();

  // Buka di tab 1 & fokus ke pencarian produk
  switchLpbTab(1);
  openModal("modal-mutations");
  setTimeout(() => {
    const searchInput = document.getElementById("lpb-product-search");
    if (searchInput) searchInput.focus();
  }, 200);
}

// ---- Tab Switching ----
function switchLpbTab(tabNum) {
  [1, 2, 3].forEach(n => {
    const tab = document.getElementById(`lpb-tab-${n}`);
    const btn = document.getElementById(`lpb-tab-${n}-btn`);
    if (!tab || !btn) return;
    if (n === tabNum) {
      tab.classList.remove("hidden");
      btn.classList.add("text-emerald-700", "border-emerald-700", "font-black");
      btn.classList.remove("text-slate-500", "border-transparent", "font-bold");
    } else {
      tab.classList.add("hidden");
      btn.classList.remove("text-emerald-700", "border-emerald-700", "font-black");
      btn.classList.add("text-slate-500", "border-transparent", "font-bold");
    }
  });
  // Refresh riwayat saat masuk tab 2
  if (tabNum === 2) renderLpbHistoryTable();
}

// ---- Auto-Suggest & Pencarian Produk LPB ----
function handleLpbProductSearchInput(rawVal) {
  const val = (rawVal || "").trim();
  const suggestionsBox = document.getElementById("lpb-product-suggestions");
  if (!suggestionsBox) return;

  if (!val) {
    suggestionsBox.classList.add("hidden");
    suggestionsBox.innerHTML = "";
    return;
  }

  const query = val.toLowerCase();

  // Cek apakah scan barcode exact match
  const exactBarcodeMatch = (pos.products || []).find(p =>
    (p.barcode && p.barcode.toLowerCase() === query) ||
    (p.id && p.id.toLowerCase() === query) ||
    (p.wholesaleBarcode && p.wholesaleBarcode.toLowerCase() === query)
  );

  // Jika scan hardware barcode cepat (panjang >= 6 dan exact match), auto-select langsung
  if (exactBarcodeMatch && (val === exactBarcodeMatch.barcode || val === exactBarcodeMatch.id)) {
    selectLpbProduct(exactBarcodeMatch.id);
    return;
  }

  // Filter daftar kecocokan nama, barcode, atau kategori
  const matches = (pos.products || []).filter(p =>
    (p.name && p.name.toLowerCase().includes(query)) ||
    (p.barcode && p.barcode.toLowerCase().includes(query)) ||
    (p.id && p.id.toLowerCase().includes(query)) ||
    (p.category && p.category.toLowerCase().includes(query))
  ).slice(0, 15);

  renderLpbProductSuggestions(matches, exactBarcodeMatch);
}

function renderLpbProductSuggestions(matches, exactMatch = null) {
  const box = document.getElementById("lpb-product-suggestions");
  if (!box) return;

  if (matches.length === 0) {
    box.innerHTML = `
      <div class="p-3 text-xs text-slate-400 text-center">
        Produk tidak ditemukan. Pastikan barcode atau nama sudah benar.
      </div>
    `;
    box.classList.remove("hidden");
    return;
  }

  box.innerHTML = matches.map((p, idx) => `
    <div onclick="selectLpbProduct('${p.id}')"
      class="p-2.5 hover:bg-blue-50 cursor-pointer flex items-center justify-between transition-colors ${exactMatch && exactMatch.id === p.id ? 'bg-blue-100/70' : ''}">
      <div class="min-w-0 pr-2">
        <div class="text-xs font-bold text-slate-800 truncate">${p.name}</div>
        <div class="text-[10px] text-slate-500 font-mono flex items-center gap-2 mt-0.5">
          <span>PLU: ${p.barcode || p.id}</span>
          <span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-sans">Stok: ${p.stock || 0} ${p.unit || 'pcs'}</span>
        </div>
      </div>
      <div class="text-right shrink-0">
        <div class="text-xs font-bold text-emerald-700 font-mono">${formatRupiah(p.costPrice || 0)}</div>
        <div class="text-[10px] text-slate-400 font-mono">Jual: ${formatRupiah(p.price || 0)}</div>
      </div>
    </div>
  `).join("");

  box.classList.remove("hidden");
}

function selectLpbProduct(productId) {
  const p = (pos.products || []).find(prod => prod.id === productId);
  if (!p) return;

  const searchInput = document.getElementById("lpb-product-search");
  const hiddenId = document.getElementById("lpb-selected-product-id");
  const hppInput = document.getElementById("lpb-item-hpp");
  const qtyInput = document.getElementById("lpb-item-qty");
  const suggestionsBox = document.getElementById("lpb-product-suggestions");
  const infoBox = document.getElementById("lpb-selected-product-info");
  const infoLabel = document.getElementById("lpb-selected-product-label");

  if (hiddenId) hiddenId.value = p.id;
  if (searchInput) searchInput.value = `${p.barcode || p.id} - ${p.name}`;
  if (hppInput) hppInput.value = Number(p.costPrice) || 0;
  if (suggestionsBox) {
    suggestionsBox.classList.add("hidden");
    suggestionsBox.innerHTML = "";
  }

  if (infoBox && infoLabel) {
    infoLabel.textContent = `✅ Terpilih: ${p.name} (Stok Saat Ini: ${p.stock || 0} ${p.unit || 'pcs'})`;
    infoBox.classList.remove("hidden");
  }

  // Auto-fokus ke Qty untuk mempercepat input kasir
  if (qtyInput) {
    qtyInput.focus();
    qtyInput.select();
  }

  if (typeof sfx !== 'undefined' && sfx.beep) sfx.beep();
}

function clearLpbProductSelection() {
  const searchInput = document.getElementById("lpb-product-search");
  const hiddenId = document.getElementById("lpb-selected-product-id");
  const hppInput = document.getElementById("lpb-item-hpp");
  const qtyInput = document.getElementById("lpb-item-qty");
  const suggestionsBox = document.getElementById("lpb-product-suggestions");
  const infoBox = document.getElementById("lpb-selected-product-info");

  if (searchInput) searchInput.value = "";
  if (hiddenId) hiddenId.value = "";
  if (hppInput) hppInput.value = 0;
  if (qtyInput) qtyInput.value = 1;
  if (suggestionsBox) {
    suggestionsBox.classList.add("hidden");
    suggestionsBox.innerHTML = "";
  }
  if (infoBox) infoBox.classList.add("hidden");
}

function handleLpbProductSearchKeyDown(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    const query = (e.target.value || "").trim().toLowerCase();
    if (!query) return;

    // Cari exact barcode atau item pertama yang cocok
    const matched = (pos.products || []).find(p =>
      (p.barcode && p.barcode.toLowerCase() === query) ||
      (p.id && p.id.toLowerCase() === query) ||
      (p.wholesaleBarcode && p.wholesaleBarcode.toLowerCase() === query)
    ) || (pos.products || []).find(p =>
      (p.name && p.name.toLowerCase().includes(query))
    );

    if (matched) {
      selectLpbProduct(matched.id);
    } else {
      showToast(`Produk dengan kata kunci [${query}] tidak ditemukan!`, "warning");
    }
  } else if (e.key === "Escape") {
    const box = document.getElementById("lpb-product-suggestions");
    if (box) box.classList.add("hidden");
  }
}

function handleLpbBarcodeDetected(detectedCode) {
  const code = String(detectedCode || "").trim();
  if (!code) return;

  const searchInput = document.getElementById("lpb-product-search");
  if (searchInput) searchInput.value = code;

  const matched = (pos.products || []).find(p =>
    (p.barcode && p.barcode.toLowerCase() === code.toLowerCase()) ||
    (p.id && p.id.toLowerCase() === code.toLowerCase()) ||
    (p.wholesaleBarcode && p.wholesaleBarcode.toLowerCase() === code.toLowerCase())
  );

  if (matched) {
    selectLpbProduct(matched.id);
    showToast(`⚡ Kamera mendeteksi: ${matched.name}`, "success");
  } else {
    handleLpbProductSearchInput(code);
    showToast(`Barcode ${code} belum terdaftar di produk toko.`, "warning");
  }
}

// Fallback jika ada kode luar memanggil populateLpbProductSelect
function populateLpbProductSelect() {
  // Sudah digantikan oleh input interaktif handleLpbProductSearchInput
}

// Tutup dropdown suggestions LPB jika user klik di luar area
document.addEventListener("click", (e) => {
  const box = document.getElementById("lpb-product-suggestions");
  const searchInput = document.getElementById("lpb-product-search");
  if (!box || box.classList.contains("hidden")) return;
  if (!box.contains(e.target) && e.target !== searchInput) {
    box.classList.add("hidden");
  }
});

// ---- Datalist Supplier dari riwayat ----
function refreshLpbSupplierList() {
  const dl = document.getElementById("lpb-suppliers-list");
  if (!dl) return;
  const names = [...new Set((pos.lpbRecords || []).map(r => r.supplierName).filter(Boolean))];
  dl.innerHTML = names.map(n => `<option value="${n}">`).join("");
}

// ---- Tambah Item ke Draft Keranjang ----
function addLpbDraftItem() {
  let productId = document.getElementById("lpb-selected-product-id")?.value;
  const searchInput = document.getElementById("lpb-product-search");
  const qtyInput = document.getElementById("lpb-item-qty");
  const hppInput = document.getElementById("lpb-item-hpp");

  // Jika belum klik dropdown, coba cari exact match dari teks input
  if (!productId && searchInput && searchInput.value.trim()) {
    const query = searchInput.value.trim().toLowerCase();
    const matched = (pos.products || []).find(p =>
      (p.barcode && p.barcode.toLowerCase() === query) ||
      (p.id && p.id.toLowerCase() === query) ||
      (p.name && p.name.toLowerCase() === query)
    );
    if (matched) {
      productId = matched.id;
    }
  }

  const qty = parseInt(qtyInput?.value) || 0;
  const hpp = parseFloat(hppInput?.value) || 0;

  if (!productId) {
    showToast("Pilih atau scan produk terlebih dahulu!", "warning");
    if (searchInput) searchInput.focus();
    return;
  }
  if (qty <= 0) {
    showToast("Qty terima harus lebih dari 0!", "warning");
    if (qtyInput) qtyInput.focus();
    return;
  }

  const p = pos.products.find(prod => prod.id === productId);
  if (!p) {
    showToast("Data produk tidak ditemukan!", "warning");
    return;
  }

  // Jika produk sudah ada di draft, tambah qty & perbarui HPP
  const existing = activeLpbDraft.items.find(i => i.productId === productId);
  if (existing) {
    existing.qty += qty;
    existing.costPrice = hpp;
    existing.subtotal = existing.qty * hpp;
  } else {
    activeLpbDraft.items.push({
      productId: p.id,
      productName: p.name,
      barcode: p.barcode || p.id,
      qty: qty,
      costPrice: hpp,
      subtotal: qty * hpp
    });
  }

  // Reset input produk agar siap scan/ketik produk berikutnya langsung
  clearLpbProductSelection();

  renderLpbDraftTable();
  if (typeof sfx !== 'undefined' && sfx.beep) sfx.beep();
  showToast(`+${qty} ${p.name} masuk draft LPB`, "success");

  // Fokus kembali ke input pencarian
  if (searchInput) searchInput.focus();
}

// ---- Hapus Item dari Draft ----
function removeLpbDraftItem(productId) {
  activeLpbDraft.items = activeLpbDraft.items.filter(i => i.productId !== productId);
  renderLpbDraftTable();
}

// ---- Render Tabel Draft + Counter ----
function renderLpbDraftTable() {
  const tbody = document.getElementById("lpb-draft-table-body");
  if (!tbody) return;

  const items = activeLpbDraft.items;

  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-slate-400 text-[11px]">Belum ada item. Tambahkan produk di atas.</td></tr>`;
  } else {
    tbody.innerHTML = items.map((item, idx) => `
      <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs">
        <td class="py-2.5 px-3 font-bold text-slate-800">${item.productName}<br><span class="text-[10px] text-slate-400 font-mono">${item.barcode}</span></td>
        <td class="py-2.5 px-3 text-center font-mono font-bold text-emerald-700">${item.qty}</td>
        <td class="py-2.5 px-3 text-right font-mono">${formatRupiah(item.costPrice)}</td>
        <td class="py-2.5 px-3 text-right font-mono font-bold">${formatRupiah(item.subtotal)}</td>
        <td class="py-2.5 px-3 text-center">
          <button onclick="removeLpbDraftItem('${item.productId}')"
            class="text-rose-500 hover:text-rose-700 font-bold text-base leading-none">✕</button>
        </td>
      </tr>
    `).join("");
  }

  // Update counter
  const totalSku = items.length;
  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const totalRp = items.reduce((s, i) => s + i.subtotal, 0);

  const skuEl = document.getElementById("lpb-total-sku");
  const qtyEl = document.getElementById("lpb-total-qty");
  const rpEl = document.getElementById("lpb-total-rp");
  if (skuEl) skuEl.textContent = totalSku;
  if (qtyEl) qtyEl.textContent = totalQty;
  if (rpEl) rpEl.textContent = formatRupiah(totalRp);
}

// ---- Simpan Dokumen LPB (atomik) ----
function processSaveLpbDocument(andPrint = false) {
  const supplierName = document.getElementById("lpb-supplier-name")?.value.trim();
  const invoiceNo = document.getElementById("lpb-invoice-no")?.value.trim() || "-";
  const paymentType = document.getElementById("lpb-payment-type")?.value || "KREDIT";
  const note = document.getElementById("lpb-note")?.value.trim() || "";

  if (!supplierName) {
    showToast("Nama Supplier wajib diisi!", "warning");
    document.getElementById("lpb-supplier-name")?.focus();
    return;
  }

  if (activeLpbDraft.items.length === 0) {
    showToast("Keranjang LPB masih kosong! Tambahkan produk terlebih dahulu.", "warning");
    return;
  }

  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toLocaleTimeString("id-ID");
  const dateKey = dateStr.replace(/-/g, "");

  // Generate nomor LPB unik
  const todayLpbs = (pos.lpbRecords || []).filter(r => r.date === dateStr);
  const seq = String(todayLpbs.length + 1).padStart(3, "0");
  const lpbId = `LPB-${dateKey}-${seq}`;

  const operator = pos.currentUser?.name || pos.settings.cashierName || "Kepala Toko";

  // Hitung total
  const totalQty = activeLpbDraft.items.reduce((s, i) => s + i.qty, 0);
  const totalValue = activeLpbDraft.items.reduce((s, i) => s + i.subtotal, 0);
  const totalItems = activeLpbDraft.items.length;

  // === ATOMIC UPDATE ===
  // 1. Update stok & costPrice setiap produk
  activeLpbDraft.items.forEach(item => {
    const p = pos.products.find(prod => prod.id === item.productId);
    if (!p) return;
    p.stock += item.qty;
    if (item.costPrice > 0) p.costPrice = item.costPrice;
  });

  // 2. Tulis N entri ke pos.mutations (satu per item, tagged dengan lpbId)
  const mutBase = pos.mutations.length;
  activeLpbDraft.items.forEach((item, idx) => {
    pos.mutations.unshift({
      id: `MUT-${dateKey}-${String(mutBase + idx + 1).padStart(4, "0")}`,
      date: dateStr,
      time: timeStr,
      type: "IN_SUPPLIER",
      productId: item.productId,
      productName: item.productName,
      barcode: item.barcode,
      qty: item.qty,
      note: `LPB ${invoiceNo} | ${supplierName}`,
      operator: operator,
      // Metadata LPB (extended fields — backward compatible)
      lpbId: lpbId,
      supplierName: supplierName,
      invoiceNo: invoiceNo,
      costPrice: item.costPrice,
      subtotalRupiah: item.subtotal
    });
  });

  // 3. Tulis 1 dokumen LPB ke pos.lpbRecords
  const lpbDoc = {
    id: lpbId,
    date: dateStr,
    time: timeStr,
    supplierName: supplierName,
    invoiceNo: invoiceNo,
    paymentType: paymentType,
    note: note,
    operator: operator,
    items: activeLpbDraft.items.map(i => ({ ...i })),
    totalItems: totalItems,
    totalQty: totalQty,
    totalValue: totalValue
  };

  if (!pos.lpbRecords) pos.lpbRecords = [];
  pos.lpbRecords.unshift(lpbDoc);

  // 4. Simpan semua ke storage
  pos.saveProducts();
  pos.saveMutations();
  pos.saveLpbRecords();

  // 5. Sync ke Supabase jika online
  if (pos.settings.supabaseUrl && pos.settings.supabaseKey && navigator.onLine) {
    syncToSupabase(true);
  }

  sfx.beep();

  // 6. Cetak jika diminta
  if (andPrint && typeof generateLpbReceiptBytes === "function") {
    printLpbDocument(lpbId);
  }

  // 7. Reset draft & refresh UI
  activeLpbDraft = { items: [] };
  document.getElementById("lpb-supplier-name").value = "";
  document.getElementById("lpb-invoice-no").value = "";
  document.getElementById("lpb-note").value = "";

  renderLpbDraftTable();
  renderLpbHistoryTable();
  renderMutationHistoryTable();
  refreshLpbSupplierList();

  if (typeof renderPosCart === "function") renderPosCart();
  if (typeof posViewMode !== "undefined" && posViewMode === "touch" && typeof renderTouchGrid === "function") renderTouchGrid();

  showToast(`✅ LPB ${lpbId} berhasil disimpan! ${totalItems} SKU | Qty: ${totalQty} | ${formatRupiah(totalValue)}`, "success");

  // Pindah ke tab riwayat
  switchLpbTab(2);
}

// ---- Render Tabel Riwayat LPB ----
function renderLpbHistoryTable() {
  const tbody = document.getElementById("lpb-history-table-body");
  if (!tbody) return;

  const filterSupplier = (document.getElementById("lpb-filter-supplier")?.value || "").toLowerCase();
  const filterFrom = document.getElementById("lpb-filter-date-from")?.value || "";
  const filterTo = document.getElementById("lpb-filter-date-to")?.value || "";

  let records = (pos.lpbRecords || []);

  if (filterSupplier) records = records.filter(r => r.supplierName?.toLowerCase().includes(filterSupplier));
  if (filterFrom) records = records.filter(r => r.date >= filterFrom);
  if (filterTo) records = records.filter(r => r.date <= filterTo);

  if (records.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="py-6 text-center text-slate-400 text-[11px]">Belum ada riwayat LPB${filterSupplier ? ` untuk supplier "${filterSupplier}"` : ""}.</td></tr>`;
    return;
  }

  tbody.innerHTML = records.map(r => `
    <tr class="border-b border-slate-100 hover:bg-emerald-50 text-xs cursor-pointer" onclick="showLpbDetailModal('${r.id}')">
      <td class="py-2.5 px-3 font-mono font-bold text-emerald-700">${r.id}</td>
      <td class="py-2.5 px-3 text-slate-600">${r.date}</td>
      <td class="py-2.5 px-3 font-bold text-slate-800">${r.supplierName}</td>
      <td class="py-2.5 px-3 text-slate-500 font-mono text-[11px]">${r.invoiceNo}</td>
      <td class="py-2.5 px-3 text-center font-bold">${r.totalItems}</td>
      <td class="py-2.5 px-3 text-center font-bold text-emerald-700">${r.totalQty}</td>
      <td class="py-2.5 px-3 text-right font-mono font-bold">${formatRupiah(r.totalValue)}</td>
      <td class="py-2.5 px-3 text-center whitespace-nowrap">
        <button onclick="event.stopPropagation(); showLpbDetailModal('${r.id}')"
          class="px-2 py-1 bg-emerald-600 text-white rounded-lg text-[10px] font-bold hover:bg-emerald-700 mr-1 cursor-pointer">Detail</button>
        <button onclick="event.stopPropagation(); printLpbDocument('${r.id}')"
          class="px-2 py-1 bg-slate-700 text-white rounded-lg text-[10px] font-bold hover:bg-slate-800 cursor-pointer" title="Cetak Ulang Struk LPB">🖨️ Cetak</button>
      </td>
    </tr>
  `).join("");
}

// ---- Modal Detail LPB ----
function showLpbDetailModal(lpbId) {
  const doc = (pos.lpbRecords || []).find(r => r.id === lpbId);
  if (!doc) return;

  currentLpbDetailId = lpbId;

  const titleEl = document.getElementById("lpb-detail-title");
  const subtitleEl = document.getElementById("lpb-detail-subtitle");
  const bodyEl = document.getElementById("lpb-detail-body");

  if (titleEl) titleEl.textContent = `Detail LPB: ${doc.id}`;
  if (subtitleEl) subtitleEl.textContent = `${doc.supplierName} | ${doc.date} ${doc.time} | ${doc.paymentType}`;

  if (bodyEl) {
    bodyEl.innerHTML = `
      <div class="space-y-4">
        <!-- Info Dokumen -->
        <div class="grid grid-cols-2 gap-3 p-3 bg-emerald-50 rounded-xl text-xs">
          <div><span class="text-[10px] text-slate-500 block">Supplier</span><span class="font-bold text-slate-800">${doc.supplierName}</span></div>
          <div><span class="text-[10px] text-slate-500 block">No. Faktur</span><span class="font-mono font-bold text-slate-800">${doc.invoiceNo}</span></div>
          <div><span class="text-[10px] text-slate-500 block">Tanggal</span><span class="font-bold">${doc.date} ${doc.time}</span></div>
          <div><span class="text-[10px] text-slate-500 block">Pembayaran</span><span class="font-bold">${doc.paymentType}</span></div>
          <div><span class="text-[10px] text-slate-500 block">Operator</span><span class="font-bold">${doc.operator}</span></div>
          ${doc.note ? `<div class="col-span-2"><span class="text-[10px] text-slate-500 block">Catatan</span><span>${doc.note}</span></div>` : ""}
        </div>

        <!-- Tabel Item -->
        <div class="border border-slate-200 rounded-xl overflow-x-auto">
          <table class="w-full text-left border-collapse text-xs">
            <thead class="bg-slate-100 text-[10px] font-bold text-slate-500 uppercase">
              <tr>
                <th class="py-2 px-3">No</th>
                <th class="py-2 px-3">Produk</th>
                <th class="py-2 px-3">Barcode</th>
                <th class="py-2 px-3 text-center">Qty</th>
                <th class="py-2 px-3 text-right">HPP/pcs</th>
                <th class="py-2 px-3 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${doc.items.map((item, idx) => `
                <tr class="border-b border-slate-100 hover:bg-slate-50">
                  <td class="py-2 px-3 text-slate-400">${idx + 1}</td>
                  <td class="py-2 px-3 font-bold text-slate-800">${item.productName}</td>
                  <td class="py-2 px-3 font-mono text-slate-500 text-[11px]">${item.barcode}</td>
                  <td class="py-2 px-3 text-center font-bold text-emerald-700">${item.qty}</td>
                  <td class="py-2 px-3 text-right font-mono">${formatRupiah(item.costPrice)}</td>
                  <td class="py-2 px-3 text-right font-mono font-bold">${formatRupiah(item.subtotal)}</td>
                </tr>
              `).join("")}
            </tbody>
            <tfoot class="bg-slate-50 font-bold text-xs border-t-2 border-slate-300">
              <tr>
                <td colspan="3" class="py-2.5 px-3 text-right text-slate-600">TOTAL</td>
                <td class="py-2.5 px-3 text-center text-emerald-700">${doc.totalQty}</td>
                <td></td>
                <td class="py-2.5 px-3 text-right font-black text-emerald-700">${formatRupiah(doc.totalValue)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- Summary bar -->
        <div class="flex gap-4 text-xs font-bold text-slate-600 p-3 bg-slate-50 rounded-xl">
          <span>SKU: <span class="text-emerald-700">${doc.totalItems}</span></span>
          <span>Total Qty: <span class="text-emerald-700">${doc.totalQty}</span></span>
          <span>Total Nilai: <span class="text-emerald-700 font-black">${formatRupiah(doc.totalValue)}</span></span>
        </div>
      </div>
    `;
  }

  openModal("modal-lpb-detail");
}

// ---- Cetak LPB (Langsung & Dari Riwayat) ----
function printLpbDocument(lpbId = null) {
  const targetId = (typeof lpbId === 'string' && lpbId) ? lpbId : currentLpbDetailId;
  const doc = (pos.lpbRecords || []).find(r => r.id === targetId);
  if (!doc) {
    showToast("Data dokumen LPB tidak ditemukan untuk dicetak!", "warning");
    return;
  }

  if (typeof printLpbReceiptUniversal === "function") {
    printLpbReceiptUniversal(doc);
  } else if (typeof generateLpbReceiptBytes === "function") {
    generateLpbReceiptBytes(doc);
  } else {
    showToast("Fitur cetak LPB belum siap di perangkat ini.", "warning");
  }
}

// ==========================================
// 6b. MUTASI BARANG RUSAK / EXPIRED (TAB 3)
// ==========================================
function populateMutationProductSelect() {
  const select = document.getElementById("mut-product-select");
  if (!select) return;
  const sorted = [...pos.products].sort((a, b) => a.name.localeCompare(b.name));
  select.innerHTML = sorted.map(p =>
    `<option value="${p.id}">${p.barcode} - ${p.name} (Stok: ${p.stock})</option>`
  ).join("");
}

function saveStockMutation() {
  const productId = document.getElementById("mut-product-select")?.value;
  const qty = parseInt(document.getElementById("mut-qty")?.value) || 0;
  const note = document.getElementById("mut-note")?.value.trim() || "Barang Rusak / Expired";

  if (qty <= 0) { showToast("Jumlah Qty harus lebih dari 0!", "warning"); return; }

  const p = pos.products.find(prod => prod.id === productId);
  if (!p) return;

  if (p.stock < qty) {
    showToast(`Stok ${p.name} tidak cukup! (Stok: ${p.stock})`, "warning");
    return;
  }

  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toLocaleTimeString("id-ID");
  const dateKey = dateStr.replace(/-/g, "");

  p.stock = Math.max(0, p.stock - qty);

  pos.mutations.unshift({
    id: `MUT-${dateKey}-${String(pos.mutations.length + 1).padStart(4, "0")}`,
    date: dateStr,
    time: timeStr,
    type: "OUT_DAMAGE",
    productId: p.id,
    productName: p.name,
    barcode: p.barcode,
    qty: -qty,
    note: note,
    operator: pos.currentUser?.name || pos.settings.cashierName || "Kepala Toko"
  });

  pos.saveProducts();
  pos.saveMutations();

  if (pos.settings.supabaseUrl && pos.settings.supabaseKey && navigator.onLine) {
    syncToSupabase(true);
  }

  sfx.beep();
  renderMutationHistoryTable();
  if (typeof renderPosCart === "function") renderPosCart();
  if (typeof posViewMode !== "undefined" && posViewMode === "touch" && typeof renderTouchGrid === "function") renderTouchGrid();
  showToast(`Barang rusak ${p.name} (${qty} pcs) berhasil dicatat!`, "success");

  // Reset form
  document.getElementById("mut-qty").value = 1;
  document.getElementById("mut-note").value = "";
}

function renderMutationHistoryTable() {
  const tbody = document.getElementById("mutations-table-body");
  if (!tbody) return;

  // Tampilkan hanya OUT_DAMAGE di tab 3
  const damages = pos.mutations.filter(m => m.type === "OUT_DAMAGE").slice(0, 50);

  if (damages.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-slate-400 text-[11px]">Belum ada catatan barang rusak.</td></tr>`;
    return;
  }

  tbody.innerHTML = damages.map(m => `
    <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs">
      <td class="py-2.5 px-3 font-mono text-slate-500">${m.date} ${m.time}</td>
      <td class="py-2.5 px-3 font-bold text-slate-800">${m.productName}</td>
      <td class="py-2.5 px-3">
        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">RUSAK/EXPIRED</span>
      </td>
      <td class="py-2.5 px-3 font-mono font-bold text-center text-rose-600">${m.qty}</td>
      <td class="py-2.5 px-3 text-slate-600">${m.note}</td>
      <td class="py-2.5 px-3 text-slate-400 font-mono">${m.operator || "Kasir"}</td>
    </tr>
  `).join("");
}

