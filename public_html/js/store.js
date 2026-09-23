/**
 * SnackPOS - State Management, Storage & Core Utilities
 */

/**
 * SnackPOS - Edisi Kasir Retail Minimarket & Toko Modern
 * Lengkap dengan Sinkronisasi Supabase (1 Menit & Manual), Stock Opname (SO),
 * 100 Produk Bergambar, Mutasi Barang, dan Riwayat 30 Hari.
 */

// ==========================================
// 1. STATE & STORAGE MANAGEMENT
// ==========================================
class POSStore {
  constructor() {
    this.initData();
    this.initIndexedDB();
  }

  initData() {
    // 1. Produk (Seluruh produk dimulai dari Stok 0 sebelum ada LPB / Penerimaan Barang)
    const storedProducts = localStorage.getItem("snack_pos_products");
    if (!storedProducts) {
      this.products = typeof INITIAL_PRODUCTS !== 'undefined' ? JSON.parse(JSON.stringify(INITIAL_PRODUCTS)) : [];
      this.saveProducts();
    } else {
      try {
        this.products = JSON.parse(storedProducts);
      } catch (e) {
        this.products = typeof INITIAL_PRODUCTS !== 'undefined' ? JSON.parse(JSON.stringify(INITIAL_PRODUCTS)) : [];
      }
    }

    // Auto-Reset Stok Awal ke 0 (Membersihkan sisa stok dummy lama di browser user)
    const stockZeroMigrated = localStorage.getItem("snack_pos_stock_zero_v4");
    if (!stockZeroMigrated) {
      if (Array.isArray(this.products)) {
        this.products.forEach(p => { p.stock = 0; });
        this.saveProducts();
      }
      try { localStorage.setItem("snack_pos_stock_zero_v4", "true"); } catch (e) {}
    }

    // 2. Pengaturan Toko
    const storedSettings = localStorage.getItem("snack_pos_settings");
    const defaultSettings = (typeof INITIAL_SETTINGS !== 'undefined' && INITIAL_SETTINGS) ? INITIAL_SETTINGS : {};
    if (!storedSettings) {
      this.settings = { ...defaultSettings };
    } else {
      try {
        this.settings = { ...defaultSettings, ...JSON.parse(storedSettings) };
      } catch (e) {
        this.settings = { ...defaultSettings };
      }
    }
    // Jamin Store ID bukan STR-001 (dummy default lama)
    if (!this.settings.storeId || this.settings.storeId === "STR-001") {
      this.settings.storeId = typeof getOrCreateStoreId === 'function' ? getOrCreateStoreId() : "STR-" + Math.floor(1000 + Math.random() * 9000);
    }
    this.saveSettings();

    // 3. Riwayat Transaksi (Dimulai bersih Rp 0 / 0 Struk untuk toko baru)
    const storedTransactions = localStorage.getItem("snack_pos_transactions");
    if (!storedTransactions) {
      this.transactions = [];
      this.saveTransactions();
    } else {
      try {
        this.transactions = JSON.parse(storedTransactions);
      } catch (e) {
        this.transactions = [];
      }
    }

    // 4. Log Mutasi Barang (Keluar-Masuk & SO)
    const storedMutations = localStorage.getItem("snack_pos_mutations");
    if (!storedMutations) {
      this.mutations = [];
      this.saveMutations();
    } else {
      try {
        this.mutations = JSON.parse(storedMutations);
      } catch (e) {
        this.mutations = [];
      }
    }

    // 5. Antrean Transaksi yang Diparkir (Hold Cart)
    const storedHoldCarts = localStorage.getItem("snack_pos_hold_carts");
    this.holdCarts = storedHoldCarts ? JSON.parse(storedHoldCarts) : [];

    // 6b. Dokumen Penerimaan Barang (LPB) per Supplier
    const storedLpbRecords = localStorage.getItem("snack_pos_lpb_records");
    if (storedLpbRecords) {
      try {
        this.lpbRecords = JSON.parse(storedLpbRecords);
      } catch (e) {
        this.lpbRecords = [];
      }
    } else {
      this.lpbRecords = [];
    }

    // 6. Riwayat Retur Penjualan
    const storedReturns = localStorage.getItem("snack_pos_returns");
    if (storedReturns) {
      try {
        this.returns = JSON.parse(storedReturns);
      } catch (e) {
        this.returns = [];
      }
    } else {
      this.returns = [];
      this.saveReturns();
    }

    // 7. Member Pelanggan & Loyalty Poin
    const storedMembers = localStorage.getItem("snack_pos_members");
    if (storedMembers) {
      try {
        this.members = JSON.parse(storedMembers);
      } catch (e) {
        this.members = [];
      }
    } else {
      this.members = [
        {
          id: "MBR-001",
          name: "Ibu Siti Rahmawati",
          phone: "081234567890",
          address: "Komplek Perumahan Indah Blok C No. 12",
          points: 150,
          totalSpend: 420000,
          registeredAt: "2026-08-15"
        },
        {
          id: "MBR-002",
          name: "Bp. Hendra Wijaya",
          phone: "085711223344",
          address: "Jl. Melati Raya No. 45",
          points: 80,
          totalSpend: 265000,
          registeredAt: "2026-08-20"
        },
        {
          id: "MBR-003",
          name: "Kak Amanda Putri",
          phone: "089699887766",
          address: "Kost Mahasiswi Asri No. 8",
          points: 210,
          totalSpend: 580000,
          registeredAt: "2026-09-01"
        }
      ];
      this.saveMembers();
    }

    // 8. Keranjang Aktif Kasir (Auto-Restore jika browser refresh / mati lampu)
    const storedActiveCart = localStorage.getItem("snack_pos_active_cart");
    if (storedActiveCart) {
      try {
        const parsed = JSON.parse(storedActiveCart);
        this.cart = Array.isArray(parsed.cart) ? parsed.cart : [];
        this.activeMember = parsed.activeMember || null;
        this.activeDiscount = parsed.activeDiscount || { type: 'percent', value: 0, reason: '' };
        this.activeCartCashierNik = parsed.cashierNik || null;
      } catch (e) {
        this.cart = [];
        this.activeMember = null;
        this.activeDiscount = { type: 'percent', value: 0, reason: '' };
        this.activeCartCashierNik = null;
      }
    } else {
      this.cart = [];
      this.activeMember = null;
      this.activeDiscount = { type: 'percent', value: 0, reason: '' };
      this.activeCartCashierNik = null;
    }
    this.lastScannedId = null;

    // 9. Data Karyawan Retail Minimarket (COS, ACOS, CREW)
    const storedEmployees = localStorage.getItem("snack_pos_employees");
    if (storedEmployees) {
      try {
        this.employees = JSON.parse(storedEmployees);
      } catch (e) {
        this.employees = [];
      }
    } else {
      this.employees = [];
    }

    // Auto-purge sisa akun demo lama (1001 Budi, 1002 Siti, 1003 Andi) pada perangkat uji coba
    const demoPurgedV3 = localStorage.getItem("snack_pos_demo_purged_v3");
    if (!demoPurgedV3 && Array.isArray(this.employees)) {
      const initialCount = this.employees.length;
      this.employees = this.employees.filter(e =>
        !(e.nik === "1001" && (e.name === "Budi Santoso" || (e.name && e.name.includes("Budi")))) &&
        !(e.nik === "1002" && (e.name === "Siti Aminah" || (e.name && e.name.includes("Siti")))) &&
        !(e.nik === "1003" && (e.name === "Andi Pratama" || (e.name && e.name.includes("Andi"))))
      );
      if (this.employees.length !== initialCount) {
        this.saveEmployees();
        if (this.currentUser && (this.currentUser.nik === "1001" || this.currentUser.nik === "1002" || this.currentUser.nik === "1003")) {
          this.currentUser = null;
          this.saveCurrentUser(null);
          localStorage.removeItem("snack_pos_active_shift_cashier");
        }
      }
      localStorage.setItem("snack_pos_demo_purged_v3", "true");
    }

    if (Array.isArray(this.employees) && this.employees.length > 0) {
      let needSave = false;
      this.employees.forEach(emp => {
        if (emp.canVoid === undefined) {
          emp.canVoid = (emp.role === "COS" || emp.role === "ACOS");
          needSave = true;
        }
        if (emp.canRetur === undefined) {
          emp.canRetur = (emp.role === "COS" || emp.role === "ACOS");
          needSave = true;
        }
        if (emp.canStockOpname === undefined) {
          emp.canStockOpname = (emp.role === "COS" || emp.role === "ACOS");
          needSave = true;
        }
        if (emp.canBlindKlerk === undefined) {
          emp.canBlindKlerk = true;
          needSave = true;
        }
        if (emp.canViewFinancials === undefined) {
          emp.canViewFinancials = (emp.role === "COS");
          needSave = true;
        }
        if (emp.canManageEmployees === undefined) {
          emp.canManageEmployees = (emp.role === "COS");
          needSave = true;
        }
        if (emp.canManageProducts === undefined) {
          emp.canManageProducts = (emp.role === "COS" || emp.role === "ACOS");
          needSave = true;
        }
        if (emp.canStockMutation === undefined) {
          emp.canStockMutation = (emp.role === "COS" || emp.role === "ACOS");
          needSave = true;
        }
        if (!emp.shift) {
          emp.shift = "Shift 1";
          needSave = true;
        }
      });
      if (needSave) this.saveEmployees();
    }

    // 10. Sesi Karyawan Aktif
    const storedCurrentUser = (typeof sessionStorage !== "undefined" ? sessionStorage.getItem("snack_pos_active_employee") : null) || (typeof localStorage !== "undefined" ? localStorage.getItem("snack_pos_active_employee") : null);
    if (storedCurrentUser) {
      try {
        this.currentUser = JSON.parse(storedCurrentUser);
      } catch (e) {
        this.currentUser = null;
      }
    } else {
      this.currentUser = {
        nik: "1001",
        name: "Owner / Kepala Toko",
        role: "COS",
        shift: "Shift 1",
        canVoid: true,
        canRetur: true,
        canStockOpname: true,
        canBlindKlerk: true,
        canViewFinancials: true,
        canManageEmployees: true,
        canManageProducts: true,
        canStockMutation: true
      };
      this.saveCurrentUser(this.currentUser);
    }

    // 11. Transaksi Dipending (1 Slot Buffer)
    const storedPendingCart = localStorage.getItem("snack_pos_pending_cart");
    if (storedPendingCart) {
      try {
        this.pendingCart = JSON.parse(storedPendingCart);
      } catch (e) {
        this.pendingCart = null;
      }
    } else {
      this.pendingCart = null;
    }

    // 12. Riwayat Absensi Karyawan Toko
    const storedAttendance = localStorage.getItem("snack_pos_attendance");
    if (storedAttendance) {
      try {
        this.attendance = JSON.parse(storedAttendance);
      } catch (e) {
        this.attendance = [];
      }
    } else {
      this.attendance = [];
      this.saveAttendance();
    }

    // Bersihkan log absen dummy jika ada (NIK 1001, 1002, 1003)
    if (Array.isArray(this.attendance) && this.attendance.length > 0) {
      const initialAttCount = this.attendance.length;
      this.attendance = this.attendance.filter(a => a.nik !== "1001" && a.nik !== "1002" && a.nik !== "1003");
      if (this.attendance.length !== initialAttCount) {
        this.saveAttendance();
      }
    }

    // 13. Riwayat Klerk / Closing Shift Kasir
    const storedKlerk = localStorage.getItem("snack_pos_klerk_history");
    if (storedKlerk) {
      try {
        this.klerkHistory = JSON.parse(storedKlerk);
      } catch (e) {
        this.klerkHistory = [];
      }
    } else {
      this.klerkHistory = [];
    }

    // 14. Riwayat Repacking Stok (Bal/Dus -> Pcs/Eceran)
    const storedRepack = localStorage.getItem("snack_pos_repack_logs");
    if (storedRepack) {
      try {
        this.repackLogs = JSON.parse(storedRepack);
      } catch (e) {
        this.repackLogs = [];
      }
    } else {
      this.repackLogs = [];
    }
  }

  /**
   * Asynchronous IndexedDB Sync & Auto-Migration
   * Membaca data dari posDB dan melakukan auto-migrasi dari LocalStorage jika IndexedDB masih kosong
   */
  async initIndexedDB() {
    if (typeof posDB === "undefined") return;
    try {
      await posDB.init();
      if (!posDB.isAvailable) return;

      const syncStore = async (storeName, inMemoryArray) => {
        try {
          const dbItems = await posDB.getAll(storeName);
          if (dbItems && dbItems.length > 0) {
            return dbItems;
          } else if (inMemoryArray && inMemoryArray.length > 0) {
            // Auto-migrasikan data lokal ke IndexedDB
            await posDB.setAll(storeName, inMemoryArray);
            return inMemoryArray;
          }
        } catch (e) {
          console.warn(`[AutoMigrate] Gagal sinkronisasi ${storeName}:`, e);
        }
        return inMemoryArray;
      };

      const [p, t, m, emp, r, k, mut, a] = await Promise.all([
        syncStore("products", this.products),
        syncStore("transactions", this.transactions),
        syncStore("members", this.members),
        syncStore("employees", this.employees),
        syncStore("returns", this.returns),
        syncStore("klerk", this.klerkHistory),
        syncStore("mutations", this.mutations),
        syncStore("attendance", this.attendance)
      ]);

      if (p && p.length > 0) {
        // Auto-Migrasi IndexedDB: bersihkan sisa stok dummy lama di IndexedDB
        const idbStockZeroMigrated = localStorage.getItem("snack_pos_idb_stock_zero_v4");
        const hasNoRealOps = (!this.lpbRecords || this.lpbRecords.length === 0) && (!this.transactions || this.transactions.length === 0);
        
        if (!idbStockZeroMigrated || hasNoRealOps) {
          p.forEach(prod => { prod.stock = 0; });
          await posDB.setAll("products", p);
          try { localStorage.setItem("snack_pos_idb_stock_zero_v4", "true"); } catch (e) {}
        }
        this.products = p;
        try { localStorage.setItem("snack_pos_products", JSON.stringify(this.products)); } catch (e) {}
      }

      // Bersihkan transaksi/mutasi/retur dummy di IndexedDB jika toko fresh
      const storedTransactions = localStorage.getItem("snack_pos_transactions");
      if (!storedTransactions || storedTransactions === "[]") {
        t = [];
        this.transactions = [];
        await posDB.setAll("transactions", []);
      } else if (t && t.length > 0) {
        this.transactions = t;
      }

      const storedMutations = localStorage.getItem("snack_pos_mutations");
      if (!storedMutations || storedMutations === "[]") {
        mut = [];
        this.mutations = [];
        await posDB.setAll("mutations", []);
      } else if (mut && mut.length > 0) {
        this.mutations = mut;
      }

      const storedReturns = localStorage.getItem("snack_pos_returns");
      if (!storedReturns || storedReturns === "[]") {
        r = [];
        this.returns = [];
        await posDB.setAll("returns", []);
      } else if (r && r.length > 0) {
        this.returns = r;
      }

      if (m && m.length > 0) this.members = m;
      if (emp && emp.length > 0) this.employees = emp;
      if (k && k.length > 0) this.klerkHistory = k;
      if (a && a.length > 0) this.attendance = a;

      // Sinkronkan pengaturan toko
      try {
        const dbSetting = await posDB.get("settings", "store_config");
        if (dbSetting && dbSetting.value) {
          this.settings = { ...this.settings, ...dbSetting.value };
        } else if (this.settings) {
          await posDB.put("settings", { key: "store_config", value: this.settings });
        }
      } catch (e) {}

      // Refresh seluruh tampilan UI produk kasir & katalog
      if (typeof renderPosCart === "function") {
        try { renderPosCart(); } catch (e) {}
      }
      if (typeof renderInventoryTable === "function") {
        try { renderInventoryTable(); } catch (e) {}
      }
      if (typeof renderTouchGrid === "function") {
        try { renderTouchGrid(); } catch (e) {}
      }
      if (typeof renderInventoryStats === "function") {
        try { renderInventoryStats(); } catch (e) {}
      }
    } catch (err) {
      console.warn("[POSStore] IndexedDB init error, fallback to LocalStorage:", err);
    }
  }

  saveProducts() {
    try { localStorage.setItem("snack_pos_products", JSON.stringify(this.products)); } catch (e) {}
    if (typeof posDB !== "undefined" && posDB.isAvailable) {
      posDB.setAll("products", this.products);
    }
  }

  saveMembers() {
    try { localStorage.setItem("snack_pos_members", JSON.stringify(this.members)); } catch (e) {}
    if (typeof posDB !== "undefined" && posDB.isAvailable) {
      posDB.setAll("members", this.members);
    }
  }

  saveSettings() {
    try { localStorage.setItem("snack_pos_settings", JSON.stringify(this.settings)); } catch (e) {}
    if (typeof posDB !== "undefined" && posDB.isAvailable) {
      posDB.put("settings", { key: "store_config", value: this.settings });
    }
  }

  saveTransactions() {
    try { localStorage.setItem("snack_pos_transactions", JSON.stringify(this.transactions)); } catch (e) {}
    if (typeof posDB !== "undefined" && posDB.isAvailable) {
      posDB.setAll("transactions", this.transactions);
    }
  }

  saveMutations() {
    try { localStorage.setItem("snack_pos_mutations", JSON.stringify(this.mutations)); } catch (e) {}
    if (typeof posDB !== "undefined" && posDB.isAvailable) {
      posDB.setAll("mutations", this.mutations);
    }
  }

  saveLpbRecords() {
    try { localStorage.setItem("snack_pos_lpb_records", JSON.stringify(this.lpbRecords)); } catch (e) {}
    if (typeof posDB !== "undefined" && posDB.isAvailable) {
      posDB.setAll("lpb_records", this.lpbRecords);
    }
  }

  saveReturns() {
    try { localStorage.setItem("snack_pos_returns", JSON.stringify(this.returns)); } catch (e) {}
    if (typeof posDB !== "undefined" && posDB.isAvailable) {
      posDB.setAll("returns", this.returns);
    }
  }

  saveAttendance() {
    try { localStorage.setItem("snack_pos_attendance", JSON.stringify(this.attendance)); } catch (e) {}
    if (typeof posDB !== "undefined" && posDB.isAvailable) {
      posDB.setAll("attendance", this.attendance);
    }
  }

  saveKlerkHistory() {
    try { localStorage.setItem("snack_pos_klerk_history", JSON.stringify(this.klerkHistory)); } catch (e) {}
    if (typeof posDB !== "undefined" && posDB.isAvailable) {
      posDB.setAll("klerk", this.klerkHistory);
    }
  }

  saveRepackLogs() {
    try { localStorage.setItem("snack_pos_repack_logs", JSON.stringify(this.repackLogs)); } catch (e) {}
    if (typeof posDB !== "undefined" && posDB.isAvailable && posDB.db && posDB.db.objectStoreNames.contains("repack_logs")) {
      posDB.setAll("repack_logs", this.repackLogs);
    }
  }

  saveHoldCarts() {
    try { localStorage.setItem("snack_pos_hold_carts", JSON.stringify(this.holdCarts)); } catch (e) {}
    if (typeof posDB !== "undefined" && posDB.isAvailable) {
      posDB.setAll("hold_carts", this.holdCarts);
    }
  }

  saveEmployees() {
    try { localStorage.setItem("snack_pos_employees", JSON.stringify(this.employees)); } catch (e) {}
    if (typeof posDB !== "undefined" && posDB.isAvailable) {
      posDB.setAll("employees", this.employees);
    }
  }

  saveActiveCart() {
    try {
      if (this.cart && this.cart.length > 0) {
        const activeUser = this.currentUser || { nik: "UNKNOWN", name: "Kasir" };
        const payload = {
          cashierNik: activeUser.nik,
          cashierName: activeUser.name,
          cart: this.cart,
          activeMember: this.activeMember || null,
          activeDiscount: this.activeDiscount || { type: 'percent', value: 0, reason: '' },
          updatedAt: Date.now()
        };
        localStorage.setItem("snack_pos_active_cart", JSON.stringify(payload));
      } else {
        localStorage.removeItem("snack_pos_active_cart");
      }
    } catch (e) {
      console.warn("Gagal menyimpan keranjang aktif:", e);
    }
  }

  clearActiveCart() {
    this.cart = [];
    this.activeMember = null;
    this.activeDiscount = { type: 'percent', value: 0, reason: '' };
    this.lastScannedId = null;
    try {
      localStorage.removeItem("snack_pos_active_cart");
    } catch (e) {}
  }

  savePendingCart() {
    try {
      if (this.pendingCart) {
        localStorage.setItem("snack_pos_pending_cart", JSON.stringify(this.pendingCart));
      } else {
        localStorage.removeItem("snack_pos_pending_cart");
      }
    } catch (e) {}
  }

  saveCurrentUser(emp) {
    this.currentUser = emp;
    if (emp) {
      try {
        sessionStorage.setItem("snack_pos_active_employee", JSON.stringify(emp));
        localStorage.setItem("snack_pos_active_employee", JSON.stringify(emp));
      } catch (e) {}
    } else {
      try {
        sessionStorage.removeItem("snack_pos_active_employee");
        localStorage.removeItem("snack_pos_active_employee");
      } catch (e) {}
    }
  }

  resetAllToDemo() {
    this.products = typeof INITIAL_PRODUCTS !== 'undefined' ? [...INITIAL_PRODUCTS] : [];
    this.settings = typeof INITIAL_SETTINGS !== 'undefined' ? { ...INITIAL_SETTINGS } : {};
    this.transactions = typeof INITIAL_TRANSACTIONS !== 'undefined' ? [...INITIAL_TRANSACTIONS] : [];
    this.mutations = typeof INITIAL_STOCK_MUTATIONS !== 'undefined' ? [...INITIAL_STOCK_MUTATIONS] : [];
    this.holdCarts = [];
    this.cart = [];
    this.saveProducts();
    this.saveSettings();
    this.saveTransactions();
    this.saveMutations();
    this.saveHoldCarts();
  }
}

// Inisialisasi Audio Web Kasir
class SoundFx {
  constructor() {
    this.ctx = null;
  }

  getAudioContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  beep() {
    if (!pos.settings.enableSound) return;
    try {
      const ctx = this.getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch (e) {}
  }

  success() {
    if (!pos.settings.enableSound) return;
    try {
      const ctx = this.getAudioContext();
      const now = ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.12, now + i * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.07);
        osc.stop(now + i * 0.07 + 0.25);
      });
    } catch (e) {}
  }

  warning() {
    if (!pos.settings.enableSound) return;
    try {
      const ctx = this.getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {}
  }
}

// Global Instances
var pos = new POSStore();
if (typeof window !== 'undefined') {
  window.pos = pos;
}
var sfx = new SoundFx();
if (typeof window !== 'undefined') {
  window.sfx = sfx;
}

// Format Rupiah & Angka
function formatRupiah(number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(number);
}

function formatAngka(number) {
  return new Intl.NumberFormat("id-ID").format(number);
}

// Toast Notifikasi
function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  const bgColors = {
    success: "bg-emerald-600 text-white",
    error: "bg-rose-600 text-white",
    info: "bg-blue-600 text-white",
    warning: "bg-amber-500 text-white"
  };

  toast.className = `flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-xs font-bold transition-all duration-300 transform translate-y-2 opacity-0 z-50 ${bgColors[type] || bgColors.info}`;
  toast.innerHTML = `<span>${message}</span>`;

  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.remove("translate-y-2", "opacity-0");
  });

  setTimeout(() => {
    toast.classList.add("opacity-0", "translate-y-2");
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

function openModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) {
    el.classList.remove("hidden");
    document.body.classList.add("modal-open");
  }
}

function closeModal(modalId) {
  if (document.activeElement && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur();
  }
  const el = document.getElementById(modalId);
  if (el) el.classList.add("hidden");
  const anyOpen = document.querySelector(".modal-backdrop:not(.hidden)");
  if (!anyOpen) {
    document.body.classList.remove("modal-open");
    if (window.scrollY > 0) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }
}

function closeAllModals() {
  if (typeof closePosCameraScanner === "function" && posScannerIsScanning) {
    closePosCameraScanner();
  }
  document.querySelectorAll(".modal-backdrop").forEach(m => {
    // Jangan tutup modal wajib jika belum setup akun perdana atau belum login kasir
    if (m.id === "modal-first-time-setup") return;
    if (m.id === "modal-employee-login" && !pos.currentUser) return;
    if (m.id === "modal-duplicate-instance") return;
    m.classList.add("hidden");
  });
  const anyOpen = document.querySelector(".modal-backdrop:not(.hidden)");
  if (!anyOpen) {
    document.body.classList.remove("modal-open");
  }
}

// ==========================================
// GENERATOR THUMBNAIL GENERIK PRODUK RITEL
// Memberikan visual thumbnail elegan, rapi & 100% offline
// untuk barang yang belum memiliki foto atau jika foto gagal dimuat
// ==========================================
function getProductThumbnailSvg(category = "", name = "") {
  const cat = String(category || "").toLowerCase();
  const n = String(name || "").toLowerCase();

  let icon = "📦";
  let label = "PRODUK";
  let bg = "#F1F5F9"; // slate-100
  let color = "#475569"; // slate-600

  if (cat.includes("mie") || n.includes("indomie") || n.includes("sedaap") || n.includes("pop mie") || n.includes("sarden") || n.includes("bihun")) {
    icon = "🍜";
    label = "MIE & SAJI";
    bg = "#FEF3C7"; // amber-100
    color = "#D97706"; // amber-600
  } else if (cat.includes("minum") || cat.includes("kopi") || n.includes("aqua") || n.includes("teh") || n.includes("susu") || n.includes("kopi") || n.includes("soda") || n.includes("cola")) {
    icon = "🧃";
    label = "MINUMAN";
    bg = "#EFF6FF"; // blue-100
    color = "#2563EB"; // blue-600
  } else if (cat.includes("snack") || cat.includes("makan") || cat.includes("biskuit") || cat.includes("keripik") || cat.includes("kue") || n.includes("chitato") || n.includes("oreo") || n.includes("wafer")) {
    icon = "🍿";
    label = "SNACK";
    bg = "#FFF7ED"; // orange-100
    color = "#EA580C"; // orange-600
  } else if (cat.includes("sembako") || cat.includes("bumbu") || cat.includes("dapur") || n.includes("beras") || n.includes("minyak") || n.includes("gula") || n.includes("terigu") || n.includes("garam")) {
    icon = "🍚";
    label = "SEMBAKO";
    bg = "#ECFDF5"; // emerald-100
    color = "#059669"; // emerald-600
  } else if (cat.includes("tubuh") || cat.includes("personal") || cat.includes("mandi") || n.includes("sabun") || n.includes("shampo") || n.includes("pepsodent") || n.includes("rexona")) {
    icon = "🧴";
    label = "PERAWATAN";
    bg = "#FAF5FF"; // purple-100
    color = "#9333EA"; // purple-600
  } else if (cat.includes("bersih") || cat.includes("rumah") || cat.includes("home") || n.includes("rinso") || n.includes("sunlight") || n.includes("soklin") || n.includes("wipol") || n.includes("baygon")) {
    icon = "🧼";
    label = "KEBERSIHAN";
    bg = "#F0FDFA"; // teal-100
    color = "#0D9488"; // teal-600
  } else if (cat.includes("sehat") || cat.includes("obat") || cat.includes("farmasi") || n.includes("bodrex") || n.includes("tolak angin") || n.includes("kayu putih") || n.includes("vitamin") || n.includes("tablet")) {
    icon = "💊";
    label = "KESEHATAN";
    bg = "#FFF1F2"; // rose-100
    color = "#E11D48"; // rose-600
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
    <rect width="160" height="160" rx="24" fill="${bg}" stroke="${color}" stroke-width="2" stroke-opacity="0.25"/>
    <circle cx="80" cy="66" r="38" fill="#ffffff" fill-opacity="0.92"/>
    <text x="80" y="73" font-size="42" text-anchor="middle" dominant-baseline="central">${icon}</text>
    <rect x="18" y="118" width="124" height="24" rx="12" fill="#ffffff" fill-opacity="0.95"/>
    <text x="80" y="132" font-size="9.5" font-weight="900" font-family="system-ui, -apple-system, sans-serif" fill="${color}" text-anchor="middle" dominant-baseline="central" letter-spacing="0.5">${label}</text>
  </svg>`;

  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function getProductImageSrc(p) {
  if (p && p.image && typeof p.image === 'string' && p.image.trim() !== '' && p.image !== 'null' && p.image !== 'undefined') {
    return p.image;
  }
  return getProductThumbnailSvg(p?.category, p?.name);
}
