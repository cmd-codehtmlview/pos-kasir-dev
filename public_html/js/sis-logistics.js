/**
 * SnackPOS - SIS Logistics & Inventory Subsystem (Fase 1)
 * Menghubungkan Master Produk (#6), LPB Faktur Masuk (#5), Stock Opname (#8), BAP Waste (#9)
 * ke database riil pos.products, pos.mutations, pos.lpbRecords, pos.waste
 */

// =========================================================================
// 0. SHARED LOGISTICS CATALOG & SEARCH PROVIDER
// =========================================================================

function getLogisticsCatalog(context) {
  const real = (typeof pos !== 'undefined' && Array.isArray(pos.products)) ? pos.products : [];
  if (context === 'repack-origin') {
    const bulk = real.filter(p => {
      const u = (p.unit || '').toLowerCase();
      const n = (p.name || '').toLowerCase();
      return u === 'bal' || u === 'dus' || u === 'kg' || n.includes('bal') || n.includes('kg');
    });
    return bulk.length > 0 ? bulk : real;
  }
  return real.length > 0 ? real : (typeof mockCatalog !== 'undefined' ? mockCatalog : []);
}

function handleLogisticsSearch(query, context) {
  const q = (query || "").trim().toLowerCase();
  const dropdown = document.getElementById(`${context}-search-dropdown`);
  if (!dropdown) return;

  if (!q) {
    dropdown.classList.add('hidden');
    dropdown.innerHTML = "";
    if (context === 'products') {
      renderSisProductsModal("");
    }
    return;
  }

  const catalog = getLogisticsCatalog(context);
  const matches = catalog.filter(p => 
    (p.name && p.name.toLowerCase().includes(q)) || 
    (p.barcode && p.barcode.toLowerCase().includes(q)) ||
    (p.id && String(p.id).toLowerCase().includes(q))
  );

  if (context === 'products') {
    renderSisProductsModal(q);
  }

  renderLogisticsDropdown(matches, context);
}

function toggleLogisticsCatalog(context) {
  const dropdown = document.getElementById(`${context}-search-dropdown`);
  const inputMap = {
    'lpb': 'lpb-product-search',
    'products': 'products-search-input',
    'label': 'label-product-search',
    'so': 'so-product-search',
    'waste': 'waste-product-search',
    'repack-origin': 'repack-origin-search',
    'repack-target': 'repack-target-search'
  };
  const input = document.getElementById(inputMap[context]);
  if (!dropdown) return;

  if (!dropdown.classList.contains('hidden') && (!input || !input.value || input.value.trim() === "")) {
    dropdown.classList.add('hidden');
  } else {
    const catalog = getLogisticsCatalog(context);
    renderLogisticsDropdown(catalog.slice(0, 50), context);
    if (input) input.focus();
  }
}

function renderLogisticsDropdown(items, context) {
  const dropdown = document.getElementById(`${context}-search-dropdown`);
  if (!dropdown) return;

  if (!items || items.length === 0) {
    dropdown.innerHTML = `
      <div class="p-3 text-center text-xs text-slate-400 bg-white">
        Produk tidak ditemukan di database
      </div>
    `;
    dropdown.classList.remove('hidden');
    return;
  }

  dropdown.innerHTML = items.map(p => `
    <div 
      onclick="selectLogisticsProduct('${p.id}', '${context}')" 
      class="p-2.5 hover:bg-emerald-50/80 transition flex items-center justify-between gap-2 cursor-pointer group bg-white border-b border-slate-100 last:border-0"
    >
      <div class="flex items-center gap-2 min-w-0">
        <span class="text-base">${p.icon || p.emoji || '🍘'}</span>
        <div class="min-w-0">
          <span class="font-bold text-xs text-slate-900 group-hover:text-emerald-700 block truncate">${p.name}</span>
          <span class="text-[10px] text-slate-400 font-mono block">${p.barcode || p.plu || '-'} • Stok: <strong class="text-emerald-700">${p.stock || 0}</strong> ${p.unit || 'Bks'}</span>
        </div>
      </div>
      <div class="text-right shrink-0">
        <span class="font-mono font-bold text-xs text-emerald-700 block">Rp ${(p.price || 0).toLocaleString('id-ID')}</span>
        ${p.priceB ? `<span class="text-[9px] text-slate-400 font-mono">B: Rp ${p.priceB.toLocaleString('id-ID')}</span>` : ''}
      </div>
    </div>
  `).join("");

  dropdown.classList.remove('hidden');
}

function selectLogisticsProduct(productId, context) {
  const catalog = getLogisticsCatalog(context);
  const p = catalog.find(item => item.id === productId || item.barcode === productId || String(item.id) === String(productId));
  if (!p) return;

  const dropdown = document.getElementById(`${context}-search-dropdown`);
  if (dropdown) dropdown.classList.add('hidden');

  if (context === 'products') {
    editSisProduct(p.id);
    if (typeof showToast === 'function') {
      showToast(`📝 Memuat data ${p.name} ke form edit`, 'info');
    }
  } else if (context === 'lpb') {
    window.selectedLpbProduct = p;
    const input = document.getElementById('lpb-product-search');
    if (input) input.value = `${p.name} (${p.barcode})`;
    const costInput = document.getElementById('lpb-cost-input');
    if (costInput) {
      costInput.value = p.costPrice || p.cost || Math.round((p.price || 0) * 0.75);
    }
    const qtyInput = document.getElementById('lpb-qty-input');
    if (qtyInput) qtyInput.focus();
    if (typeof showToast === 'function') {
      showToast(`✅ ${p.name} dipilih untuk Faktur LPB`, 'success');
    }
  } else if (context === 'so') {
    selectSisSoProduct(p);
  } else if (context === 'waste') {
    selectSisWasteProduct(p);
  } else if (context === 'label') {
    const input = document.getElementById('label-product-search');
    if (input) input.value = p.name;
    if (typeof showToast === 'function') {
      showToast(`🏷️ Label ${p.name} siap dicetak`, 'success');
    }
  } else if (context === 'repack-origin') {
    const input = document.getElementById('repack-origin-search');
    if (input) input.value = `${p.name} (${p.barcode})`;
    if (typeof showToast === 'function') {
      showToast(`📦 Produk Asal: ${p.name} dipilih`, 'info');
    }
    if (typeof updateRepackSummary === 'function') updateRepackSummary();
  } else if (context === 'repack-target') {
    const input = document.getElementById('repack-target-search');
    if (input) input.value = `${p.name} (${p.barcode})`;
    if (typeof showToast === 'function') {
      showToast(`🛍️ Produk Tujuan: ${p.name} dipilih`, 'success');
    }
    if (typeof updateRepackSummary === 'function') updateRepackSummary();
  }
}

function triggerLogisticsCameraScan(context) {
  const titleMap = {
    'products': 'Scan Master Produk',
    'product-form': 'Scan Barcode Form Produk',
    'lpb': 'Scan Barcode LPB (Faktur Masuk)',
    'label': 'Scan Barcode Cetak Label Harga',
    'so': 'Scan Barcode Stock Opname',
    'waste': 'Scan Barcode BAP Barang Rusak',
    'repack-origin': 'Scan Barcode Produk Asal (Bal/Dus)',
    'repack-target': 'Scan Barcode Produk Tujuan (Pcs)'
  };
  const title = titleMap[context] || 'Scan Barcode Logistik';

  if (typeof openPosCameraScanner === 'function') {
    openPosCameraScanner((barcode) => {
      handleLogisticsScannedBarcode(barcode, context);
    }, title);
  } else if (typeof openBarcodeCameraScanner === 'function') {
    openBarcodeCameraScanner('pos-barcode-search');
  } else {
    const manualBarcode = prompt(`[Scanner Kamera ${title}]\nMasukkan barcode barang (atau gunakan scanner barcode USB):`);
    if (manualBarcode) {
      handleLogisticsScannedBarcode(manualBarcode, context);
    }
  }
}

function stopSisScan() {
  if (typeof closePosCameraScanner === 'function') {
    closePosCameraScanner();
  }
}

function handleLogisticsScannedBarcode(scannedCode, context) {
  const code = (scannedCode || '').trim();
  if (!code) return;

  // 1. Kasus khusus: scan langsung ke field Barcode pada form Master Produk
  if (context === 'product-form') {
    const barcodeInput = document.getElementById('sis-prod-barcode');
    if (barcodeInput) {
      barcodeInput.value = code;
    }
    const catalog = getLogisticsCatalog('products');
    const existing = catalog.find(p => p.barcode === code);
    if (existing) {
      if (typeof showToast === 'function') {
        showToast(`ℹ️ Barcode ${code} sudah terdaftar pada: ${existing.name}`, 'warning');
      }
    } else {
      if (typeof showToast === 'function') {
        showToast(`📷 Barcode ${code} berhasil diisi ke form`, 'success');
      }
    }
    return;
  }

  const catalog = getLogisticsCatalog(context);
  const matched = catalog.find(p => (p.barcode && p.barcode === code) || (p.id && String(p.id).toLowerCase() === code.toLowerCase()));

  if (matched) {
    selectLogisticsProduct(matched.id, context);
    if (typeof showToast === 'function') {
      showToast(`📷 ${matched.name} (${code}) berhasil di-scan`, 'success');
    }
  } else {
    // Jika tidak ditemukan di katalog produk
    if (context === 'products') {
      const input = document.getElementById('products-search-input');
      if (input) {
        input.value = code;
        renderSisProductsModal(code);
      }
      if (typeof showToast === 'function') {
        showToast(`📷 Barcode ${code} belum terdaftar. Menyiapkan form produk baru...`, 'info', 3000);
      }
      setTimeout(() => {
        switchProductModalTab('form');
        resetSisProductForm();
        const barcodeInput = document.getElementById('sis-prod-barcode');
        if (barcodeInput) barcodeInput.value = code;
      }, 300);
      return;
    }

    const inputMap = {
      'lpb': 'lpb-product-search',
      'label': 'label-product-search',
      'so': 'so-product-search',
      'waste': 'waste-product-search',
      'repack-origin': 'repack-origin-search',
      'repack-target': 'repack-target-search'
    };
    const inputId = inputMap[context];
    const input = inputId ? document.getElementById(inputId) : null;
    if (input) {
      input.value = code;
      handleLogisticsSearch(code, context);
    }
    if (typeof showToast === 'function') {
      showToast(`📷 Barcode [${code}] terdeteksi, tetapi belum ada di katalog gudang.`, 'warning');
    }
  }
}


// =========================================================================
// 1. SIS MASTER PRODUK & MULTI-HARGA A/B/C (#sis-modal-products)
// =========================================================================

function switchProductModalTab(tab) {
  const btnList = document.getElementById('prod-tab-btn-list');
  const btnForm = document.getElementById('prod-tab-btn-form');
  const tabList = document.getElementById('prod-tab-content-list');
  const tabForm = document.getElementById('prod-tab-content-form');
  if (!btnList || !btnForm || !tabList || !tabForm) return;

  if (tab === 'list') {
    btnList.className = "flex-1 py-1.5 rounded-xl font-bold bg-white text-emerald-950 border border-emerald-200 shadow-2xs";
    btnForm.className = "flex-1 py-1.5 rounded-xl font-bold text-slate-600 hover:text-emerald-950";
    tabList.classList.remove('hidden');
    tabForm.classList.add('hidden');
    renderSisProductsModal();
  } else {
    btnForm.className = "flex-1 py-1.5 rounded-xl font-bold bg-white text-emerald-950 border border-emerald-200 shadow-2xs";
    btnList.className = "flex-1 py-1.5 rounded-xl font-bold text-slate-600 hover:text-emerald-950";
    tabForm.classList.remove('hidden');
    tabList.classList.add('hidden');
  }
}

function renderSisProductsModal(filterText = "") {
  const container = document.getElementById('sis-products-list-container');
  if (!container) return;

  const products = (typeof pos !== 'undefined' && Array.isArray(pos.products)) ? pos.products : [];
  const q = (filterText || "").trim().toLowerCase();

  const filtered = q ? products.filter(p => 
    (p.name && p.name.toLowerCase().includes(q)) || 
    (p.barcode && p.barcode.toLowerCase().includes(q)) ||
    (p.category && p.category.toLowerCase().includes(q))
  ) : products;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
        <span class="text-3xl block mb-2">📦</span>
        <p class="font-bold text-slate-700 text-xs">Belum Ada Produk Ditemukan</p>
        <p class="text-[11px] text-slate-400 mt-1">Gunakan tab "Tambah Produk" untuk memasukkan produk dan harga bertingkat baru.</p>
        <button type="button" onclick="resetSisProductForm(); switchProductModalTab('form');" class="mt-3 px-3.5 py-1.5 bg-emerald-600 text-white font-bold rounded-xl text-xs shadow-xs hover:bg-emerald-700 transition">
          + Tambah Produk Baru Sekarang
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(p => {
    const priceA = p.price || 0;
    const priceB = p.priceB || (p.hasWholesale && p.wholesalePrice ? p.wholesalePrice : Math.round(priceA * 0.9));
    const priceC = p.priceC || Math.round(priceA * 0.8);
    const minB = p.minQtyB || (p.wholesaleMinQty || 10);
    const minC = p.minQtyC || 50;
    const autoSwitch = p.autoSwitchTier !== false;

    return `
      <div class="p-3 bg-white border border-slate-200/90 rounded-2xl hover:border-emerald-300 transition space-y-2 shadow-2xs">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <span class="font-black text-slate-900 block text-xs truncate">${p.name}</span>
            <span class="text-[10px] text-slate-500 font-mono block">
              ${p.barcode || '-'} • HPP: <strong>Rp ${(p.costPrice || 0).toLocaleString('id-ID')}</strong> • Stok: <strong class="text-emerald-700">${p.stock || 0} ${p.unit || 'Bks'}</strong>
            </span>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <span class="px-2 py-0.5 rounded-full ${autoSwitch ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'} text-[9px] font-extrabold">
              Auto: ${autoSwitch ? 'ON' : 'OFF'}
            </span>
            <button type="button" onclick="openSinglePrintModal('${p.id}')" class="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold rounded-lg text-[10px] transition cursor-pointer flex items-center gap-0.5" title="Cetak Label Harga & Barcode Produk Ini">
              <span>🏷️</span>
              <span>Label</span>
            </button>
            <button type="button" onclick="editSisProduct('${p.id}')" class="px-2 py-1 bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-800 font-bold rounded-lg text-[10px] transition cursor-pointer" title="Edit Master & Harga">
              ✏️ Edit
            </button>
            <button type="button" onclick="deleteSisProduct('${p.id}')" class="px-2 py-1 bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-700 font-bold rounded-lg text-[10px] transition cursor-pointer" title="Hapus Produk">
              🗑️
            </button>
          </div>
        </div>

        <!-- Multi-Harga Badges -->
        <div class="grid grid-cols-3 gap-1.5 text-center font-mono">
          <div class="p-1.5 bg-slate-50 border border-slate-200/80 rounded-xl">
            <span class="text-[9px] text-slate-500 font-bold block">A: ECERAN (Min 1)</span>
            <span class="text-xs font-black text-slate-900">Rp ${priceA.toLocaleString('id-ID')}</span>
          </div>
          <div class="p-1.5 bg-emerald-50/70 border border-emerald-200/80 rounded-xl">
            <span class="text-[9px] text-emerald-700 font-bold block">B: GROSIR (Min ${minB})</span>
            <span class="text-xs font-black text-emerald-900">Rp ${priceB.toLocaleString('id-ID')}</span>
          </div>
          <div class="p-1.5 bg-blue-50/70 border border-blue-200/80 rounded-xl">
            <span class="text-[9px] text-blue-700 font-bold block">C: PABRIK (Min ${minC})</span>
            <span class="text-xs font-black text-blue-900">Rp ${priceC.toLocaleString('id-ID')}</span>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function resetSisProductForm() {
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };
  setVal('sis-prod-id', '');
  setVal('sis-prod-barcode', '899' + Math.floor(1000000000 + Math.random() * 9000000000));
  setVal('sis-prod-category', 'Makanan Ringan & Biskuit');
  setVal('sis-prod-name', '');
  setVal('sis-prod-cost', '');
  setVal('sis-prod-stock', '0');
  setVal('sis-prod-unit', 'Bks');
  setVal('sis-prod-price-a', '');
  setVal('sis-prod-price-b', '');
  setVal('sis-prod-min-b', '10');
  setVal('sis-prod-price-c', '');
  setVal('sis-prod-min-c', '50');
  const toggle = document.getElementById('sis-prod-auto-switch');
  if (toggle) toggle.checked = true;

  // SOP: Tambah SKU baru stok fisik wajib 0 & terkunci
  const stockEl = document.getElementById('sis-prod-stock');
  if (stockEl) {
    stockEl.value = '0';
    stockEl.readOnly = true;
  }
  const directPrintBtn = document.getElementById('btn-sis-prod-direct-print');
  if (directPrintBtn) directPrintBtn.classList.add('hidden');

  const heading = document.getElementById('sis-prod-form-heading');
  if (heading) heading.textContent = 'Tambah Produk & Multi-Harga Baru';
}

function editSisProduct(productId) {
  if (!pos || !Array.isArray(pos.products)) return;
  const p = pos.products.find(item => item.id === productId || String(item.id) === String(productId));
  if (!p) return;

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = (val !== undefined && val !== null) ? val : '';
  };

  setVal('sis-prod-id', p.id);
  setVal('sis-prod-barcode', p.barcode || '');
  setVal('sis-prod-category', p.category || 'Makanan Ringan & Biskuit');
  setVal('sis-prod-name', p.name || '');
  setVal('sis-prod-cost', p.costPrice || p.cost || 0);
  setVal('sis-prod-stock', p.stock || 0);
  setVal('sis-prod-unit', p.unit || 'Bks');

  // Stok produk hanya dapat diedit via LPB/SO/Retur
  const stockEl = document.getElementById('sis-prod-stock');
  if (stockEl) {
    stockEl.value = p.stock || 0;
    stockEl.readOnly = true;
  }

  const directPrintBtn = document.getElementById('btn-sis-prod-direct-print');
  if (directPrintBtn) directPrintBtn.classList.remove('hidden');
  
  const priceA = p.price || 0;
  const priceB = p.priceB || (p.hasWholesale && p.wholesalePrice ? p.wholesalePrice : Math.round(priceA * 0.9));
  const priceC = p.priceC || Math.round(priceA * 0.8);
  const minB = p.minQtyB || (p.wholesaleMinQty || 10);
  const minC = p.minQtyC || 50;

  setVal('sis-prod-price-a', priceA);
  setVal('sis-prod-price-b', priceB);
  setVal('sis-prod-min-b', minB);
  setVal('sis-prod-price-c', priceC);
  setVal('sis-prod-min-c', minC);

  const toggle = document.getElementById('sis-prod-auto-switch');
  if (toggle) toggle.checked = p.autoSwitchTier !== false;

  const heading = document.getElementById('sis-prod-form-heading');
  if (heading) heading.textContent = `Edit Produk: ${p.name}`;

  switchProductModalTab('form');
}

function saveSisProduct(andPrint = false) {
  const getVal = id => (document.getElementById(id)?.value || "").trim();
  const id = getVal('sis-prod-id');
  const barcode = getVal('sis-prod-barcode');
  const category = getVal('sis-prod-category') || 'Makanan Ringan & Biskuit';
  const name = getVal('sis-prod-name');
  const costPrice = parseFloat(getVal('sis-prod-cost')) || 0;
  const unit = getVal('sis-prod-unit') || 'Bks';
  const priceA = parseFloat(getVal('sis-prod-price-a')) || 0;
  const priceB = parseFloat(getVal('sis-prod-price-b')) || Math.round(priceA * 0.9);
  const minB = parseInt(getVal('sis-prod-min-b'), 10) || 10;
  const priceC = parseFloat(getVal('sis-prod-price-c')) || Math.round(priceA * 0.8);
  const minC = parseInt(getVal('sis-prod-min-c'), 10) || 50;
  const autoSwitch = !!document.getElementById('sis-prod-auto-switch')?.checked;

  if (!barcode) {
    alert("Harap masukkan Barcode / SKU!");
    return;
  }
  if (!name) {
    alert("Harap masukkan Nama Produk!");
    return;
  }
  if (priceA <= 0) {
    alert("Harap masukkan Harga Eceran (Harga A) dengan nilai lebih dari 0!");
    return;
  }

  if (!pos || !Array.isArray(pos.products)) {
    alert("Database produk belum siap!");
    return;
  }

  // Cek duplikasi barcode terhadap produk lain
  const dup = pos.products.find(p => p.barcode === barcode && p.id !== id);
  if (dup) {
    alert(`Barcode ${barcode} sudah digunakan oleh "${dup.name}"! Harap gunakan barcode unik.`);
    return;
  }

  let targetProductId = id;

  if (id) {
    // Mode Update: pertahankan stok yang ada (stok tidak boleh diubah sembarangan di master)
    const prod = pos.products.find(p => p.id === id);
    if (prod) {
      prod.barcode = barcode;
      prod.category = category;
      prod.name = name;
      prod.costPrice = costPrice;
      // prod.stock tidak diubah, tetap sesuai database
      prod.unit = unit;
      prod.price = priceA;
      prod.priceA = priceA;
      prod.priceB = priceB;
      prod.minQtyB = minB;
      prod.priceC = priceC;
      prod.minQtyC = minC;
      prod.autoSwitchTier = autoSwitch;
      prod.hasWholesale = true;
      prod.wholesalePrice = priceB;
      prod.wholesaleMinQty = minB;
    }
  } else {
    // Mode Tambah SKU Baru: STOK AWAL WAJIB 0 (Stok hanya masuk via LPB atau Retur)
    const newId = `PRD-${String(pos.products.length + 1).padStart(3, '0')}`;
    targetProductId = newId;
    const newProduct = {
      id: newId,
      barcode: barcode,
      category: category,
      name: name,
      costPrice: costPrice,
      stock: 0, // STOK AWAL 0
      minStock: 5,
      unit: unit,
      price: priceA,
      priceA: priceA,
      priceB: priceB,
      minQtyB: minB,
      priceC: priceC,
      minQtyC: minC,
      autoSwitchTier: autoSwitch,
      hasWholesale: true,
      wholesalePrice: priceB,
      wholesaleMinQty: minB,
      emoji: '🍘'
    };
    pos.products.unshift(newProduct);
  }

  // Simpan ke localStorage & trigger sync
  if (typeof pos.saveProducts === 'function') pos.saveProducts();

  // Sinkronkan ke Supabase jika tersedia
  if (typeof syncProducts === 'function') {
    try { syncProducts(); } catch (e) { console.warn("Sync products error:", e); }
  }

  // Refresh tampilan inventory, kasir, dan master produk
  if (typeof renderInventoryTable === 'function') renderInventoryTable();
  if (typeof renderPosCart === 'function') renderPosCart();
  if (typeof renderSisProductsModal === 'function') renderSisProductsModal();

  if (andPrint) {
    closeSisModal('sis-modal-products');
    if (typeof openSinglePrintModal === 'function') {
      openSinglePrintModal(targetProductId);
    }
    if (typeof showToast === 'function') {
      showToast(`💾 Produk "${name}" disimpan. Membuka cetak label...`, 'success');
    }
  } else {
    const toastMsg = id ? `💾 Perubahan produk "${name}" berhasil disimpan!` : `💾 Master Produk "${name}" berhasil ditambahkan! (Stok awal 0, masuk via LPB)`;
    if (typeof showToast === 'function') {
      showToast(toastMsg, 'success');
    } else if (typeof showMockupToast === 'function') {
      showMockupToast(toastMsg, 'success');
    }
    switchProductModalTab('list');
  }
}

function printCurrentSisProductLabel() {
  const id = document.getElementById('sis-prod-id')?.value;
  if (!id) {
    alert("Pilih atau simpan produk terlebih dahulu sebelum mencetak label!");
    return;
  }
  closeSisModal('sis-modal-products');
  if (typeof openSinglePrintModal === 'function') {
    openSinglePrintModal(id);
  }
}

function deleteSisProduct(productId) {
  if (!pos || !Array.isArray(pos.products)) return;
  const prod = pos.products.find(p => p.id === productId);
  if (!prod) return;

  if (!confirm(`Apakah Anda yakin ingin menghapus produk "${prod.name}" (${prod.barcode}) dari database?`)) {
    return;
  }

  pos.products = pos.products.filter(p => p.id !== productId);
  if (typeof pos.saveProducts === 'function') pos.saveProducts();
  if (typeof renderInventoryTable === 'function') renderInventoryTable();
  if (typeof renderPosCart === 'function') renderPosCart();

  renderSisProductsModal();
  const toastMsg = `🗑️ Produk "${prod.name}" berhasil dihapus.`;
  if (typeof showMockupToast === 'function') {
    showMockupToast(toastMsg, 'info');
  } else if (typeof showToast === 'function') {
    showToast(toastMsg, 'info');
  }
}


// =========================================================================
// 2. SIS PENERIMAAN BARANG MASUK / LPB FAKTUR SUPPLIER (#sis-modal-lpb)
// =========================================================================

let sisLpbDraft = [];
window.selectedLpbProduct = null;

function initSisLpbModal() {
  switchSisLpbTab('form');

  const invInput = document.getElementById('lpb-invoice-no');
  if (invInput && (!invInput.value || invInput.value === 'FAK-2026-8812')) {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const ymd = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
    const rnd = Math.floor(100 + Math.random() * 900);
    invInput.value = `FAK-${ymd}-${rnd}`;
  }

  window.selectedLpbProduct = null;
  const pSearch = document.getElementById('lpb-product-search');
  if (pSearch) pSearch.value = '';
  const qtyInput = document.getElementById('lpb-qty-input');
  if (qtyInput) qtyInput.value = '10';
  const costInput = document.getElementById('lpb-cost-input');
  if (costInput) costInput.value = '';

  renderSisLpbDraftTable();
  renderSisLpbHistory();
}

function renderSisLpbDraftTable() {
  const container = document.getElementById('lpb-draft-container');
  const totalValEl = document.getElementById('lpb-summary-total-val');
  const skuInfoEl = document.getElementById('lpb-summary-sku-info');
  if (!container) return;

  if (sisLpbDraft.length === 0) {
    container.innerHTML = `
      <div class="p-4 text-center text-slate-400 bg-white border border-dashed border-slate-200 rounded-xl text-xs">
        Belum ada produk ditambahkan ke faktur penerimaan ini.
      </div>
    `;
    if (totalValEl) totalValEl.textContent = "Rp 0";
    if (skuInfoEl) skuInfoEl.textContent = "0 SKU, 0 Total Qty";
    return;
  }

  let grandTotal = 0;
  let totalQty = 0;

  container.innerHTML = sisLpbDraft.map((item, idx) => {
    const subtotal = item.qty * item.cost;
    grandTotal += subtotal;
    totalQty += item.qty;

    return `
      <div class="p-2.5 bg-white border border-slate-200/90 rounded-xl flex items-center justify-between text-[11px] shadow-2xs">
        <div class="min-w-0 pr-2">
          <span class="font-bold text-slate-900 block truncate">${item.name}</span>
          <span class="text-[10px] text-slate-400 font-mono block">Beli: Rp ${item.cost.toLocaleString('id-ID')} / ${item.unit} • ${item.barcode}</span>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          <div class="text-right">
            <span class="font-black text-slate-900 font-mono text-xs block">+${item.qty} ${item.unit}</span>
            <span class="text-[10px] text-emerald-700 font-bold">Rp ${subtotal.toLocaleString('id-ID')}</span>
          </div>
          <button type="button" onclick="removeSisLpbItem(${idx})" class="w-6 h-6 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold flex items-center justify-center text-xs transition cursor-pointer" title="Hapus dari Faktur">
            ✕
          </button>
        </div>
      </div>
    `;
  }).join("");

  if (totalValEl) totalValEl.textContent = `Rp ${grandTotal.toLocaleString('id-ID')}`;
  if (skuInfoEl) skuInfoEl.textContent = `${sisLpbDraft.length} SKU, ${totalQty} Total Item`;
}

function addLpbItemFromSearch() {
  const p = window.selectedLpbProduct;
  const searchInput = document.getElementById('lpb-product-search');
  const qtyInput = document.getElementById('lpb-qty-input');
  const costInput = document.getElementById('lpb-cost-input');

  const rawQty = parseInt(qtyInput?.value, 10);
  const qty = (!isNaN(rawQty) && rawQty > 0) ? rawQty : 1;

  let targetProduct = p;
  if (!targetProduct && searchInput && searchInput.value) {
    const q = searchInput.value.trim().toLowerCase();
    const catalog = (pos && pos.products) ? pos.products : [];
    targetProduct = catalog.find(item => 
      (item.barcode && item.barcode.toLowerCase() === q) || 
      (item.name && item.name.toLowerCase() === q) ||
      (item.name && item.name.toLowerCase().includes(q))
    );
  }

  if (!targetProduct) {
    alert("Harap pilih produk terlebih dahulu melalui scan atau pencarian!");
    if (searchInput) searchInput.focus();
    return;
  }

  const rawCost = parseFloat(costInput?.value);
  const cost = (!isNaN(rawCost) && rawCost >= 0) 
    ? rawCost 
    : (targetProduct.costPrice || targetProduct.cost || Math.round((targetProduct.price || 0) * 0.75));

  const existingIdx = sisLpbDraft.findIndex(d => d.id === targetProduct.id || d.barcode === targetProduct.barcode);
  if (existingIdx >= 0) {
    sisLpbDraft[existingIdx].qty += qty;
    sisLpbDraft[existingIdx].cost = cost;
  } else {
    sisLpbDraft.push({
      id: targetProduct.id,
      barcode: targetProduct.barcode,
      name: targetProduct.name,
      unit: targetProduct.unit || 'Bks',
      qty: qty,
      cost: cost
    });
  }

  // Reset inputs
  window.selectedLpbProduct = null;
  if (searchInput) searchInput.value = '';
  if (qtyInput) qtyInput.value = '10';
  if (costInput) costInput.value = '';

  renderSisLpbDraftTable();

  const toastMsg = `📥 +${qty} ${targetProduct.unit || 'Bks'} "${targetProduct.name}" ditambahkan ke draft faktur`;
  if (typeof showMockupToast === 'function') {
    showMockupToast(toastMsg, 'info');
  } else if (typeof showToast === 'function') {
    showToast(toastMsg, 'info');
  }
}

function removeSisLpbItem(index) {
  if (index >= 0 && index < sisLpbDraft.length) {
    sisLpbDraft.splice(index, 1);
    renderSisLpbDraftTable();
  }
}

function switchSisLpbTab(tab = 'form') {
  const btnForm = document.getElementById('lpb-tab-btn-form');
  const btnHistory = document.getElementById('lpb-tab-btn-history');
  const contentForm = document.getElementById('lpb-tab-content-form');
  const contentHistory = document.getElementById('lpb-tab-content-history');
  const footerEl = document.getElementById('lpb-modal-footer');

  if (tab === 'form') {
    if (btnForm) btnForm.className = "flex-1 py-1.5 rounded-xl font-bold bg-white text-slate-900 border border-slate-200 shadow-2xs transition";
    if (btnHistory) btnHistory.className = "flex-1 py-1.5 rounded-xl font-bold text-slate-500 hover:text-slate-900 transition";
    if (contentForm) contentForm.classList.remove('hidden');
    if (contentHistory) contentHistory.classList.add('hidden');
    if (footerEl) footerEl.classList.remove('hidden');
  } else {
    if (btnForm) btnForm.className = "flex-1 py-1.5 rounded-xl font-bold text-slate-500 hover:text-slate-900 transition";
    if (btnHistory) btnHistory.className = "flex-1 py-1.5 rounded-xl font-bold bg-white text-slate-900 border border-slate-200 shadow-2xs transition";
    if (contentForm) contentForm.classList.add('hidden');
    if (contentHistory) contentHistory.classList.remove('hidden');
    if (footerEl) footerEl.classList.add('hidden');
    renderSisLpbHistory();
  }
}

function renderSisLpbHistory() {
  const container = document.getElementById('lpb-history-container');
  if (!container) return;

  const records = (pos && Array.isArray(pos.lpbRecords)) ? pos.lpbRecords : [];

  if (records.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center text-slate-400 bg-white border border-dashed border-slate-200 rounded-2xl">
        <span class="text-2xl block mb-1">📦</span>
        <span class="font-bold text-xs block text-slate-600">Belum ada riwayat penerimaan barang (LPB)</span>
        <span class="text-[11px] text-slate-400 block mt-0.5">Semua faktur masuk dari supplier yang Anda simpan akan muncul di sini.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = records.map((rec, idx) => {
    const d = rec.date ? new Date(rec.date) : (rec.timestamp ? new Date(rec.timestamp) : new Date());
    const dateStr = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    const timeStr = rec.time || d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const totalVal = Number(rec.totalValue || rec.totalAmount || 0).toLocaleString('id-ID');
    const skuCount = rec.totalItems || (rec.items ? rec.items.length : 0);
    const totalQty = rec.totalQty || (rec.items ? rec.items.reduce((s, it) => s + (Number(it.qty) || 0), 0) : 0);
    const supplier = rec.supplierName || rec.supplier || "Distributor";
    const invoice = rec.invoiceNo || rec.id;
    const detailId = `sis-lpb-detail-${idx}`;

    const itemsRows = (rec.items || []).map(it => `
      <div class="py-1 border-b border-slate-100 flex justify-between items-center text-[10px]">
        <div class="min-w-0 pr-2">
          <span class="font-bold text-slate-800 block truncate">${it.productName || it.name || 'Produk'}</span>
          <span class="text-slate-400 font-mono">${it.barcode || ''}</span>
        </div>
        <div class="text-right shrink-0 font-mono">
          <span class="font-bold text-slate-700">${it.qty} ${it.unit || 'pcs'} x Rp ${(it.costPrice || it.cost || 0).toLocaleString('id-ID')}</span>
          <span class="block text-emerald-700 font-bold">Rp ${(it.subtotal || (it.qty * (it.costPrice || it.cost || 0))).toLocaleString('id-ID')}</span>
        </div>
      </div>
    `).join('');

    return `
      <div class="p-3.5 bg-white border border-slate-200/90 rounded-2xl shadow-2xs space-y-2.5 hover:border-slate-300 transition">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 font-mono text-[10px] font-bold border border-emerald-200">
              ${invoice}
            </span>
            <span class="text-[10px] text-slate-500 font-medium">${dateStr} • ${timeStr}</span>
          </div>
          <span class="font-black text-slate-900 font-mono text-sm">
            Rp ${totalVal}
          </span>
        </div>

        <div class="grid grid-cols-2 gap-2 text-[10px] text-slate-600 pt-1 border-t border-slate-100">
          <div><span class="text-slate-400">Supplier:</span> <b class="text-slate-800">${supplier}</b></div>
          <div><span class="text-slate-400">Total Masuk:</span> <b class="text-emerald-700">${skuCount} SKU (${totalQty} Total Item)</b></div>
        </div>

        <!-- Tombol Aksi Detail & Cetak -->
        <div class="pt-1 flex items-center justify-between gap-2 border-t border-slate-100">
          <button 
            type="button" 
            onclick="toggleSisLpbDetail('${detailId}')" 
            class="text-[11px] font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer transition"
          >
            <span>👁️</span><span id="${detailId}-lbl">Lihat Rincian Item</span>
          </button>

          <button 
            type="button" 
            onclick="printSisLpbReceiptById('${rec.id}')" 
            class="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer active:scale-95 border border-emerald-200"
          >
            <span>🖨️</span>
            <span>Cetak Struk LPB</span>
          </button>
        </div>

        <!-- Accordion Detail Items -->
        <div id="${detailId}" class="hidden mt-2 pt-2 border-t border-dashed border-slate-200 space-y-1 bg-slate-50/60 p-2.5 rounded-xl">
          <div class="text-[10px] font-bold uppercase text-slate-400 mb-1">Rincian Barang Diterima:</div>
          ${itemsRows || '<div class="text-slate-400 text-[10px]">Tidak ada data item</div>'}
        </div>
      </div>
    `;
  }).join('');
}

function toggleSisLpbDetail(id) {
  const el = document.getElementById(id);
  const lbl = document.getElementById(`${id}-lbl`);
  if (!el) return;
  const isHidden = el.classList.contains('hidden');
  if (isHidden) {
    el.classList.remove('hidden');
    if (lbl) lbl.textContent = "Tutup Rincian Item";
  } else {
    el.classList.add('hidden');
    if (lbl) lbl.textContent = "Lihat Rincian Item";
  }
}

function printSisLpbReceiptById(lpbId) {
  const records = (pos && Array.isArray(pos.lpbRecords)) ? pos.lpbRecords : [];
  const rec = records.find(r => r.id === lpbId || r.invoiceNo === lpbId);
  if (!rec) {
    alert("Dokumen LPB tidak ditemukan!");
    return;
  }

  if (typeof printLpbReceiptUniversal === 'function') {
    printLpbReceiptUniversal(rec);
  } else {
    window.print();
  }
}

function saveSisLpb() {
  if (sisLpbDraft.length === 0) {
    alert("Faktur penerimaan masih kosong! Tambahkan minimal 1 produk barang masuk.");
    return;
  }

  const invInput = document.getElementById('lpb-invoice-no');
  const supInput = document.getElementById('lpb-supplier-name');
  const invoiceNo = (invInput?.value || "").trim() || `FAK-${Date.now()}`;
  const supplier = (supInput?.value || "").trim() || "Distributor";

  if (!pos || !Array.isArray(pos.products)) {
    alert("Database belum siap!");
    return;
  }

  let totalAddedStock = 0;
  let totalAmount = 0;

  sisLpbDraft.forEach((item, idx) => {
    const prod = pos.products.find(p => p.id === item.id || p.barcode === item.barcode);
    if (prod) {
      prod.stock = (parseInt(prod.stock, 10) || 0) + item.qty;
      if (item.cost > 0) prod.costPrice = item.cost;
      totalAddedStock += item.qty;
      totalAmount += (item.qty * item.cost);

      // Catat ke mutasi stok
      if (!Array.isArray(pos.mutations)) pos.mutations = [];
      pos.mutations.unshift({
        id: `MUT-${Date.now()}-${idx}`,
        productId: prod.id,
        productName: prod.name,
        barcode: prod.barcode,
        type: 'IN',
        qty: item.qty,
        cost: item.cost,
        reason: `LPB Faktur #${invoiceNo} (${supplier})`,
        timestamp: new Date().toISOString()
      });
    }
  });

  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  const operator = (pos.currentUser ? pos.currentUser.name : "Admin Toko");

  // Catat riwayat dokumen LPB dengan struktur standar
  const lpbDoc = {
    id: invoiceNo,
    invoiceNo: invoiceNo,
    supplierName: supplier,
    supplier: supplier,
    date: dateStr,
    time: timeStr,
    timestamp: Date.now(),
    operator: operator,
    paymentType: "TUNAI/KREDIT",
    items: sisLpbDraft.map(item => ({
      productId: item.id,
      productName: item.name,
      name: item.name,
      barcode: item.barcode,
      unit: item.unit || 'pcs',
      qty: item.qty,
      costPrice: item.cost,
      cost: item.cost,
      subtotal: item.qty * item.cost
    })),
    totalItems: sisLpbDraft.length,
    totalQty: totalAddedStock,
    totalValue: totalAmount,
    totalAmount: totalAmount
  };

  if (!Array.isArray(pos.lpbRecords)) pos.lpbRecords = [];
  pos.lpbRecords.unshift(lpbDoc);

  if (typeof pos.saveProducts === 'function') pos.saveProducts();
  if (typeof pos.saveMutations === 'function') pos.saveMutations();
  if (typeof pos.saveLpbRecords === 'function') pos.saveLpbRecords();

  if (typeof renderInventoryTable === 'function') renderInventoryTable();
  if (typeof renderPosCart === 'function') renderPosCart();

  // Cetak Dokumen Penerimaan LPB ke Printer
  if (typeof printLpbReceiptUniversal === 'function') {
    printLpbReceiptUniversal(lpbDoc);
  }

  const toastMsg = `📥 Faktur LPB #${invoiceNo} Disimpan & Dicetak! Stok +${totalAddedStock} item bertambah.`;
  if (typeof showMockupToast === 'function') {
    showMockupToast(toastMsg, 'success');
  } else if (typeof showToast === 'function') {
    showToast(toastMsg, 'success');
  }

  sisLpbDraft = [];
  renderSisLpbDraftTable();

  // Tampilkan tab riwayat langsung agar kasir melihat bukti faktur
  renderSisLpbHistory();
  switchSisLpbTab('history');
}



// =========================================================================
// 3. SIS STOCK OPNAME FISIK RAK (#sis-modal-so)
// =========================================================================

window.selectedSoProduct = null;

function initSisSoModal() {
  const products = (pos && Array.isArray(pos.products)) ? pos.products : [];
  if (products.length > 0 && !window.selectedSoProduct) {
    selectSisSoProduct(products[0]);
  } else if (window.selectedSoProduct) {
    selectSisSoProduct(window.selectedSoProduct);
  }
}

function selectSisSoProduct(prod) {
  if (!prod) return;
  window.selectedSoProduct = prod;

  const searchInput = document.getElementById('so-product-search');
  if (searchInput) searchInput.value = prod.barcode || prod.name;

  const nameEl = document.getElementById('so-product-name');
  if (nameEl) nameEl.textContent = prod.name;

  const barcodeEl = document.getElementById('so-product-barcode');
  if (barcodeEl) barcodeEl.textContent = `${prod.barcode || '-'} • HPP: Rp ${(prod.costPrice || 0).toLocaleString('id-ID')}`;

  const sysEl = document.getElementById('so-system-stock');
  if (sysEl) sysEl.textContent = `${prod.stock || 0} ${prod.unit || 'PCS'}`;

  const physInput = document.getElementById('so-physical-qty');
  if (physInput) {
    physInput.value = prod.stock || 0;
  }

  updateSisSoDifference();
}

function updateSisSoDifference() {
  const p = window.selectedSoProduct;
  if (!p) return;

  const sysStock = parseInt(p.stock, 10) || 0;
  const physInput = document.getElementById('so-physical-qty');
  const physStock = parseInt(physInput?.value, 10) || 0;
  const diff = physStock - sysStock;

  const diffEl = document.getElementById('so-diff-val');
  const diffBox = document.getElementById('so-diff-box');
  const noteEl = document.getElementById('so-diff-warning');

  if (diffEl) {
    diffEl.textContent = `${diff >= 0 ? '+' : ''}${diff} ${p.unit || 'PCS'}`;
  }

  if (diffBox) {
    if (diff === 0) {
      diffBox.className = "p-2 bg-emerald-50 rounded-xl border border-emerald-200";
      if (diffEl) diffEl.className = "font-mono font-black text-emerald-700 text-sm";
    } else if (diff < 0) {
      diffBox.className = "p-2 bg-rose-50 rounded-xl border border-rose-200";
      if (diffEl) diffEl.className = "font-mono font-black text-rose-700 text-sm";
    } else {
      diffBox.className = "p-2 bg-blue-50 rounded-xl border border-blue-200";
      if (diffEl) diffEl.className = "font-mono font-black text-blue-700 text-sm";
    }
  }

  if (noteEl) {
    if (diff === 0) {
      noteEl.className = "p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-[11px] text-emerald-900";
      noteEl.textContent = "✅ Stok fisik di rak SESUAI 100% dengan stok sistem komputer (Selisih 0).";
    } else if (diff < 0) {
      noteEl.className = "p-3 bg-rose-50/70 border border-rose-200 rounded-xl text-[11px] text-rose-900";
      noteEl.textContent = `⚠️ Selisih KURANG (${diff} ${p.unit || 'PCS'}) akan dicatat sebagai kehilangan/shrinkage stok.`;
    } else {
      noteEl.className = "p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-[11px] text-blue-900";
      noteEl.textContent = `ℹ️ Selisih LEBIH (+${diff} ${p.unit || 'PCS'}) akan ditambahkan ke database stok toko.`;
    }
  }
}

function saveSisSo() {
  const p = window.selectedSoProduct;
  if (!p) {
    alert("Harap pilih produk yang akan di-stock opname!");
    return;
  }

  const prod = pos.products.find(item => item.id === p.id || item.barcode === p.barcode);
  if (!prod) {
    alert("Produk tidak ditemukan di database!");
    return;
  }

  const prevStock = parseInt(prod.stock, 10) || 0;
  const physInput = document.getElementById('so-physical-qty');
  const physStock = parseInt(physInput?.value, 10) || 0;
  const diff = physStock - prevStock;
  const noteInput = document.getElementById('so-notes');
  const notes = (noteInput?.value || "").trim();

  // Perbarui stok produk ke angka fisik nyata
  prod.stock = physStock;

  // Catat penyesuaian ke mutasi stok
  if (!Array.isArray(pos.mutations)) pos.mutations = [];
  pos.mutations.unshift({
    id: `MUT-${Date.now()}`,
    productId: prod.id,
    productName: prod.name,
    barcode: prod.barcode,
    type: 'ADJUST',
    qty: diff,
    previousStock: prevStock,
    currentStock: physStock,
    reason: `Stock Opname: ${diff >= 0 ? '+' : ''}${diff} ${prod.unit || 'PCS'} (${notes || 'Penyesuaian Fisik Rak'})`,
    timestamp: new Date().toISOString()
  });

  if (typeof pos.saveProducts === 'function') pos.saveProducts();
  if (typeof pos.saveMutations === 'function') pos.saveMutations();

  if (typeof renderInventoryTable === 'function') renderInventoryTable();
  if (typeof renderPosCart === 'function') renderPosCart();

  const toastMsg = `💾 Hasil SO "${prod.name}" disimpan! Stok kini: ${physStock} ${prod.unit || 'PCS'} (${diff >= 0 ? '+' : ''}${diff}).`;
  if (typeof showMockupToast === 'function') {
    showMockupToast(toastMsg, 'success');
  } else if (typeof showToast === 'function') {
    showToast(toastMsg, 'success');
  }

  closeSisModal('sis-modal-so');
}


// =========================================================================
// 4. SIS BAP BARANG RUSAK / WASTE (#sis-modal-waste)
// =========================================================================

window.selectedWasteProduct = null;

function initSisWasteModal() {
  const products = (pos && Array.isArray(pos.products)) ? pos.products : [];
  if (products.length > 0 && !window.selectedWasteProduct) {
    selectSisWasteProduct(products[0]);
  } else if (window.selectedWasteProduct) {
    selectSisWasteProduct(window.selectedWasteProduct);
  }
}

function selectSisWasteProduct(prod) {
  if (!prod) return;
  window.selectedWasteProduct = prod;

  const searchInput = document.getElementById('waste-product-search');
  if (searchInput) searchInput.value = `${prod.name} (${prod.barcode || '-'})`;

  const nameEl = document.getElementById('waste-product-name');
  if (nameEl) nameEl.textContent = prod.name;

  const stockEl = document.getElementById('waste-current-stock');
  if (stockEl) stockEl.textContent = `Stok Saat Ini: ${prod.stock || 0} ${prod.unit || 'Bks'}`;

  const qtyInput = document.getElementById('waste-qty-input');
  if (qtyInput) qtyInput.value = "1";
}

function saveSisWaste() {
  const p = window.selectedWasteProduct;
  if (!p) {
    alert("Harap pilih produk yang rusak / waste!");
    return;
  }

  const prod = pos.products.find(item => item.id === p.id || item.barcode === p.barcode);
  if (!prod) {
    alert("Produk tidak ditemukan di database!");
    return;
  }

  const qtyInput = document.getElementById('waste-qty-input');
  const actionSelect = document.getElementById('waste-action-select');
  const notesInput = document.getElementById('waste-notes-input');

  const wasteQty = parseInt(qtyInput?.value, 10);
  if (isNaN(wasteQty) || wasteQty <= 0) {
    alert("Harap masukkan jumlah barang rusak (Qty) minimal 1!");
    if (qtyInput) qtyInput.focus();
    return;
  }

  const action = actionSelect?.value || "Pemusnahan Toko";
  const notes = (notesInput?.value || "").trim() || "Barang rusak / bocor kemasan";

  // Kurangi stok toko
  const prevStock = parseInt(prod.stock, 10) || 0;
  prod.stock = Math.max(0, prevStock - wasteQty);

  // Catat ke mutasi stok
  if (!Array.isArray(pos.mutations)) pos.mutations = [];
  pos.mutations.unshift({
    id: `MUT-${Date.now()}`,
    productId: prod.id,
    productName: prod.name,
    barcode: prod.barcode,
    type: 'OUT',
    qty: -wasteQty,
    reason: `BAP Waste [${action}]: ${notes}`,
    timestamp: new Date().toISOString()
  });

  // Catat ke riwayat waste lokal
  try {
    const rawWaste = localStorage.getItem('snack_pos_waste');
    const wasteList = rawWaste ? JSON.parse(rawWaste) : [];
    wasteList.unshift({
      id: `WST-${Date.now()}`,
      productId: prod.id,
      productName: prod.name,
      barcode: prod.barcode,
      qty: wasteQty,
      action: action,
      notes: notes,
      timestamp: new Date().toISOString()
    });
    localStorage.setItem('snack_pos_waste', JSON.stringify(wasteList));
  } catch (e) {
    console.warn("Save waste log error:", e);
  }

  if (typeof pos.saveProducts === 'function') pos.saveProducts();
  if (typeof pos.saveMutations === 'function') pos.saveMutations();

  if (typeof renderInventoryTable === 'function') renderInventoryTable();
  if (typeof renderPosCart === 'function') renderPosCart();

  const toastMsg = `🗑️ BAP Waste "${prod.name}" (-${wasteQty}) dicatat! Stok sisa: ${prod.stock} ${prod.unit || 'Bks'}.`;
  if (typeof showMockupToast === 'function') {
    showMockupToast(toastMsg, 'success');
  } else if (typeof showToast === 'function') {
    showToast(toastMsg, 'success');
  }

  closeSisModal('sis-modal-waste');
}


// =========================================================================
// 5. SIS REPACK BAL KE ECERAN (#sis-modal-repack)
// =========================================================================

window.selectedRepackOrigin = null;
window.selectedRepackTarget = null;

function updateRepackSummary() {
  const originProd = window.selectedRepackOrigin;
  const targetProd = window.selectedRepackTarget;
  const qOrigin = parseInt(document.getElementById('repack-qty-origin')?.value, 10) || 1;
  const qTarget = parseInt(document.getElementById('repack-qty-target')?.value, 10) || 25;
  const outEl = document.getElementById('repack-summary-out');
  const inEl = document.getElementById('repack-summary-in');

  if (outEl) {
    if (originProd) {
      const remaining = Math.max(0, (originProd.stock || 0) - qOrigin);
      outEl.textContent = `-${qOrigin} ${originProd.unit || 'Bal'} (${originProd.name}, Sisa ${remaining} ${originProd.unit || 'Bal'})`;
    } else {
      outEl.textContent = `-${qOrigin} Bal Mentah`;
    }
  }

  if (inEl) {
    if (targetProd) {
      const newTotal = (targetProd.stock || 0) + qTarget;
      inEl.textContent = `+${qTarget} ${targetProd.unit || 'Bks'} (${targetProd.name}, Total Jadi ${newTotal} ${targetProd.unit || 'Bks'})`;
    } else {
      inEl.textContent = `+${qTarget} Bungkus Kemasan Ecer`;
    }
  }
}

function executeRepackProcess() {
  const originProd = window.selectedRepackOrigin;
  const targetProd = window.selectedRepackTarget;

  if (!originProd || !targetProd) {
    alert("Harap pilih Produk Asal (Bal Mentah) dan Produk Tujuan (Kemasan Ecer) terlebih dahulu!");
    return;
  }

  const qOrigin = parseInt(document.getElementById('repack-qty-origin')?.value, 10) || 1;
  const qTarget = parseInt(document.getElementById('repack-qty-target')?.value, 10) || 25;

  if (qOrigin <= 0 || qTarget <= 0) {
    alert("Kuantiti repack harus lebih dari 0!");
    return;
  }

  const src = pos.products.find(p => p.id === originProd.id || p.barcode === originProd.barcode);
  const tgt = pos.products.find(p => p.id === targetProd.id || p.barcode === targetProd.barcode);

  if (!src || !tgt) {
    alert("Produk tidak ditemukan di database!");
    return;
  }

  if ((src.stock || 0) < qOrigin) {
    alert(`Stok bahan asal "${src.name}" tidak mencukupi! Tersedia: ${src.stock || 0} ${src.unit || 'Bal'}, diminta: ${qOrigin}`);
    return;
  }

  // Lakukan konversi stok riil
  src.stock = Math.max(0, (src.stock || 0) - qOrigin);
  tgt.stock = (tgt.stock || 0) + qTarget;

  // Catat mutasi OUT untuk origin
  if (!Array.isArray(pos.mutations)) pos.mutations = [];
  pos.mutations.unshift({
    id: `MUT-${Date.now()}-OUT`,
    productId: src.id,
    productName: src.name,
    barcode: src.barcode,
    type: 'OUT',
    qty: -qOrigin,
    reason: `Repack Bal ➔ Eceran ke "${tgt.name}" (+${qTarget} ${tgt.unit || 'Bks'})`,
    timestamp: new Date().toISOString()
  });

  // Catat mutasi IN untuk target
  pos.mutations.unshift({
    id: `MUT-${Date.now()}-IN`,
    productId: tgt.id,
    productName: tgt.name,
    barcode: tgt.barcode,
    type: 'IN',
    qty: qTarget,
    reason: `Hasil Repack Bal dari "${src.name}" (-${qOrigin} ${src.unit || 'Bal'})`,
    timestamp: new Date().toISOString()
  });

  if (typeof pos.saveProducts === 'function') pos.saveProducts();
  if (typeof pos.saveMutations === 'function') pos.saveMutations();

  if (typeof renderInventoryTable === 'function') renderInventoryTable();
  if (typeof renderPosCart === 'function') renderPosCart();

  const toastMsg = `🔄 Repack Sukses: -${qOrigin} ${src.unit || 'Bal'} "${src.name}" ➔ +${qTarget} ${tgt.unit || 'Bks'} "${tgt.name}"`;
  if (typeof showMockupToast === 'function') {
    showMockupToast(toastMsg, 'success');
  } else if (typeof showToast === 'function') {
    showToast(toastMsg, 'success');
  }

  closeSisModal('sis-modal-repack');
}


// Export to window
if (typeof window !== 'undefined') {
  window.getLogisticsCatalog = getLogisticsCatalog;
  window.handleLogisticsSearch = handleLogisticsSearch;
  window.toggleLogisticsCatalog = toggleLogisticsCatalog;
  window.renderLogisticsDropdown = renderLogisticsDropdown;
  window.selectLogisticsProduct = selectLogisticsProduct;
  window.handleLogisticsScannedBarcode = handleLogisticsScannedBarcode;

  window.switchProductModalTab = switchProductModalTab;
  window.renderSisProductsModal = renderSisProductsModal;
  window.resetSisProductForm = resetSisProductForm;
  window.editSisProduct = editSisProduct;
  window.saveSisProduct = saveSisProduct;
  window.printCurrentSisProductLabel = printCurrentSisProductLabel;
  window.deleteSisProduct = deleteSisProduct;

  window.initSisLpbModal = initSisLpbModal;
  window.renderSisLpbDraftTable = renderSisLpbDraftTable;
  window.addLpbItemFromSearch = addLpbItemFromSearch;
  window.removeSisLpbItem = removeSisLpbItem;
  window.saveSisLpb = saveSisLpb;

  window.initSisSoModal = initSisSoModal;
  window.selectSisSoProduct = selectSisSoProduct;
  window.updateSisSoDifference = updateSisSoDifference;
  window.saveSisSo = saveSisSo;

  window.initSisWasteModal = initSisWasteModal;
  window.selectSisWasteProduct = selectSisWasteProduct;
  window.saveSisWaste = saveSisWaste;

  window.updateRepackSummary = updateRepackSummary;
  window.executeRepackProcess = executeRepackProcess;

  window.triggerLogisticsCameraScan = triggerLogisticsCameraScan;
  window.stopSisScan = stopSisScan;
}

