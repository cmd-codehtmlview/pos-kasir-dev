/**
 * SnackPOS - Built-in Official Cloud Integration
 */
const OFFICIAL_SUPABASE_URL = (typeof window !== "undefined" && window.location && window.location.origin && window.location.origin.startsWith("http")) 
  ? window.location.origin 
  : "https://2.27.165.72.sslip.io";
const OFFICIAL_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODUwNDE4LCJleHAiOjE5NDc1MzA0MTh9.99BRNnUQwei95p1zAqtFBBD5CnUJSedfUeh2MJy97Gg";
if (typeof window !== 'undefined') {
  window.OFFICIAL_SUPABASE_URL = OFFICIAL_SUPABASE_URL;
  window.OFFICIAL_SUPABASE_KEY = OFFICIAL_SUPABASE_KEY;
}

function cleanSupabaseUrl(rawUrl) {
  let url = String(rawUrl || (typeof window !== 'undefined' ? window.OFFICIAL_SUPABASE_URL : OFFICIAL_SUPABASE_URL) || "https://2.27.165.72.sslip.io").trim();
  if (!url) return "";
  const dashMatch = url.match(/dashboard\/project\/([a-zA-Z0-9_-]+)/);
  if (dashMatch && dashMatch[1]) return `https://${dashMatch[1]}.supabase.co`;
  const refMatch = url.match(/([a-zA-Z0-9_-]+)\.supabase\.co/i);
  if (refMatch && refMatch[1]) return `https://${refMatch[1]}.supabase.co`;
  url = url.replace(/\/rest\/v1\/?.*$/i, '').replace(/\/+$/, '');
  if (!url.startsWith("http://") && !url.startsWith("https://")) url = "https://" + url;
  return url;
}

function cleanSupabaseKey(rawKey) {
  let key = String(rawKey || (typeof window !== 'undefined' ? window.OFFICIAL_SUPABASE_KEY : OFFICIAL_SUPABASE_KEY) || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODUwNDE4LCJleHAiOjE5NDc1MzA0MTh9.99BRNnUQwei95p1zAqtFBBD5CnUJSedfUeh2MJy97Gg").trim().replace(/^['"]+|['"]+$/g, '');
  return key;
}

function isDevEnvironment() {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  const p = window.location.port;
  const path = window.location.pathname;
  return h.startsWith('dev.') || h.includes('-dev.') || h.includes('dev-') || h.includes('preview') || 
         h.includes('trycloudflare.com') || h.includes('pages.dev') || h.includes('ngrok') ||
         h === 'localhost' || h === '127.0.0.1' || p === '8080' || p === '8081' || p === '8085' || path.includes('/dev');
}

function getOrCreateStoreId(forceNew = false) {
  const currentPos = (typeof window !== 'undefined' && window.pos) ? window.pos : null;
  if (isDevEnvironment()) {
    const devStoreId = "DEV-001";
    if (currentPos && currentPos.settings) {
      currentPos.settings.storeId = devStoreId;
      if (!currentPos.settings.storeName || currentPos.settings.storeName === "TOKO SNACK BERKAH") {
        currentPos.settings.storeName = "SNACKPOS (DEV TEST)";
      }
      currentPos.saveSettings();
    }
    return devStoreId;
  }
  if (!forceNew && currentPos && currentPos.settings && currentPos.settings.storeId) {
    return currentPos.settings.storeId;
  }
  const storedLic = localStorage.getItem("snack_pos_license");
  if (!forceNew && storedLic) {
    try {
      const parsed = JSON.parse(storedLic);
      if (parsed.storeId) {
        if (currentPos && currentPos.settings) {
          currentPos.settings.storeId = parsed.storeId;
          currentPos.saveSettings();
        }
        return parsed.storeId;
      }
    } catch(e) {}
  }
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const newId = `STR-${code}`;
  if (currentPos && currentPos.settings) {
    currentPos.settings.storeId = newId;
    currentPos.saveSettings();
  }
  return newId;
}

if (typeof window !== 'undefined') {
  window.cleanSupabaseUrl = cleanSupabaseUrl;
  window.cleanSupabaseKey = cleanSupabaseKey;
  window.getOrCreateStoreId = getOrCreateStoreId;
}

class PosIndexedDB {
  constructor(dbName = "SnackPOS_DB", version = 2) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
    this.isAvailable = false;
    this.initPromise = null;
    this.stores = [
      { name: "products", keyPath: "id" },
      { name: "transactions", keyPath: "id" },
      { name: "members", keyPath: "id" },
      { name: "employees", keyPath: "nik" },
      { name: "returns", keyPath: "id" },
      { name: "klerk", keyPath: "id" },
      { name: "mutations", keyPath: "id" },
      { name: "attendance", keyPath: "id" },
      { name: "settings", keyPath: "key" },
      { name: "hold_carts", keyPath: "id" },
      { name: "lpb_records", keyPath: "id" }
    ];
  }

  /**
   * Inisialisasi koneksi ke IndexedDB dan buat schema jika belum ada
   */
  init() {
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve) => {
      if (!window.indexedDB) {
        console.warn("[IndexedDB] Browser tidak mendukung IndexedDB. Fallback ke LocalStorage.");
        this.isAvailable = false;
        resolve(null);
        return;
      }

      try {
        const request = window.indexedDB.open(this.dbName, this.version);

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          this.stores.forEach((store) => {
            if (!db.objectStoreNames.contains(store.name)) {
              const objStore = db.createObjectStore(store.name, { keyPath: store.keyPath });
              if (store.name === "products") {
                objStore.createIndex("barcode", "barcode", { unique: false });
                objStore.createIndex("category", "category", { unique: false });
              }
              if (store.name === "transactions") {
                objStore.createIndex("timestamp", "timestamp", { unique: false });
              }
            }
          });
          console.log("[IndexedDB] Schema database berhasil di-upgrade ke versi " + this.version);
        };

        request.onsuccess = (event) => {
          this.db = event.target.result;
          this.isAvailable = true;
          console.log("[IndexedDB] Terhubung sukses ke database:", this.dbName);
          resolve(this.db);
        };

        request.onerror = (event) => {
          console.warn("[IndexedDB] Gagal membuka database (mungkin Incognito / Private Mode):", event.target.error);
          this.isAvailable = false;
          resolve(null);
        };
      } catch (err) {
        console.warn("[IndexedDB] Exception saat inisialisasi:", err);
        this.isAvailable = false;
        resolve(null);
      }
    });

    return this.initPromise;
  }

  /**
   * Mengambil semua data dari object store
   */
  async getAll(storeName) {
    await this.init();
    if (!this.isAvailable || !this.db) return null;

    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const req = store.getAll();

        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => {
          console.error(`[IndexedDB] Gagal membaca dari ${storeName}:`, req.error);
          resolve(null);
        };
      } catch (e) {
        console.error(`[IndexedDB] Exception getAll(${storeName}):`, e);
        resolve(null);
      }
    });
  }

  /**
   * Mengambil single record berdasarkan key
   */
  async get(storeName, key) {
    await this.init();
    if (!this.isAvailable || !this.db) return null;

    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const req = store.get(key);

        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  /**
   * Menyimpan / memperbarui satu record
   */
  async put(storeName, item) {
    await this.init();
    if (!this.isAvailable || !this.db) return false;

    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        const req = store.put(item);

        req.onsuccess = () => resolve(true);
        req.onerror = () => {
          console.error(`[IndexedDB] Gagal menyimpan ke ${storeName}:`, req.error);
          resolve(false);
        };
      } catch (e) {
        console.error(`[IndexedDB] Exception put(${storeName}):`, e);
        resolve(false);
      }
    });
  }

  /**
   * Menyimpan kumpulan data (bulk/array) ke store secara atomic
   */
  async setAll(storeName, items) {
    await this.init();
    if (!this.isAvailable || !this.db) return false;
    if (!Array.isArray(items)) return false;

    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);

        // Bersihkan store lama lalu masukkan items baru
        store.clear();
        items.forEach((item) => {
          if (item) store.put(item);
        });

        tx.oncomplete = () => resolve(true);
        tx.onerror = (e) => {
          console.error(`[IndexedDB] Transaksi setAll(${storeName}) gagal:`, tx.error);
          resolve(false);
        };
      } catch (e) {
        console.error(`[IndexedDB] Exception setAll(${storeName}):`, e);
        resolve(false);
      }
    });
  }

  /**
   * Menghapus record berdasarkan key
   */
  async delete(storeName, key) {
    await this.init();
    if (!this.isAvailable || !this.db) return false;

    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        const req = store.delete(key);

        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }

  /**
   * Menghapus seluruh isi store
   */
  async clear(storeName) {
    await this.init();
    if (!this.isAvailable || !this.db) return false;

    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        const req = store.clear();

        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }
}

// Global Instance Mesin IndexedDB
const posDB = new PosIndexedDB();

