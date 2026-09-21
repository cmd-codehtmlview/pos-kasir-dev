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
  const minQty = product.wholesaleMinQty || (product.hasMultiUnit ? 12 : 0);
  const wholesalePrice = product.wholesalePrice || (product.hasMultiUnit && product.lusinPrice ? Math.round(product.lusinPrice / 12) : 0);
  const hasWholesale = !!((product.hasWholesale || product.hasMultiUnit) && minQty > 1 && wholesalePrice > 0);

  if (hasWholesale && item.qty >= minQty) {
    item.price = wholesalePrice;
    item.isWholesale = true;
    item.wholesaleMinQty = minQty;
    item.wholesaleSaved = Math.max(0, (product.price - wholesalePrice) * item.qty);
  } else {
    item.price = product.price;
    item.isWholesale = false;
    item.wholesaleMinQty = minQty;
    item.wholesaleSaved = 0;
  }
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
      showToast(`⚡ Harga Grosir Otomatis Aktif: @${formatRupiah(existingItem.price)} (${existingItem.name})`, "success");
    }
  } else {
    const initialQty = Math.min(quantity, product.stock);
    const newItem = {
      id: product.id,
      barcode: product.barcode,
      name: product.name,
      category: product.category,
      basePrice: product.price,
      price: product.price,
      costPrice: product.costPrice,
      qty: initialQty,
      unit: product.unit || 'Pcs',
      emoji: product.emoji || '🍪',
      image: product.image,
      isWholesale: false,
      wholesaleSaved: 0
    };
    recalculateItemWholesale(newItem, product);
    pos.cart.push(newItem);
    if (newItem.isWholesale) {
      showToast(`⚡ Harga Grosir Otomatis Aktif: @${formatRupiah(newItem.price)} (${newItem.name})`, "success");
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

// Render Tabel Kasir Retail & Display LED
function renderPosCart() {
  const currentPos = (typeof pos !== 'undefined' && pos) || (typeof window !== 'undefined' && window.pos);
  if (!currentPos || !currentPos.cart) return;

  const tableBody = document.getElementById("pos-items-table-body");
  const ledTotal = document.getElementById("led-total-amount");
  const ledItemsCount = document.getElementById("led-items-count");
  const bottomTotal = document.getElementById("cart-grand-total-val");
  const totals = getCartTotals();

  // Update Display LED Angka Besar (Retail Style)
  if (ledTotal) {
    ledTotal.textContent = formatRupiah(totals.grandTotal);
  }
  if (ledItemsCount) {
    ledItemsCount.textContent = `${pos.cart.length} Item (${totals.totalQty} pcs)`;
  }
  if (bottomTotal) {
    bottomTotal.textContent = formatRupiah(totals.grandTotal);
  }

  // 1. Auto-Persist keranjang aktif kasir (Simpan ke LocalStorage agar kebal Refresh / Mati Lampu)
  if (pos && typeof pos.saveActiveCart === "function") {
    pos.saveActiveCart();
  }

  // 2. Sinkronkan visual lencana Member jika ada member aktif
  if (pos.activeMember) {
    const label = document.getElementById("active-member-label");
    const btn = document.getElementById("btn-select-member");
    const removeBtn = document.getElementById("btn-remove-member");
    if (label) label.textContent = `${pos.activeMember.name} (${pos.activeMember.points || 0} Poin)`;
    if (btn) btn.className = "px-2.5 py-0.5 bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-lg text-[10px] sm:text-xs font-black flex items-center gap-1 shadow-2xs";
    if (removeBtn) removeBtn.classList.remove("hidden");
  }

  if (!tableBody) return;

  if (pos.cart.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" class="py-16 text-center text-slate-400">
          <div class="text-4xl mb-2">🛒</div>
          <p class="font-bold text-slate-600 text-sm">BELUM ADA BARANG YANG DI-SCAN</p>
          <p class="text-xs text-slate-400 mt-1">Arahkan scanner ke barcode atau ketik nama produk di kolom [F2].</p>
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = pos.cart.map((item, idx) => {
    const isLatest = item.id === pos.lastScannedId;
    const itemTotal = item.price * item.qty;
    const isSelected = idx === selectedCartIndex;
    const p = pos.products.find(prod => prod.id === item.id);

    return `
      <tr 
        onclick="selectedCartIndex = ${idx}; renderPosCart();"
        class="pos-table-row cursor-pointer text-xs ${isLatest ? 'active-scan-row' : ''} ${isSelected ? 'bg-blue-50 font-semibold' : ''}"
      >
        <td class="hidden md:table-cell py-2 px-3 text-center font-mono font-bold text-slate-500">${idx + 1}</td>
        <td class="hidden sm:table-cell py-2 px-3 font-mono font-bold text-blue-700">${item.barcode}</td>
        <td class="py-2 px-2.5 sm:px-3">
          <div class="flex items-center gap-1.5 sm:gap-2">
            <span class="text-base sm:text-lg">${item.emoji || '🍪'}</span>
            <div class="min-w-0">
              <span class="font-bold text-slate-800 text-xs sm:text-sm block leading-snug truncate max-w-[140px] sm:max-w-xs">${item.name}</span>
              <span class="sm:hidden text-[10px] text-slate-500 font-mono block">@ ${formatRupiah(item.price)}</span>
              ${item.isWholesale ? `
                <span class="text-[9px] sm:text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-1.5 py-0.2 rounded-md inline-flex items-center gap-1 mt-0.5" title="Harga grosir otomatis aktif">
                  🏷️ Grosir • Hemat ${formatAngka(item.wholesaleSaved)}
                </span>
              ` : ''}
            </div>
          </div>
        </td>
        <td class="py-2 px-1 sm:px-3 text-center">
          <div class="inline-flex items-center bg-white border border-slate-300 rounded-lg overflow-hidden shadow-xs">
            <button onclick="event.stopPropagation(); updateCartQtyByIndex(${idx}, ${item.qty - 1})" class="qty-btn-touch bg-slate-100 hover:bg-rose-100 text-slate-700 font-bold active:bg-rose-200 cursor-pointer">-</button>
            <input 
              type="number" 
              min="1" 
              max="${p ? p.stock : 9999}" 
              value="${item.qty}"
              onclick="event.stopPropagation(); this.select();"
              onchange="updateCartQtyByIndex(${idx}, this.value)"
              onkeydown="if(event.key === 'Enter'){ this.blur(); }"
              class="w-11 sm:w-14 text-center font-black text-slate-900 text-xs sm:text-sm bg-white border-x border-slate-200 focus:bg-amber-50 focus:outline-none py-1"
              title="Klik untuk ketik kuantiti langsung"
            />
            <button onclick="event.stopPropagation(); updateCartQtyByIndex(${idx}, ${item.qty + 1})" class="qty-btn-touch bg-slate-100 hover:bg-emerald-100 text-slate-700 font-bold active:bg-emerald-200 cursor-pointer">+</button>
          </div>
        </td>
        <td class="hidden lg:table-cell py-2 px-3 text-slate-500 text-center font-medium">${item.unit || 'Pcs'}</td>
        <td class="hidden sm:table-cell py-2 px-3 text-right font-mono">${formatAngka(item.price)}</td>
        <td class="hidden lg:table-cell py-2 px-3 text-right font-mono text-rose-600">${item.isWholesale ? formatAngka(item.wholesaleSaved) : '0'}</td>
        <td class="py-2 px-2 sm:px-3 text-right">
          <div class="flex items-center justify-end gap-1.5">
            <span class="font-mono font-extrabold text-slate-900 text-xs sm:text-sm">${formatAngka(itemTotal)}</span>
            <button onclick="event.stopPropagation(); removeCartItem(${idx})" class="sm:hidden p-1 text-slate-400 hover:text-rose-600 active:scale-95" title="Hapus">
              ✕
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function removeCartItem(idx) {
  voidCartItemByIndex(idx);
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
