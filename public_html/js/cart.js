/**
 * SnackPOS - Shopping Cart & Pending/Hold Transactions
 */

// ==========================================
// 3. LOGIKA KASIR (RETAIL POS UI)
// ==========================================
let posViewMode = "speed"; // 'speed' (Tabel Cepat Retail) or 'touch' (Grid Foto 100 Snack)
let selectedCartIndex = 0;

function togglePosViewMode(mode) {
  posViewMode = mode;
  const speedView = document.getElementById("pos-speed-view");
  const touchView = document.getElementById("pos-touch-view");
  const btnSpeed = document.getElementById("btn-view-speed");
  const btnTouch = document.getElementById("btn-view-touch");

  if (speedView && touchView) {
    speedView.classList.toggle("hidden", mode !== "speed");
    touchView.classList.toggle("hidden", mode !== "touch");
  }

  if (btnSpeed && btnTouch) {
    btnSpeed.classList.toggle("bg-alfa-yellow", mode === "speed");
    btnSpeed.classList.toggle("text-slate-900", mode === "speed");
    btnSpeed.classList.toggle("bg-slate-700", mode !== "speed");
    btnSpeed.classList.toggle("text-white", mode !== "speed");

    btnTouch.classList.toggle("bg-alfa-yellow", mode === "touch");
    btnTouch.classList.toggle("text-slate-900", mode === "touch");
    btnTouch.classList.toggle("bg-slate-700", mode !== "touch");
    btnTouch.classList.toggle("text-white", mode !== "touch");
  }

  if (mode === "touch") renderTouchGrid();
}

function recalculateItemWholesale(item, product) {
  if (!product || !item) return;

  // Jika kasir sudah manual memilih Tier (A/B/C), hormati pilihan kasir
  if (item.manualTier) return;

  const priceA = product.priceA || product.price || item.basePrice || 0;
  const priceB = product.priceB || (product.hasWholesale && product.wholesalePrice ? product.wholesalePrice : Math.round(priceA * 0.9));
  const priceC = product.priceC || Math.round(priceA * 0.8);
  const minB = product.minQtyB || (product.hasWholesale ? product.wholesaleMinQty : 0) || 0;
  const minC = product.minQtyC || 0;

  // Aturan Standar Toko Ritel: Default Auto Switch / Minimal Order adalah OFF (Mati)
  // Hanya aktif jika produk secara sengaja diset autoSwitchTier === true
  const autoSwitch = product.autoSwitchTier === true;

  if (autoSwitch) {
    if (minC > 1 && item.qty >= minC && priceC > 0) {
      item.tier = 'C';
      item.price = priceC;
      item.isWholesale = true;
      item.wholesaleSaved = Math.max(0, (priceA - priceC) * item.qty);
      return;
    } else if (minB > 1 && item.qty >= minB && priceB > 0) {
      item.tier = 'B';
      item.price = priceB;
      item.isWholesale = true;
      item.wholesaleSaved = Math.max(0, (priceA - priceB) * item.qty);
      return;
    }
  }

  // Default: Harga Satuan (Tier A), minimal order OFF
  item.tier = 'A';
  item.price = priceA;
  item.isWholesale = false;
  item.wholesaleSaved = 0;
}

function addToCart(productId, quantity = 1) {
  const product = pos.products.find(p => p.id === productId);
  if (!product) return;

  if (product.stock <= 0) {
    showToast(`Stok ${product.name} habis!`, "error");
    sfx.warning();
    return;
  }

  const existingItem = pos.cart.find(item => item.id === productId);

  if (existingItem) {
    const newQty = existingItem.qty + quantity;
    if (newQty > product.stock) {
      showToast(`Stok ${product.name} hanya tersisa ${product.stock} pcs!`, "warning");
      existingItem.qty = product.stock;
      sfx.warning();
    } else {
      existingItem.qty = newQty;
    }
    const wasWholesale = existingItem.isWholesale;
    recalculateItemWholesale(existingItem, product);
    if (existingItem.isWholesale && !wasWholesale) {
      showToast(`⚡ Harga Grosir Otomatis: @${formatRupiah(existingItem.price)} (${existingItem.name})`, "success");
    }
  } else {
    const initialQty = Math.min(quantity, product.stock);
    const priceA = product.priceA || product.price;
    const newItem = {
      id: product.id,
      barcode: product.barcode,
      name: product.name,
      category: product.category,
      basePrice: priceA,
      price: priceA,
      costPrice: product.costPrice,
      qty: initialQty,
      unit: product.unit || 'Pcs',
      emoji: product.emoji || '🍪',
      image: product.image,
      tier: 'A',
      isWholesale: false,
      wholesaleSaved: 0
    };
    recalculateItemWholesale(newItem, product);
    pos.cart.push(newItem);
    if (newItem.isWholesale) {
      showToast(`⚡ Harga Grosir Otomatis: @${formatRupiah(newItem.price)} (${newItem.name})`, "success");
    }
  }

  pos.lastScannedId = productId;
  selectedCartIndex = pos.cart.length - 1;
  sfx.beep();
  renderPosCart();
}

function updateCartQtyByIndex(index, newQty) {
  if (!pos.cart[index]) return;
  const item = pos.cart[index];
  const product = pos.products.find(p => p.id === item.id);
  if (!product) return;

  newQty = parseInt(newQty) || 0;
  if (newQty <= 0) {
    // Sesuai aturan standar retail: Mengurangi kuantiti hingga 0 adalah VOID barang, wajib otorisasi supervisor jika kasir CREW
    selectedCartIndex = index;
    voidSelectedItem();
    return;
  } else if (newQty > product.stock) {
    showToast(`Stok ${product.name} hanya ${product.stock} pcs!`, "warning");
    item.qty = product.stock;
    sfx.warning();
  } else {
    item.qty = newQty;
    sfx.beep();
  }

  if (pos.cart[index]) {
    const wasWholesale = item.isWholesale;
    recalculateItemWholesale(item, product);
    if (item.isWholesale && !wasWholesale) {
      showToast(`⚡ Harga Grosir Otomatis Aktif: @${formatRupiah(item.price)} (${item.name})`, "success");
    }
  }

  renderPosCart();
}

function promptChangeQty() {
  if (pos.cart.length === 0) {
    showToast("Keranjang transaksi masih kosong!", "warning");
    return;
  }
  const item = pos.cart[selectedCartIndex] || pos.cart[pos.cart.length - 1];
  const input = prompt(`Masukkan jumlah (Qty) untuk "${item.name}":`, item.qty);
  if (input !== null) {
    updateCartQtyByIndex(selectedCartIndex, parseInt(input));
  }
}

function voidSelectedItem() {
  if (pos.cart.length === 0) {
    showToast("Keranjang transaksi kosong!", "warning");
    return;
  }
  const item = pos.cart[selectedCartIndex] || pos.cart[pos.cart.length - 1];
  requestSupervisorAuth("VOID_ITEM", `Void / Hapus Item "${item.name}" [F5]`, () => {
    executeVoidItem();
  });
}

function voidCartItemByIndex(idx) {
  if (!pos.cart || !pos.cart[idx]) return;
  selectedCartIndex = idx;
  const item = pos.cart[idx];
  requestSupervisorAuth("VOID_ITEM", `Void / Hapus Item "${item.name}" [F5]`, () => {
    executeVoidItem();
  });
}

function executeVoidItem() {
  if (pos.cart.length === 0) return;
  const item = pos.cart[selectedCartIndex] || pos.cart[pos.cart.length - 1];
  pos.cart.splice(selectedCartIndex, 1);
  selectedCartIndex = Math.max(0, pos.cart.length - 1);
  renderPosCart();
  showToast(`Item "${item.name}" berhasil di-void (dihapus)`, "info");
  sfx.beep();
}

function clearCart(silent = false) {
  if (pos.cart.length === 0) return;
  if (silent) {
    executeClearCart(true);
    return;
  }
  requestSupervisorAuth("VOID_CART", "Batal Seluruh Transaksi (Void Keranjang)", () => {
    executeClearCart(false);
  });
}

function executeClearCart(silent = false) {
  if (pos.cart.length === 0) return;
  if (pos && typeof pos.clearActiveCart === "function") {
    pos.clearActiveCart();
  } else {
    pos.cart = [];
    pos.activeDiscount = { type: 'percent', value: 0, reason: '' };
    pos.lastScannedId = null;
  }
  selectedCartIndex = 0;
  detachMemberFromCart();
  renderPosCart();
  if (!silent) showToast("Transaksi kasir dibatalkan seluruhnya (Void Keranjang)", "info");

  // Jika ada update tertunda, reload halaman sekarang karena keranjang sudah kosong
  if (window._pendingAutoUpdateReload) {
    console.log("[AutoUpdate] Keranjang kasir telah kosong. Memulai reload senyap...");
    setTimeout(() => { window.location.reload(); }, 500);
  }
}

function getCartTotals() {
  const currentPos = (typeof pos !== 'undefined' && pos) || (typeof window !== 'undefined' && window.pos);
  if (!currentPos || !currentPos.cart) {
    return { subtotal: 0, totalCost: 0, totalQty: 0, discountAmount: 0, grandTotal: 0, estimatedProfit: 0 };
  }

  const subtotal = currentPos.cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
  const totalCost = currentPos.cart.reduce((acc, item) => acc + (item.costPrice * item.qty), 0);
  const totalQty = currentPos.cart.reduce((acc, item) => acc + item.qty, 0);

  let discountAmount = 0;
  if (currentPos.activeDiscount && currentPos.activeDiscount.value > 0) {
    if (currentPos.activeDiscount.type === 'percent') {
      discountAmount = Math.round((subtotal * currentPos.activeDiscount.value) / 100);
    } else {
      discountAmount = Math.min(currentPos.activeDiscount.value, subtotal);
    }
  }

  const grandTotal = Math.max(0, subtotal - discountAmount);
  const estimatedProfit = grandTotal - totalCost;

  return { subtotal, totalCost, totalQty, discountAmount, grandTotal, estimatedProfit };
}

/// Render Tabel Kasir Retail & Display LED (Modern 12-Col Grid)
function renderPosCart() {
  const currentPos = (typeof pos !== 'undefined' && pos) || (typeof window !== 'undefined' && window.pos);
  if (!currentPos || !currentPos.cart) return;

  const tableBody = document.getElementById("pos-items-table-body");
  const ledTotal = document.getElementById("led-total-amount");
  const ledItemsCount = document.getElementById("led-items-count");
  const ledSubtotal = document.getElementById("led-subtotal-amount");
  const ledTax = document.getElementById("led-tax-amount");
  const bottomTotal = document.getElementById("cart-grand-total-val");
  const mobCountLabel = document.getElementById("mobile-cart-count-label");
  const discountVal = document.getElementById("cart-discount-val");
  const totals = getCartTotals();

  // Update Display LED Angka Besar (Retail Style)
  if (ledTotal) {
    ledTotal.textContent = formatRupiah(totals.grandTotal);
  }
  if (bottomTotal) {
    bottomTotal.textContent = formatRupiah(totals.grandTotal);
  }
  if (ledSubtotal) {
    ledSubtotal.textContent = formatRupiah(totals.subtotal || totals.grandTotal);
  }
  if (ledTax) {
    ledTax.textContent = formatRupiah(totals.tax || 0);
  }
  if (ledItemsCount) {
    ledItemsCount.textContent = `${pos.cart.length} Item (${totals.totalQty} pcs)`;
  }
  if (mobCountLabel) {
    mobCountLabel.textContent = `TOTAL TAGIHAN (${pos.cart.length} ITEM)`;
  }
  if (discountVal) {
    discountVal.textContent = formatRupiah(totals.discount || 0);
  }

  // 1. Auto-Persist keranjang aktif kasir (Simpan ke LocalStorage agar kebal Refresh / Mati Lampu)
  if (pos && typeof pos.saveActiveCart === "function") {
    pos.saveActiveCart();
  }

  // 2. Sinkronkan visual lencana Member jika ada member aktif
  if (pos.activeMember) {
    const label = document.getElementById("active-member-label");
    const removeBtn = document.getElementById("btn-remove-member");
    if (label) label.textContent = `${pos.activeMember.name} (${pos.activeMember.points || 0} Poin)`;
    if (removeBtn) removeBtn.classList.remove("hidden");
  } else {
    const label = document.getElementById("active-member-label");
    const removeBtn = document.getElementById("btn-remove-member");
    if (label) label.textContent = "+ member";
    if (removeBtn) removeBtn.classList.add("hidden");
  }

  if (!tableBody) return;

  if (pos.cart.length === 0) {
    tableBody.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full min-h-[200px] py-8 px-4 text-center text-slate-400">
        <div class="text-4xl mb-2">🛒</div>
        <p class="font-bold text-slate-600 text-sm">BELUM ADA BARANG YANG DI-SCAN</p>
        <p class="text-xs text-slate-400 mt-1">Arahkan scanner ke barcode atau ketik nama produk di kolom pencarian.</p>
      </div>
    `;
    return;
  }

  tableBody.innerHTML = pos.cart.map((item, idx) => {
    const itemTotal = item.price * item.qty;
    const isSelected = idx === selectedCartIndex;
    const itemTier = item.tier || 'A';
    const wholesaleBadge = item.isWholesale ? `<span class="ml-1 px-1.5 py-0.2 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded font-black text-[9px]">${itemTier === 'C' ? 'Pabrik' : 'Grosir'}</span>` : '';

    return `
      <div 
        id="cart-row-${idx}"
        onclick="selectedCartIndex = ${idx}; renderPosCart();"
        class="p-2 sm:p-2.5 grid grid-cols-12 gap-1 sm:gap-2 items-center hover:bg-slate-50 text-xs transition cursor-pointer ${isSelected ? 'bg-amber-50/40 border-l-4 border-amber-500' : ''}"
        data-product-id="${item.id}"
      >
        <span class="col-span-1 text-center font-bold text-slate-400 hidden sm:inline">${idx + 1}</span>
        <div class="col-span-4 sm:col-span-4 min-w-0">
          <div class="flex items-center gap-1">
            <h4 class="font-extrabold text-slate-900 text-xs sm:text-sm truncate">${item.name}</h4>
            ${wholesaleBadge}
          </div>
          <p class="text-[10px] text-slate-400 font-mono truncate item-unit-label">@${formatAngka(item.price)} • ${item.barcode || item.plu || '-'}</p>
        </div>
        <div class="col-span-3 sm:col-span-2 flex items-center justify-center gap-0.5 sm:gap-1" onclick="event.stopPropagation();">
          <button type="button" onclick="updateCartQtyByIndex(${idx}, ${item.qty - 1})" class="w-5 h-5 sm:w-6 sm:h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-xs cursor-pointer">-</button>
          <input 
            type="number" 
            min="1" 
            value="${item.qty}" 
            onchange="onCartQtyInputChange(${idx}, this.value)" 
            onkeydown="if(event.key==='Enter'){this.blur();}"
            onfocus="this.select()"
            class="font-black text-xs sm:text-sm w-7 sm:w-11 text-center py-0.5 px-0.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
            title="Ketik angka kuantiti langsung tanpa tombol -+"
          />
          <button type="button" onclick="updateCartQtyByIndex(${idx}, ${item.qty + 1})" class="w-5 h-5 sm:w-6 sm:h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-xs cursor-pointer">+</button>
        </div>
        <div class="col-span-2 sm:col-span-1 flex items-center justify-center" onclick="event.stopPropagation();">
          <select 
            onchange="onCartTierChange(${idx}, this.value)" 
            class="tier-selector item-tier-select px-1 py-0.5 bg-slate-100 hover:bg-slate-200 font-black text-[11px] rounded-lg border border-slate-300 text-slate-800 cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-500" 
            title="Pilih Tier Harga (A: Satuan, B: Grosir, C: Pabrik)"
          >
            <option value="A" ${itemTier === 'A' ? 'selected' : ''}>A</option>
            <option value="B" ${itemTier === 'B' ? 'selected' : ''}>B</option>
            <option value="C" ${itemTier === 'C' ? 'selected' : ''}>C</option>
          </select>
        </div>
        <span class="col-span-2 text-right font-mono font-semibold text-slate-600 hidden sm:inline item-unit-price">${formatAngka(item.price)}</span>
        <div class="col-span-3 sm:col-span-2 text-right font-mono font-extrabold text-slate-900 text-xs sm:text-sm flex items-center justify-end gap-1">
          <span class="truncate item-total-price">${formatAngka(itemTotal)}</span>
          <button type="button" onclick="event.stopPropagation(); removeCartItem(${idx})" class="text-rose-500 hover:text-rose-700 text-xs font-bold ml-1 cursor-pointer" title="Hapus item">✕</button>
        </div>
      </div>
    `;
  }).join("");
}

function onCartQtyInputChange(index, val) {
  const parsed = parseInt(val, 10);
  if (isNaN(parsed) || parsed <= 0) {
    updateCartQtyByIndex(index, 0);
  } else {
    updateCartQtyByIndex(index, parsed);
  }
}

function onCartTierChange(index, newTier) {
  if (!pos || !pos.cart || !pos.cart[index]) return;
  const item = pos.cart[index];
  const product = pos.products.find(p => p.id === item.id);
  if (!product) return;

  item.tier = newTier;
  item.manualTier = true; // Manual override oleh kasir

  const priceA = product.priceA || product.price || item.basePrice || 0;
  const priceB = product.priceB || (product.hasWholesale && product.wholesalePrice ? product.wholesalePrice : Math.round(priceA * 0.9));
  const priceC = product.priceC || Math.round(priceA * 0.8);

  if (newTier === 'B') {
    item.price = priceB;
    item.isWholesale = true;
  } else if (newTier === 'C') {
    item.price = priceC;
    item.isWholesale = true;
  } else {
    item.price = priceA;
    item.isWholesale = false;
  }

  const tierName = newTier === 'A' ? 'Satuan' : (newTier === 'B' ? 'Grosir' : 'Pabrik');
  if (typeof showToast === 'function') {
    showToast(`Tier ${newTier} (${tierName}) dipilih: @${formatRupiah(item.price)}`, "info");
  }
  renderPosCart();
}

function removeCartItem(idx) {
  voidCartItemByIndex(idx);
}

function quickTenderAction(type) {
  if (!pos || !pos.cart || pos.cart.length === 0) {
    if (typeof showToast === 'function') showToast("Keranjang transaksi masih kosong!", "warning");
    return;
  }
  if (typeof openCheckoutModal === 'function') {
    openCheckoutModal();
    if (typeof quickCash === 'function') {
      quickCash(type);
    }
  }
}

// Render Mode Grid Touchscreen (100 Foto Snack)
let touchCategoryFilter = "Semua Kategori";
function renderTouchGrid() {
  const container = document.getElementById("touch-products-grid");
  const catContainer = document.getElementById("touch-categories-container");
  if (!container) return;

  if (catContainer) {
    // Kategori dinamis otomatis: ekstrak kategori unik dari produk toko
    const existingCats = Array.from(new Set(pos.products.map(p => p.category).filter(Boolean)));
    const baseCats = typeof INITIAL_CATEGORIES !== 'undefined' ? INITIAL_CATEGORIES.filter(c => c !== "Semua Kategori") : [];
    const allCategories = ["Semua Kategori", ...Array.from(new Set([...baseCats, ...existingCats]))];

    catContainer.innerHTML = allCategories.map(cat => {
      const isActive = cat === touchCategoryFilter;
      return `
        <button 
          onclick="touchCategoryFilter = '${cat}'; renderTouchGrid();"
          class="px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            isActive ? 'bg-alfa-red text-white shadow-xs' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
          }"
        >
          ${cat}
        </button>
      `;
    }).join("");
  }

  const list = pos.products.filter(p => {
    return touchCategoryFilter === "Semua Kategori" || p.category === touchCategoryFilter;
  });

  container.innerHTML = list.map(p => {
    return `
      <div 
        onclick="addToCart('${p.id}')"
        class="bg-white rounded-xl border border-slate-200 hover:border-alfa-red hover:shadow-md p-2.5 flex flex-col justify-between cursor-pointer transition-all active:scale-95 select-none"
      >
        <div class="relative w-full h-24 rounded-lg overflow-hidden bg-slate-100 mb-2 flex items-center justify-center">
          <img src="${getProductImageSrc(p)}" alt="${p.name}" class="w-full h-full object-cover" loading="lazy" onerror="this.onerror=null; this.src=getProductThumbnailSvg('${(p.category || '').replace(/'/g, "\\'")}', '${(p.name || '').replace(/'/g, "\\'")}');">
          <span class="absolute top-1 right-1 px-1.5 py-0.5 bg-black/70 text-white rounded text-[10px] font-mono font-bold">Stok ${p.stock}</span>
        </div>
        <div>
          <h4 class="font-bold text-xs text-slate-800 line-clamp-2 leading-tight">${p.name}</h4>
          <span class="font-black text-alfa-red text-xs mt-1 block">${formatRupiah(p.price)}</span>
        </div>
      </div>
    `;
  }).join("");
}

// ==========================================
// 8. PENDING & UNPENDING TRANSAKSI (1 SLOT BUFFER KASIR)
// ==========================================
function togglePendingCart() {
  if (pos.pendingCart) {
    unpendingCart();
  } else {
    pendingCurrentCart();
  }
}

function pendingCurrentCart() {
  if (pos.cart.length === 0) {
    showToast("Keranjang kosong, tidak ada transaksi untuk dipending.", "warning");
    sfx.warning();
    return;
  }
  if (pos.pendingCart) {
    showToast("Hanya 1 transaksi yang bisa dipending! Silakan Unpending transaksi sebelumnya terlebih dahulu.", "warning");
    sfx.warning();
    return;
  }

  const totals = getCartTotals();
  const now = new Date();
  const timeStr = now.toLocaleTimeString("id-ID", { hour: '2-digit', minute: '2-digit' });

  pos.pendingCart = {
    time: timeStr,
    timestamp: Date.now(),
    cart: [...pos.cart],
    activeMember: pos.activeMember ? { ...pos.activeMember } : null,
    activeDiscount: { ...pos.activeDiscount },
    totals: totals
  };
  pos.savePendingCart();

  // Kosongkan keranjang kasir
  pos.cart = [];
  pos.activeDiscount = { type: 'percent', value: 0, reason: '' };
  pos.lastScannedId = null;
  selectedCartIndex = 0;
  detachMemberFromCart();

  renderPosCart();
  updatePendingUI();
  showToast(`Transaksi dipending (${pos.pendingCart.cart.length} item). Silakan layani transaksi berikutnya! [F4]`, "info");
  sfx.beep();
}

function unpendingCart() {
  if (!pos.pendingCart) {
    showToast("Tidak ada transaksi yang sedang dipending.", "warning");
    sfx.warning();
    return;
  }

  // Jika meja kasir saat ini sedang berisi belanjaan lain, jangan ditumpuk
  if (pos.cart.length > 0) {
    showToast("Selesaikan atau kosongkan transaksi saat ini sebelum Unpending!", "warning");
    sfx.warning();
    return;
  }

  const held = pos.pendingCart;
  pos.cart = [...held.cart];
  pos.activeDiscount = held.activeDiscount ? { ...held.activeDiscount } : { type: 'percent', value: 0, reason: '' };

  if (held.activeMember) {
    selectMemberForCart(held.activeMember.id);
  } else {
    detachMemberFromCart();
  }

  pos.pendingCart = null;
  pos.savePendingCart();

  renderPosCart();
  updatePendingUI();
  showToast(`Transaksi pending berhasil dimunculkan kembali (${pos.cart.length} item)!`, "success");
  sfx.success();
}

function updatePendingUI() {
  const btnCart = document.getElementById("btn-pending-cart");
  const btnCartLabel = document.getElementById("btn-pending-label");
  const btnCartIcon = document.getElementById("btn-pending-icon");
  const f4Btn = document.getElementById("f4-pending-btn");
  const f4Label = document.getElementById("f4-pending-label");

  if (pos.pendingCart) {
    if (btnCart) {
      btnCart.className = "flex-1 sm:flex-initial px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-lg text-xs flex items-center justify-center gap-1 transition-all shadow-md animate-pulse";
    }
    if (btnCartLabel) btnCartLabel.textContent = "Unpending (1) [F4]";
    if (btnCartIcon) btnCartIcon.textContent = "▶️";

    if (f4Btn) {
      f4Btn.className = "f-key-btn bg-amber-500 text-slate-950 font-black border-2 border-yellow-300 animate-pulse";
    }
    if (f4Label) f4Label.textContent = "Unpending (1)";
  } else {
    if (btnCart) {
      btnCart.className = "flex-1 sm:flex-initial px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all";
    }
    if (btnCartLabel) btnCartLabel.textContent = "Pending [F4]";
    if (btnCartIcon) btnCartIcon.textContent = "⏸️";

    if (f4Btn) {
      f4Btn.className = "f-key-btn btn-f-slate";
    }
    if (f4Label) f4Label.textContent = "Pending";
  }
}

// Kompatibilitas fungsi parkir lama
function holdCurrentCart() {
  togglePendingCart();
}
