/**
 * SnackPOS - Dual Import Products Engine (Local Device & Supabase Cloud Master FMCG)
 * Mendukung File Excel (.xlsx, .xls), CSV, TSV, JSON, dan Katalog Master Cloud 1.000+ Produk Indonesia (Barcode 899)
 */

let pendingImportProducts = [];
let currentImportTab = "local";

// Buka Modal Impor Produk
function openImportModal() {
  if (typeof hasPermissionForAction === "function" && !hasPermissionForAction(pos.currentUser, "MANAGE_PRODUCTS")) {
    requestSupervisorAuth("MANAGE_PRODUCTS", "Otorisasi Impor Produk ke Master Barang (Khusus Pejabat Toko)", () => {
      openImportModal();
    });
    return;
  }
  const modal = document.getElementById("modal-import-products");
  if (!modal) return;
  modal.classList.remove("hidden");
  switchImportTab("local");
  resetLocalImportState();
}

// Tutup Modal Impor Produk
function closeImportModal() {
  const modal = document.getElementById("modal-import-products");
  if (modal) modal.classList.add("hidden");
  resetLocalImportState();
}

// Ganti Tab di Modal Impor
function switchImportTab(tab) {
  currentImportTab = tab;
  const tabBtnLocal = document.getElementById("import-tab-btn-local");
  const tabBtnCloud = document.getElementById("import-tab-btn-cloud");
  const sectionLocal = document.getElementById("import-section-local");
  const sectionCloud = document.getElementById("import-section-cloud");

  if (tab === "local") {
    if (tabBtnLocal) {
      tabBtnLocal.className = "flex-1 py-2.5 px-4 text-xs font-black rounded-xl bg-alfa-red text-white shadow-sm transition-all";
    }
    if (tabBtnCloud) {
      tabBtnCloud.className = "flex-1 py-2.5 px-4 text-xs font-bold rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all";
    }
    if (sectionLocal) sectionLocal.classList.remove("hidden");
    if (sectionCloud) sectionCloud.classList.add("hidden");
  } else {
    if (tabBtnLocal) {
      tabBtnLocal.className = "flex-1 py-2.5 px-4 text-xs font-bold rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all";
    }
    if (tabBtnCloud) {
      tabBtnCloud.className = "flex-1 py-2.5 px-4 text-xs font-black rounded-xl bg-blue-600 text-white shadow-sm transition-all";
    }
    if (sectionLocal) sectionLocal.classList.add("hidden");
    if (sectionCloud) sectionCloud.classList.remove("hidden");
  }
}

// Reset Form & Preview Impor Lokal
function resetLocalImportState() {
  pendingImportProducts = [];
  const fileInput = document.getElementById("import-file-input");
  if (fileInput) fileInput.value = "";
  const previewBox = document.getElementById("import-preview-box");
  if (previewBox) previewBox.classList.add("hidden");
  const btnProcess = document.getElementById("btn-process-local-import");
  if (btnProcess) {
    btnProcess.disabled = true;
    btnProcess.classList.add("opacity-50", "cursor-not-allowed");
  }
}

// Unduh Template Format CSV Resmi
function downloadProductTemplate() {
  const headers = ["Barcode", "Nama Produk", "Kategori", "Harga Modal", "Harga Jual", "Stok", "Satuan"];
  const sampleRows = [
    ["8998866200224", "Indomie Mi Goreng Spesial 85g", "Mie Instan & Cepat Saji", "2700", "3500", "0", "Bungkus"],
    ["8992745110013", "Danone Aqua Botol 600ml", "Minuman Segar & Kopi", "3200", "4500", "0", "Botol"],
    ["8992775210103", "Teh Pucuk Harum Melati 350ml", "Minuman Segar & Kopi", "3200", "4500", "0", "Botol"],
    ["8991001301117", "Chitato Sapi Panggang 68g", "Makanan Ringan & Biskuit", "9500", "12500", "0", "Bungkus"],
    ["8992775510101", "Bimoli Minyak Goreng 2L Pouch", "Sembako & Bumbu Dapur", "34000", "39500", "0", "Pouch 2L"],
    ["8999999052720", "Rinso Anti Noda Bubuk 1kg", "Kebersihan Rumah (Home Care)", "24000", "29000", "0", "Pack 1kg"],
    ["8999999510855", "Lifebuoy Sabun Mandi Total 10 110g", "Perawatan Tubuh (Personal Care)", "3500", "4800", "0", "Batang"],
    ["8997001101116", "Tolak Angin Cair Sidomuncul 15ml", "Kesehatan & Obat Bebas", "3800", "5000", "0", "Sachet"]
  ];

  let csvContent = "\uFEFF" + headers.join(",") + "\n";
  sampleRows.forEach(row => {
    csvContent += row.map(val => `"${val.replace(/"/g, '""')}"`).join(",") + "\n";
  });

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.setAttribute("download", "template_import_produk_minimarket.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  if (typeof showToast === "function") {
    showToast("📥 Template Excel/CSV berhasil diunduh!", "success");
  }
}

// Parser Baris CSV Mendukung Tanda Petik & Koma/Titik Koma
function parseCSVLine(line, delimiter = ",") {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Handle Upload File dari Device Pengguna
async function handleProductFileUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const fileName = file.name.toLowerCase();
  const previewBox = document.getElementById("import-preview-box");
  const previewBody = document.getElementById("import-preview-tbody");
  const previewCount = document.getElementById("import-preview-count");
  const btnProcess = document.getElementById("btn-process-local-import");

  try {
    let parsedProducts = [];

    if (fileName.endsWith(".json")) {
      // 1. Format JSON
      const text = await file.text();
      const rawJson = JSON.parse(text);
      if (Array.isArray(rawJson)) {
        parsedProducts = rawJson.map(normalizeProductRow).filter(Boolean);
      }
    } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      // 2. Format Excel via SheetJS
      if (typeof XLSX !== "undefined") {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
        parsedProducts = rawJson.map(normalizeProductRow).filter(Boolean);
      } else {
        alert("Pustaka pembaca file Excel (.xlsx) sedang memuat. Coba gunakan format .CSV untuk pemrosesan instan!");
        return;
      }
    } else {
      // 3. Format CSV / TSV / TXT
      const text = await file.text();
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) {
        alert("File CSV tidak memiliki data atau baris tidak mencukupi.");
        return;
      }

      // Deteksi delimiter (koma, titik koma, atau tab)
      const firstLine = lines[0];
      let delimiter = ",";
      if (firstLine.includes(";") && !firstLine.includes(",")) delimiter = ";";
      if (firstLine.includes("\t")) delimiter = "\t";

      const headers = parseCSVLine(firstLine, delimiter).map(h => h.toLowerCase().trim());

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i], delimiter);
        if (cols.length === 0 || (cols.length === 1 && !cols[0])) continue;

        const rowObj = {};
        headers.forEach((h, idx) => {
          rowObj[h] = cols[idx] !== undefined ? cols[idx] : "";
        });

        const prod = normalizeProductRow(rowObj, cols);
        if (prod) parsedProducts.push(prod);
      }
    }

    if (parsedProducts.length === 0) {
      alert("Tidak ada data produk valid yang berhasil dibaca. Pastikan terdapat kolom Barcode dan Nama Produk!");
      resetLocalImportState();
      return;
    }

    pendingImportProducts = parsedProducts;

    // Render Preview
    if (previewBox && previewBody && previewCount) {
      previewBox.classList.remove("hidden");
      previewCount.textContent = `${parsedProducts.length} Produk Ditemukan`;

      const previewRows = parsedProducts.slice(0, 6);
      previewBody.innerHTML = previewRows.map((p, idx) => `
        <tr class="border-b border-slate-100 text-slate-700 hover:bg-slate-50">
          <td class="py-2 px-3 text-[11px] font-mono text-slate-500">${idx + 1}</td>
          <td class="py-2 px-3 text-[11px] font-mono font-bold text-slate-800">${p.barcode}</td>
          <td class="py-2 px-3 text-xs font-bold text-slate-900 truncate max-w-[180px]">${p.name}</td>
          <td class="py-2 px-3 text-[11px] font-medium text-slate-600">${p.category}</td>
          <td class="py-2 px-3 text-xs font-bold text-slate-800 text-right">Rp ${(p.costPrice || 0).toLocaleString('id-ID')}</td>
          <td class="py-2 px-3 text-xs font-black text-emerald-600 text-right">Rp ${(p.price || 0).toLocaleString('id-ID')}</td>
          <td class="py-2 px-3 text-xs font-black text-purple-700 text-center">${p.stock} ${p.unit}</td>
        </tr>
      `).join("");

      if (parsedProducts.length > 6) {
        previewBody.innerHTML += `
          <tr>
            <td colspan="7" class="py-2 px-3 text-center text-xs italic text-slate-400 bg-slate-50">
              ... dan ${parsedProducts.length - 6} produk lainnya siap diimpor ke kasir ...
            </td>
          </tr>
        `;
      }
    }

    if (btnProcess) {
      btnProcess.disabled = false;
      btnProcess.classList.remove("opacity-50", "cursor-not-allowed");
      btnProcess.textContent = `🚀 Impor ${parsedProducts.length} Produk ke Kasir`;
    }

  } catch (err) {
    console.error("Gagal membaca file produk:", err);
    alert("Terjadi kesalahan saat membaca file: " + err.message);
    resetLocalImportState();
  }
}

// Normalisasi Objek Baris Produk
function normalizeProductRow(row, fallbackArray = null) {
  if (!row && !fallbackArray) return null;

  // Deteksi kunci kolom secara fleksibel
  const findVal = (keys) => {
    for (const k of Object.keys(row || {})) {
      const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const target of keys) {
        if (cleanK.includes(target)) return row[k];
      }
    }
    return "";
  };

  let barcode = findVal(["barcode", "plu", "kode", "code"]);
  let name = findVal(["name", "nama", "produk", "product", "item", "barang", "deskripsi"]);
  let category = findVal(["kategori", "category", "group", "jenis", "dept"]);
  let costPrice = findVal(["cost", "modal", "beli", "hbeli", "hpp"]);
  let price = findVal(["price", "jual", "hjual", "harga"]);
  let stock = findVal(["stock", "stok", "qty", "jumlah"]);
  let unit = findVal(["unit", "satuan", "uom"]);

  // Fallback ke posisi kolom jika header tidak terdeteksi
  if ((!barcode || !name) && fallbackArray && fallbackArray.length >= 2) {
    barcode = fallbackArray[0] || "";
    name = fallbackArray[1] || "";
    if (fallbackArray.length >= 3) category = fallbackArray[2] || "";
    if (fallbackArray.length >= 4) costPrice = fallbackArray[3] || "";
    if (fallbackArray.length >= 5) price = fallbackArray[4] || "";
    if (fallbackArray.length >= 6) stock = fallbackArray[5] || "";
    if (fallbackArray.length >= 7) unit = fallbackArray[6] || "";
  }

  barcode = String(barcode || "").trim();
  name = String(name || "").trim();

  // Jika nama ada tapi barcode kosong, buatkan barcode lokal
  if (!name) return null;
  if (!barcode) {
    barcode = "PRD" + Math.floor(1000000000 + Math.random() * 9000000000);
  }

  // Bersihkan angka harga & stok
  const cleanNumber = (val, defaultVal = 0) => {
    if (typeof val === "number") return val;
    if (!val) return defaultVal;
    const cleaned = String(val).replace(/[^0-9.-]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? defaultVal : num;
  };

  const parsedCost = cleanNumber(costPrice, 0);
  let parsedPrice = cleanNumber(price, 0);
  if (parsedPrice === 0 && parsedCost > 0) {
    // Estimasi margin standar 25% jika harga jual kosong
    parsedPrice = Math.round(parsedCost * 1.25 / 500) * 500;
  }
  const parsedStock = Math.max(0, parseInt(cleanNumber(stock, 0), 10));

  category = String(category || "Makanan Ringan & Biskuit").trim();
  unit = String(unit || "Pcs").trim();

  return {
    barcode,
    name,
    category,
    costPrice: parsedCost,
    price: parsedPrice,
    stock: parsedStock,
    minStock: 5,
    unit
  };
}

// Eksekusi Impor Data dari File Lokal ke Kasir
function executeLocalImport() {
  if (!pendingImportProducts || pendingImportProducts.length === 0) {
    alert("Tidak ada data produk yang siap diimpor.");
    return;
  }

  const conflictMode = document.querySelector('input[name="import-conflict-mode"]:checked')?.value || "update_keep_stock";
  applyProductsToStore(pendingImportProducts, conflictMode, "File Perangkat");
  closeImportModal();
}

// Unduh & Pasang Master FMCG Indonesia dari Supabase Cloud / Lokal
async function fetchAndApplyCloudCatalog(pkgType = "all") {
  const btn = event?.currentTarget;
  const originalText = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `⏳ <span>Mengunduh Data...</span>`;
  }

  try {
    let cloudProducts = [];

    // 1. Coba fetch dari Supabase REST API (Official Cloud)
    const supabaseUrl = (typeof cleanSupabaseUrl === "function" ? cleanSupabaseUrl(pos.settings.supabaseUrl) : "") || "https://zsjbiuwtjsnjxyvhwggz.supabase.co";
    const supabaseKey = (typeof cleanSupabaseKey === "function" ? cleanSupabaseKey(pos.settings.supabaseKey) : "") || "sb_publishable_cO81g3R2IpzniHuackKd_A_7YYe2T39";

    let fetchedFromCloud = false;
    if (navigator.onLine && supabaseUrl && supabaseKey) {
      try {
        const endpoint = `${supabaseUrl}/rest/v1/products?id=like.FMCG*&select=*&limit=1200`;
        const res = await fetch(endpoint, {
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`
          }
        });
        if (res.ok) {
          const raw = await res.json();
          if (Array.isArray(raw) && raw.length > 0) {
            cloudProducts = raw.map(r => ({
              barcode: r.barcode,
              name: r.name,
              category: r.category,
              costPrice: Number(r.cost_price) || 0,
              price: Number(r.price) || 0,
              stock: Number(r.stock) || 0,
              minStock: Number(r.min_stock) || 5,
              unit: r.unit || "Pcs"
            }));
            fetchedFromCloud = true;
          }
        }
      } catch (e) {
        console.warn("[CloudImport] Gagal fetch Supabase online, fallback ke katalog lokal bundled:", e);
      }
    }

    // 2. Fallback offline: Ambil dari data/fmcg_catalog.json lokal aplikasi
    if (!fetchedFromCloud || cloudProducts.length === 0) {
      try {
        const localRes = await fetch("data/fmcg_catalog.json");
        if (localRes.ok) {
          cloudProducts = await localRes.json();
        }
      } catch (localErr) {
        console.warn("[CloudImport] Gagal fetch local fmcg_catalog.json:", localErr);
      }
    }

    if (!cloudProducts || cloudProducts.length === 0) {
      alert("Gagal memuat master produk dari Cloud maupun lokal. Periksa koneksi internet Anda.");
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
      return;
    }

    // Filter berdasarkan jenis paket
    let filteredList = cloudProducts;
    let packageName = "Katalog Lengkap (1.000+ Produk)";

    if (pkgType === "sembako_mie") {
      filteredList = cloudProducts.filter(p => p.category === "Sembako & Bumbu Dapur" || p.category === "Mie Instan & Cepat Saji");
      packageName = "Paket Sembako & Mie Instan";
    } else if (pkgType === "snack_minuman") {
      filteredList = cloudProducts.filter(p => p.category === "Makanan Ringan & Biskuit" || p.category === "Minuman Segar & Kopi");
      packageName = "Paket Snack & Minuman Populer";
    } else if (pkgType === "home_personal") {
      filteredList = cloudProducts.filter(p => p.category === "Kebersihan Rumah (Home Care)" || p.category === "Perawatan Tubuh (Personal Care)");
      packageName = "Paket Toiletries & Kebersihan Rumah";
    } else if (pkgType === "kesehatan") {
      filteredList = cloudProducts.filter(p => p.category === "Kesehatan & Obat Bebas");
      packageName = "Paket Obat Bebas & Farmasi";
    }

    const conflictMode = document.querySelector('input[name="import-conflict-mode"]:checked')?.value || "update_keep_stock";
    applyProductsToStore(filteredList, conflictMode, packageName);
    closeImportModal();

  } catch (err) {
    console.error("Gagal impor paket master cloud:", err);
    alert("Terjadi kesalahan saat memproses data master: " + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
}

// Logika Penggabungan Produk ke Database Toko (pos.products)
function applyProductsToStore(newItems, conflictMode = "update_keep_stock", sourceLabel = "Impor") {
  if (!pos || !Array.isArray(pos.products)) return;

  let addedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  if (conflictMode === "replace_all") {
    // Timpa total seluruh produk
    const confirmed = confirm(`⚠️ PERINGATAN: Anda memilih mode 'Timpa Total'. Seluruh katalog produk toko yang ada saat ini akan DIHAPUS dan digantikan dengan ${newItems.length} produk baru. Lanjutkan?`);
    if (!confirmed) return;

    pos.products = newItems.map((p, idx) => ({
      id: `PRD-${(idx + 1).toString().padStart(4, '0')}`,
      barcode: String(p.barcode).trim(),
      name: p.name,
      category: p.category || "Makanan Ringan & Biskuit",
      costPrice: Number(p.costPrice) || 0,
      price: Number(p.price) || 0,
      stock: Number(p.stock) || 0,
      minStock: Number(p.minStock) || 5,
      unit: p.unit || "Pcs",
      image: p.image || null,
      description: p.description || null
    }));
    addedCount = pos.products.length;
  } else {
    // Map existing products by barcode and by ID
    const barcodeMap = new Map();
    pos.products.forEach((p, index) => {
      if (p.barcode) barcodeMap.set(String(p.barcode).trim(), index);
    });

    let nextIdIndex = pos.products.length + 1;

    newItems.forEach(item => {
      const bcode = String(item.barcode).trim();
      const existingIndex = barcodeMap.get(bcode);

      if (existingIndex !== undefined) {
        // Produk sudah ada
        if (conflictMode === "skip") {
          skippedCount++;
        } else {
          // Default: update_keep_stock (Perbarui data master, AMANKAN stok lokal toko!)
          const current = pos.products[existingIndex];
          current.name = item.name || current.name;
          current.category = item.category || current.category;
          if (item.costPrice > 0) current.costPrice = item.costPrice;
          if (item.price > 0) current.price = item.price;
          if (item.unit) current.unit = item.unit;
          // Pertahankan current.stock milik toko!
          updatedCount++;
        }
      } else {
        // Tambahkan sebagai produk baru
        const newId = `PRD-${nextIdIndex.toString().padStart(4, '0')}`;
        nextIdIndex++;
        const newProduct = {
          id: newId,
          barcode: bcode,
          name: item.name,
          category: item.category || "Makanan Ringan & Biskuit",
          costPrice: Number(item.costPrice) || 0,
          price: Number(item.price) || 0,
          stock: Number(item.stock) || 0,
          minStock: Number(item.minStock) || 5,
          unit: item.unit || "Pcs",
          image: item.image || null,
          description: item.description || null
        };
        pos.products.push(newProduct);
        barcodeMap.set(bcode, pos.products.length - 1);
        addedCount++;
      }
    });
  }

  // Simpan ke LocalStorage dan IndexedDB
  pos.saveProducts();

  // Render Ulang Tampilan Kasir
  if (typeof renderInventoryTable === "function") renderInventoryTable();
  if (typeof renderTouchGrid === "function") renderTouchGrid();
  if (typeof renderInventoryStats === "function") renderInventoryStats();

  let msg = `✅ Berhasil Impor dari ${sourceLabel}: ${addedCount} produk baru ditambahkan`;
  if (updatedCount > 0) msg += `, ${updatedCount} produk diperbarui (stok toko tetap aman)`;
  if (skippedCount > 0) msg += `, ${skippedCount} duplikat dilewati`;

  if (typeof showToast === "function") {
    showToast(msg, "success", 6000);
  } else {
    alert(msg);
  }
}

// Kosongkan Seluruh Produk Toko (Reset Bersih 0 Produk)
function clearAllStoreProducts() {
  const confirmed = confirm("🗑️ KONFIRMASI PENGOSONGAN KATALOG:\n\nApakah Anda yakin ingin menghapus SELURUH produk di kasir Anda?\n\nKatalog toko akan menjadi kosong (0 Produk) sehingga Anda bisa mengimpor daftar barang Anda sendiri. Tindakan ini tidak dapat dibatalkan!");
  if (!confirmed) return;

  pos.products = [];
  pos.saveProducts();

  if (typeof renderInventoryTable === "function") renderInventoryTable();
  if (typeof renderTouchGrid === "function") renderTouchGrid();
  if (typeof renderInventoryStats === "function") renderInventoryStats();

  if (typeof showToast === "function") {
    showToast("🗑️ Seluruh katalog produk toko telah dikosongkan (0 Produk).", "info", 5000);
  }
  closeImportModal();
}

// Muat Kembali Produk Contoh Awal (100 Snack Demo)
function loadStarterPackProducts() {
  if (typeof INITIAL_PRODUCTS === "undefined" || !Array.isArray(INITIAL_PRODUCTS)) {
    alert("Data produk contoh tidak ditemukan.");
    return;
  }

  const confirmed = confirm("📥 Muat 100 Produk Contoh Toko?\n\nProduk demo akan ditambahkan ke katalog kasir Anda untuk mencoba fitur transaksi.");
  if (!confirmed) return;

  applyProductsToStore(INITIAL_PRODUCTS, "update_keep_stock", "Produk Contoh Demo");
  closeImportModal();
}

// Reset Seluruh Stok Toko Menjadi 0 (Katalog tetap utuh, stok kembali ke 0 menunggu LPB)
function resetAllProductStocksToZero() {
  const confirmed = confirm("🔄 RESET SELURUH STOK TOKO MENJADI 0:\n\nApakah Anda yakin ingin mengatur stok seluruh produk toko menjadi 0?\n\nKatalog produk (barcode, nama, harga) TETAP AMAN. Stok fisik akan diisi secara sah melalui menu '📦 Mutasi LPB'. Lanjutkan?");
  if (!confirmed) return;

  if (Array.isArray(pos.products)) {
    pos.products.forEach(p => { p.stock = 0; });
    pos.saveProducts();
  }

  if (typeof renderInventoryTable === "function") renderInventoryTable();
  if (typeof renderTouchGrid === "function") renderTouchGrid();
  if (typeof renderInventoryStats === "function") renderInventoryStats();

  if (typeof showToast === "function") {
    showToast("✅ Seluruh stok produk berhasil di-reset menjadi 0. Siap menerima LPB.", "success", 5000);
  }
  closeImportModal();
}


