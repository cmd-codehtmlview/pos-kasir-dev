/**
 * SnackPOS - Hardware Barcode Scanner & Buffer Interceptor
 */

var globalScannerBuffer = "";
var lastKeyScanTime = 0;

function processScannedBarcode(rawCode) {
  const code = rawCode.trim();
  if (!code) return;

  const barcodeInput = document.getElementById("pos-barcode-search");
  if (barcodeInput) {
    barcodeInput.value = "";
    if (document.activeElement === barcodeInput) {
      barcodeInput.blur();
    }
  }

  let matched = null;
  let targetQty = 1;

  // 1. Cari exact match barcode PLU dasar atau ID
  matched = pos.products.find(p => p.barcode === code || p.id.toLowerCase() === code.toLowerCase());

  // 2. Jika tidak ditemukan, cari di barcode kemasan karton/grosir (wholesaleBarcode)
  if (!matched) {
    for (const p of pos.products) {
      if (p.wholesaleBarcode && p.wholesaleBarcode === code) {
        matched = p;
        targetQty = p.wholesaleMinQty || 12;
        break;
      }
      if (p.hasMultiUnit) {
        if (p.barcodeDus && p.barcodeDus === code) {
          matched = p;
          targetQty = p.dusQty || 24;
          break;
        }
        if (p.barcodeLusin && p.barcodeLusin === code) {
          matched = p;
          targetQty = 12;
          break;
        }
      }
    }
  }

  // 3. Jika masih tidak ditemukan, coba cari substring nama jika kasir mengetik manual
  if (!matched) {
    matched = pos.products.find(p => p.name.toLowerCase().includes(code.toLowerCase()));
  }

  if (matched) {
    addToCart(matched.id, targetQty);
    if (targetQty > 1) {
      showToast(`⚡ SCAN KARTON: +${targetQty} ${matched.name} (Grosir Otomatis)`, "success");
    } else {
      showToast(`⚡ SCAN SUKSES: +1 ${matched.name}`, "success");
    }
    sfx.beep();
  } else {
    showToast(`⚠️ Produk dengan Barcode [${code}] belum terdaftar di katalog toko!`, "warning");
    sfx.warning();
  }
}

function openScannerTestModal() {
  openModal("modal-scanner-test");
  const testInput = document.getElementById("scanner-test-input");
  if (testInput) {
    testInput.value = "";
    setTimeout(() => testInput.focus(), 150);
  }
  const resultBox = document.getElementById("scanner-test-result-box");
  if (resultBox) resultBox.classList.add("hidden");
}

function handleScannerTestResult(code, timeDelta = 0) {
  const codeDisplay = document.getElementById("scanner-test-code");
  const productDisplay = document.getElementById("scanner-test-product");
  const priceDisplay = document.getElementById("scanner-test-price");
  const speedDisplay = document.getElementById("scanner-test-speed");
  const resultBox = document.getElementById("scanner-test-result-box");

  const matched = pos.products.find(p => p.barcode === code || p.id.toLowerCase() === code.toLowerCase());

  if (codeDisplay) codeDisplay.textContent = code;
  if (speedDisplay) speedDisplay.textContent = timeDelta > 0 ? `${timeDelta} ms (Hardware Scanner Cepat)` : `Terbaca Valid (HID Keyboard)`;
  if (productDisplay) {
    productDisplay.textContent = matched ? matched.name : "(Belum terdaftar di katalog produk toko)";
    productDisplay.className = matched ? "text-slate-200 font-sans font-bold text-right max-w-xs truncate" : "text-amber-400 font-sans italic text-right max-w-xs truncate";
  }
  if (priceDisplay) {
    priceDisplay.textContent = matched ? formatRupiah(matched.price) : "-";
  }
  if (resultBox) {
    resultBox.classList.remove("hidden");
  }

  sfx.beep();
  showToast(`✅ Scanner Berhasil Membaca: [${code}]`, "success");

  const testInput = document.getElementById("scanner-test-input");
  if (testInput) {
    testInput.value = "";
    testInput.focus();
  }
}

function focusBarcodeScanner() {
  switchTab("tab-pos");
  const searchInput = document.getElementById("pos-barcode-search");
  if (searchInput) {
    searchInput.focus();
    searchInput.select();
  }
  sfx.beep();
}

// =========================================================
// 3. PEMINDAI BARCODE KAMERA KASIR UTAMA (POS CAMERA SCANNER)
// Mendukung Multi-Scan Realtime dengan Suara & Feedback Keranjang Langsung
// =========================================================

let posHtml5QrCode = null;
let posScannerIsScanning = false;
let posScannerCurrentCameraIndex = 0;
let posScannerAvailableCameras = [];
let posScannerTorchActive = false;
let posScannerMultiScanMode = true;
let posScannerLastCode = "";
let posScannerLastTime = 0;
let posScannerFeedbackTimeout = null;
const POS_SCANNER_COOLDOWN_MS = 1400;

// Callback custom saat scanner dibuka dari menu SIS Logistik (LPB, SO, Repack, Master Produk, dll)
let activeScannerCustomCallback = null;

// Fallback native stream jika Html5Qrcode tidak tersedia
let posNativeCameraStream = null;
let posNativeAnimationId = null;

async function openPosCameraScanner(customCallback = null, customTitle = null) {
  activeScannerCustomCallback = typeof customCallback === "function" ? customCallback : null;

  // Verifikasi HTTPS untuk izin kamera modern
  if (location.protocol === "http:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    const targetUrl = "https://" + (location.hostname === "2.27.165.72" ? "2.27.165.72.sslip.io" : location.hostname) + location.pathname + location.search + location.hash;
    showToast("Akses kamera membutuhkan koneksi aman (HTTPS). Mengalihkan...", "info", 3000);
    setTimeout(() => {
      location.href = targetUrl;
    }, 800);
    return;
  }

  // Jika bukan mode logistik/custom, pastikan berada di tab Kasir POS
  if (!activeScannerCustomCallback && typeof switchTab === "function") {
    switchTab("tab-pos");
  }

  // Atur teks header, badge mode, bilah keranjang, dan tombol bayar
  const titleEl = document.getElementById("pos-camera-scanner-title");
  const subtitleEl = document.getElementById("pos-camera-scanner-subtitle");
  const modeBadge = document.getElementById("pos-camera-mode-badge");
  const cartBar = document.getElementById("pos-scanner-cart-bar");
  const payBtn = document.getElementById("pos-scanner-pay-btn");

  if (activeScannerCustomCallback) {
    if (titleEl) titleEl.textContent = customTitle || "Scan Barcode Logistik";
    if (subtitleEl) subtitleEl.textContent = "Arahkan kamera ke barcode kemasan produk untuk proses logistik.";
    if (modeBadge) {
      modeBadge.textContent = "Mode Logistik";
      modeBadge.className = "px-2 py-0.5 text-[9px] font-black uppercase rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30";
    }
    if (cartBar) cartBar.classList.add("hidden");
    if (payBtn) payBtn.classList.add("hidden");
  } else {
    if (titleEl) titleEl.textContent = "Scan Barcode Kasir";
    if (subtitleEl) subtitleEl.textContent = "Arahkan kamera ke barcode kemasan produk snack / minuman.";
    if (modeBadge) {
      modeBadge.textContent = posScannerMultiScanMode ? "Multi-Scan ON" : "1x Scan Mode";
      modeBadge.className = "px-2 py-0.5 text-[9px] font-black uppercase rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse";
    }
    if (cartBar) cartBar.classList.remove("hidden");
    if (payBtn) payBtn.classList.remove("hidden");
    updatePosScannerCartSummary();
  }

  openModal("modal-pos-camera-scanner");

  const loadingEl = document.getElementById("pos-camera-scanner-loading");
  const readerEl = document.getElementById("pos-camera-scanner-reader");
  const feedbackEl = document.getElementById("pos-scan-feedback");
  
  if (loadingEl) loadingEl.classList.remove("hidden");
  if (feedbackEl) feedbackEl.classList.add("hidden");

  // Reset flag
  posScannerTorchActive = false;
  const torchLabel = document.getElementById("label-pos-scanner-torch");
  if (torchLabel) torchLabel.textContent = "Senter";

  // Prioritas 1: Gunakan library Html5Qrcode jika tersedia
  if (typeof Html5Qrcode !== "undefined") {
    try {
      if (!posHtml5QrCode) {
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

        posHtml5QrCode = new Html5Qrcode("pos-camera-scanner-reader", {
          formatsToSupport: formats,
          verbose: false
        });
      }

      // Ambil daftar kamera
      try {
        const cameras = await Html5Qrcode.getCameras();
        posScannerAvailableCameras = cameras || [];
      } catch (camErr) {
        console.warn("Gagal enumerasi kamera:", camErr);
        posScannerAvailableCameras = [];
      }

      // Konfigurasi kamera belakang (environment)
      let cameraConfig = { facingMode: "environment" };
      if (posScannerAvailableCameras.length > 0) {
        // Cari kamera belakang secara eksplisit
        const backCamIndex = posScannerAvailableCameras.findIndex(c => 
          /back|rear|belakang|environment/i.test(c.label)
        );
        if (backCamIndex >= 0) {
          posScannerCurrentCameraIndex = backCamIndex;
          cameraConfig = posScannerAvailableCameras[backCamIndex].id;
        } else {
          posScannerCurrentCameraIndex = 0;
          cameraConfig = posScannerAvailableCameras[0].id;
        }
      }

      const scanConfig = {
        fps: 20,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const width = Math.min(Math.round(viewfinderWidth * 0.9), 360);
          const height = Math.min(Math.round(viewfinderHeight * 0.65), 220);
          return { width: Math.max(width, 220), height: Math.max(height, 140) };
        },
        aspectRatio: 1.333333
      };

      await posHtml5QrCode.start(
        cameraConfig,
        scanConfig,
        onPosBarcodeDetected,
        () => {} // abaikan frame error wajar saat mencari barcode
      );

      posScannerIsScanning = true;
      if (loadingEl) loadingEl.classList.add("hidden");
      return;
    } catch (err) {
      console.warn("Html5Qrcode start error, mencoba native fallback:", err);
      if (posHtml5QrCode) {
        try { await posHtml5QrCode.clear(); } catch(e){}
        posHtml5QrCode = null;
      }
    }
  }

  // Prioritas 2: Fallback Native BarcodeDetector + getUserMedia
  startPosNativeCameraFallback();
}

// Fallback native kamera (menggunakan Web BarcodeDetector jika Html5Qrcode gagal/tidak termuat)
async function startPosNativeCameraFallback() {
  const loadingEl = document.getElementById("pos-camera-scanner-loading");
  const readerEl = document.getElementById("pos-camera-scanner-reader");

  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Perangkat atau browser ini tidak mendukung akses kamera langsung.");
    }

    posNativeCameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    if (readerEl) {
      readerEl.innerHTML = `
        <video id="pos-native-video" autoplay playsinline class="w-full h-full object-cover"></video>
      `;
      const video = document.getElementById("pos-native-video");
      if (video) {
        video.srcObject = posNativeCameraStream;
        video.onloadedmetadata = () => {
          video.play();
          if (loadingEl) loadingEl.classList.add("hidden");
          posScannerIsScanning = true;
          startPosNativeDetectionLoop(video);
        };
      }
    }
  } catch (err) {
    console.error("Native camera fallback failed:", err);
    if (loadingEl) loadingEl.classList.add("hidden");
    closePosCameraScanner();
    showToast("Gagal mengakses kamera: " + (err.message || err), "error");
  }
}

function startPosNativeDetectionLoop(video) {
  if (!("BarcodeDetector" in window)) {
    showToast("Kamera aktif, namun browser Anda membutuhkan dukungan barcode detector.", "warning");
    return;
  }

  const detector = new window.BarcodeDetector({
    formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"]
  });

  async function loop() {
    if (!posScannerIsScanning || !posNativeCameraStream) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      try {
        const barcodes = await detector.detect(video);
        if (barcodes && barcodes.length > 0) {
          const raw = barcodes[0].rawValue;
          if (raw) {
            onPosBarcodeDetected(raw);
          }
        }
      } catch (e) {
        // frame decode error
      }
    }
    posNativeAnimationId = requestAnimationFrame(loop);
  }

  posNativeAnimationId = requestAnimationFrame(loop);
}

// Handler saat Barcode berhasil terbaca oleh Kamera Kasir
function onPosBarcodeDetected(decodedText) {
  const code = decodedText ? decodedText.trim() : "";
  if (!code) return;

  const now = Date.now();
  // Anti-double scan debounce jika barcode yang sama masih berada di depan lensa
  if (code === posScannerLastCode && (now - posScannerLastTime) < POS_SCANNER_COOLDOWN_MS) {
    return;
  }

  posScannerLastCode = code;
  posScannerLastTime = now;

  // Efek visual & suara
  flashPosReticleSuccess();
  if (typeof sfx !== "undefined" && sfx.beep) {
    sfx.beep();
  }

  // Jika ini adalah custom callback dari SIS Logistik (LPB, SO, Repack, Master Produk, Label, Waste)
  if (typeof activeScannerCustomCallback === "function") {
    const cb = activeScannerCustomCallback;
    activeScannerCustomCallback = null;
    closePosCameraScanner();
    try {
      cb(code);
    } catch (err) {
      console.error("[SIS Camera] Callback error:", err);
    }
    return;
  }

  // Proses masukkan produk ke keranjang kasir
  processScannedBarcode(code);

  // Update ringkasan & notifikasi live di dalam modal scanner
  const matched = (pos.products || []).find(p => p.barcode === code || p.id.toLowerCase() === code.toLowerCase());
  showPosScanFeedback(matched, code);
  updatePosScannerCartSummary();

  // Jika kasir memilih mode 1x scan (bukan multi-scan)
  if (!posScannerMultiScanMode) {
    setTimeout(() => {
      closePosCameraScanner();
    }, 450);
  }
}

// Efek kedip hijau laser saat barcode sukses terbaca
function flashPosReticleSuccess() {
  const reticle = document.getElementById("pos-scanner-reticle");
  if (!reticle) return;
  reticle.classList.add("border-emerald-300", "bg-emerald-400/40", "scale-105");
  setTimeout(() => {
    reticle.classList.remove("border-emerald-300", "bg-emerald-400/40", "scale-105");
  }, 220);
}

// Feedback banner di bagian atas scanner
function showPosScanFeedback(matched, code) {
  const feedbackEl = document.getElementById("pos-scan-feedback");
  const textEl = document.getElementById("pos-scan-feedback-text");
  if (!feedbackEl || !textEl) return;

  if (matched) {
    feedbackEl.className = "transition-all duration-300 px-4 py-2 bg-emerald-600 text-white text-xs font-bold flex items-center justify-between shadow-md";
    textEl.innerHTML = `⚡ <strong>+1 ${matched.name}</strong> (${formatRupiah(matched.price)}) masuk keranjang!`;
  } else {
    feedbackEl.className = "transition-all duration-300 px-4 py-2 bg-amber-600 text-white text-xs font-bold flex items-center justify-between shadow-md";
    textEl.innerHTML = `⚠️ Barcode [${code}] belum terdaftar di katalog produk!`;
    if (typeof sfx !== "undefined" && sfx.warning) sfx.warning();
  }

  feedbackEl.classList.remove("hidden");
  clearTimeout(posScannerFeedbackTimeout);
  posScannerFeedbackTimeout = setTimeout(() => {
    feedbackEl.classList.add("hidden");
  }, 2600);
}

// Update info total keranjang kasir di dalam modal scanner
function updatePosScannerCartSummary() {
  const totalEl = document.getElementById("pos-scanner-live-total");
  const countEl = document.getElementById("pos-scanner-live-count");
  if (!totalEl || !countEl) return;

  const summary = (typeof calculateCartSummary === "function") ? calculateCartSummary() : { grandTotal: 0 };
  totalEl.textContent = formatRupiah(summary.grandTotal || 0);

  const cart = pos.cart || [];
  const totalQty = cart.reduce((sum, item) => sum + (item.qty || 1), 0);
  countEl.textContent = `(${cart.length} jenis / ${totalQty} pcs)`;
}

// Menutup modal scanner & mematikan hardware kamera
async function closePosCameraScanner() {
  posScannerIsScanning = false;

  // Hentikan native fallback jika aktif
  if (posNativeAnimationId) {
    cancelAnimationFrame(posNativeAnimationId);
    posNativeAnimationId = null;
  }
  if (posNativeCameraStream) {
    posNativeCameraStream.getTracks().forEach(t => t.stop());
    posNativeCameraStream = null;
  }

  // Hentikan Html5Qrcode
  if (posHtml5QrCode) {
    try {
      if (posHtml5QrCode.isScanning) {
        await posHtml5QrCode.stop();
      }
      await posHtml5QrCode.clear();
    } catch (e) {
      console.warn("Gagal menghentikan Html5Qrcode:", e);
    }
    posHtml5QrCode = null;
  }

  const readerEl = document.getElementById("pos-camera-scanner-reader");
  if (readerEl) readerEl.innerHTML = "";

  closeModal("modal-pos-camera-scanner");

  activeScannerCustomCallback = null;

  // Pulihkan tampilan bilah ringkasan kasir, tombol bayar, dan judul ke mode kasir default
  const cartBar = document.getElementById("pos-scanner-cart-bar");
  if (cartBar) cartBar.classList.remove("hidden");
  const payBtn = document.getElementById("pos-scanner-pay-btn");
  if (payBtn) payBtn.classList.remove("hidden");
  const titleEl = document.getElementById("pos-camera-scanner-title");
  if (titleEl) titleEl.textContent = "Scan Barcode Kasir";
  const subtitleEl = document.getElementById("pos-camera-scanner-subtitle");
  if (subtitleEl) subtitleEl.textContent = "Arahkan kamera ke barcode kemasan produk snack / minuman.";

  // Pastikan keyboard virtual tetap tertutup
  if (document.activeElement && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur();
  }
}

// Tombol Switch Kamera (Kamera Depan vs Kamera Belakang)
async function switchPosScannerCamera() {
  if (posScannerAvailableCameras.length < 2) {
    showToast("Hanya 1 kamera yang terdeteksi pada perangkat ini.", "info");
    return;
  }

  try {
    posScannerCurrentCameraIndex = (posScannerCurrentCameraIndex + 1) % posScannerAvailableCameras.length;
    const nextCam = posScannerAvailableCameras[posScannerCurrentCameraIndex];

    if (posHtml5QrCode && posHtml5QrCode.isScanning) {
      await posHtml5QrCode.stop();
      await posHtml5QrCode.start(
        nextCam.id,
        {
          fps: 15,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const width = Math.min(viewfinderWidth * 0.85, 300);
            const height = Math.min(viewfinderHeight * 0.55, 180);
            return { width: Math.round(width), height: Math.round(height) };
          },
          aspectRatio: 1.333333
        },
        onPosBarcodeDetected,
        () => {}
      );
      showToast(`Beralih ke: ${nextCam.label || 'Kamera ' + (posScannerCurrentCameraIndex + 1)}`, "info");
    }
  } catch (err) {
    console.warn("Gagal switch kamera:", err);
    showToast("Gagal beralih kamera: " + (err.message || err), "warning");
  }
}

// Tombol Nyalakan / Matikan Senter HP (Torch)
async function togglePosScannerTorch() {
  if (!posHtml5QrCode || !posHtml5QrCode.isScanning) return;

  try {
    posScannerTorchActive = !posScannerTorchActive;
    await posHtml5QrCode.applyVideoConstraints({
      advanced: [{ torch: posScannerTorchActive }]
    });

    const label = document.getElementById("label-pos-scanner-torch");
    if (label) label.textContent = posScannerTorchActive ? "Mati" : "Senter";
    showToast(posScannerTorchActive ? "🔦 Senter kamera dinyalakan" : "Senter kamera dimatikan", "info");
  } catch (err) {
    console.warn("Torch constraint not supported:", err);
    showToast("Fitur lampu senter tidak didukung oleh kamera/browser ini.", "info");
    posScannerTorchActive = false;
  }
}

// Toggle Mode Multi-Scan (Terus Menerus)
function togglePosScannerMultiScan(checked) {
  posScannerMultiScanMode = Boolean(checked);
  const badge = document.getElementById("pos-camera-mode-badge");
  if (badge) {
    if (posScannerMultiScanMode) {
      badge.textContent = "Multi-Scan ON";
      badge.className = "px-2 py-0.5 text-[9px] font-black uppercase rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse";
    } else {
      badge.textContent = "1x Scan Tutup";
      badge.className = "px-2 py-0.5 text-[9px] font-black uppercase rounded-full bg-slate-700 text-slate-300 border border-slate-600";
    }
  }
}

// Selesai Scan & Langsung Masuk ke Pembayaran Kasir
async function finishPosScanningAndPay() {
  await closePosCameraScanner();
  if (!pos.cart || pos.cart.length === 0) {
    showToast("Keranjang belanja masih kosong! Scan produk terlebih dahulu.", "warning");
    return;
  }
  if (typeof openPaymentModal === "function") {
    openPaymentModal();
  }
}
