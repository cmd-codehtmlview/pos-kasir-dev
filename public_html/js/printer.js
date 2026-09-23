function formatRupiahSimple(num) {
  const val = typeof num === 'number' ? num : (parseFloat(num) || 0);
  return Math.round(val).toLocaleString('id-ID');
}

// =========================================================
// 0. MESIN ANTREAN CETAK BLUETOOTH (PRINT QUEUE SPOOLER)
// Menangani antrean FIFO, anti-double click, persentase progress,
// pencegahan buffer overflow printer VSC, dan indikator status kasir
// =========================================================

class BluetoothPrintSpooler {
  constructor() {
    this.queue = [];
    this.currentJob = null;
    this.isProcessing = false;
    this.recentJobKeys = new Map();
    this.hideWidgetTimer = null;
  }

  enqueue(bytes, meta = {}) {
    return new Promise((resolve, reject) => {
      if (!bytes || bytes.length === 0) {
        reject(new Error("Data cetak kosong"));
        return;
      }

      const now = Date.now();
      const jobTitle = meta.title || "Dokumen Struk Kasir";
      const jobType = meta.type || "generic";
      const jobId = meta.id || ("job_" + now + "_" + Math.random().toString(36).substr(2, 5));
      const dedupeKey = jobType + "_" + jobId;

      // Anti-Double Click: Cegah print berulang dari transaksi yang sama dalam 3.5 detik
      if (this.recentJobKeys.has(dedupeKey)) {
        const lastTime = this.recentJobKeys.get(dedupeKey);
        if (now - lastTime < 3500) {
          console.warn("[PrintSpooler] Menolak duplikasi cepat job " + dedupeKey);
          if (typeof showToast === 'function') {
            showToast("Tugas cetak ini sudah masuk antrean.", "info");
          }
          resolve({ status: 'DUPLICATE_IGNORED' });
          return;
        }
      }
      this.recentJobKeys.set(dedupeKey, now);

      if (this.recentJobKeys.size > 50) {
        for (const [k, t] of this.recentJobKeys.entries()) {
          if (now - t > 30000) this.recentJobKeys.delete(k);
        }
      }

      const job = {
        id: jobId,
        title: jobTitle,
        type: jobType,
        bytes: bytes,
        status: 'QUEUED',
        progress: 0,
        createdAt: now,
        resolve,
        reject
      };

      this.queue.push(job);
      this.updateUI();
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessing) return;
    if (this.queue.length === 0) {
      this.updateUI();
      return;
    }

    this.isProcessing = true;
    this.currentJob = this.queue.shift();
    this.currentJob.status = 'SENDING';
    this.currentJob.progress = 0;
    this.updateUI();

    try {
      const connected = await ensureBluetoothConnected(true);
      if (!connected || !bluetoothPrinterCharacteristic) {
        throw new Error("Printer Bluetooth belum terhubung.");
      }

      const bytes = this.currentJob.bytes;
      const totalBytes = bytes.length;
      let offset = 0;
      const chunkSize = 20;

      const canWriteWithoutResponse = Boolean(
        bluetoothPrinterCharacteristic.properties && 
        bluetoothPrinterCharacteristic.properties.writeWithoutResponse
      );

      // Throttling yang aman untuk modul BLE UART printer thermal (HM-10, JieLi, CC2540)
      // Mencegah overflow buffer RX 64-128 byte yang kerap memicu restart/disconnect printer BLE
      const isLargeJob = totalBytes > 600;
      const chunkDelay = isLargeJob ? 24 : 18;

      while (offset < totalBytes) {
        if (this.currentJob && this.currentJob.status === 'CANCELLED') {
          throw new Error("Pencetakan dibatalkan oleh kasir.");
        }

        const chunk = bytes.slice(offset, offset + chunkSize);

        // Mekanisme retry aman jika ada interferensi frekuensi 2.4GHz sesaat
        let writeSuccess = false;
        let lastErr = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            if (canWriteWithoutResponse && typeof bluetoothPrinterCharacteristic.writeValueWithoutResponse === 'function') {
              await bluetoothPrinterCharacteristic.writeValueWithoutResponse(chunk);
            } else if (typeof bluetoothPrinterCharacteristic.writeValue === 'function') {
              await bluetoothPrinterCharacteristic.writeValue(chunk);
            } else if (typeof bluetoothPrinterCharacteristic.writeValueWithResponse === 'function') {
              await bluetoothPrinterCharacteristic.writeValueWithResponse(chunk);
            }
            writeSuccess = true;
            break;
          } catch (e) {
            lastErr = e;
            console.warn(`[PrintSpooler] Write chunk retry ${attempt + 1}/3:`, e.message);
            await new Promise(r => setTimeout(r, 60 * (attempt + 1)));
          }
        }

        if (!writeSuccess) {
          throw lastErr || new Error("Gagal mengirim data ke printer Bluetooth (interferensi/koneksi terputus).");
        }

        offset += chunk.length;

        // Flow Control Breathing:
        // Setiap ~320 byte data (~16 chunk), berikan jeda 60ms
        // Memberi waktu bagi print head untuk membakar dot thermal & mengosongkan FIFO buffer printer
        if (offset % 320 < chunkSize) {
          await new Promise(r => setTimeout(r, 60));
        } else {
          await new Promise(r => setTimeout(r, chunkDelay));
        }

        const pct = Math.min(99, Math.round((offset / totalBytes) * 100));
        if (this.currentJob) {
          this.currentJob.progress = pct;
        }
        this.updateUI();
      }

      if (this.currentJob) {
        this.currentJob.progress = 100;
        this.currentJob.status = 'SUCCESS';
      }
      this.updateUI();

      if (typeof sfx !== 'undefined' && sfx.success) sfx.success();
      if (this.currentJob) {
        this.currentJob.resolve({ status: 'SUCCESS', id: this.currentJob.id });
      }

      // Beri jeda 350ms sebelum job berikutnya agar printer menyelesaikan feed/cut
      await new Promise(r => setTimeout(r, 350));
    } catch (err) {
      console.error("[PrintSpooler] Error:", err);
      if (this.currentJob) {
        this.currentJob.status = 'FAILED';
        this.currentJob.error = err.message;
        this.currentJob.reject(err);
      }
      if (typeof showToast === 'function') {
        showToast("Gagal mencetak: " + err.message, "error");
      }
    } finally {
      this.currentJob = null;
      this.isProcessing = false;
      this.updateUI();

      if (this.queue.length > 0) {
        setTimeout(() => this.processQueue(), 100);
      }
    }
  }

  cancelOrClear() {
    if (this.currentJob) {
      this.currentJob.status = 'CANCELLED';
      this.currentJob.reject(new Error("Dibatalkan oleh kasir"));
    }
    const cancelledCount = this.queue.length;
    for (const j of this.queue) {
      j.status = 'CANCELLED';
      j.reject(new Error("Antrean dibersihkan oleh kasir"));
    }
    this.queue = [];
    this.isProcessing = false;
    this.currentJob = null;
    this.updateUI();

    if (typeof showToast === 'function') {
      showToast(cancelledCount > 0 ? ("Antrean dibersihkan (" + cancelledCount + " tugas dibatalkan)") : "Tugas cetak dibatalkan", "warning");
    }
  }

  updateUI() {
    if (typeof updateBluetoothUI === 'function') {
      updateBluetoothUI();
    }
  }
}

const printSpooler = new BluetoothPrintSpooler();
if (typeof window !== 'undefined') {
  window.printSpooler = printSpooler;
}

function updateQuickBluetoothModalUI() {
  const modalDeviceName = document.getElementById("modal-bt-device-name");
  const modalStatusDot = document.getElementById("modal-bt-status-dot");
  const modalStatusText = document.getElementById("modal-bt-status-text");
  const modalDetailText = document.getElementById("modal-bt-detail-text");
  const modalPaperBadge = document.getElementById("modal-bt-paper-badge");
  const modalQueueInfo = document.getElementById("modal-bt-queue-info");
  const switchModeBtnText = document.getElementById("btn-modal-bt-switch-mode-text");
  const connectBtn = document.getElementById("btn-modal-bt-connect");

  const mode = (typeof pos !== "undefined" && pos.settings && pos.settings.printerDriverMode) || "bluetooth";
  const paper = (typeof pos !== "undefined" && pos.settings && pos.settings.paperWidth) || "58mm";
  if (modalPaperBadge) modalPaperBadge.textContent = paper;

  if (mode === "system") {
    if (modalDeviceName) modalDeviceName.textContent = "Dialog Cetak Sistem / Kabel USB";
    if (modalStatusDot) modalStatusDot.className = "w-3 h-3 rounded-full bg-blue-500 shadow-sm";
    if (modalStatusText) modalStatusText.textContent = "Mode Sistem Aktif (Bebas BT)";
    if (modalDetailText) modalDetailText.textContent = "Mencetak via jendela print browser (USB/PDF/Android)";
    if (switchModeBtnText) switchModeBtnText.textContent = "Beralih ke Bluetooth BLE";
    if (connectBtn) connectBtn.classList.add("hidden");
  } else if (mode === "rawbt") {
    if (modalDeviceName) modalDeviceName.textContent = "RawBT Android Print Service";
    if (modalStatusDot) modalStatusDot.className = "w-3 h-3 rounded-full bg-amber-500 shadow-sm";
    if (modalStatusText) modalStatusText.textContent = "Jembatan RawBT Aktif";
    if (modalDetailText) modalDetailText.textContent = "Mengirim data cetak via aplikasi RawBT";
    if (switchModeBtnText) switchModeBtnText.textContent = "Beralih ke Bluetooth BLE";
    if (connectBtn) connectBtn.classList.add("hidden");
  } else {
    // Mode Bluetooth
    const connected = isBluetoothConnected();
    const devName = (bluetoothPrinterDevice && bluetoothPrinterDevice.name) || (typeof pos !== "undefined" && pos.settings && pos.settings.lastPrinterName) || "Printer VSC";
    if (modalDeviceName) modalDeviceName.textContent = devName;
    if (switchModeBtnText) switchModeBtnText.textContent = "Ganti ke Mode Dialog Sistem / USB";
    if (connectBtn) connectBtn.classList.remove("hidden");

    if (connected) {
      if (modalStatusDot) modalStatusDot.className = "w-3 h-3 rounded-full bg-emerald-500 shadow-sm";
      if (modalStatusText) modalStatusText.textContent = "Terhubung & Siap";
      if (modalDetailText) modalDetailText.textContent = "GATT BLE aktif • Format: " + paper;
    } else {
      if (modalStatusDot) modalStatusDot.className = "w-3 h-3 rounded-full bg-slate-400";
      if (modalStatusText) modalStatusText.textContent = "Terputus";
      if (modalDetailText) modalDetailText.textContent = "Klik 'Cari & Hubungkan' di bawah untuk menyambungkan.";
    }
  }

  if (modalQueueInfo && typeof printSpooler !== "undefined") {
    const qLen = printSpooler.queue.length + (printSpooler.currentJob ? 1 : 0);
    modalQueueInfo.textContent = qLen > 0 ? (qLen + " Tugas Aktif") : "0 Tugas (Siaga)";
  }
}

function togglePrinterDriverModeQuick() {
  const current = (typeof pos !== 'undefined' && pos.settings && pos.settings.printerDriverMode) || 'bluetooth';
  const newMode = (current === 'bluetooth') ? 'system' : 'bluetooth';
  if (typeof changePrinterDriverMode === 'function') {
    changePrinterDriverMode(newMode);
  } else if (typeof pos !== 'undefined' && pos.settings) {
    pos.settings.printerDriverMode = newMode;
    pos.saveSettings();
  }
  updateBluetoothUI();
  updateQuickBluetoothModalUI();
  if (typeof updateSisPrinterModalUI === 'function') updateSisPrinterModalUI();
}

function handleBluetoothIndicatorClick() {
  updateBluetoothUI();
  updateQuickBluetoothModalUI();
  if (typeof openModal === 'function' && document.getElementById('modal-bluetooth-quick')) {
    openModal("modal-bluetooth-quick");
  } else if (typeof openSisModal === 'function') {
    openSisModal("sis-modal-printer");
  }
}

function cancelOrClearPrintQueue() {
  if (typeof printSpooler !== 'undefined') {
    // Abaikan jika tidak ada proses aktif atau antrean cetak
    if (!printSpooler.isProcessing && (!printSpooler.queue || printSpooler.queue.length === 0)) {
      return;
    }

    // 1. Cooldown tap: abaikan ketukan kilat tidak sengaja pada tombol batal saat awal tugas cetak
    if (printSpooler.lastJobStartTime && (Date.now() - printSpooler.lastJobStartTime < 900)) {
      console.log("[PrintSpooler] Ignored accidental touch collision on cancel button");
      return;
    }

    // 2. Jika sedang aktif mengirim data ke printer, minta konfirmasi kasir
    if (printSpooler.isProcessing && printSpooler.currentJob) {
      const ok = confirm("Sedang mencetak ke printer Bluetooth.\n\nApakah Anda yakin ingin membatalkan tugas cetak ini?");
      if (!ok) return;
    }

    printSpooler.cancelOrClear();
  }
}


/**
 * SnackPOS - Universal ESC/POS Thermal Printer Driver
 * Mendukung Direct Web Bluetooth (BLE), Jembatan RawBT Android, & Driver Sistem Kabel
 * Kompatibel penuh dengan VSC Mini Thermal (MP-58M, TM-58, POS-58) & printer 58mm/80mm
 */

// State internal koneksi Bluetooth
let bluetoothPrinterDevice = null;
let bluetoothPrinterCharacteristic = null;
let isConnectingBluetooth = false;
let isUserExplicitlyDisconnected = false;
let bluetoothAutoReconnectTimer = null;
let fastReconnectTimeout = null;

// Daftar UUID Service BLE umum untuk printer thermal POS (VSC, Zjiang, MPT, Nordic, HM-10, GOOJPRT, Xprinter, dll)
const COMMON_PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard Chinese POS / VSC / Zjiang / MPT-II
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 / CC2541 BLE Serial (Sangat umum di VSC, Panda, MPT)
  '0000ffe1-0000-1000-8000-00805f9b34fb', // HM-10 Alt
  '0000fff0-0000-1000-8000-00805f9b34fb', // GOOJPRT / Xprinter / PeriPage
  '0000fff1-0000-1000-8000-00805f9b34fb',
  '0000fff2-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Transparent Serial
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Pos-58 BLE
  '0000ff00-0000-1000-8000-00805f9b34fb', // Custom BLE Serial
  '0000ff02-0000-1000-8000-00805f9b34fb',
  '0000ae00-0000-1000-8000-00805f9b34fb',
  '0000ae01-0000-1000-8000-00805f9b34fb',
  '0000ae30-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic Semiconductor UART Service (NUS)
  '0000e781-0000-1000-8000-00805f9b34fb',
  '0000af30-0000-1000-8000-00805f9b34fb',
  '0000fee0-0000-1000-8000-00805f9b34fb',
  '0000ffff-0000-1000-8000-00805f9b34fb',
  'd973f2e0-b19e-11e2-9e96-0800200c9a66'  // Murata BLE
];

// =========================================================
// 1. MANAJEMEN KONEKSI WEB BLUETOOTH API
// =========================================================

function isBluetoothSupported() {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

function isBluetoothConnected() {
  return Boolean(
    bluetoothPrinterDevice &&
    bluetoothPrinterDevice.gatt &&
    bluetoothPrinterDevice.gatt.connected &&
    bluetoothPrinterCharacteristic
  );
}

async function connectBluetoothPrinter() {
  if (!isBluetoothSupported()) {
    if (typeof openModal === 'function' && document.getElementById('modal-printer-help')) {
      openModal('modal-printer-help');
    } else {
      alert(
        "Browser ini belum mendukung Web Bluetooth API.\n\n" +
        "💡 Saran Penggunaan:\n" +
        "- Gunakan browser Google Chrome di HP Android / Laptop.\n" +
        "- Atau gunakan mode 'Dialog Sistem / Kabel USB' dengan kabel USB."
      );
    }
    return false;
  }

  if (isConnectingBluetooth) return false;
  isConnectingBluetooth = true;
  updatePrinterStatusBadge();

  try {
    showToast("Mencari printer Bluetooth sekitar...", "info");

    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: COMMON_PRINTER_SERVICES
    });

    if (!device) {
      isConnectingBluetooth = false;
      updatePrinterStatusBadge();
      return false;
    }

    bluetoothPrinterDevice = device;
    device.addEventListener('gattserverdisconnected', onBluetoothDisconnected);

    showToast(`Menghubungkan ke ${device.name || 'Printer Bluetooth'}...`, "info");
    const server = await device.gatt.connect();

    // Temukan characteristic penulisan dengan fallback scan per-UUID
    const writableChar = await discoverPrinterWritableCharacteristic(server);

    if (!writableChar) {
      throw new Error("Karakteristik penulisan (write) tidak ditemukan. Pastikan printer mendukung Bluetooth BLE (Bluetooth 4.0+) atau gunakan mode Kabel USB / RawBT.");
    }

    bluetoothPrinterCharacteristic = writableChar;
    isUserExplicitlyDisconnected = false;
    pos.settings.lastPrinterName = device.name || "VSC Mini Thermal";
    pos.settings.lastPrinterId = device.id || "";
    pos.settings.printerDriverMode = 'bluetooth';
    pos.saveSettings();

    showToast(`🟢 Berhasil terhubung ke ${pos.settings.lastPrinterName}!`, "success");
    if (typeof sfx !== 'undefined' && sfx.success) sfx.success();

    isConnectingBluetooth = false;
    updatePrinterStatusBadge();
    startBluetoothAutoReconnectWatchdog();
    return true;
  } catch (err) {
    console.warn("Koneksi Bluetooth dibatalkan / gagal:", err);
    if (err.name !== 'NotFoundError') {
      showToast(`Gagal konek Bluetooth: ${err.message}`, "error");
    }
    isConnectingBluetooth = false;
    bluetoothPrinterDevice = null;
    bluetoothPrinterCharacteristic = null;
    updatePrinterStatusBadge();
    return false;
  }
}

// Helper mandiri untuk menemukan karakteristik BLE yang benar-benar untuk cetak printer
async function discoverPrinterWritableCharacteristic(server) {
  // 1. PRIORITAS UTAMA: Cari langsung di daftar UUID Service Printer POS yang dikenal
  for (const sUuid of COMMON_PRINTER_SERVICES) {
    try {
      const s = await server.getPrimaryService(sUuid);
      if (s) {
        const characteristics = await s.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.writeWithoutResponse || char.properties.write) {
            console.log(`[Bluetooth] Ditemukan printer characteristic dari service POS dikenal: ${sUuid} -> ${char.uuid}`);
            return char;
          }
        }
      }
    } catch (e) {
      // lanjut cek service printer berikutnya
    }
  }

  // 2. JIKA BELUM DITEMUKAN, CARI DARI SEMUA SERVICE YANG TERSEDIA
  // Abaikan service internal sistem Bluetooth yang bukan untuk data cetak (Generic Access, Device Info, Battery)
  const IGNORED_SERVICES = [
    '00001800-0000-1000-8000-00805f9b34fb', // Generic Access
    '00001801-0000-1000-8000-00805f9b34fb', // Generic Attribute
    '0000180a-0000-1000-8000-00805f9b34fb', // Device Information
    '0000180f-0000-1000-8000-00805f9b34fb'  // Battery Service
  ];

  try {
    const services = await server.getPrimaryServices();
    for (const service of services) {
      const sUuidLower = (service.uuid || '').toLowerCase();
      if (IGNORED_SERVICES.includes(sUuidLower)) {
        continue;
      }
      try {
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.writeWithoutResponse || char.properties.write) {
            console.log(`[Bluetooth] Ditemukan printer characteristic dari service generic: ${service.uuid} -> ${char.uuid}`);
            return char;
          }
        }
      } catch (e) {}
    }
  } catch (err) {
    console.warn("server.getPrimaryServices() gagal:", err);
  }

  return null;
}

// State jeda & backoff untuk mencegah GATT Error 133 pada Android/Windows
let lastDisconnectTime = 0;
let reconnectBackoffMs = 2000;

// Menjamin printer Bluetooth terhubung (auto-reconnect pintar tanpa merusak native socket)
async function ensureBluetoothConnected(silent = false) {
  if (isBluetoothConnected()) {
    return true;
  }

  if (isConnectingBluetooth) {
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 200));
      if (isBluetoothConnected()) return true;
    }
    return isBluetoothConnected();
  }

  // Lindungi Android BLE Stack: jika baru disconnect dalam 1.2 detik, beri jeda agar HCI/L2CAP socket bersih
  const now = Date.now();
  if (lastDisconnectTime && (now - lastDisconnectTime < 1200)) {
    const waitMs = 1200 - (now - lastDisconnectTime);
    await new Promise(r => setTimeout(r, waitMs));
  }

  // 1. Coba reconnect ke device yang sudah tersimpan di memory
  if (bluetoothPrinterDevice && bluetoothPrinterDevice.gatt) {
    try {
      if (!silent) showToast("Menyambungkan kembali ke printer Bluetooth...", "info");
      isConnectingBluetooth = true;
      updatePrinterStatusBadge();

      let server = bluetoothPrinterDevice.gatt;
      if (!bluetoothPrinterDevice.gatt.connected) {
        server = await bluetoothPrinterDevice.gatt.connect();
      }

      const writableChar = await discoverPrinterWritableCharacteristic(server);
      if (writableChar) {
        bluetoothPrinterCharacteristic = writableChar;
        isUserExplicitlyDisconnected = false;
        isConnectingBluetooth = false;
        reconnectBackoffMs = 2000;
        updatePrinterStatusBadge();
        if (!silent) showToast(`🟢 Terhubung kembali ke ${bluetoothPrinterDevice.name || 'Printer Bluetooth'}!`, "success");
        return true;
      }
    } catch (e) {
      console.warn("[Bluetooth] Auto-reconnect memory failed:", e);
    } finally {
      isConnectingBluetooth = false;
      updatePrinterStatusBadge();
    }
  }

  // 2. Coba gunakan perangkat yang pernah diizinkan sebelumnya di Google Chrome (Web Bluetooth getDevices)
  if (typeof navigator !== 'undefined' && navigator.bluetooth && typeof navigator.bluetooth.getDevices === 'function') {
    try {
      const devices = await navigator.bluetooth.getDevices();
      if (devices && devices.length > 0) {
        const targetId = pos.settings && pos.settings.lastPrinterId;
        const targetName = pos.settings && pos.settings.lastPrinterName;
        const matched = (targetId && devices.find(d => d.id === targetId)) || 
                        (targetName && devices.find(d => d.name === targetName)) || 
                        devices[0];
        if (matched && matched.gatt) {
          bluetoothPrinterDevice = matched;
          matched.removeEventListener('gattserverdisconnected', onBluetoothDisconnected);
          matched.addEventListener('gattserverdisconnected', onBluetoothDisconnected);

          if (typeof matched.watchAdvertisements === 'function' && !matched._watchingAds) {
            matched._watchingAds = true;
            matched.watchAdvertisements().then(() => {
              matched.addEventListener('advertisementreceived', async () => {
                if (!isBluetoothConnected() && !isUserExplicitlyDisconnected) {
                  console.log("[Bluetooth] Sinyal iklan printer terdeteksi, langsung menyambungkan...");
                  await ensureBluetoothConnected(true);
                }
              }, { once: true });
            }).catch(() => {});
          }

          isConnectingBluetooth = true;
          updatePrinterStatusBadge();

          let server = matched.gatt;
          if (!matched.gatt.connected) {
            server = await matched.gatt.connect();
          }

          const writableChar = await discoverPrinterWritableCharacteristic(server);
          if (writableChar) {
            bluetoothPrinterCharacteristic = writableChar;
            isUserExplicitlyDisconnected = false;
            isConnectingBluetooth = false;
            reconnectBackoffMs = 2000;
            if (matched.id && pos.settings) {
              pos.settings.lastPrinterId = matched.id;
              if (matched.name) pos.settings.lastPrinterName = matched.name;
              pos.saveSettings();
            }
            updatePrinterStatusBadge();
            if (!silent) showToast(`🟢 Terhubung kembali ke ${matched.name || 'Printer Bluetooth'}!`, "success");
            return true;
          }
        }
      }
    } catch (e) {
      console.warn("[Bluetooth] getDevices reconnect error:", e);
    } finally {
      isConnectingBluetooth = false;
      updatePrinterStatusBadge();
    }
  }

  return false;
}

function disconnectBluetoothPrinter() {
  isUserExplicitlyDisconnected = true;
  if (bluetoothAutoReconnectTimer) {
    clearInterval(bluetoothAutoReconnectTimer);
    bluetoothAutoReconnectTimer = null;
  }
  if (fastReconnectTimeout) {
    clearTimeout(fastReconnectTimeout);
    fastReconnectTimeout = null;
  }
  if (bluetoothPrinterDevice && bluetoothPrinterDevice.gatt && bluetoothPrinterDevice.gatt.connected && typeof bluetoothPrinterDevice.gatt.disconnect === 'function') {
    try {
      bluetoothPrinterDevice.gatt.disconnect();
    } catch (e) {
      console.warn("Gatt disconnect warning:", e);
    }
  }
  bluetoothPrinterCharacteristic = null;
  isConnectingBluetooth = false;
  updatePrinterStatusBadge();
  showToast("Printer Bluetooth telah diputuskan.", "info");
}

function onBluetoothDisconnected() {
  bluetoothPrinterCharacteristic = null;
  isConnectingBluetooth = false;
  lastDisconnectTime = Date.now();
  updatePrinterStatusBadge();
  console.log("[Bluetooth] Link printer terputus/standby. Menjadwalkan auto-reconnect cerdas...");

  if (!isUserExplicitlyDisconnected && (pos?.settings?.printerDriverMode || 'bluetooth') === 'bluetooth') {
    scheduleSmartBluetoothReconnect();
  }
}

function scheduleSmartBluetoothReconnect() {
  if (fastReconnectTimeout) clearTimeout(fastReconnectTimeout);
  fastReconnectTimeout = setTimeout(async () => {
    if (!isBluetoothConnected() && !isConnectingBluetooth && !isUserExplicitlyDisconnected) {
      console.log(`[Bluetooth] Menjalankan auto-reconnect (jeda ${reconnectBackoffMs}ms)...`);
      const success = await ensureBluetoothConnected(true);
      if (!success) {
        // Eksponensial backoff: 2s -> 4s -> 8s -> maks 20s agar tidak spamming radio BLE
        reconnectBackoffMs = Math.min(20000, Math.round(reconnectBackoffMs * 1.6));
      } else {
        reconnectBackoffMs = 2000;
      }
    }
  }, reconnectBackoffMs);
}

// Watchdog background: menjaga koneksi tetap hidup secara pasif tanpa membanjiri printer dengan byte dummy
function startBluetoothAutoReconnectWatchdog() {
  if (bluetoothAutoReconnectTimer) clearInterval(bluetoothAutoReconnectTimer);

  bluetoothAutoReconnectTimer = setInterval(async () => {
    const mode = (pos?.settings?.printerDriverMode) || 'bluetooth';
    if (mode !== 'bluetooth') return;
    if (isUserExplicitlyDisconnected) return;
    if (isConnectingBluetooth) return;

    if (!isBluetoothConnected()) {
      if (bluetoothPrinterDevice || (pos?.settings?.lastPrinterName && typeof navigator !== 'undefined' && navigator.bluetooth?.getDevices)) {
        console.log("[Bluetooth Watchdog] Mencoba auto-reconnect printer di latar belakang...");
        await ensureBluetoothConnected(true);
      }
    } else {
      // MONITOR PASIF: Jika hardware GATT terputus di level OS, tangani segera
      if (bluetoothPrinterDevice && bluetoothPrinterDevice.gatt && !bluetoothPrinterDevice.gatt.connected) {
        console.warn("[Bluetooth Watchdog] Terdeteksi GATT server terputus.");
        bluetoothPrinterCharacteristic = null;
        updatePrinterStatusBadge();
        scheduleSmartBluetoothReconnect();
      }
    }
  }, 12000); // interval aman 12 detik
}

// Event listener saat kasir kembali ke tab (setelah layar tablet mati / berpindah aplikasi)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    const currentPos = (typeof window !== 'undefined' && window.pos) ? window.pos : null;
    if (!document.hidden && !isBluetoothConnected() && !isUserExplicitlyDisconnected && (currentPos?.settings?.printerDriverMode || 'bluetooth') === 'bluetooth') {
      setTimeout(() => ensureBluetoothConnected(true), 800);
    }
  });
}
if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => {
    const currentPos = (typeof window !== 'undefined' && window.pos) ? window.pos : null;
    if (!isBluetoothConnected() && !isUserExplicitlyDisconnected && (currentPos?.settings?.printerDriverMode || 'bluetooth') === 'bluetooth') {
      setTimeout(() => ensureBluetoothConnected(true), 800);
    }
  });
}

function updatePrinterStatusBadge() {
  const badge = document.getElementById("printer-connection-badge");
  const deviceNameEl = document.getElementById("printer-connected-name");
  const deviceDescEl = document.getElementById("printer-connected-desc");
  const btnConnect = document.getElementById("btn-connect-bluetooth");
  const btnDisconnect = document.getElementById("btn-disconnect-bluetooth");
  const btnTestPrint = document.getElementById("btn-test-print-receipt");
  const banner = document.getElementById("printer-bt-unsupported-banner");

  const connected = isBluetoothConnected();
  const printerName = (bluetoothPrinterDevice && bluetoothPrinterDevice.name) || (pos.settings && pos.settings.lastPrinterName) || "Printer VSC";
  const mode = (pos.settings && pos.settings.printerDriverMode) || 'bluetooth';
  const paperWidth = (pos.settings && pos.settings.paperWidth) || '58mm';
  const isSupported = isBluetoothSupported();

  // Tampilkan banner peringatan jika mode bluetooth dipilih tetapi browser belum mendukung API
  if (banner) {
    if (!isSupported && mode === 'bluetooth') {
      banner.classList.remove("hidden");
    } else {
      banner.classList.add("hidden");
    }
  }

  // Update label tombol test cetak kertas sesuai ukuran kertas aktif
  if (btnTestPrint) {
    btnTestPrint.innerHTML = `<span>⚡</span><span>Test Cetak ${mode === 'system' ? 'USB' : 'Kertas'} (${paperWidth})</span>`;
  }

  // KONDISI 1: MODE DIALOG SISTEM / KABEL USB
  if (mode === 'system') {
    if (badge) {
      badge.textContent = `🟢 Kabel USB Aktif (${paperWidth})`;
      badge.className = "px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800";
    }
    if (deviceNameEl) {
      deviceNameEl.innerHTML = `<span>Printer Kabel USB / Dialog Sistem OS</span> <span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono ${paperWidth === '80mm' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}">${paperWidth}</span>`;
    }
    if (deviceDescEl) {
      deviceDescEl.textContent = `Siap cetak via kabel USB (driver OS). Format kertas thermal: ${paperWidth} (${paperWidth === '80mm' ? '48 kolom karakter' : '32 kolom karakter'}).`;
    }
    if (btnConnect) btnConnect.classList.add("hidden");
    if (btnDisconnect) btnDisconnect.classList.add("hidden");
    return;
  }

  // KONDISI 2: MODE RAWBT ANDROID
  if (mode === 'rawbt') {
    if (badge) {
      badge.textContent = `🟡 Jembatan RawBT (${paperWidth})`;
      badge.className = "px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800";
    }
    if (deviceNameEl) {
      deviceNameEl.innerHTML = `<span>RawBT Print Service (Android)</span> <span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono ${paperWidth === '80mm' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}">${paperWidth}</span>`;
    }
    if (deviceDescEl) {
      deviceDescEl.textContent = `Mengirim perintah cetak ESC/POS ${paperWidth} melalui intent aplikasi RawBT di Android.`;
    }
    if (btnConnect) btnConnect.classList.add("hidden");
    if (btnDisconnect) btnDisconnect.classList.add("hidden");
    return;
  }

  // KONDISI 3: MODE DIRECT WEB BLUETOOTH
  if (deviceDescEl) {
    deviceDescEl.textContent = `Pastikan Bluetooth HP/Laptop dan Printer VSC telah menyala sebelum menghubungkan (Format: ${paperWidth}).`;
  }

  if (badge) {
    if (isConnectingBluetooth) {
      badge.textContent = "Sedang Menghubungkan...";
      badge.className = "px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 animate-pulse";
    } else if (connected) {
      badge.textContent = `🟢 Terhubung: ${printerName} (${paperWidth})`;
      badge.className = "px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800";
    } else if (bluetoothPrinterDevice && bluetoothPrinterDevice.name) {
      badge.textContent = `🟡 Siaga: ${printerName}`;
      badge.className = "px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300";
    } else {
      badge.textContent = "⚪ Belum Terhubung";
      badge.className = "px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600";
    }
  }

  if (deviceNameEl) {
    deviceNameEl.textContent = connected ? printerName : (bluetoothPrinterDevice ? `${printerName} (Siaga)` : "Tidak ada");
  }
  if (btnConnect) {
    btnConnect.classList.toggle("hidden", connected);
  }
  if (btnDisconnect) {
    btnDisconnect.classList.toggle("hidden", !connected && !bluetoothPrinterDevice);
  }
}

// Mengirim data byte bertahap (chunking 20 byte aman standar BLE ATT) agar buffer printer VSC tidak overflow
async function sendBytesToBluetooth(bytes, meta = {}) {
  if (typeof printSpooler !== 'undefined' && printSpooler.enqueue) {
    return await printSpooler.enqueue(bytes, meta);
  }

  const connected = await ensureBluetoothConnected(true);
  if (!connected || !bluetoothPrinterCharacteristic) {
    throw new Error("Printer Bluetooth belum terhubung.");
  }

  const totalBytes = bytes.length;
  const chunkSize = 20;
  const isLargeJob = totalBytes > 1000;
  const chunkDelay = isLargeJob ? 24 : 18;
  const canWrite = Boolean(bluetoothPrinterCharacteristic.properties && bluetoothPrinterCharacteristic.properties.writeWithoutResponse);

  for (let i = 0; i < totalBytes; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    if (canWrite) {
      await bluetoothPrinterCharacteristic.writeValueWithoutResponse(chunk);
    } else {
      await bluetoothPrinterCharacteristic.writeValue(chunk);
    }
    await new Promise(r => setTimeout(r, chunkDelay));
    if (isLargeJob && (i % 500 < chunkSize)) {
      await new Promise(r => setTimeout(r, 60));
    }
  }
}

// =========================================================
// 2. JEMBATAN RAWBT PRINT SERVICE (UNTUK ANDROID)
// =========================================================

function printViaRawBT(bytes) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = window.btoa(binary);

  // Coba kirim via HTTP port RawBT server lokal jika aktif
  fetch('http://localhost:40213/', {
    method: 'POST',
    body: base64
  }).then(res => {
    if (res.ok) {
      showToast("Struk berhasil dikirim ke RawBT!", "success");
    } else {
      triggerRawBtIntent(base64);
    }
  }).catch(() => {
    triggerRawBtIntent(base64);
  });
}

function triggerRawBtIntent(base64) {
  const isAndroid = /Android/i.test(navigator.userAgent);
  if (isAndroid) {
    window.location.href = "rawbt:base64," + base64;
  } else {
    // Pada PC/browser lain, fallback ke download atau info
    alert("RawBT Print Service hanya tersedia untuk perangkat Android. Silakan gunakan mode Web Bluetooth atau Cetak Sistem Browser.");
  }
}

// =========================================================
// 3. MESIN PENERJEMAH ESC/POS (STANDAR THERMAL 58MM - 32 KOLOM)
// =========================================================

class EscPosBuilder {
  constructor(lineWidth = 32) {
    this.buffer = [];
    this.lineWidth = lineWidth;
  }

  // Raw byte appender
  raw(bytes) {
    if (Array.isArray(bytes) || bytes instanceof Uint8Array) {
      for (let i = 0; i < bytes.length; i++) {
        this.buffer.push(bytes[i]);
      }
    } else if (typeof bytes === 'number') {
      this.buffer.push(bytes);
    }
    return this;
  }

  // Teks string Latin-1
  text(str) {
    if (!str) return this;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      this.buffer.push(code > 255 ? 63 : code); // tanda tanya jika non-latin
    }
    return this;
  }

  // Inisialisasi printer
  init() {
    return this.raw([0x1B, 0x40]);
  }

  // Perataan teks (0: Kiri, 1: Tengah, 2: Kanan)
  align(alignment = 0) {
    return this.raw([0x1B, 0x61, alignment]);
  }

  alignLeft() { return this.align(0); }
  alignCenter() { return this.align(1); }
  alignRight() { return this.align(2); }

  // Huruf tebal
  bold(enable = true) {
    return this.raw([0x1B, 0x45, enable ? 0x01 : 0x00]);
  }

  // Ukuran font
  size(doubleWidth = false, doubleHeight = false) {
    let n = 0;
    if (doubleWidth) n |= 0x20;
    if (doubleHeight) n |= 0x10;
    return this.raw([0x1D, 0x21, n]);
  }

  sizeNormal() {
    return this.size(false, false);
  }

  // Ganti baris (Line feed)
  newline() {
    return this.raw(0x0A);
  }

  // Dorong kertas n baris
  feed(lines = 3) {
    return this.raw([0x1B, 0x64, lines]);
  }

  // Potong kertas (Auto-Cutter)
  cut() {
    return this.raw([0x1D, 0x56, 0x41, 0x03]);
  }

  // Garis pemisah putus-putus
  lineDashed(char = '-') {
    return this.text(char.repeat(this.lineWidth)).newline();
  }

  // Teks rata kiri dan kanan (Total panjang pas 32 karakter)
  lineLeftRight(left, right) {
    const l = String(left || '');
    const r = String(right || '');
    const spaceCount = Math.max(1, this.lineWidth - l.length - r.length);
    const line = l + ' '.repeat(spaceCount) + r;
    return this.text(line.substring(0, this.lineWidth)).newline();
  }

  // Hasilkan Uint8Array final
  getBytes() {
    return new Uint8Array(this.buffer);
  }
}

// Memformat struk transaksi kasir ke dalam byte ESC/POS 58mm
function buildReceiptEscPos(trx) {
  const transaction = trx || (typeof lastCompletedTransaction !== 'undefined' ? lastCompletedTransaction : null);
  if (!transaction) return new Uint8Array();

  const is80 = pos.settings.paperWidth === "80mm";
  const lineWidth = is80 ? 48 : 32;
  const builder = new EscPosBuilder(lineWidth);

  const storeName = (pos.settings.storeName || "TOKO SNACK BERKAH").toUpperCase();
  const storeTagline = pos.settings.storeTagline || "Pusat Aneka Camilan & Keripik";
  const storeAddress = pos.settings.storeAddress || "Jl. Raya Jajanan No. 88";
  const storePhone = pos.settings.storePhone ? `Telp: ${pos.settings.storePhone}` : "";
  const storeCode = pos.settings.storeCode || "T088";
  const posNumber = pos.settings.posNumber || "01";
  const cashierName = transaction.cashier || (pos.currentUser ? pos.currentUser.name : "Kasir 1");
  const feedLines = parseInt(pos.settings.printerFeedLines, 10) || 3;

  // 1. HEADER TOKO
  builder.init()
    .alignCenter()
    .bold(true)
    .size(false, true) // Double height agar nama toko jelas
    .text(storeName)
    .newline()
    .sizeNormal()
    .bold(false);

  if (storeTagline) builder.text(storeTagline).newline();
  if (storeAddress) builder.text(storeAddress).newline();
  if (storePhone) builder.text(storePhone).newline();

  builder.lineDashed('-')
    .alignLeft()
    .lineLeftRight(`No. ${transaction.id || 'TRX-001'}`, `${transaction.date || ''}`)
    .lineLeftRight(`Kasir: ${cashierName}`, `${transaction.time || ''}`)
    .lineDashed('-');

  // 2. DAFTAR ITEM BELANJA
  const items = transaction.items || [];
  items.forEach(item => {
    // Baris 1: Nama Produk (potong rapi jika panjang)
    builder.alignLeft().text(item.name).newline();

    // Baris 2: Qty x Harga Satuan (Kiri) & Subtotal (Kanan)
    const isWholesale = item.isWholesale || (item.wholesaleMinQty && item.qty >= item.wholesaleMinQty);
    const itemPrice = item.price || 0;
    const itemTotal = (item.qty || 1) * itemPrice;
    const leftText = `  ${item.qty} x ${formatRupiahSimple(itemPrice)}`;
    const rightText = formatRupiahSimple(itemTotal);

    builder.lineLeftRight(leftText, rightText);

    // Keterangan Penghematan Grosir
    if (isWholesale && item.wholesaleSaved) {
      builder.text(`  [Grosir: Hemat Rp ${formatRupiahSimple(item.wholesaleSaved)}]`).newline();
    }
  });

  builder.lineDashed('-');

  // 3. RINGKASAN PEMBAYARAN
  const subtotal = transaction.subtotal || 0;
  const discount = (transaction.discountAmount || 0) + (transaction.pointDiscount || 0);
  const grandTotal = transaction.payableAmount !== undefined ? transaction.payableAmount : (transaction.grandTotal || subtotal);
  const cashTendered = transaction.cashTendered || grandTotal;
  const changeAmount = transaction.changeAmount || 0;

  builder.lineLeftRight("Subtotal", formatRupiahSimple(subtotal));

  if (discount > 0) {
    builder.lineLeftRight("Total Hemat / Diskon", `-${formatRupiahSimple(discount)}`);
  }

  builder.bold(true)
    .lineLeftRight("TOTAL BELANJA", `Rp ${formatRupiahSimple(grandTotal)}`)
    .bold(false);

  // Detail Metode Pembayaran
  const methodLabel = (transaction.paymentMethod || "Tunai").toUpperCase();
  builder.lineLeftRight(`Bayar (${methodLabel})`, formatRupiahSimple(cashTendered));

  if (changeAmount > 0) {
    builder.lineLeftRight("Kembalian", formatRupiahSimple(changeAmount));
  }

  // 4. INFORMASI MEMBER & LOYALITAS PELANGGAN
  const member = transaction.member || (transaction.memberName || transaction.memberId ? {
    id: transaction.memberId,
    name: transaction.memberName,
    phone: transaction.memberPhone,
    pointsRedeemed: transaction.pointsRedeemed,
    pointsEarned: transaction.memberPoints,
    totalPoints: transaction.memberTotalPoints
  } : null);

  if (member && (member.name || member.id)) {
    const memberName = String(member.name || 'Member');
    const memberPhone = String(member.phone || '-');
    const redeemed = Number(member.pointsRedeemed || transaction.pointsRedeemed || 0);
    const earned = Number(member.pointsEarned !== undefined ? member.pointsEarned : (transaction.memberPoints || 0));
    const totalPts = Number(member.totalPoints !== undefined ? member.totalPoints : (transaction.memberTotalPoints !== undefined ? transaction.memberTotalPoints : (member.points || 0)));

    builder.lineDashed('-')
      .alignLeft()
      .bold(true).text("INFORMASI MEMBER").newline().bold(false)
      .lineLeftRight("Nama Member", memberName)
      .lineLeftRight("No. HP", memberPhone);

    if (redeemed > 0) {
      builder.lineLeftRight("Poin Ditukar", `-${redeemed.toLocaleString('id-ID')} Poin`);
    }

    builder.lineLeftRight("Poin Didapat", `+${earned.toLocaleString('id-ID')} Poin`);
    builder.bold(true).lineLeftRight("TOTAL POIN", `${totalPts.toLocaleString('id-ID')} Poin`).bold(false);
  }

  // 5. FOOTER & UCAPAN TERIMA KASIH
  builder.lineDashed('-')
    .alignCenter();

  if (pos.settings.receiptFooter) {
    builder.text(pos.settings.receiptFooter).newline();
  } else {
    builder.text("Terima Kasih Telah Berbelanja").newline()
      .text("Camilan Enak, Hati Senang!").newline()
      .text("Barang yang sudah dibeli").newline()
      .text("dapat ditukar dalam 1x24 jam").newline();
  }

  // Dorong kertas dan potong
  builder.feed(feedLines)
    .cut();

  return builder.getBytes();
}

// Memformat struk retur penjualan kasir ke dalam byte ESC/POS 58mm / 80mm
function buildReturReceiptEscPos(returRecord) {
  if (!returRecord) return new Uint8Array();

  const is80 = pos.settings.paperWidth === "80mm";
  const lineWidth = is80 ? 48 : 32;
  const builder = new EscPosBuilder(lineWidth);

  const storeName = (pos.settings.storeName || "TOKO SNACK BERKAH").toUpperCase();
  const storeAddress = pos.settings.storeAddress || "Jl. Raya Jajanan No. 88";
  const storePhone = pos.settings.storePhone ? `Telp: ${pos.settings.storePhone}` : "";
  const storeCode = pos.settings.storeCode || "T088";
  const posNumber = pos.settings.posNumber || "01";
  const feedLines = parseInt(pos.settings.printerFeedLines, 10) || 3;

  // 1. HEADER TOKO
  builder.init()
    .alignCenter()
    .bold(true)
    .size(false, true)
    .text(storeName)
    .newline()
    .sizeNormal()
    .bold(false);

  if (storeAddress) builder.text(storeAddress).newline();
  if (storePhone) builder.text(storePhone).newline();

  builder.lineDashed('=')
    .bold(true)
    .text("*** BUKTI RETUR PENJUALAN ***")
    .newline()
    .bold(false)
    .lineDashed('-')
    .alignLeft()
    .lineLeftRight(`No. Retur : ${returRecord.id}`, `${returRecord.date || ''}`)
    .lineLeftRight(`Struk Asal: ${returRecord.originalTrxId}`, `${returRecord.time || ''}`)
    .lineLeftRight(`Kasir     : ${returRecord.cashier || 'Kasir'}`, `Shift: ${returRecord.shift || '1'}`)
    .lineLeftRight(`Toko      : ${storeCode}`, `POS  : ${posNumber}`)
    .lineDashed('-');

  // 2. KETERANGAN & ALASAN RETUR
  builder.text(`Alasan: ${returRecord.reason || 'Kemasan Rusak / Salah Beli'}`).newline();
  builder.text(`Stok  : ${returRecord.restocked ? 'Stok Bertambah (Restok)' : 'Tidak Direstok'}`).newline();
  builder.lineDashed('-');

  // 3. DAFTAR BARANG YANG DIRETUR
  const items = returRecord.items || [];
  items.forEach(item => {
    builder.alignLeft().text(item.name).newline();
    const qty = item.returnQty || 1;
    const price = item.price || 0;
    const subtotal = item.refundSubtotal || (qty * price);
    const left = `  ${qty} ${item.unit || 'pcs'} x ${formatRupiahSimple(price)}`;
    const right = formatRupiahSimple(subtotal);
    builder.lineLeftRight(left, right);
  });

  builder.lineDashed('-');

  // 4. TOTAL REFUND DANA
  builder.bold(true)
    .lineLeftRight("TOTAL REFUND", formatRupiahSimple(returRecord.totalRefund || 0))
    .bold(false);
  builder.lineLeftRight("Metode Refund", "UANG TUNAI KASIR");
  builder.lineDashed('=');

  // 5. KOLOM TANDA TANGAN KASIR/PEJABAT & PELANGGAN
  builder.alignCenter()
    .newline()
    .text(is80 
      ? "Kasir / Pejabat Toko                 Pelanggan Penerima" 
      : "Kasir/Pejabat        Pelanggan"
    )
    .newline()
    .newline()
    .newline()
    .text(is80
      ? `( ${returRecord.cashier || 'Pejabat Toko'} )             ( .................... )`
      : `( ${returRecord.cashier || 'Pejabat'} )     ( ............ )`
    )
    .newline()
    .newline();

  // 6. FOOTER
  builder.alignCenter()
    .text("Barang retur telah diverifikasi.")
    .newline()
    .text("Stok toko & kas telah disesuaikan.")
    .newline()
    .text("Terima kasih.")
    .newline()
    .feed(feedLines)
    .cut();

  return builder.getBytes();
}

// Memformat struk setoran klerk / closing shift kasir ke dalam byte ESC/POS thermal
function buildKlerkReceiptEscPos(klerkRecord) {
  const k = klerkRecord || (typeof activeKlerkRecord !== 'undefined' ? activeKlerkRecord : null) || (typeof lastCompletedKlerk !== 'undefined' ? lastCompletedKlerk : null);
  if (!k) return new Uint8Array();

  const is80 = (pos?.settings?.paperWidth) === "80mm";
  const lineWidth = is80 ? 48 : 32;
  const builder = new EscPosBuilder(lineWidth);

  const storeName = (pos?.settings?.storeName || k.storeName || "TOKO MINIMARKET").toUpperCase();
  const storeAddress = pos?.settings?.storeAddress || "JL. RAYA UTAMA NO. 88";
  const storePhone = pos?.settings?.storePhone ? `TELP: ${pos.settings.storePhone}` : "";
  const posNumber = k.posNumber || pos?.settings?.posNumber || "POS 01";
  const feedLines = parseInt(pos?.settings?.printerFeedLines, 10) || 3;

  const formatRupiahPrinter = (num) => {
    if (num === null || num === undefined || isNaN(num)) return "0";
    return new Intl.NumberFormat("id-ID").format(Math.round(num));
  };

  // 1. HEADER TOKO
  builder.init()
    .alignCenter()
    .bold(true)
    .size(false, true)
    .text(storeName)
    .newline()
    .sizeNormal()
    .bold(false);

  if (storeAddress) builder.text(storeAddress).newline();
  if (storePhone) builder.text(storePhone).newline();

  builder.lineDashed('=')
    .bold(true)
    .text("*** BUKTI SETORAN KASIR (KLERK) ***")
    .newline()
    .text("SETTLEMENT END OF SHIFT")
    .newline()
    .bold(false)
    .lineDashed('-')
    .alignLeft()
    .lineLeftRight(`No. Klerk : ${k.id}`, `${k.date || ''}`)
    .lineLeftRight(`Kasir     : [${k.cashierNik || ''}] ${k.cashierName || 'Kasir'}`, `${k.time || ''}`)
    .lineLeftRight(`Shift/POS : ${k.shift || 'Shift 1'}`, `${posNumber}`)
    .lineDashed('-');

  // 2. PERHITUNGAN KOMPUTER (SETORAN TUNAI)
  builder.bold(true).text("PERHITUNGAN KOMPUTER (SETORAN TUNAI):").newline().bold(false);
  builder.lineLeftRight("  Modal Awal Laci", formatRupiahPrinter(k.initialCash || 0));
  builder.lineLeftRight("  Penjualan Tunai (+)", formatRupiahPrinter(k.cashSales || 0));
  if (k.cashRefunds > 0) {
    builder.lineLeftRight("  Retur Tunai (-)", `-${formatRupiahPrinter(k.cashRefunds)}`);
  }
  builder.bold(true)
    .lineLeftRight("  Saldo Kas Tunai", formatRupiahPrinter(k.expectedCash || 0))
    .bold(false);
  builder.lineDashed('-');

  // 3. NON-TUNAI & TOTAL STRUK
  builder.bold(true).text("NON-TUNAI (INFO REKONSILIASI):").newline().bold(false);
  builder.lineLeftRight("  QRIS", formatRupiahPrinter(k.qrisSales || 0));
  builder.lineLeftRight("  EDC / Debit", formatRupiahPrinter(k.edcSales || 0));
  builder.lineLeftRight("  Total Transaksi", `${k.totalTrxCount || 0} Struk`);
  builder.text("  * Non-tunai tidak masuk fisik kasir").newline();
  builder.lineDashed('-');

  // 4. RINCIAN FISIK LACI
  builder.bold(true).text("RINCIAN FISIK DI LACI:").newline().bold(false);
  const denoms = k.denominations || {};
  const denomKeys = [
    { label: "100.000", val: 100000, key: "100000" },
    { label: " 50.000", val: 50000, key: "50000" },
    { label: " 20.000", val: 20000, key: "20000" },
    { label: " 10.000", val: 10000, key: "10000" },
    { label: "  5.000", val: 5000, key: "5000" },
    { label: "  2.000", val: 2000, key: "2000" },
    { label: "  1.000", val: 1000, key: "1000" }
  ];
  let hasDenoms = false;
  denomKeys.forEach(d => {
    const count = Number(denoms[d.key]) || 0;
    if (count > 0) {
      hasDenoms = true;
      builder.lineLeftRight(`  ${d.label} x ${count}`, formatRupiahPrinter(count * d.val));
    }
  });
  if (Number(denoms.coin) > 0) {
    hasDenoms = true;
    builder.lineLeftRight("  Koin Logam", formatRupiahPrinter(Number(denoms.coin)));
  }
  if (!hasDenoms) {
    builder.lineLeftRight("  Input Total Fisik", formatRupiahPrinter(k.physicalCash || 0));
  }
  builder.bold(true)
    .lineLeftRight("TOTAL FISIK LACI", formatRupiahPrinter(k.physicalCash || 0))
    .bold(false);
  builder.lineDashed('-');

  // 5. HASIL SELISIH KAS TUNAI
  builder.bold(true);
  const isPlus = k.variance > 0;
  const isMinus = k.variance < 0;
  const diffLabel = isPlus ? `+${formatRupiahPrinter(k.variance)} (LEBIH)` : (isMinus ? `-${formatRupiahPrinter(Math.abs(k.variance))} (KURANG)` : "Rp 0 (KLOP)");
  builder.lineLeftRight("SELISIH KAS TUNAI", diffLabel);
  builder.bold(false);

  if (k.note) {
    builder.text(`Catatan: ${k.note}`).newline();
  }
  builder.lineDashed('=');

  // 6. TANDA TANGAN
  builder.alignCenter()
    .newline()
    .text(is80 ? "Kasir Bertugas,                      Pejabat Toko," : "Kasir Bertugas,       Pejabat Toko,")
    .newline()
    .newline()
    .newline()
    .text(is80 ? `( ${k.cashierName || 'Kasir'} )                 ( ${k.supervisor || 'Pejabat'} )` : `( ${k.cashierName || 'Kasir'} )     ( ${k.supervisor || 'Pejabat'} )`)
    .newline()
    .newline()
    .text("Dicetak oleh Sistem Kasir Retail")
    .newline()
    .feed(feedLines)
    .cut();

  return builder.getBytes();
}

// Memformat struk uji coba koneksi mini
function buildTestReceiptEscPos() {
  const is80 = pos.settings.paperWidth === "80mm";
  const lineWidth = is80 ? 48 : 32;
  const builder = new EscPosBuilder(lineWidth);
  const today = new Date().toLocaleString("id-ID");
  const storeName = (pos.settings.storeName || "TOKO SNACK BERKAH").toUpperCase();
  const feedLines = parseInt(pos.settings.printerFeedLines, 10) || 3;

  builder.init()
    .alignCenter()
    .bold(true)
    .size(false, true)
    .text(storeName)
    .newline()
    .sizeNormal()
    .bold(false)
    .lineDashed('=')
    .bold(true)
    .text("TES KONEKSI PRINTER VSC")
    .newline()
    .text("BERHASIL TERHUBUNG! ✅")
    .newline()
    .bold(false)
    .lineDashed('-')
    .alignLeft()
    .text(`Waktu : ${today}`).newline()
    .text(`Mode  : ESC/POS ${is80 ? 'Thermal 80mm' : 'Thermal 58mm'}`).newline()
    .text(`Driver: Web Bluetooth / RawBT`).newline()
    .lineDashed('-')
    .alignCenter()
    .text("Printer VSC Siap Mencetak Struk Kasir!")
    .newline()
    .feed(feedLines)
    .cut();

  return builder.getBytes();
}

// =========================================================
// 4. UNIVERSAL PRINT DISPATCHER
// =========================================================

async function printReceiptUniversal(transaction = null, isAuto = false) {
  const trx = transaction || (typeof lastCompletedTransaction !== 'undefined' ? lastCompletedTransaction : null);
  const mode = pos.settings.printerDriverMode || 'bluetooth';

  if (mode === 'bluetooth') {
    const isConnected = await ensureBluetoothConnected();
    if (isConnected) {
      try {
        showToast("Mencetak struk ke printer VSC Bluetooth...", "info");
        const bytes = buildReceiptEscPos(trx);
        await sendBytesToBluetooth(bytes, { id: trx.id, title: 'Struk Transaksi #' + trx.id, type: 'receipt' });
        showToast("Struk berhasil dicetak di printer VSC! 🖨️", "success");
        return;
      } catch (err) {
        console.warn("Gagal mencetak via Bluetooth:", err);
        showToast(`Gagal kirim ke printer Bluetooth: ${err.message}`, "warning");
      }
    } else {
      if (!isAuto) {
        showToast("Printer Bluetooth belum terhubung. Membuka cetak sistem...", "info");
      } else {
        // Jika auto-print dan Bluetooth belum terhubung, tampilkan info tanpa memblokir kasir
        showToast("Printer Bluetooth belum terhubung.", "info");
        return;
      }
    }
  } else if (mode === 'rawbt') {
    try {
      showToast("Mengirim struk ke RawBT Android...", "info");
      const bytes = buildReceiptEscPos(trx);
      printViaRawBT(bytes);
      return;
    } catch (err) {
      console.warn("Gagal mengirim ke RawBT:", err);
      showToast("Gagal mengirim ke RawBT.", "warning");
      if (isAuto) return;
    }
  }

  // Fallback: Dialog Cetak Sistem Browser (Kabel USB / PC)
  if (mode === 'system' || !isAuto) {
    if (typeof preparePrintableReceipt === 'function') {
      preparePrintableReceipt();
    }
    window.print();
  }
}

async function printReturReceiptUniversal(returRecord = null) {
  const rtr = returRecord || (typeof lastCompletedRetur !== 'undefined' ? lastCompletedRetur : null);
  if (!rtr) {
    showToast("Data struk retur tidak ditemukan untuk dicetak!", "warning");
    return;
  }

  const mode = pos.settings.printerDriverMode || 'bluetooth';

  if (mode === 'bluetooth') {
    const isConnected = await ensureBluetoothConnected();
    if (isConnected) {
      try {
        showToast("Mencetak struk retur ke printer VSC Bluetooth...", "info");
        const bytes = buildReturReceiptEscPos(rtr);
        await sendBytesToBluetooth(bytes, { id: 'test_' + Date.now(), title: 'Struk Uji Coba Printer VSC', type: 'test' });
        showToast("Struk retur berhasil dicetak di printer VSC! 🖨️", "success");
        return;
      } catch (err) {
        console.warn("Gagal cetak retur via Bluetooth:", err);
        showToast(`Gagal kirim ke printer Bluetooth: ${err.message}`, "warning");
      }
    } else {
      showToast("Printer Bluetooth belum terhubung. Menggunakan cetak sistem...", "info");
    }
  } else if (mode === 'rawbt') {
    try {
      showToast("Mengirim struk retur ke RawBT Android...", "info");
      const bytes = buildReturReceiptEscPos(rtr);
      printViaRawBT(bytes);
      return;
    } catch (err) {
      console.warn("Gagal kirim retur ke RawBT:", err);
      showToast("Gagal kirim ke RawBT.", "warning");
    }
  }

  // Fallback: Dialog Cetak Sistem Browser (Kabel USB / PC / Mobile)
  preparePrintableReturReceipt(rtr);
  window.print();
}

function preparePrintableReturReceipt(returRecord) {
  const target = document.getElementById("printable-receipt-container");
  if (!target) return;

  const src = document.getElementById("thermal-receipt-retur-content");
  if (src && src.innerHTML.trim().length > 0) {
    target.innerHTML = src.innerHTML;
    target.className = src.className || "thermal-receipt width-58";
    target.classList.remove("hidden");
    return;
  }

  if (typeof openReturReceiptModal === 'function' && returRecord) {
    openReturReceiptModal(returRecord);
    const newSrc = document.getElementById("thermal-receipt-retur-content");
    if (newSrc && newSrc.innerHTML.trim().length > 0) {
      target.innerHTML = newSrc.innerHTML;
      target.className = newSrc.className || "thermal-receipt width-58";
      target.classList.remove("hidden");
    }
  }
}

async function printKlerkReceiptUniversal(klerkRecord = null) {
  const k = klerkRecord || (typeof activeKlerkRecord !== 'undefined' ? activeKlerkRecord : null) || (typeof lastCompletedKlerk !== 'undefined' ? lastCompletedKlerk : null);
  if (!k) {
    showToast("Data struk klerk tidak ditemukan untuk dicetak!", "warning");
    return;
  }

  const mode = pos?.settings?.printerDriverMode || 'bluetooth';

  if (mode === 'bluetooth') {
    const isConnected = await ensureBluetoothConnected(false);
    if (isConnected) {
      try {
        showToast("Mencetak struk klerk ke printer Thermal Bluetooth...", "info");
        const bytes = buildKlerkReceiptEscPos(k);
        await sendBytesToBluetooth(bytes);
        showToast("Struk klerk berhasil dicetak di printer Thermal! 🖨️", "success");
        if (typeof sfx !== 'undefined' && sfx.success) sfx.success();
        return;
      } catch (err) {
        console.warn("Gagal cetak klerk via Bluetooth:", err);
        showToast(`Gagal kirim ke printer Bluetooth: ${err.message}`, "warning");
      }
    } else {
      showToast("Printer Bluetooth belum terhubung. Menggunakan cetak sistem...", "info");
    }
  } else if (mode === 'rawbt') {
    try {
      showToast("Mengirim struk klerk ke RawBT Android...", "info");
      const bytes = buildKlerkReceiptEscPos(k);
      printViaRawBT(bytes);
      return;
    } catch (err) {
      console.warn("Gagal kirim klerk ke RawBT:", err);
      showToast("Gagal kirim ke RawBT.", "warning");
    }
  }

  // Fallback: Dialog Cetak Sistem Browser (Kabel USB / PC / Mobile)
  preparePrintableKlerkReceipt(k);
  window.print();
}

function preparePrintableKlerkReceipt(klerkRecord = null) {
  const target = document.getElementById("printable-receipt-container");
  if (!target) return;

  const k = klerkRecord || (typeof activeKlerkRecord !== 'undefined' ? activeKlerkRecord : null) || (typeof lastCompletedKlerk !== 'undefined' ? lastCompletedKlerk : null);
  if (k && typeof renderKlerkReceipt === 'function') {
    renderKlerkReceipt(k);
  }

  const src = document.getElementById("thermal-receipt-klerk-content");
  if (src && src.innerHTML.trim().length > 0) {
    target.innerHTML = src.innerHTML;
    target.className = src.className || "thermal-receipt width-58";
    target.classList.remove("hidden");
  }
}

function initUniversalPrinterDriver() {
  updatePrinterStatusBadge();
  const mode = pos?.settings?.printerDriverMode || 'bluetooth';
  if (mode === 'bluetooth') {
    startBluetoothAutoReconnectWatchdog();
    // Silent initial reconnect on startup jika ada printer tersimpan
    setTimeout(() => {
      if (!isBluetoothConnected() && !isUserExplicitlyDisconnected) {
        ensureBluetoothConnected(true);
      }
    }, 1200);
  }
}

async function testPrintReceipt() {
  const mode = (typeof pos !== 'undefined' && pos.settings && pos.settings.printerDriverMode) || 'bluetooth';

  if (mode === 'bluetooth') {
    const isConnected = isBluetoothConnected() || (await ensureBluetoothConnected(false));
    if (!isConnected) {
      const ok = confirm("Printer Bluetooth belum terhubung.\n\nKlik OK untuk mencari dan menghubungkan printer Bluetooth sekarang,\natau klik CANCEL untuk tes cetak via Dialog Sistem Browser (Kabel USB / PDF).");
      if (ok) {
        const connected = await connectBluetoothPrinter();
        if (!connected) return;
      } else {
        showToast("Membuka tes cetak sistem browser...", "info");
        preparePrintableTestReceipt();
        setTimeout(() => { window.print(); }, 120);
        return;
      }
    }

    try {
      showToast("Mengirim teks tes ke printer Bluetooth...", "info");
      const bytes = buildTestReceiptEscPos();
      await sendBytesToBluetooth(bytes, { id: 'test_' + Date.now(), title: 'Struk Uji Coba Printer', type: 'test' });
      showToast("Tes cetak berhasil keluar di printer! 🎉", "success");
      if (typeof sfx !== 'undefined' && sfx.success) sfx.success();
    } catch (err) {
      alert("Gagal melakukan tes cetak Bluetooth: " + err.message + "\n\n💡 Saran: Coba alihkan mode ke 'Dialog Sistem / Kabel USB'.");
    }
  } else if (mode === 'rawbt') {
    try {
      showToast("Mengirim teks tes ke RawBT Android...", "info");
      const bytes = buildTestReceiptEscPos();
      printViaRawBT(bytes);
    } catch (err) {
      alert("Gagal kirim tes ke RawBT: " + err.message);
    }
  } else {
    // Mode dialog sistem (kabel USB / PDF / printer sistem OS)
    showToast("Membuka dialog cetak sistem browser...", "info");
    preparePrintableTestReceipt();
    setTimeout(() => { window.print(); }, 120);
  }
}

window.testPrintReceipt = testPrintReceipt;
window.printTestReceipt = testPrintReceipt;

// Menyiapkan struk uji coba untuk pencetakan kabel USB / Dialog Sistem
function preparePrintableTestReceipt() {
  const is80 = pos.settings && pos.settings.paperWidth === "80mm";
  const storeName = ((pos.settings && pos.settings.storeName) || "TOKO SNACK BERKAH").toUpperCase();
  const storeAddress = (pos.settings && pos.settings.storeAddress) || "Jl. Raya Jajanan No. 88";
  const today = new Date().toLocaleString("id-ID");

  const target = document.getElementById("printable-receipt-container");
  if (!target) return;

  const contentWidth = is80 ? "70mm" : "48mm";
  const fontSize = is80 ? "12px" : "11px";

  target.innerHTML = `
    <div style="font-family: 'Courier New', monospace; font-size: ${fontSize}; width: ${contentWidth}; margin: 0 auto; text-align: center; color: black; line-height: 1.35;">
      <div style="font-weight: bold; font-size: ${is80 ? '15px' : '13px'};">${storeName}</div>
      <div style="font-size: ${is80 ? '11px' : '10px'};">${storeAddress}</div>
      <div style="border-top: 1px dashed black; margin: 6px 0;"></div>
      <div style="font-weight: bold; font-size: ${is80 ? '13px' : '12px'};">TES PRINTER KASIR ${is80 ? '80MM (LEBAR)' : '58MM (STANDAR)'}</div>
      <div style="font-size: 11px; margin: 3px 0;">KONEKSI BERHASIL ✅</div>
      <div style="border-top: 1px dashed black; margin: 6px 0;"></div>
      <div style="text-align: left; font-size: ${is80 ? '11px' : '10px'};">
        <div>Waktu  : ${today}</div>
        <div>Driver : Dialog Sistem / Kabel USB</div>
        <div>Kertas : Thermal ${is80 ? '80mm (48 Karakter)' : '58mm (32 Karakter)'}</div>
        <div>Status : Siap Transaksi Kasir</div>
      </div>
      <div style="border-top: 1px dashed black; margin: 6px 0;"></div>
      <div style="font-size: 10px; margin-top: 5px;">
        *** PRINTER SIAP DIGUNAKAN ***<br>
        Terima Kasih
      </div>
      <div style="height: 12mm;"></div>
    </div>
  `;
  target.className = `thermal-receipt ${is80 ? 'width-80' : 'width-58'}`;
  target.classList.remove("hidden");
}

// Salin URL flag Web Bluetooth Google Chrome ke clipboard
function copyBluetoothFlagUrl() {
  const url = "chrome://flags/#enable-web-bluetooth";
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      showToast("Alamat flag disalin! Tempel di tab baru Chrome.", "success");
    }).catch(() => {
      prompt("Salin alamat flag berikut dan buka di tab baru Google Chrome:", url);
    });
  } else {
    prompt("Salin alamat flag berikut dan buka di tab baru Google Chrome:", url);
  }
}

// Beralih ke mode kabel USB secara instan
function switchToUsbCableMode() {
  if (typeof changePrinterDriverMode === 'function') {
    changePrinterDriverMode('system');
  } else if (typeof pos !== 'undefined' && pos.settings) {
    pos.settings.printerDriverMode = 'system';
    pos.saveSettings();
  }
  const radio = document.getElementById('printer-mode-system');
  if (radio) radio.checked = true;
  if (typeof closeModal === 'function') {
    closeModal('modal-printer-help');
  }
  if (typeof updatePrinterStatusBadge === 'function') {
    updatePrinterStatusBadge();
  }
  showToast("Mode printer dialihkan ke 'Dialog Sistem / Kabel USB' ✅", "success");
}

// =========================================================
// 5. SISTEM CETAK LABEL RAK & BARCODE VIA BLUETOOTH (ESC/POS RASTER)
// Mendukung printer VSC Mini Thermal (58mm/80mm) untuk cetak label rak & stiker kemasan
// =========================================================

const PRINTER_CODE128_PATTERNS = [
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

function drawCode128OnCanvas(ctx, rawText, startX, startY, targetWidth, barHeight) {
  const text = String(rawText || '').trim();
  if (!text) return;

  // Nonaktifkan anti-aliasing penghalusan kanvas agar tepi barcode 1-bit solid murni hitam-putih tanpa blur
  ctx.imageSmoothingEnabled = false;

  const isAllDigits = /^\d+$/.test(text);
  const indices = [];
  let checksum = 0;
  let pos = 1;

  if (isAllDigits && text.length >= 4) {
    // Gunakan Code 128 Set C (Kompresi 2 digit angka per simbol)
    // Panjang simbol berkurang hingga 45%, garis otomatis 2x lebih tebal & tajam terbaca scanner kasir
    indices.push(105); // Start C
    checksum = 105;

    let i = 0;
    while (i < text.length) {
      if (i + 1 < text.length) {
        const val = parseInt(text.substr(i, 2), 10);
        indices.push(val);
        checksum += pos * val;
        pos++;
        i += 2;
      } else {
        // Digit ganjil terakhir: alihkan ke Code B
        indices.push(100); // Switch to Code B
        checksum += pos * 100;
        pos++;
        const val = text.charCodeAt(i) - 32;
        indices.push(val);
        checksum += pos * val;
        pos++;
        i++;
      }
    }
  } else {
    // Code 128 Set B untuk barcode alfanumerik / huruf
    indices.push(104); // Start B
    checksum = 104;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i) - 32;
      const valid = (code >= 0 && code <= 95) ? code : 0;
      indices.push(valid);
      checksum += pos * valid;
      pos++;
    }
  }

  indices.push(checksum % 103);
  indices.push(106); // Stop symbol

  let totalModules = 20; // Quiet zone margin 10 modul di kiri & kanan
  for (const idx of indices) {
    const pat = PRINTER_CODE128_PATTERNS[idx];
    if (pat) {
      for (const ch of pat) totalModules += parseInt(ch, 10);
    }
  }

  // Hitung moduleWidth optimal: minimal 2 dot jika targetWidth cukup agar scanner membaca instan
  let moduleWidth = Math.floor(targetWidth / totalModules);
  if (moduleWidth < 2 && targetWidth >= Math.floor(totalModules * 1.75)) {
    moduleWidth = 2; // Paksa modul 2 dot (0.25mm) untuk standar scanner kasir
  } else if (moduleWidth < 1) {
    moduleWidth = 1;
  }

  const totalBarWidth = totalModules * moduleWidth;
  let curX = Math.round(startX + Math.max(0, Math.floor((targetWidth - totalBarWidth) / 2)));

  ctx.fillStyle = '#000000';
  for (const idx of indices) {
    const pat = PRINTER_CODE128_PATTERNS[idx];
    if (!pat) continue;
    let isBar = true;
    for (const ch of pat) {
      const w = parseInt(ch, 10) * moduleWidth;
      if (isBar) {
        ctx.fillRect(curX, Math.round(startY), w, Math.round(barHeight));
      }
      curX += w;
      isBar = !isBar;
    }
  }
}

function canvasToEscPosRaster(canvas, sliceHeight = 24) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  const bytesPerLine = Math.ceil(width / 8);
  const xL = bytesPerLine % 256;
  const xH = Math.floor(bytesPerLine / 256);

  const bytes = [];

  // 1. Inisialisasi ESC @ sebelum grafis raster dimulai untuk membersihkan sisa buffer kotor
  bytes.push(0x1B, 0x40);

  // 2. Kirim dalam slice-slice horizontal (24 dot per perintah) agar buffer 1KB-2KB printer tidak pernah overflow
  for (let yStart = 0; yStart < height; yStart += sliceHeight) {
    const yEnd = Math.min(yStart + sliceHeight, height);
    const curH = yEnd - yStart;
    const yL = curH % 256;
    const yH = Math.floor(curH / 256);

    // ESC/POS Raster Bit Image: GS v 0 0 xL xH yL yH
    bytes.push(0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH);

    for (let y = yStart; y < yEnd; y++) {
      for (let b = 0; b < bytesPerLine; b++) {
        let byteVal = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = b * 8 + bit;
          if (x < width) {
            const idx = (y * width + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const bVal = data[idx + 2];
            const a = data[idx + 3];
            const luminance = (0.299 * r + 0.587 * g + 0.114 * bVal);
            if (a > 128 && luminance < 175) {
              byteVal |= (0x80 >> bit);
            }
          }
        }
        bytes.push(byteVal);
      }
    }
  }

  // 3. Reset kembali printer state ke default text mode setelah semua slice selesai
  bytes.push(0x1B, 0x40);

  return new Uint8Array(bytes);
}

function generateLabelRasterBytes(product, mode = 'shelf', printableWidth = 384) {
  const canvas = document.createElement('canvas');
  canvas.width = printableWidth;

  const storeName = ((pos.settings && pos.settings.storeName) || "TOKO SNACK BERKAH").toUpperCase();
  const barcodeValue = String(product.barcode || product.sku || product.id || '00000000').trim();
  const pluText = String(product.id || barcodeValue.slice(-4));
  const todayStr = new Date().toLocaleDateString('id-ID');
  const is80 = printableWidth >= 500;
  const marginX = 4;

  if (mode === 'shelf') {
    // Mode 1: Label Rak Gondola Minimarket (Tinggi proporsional pas kelipatan 24 dot: 216 dot pada 58mm, 288 dot pada 80mm)
    const height = is80 ? 288 : 216;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Latar Putih
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, printableWidth, height);

    // Garis Pinggir Bingkai Inset (Aman dari margin fisik printer)
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(marginX, 3, printableWidth - (marginX * 2), height - 6);

    // Header Bar Hitam (Identitas Toko & PLU)
    ctx.fillStyle = '#000000';
    ctx.fillRect(marginX, 3, printableWidth - (marginX * 2), is80 ? 28 : 22);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = is80 ? '900 14px sans-serif' : '900 11.5px sans-serif';
    ctx.fillText(storeName.toUpperCase().substring(0, is80 ? 36 : 24), marginX + 6, is80 ? 20 : 16);
    ctx.font = is80 ? 'bold 12px monospace' : 'bold 9.5px monospace';
    const pluStr = `PLU: ${pluText}`;
    ctx.fillText(pluStr, printableWidth - (is80 ? 110 : 85) - marginX, is80 ? 20 : 16);

    // Nama Produk (Besar, Bold & Jelas)
    ctx.fillStyle = '#000000';
    ctx.font = is80 ? 'bold 19px sans-serif' : 'bold 15px sans-serif';
    const prodName = String(product.name || 'Produk Snack').substring(0, is80 ? 38 : 28);
    ctx.fillText(prodName, marginX + 6, is80 ? 52 : 40);

    // Garis Pembatas
    ctx.lineWidth = 1;
    ctx.beginPath();
    const lineY = is80 ? 60 : 48;
    ctx.moveTo(marginX + 2, lineY);
    ctx.lineTo(printableWidth - marginX - 2, lineY);
    ctx.stroke();

    const price = typeof product.price === 'number' ? product.price : (parseFloat(product.price) || 0);
    const wholesalePrice = typeof product.wholesalePrice === 'number' ? product.wholesalePrice : (parseFloat(product.wholesalePrice) || 0);
    const wholesaleMinQty = parseInt(product.wholesaleMinQty, 10) || 0;
    const hasWholesale = Boolean(wholesaleMinQty > 0 && wholesalePrice > 0 && wholesalePrice < price);
    const leftWidth = Math.floor(printableWidth * 0.58);

    if (hasWholesale) {
      // Barcode di kiri atas
      const barH = is80 ? 56 : 44;
      const barY = is80 ? 68 : 54;
      drawCode128OnCanvas(ctx, barcodeValue, marginX + 4, barY, leftWidth - 14, barH);

      ctx.fillStyle = '#000000';
      ctx.font = is80 ? 'bold 11px monospace' : 'bold 9.5px monospace';
      ctx.fillText(`${barcodeValue} • ${todayStr}`, marginX + 4, is80 ? 138 : 110);

      // Box Grosir Otomatis di kiri bawah (Rapi & Jelas)
      const boxY = is80 ? 148 : 120;
      const boxH = is80 ? 94 : 76;
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(marginX + 2, boxY, leftWidth - 12, boxH);

      ctx.fillStyle = '#000000';
      ctx.fillRect(marginX + 2, boxY, leftWidth - 12, is80 ? 22 : 18);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = is80 ? '900 11px sans-serif' : '900 9.5px sans-serif';
      ctx.fillText("PROMO GROSIR", marginX + 8, boxY + (is80 ? 16 : 13));

      ctx.fillStyle = '#000000';
      ctx.font = is80 ? 'bold 10.5px sans-serif' : 'bold 9px sans-serif';
      ctx.fillText(`Min. ${wholesaleMinQty} ${product.wholesaleUnit || product.unit || 'Pcs'}:`, marginX + 8, boxY + (is80 ? 40 : 34));
      ctx.font = is80 ? '900 15px sans-serif' : '900 12.5px sans-serif';
      ctx.fillText(`@Rp ${formatRupiahSimple(wholesalePrice)}`, marginX + 8, boxY + (is80 ? 68 : 58));
    } else {
      // Tanpa Grosir: Barcode ekstra tinggi agar scanner kasir sangat mudah membaca
      const barH = is80 ? 80 : 60;
      const barY = is80 ? 68 : 54;
      drawCode128OnCanvas(ctx, barcodeValue, marginX + 4, barY, leftWidth - 14, barH);

      ctx.fillStyle = '#000000';
      ctx.font = is80 ? 'bold 12px monospace' : 'bold 10px monospace';
      ctx.fillText(`${barcodeValue} • ${todayStr}`, marginX + 4, is80 ? 164 : 128);

      ctx.fillStyle = '#333333';
      ctx.font = is80 ? 'bold 12px sans-serif' : 'bold 10px sans-serif';
      ctx.fillText(`Kategori: ${product.category || 'Camilan'}`, marginX + 4, is80 ? 198 : 156);
      ctx.font = is80 ? '11px sans-serif' : '9.5px sans-serif';
      ctx.fillText("Produk Pilihan Higienis", marginX + 4, is80 ? 226 : 178);
    }

    // Kolom Kanan: Harga Eceran Super Jelas & Maksimal
    const rightX = leftWidth + 6;
    ctx.fillStyle = '#000000';
    ctx.font = is80 ? 'bold 12px sans-serif' : 'bold 10.5px sans-serif';
    ctx.fillText("HARGA JUAL", rightX, is80 ? 84 : 68);

    const priceText = formatRupiahSimple(price);
    ctx.font = is80 ? 'bold 17px sans-serif' : 'bold 13.5px sans-serif';
    ctx.fillText("Rp", rightX, is80 ? 128 : 100);

    // Skala font harga jika angka panjang
    if (priceText.length > 7) {
      ctx.font = is80 ? '900 30px sans-serif' : '900 23px "Arial Black", Impact, sans-serif';
      ctx.fillText(priceText, rightX + (is80 ? 28 : 22), is80 ? 130 : 102);
    } else {
      ctx.font = is80 ? '900 40px sans-serif' : '900 30px "Arial Black", Impact, sans-serif';
      ctx.fillText(priceText, rightX + (is80 ? 32 : 25), is80 ? 132 : 104);
    }

    ctx.font = is80 ? 'bold 12px sans-serif' : 'bold 10px sans-serif';
    ctx.fillText(`Per ${product.unit || 'Bungkus'}`, rightX, is80 ? 164 : 128);

    ctx.font = is80 ? 'bold 10.5px sans-serif' : 'bold 9px sans-serif';
    ctx.fillStyle = '#444444';
    ctx.fillText("HEMAT & TERJANGKAU", rightX, is80 ? 198 : 156);
    ctx.fillText(`Update: ${todayStr}`, rightX, is80 ? 226 : 178);

    return canvasToEscPosRaster(canvas, 24);
  } else {
    // Mode 2: Stiker Kemasan Snack Repacking (Kelipatan 24 dot: 168 dot pada 58mm, 240 dot pada 80mm)
    const height = is80 ? 240 : 168;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Latar Putih
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, printableWidth, height);

    // Bingkai
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(marginX, 3, printableWidth - (marginX * 2), height - 6);

    // Identitas Toko / Netto
    ctx.fillStyle = '#000000';
    ctx.font = is80 ? 'bold 13px sans-serif' : 'bold 10.5px sans-serif';
    const headerInfo = `${storeName}${product.unit ? ' • ' + product.unit : ''}`;
    ctx.textAlign = 'center';
    ctx.fillText(headerInfo.substring(0, is80 ? 40 : 32), printableWidth / 2, is80 ? 24 : 18);

    // Nama Produk
    ctx.font = is80 ? 'bold 19px sans-serif' : 'bold 15px sans-serif';
    const prodName = String(product.name || 'Snack Lezat').substring(0, is80 ? 34 : 26);
    ctx.fillText(prodName, printableWidth / 2, is80 ? 54 : 40);

    // Barcode Tengah
    ctx.textAlign = 'left';
    const barW = printableWidth - (is80 ? 64 : 40);
    const barX = (printableWidth - barW) / 2;
    drawCode128OnCanvas(ctx, barcodeValue, barX, is80 ? 66 : 50, barW, is80 ? 64 : 48);

    // Barcode Text
    ctx.textAlign = 'center';
    ctx.font = is80 ? 'bold 14px monospace' : 'bold 11px monospace';
    ctx.fillText(barcodeValue, printableWidth / 2, is80 ? 150 : 114);

    // Slogan Kualitas
    ctx.font = is80 ? '11px sans-serif' : '9px sans-serif';
    ctx.fillText("Snack Renyah, Gurih & Terjamin Higienis", printableWidth / 2, is80 ? 176 : 134);

    return canvasToEscPosRaster(canvas, 24);
  }
}

// Mencetak label langsung ke printer VSC Bluetooth via format ESC/POS Raster
async function printLabelsToBluetooth(products, copies = 1, mode = 'shelf', format = 'thermal-58') {
  if (!products || products.length === 0) {
    showToast("Pilih minimal 1 produk untuk dicetak!", "warning");
    return;
  }

  const isConnected = await ensureBluetoothConnected();
  if (!isConnected) {
    const ok = confirm("Printer Bluetooth belum terhubung.\n\nApakah Anda ingin mencari dan menghubungkan printer VSC sekarang?");
    if (ok) {
      const connected = await connectBluetoothPrinter();
      if (!connected) return;
    } else {
      return;
    }
  }

  const is80 = format === 'thermal-80' || (pos.settings && pos.settings.paperWidth === '80mm');
  const printableWidth = is80 ? 576 : 384;
  const totalCount = products.length * copies;

  showToast(`Menyiapkan ${totalCount} label ke printer VSC Bluetooth...`, "info");

  const builder = new EscPosBuilder(is80 ? 48 : 32);
  builder.init();

  for (let pIdx = 0; pIdx < products.length; pIdx++) {
    const product = products[pIdx];
    const rasterBytes = generateLabelRasterBytes(product, mode, printableWidth);

    for (let c = 0; c < copies; c++) {
      builder.raw(rasterBytes);
      // Spasi antar label bersih tanpa karakter teks minus '-' yang merusak format label
      builder.raw([0x1B, 0x64, 0x02]); // Feed 2 baris dot bersih
    }
  }

  // Di akhir dokumen, dorong kertas 3 baris agar posisi pas di gerigi sobekan
  builder.raw([0x1B, 0x64, 0x03]);
  // Tanpa builder.cut() karena printer thermal 58mm Bluetooth portabel tidak memiliki pemotong otomatis

  try {
    const allBytes = builder.getBytes();
    showToast(`Mengirim ${totalCount} label ke printer VSC...`, "info");
    await sendBytesToBluetooth(allBytes, { id: 'label_' + Date.now(), title: 'Cetak ' + totalCount + ' Label (' + (mode === 'shelf' ? 'Rak' : 'Stiker') + ')', type: 'label' });
    showToast(`Berhasil mencetak ${totalCount} label di printer VSC! 🎉`, "success");
    if (typeof sfx !== 'undefined' && sfx.success) sfx.success();
  } catch (err) {
    console.error("Gagal mencetak label Bluetooth:", err);
    alert("Gagal mencetak label ke printer VSC: " + err.message);
  }
}

// =========================================================
// 10. CETAK STRUK LPB (BUKTI PENERIMAAN BARANG)
// =========================================================

/**
 * Membangun byte perintah ESC/POS untuk Struk LPB (Thermal 58mm / 80mm).
 */
function buildLpbReceiptEscPos(lpbDoc) {
  if (!lpbDoc) return new Uint8Array();

  const storeName = (pos.settings.storeName || "TOKO SNACK BERKAH").toUpperCase();
  const storeAddress = pos.settings.storeAddress || "";
  const storePhone = pos.settings.storePhone || "";
  const lineWidth = (pos.settings.paperWidth === "80mm") ? 48 : 32;

  const sep = "-".repeat(lineWidth);
  const sepD = "=".repeat(lineWidth);

  function padRight(str, len) { return String(str).slice(0, len).padEnd(len, " "); }
  function padLeft(str, len) { return String(str).slice(0, len).padStart(len, " "); }
  function formatRp(num) { return "Rp " + Number(num || 0).toLocaleString("id-ID"); }

  const builder = new EscPosBuilder();

  // ---- Header ----
  builder.init();
  builder.align("center");
  builder.bold(true);
  builder.text(storeName + "\n");
  builder.bold(false);
  if (storeAddress) builder.text(storeAddress + "\n");
  if (storePhone) builder.text("Telp: " + storePhone + "\n");
  builder.text(sep + "\n");
  builder.bold(true);
  builder.text("BUKTI PENERIMAAN BARANG\n");
  builder.text("(LEMBAR LPB)\n");
  builder.bold(false);
  builder.text(sep + "\n");

  // ---- Info Dokumen ----
  builder.align("left");
  builder.text("No. LPB  : " + lpbDoc.id + "\n");
  builder.text("Tanggal  : " + lpbDoc.date + " " + (lpbDoc.time || "") + "\n");
  builder.text("Supplier : " + (lpbDoc.supplierName || "-") + "\n");
  builder.text("Faktur   : " + (lpbDoc.invoiceNo || "-") + "\n");
  builder.text("Bayar    : " + (lpbDoc.paymentType || "KREDIT") + "\n");
  if (lpbDoc.note) builder.text("Catatan  : " + lpbDoc.note + "\n");
  builder.text("Operator : " + (lpbDoc.operator || "Kepala Toko") + "\n");
  builder.text(sep + "\n");

  // ---- Item Lines ----
  (lpbDoc.items || []).forEach((item, idx) => {
    if (lineWidth >= 42) {
      builder.text((idx + 1) + ". " + item.productName + "\n");
      const qtyHpp = "   " + item.qty + " pcs x " + formatRp(item.costPrice);
      const subStr = formatRp(item.subtotal);
      builder.text(padRight(qtyHpp, Math.max(0, lineWidth - subStr.length)) + subStr + "\n");
    } else {
      const shortName = (item.productName || "").slice(0, 14);
      const qtyStr = item.qty + "x";
      const subStr = formatRp(item.subtotal);
      builder.text(padRight(shortName, 14) + padLeft(qtyStr, 4) + padLeft(subStr, 14) + "\n");
    }
  });

  builder.text(sep + "\n");

  // ---- Total ----
  builder.bold(true);
  builder.text("TOTAL SKU : " + (lpbDoc.totalItems || (lpbDoc.items ? lpbDoc.items.length : 0)) + "  |  QTY : " + (lpbDoc.totalQty || 0) + "\n");
  builder.text("TOTAL NILAI : " + formatRp(lpbDoc.totalValue || 0) + "\n");
  builder.bold(false);
  builder.text(sepD + "\n");

  // ---- Tanda Tangan ----
  builder.align("center");
  builder.text("\n");
  builder.text("Diterima Oleh,       Supplier,\n");
  builder.text("\n\n\n");
  builder.text("(" + padRight(lpbDoc.operator || "Petugas", 14) + ") (____________)\n");
  builder.text("\nTerima kasih atas kerjasamanya.\n");
  builder.text(sep + "\n");

  builder.feed(parseInt(pos.settings.printerFeedLines, 10) || 3);
  builder.cut();

  return builder.getBytes();
}

/**
 * Menyiapkan format HTML struk thermal LPB ke dalam container print (#printable-receipt-container).
 */
function preparePrintableLpbReceipt(lpbDoc) {
  const target = document.getElementById("printable-receipt-container");
  if (!target || !lpbDoc) return;

  const storeName = (pos.settings.storeName || "TOKO SNACK BERKAH").toUpperCase();
  const storeAddress = pos.settings.storeAddress || "";
  const storePhone = pos.settings.storePhone || "";
  const isWidth80 = pos.settings.paperWidth === "80mm";

  target.className = `thermal-receipt ${isWidth80 ? 'width-80' : 'width-58'}`;
  target.classList.remove("hidden");

  const itemsHtml = (lpbDoc.items || []).map((item, idx) => `
    <div style="margin-bottom: 4px;">
      <div style="font-weight: bold; font-size: 1em;">${idx + 1}. ${item.productName || '-'}</div>
      <div style="display: flex; justify-content: space-between; font-size: 0.9em;">
        <span>${item.qty} pcs x ${formatRupiah(item.costPrice || 0)}</span>
        <span style="font-weight: bold;">${formatRupiah(item.subtotal || 0)}</span>
      </div>
      <div style="font-size: 0.8em; color: #444;">PLU: ${item.barcode || item.productId || '-'}</div>
    </div>
  `).join("");

  target.innerHTML = `
    <div style="text-align: center; margin-bottom: 6px;">
      <div style="font-size: 1.15em; font-weight: 900; text-transform: uppercase;">${storeName}</div>
      ${storeAddress ? `<div style="font-size: 0.85em; margin-top: 1px;">${storeAddress}</div>` : ''}
      ${storePhone ? `<div style="font-size: 0.85em;">Telp: ${storePhone}</div>` : ''}
      <div class="receipt-double-line"></div>
      <div style="font-weight: 900; font-size: 1.05em; margin: 4px 0 2px 0;">BUKTI PENERIMAAN BARANG</div>
      <div style="font-weight: bold; font-size: 0.9em;">(LEMBAR LPB)</div>
      <div class="receipt-dashed-line"></div>
    </div>

    <div style="font-size: 0.9em; margin-bottom: 6px; line-height: 1.45;">
      <div style="display: flex; justify-content: space-between;"><span>No. LPB</span><strong style="font-family: monospace;">${lpbDoc.id}</strong></div>
      <div style="display: flex; justify-content: space-between;"><span>Waktu</span><span>${lpbDoc.date} ${lpbDoc.time || ''}</span></div>
      <div style="display: flex; justify-content: space-between;"><span>Supplier</span><strong>${lpbDoc.supplierName || '-'}</strong></div>
      <div style="display: flex; justify-content: space-between;"><span>No. Faktur</span><span>${lpbDoc.invoiceNo || '-'}</span></div>
      <div style="display: flex; justify-content: space-between;"><span>Pembayaran</span><strong>${lpbDoc.paymentType || 'KREDIT'}</strong></div>
      <div style="display: flex; justify-content: space-between;"><span>Petugas</span><span>${lpbDoc.operator || 'Kepala Toko'}</span></div>
      ${lpbDoc.note ? `<div style="margin-top: 2px;"><span>Catatan:</span> ${lpbDoc.note}</div>` : ''}
    </div>

    <div class="receipt-dashed-line"></div>
    <div style="margin: 6px 0;">
      ${itemsHtml}
    </div>
    <div class="receipt-dashed-line"></div>

    <div style="font-size: 0.95em; margin: 6px 0; line-height: 1.5;">
      <div style="display: flex; justify-content: space-between;">
        <span>Total SKU / Qty</span>
        <strong>${lpbDoc.totalItems || (lpbDoc.items ? lpbDoc.items.length : 0)} SKU / ${lpbDoc.totalQty || 0} pcs</strong>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 1.1em; font-weight: 900; margin-top: 4px; border-top: 1px dashed #000; padding-top: 4px;">
        <span>TOTAL NILAI LPB</span>
        <span>${formatRupiah(lpbDoc.totalValue || 0)}</span>
      </div>
    </div>

    <div class="receipt-double-line"></div>

    <div style="margin-top: 14px; text-align: center; font-size: 0.85em;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 40px;">
        <span style="width: 45%;">Diterima Oleh,</span>
        <span style="width: 45%;">Supplier / Pengirim,</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="width: 45%; border-top: 1px solid #000; padding-top: 2px;">(${lpbDoc.operator || 'Petugas Toko'})</span>
        <span style="width: 45%; border-top: 1px solid #000; padding-top: 2px;">(...........................)</span>
      </div>
      <div style="margin-top: 10px; font-size: 0.8em; color: #555;">Dokumen sah penerimaan stok toko</div>
    </div>
  `;
}

/**
 * Mencetak struk LPB secara Universal: mendukung Bluetooth VSC, RawBT Android, dan Cetak Sistem Browser (Kabel/PC).
 * @param {Object} lpbDoc - Dokumen LPB
 */
async function printLpbReceiptUniversal(lpbDoc) {
  if (!lpbDoc) {
    showToast("Data dokumen LPB tidak ditemukan untuk dicetak!", "warning");
    return;
  }

  const mode = pos?.settings?.printerDriverMode || 'bluetooth';

  if (mode === 'bluetooth') {
    const isConnected = await ensureBluetoothConnected();
    if (isConnected) {
      try {
        showToast("Mencetak struk LPB ke printer Bluetooth...", "info");
        const bytes = buildLpbReceiptEscPos(lpbDoc);
        await sendBytesToBluetooth(bytes);
        showToast("Struk LPB berhasil dicetak di printer! 🖨️", "success");
        if (typeof sfx !== 'undefined' && sfx.success) sfx.success();
        return;
      } catch (err) {
        console.warn("Gagal cetak LPB via Bluetooth:", err);
        showToast(`Gagal kirim Bluetooth: ${err.message}. Membuka cetak sistem...`, "warning");
      }
    } else {
      showToast("Printer Bluetooth belum terhubung. Menggunakan cetak sistem...", "info");
    }
  } else if (mode === 'rawbt') {
    try {
      showToast("Mengirim struk LPB ke RawBT Android...", "info");
      const bytes = buildLpbReceiptEscPos(lpbDoc);
      printViaRawBT(bytes);
      if (typeof sfx !== 'undefined' && sfx.success) sfx.success();
      return;
    } catch (err) {
      console.warn("Gagal kirim LPB ke RawBT:", err);
      showToast("Gagal kirim ke RawBT. Membuka cetak sistem...", "warning");
    }
  }

  // Fallback / Mode System: Dialog Cetak Sistem Browser (Kabel USB / PC / Mobile)
  preparePrintableLpbReceipt(lpbDoc);
  window.print();
  if (typeof sfx !== 'undefined' && sfx.success) sfx.success();
}

/**
 * Alias backward-compatible untuk pemanggilan cetak LPB lama.
 */
async function generateLpbReceiptBytes(lpbDoc) {
  return await printLpbReceiptUniversal(lpbDoc);
}


function updateBluetoothUI() {
  const badge = document.getElementById("bluetooth-status-indicator");
  const label = document.getElementById("bluetooth-status-label");
  const widget = document.getElementById("print-spooler-widget");
  const jobTitleEl = document.getElementById("spooler-job-title");
  const percentEl = document.getElementById("spooler-progress-percent");
  const progressBar = document.getElementById("spooler-progress-bar");
  const queueCountEl = document.getElementById("spooler-queue-count");
  const statusDescEl = document.getElementById("spooler-status-desc");

  const connected = isBluetoothConnected();
  const devName = (bluetoothPrinterDevice && bluetoothPrinterDevice.name) || (typeof pos !== "undefined" && pos.settings && pos.settings.lastPrinterName) || "VSC";
  const shortDev = devName.length > 10 ? (devName.substring(0, 8) + '..') : devName;

  const isBusy = typeof printSpooler !== 'undefined' && (printSpooler.isProcessing || printSpooler.queue.length > 0);

  // 1. UPDATE HEADER BADGE (Modern Retail Button & Micro Status Dot)
  const printerDot = document.getElementById("printer-status-dot");
  if (badge) {
    badge.className = "flex items-center gap-1.5 text-white/90 hover:text-white active:scale-95 transition cursor-pointer font-bold px-2 py-0.5 rounded-full hover:bg-white/10";
    
    if (isBusy) {
      if (printerDot) printerDot.className = "w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping";
      badge.title = `Sedang mencetak... ${(printSpooler && printSpooler.currentJob) ? printSpooler.currentJob.progress + '%' : ''}`;
      if (label) label.textContent = "Mencetak...";
    } else if (connected) {
      if (printerDot) printerDot.className = "w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse";
      badge.title = `Printer ${devName} Terhubung & Siap. Klik untuk Setting / Rekonek.`;
      if (label) label.textContent = "Printer Siap";
    } else if (isConnectingBluetooth || startupAutoConnectActive) {
      if (printerDot) printerDot.className = "w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse";
      badge.title = `Sedang menghubungkan ke ${devName}...`;
      if (label) label.textContent = "Konek...";
    } else {
      const hasSaved = Boolean(typeof pos !== 'undefined' && pos.settings && (pos.settings.lastPrinterName || pos.settings.lastPrinterId));
      if (hasSaved) {
        if (printerDot) printerDot.className = "w-1.5 h-1.5 rounded-full bg-emerald-500/80";
        badge.title = `Printer ${devName} Siaga. Klik untuk menyambungkan kembali.`;
        if (label) label.textContent = "Printer Siaga";
      } else {
        if (printerDot) printerDot.className = "w-1.5 h-1.5 rounded-full bg-slate-400";
        badge.title = "Status Printer Bluetooth • Klik untuk Hubungkan / Menu Printer";
        if (label) label.textContent = "Printer Off";
      }
    }
  }

  // Update indikator printer sub-header HP
  const mobilePrinterDot = document.getElementById("mobile-printer-dot");
  const mobilePrinterLabel = document.getElementById("mobile-printer-label");
  if (mobilePrinterDot) {
    if (isBusy) {
      mobilePrinterDot.className = "w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping";
      if (mobilePrinterLabel) mobilePrinterLabel.textContent = "Mencetak...";
    } else if (connected) {
      mobilePrinterDot.className = "w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse";
      if (mobilePrinterLabel) mobilePrinterLabel.textContent = "Printer Siap";
    } else if (isConnectingBluetooth || startupAutoConnectActive) {
      mobilePrinterDot.className = "w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse";
      if (mobilePrinterLabel) mobilePrinterLabel.textContent = "Konek...";
    } else {
      const hasSaved = Boolean(typeof pos !== 'undefined' && pos.settings && (pos.settings.lastPrinterName || pos.settings.lastPrinterId));
      if (hasSaved) {
        mobilePrinterDot.className = "w-1.5 h-1.5 rounded-full bg-emerald-500/80";
        if (mobilePrinterLabel) mobilePrinterLabel.textContent = "Printer Siaga";
      } else {
        mobilePrinterDot.className = "w-1.5 h-1.5 rounded-full bg-slate-400";
        if (mobilePrinterLabel) mobilePrinterLabel.textContent = "Printer Off";
      }
    }
  }

  // 2. UPDATE FLOATING SPOOLER WIDGET
  if (widget && typeof printSpooler !== 'undefined') {
    if (isBusy) {
      if (printSpooler.hideWidgetTimer) {
        clearTimeout(printSpooler.hideWidgetTimer);
        printSpooler.hideWidgetTimer = null;
      }

      widget.classList.remove("hidden");
      widget.classList.add("active");
      widget.classList.remove("closing");

      // Proteksi sentuhan HP: nonaktifkan tombol Batal selama 800ms pertama saat widget muncul
      const cancelBtn = document.getElementById("btn-spooler-cancel");
      if (cancelBtn && !widget.classList.contains("active")) {
        cancelBtn.style.pointerEvents = "none";
        cancelBtn.style.opacity = "0.4";
        if (printSpooler.cancelCooldownTimer) clearTimeout(printSpooler.cancelCooldownTimer);
        printSpooler.cancelCooldownTimer = setTimeout(() => {
          const b = document.getElementById("btn-spooler-cancel");
          if (b) {
            b.style.pointerEvents = "auto";
            b.style.opacity = "1";
          }
        }, 800);
      }

      const cur = printSpooler.currentJob;
      const progress = cur ? cur.progress : 0;
      const title = cur ? cur.title : "Menyiapkan data cetak...";
      const remaining = printSpooler.queue.length;

      if (jobTitleEl) jobTitleEl.textContent = title;
      if (percentEl) percentEl.textContent = progress + "%";
      if (progressBar) progressBar.style.width = progress + "%";
      if (queueCountEl) queueCountEl.textContent = remaining > 0 ? ("Antrean: " + remaining + " tugas") : "Antrean: 0 tugas";
      if (statusDescEl) {
        statusDescEl.textContent = progress >= 100 ? "Selesai mencetak! ✓" : "Mengirim data ke printer...";
      }
    } else {
      if (widget.classList.contains("active") && !printSpooler.hideWidgetTimer) {
        if (statusDescEl) statusDescEl.textContent = "Semua tugas selesai ✓";
        if (progressBar) progressBar.style.width = "100%";
        if (percentEl) percentEl.textContent = "100%";

        printSpooler.hideWidgetTimer = setTimeout(() => {
          widget.classList.remove("active");
          widget.classList.add("closing");
          setTimeout(() => {
            widget.classList.remove("closing");
            widget.classList.add("hidden");
          }, 400);
          printSpooler.hideWidgetTimer = null;
        }, 900);
      } else if (!widget.classList.contains("active")) {
        widget.classList.add("hidden");
      }
    }
  }
}


// =========================================================
// INISIALISASI OTOMATIS SAAT STARTUP & SETELAH REFRESH HALAMAN
// =========================================================

let hasRegisteredFirstGesture = false;

function setupFirstInteractionBluetoothReconnect() {
  if (hasRegisteredFirstGesture) return;
  hasRegisteredFirstGesture = true;

  const onFirstTouch = async () => {
    // Bersihkan listener agar hanya terpanggil 1 kali pada sentuhan pertama
    window.removeEventListener('click', onFirstTouch, true);
    window.removeEventListener('touchstart', onFirstTouch, true);
    window.removeEventListener('keydown', onFirstTouch, true);

    const mode = pos?.settings?.printerDriverMode || 'bluetooth';
    if (mode === 'bluetooth' && !isBluetoothConnected() && !isUserExplicitlyDisconnected) {
      const hasSavedPrinter = Boolean(pos?.settings?.lastPrinterName || pos?.settings?.lastPrinterId);
      if (hasSavedPrinter) {
        console.log("[Bluetooth] Interaksi kasir pertama terdeteksi. Menyambungkan kembali ke printer...");
        await ensureBluetoothConnected(true);
      }
    }
  };

  window.addEventListener('click', onFirstTouch, { once: true, capture: true });
  window.addEventListener('touchstart', onFirstTouch, { once: true, capture: true });
  window.addEventListener('keydown', onFirstTouch, { once: true, capture: true });
}

let startupAutoConnectActive = false;

async function initBluetoothOnStartup() {
  const mode = pos?.settings?.printerDriverMode || 'bluetooth';
  if (mode !== 'bluetooth') {
    if (typeof updateBluetoothUI === 'function') updateBluetoothUI();
    return;
  }

  const hasSavedPrinter = Boolean(pos?.settings?.lastPrinterName || pos?.settings?.lastPrinterId);
  if (!hasSavedPrinter) {
    if (typeof updateBluetoothUI === 'function') updateBluetoothUI();
    return;
  }

  // Tampilkan status "KONEK VSC..." agar kasir tahu sistem sedang menyambung kembali
  startupAutoConnectActive = true;
  if (typeof updateBluetoothUI === 'function') updateBluetoothUI();

  // Aktifkan watchdog & sentuhan kasir sebagai akselerator
  startBluetoothAutoReconnectWatchdog();
  setupFirstInteractionBluetoothReconnect();

  // Siklus Percobaan Bertahap (Menyesuaikan waktu reset hardware BLE printer 1.5s - 2.5s setelah refresh)
  const retryIntervals = [700, 1400, 2200, 3200, 4500];

  for (let i = 0; i < retryIntervals.length; i++) {
    if (isBluetoothConnected() || isUserExplicitlyDisconnected) break;

    await new Promise(r => setTimeout(r, retryIntervals[i]));
    if (isBluetoothConnected() || isUserExplicitlyDisconnected) break;

    try {
      console.log(`[Bluetooth Startup] Mencoba auto-reconnect ke printer (percobaan ${i + 1}/${retryIntervals.length})...`);
      const connected = await ensureBluetoothConnected(true);
      if (connected) {
        console.log(`[Bluetooth Startup] ✅ Berhasil auto-reconnect pada percobaan ke-${i + 1}!`);
        showToast(`🟢 Printer ${pos?.settings?.lastPrinterName || 'VSC'} otomatis terhubung!`, "success", 3500);
        break;
      }
    } catch (err) {
      console.warn(`[Bluetooth Startup] Percobaan ke-${i + 1} tertunda:`, err.message);
    }
  }

  startupAutoConnectActive = false;
  if (typeof updateBluetoothUI === 'function') updateBluetoothUI();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(initBluetoothOnStartup, 150);
    });
  } else {
    setTimeout(initBluetoothOnStartup, 150);
  }
}

// Proteksi anti-refresh tidak sengaja saat koneksi printer Bluetooth sedang aktif
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (typeof isBluetoothConnected === 'function' && isBluetoothConnected()) {
      e.preventDefault();
      e.returnValue = "Koneksi printer Bluetooth sedang aktif. Memuat ulang halaman akan memutus koneksi printer.";
      return e.returnValue;
    }
  });
}

// =========================================================
// MODE CETAK KILAT NATIVE ESC/POS (0.5 DETIK PER LABEL)
// Menghasilkan barcode presisi tinggi langsung dari hardware chip printer ROM (100% terbaca scanner)
// =========================================================

function buildNativeLabelEscPos(product, is80 = false, mode = 'shelf') {
  const storeName = ((pos.settings && pos.settings.storeName) || "TOKO SNACK BERKAH").toUpperCase();
  const barcodeValue = String(product.barcode || product.sku || product.id || '00000000').trim();
  const pluText = String(product.id || barcodeValue.slice(-4));
  const price = typeof product.price === 'number' ? product.price : (parseFloat(product.price) || 0);
  const priceText = formatRupiahSimple(price);
  const unit = product.unit || 'Pcs';
  const prodName = String(product.name || 'Produk').trim();
  const todayStr = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' });
  const lineWidth = is80 ? 48 : 32;

  const builder = new EscPosBuilder(lineWidth);
  builder.init();

  const barBytes = [];
  for (let i = 0; i < barcodeValue.length; i++) {
    barBytes.push(barcodeValue.charCodeAt(i));
  }

  if (mode === 'shelf') {
    // =========================================================================
    // MODE 1: LABEL RAK (ADA HARGANYA - SESUAI DESAIN GAMBAR 1)
    // =========================================================================
    // 1. Header Identitas Toko & PLU/Tgl
    builder.alignLeft().bold(true);
    const storeShort = storeName.substring(0, is80 ? 24 : 14);
    const rightMeta = `PLU:${pluText} • ${todayStr}`;
    builder.lineLeftRight(storeShort, rightMeta);
    builder.lineDashed('-');

    // 2. Deskripsi / Nama Produk (Tengah, Huruf Tebal)
    builder.alignCenter().bold(true);
    const maxLineLen = is80 ? 44 : 30;
    if (prodName.length > maxLineLen) {
      const words = prodName.split(' ');
      let line1 = '', line2 = '';
      for (const w of words) {
        if ((line1 ? line1 + ' ' + w : w).length <= maxLineLen && !line2) {
          line1 = (line1 ? line1 + ' ' + w : w);
        } else {
          line2 = (line2 ? line2 + ' ' + w : w);
        }
      }
      builder.text(line1).newline();
      if (line2) builder.text(line2.substring(0, maxLineLen)).newline();
    } else {
      builder.text(prodName).newline();
    }
    builder.bold(false);

    // 3. Hardware Native Barcode (Code 128 Tebal 2 Dot)
    builder.raw([0x1D, 0x68, 54]); // GS h 54
    builder.raw([0x1D, 0x77, 2]);  // GS w 2
    builder.raw([0x1D, 0x48, 2]);  // GS H 2 (Cetak teks barcode di bawah)
    builder.raw([0x1D, 0x66, 0]);  // GS f 0
    builder.raw([0x1D, 0x6B, 73, barBytes.length + 2, 0x7B, 0x42, ...barBytes]);
    builder.newline();

    builder.lineDashed('-');

    // 4. Harga Jual Jumbo (HARGA Rp ... / Unit)
    builder.alignCenter().bold(true);
    builder.size(false, true); // Double height font
    builder.text(`HARGA: Rp ${priceText}`).newline();
    builder.sizeNormal().bold(false);
    builder.text(`/ ${unit}`).newline();

    // Banner Grosir jika ada
    const wholesalePrice = typeof product.wholesalePrice === 'number' ? product.wholesalePrice : (parseFloat(product.wholesalePrice) || 0);
    const wholesaleMinQty = parseInt(product.wholesaleMinQty, 10) || 0;
    if (wholesaleMinQty > 0 && wholesalePrice > 0 && wholesalePrice < price) {
      builder.text(`GROSIR >=${wholesaleMinQty}: @Rp ${formatRupiahSimple(wholesalePrice)}`).newline();
    }

    builder.lineDashed('=');
  } else {
    // =========================================================================
    // MODE 2: STIKER KEMASAN SNACK (BEBAS HARGA / TANPA HARGA - SESUAI DESAIN GAMBAR 2)
    // =========================================================================
    // 1. Nama Produk (Tengah & Tebal)
    builder.alignCenter().bold(true);
    const maxLineLen = is80 ? 44 : 30;
    if (prodName.length > maxLineLen) {
      const words = prodName.split(' ');
      let line1 = '', line2 = '';
      for (const w of words) {
        if ((line1 ? line1 + ' ' + w : w).length <= maxLineLen && !line2) {
          line1 = (line1 ? line1 + ' ' + w : w);
        } else {
          line2 = (line2 ? line2 + ' ' + w : w);
        }
      }
      builder.text(line1).newline();
      if (line2) builder.text(line2.substring(0, maxLineLen)).newline();
    } else {
      builder.text(prodName).newline();
    }
    builder.bold(false);

    // 2. Info Netto / Toko
    builder.text(`Isi / Netto: ${unit} • ${storeName}`).newline();

    // 3. Hardware Native Barcode (Code 128 Tebal 2 Dot)
    builder.raw([0x1D, 0x68, 56]); // GS h 56
    builder.raw([0x1D, 0x77, 2]);  // GS w 2
    builder.raw([0x1D, 0x48, 2]);  // GS H 2 (Cetak teks angka barcode di bawah garis)
    builder.raw([0x1D, 0x66, 0]);  // GS f 0
    builder.raw([0x1D, 0x6B, 73, barBytes.length + 2, 0x7B, 0x42, ...barBytes]);
    builder.newline();

    // 4. Footer Kualitas & Tanggal (TIDAK ADA HARGA)
    builder.text(`Renyah & Gurih  •  Tgl: ${todayStr}`).newline();
  }

  return builder.getBytes();
}

async function printLabelsNativeFast(products, copies = 1, mode = 'shelf') {
  if (!products || products.length === 0) {
    showToast("Pilih minimal 1 produk untuk dicetak!", "warning");
    return;
  }

  const isConnected = await ensureBluetoothConnected();
  if (!isConnected) {
    const ok = confirm("Printer Bluetooth belum terhubung.\n\nApakah Anda ingin mencari dan menghubungkan printer VSC sekarang?");
    if (ok) {
      const connected = await connectBluetoothPrinter();
      if (!connected) return;
    } else {
      return;
    }
  }

  const is80 = pos.settings && pos.settings.paperWidth === '80mm';
  const totalCount = products.length * copies;
  const labelTypeName = mode === 'shelf' ? 'Label Rak (Ada Harga)' : 'Stiker Snack (Bebas Harga)';
  showToast(`⚡ Mencetak kilat ${totalCount} ${labelTypeName}...`, "info");

  const builder = new EscPosBuilder(is80 ? 48 : 32);
  builder.init();

  for (let pIdx = 0; pIdx < products.length; pIdx++) {
    const product = products[pIdx];
    const labelBytes = buildNativeLabelEscPos(product, is80, mode);

    for (let c = 0; c < copies; c++) {
      builder.raw(labelBytes);
      builder.raw([0x1B, 0x64, 0x02]); // Jeda 2 baris dot bersih
    }
  }

  builder.raw([0x1B, 0x64, 0x03]); // Feed 3 baris di akhir agar bisa disobek

  try {
    const allBytes = builder.getBytes();
    await sendBytesToBluetooth(allBytes, { id: 'fast_label_' + Date.now(), title: 'Cetak Kilat ' + totalCount + ' ' + labelTypeName, type: 'label' });
    showToast(`⚡ Berhasil mencetak ${totalCount} ${labelTypeName}! ✨`, "success");
    if (typeof sfx !== 'undefined' && sfx.success) sfx.success();
  } catch (err) {
    console.error("Gagal mencetak label kilat:", err);
    alert("Gagal mencetak label: " + err.message);
  }
}

window.buildNativeLabelEscPos = buildNativeLabelEscPos;
window.printLabelsNativeFast = printLabelsNativeFast;
window.updateQuickBluetoothModalUI = updateQuickBluetoothModalUI;
window.togglePrinterDriverModeQuick = togglePrinterDriverModeQuick;
window.handleBluetoothIndicatorClick = handleBluetoothIndicatorClick;
window.connectBluetoothPrinter = connectBluetoothPrinter;
window.disconnectBluetoothPrinter = disconnectBluetoothPrinter;
window.printReceiptUniversal = printReceiptUniversal;
window.isBluetoothConnected = isBluetoothConnected;
