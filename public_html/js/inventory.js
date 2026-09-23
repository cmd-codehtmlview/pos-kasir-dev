/**
 * SnackPOS - Product Catalog, Camera & Image Compression
 */

function openFindProductModal() {
  openModal("modal-find-product");
  const searchInput = document.getElementById("find-product-query");
  if (searchInput) {
    searchInput.value = "";
    setTimeout(() => searchInput.focus(), 150);
  }
  if (typeof renderQuickFindProducts === "function") {
    renderQuickFindProducts();
  }
}

let inventorySortBy = "name-asc";

function changeInventorySort(val) {
  inventorySortBy = val;
  updateInventorySortIcons();
  renderInventoryTable();
}

function toggleInventorySort(col) {
  if (col === 'name') {
    inventorySortBy = (inventorySortBy === 'name-asc') ? 'name-desc' : 'name-asc';
  } else if (col === 'price') {
    inventorySortBy = (inventorySortBy === 'price-desc') ? 'price-asc' : 'price-desc';
  } else if (col === 'stock') {
    inventorySortBy = (inventorySortBy === 'stock-desc') ? 'stock-asc' : 'stock-desc';
  }
  
  const selectEl = document.getElementById("inventory-sort-select");
  if (selectEl) selectEl.value = inventorySortBy;
  
  updateInventorySortIcons();
  renderInventoryTable();
}

function updateInventorySortIcons() {
  const iconName = document.getElementById("sort-icon-name");
  const iconPrice = document.getElementById("sort-icon-price");
  const iconStock = document.getElementById("sort-icon-stock");
  
  if (iconName) {
    iconName.textContent = inventorySortBy === 'name-asc' ? '▲' : inventorySortBy === 'name-desc' ? '▼' : '↕';
    iconName.className = inventorySortBy.startsWith('name') ? 'text-alfa-red font-black' : 'text-slate-300 font-black';
  }
  if (iconPrice) {
    iconPrice.textContent = inventorySortBy === 'price-asc' ? '▲' : inventorySortBy === 'price-desc' ? '▼' : '↕';
    iconPrice.className = inventorySortBy.startsWith('price') ? 'text-alfa-red font-black' : 'text-slate-300 font-black';
  }
  if (iconStock) {
    iconStock.textContent = inventorySortBy === 'stock-asc' ? '▲' : inventorySortBy === 'stock-desc' ? '▼' : '↕';
    iconStock.className = inventorySortBy.startsWith('stock') ? 'text-alfa-red font-black' : 'text-slate-300 font-black';
  }
}

function sortInventoryList(items, sortBy) {
  const sorted = [...items];
  switch (sortBy) {
    case 'name-asc':
      return sorted.sort((a, b) => a.name.localeCompare(b.name, 'id'));
    case 'name-desc':
      return sorted.sort((a, b) => b.name.localeCompare(a.name, 'id'));
    case 'price-desc':
      return sorted.sort((a, b) => (b.price || 0) - (a.price || 0));
    case 'price-asc':
      return sorted.sort((a, b) => (a.price || 0) - (b.price || 0));
    case 'stock-desc':
      return sorted.sort((a, b) => (b.stock || 0) - (a.stock || 0));
    case 'stock-asc':
      return sorted.sort((a, b) => (a.stock || 0) - (b.stock || 0));
    default:
      return sorted;
  }
}

// State pilihan produk untuk batch cetak label & aksi massal
let selectedInventoryIds = new Set();

function toggleProductSelection(productId, isChecked) {
  const strId = String(productId);
  if (isChecked) {
    selectedInventoryIds.add(productId);
    selectedInventoryIds.add(strId);
  } else {
    selectedInventoryIds.delete(productId);
    selectedInventoryIds.delete(strId);
  }
  updateInventorySelectAllCheckbox();
  updateInventoryBatchBar();
}

function toggleSelectAllInventory(isChecked) {
  const searchInput = document.getElementById("inventory-search-input");
  const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
  let filtered = pos.products.filter(p => !query || p.name.toLowerCase().includes(query) || p.barcode.includes(query));

  if (isChecked) {
    filtered.forEach(p => {
      selectedInventoryIds.add(p.id);
      selectedInventoryIds.add(String(p.id));
    });
  } else {
    filtered.forEach(p => {
      selectedInventoryIds.delete(p.id);
      selectedInventoryIds.delete(String(p.id));
    });
  }

  // Update status centang pada baris tabel yang tampil
  document.querySelectorAll(".inventory-item-checkbox").forEach(cb => {
    const id = cb.getAttribute("data-id");
    if (id) cb.checked = selectedInventoryIds.has(id) || selectedInventoryIds.has(String(id));
  });

  updateInventorySelectAllCheckbox();
  updateInventoryBatchBar();
}

function updateInventorySelectAllCheckbox() {
  const selectAllCb = document.getElementById("inventory-select-all");
  if (!selectAllCb) return;

  const searchInput = document.getElementById("inventory-search-input");
  const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
  let filtered = pos.products.filter(p => !query || p.name.toLowerCase().includes(query) || p.barcode.includes(query));

  if (filtered.length === 0) {
    selectAllCb.checked = false;
    selectAllCb.indeterminate = false;
    return;
  }

  const allSelected = filtered.every(p => selectedInventoryIds.has(p.id));
  const someSelected = filtered.some(p => selectedInventoryIds.has(p.id));

  selectAllCb.checked = allSelected;
  selectAllCb.indeterminate = !allSelected && someSelected;
}

function clearInventorySelection() {
  selectedInventoryIds.clear();
  const selectAllCb = document.getElementById("inventory-select-all");
  if (selectAllCb) {
    selectAllCb.checked = false;
    selectAllCb.indeterminate = false;
  }
  document.querySelectorAll(".inventory-item-checkbox").forEach(cb => {
    cb.checked = false;
  });
  updateInventoryBatchBar();
}

function updateInventoryBatchBar() {
  const bar = document.getElementById("inventory-batch-bar");
  const countEl = document.getElementById("inventory-batch-count");
  if (!bar) return;

  const count = selectedInventoryIds.size;
  if (count > 0) {
    if (countEl) countEl.textContent = `${count} produk dipilih`;
    bar.classList.remove("hidden");
    bar.classList.add("flex");
  } else {
    bar.classList.add("hidden");
    bar.classList.remove("flex");
  }
}

function renderInventoryTable() {
  const tbody = document.getElementById("inventory-table-body");
  const searchInput = document.getElementById("inventory-search-input");
  if (!tbody) return;

  const isAuth = typeof isCurrentUserAuthorizedForFinancials === "function" ? isCurrentUserAuthorizedForFinancials() : true;

  const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
  let filtered = pos.products.filter(p => !query || p.name.toLowerCase().includes(query) || p.barcode.includes(query));
  filtered = sortInventoryList(filtered, inventorySortBy);

  tbody.innerHTML = filtered.map((p, idx) => {
    const isLow = p.stock <= p.minStock;
    const isOut = p.stock <= 0;
    const margin = Math.round(((p.price - p.costPrice) / p.price) * 100);
    const isChecked = selectedInventoryIds.has(p.id) || selectedInventoryIds.has(String(p.id));

    return `
      <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs ${isChecked ? 'bg-amber-50/60' : ''}">
        <td class="py-2 px-3 text-center">
          <input type="checkbox" class="inventory-item-checkbox w-4 h-4 rounded border-slate-300 text-alfa-red focus:ring-alfa-red cursor-pointer" data-id="${p.id}" ${isChecked ? 'checked' : ''} onchange="toggleProductSelection('${p.id}', this.checked)">
        </td>
        <td class="hidden sm:table-cell py-2 px-3 font-mono text-slate-400">${idx + 1}</td>
        <td class="py-2 px-2.5 sm:px-3">
          <div class="flex items-center gap-2">
            <img src="${getProductImageSrc(p)}" alt="${p.name}" class="w-8 h-8 rounded-lg object-cover flex-shrink-0 border border-slate-200" loading="lazy" onerror="this.onerror=null; this.src=getProductThumbnailSvg('${(p.category || '').replace(/'/g, "\\'")}', '${(p.name || '').replace(/'/g, "\\'")}');">
            <div class="min-w-0">
              <div class="font-bold text-slate-800 truncate max-w-[140px] sm:max-w-xs">${p.name}</div>
              <div class="text-[10px] text-slate-400 font-mono">${p.barcode} • ${p.category}</div>
            </div>
          </div>
        </td>
        <td class="hidden md:table-cell py-2 px-3 font-mono ${isAuth ? 'text-slate-600' : 'text-slate-400'}" title="${isAuth ? 'Harga Beli (HPP)' : 'Harga beli (HPP) disensor untuk kasir'}">
          ${isAuth ? formatRupiah(p.costPrice) : '••••••'}
        </td>
        <td class="py-2 px-2.5 sm:px-3 font-mono font-bold text-slate-900">
          ${formatRupiah(p.price)}
          ${isAuth ? `<span class="block text-[10px] text-emerald-600 font-bold">+${margin}%</span>` : ''}
        </td>
        <td class="py-2 px-2 sm:px-3 text-center">
          <span class="font-black text-xs ${isOut ? 'text-rose-600' : isLow ? 'text-amber-600' : 'text-slate-800'}">
            ${p.stock} ${p.unit}
          </span>
        </td>
        <td class="py-2 px-2 sm:px-3 text-right">
          <div class="flex items-center justify-end gap-1">
            <button onclick="addToCart('${p.id}')" class="px-2 py-1 bg-alfa-red hover:bg-red-700 text-white rounded-lg font-bold text-[11px] shadow-2xs cursor-pointer" title="Tambah ke Keranjang Kasir">
              + Kasir
            </button>
            <button onclick="openSinglePrintModal('${p.id}')" class="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg font-bold text-[11px] cursor-pointer" title="Cetak Label Rak & Stiker Barcode Produk Ini">
              🏷️
            </button>
            <button onclick="openRepackModal('${p.id}')" class="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-lg font-bold text-[11px] cursor-pointer" title="Repacking dari Produk Ini (Bal/Dus -> Pcs)">
              🔄
            </button>
            <button onclick="openProductModal('${p.id}')" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg font-bold text-[11px] cursor-pointer" title="Edit Produk">
              ✏️
            </button>
            <button onclick="deleteProduct('${p.id}')" class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg font-bold text-[11px] cursor-pointer" title="Hapus Produk">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  updateInventorySelectAllCheckbox();
  updateInventoryBatchBar();
}

// ==========================================
// 8. MODUL TAMBAH / EDIT PRODUK & AUTO-KOMPRESI GAMBAR CANVAS
// ==========================================

// Fungsi Kompresi Gambar Berbasis HTML5 Canvas (Client-Side)
function compressImageFile(file, maxDimension = 400, quality = 0.75) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      return reject(new Error('File bukan gambar yang valid'));
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        let compressed = canvas.toDataURL('image/webp', quality);
        if (!compressed.startsWith('data:image/webp')) {
          compressed = canvas.toDataURL('image/jpeg', quality);
        }

        const origKb = (file.size / 1024).toFixed(1);
        const compKb = ((compressed.length * 0.75) / 1024).toFixed(1);
        const savings = Math.max(0, Math.round((1 - (compressed.length * 0.75) / file.size) * 100));

        resolve({
          dataUrl: compressed,
          origKb,
          compKb,
          savings,
          width,
          height
        });
      };
      img.onerror = () => reject(new Error('Gagal memuat gambar'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.readAsDataURL(file);
  });
}

// Handler Upload Gambar di Form Produk
async function handleProductImageUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const infoEl = document.getElementById("image-compression-info");
  if (infoEl) {
    infoEl.innerHTML = `⏳ <span class="font-bold text-amber-800">Sedang mengompresi gambar otomatis...</span>`;
    infoEl.className = "p-2 rounded-xl bg-amber-50 border border-amber-200 text-[11px] font-mono leading-tight";
  }

  try {
    const res = await compressImageFile(file, 400, 0.75);
    const preview = document.getElementById("product-image-preview");
    const dataInput = document.getElementById("product-form-image-data");

    if (preview) preview.src = res.dataUrl;
    if (dataInput) dataInput.value = res.dataUrl;

    if (infoEl) {
      infoEl.innerHTML = `✅ <span class="font-bold text-emerald-800">Kompresi Selesai!</span> ${res.origKb} KB ➔ <strong>${res.compKb} KB</strong> (Hemat ${res.savings}% kuota)`;
      infoEl.className = "p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-mono leading-tight";
    }
  } catch (err) {
    alert("Gagal memproses gambar: " + err.message);
    if (infoEl) {
      infoEl.innerHTML = `⚠️ <span class="text-rose-700 font-bold">Gagal mengompresi gambar. Coba file lain.</span>`;
      infoEl.className = "p-2 rounded-xl bg-rose-50 border border-rose-200 text-[11px] font-mono leading-tight";
    }
  }
}

let cameraStream = null;

// Pemicu Kamera Foto Produk (Otomatis deteksi HP / Desktop)
function triggerProductCamera() {
  const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
  const cameraInput = document.getElementById("product-camera-input");
  
  if (isMobile && cameraInput) {
    cameraInput.click();
  } else {
    openProductCameraModal();
  }
}

async function openProductCameraModal() {
  openModal("modal-camera-capture");
  const video = document.getElementById("camera-stream-video");
  const loading = document.getElementById("camera-loading-indicator");
  if (loading) loading.classList.remove("hidden");

  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Perangkat tidak mendukung akses kamera browser langsung.");
    }

    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    if (video) {
      video.srcObject = cameraStream;
      video.onloadedmetadata = () => {
        video.play();
        if (loading) loading.classList.add("hidden");
      };
    }
  } catch (err) {
    console.warn("Akses WebCam gagal/ditolak:", err);
    if (loading) loading.classList.add("hidden");
    closeProductCameraModal();
    // Fallback panggil input file kamera bawaan perangkat
    const cameraInput = document.getElementById("product-camera-input");
    if (cameraInput) {
      cameraInput.click();
    } else {
      alert("Tidak dapat mengakses kamera perangkat: " + err.message);
    }
  }
}

function closeProductCameraModal() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  const video = document.getElementById("camera-stream-video");
  if (video) video.srcObject = null;
  closeModal("modal-camera-capture");
}

async function captureProductPhotoFromWebcam() {
  const video = document.getElementById("camera-stream-video");
  const canvas = document.getElementById("camera-snapshot-canvas");
  if (!video || !canvas) return;

  const width = video.videoWidth || 640;
  const height = video.videoHeight || 480;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, width, height);

  canvas.toBlob(async (blob) => {
    if (!blob) {
      alert("Gagal memproses frame kamera.");
      return;
    }

    closeProductCameraModal();

    const infoEl = document.getElementById("image-compression-info");
    if (infoEl) {
      infoEl.innerHTML = `⏳ <span class="font-bold text-amber-800">Sedang mengompresi foto kamera...</span>`;
      infoEl.className = "p-2 rounded-xl bg-amber-50 border border-amber-200 text-[11px] font-mono leading-tight";
    }

    try {
      const res = await compressImageFile(blob, 400, 0.75);
      const preview = document.getElementById("product-image-preview");
      const dataInput = document.getElementById("product-form-image-data");

      if (preview) preview.src = res.dataUrl;
      if (dataInput) dataInput.value = res.dataUrl;

      if (infoEl) {
        infoEl.innerHTML = `✅ <span class="font-bold text-emerald-800">Foto Kamera Siap!</span> ${res.origKb} KB ➔ <strong>${res.compKb} KB</strong> (WebP)`;
        infoEl.className = "p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-mono leading-tight";
      }
      sfx.beep();
    } catch (err) {
      console.error(err);
      alert("Gagal mengompresi foto: " + err.message);
    }
  }, "image/jpeg", 0.9);
}

function clearProductImage() {
  const preview = document.getElementById("product-image-preview");
  const dataInput = document.getElementById("product-form-image-data");
  const fileInput = document.getElementById("product-file-input");
  const cameraInput = document.getElementById("product-camera-input");
  const infoEl = document.getElementById("image-compression-info");
  const catInput = document.getElementById("product-form-category");

  const genericSvg = typeof getProductThumbnailSvg === "function" 
    ? getProductThumbnailSvg(catInput ? catInput.value : "") 
    : "";
  if (preview) preview.src = genericSvg;
  if (dataInput) dataInput.value = "";
  if (fileInput) fileInput.value = "";
  if (cameraInput) cameraInput.value = "";
  if (infoEl) {
    infoEl.innerHTML = `💡 <span class="font-sans font-bold">Thumbnail Generik:</span> Menggunakan thumbnail kategori otomatis. Unggah foto produk jika ingin menampilkan foto riil.`;
    infoEl.className = "p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-[11px] font-mono leading-tight";
  }
}

function generateRandomBarcodeForForm() {
  const randNum = Math.floor(1000000 + Math.random() * 9000000);
  const barcode = `899${randNum}`;
  const input = document.getElementById("product-form-barcode");
  if (input) input.value = barcode;
}

function updateMarginPreview() {
  const cost = parseFloat(document.getElementById("product-form-cost")?.value) || 0;
  const price = parseFloat(document.getElementById("product-form-price")?.value) || 0;
  const profit = price - cost;
  const marginPct = price > 0 ? Math.round((profit / price) * 100) : 0;

  const nomEl = document.getElementById("product-margin-nominal");
  const pctEl = document.getElementById("product-margin-pct");
  const box = document.getElementById("product-margin-preview");

  if (nomEl) nomEl.textContent = `Laba: ${profit >= 0 ? '+' : ''}${formatRupiah(profit)}`;
  if (pctEl) pctEl.textContent = `(${marginPct}%)`;

  if (box) {
    if (profit < 0) {
      box.className = "px-3 py-2 bg-rose-100 border border-rose-300 rounded-xl text-xs font-black text-rose-800 flex items-center justify-between";
    } else {
      box.className = "px-3 py-2 bg-emerald-100/80 border border-emerald-300 rounded-xl text-xs font-black text-emerald-800 flex items-center justify-between";
    }
  }
}

function toggleProductFormMultiUnit(isChecked) {
  const fields = document.getElementById("product-form-multi-unit-fields");
  if (fields) {
    fields.classList.toggle("hidden", !isChecked);
  }
  if (isChecked) {
    const basePrice = parseFloat(document.getElementById("product-form-price")?.value) || 0;
    const lusinInput = document.getElementById("product-form-lusin-price");
    const dusPriceInput = document.getElementById("product-form-dus-price");
    const dusQtyInput = document.getElementById("product-form-dus-qty");
    const dusQty = parseInt(dusQtyInput?.value, 10) || 24;

    if (lusinInput && !lusinInput.value && basePrice > 0) {
      lusinInput.value = Math.round(basePrice * 12 * 0.90);
    }
    if (dusPriceInput && !dusPriceInput.value && basePrice > 0) {
      dusPriceInput.value = Math.round(basePrice * dusQty * 0.85);
    }
  }
}

function openProductModal(productId = null) {
  // Akses langsung tambah / edit produk tanpa hambatan PIN

  const title = document.getElementById("product-modal-title");
  const idInput = document.getElementById("product-form-id");
  const nameInput = document.getElementById("product-form-name");
  const barcodeInput = document.getElementById("product-form-barcode");
  const catInput = document.getElementById("product-form-category");
  const costInput = document.getElementById("product-form-cost");
  const priceInput = document.getElementById("product-form-price");
  const stockInput = document.getElementById("product-form-stock");
  const minStockInput = document.getElementById("product-form-min-stock");
  const unitInput = document.getElementById("product-form-unit");
  const descInput = document.getElementById("product-form-description");
  const dataInput = document.getElementById("product-form-image-data");
  const preview = document.getElementById("product-image-preview");
  const infoEl = document.getElementById("image-compression-info");
  const stockInfoEl = document.getElementById("product-form-current-stock-info");
  const stockValEl = document.getElementById("product-form-current-stock-val");

  const isFinancialAuth = typeof isCurrentUserAuthorizedForFinancials === "function" ? isCurrentUserAuthorizedForFinancials() : true;
  if (costInput) {
    if (isFinancialAuth) {
      costInput.type = "number";
      costInput.placeholder = "0";
      costInput.title = "Harga Modal / Beli (HPP)";
    } else {
      costInput.type = "password";
      costInput.placeholder = "••••••";
      costInput.title = "Harga modal (HPP) disensor untuk kasir";
    }
  }

  const wholesaleCheck = document.getElementById("product-form-has-wholesale");
  const wholesaleMinQtyInp = document.getElementById("product-form-wholesale-min-qty");
  const wholesalePriceInp = document.getElementById("product-form-wholesale-price");
  const wholesaleBarcodeInp = document.getElementById("product-form-wholesale-barcode");

  if (productId) {
    const p = pos.products.find(prod => prod.id === productId);
    if (!p) return;

    if (title) title.textContent = `Edit Produk (${p.name})`;
    if (idInput) idInput.value = p.id;
    if (nameInput) nameInput.value = p.name;
    if (barcodeInput) barcodeInput.value = p.barcode;
    if (catInput) catInput.value = p.category;
    if (costInput) costInput.value = p.costPrice;
    if (priceInput) priceInput.value = p.price;
    if (stockInput) stockInput.value = p.stock;
    if (stockValEl) stockValEl.textContent = `${p.stock} ${p.unit || 'Pcs'}`;
    if (stockInfoEl) stockInfoEl.classList.remove("hidden");
    if (minStockInput) minStockInput.value = p.minStock;
    if (unitInput) unitInput.value = p.unit || "Pcs";
    if (descInput) descInput.value = p.description || "";
    if (dataInput) dataInput.value = p.image || "";
    if (preview) preview.src = getProductImageSrc(p);
    if (infoEl) {
      if (p.image) {
        infoEl.innerHTML = `💡 <span class="font-sans font-bold">Foto Produk Terpasang:</span> Pilih file baru jika ingin mengganti foto produk ini.`;
        infoEl.className = "p-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-[11px] font-mono leading-tight";
      } else {
        infoEl.innerHTML = `💡 <span class="font-sans font-bold">Thumbnail Kategori:</span> Produk belum memiliki foto khusus. Menggunakan thumbnail otomatis.`;
        infoEl.className = "p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-[11px] font-mono leading-tight";
      }
    }

    const hasWS = !!(p.hasWholesale || (p.hasMultiUnit && (p.lusinPrice || p.dusPrice)));
    if (wholesaleCheck) wholesaleCheck.checked = hasWS;
    toggleProductFormWholesale(hasWS);
    if (wholesaleMinQtyInp) wholesaleMinQtyInp.value = p.wholesaleMinQty || (p.hasMultiUnit ? 12 : "");
    if (wholesalePriceInp) wholesalePriceInp.value = p.wholesalePrice || (p.hasMultiUnit ? (p.lusinPrice ? Math.round(p.lusinPrice / 12) : Math.round(p.price * 0.9)) : "");
    if (wholesaleBarcodeInp) wholesaleBarcodeInp.value = p.wholesaleBarcode || p.barcodeDus || p.barcodeLusin || "";
  } else {
    if (title) title.textContent = "Tambah Produk Baru";
    if (idInput) idInput.value = "";
    if (nameInput) nameInput.value = "";
    if (barcodeInput) barcodeInput.value = "";
    generateRandomBarcodeForForm();
    if (catInput) catInput.value = "Makanan Ringan & Biskuit";
    if (costInput) costInput.value = "";
    if (priceInput) priceInput.value = "";
    if (stockInput) stockInput.value = 0;
    if (stockInfoEl) stockInfoEl.classList.add("hidden");
    if (minStockInput) minStockInput.value = 5;
    if (unitInput) unitInput.value = "Pcs";
    if (descInput) descInput.value = "";
    if (dataInput) dataInput.value = "";
    if (preview) preview.src = getProductThumbnailSvg("Makanan Ringan & Biskuit");
    if (infoEl) {
      infoEl.innerHTML = `💡 <span class="font-sans font-bold">Thumbnail Generik:</span> Menggunakan thumbnail kategori otomatis. Unggah foto produk jika ingin menampilkan foto riil.`;
      infoEl.className = "p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-[11px] font-mono leading-tight";
    }
    if (wholesaleCheck) wholesaleCheck.checked = false;
    toggleProductFormWholesale(false);
    if (wholesaleMinQtyInp) wholesaleMinQtyInp.value = "";
    if (wholesalePriceInp) wholesalePriceInp.value = "";
    if (wholesaleBarcodeInp) wholesaleBarcodeInp.value = "";
  }

  updateMarginPreview();
  openModal("modal-product-form");
  setTimeout(() => nameInput?.focus(), 150);
}

function handleSaveProductForm(event) {
  event.preventDefault();

  const id = document.getElementById("product-form-id")?.value;
  const name = document.getElementById("product-form-name")?.value.trim();
  const barcode = document.getElementById("product-form-barcode")?.value.trim();
  const category = document.getElementById("product-form-category")?.value.trim();
  const costPrice = parseFloat(document.getElementById("product-form-cost")?.value) || 0;
  const price = parseFloat(document.getElementById("product-form-price")?.value) || 0;
  const minStock = parseInt(document.getElementById("product-form-min-stock")?.value, 10) || 5;
  const unit = document.getElementById("product-form-unit")?.value.trim() || "Pcs";
  const description = document.getElementById("product-form-description")?.value.trim() || "";
  const image = document.getElementById("product-form-image-data")?.value || "https://images.unsplash.com/photo-1621996346565-e3d5d6281290?w=400&auto=format&fit=crop&q=60";

  const hasWholesale = !!document.getElementById("product-form-has-wholesale")?.checked;
  const wholesaleMinQty = parseInt(document.getElementById("product-form-wholesale-min-qty")?.value, 10) || 0;
  const wholesalePrice = parseFloat(document.getElementById("product-form-wholesale-price")?.value) || 0;
  const wholesaleBarcode = document.getElementById("product-form-wholesale-barcode")?.value.trim() || "";

  if (!name || !barcode) {
    alert("Harap isi Nama Produk dan Barcode!");
    return;
  }

  const dup = pos.products.find(p => p.barcode === barcode && p.id !== id);
  if (dup) {
    alert(`Barcode/PLU ${barcode} sudah digunakan oleh produk "${dup.name}"! Harap gunakan barcode unik.`);
    return;
  }

  if (id) {
    const prod = pos.products.find(p => p.id === id);
    if (prod) {
      prod.name = name;
      prod.barcode = barcode;
      prod.category = category;
      prod.costPrice = costPrice;
      prod.price = price;
      prod.minStock = minStock;
      prod.unit = unit;
      prod.description = description;
      prod.image = image;
      prod.hasWholesale = hasWholesale;
      prod.wholesaleMinQty = hasWholesale ? wholesaleMinQty : 0;
      prod.wholesalePrice = hasWholesale ? wholesalePrice : 0;
      prod.wholesaleBarcode = hasWholesale ? wholesaleBarcode : "";
    }
  } else {
    // Validasi Batas Maksimal 10 SKU untuk Mode Trial
    if (typeof isTrialLimitReached === "function" && isTrialLimitReached("SKU")) {
      showTrialUpgradeModal("SKU");
      return;
    }
    const newId = `PRD-${String(pos.products.length + 1).padStart(3, '0')}`;
    const newProduct = {
      id: newId,
      barcode,
      name,
      category,
      costPrice,
      price,
      stock: 0,
      minStock,
      unit,
      weight: "150g",
      emoji: "📦",
      image,
      badge: "Baru",
      description,
      hasWholesale,
      wholesaleMinQty: hasWholesale ? wholesaleMinQty : 0,
      wholesalePrice: hasWholesale ? wholesalePrice : 0,
      wholesaleBarcode: hasWholesale ? wholesaleBarcode : ""
    };
    pos.products.unshift(newProduct);
  }

  pos.saveProducts();
  renderInventoryTable();
  closeModal("modal-product-form");
  showToast(`Produk "${name}" berhasil disimpan!`, "success");
  sfx.success();
}

function deleteProduct(productId) {
  if (typeof hasPermissionForAction === "function" && !hasPermissionForAction(pos.currentUser, "MANAGE_PRODUCTS")) {
    requestSupervisorAuth("MANAGE_PRODUCTS", "Otorisasi Menghapus Produk dari Master Barang (Khusus Pejabat Toko)", () => {
      deleteProduct(productId);
    });
    return;
  }

  const p = pos.products.find(prod => prod.id === productId);
  if (!p) return;

  if (!confirm(`Apakah Anda yakin ingin menghapus produk "${p.name}" (PLU: ${p.barcode}) dari katalog toko?`)) {
    return;
  }

  pos.products = pos.products.filter(prod => prod.id !== productId);
  pos.saveProducts();
  renderInventoryTable();
  showToast(`Produk "${p.name}" berhasil dihapus dari katalog`, "info");
}

function toggleProductFormWholesale(active) {
  const fields = document.getElementById("product-form-wholesale-fields");
  if (fields) {
    fields.classList.toggle("hidden", !active);
  }
}

// Backward-compat alias
function toggleProductFormMultiUnit(active) {
  toggleProductFormWholesale(active);
}

// ============================================================
// PEMINDAI BARCODE KAMERA (LIVE BARCODE DETECTOR)
// ============================================================
let inventoryHtml5QrCode = null;
let barcodeScannerStream = null;
let barcodeScannerAnimationId = null;
let barcodeScannerTargetInputId = 'product-form-barcode';

async function openBarcodeCameraScanner(targetInputId = 'product-form-barcode') {
  // Cek dukungan akses kamera browser
  const hasMediaDevices = Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function");
  if (!hasMediaDevices && location.protocol === "http:") {
    if (location.hostname === "2.27.165.72" && (!location.port || location.port === "80")) {
      const targetUrl = "https://2.27.165.72.sslip.io" + location.pathname + location.search + location.hash;
      showToast("Akses kamera membutuhkan koneksi aman (HTTPS). Mengalihkan...", "info", 3000);
      setTimeout(() => {
        location.href = targetUrl;
      }, 800);
      return;
    } else {
      showToast("Akses kamera membutuhkan HTTPS atau localhost pada browser Anda.", "warning", 4000);
    }
  }

  barcodeScannerTargetInputId = targetInputId;
  openModal('modal-barcode-camera-scanner');

  const loading = document.getElementById('barcode-scanner-loading');
  const statusEl = document.getElementById('barcode-scanner-status');
  const video = document.getElementById('barcode-scanner-video');
  const readerEl = document.getElementById('barcode-scanner-reader');

  if (loading) loading.classList.remove('hidden');
  if (statusEl) statusEl.textContent = 'Menyiapkan kamera...';
  if (video) video.classList.add('hidden');

  // Berikan jeda kecil agar DOM modal selesai ter-render
  await new Promise(resolve => setTimeout(resolve, 120));

  // Prioritas 1: Html5Qrcode (ZXing decoder lintas browser untuk EAN-13, UPC, Code 128, QR, dll.)
  if (typeof Html5Qrcode !== "undefined") {
    try {
      if (!inventoryHtml5QrCode) {
        const formats = (typeof Html5QrcodeSupportedFormats !== "undefined") ? [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.QR_CODE
        ] : undefined;

        inventoryHtml5QrCode = new Html5Qrcode("barcode-scanner-reader", {
          formatsToSupport: formats,
          verbose: false
        });
      }

      let availableCameras = [];
      try {
        availableCameras = await Html5Qrcode.getCameras() || [];
      } catch (camErr) {
        console.warn("Enumerasi kamera inventory fallback:", camErr);
      }

      // Susun konfigurasi kamera bertahap
      const configsToTry = [];
      if (availableCameras.length > 0) {
        const backCam = availableCameras.find(c => /back|rear|belakang|environment/i.test(c.label));
        if (backCam) configsToTry.push(backCam.id);
      }
      configsToTry.push({ facingMode: "environment" });
      configsToTry.push({ facingMode: "user" });
      if (availableCameras.length > 0) {
        configsToTry.push(availableCameras[0].id);
      }

      let started = false;
      let lastErr = null;
      for (const cfg of configsToTry) {
        try {
          await inventoryHtml5QrCode.start(
            cfg,
            {
              fps: 20,
              qrbox: (w, h) => {
                const bw = Math.min(Math.round(w * 0.9), 350);
                const bh = Math.min(Math.round(h * 0.65), 200);
                return { width: Math.max(bw, 200), height: Math.max(bh, 120) };
              },
              aspectRatio: 1.333333
            },
            (decodedText) => {
              onInventoryBarcodeScanned(decodedText);
            },
            () => {}
          );
          started = true;
          break;
        } catch (startErr) {
          lastErr = startErr;
          console.warn("Gagal start inventory camera dengan config:", cfg, startErr);
          try { await inventoryHtml5QrCode.stop(); } catch(e){}
        }
      }

      if (started) {
        if (loading) loading.classList.add('hidden');
        if (statusEl) statusEl.textContent = 'Arahkan barcode ke kotak pemindai...';
        return;
      } else {
        throw lastErr || new Error("Gagal mengaktifkan kamera inventory.");
      }
    } catch (err) {
      console.warn("Html5Qrcode gagal di inventory, beralih ke native fallback:", err);
      if (inventoryHtml5QrCode) {
        try { await inventoryHtml5QrCode.clear(); } catch(e){}
        inventoryHtml5QrCode = null;
      }
    }
  }

  // Prioritas 2: Fallback native BarcodeDetector + getUserMedia
  startInventoryNativeCameraFallback();
}

async function startInventoryNativeCameraFallback() {
  const video = document.getElementById('barcode-scanner-video');
  const loading = document.getElementById('barcode-scanner-loading');
  const statusEl = document.getElementById('barcode-scanner-status');

  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Perangkat atau browser tidak mendukung akses kamera langsung.");
    }

    if (video) video.classList.remove('hidden');

    barcodeScannerStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    if (video) {
      video.srcObject = barcodeScannerStream;
      video.onloadedmetadata = () => {
        video.play();
        if (loading) loading.classList.add('hidden');
        if (statusEl) statusEl.textContent = 'Arahkan barcode ke kamera...';
        startBarcodeScannerDetection(video);
      };
    }
  } catch (err) {
    console.warn("Kamera barcode gagal diakses:", err);
    if (loading) loading.classList.add('hidden');
    closeBarcodeCameraScanner();
    showToast("Gagal mengakses kamera: " + (err.message || err), "error");
  }
}

function onInventoryBarcodeScanned(detectedCode) {
  const code = (detectedCode || "").trim();
  if (!code) return;

  const targetInput = document.getElementById(barcodeScannerTargetInputId);
  if (targetInput) {
    targetInput.value = code;
    targetInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (typeof sfx !== 'undefined' && sfx.beep) sfx.beep();

  if (barcodeScannerTargetInputId === 'inventory-search-input') {
    if (typeof renderInventoryTable === 'function') {
      renderInventoryTable();
    }
    const found = (pos.products || []).some(p => 
      p.barcode === code || (p.id && p.id.toLowerCase() === code.toLowerCase())
    );
    if (found) {
      showToast(`⚡ Produk dengan barcode ${code} ditemukan!`, "success");
    } else {
      showToast(`Barcode ${code} belum ada di katalog. Klik Tambah Produk untuk mendaftarkan.`, "info", 5000);
    }
  } else if (barcodeScannerTargetInputId === 'repack-source-search' || barcodeScannerTargetInputId === 'repack-target-search') {
    const targetType = barcodeScannerTargetInputId === 'repack-source-search' ? 'source' : 'target';
    if (typeof filterRepackProducts === 'function') {
      filterRepackProducts(targetType, code);
    }
  } else if (barcodeScannerTargetInputId === 'lpb-product-search') {
    if (typeof handleLpbBarcodeDetected === 'function') {
      handleLpbBarcodeDetected(code);
    } else if (typeof handleLpbProductSearchInput === 'function') {
      handleLpbProductSearchInput(code);
    }
  } else {
    showToast(`⚡ Barcode terdeteksi: ${code}`, "success");
  }

  closeBarcodeCameraScanner();
}

async function closeBarcodeCameraScanner() {
  if (barcodeScannerAnimationId) {
    cancelAnimationFrame(barcodeScannerAnimationId);
    barcodeScannerAnimationId = null;
  }
  if (barcodeScannerStream) {
    try {
      barcodeScannerStream.getTracks().forEach(track => track.stop());
    } catch (e) {}
    barcodeScannerStream = null;
  }
  if (inventoryHtml5QrCode) {
    try {
      if (inventoryHtml5QrCode.isScanning) {
        await inventoryHtml5QrCode.stop();
      }
      await inventoryHtml5QrCode.clear();
    } catch (e) {
      console.warn("Gagal menghentikan inventoryHtml5QrCode:", e);
    }
    inventoryHtml5QrCode = null;
  }
  const video = document.getElementById('barcode-scanner-video');
  if (video) {
    video.srcObject = null;
    video.classList.add('hidden');
  }
  const reader = document.getElementById('barcode-scanner-reader');
  if (reader) reader.innerHTML = '';

  closeModal('modal-barcode-camera-scanner');
}

async function startBarcodeScannerDetection(video) {
  if (!('BarcodeDetector' in window)) {
    const statusEl = document.getElementById('barcode-scanner-status');
    if (statusEl) statusEl.textContent = "Catatan: Browser ini tidak mendukung deteksi barcode kamera otomatis.";
    return;
  }

  try {
    const detector = new window.BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code']
    });

    async function scanLoop() {
      if (!barcodeScannerStream) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        try {
          const barcodes = await detector.detect(video);
          if (barcodes && barcodes.length > 0) {
            const detectedCode = barcodes[0].rawValue.trim();
            if (detectedCode) {
              onInventoryBarcodeScanned(detectedCode);
              return;
            }
          }
        } catch (e) {
          // ignore frame error
        }
      }
      barcodeScannerAnimationId = requestAnimationFrame(scanLoop);
    }

    barcodeScannerAnimationId = requestAnimationFrame(scanLoop);
  } catch (err) {
    console.warn("BarcodeDetector error:", err);
  }
}

// =========================================================
// 10. GENERATOR BARCODE CODE 128 (PURE JS SVG VECTOR)
// Standar ritel 1D ultra-tajam pada printer thermal 203 DPI
// =========================================================

const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
];

function generateCode128SVG(rawText, options = {}) {
  const text = String(rawText || '').trim();
  if (!text) return '';

  const height = options.height || 30;
  const className = options.className || '';

  // Code 128 Set B encoding (ASCII 32 - 126)
  const indices = [104]; // Start B
  let checksum = 104;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i) - 32;
    const validCode = (code >= 0 && code <= 95) ? code : 0;
    indices.push(validCode);
    checksum += (i + 1) * validCode;
  }

  checksum = checksum % 103;
  indices.push(checksum);
  indices.push(106); // Stop symbol (106)

  // 10 modules quiet zone pada sisi kiri
  let currentX = 10;
  let rects = '';

  for (let idx of indices) {
    const pattern = CODE128_PATTERNS[idx];
    if (!pattern) continue;
    let isBar = true;
    for (let char of pattern) {
      const width = parseInt(char, 10);
      if (isBar) {
        rects += `<rect x="${currentX}" y="0" width="${width}" height="${height}" fill="#000000" shape-rendering="crispEdges"/>`;
      }
      currentX += width;
      isBar = !isBar;
    }
  }

  const totalWidth = currentX + 10; // +10 quiet zone sisi kanan

  return `<svg class="${className}" viewBox="0 0 ${totalWidth} ${height}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
}

// Format mata uang sederhana (cth: 12500 -> "12.500")
function formatRupiahSimple(num) {
  if (typeof num !== 'number') num = parseFloat(num) || 0;
  return num.toLocaleString('id-ID');
}

// =========================================================
// 11. SISTEM CETAK LABEL GONDOLA & STIKER SNACK (DUAL-MODE)
// =========================================================

let currentLabelMode = 'shelf'; // 'shelf' | 'sticker'
let currentLabelFormat = 'thermal-58'; // 'thermal-58' | 'thermal-80' | 'sticker-50x30' | 'a4-grid'

function selectAllLabelsForPrinting() {
  if (pos && pos.products && pos.products.length > 0) {
    pos.products.forEach(p => {
      selectedInventoryIds.add(p.id);
      selectedInventoryIds.add(String(p.id));
    });
    updateInventorySelectAllCheckbox();
    updateInventoryBatchBar();
    renderInventoryTable();
    renderLabelPreview();
    showToast(`Memilih seluruh ${pos.products.length} produk katalog untuk dicetak`, "info");
  }
}

function clearLabelsSelection() {
  selectedInventoryIds.clear();
  updateInventorySelectAllCheckbox();
  updateInventoryBatchBar();
  renderInventoryTable();
  renderLabelPreview();
  showToast("Pilihan produk label dikosongkan", "info");
}

function openBatchPrintModal(mode = 'shelf') {
  currentLabelMode = mode;

  // Jika belum ada produk yang dicentang, pilih semua produk secara default agar langsung ada preview
  if (selectedInventoryIds.size === 0 && pos.products && pos.products.length > 0) {
    pos.products.forEach(p => {
      selectedInventoryIds.add(p.id);
      selectedInventoryIds.add(String(p.id));
    });
    updateInventorySelectAllCheckbox();
    updateInventoryBatchBar();
    renderInventoryTable();
  }

  updateLabelModeButtons();
  openModal('modal-print-label');

  const formatSelect = document.getElementById('label-print-format');
  if (formatSelect) {
    // Sesuaikan default format yang pas untuk mode
    if (mode === 'sticker') {
      currentLabelFormat = 'sticker-50x30';
    } else {
      currentLabelFormat = 'thermal-58';
    }
    formatSelect.value = currentLabelFormat;
  }

  renderLabelPreview();
}

function openSinglePrintModal(productId) {
  selectedInventoryIds.clear();
  selectedInventoryIds.add(productId);
  selectedInventoryIds.add(String(productId));
  updateInventorySelectAllCheckbox();
  updateInventoryBatchBar();
  renderInventoryTable();
  openBatchPrintModal('shelf');
}

function switchLabelMode(mode) {
  currentLabelMode = mode;
  updateLabelModeButtons();
  
  // Rekomendasikan format printer yang ideal
  const formatSelect = document.getElementById('label-print-format');
  if (formatSelect) {
    if (mode === 'sticker') {
      currentLabelFormat = 'sticker-50x30';
    } else {
      currentLabelFormat = 'thermal-58';
    }
    formatSelect.value = currentLabelFormat;
  }

  renderLabelPreview();
}

function updateLabelModeButtons() {
  const btnShelf = document.getElementById('btn-mode-shelf');
  const btnSticker = document.getElementById('btn-mode-sticker');

  if (currentLabelMode === 'shelf') {
    if (btnShelf) {
      btnShelf.className = "px-3 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer border-2 bg-alfa-red text-white border-alfa-red shadow-sm";
    }
    if (btnSticker) {
      btnSticker.className = "px-3 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer border-2 bg-white text-slate-700 border-slate-200 hover:border-slate-300";
    }
  } else {
    if (btnShelf) {
      btnShelf.className = "px-3 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer border-2 bg-white text-slate-700 border-slate-200 hover:border-slate-300";
    }
    if (btnSticker) {
      btnSticker.className = "px-3 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer border-2 bg-amber-500 text-slate-950 border-amber-500 shadow-sm";
    }
  }
}

function onLabelFormatChange() {
  const formatSelect = document.getElementById('label-print-format');
  if (formatSelect) {
    currentLabelFormat = formatSelect.value;
  }
  renderLabelPreview();
}

function setLabelCopies(copies) {
  const input = document.getElementById('label-print-copies');
  if (input) {
    input.value = copies;
    renderLabelPreview();
  }
}

function getSelectedProductsList() {
  if (!pos || !Array.isArray(pos.products)) return [];
  return pos.products.filter(p => selectedInventoryIds.has(p.id) || selectedInventoryIds.has(String(p.id)));
}

function generateSingleLabelHtml(product, mode) {
  if (!product) return '';
  const barcodeValue = String(product.barcode || product.sku || product.id || '00000000').trim();
  const shortDate = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' });
  const fullDate = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const storeName = ((pos && pos.settings && pos.settings.storeName) || 'TOKO SNACK BERKAH').toUpperCase();
  const plu = String(product.id || barcodeValue.slice(-4));
  const safeName = String(product.name || 'Produk Snack').replace(/"/g, '&quot;');
  const price = typeof product.price === 'number' ? product.price : (parseFloat(product.price) || 0);
  const priceStr = formatRupiahSimple(price);
  const wholesalePrice = typeof product.wholesalePrice === 'number' ? product.wholesalePrice : (parseFloat(product.wholesalePrice) || 0);
  const wholesaleMinQty = parseInt(product.wholesaleMinQty, 10) || 0;
  const hasWholesale = Boolean(wholesaleMinQty > 0 && wholesalePrice > 0 && wholesalePrice < price);

  if (mode === 'shelf') {
    // MODE 1: LABEL RAK HARGA & BARCODE TERMAKSIMALKAN (STANDAR RAK MINIMARKET)
    // Tinggi kompak 3,8 cm, lebar 6,8 cm
    const barcodeSvg = generateCode128SVG(barcodeValue, { height: hasWholesale ? 36 : 46, className: 'shelf-barcode-svg' });

    return `
      <div class="thermal-shelf-tag">
        <!-- Header: Identitas Toko & PLU/Tanggal -->
        <div class="shelf-tag-header">
          <span class="font-bold uppercase tracking-tight truncate max-w-[65%]">${storeName}</span>
          <span class="font-mono font-bold whitespace-nowrap">PLU: ${plu} • ${shortDate}</span>
        </div>

        <!-- Nama Produk (Tegas, Kondensed, Maksimal) -->
        <div class="shelf-tag-title" title="${safeName}">${product.name || 'Produk Snack'}</div>

        <!-- Area Tengah: Barcode Jumbo & Harga Tinggi (100% Ruang Terpakai) -->
        <div class="shelf-tag-body">
          <!-- Kiri: Barcode Jumbo -->
          <div class="shelf-barcode-container">
            ${barcodeSvg}
            <div class="shelf-barcode-text font-mono font-bold">${barcodeValue}</div>
          </div>

          <!-- Kanan: Harga Menjulang Tinggi -->
          <div class="shelf-price-container">
            <div class="flex items-baseline justify-between w-full">
              <span class="text-[6.5pt] font-black uppercase text-slate-800 tracking-wide">HARGA</span>
              <span class="shelf-tag-price-prefix font-bold">Rp</span>
            </div>
            <div class="shelf-tag-price-huge font-black tracking-tight ${priceStr.length > 7 ? 'text-[20pt]' : priceStr.length > 5 ? 'text-[23pt]' : 'text-[26pt]'}">${priceStr}</div>
            <div class="text-[6.5pt] font-black text-slate-700 uppercase">/ ${product.unit || 'Bungkus'}</div>
          </div>
        </div>

        <!-- Bawah: Banner Grosir Otomatis (Rapi & Bebas Overlap) -->
        ${hasWholesale ? `
          <div class="shelf-wholesale-banner">
            <span style="font-weight:900;">🔥 GROSIR ≥${wholesaleMinQty}:</span>
            <span style="font-weight:900; font-size:7pt;">@Rp ${formatRupiahSimple(wholesalePrice)}</span>
            <span style="font-size:5.5pt; font-weight:900; opacity:0.9;">HEMAT ${formatRupiahSimple(price - wholesalePrice)}</span>
          </div>
        ` : ''}
      </div>
    `;
  } else {
    // MODE 2: STIKER KEMASAN SNACK (REPACKING / BEBAS HARGA)
    // Ukuran 5,0 cm x 2,8 cm - BEBAS HARGA (hanya nama, barcode, netto/toko, garansi renyah)
    const barcodeSvg = generateCode128SVG(barcodeValue, { height: 26, className: 'snack-sticker-barcode-svg' });
    const nettoInfo = product.unit ? `Isi / Netto: ${product.unit} • ${storeName}` : storeName;

    return `
      <div class="thermal-snack-sticker">
        <div class="w-full">
          <div class="snack-sticker-name" title="${safeName}">${product.name || 'Snack Lezat'}</div>
          <div class="snack-sticker-netto truncate">${nettoInfo}</div>
        </div>
        <div class="w-full flex flex-col items-center justify-center my-auto">
          ${barcodeSvg}
          <div class="snack-sticker-barcode-text font-mono font-bold">${barcodeValue}</div>
        </div>
        <div class="snack-sticker-footer">
          <span>Renyah & Gurih</span>
          <span>•</span>
          <span>Tgl: ${shortDate}</span>
        </div>
      </div>
    `;
  }
}

function renderLabelPreview() {
  const container = document.getElementById('label-preview-container');
  const summaryEl = document.getElementById('label-print-products-summary');
  const totalCountEl = document.getElementById('label-print-total-count');
  const copiesInp = document.getElementById('label-print-copies');

  if (!container) return;

  const selectedProducts = getSelectedProductsList();
  const copies = parseInt(copiesInp ? copiesInp.value : 1, 10) || 1;

  if (summaryEl) {
    if (selectedProducts.length === 0) {
      summaryEl.innerHTML = `<span class="text-rose-600 font-bold">0 produk dipilih</span> <button onclick="selectAllLabelsForPrinting()" class="ml-1 text-[10px] text-alfa-blue underline cursor-pointer">Pilih Semua</button>`;
    } else if (selectedProducts.length === 1) {
      summaryEl.innerHTML = `<span class="truncate">1 Produk: ${selectedProducts[0].name}</span>`;
    } else {
      summaryEl.innerHTML = `<span class="truncate">${selectedProducts.length} Produk (${selectedProducts[0].name}...)</span>`;
    }
  }

  const totalLabels = selectedProducts.length * copies;
  if (totalCountEl) totalCountEl.textContent = totalLabels;

  if (selectedProducts.length === 0) {
    container.innerHTML = `
      <div class="text-center py-10 text-slate-400 font-bold text-xs bg-white rounded-2xl border border-dashed border-slate-300 p-6 w-full max-w-md">
        <span class="text-4xl block mb-2">🏷️</span>
        <div class="text-slate-700 font-black text-sm mb-1">Belum Ada Produk Dipilih</div>
        <p class="text-slate-500 text-[11px] mb-4">Centang produk dari tabel katalog, atau klik tombol di bawah untuk memilih seluruh produk toko sekaligus:</p>
        <button onclick="selectAllLabelsForPrinting()" class="px-4 py-2 bg-alfa-red hover:bg-red-700 text-white rounded-xl font-bold text-xs shadow-sm cursor-pointer transition">
          ✓ Pilih Seluruh Katalog Toko
        </button>
      </div>
    `;
    return;
  }

  // Tampilkan preview maksimal 12 label agar render layar tetap super cepat dan responsif
  const previewLimit = 12;
  let itemsHtml = [];
  let renderedCount = 0;

  for (const product of selectedProducts) {
    for (let c = 0; c < copies; c++) {
      renderedCount++;
      if (renderedCount <= previewLimit) {
        const singleHtml = generateSingleLabelHtml(product, currentLabelMode);
        itemsHtml.push(`
          <div class="print-label-item">
            ${singleHtml}
          </div>
        `);
      }
    }
  }

  let finalHtml = '';
  if (currentLabelFormat === 'a4-grid') {
    finalHtml = `<div class="labels-grid-container w-full" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:10px;">${itemsHtml.join('')}</div>`;
  } else if (currentLabelFormat === 'sticker-50x30') {
    finalHtml = `<div class="w-full flex flex-col items-center gap-3">${itemsHtml.map((h, i) => `
      <div class="relative w-full flex flex-col items-center">
        <span class="text-[9px] font-mono font-bold text-slate-400 mb-1">Stiker #${i + 1} (50x30mm)</span>
        ${h}
      </div>
    `).join('')}</div>`;
  } else {
    // Mode roll continuous: pisahkan dengan garis sobek pada preview
    finalHtml = itemsHtml.join('<div class="label-tear-line"><span>✂ GARIS POTONG</span></div>');
  }

  if (totalLabels > previewLimit) {
    finalHtml += `
      <div class="text-center py-2.5 text-[11px] font-bold text-slate-600 bg-white/95 rounded-xl px-4 mt-3 border border-slate-200 shadow-2xs">
        ⚡ + ${totalLabels - previewLimit} label berikutnya akan otomatis ikut dicetak saat tombol cetak ditekan.
      </div>
    `;
  }

  container.innerHTML = finalHtml;
}

function preparePrintableLabels() {
  const target = document.getElementById('printable-receipt-container');
  if (!target) return;

  const selectedProducts = getSelectedProductsList();
  const copiesInp = document.getElementById('label-print-copies');
  const copies = parseInt(copiesInp ? copiesInp.value : 1, 10) || 1;

  if (selectedProducts.length === 0) return;

  let itemsHtml = [];
  for (const product of selectedProducts) {
    for (let c = 0; c < copies; c++) {
      const singleHtml = generateSingleLabelHtml(product, currentLabelMode);
      itemsHtml.push(`
        <div class="print-label-item">
          ${singleHtml}
        </div>
      `);
    }
  }

  let fullHtml = '';
  if (currentLabelFormat === 'a4-grid') {
    fullHtml = `<div class="labels-grid-container">${itemsHtml.join('')}</div>`;
  } else if (currentLabelFormat === 'sticker-50x30') {
    // Setiap stiker langsung ganti halaman (die-cut label roll)
    fullHtml = itemsHtml.join('');
  } else {
    // Continuous roll (58mm / 80mm): sertakan garis sobek
    fullHtml = itemsHtml.join('<div class="label-tear-line"><span>✂ POTONG DI SINI</span></div>');
  }

  target.className = `print-label-mode print-format-${currentLabelFormat}`;
  target.innerHTML = fullHtml;
  target.classList.remove('hidden');
}

async function executePrintLabelsBluetooth() {
  const selectedProducts = getSelectedProductsList();
  if (selectedProducts.length === 0) {
    alert('Harap pilih minimal 1 produk untuk dicetak!\n\nAnda dapat mencentang produk pada tabel katalog atau klik Pilih Semua.');
    return;
  }
  const copiesInp = document.getElementById('label-print-copies');
  const copies = parseInt(copiesInp ? copiesInp.value : 1, 10) || 1;

  if (typeof printLabelsToBluetooth === 'function') {
    await printLabelsToBluetooth(selectedProducts, copies, currentLabelMode, currentLabelFormat);
  } else {
    alert('Modul driver printer Bluetooth belum siap. Silakan gunakan Dialog Print Sistem.');
  }
}

function executePrintLabelsSystem() {
  const selectedProducts = getSelectedProductsList();
  if (selectedProducts.length === 0) {
    alert('Harap pilih minimal 1 produk untuk dicetak!\n\nAnda dapat mencentang produk pada tabel katalog atau klik Pilih Semua.');
    return;
  }

  preparePrintableLabels();
  setTimeout(() => {
    window.print();
  }, 50);
}

function executePrintLabels() {
  if (typeof isBluetoothConnected === 'function' && isBluetoothConnected()) {
    executePrintLabelsBluetooth();
  } else {
    executePrintLabelsSystem();
  }
}

async function executePrintLabelsNativeFast() {
  const selectedProducts = getSelectedProductsList();
  if (selectedProducts.length === 0) {
    alert('Harap pilih minimal 1 produk untuk dicetak!\n\nAnda dapat mencentang produk pada tabel katalog atau klik Pilih Semua.');
    return;
  }
  const copiesInp = document.getElementById('label-print-copies');
  const copies = parseInt(copiesInp ? copiesInp.value : 1, 10) || 1;

  if (typeof printLabelsNativeFast === 'function') {
    await printLabelsNativeFast(selectedProducts, copies, currentLabelMode);
  } else if (typeof printLabelsToBluetooth === 'function') {
    await printLabelsToBluetooth(selectedProducts, copies, currentLabelMode, currentLabelFormat);
  } else {
    alert('Modul printer belum siap.');
  }
}
window.executePrintLabelsNativeFast = executePrintLabelsNativeFast;
