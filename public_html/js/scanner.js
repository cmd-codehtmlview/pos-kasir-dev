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
    barcodeInput.focus();
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
let posScannerSelectedDeviceId = null;
let posScannerDetector = null;
const POS_SCANNER_COOLDOWN_MS = 1400;

// Native camera stream & loop
let posNativeCameraStream = null;
let posNativeAnimationId = null;
let activeScannerCustomCallback = null;

async function openPosCameraScanner(customCallback = null, customTitle = null) {
  // Simpan callback kustom jika dipanggil dari modul luar (misal: SIS Logistik Gudang)
  activeScannerCustomCallback = typeof customCallback === "function" ? customCallback : null;

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

  // Hanya alihkan tab jika bukan pemanggilan kustom dari modal (misal: bukan dari SIS)
  if (!activeScannerCustomCallback && typeof switchTab === "function") {
    switchTab("tab-pos");
  }

  // Sesuaikan judul header scanner kamera jika ada
  const titleEl = document.querySelector("#modal-pos-camera-scanner h3");
  if (titleEl) {
    titleEl.textContent = customTitle || "Scan Barcode Kasir";
  }

  // Tampilan badge mode dan bar keranjang
  const cartBar = document.getElementById("pos-scanner-cart-bar");
  const modeBadge = document.getElementById("pos-camera-mode-badge");
  if (activeScannerCustomCallback) {
    if (cartBar) cartBar.classList.add("hidden");
    if (modeBadge) {
      modeBadge.textContent = "Mode Logistik";
      modeBadge.className = "px-2 py-0.5 text-[9px] font-black uppercase rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30";
    }
  } else {
    if (cartBar) cartBar.classList.remove("hidden");
    if (modeBadge) {
      modeBadge.textContent = posScannerMultiScanMode ? "Multi-Scan ON" : "1x Scan Mode";
      modeBadge.className = "px-2 py-0.5 text-[9px] font-black uppercase rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse";
    }
    updatePosScannerCartSummary();
  }

  openModal("modal-pos-camera-scanner");

  const loadingEl = document.getElementById("pos-camera-scanner-loading");
  const feedbackEl = document.getElementById("pos-scan-feedback");
  
  if (loadingEl) loadingEl.classList.remove("hidden");
  if (feedbackEl) feedbackEl.classList.add("hidden");

  // Reset senter
  posScannerTorchActive = false;
  const torchLabel = document.getElementById("label-pos-scanner-torch");
  if (torchLabel) torchLabel.textContent = "Senter";

  // Mulai stream kamera langsung
  await startPosCameraStream();
}

async function startPosCameraStream(targetDeviceId = null) {
  const loadingEl = document.getElementById("pos-camera-scanner-loading");
  const readerEl = document.getElementById("pos-camera-scanner-reader");
  if (!readerEl) return;

  if (loadingEl) loadingEl.classList.remove("hidden");

  // Hentikan stream dan animasi sebelumnya jika ada
  stopActiveCameraTracks();

  if (targetDeviceId) {
    posScannerSelectedDeviceId = targetDeviceId;
  }

  // Bersihkan dan sematkan video element baru
  readerEl.innerHTML = `
    <video id="pos-live-camera-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover; min-height: 280px;"></video>
  `;
  const videoEl = document.getElementById("pos-live-camera-video");
  if (videoEl) {
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.setAttribute("playsinline", "");
    videoEl.setAttribute("webkit-playsinline", "");
    videoEl.setAttribute("muted", "");
  }

  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Browser atau perangkat ini belum mendukung MediaDevices getUserMedia.");
    }

    let stream = null;
    const preferredConstraints = {
      audio: false,
      video: posScannerSelectedDeviceId 
        ? { deviceId: { exact: posScannerSelectedDeviceId } }
        : { facingMode: { ideal: "environment" } }
    };

    try {
      stream = await navigator.mediaDevices.getUserMedia(preferredConstraints);
    } catch (idealErr) {
      console.warn("Gagal dengan preferred camera constraints, mencoba fallback dasar:", idealErr);
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: "environment" }
        });
      } catch (envErr) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      }
    }

    posNativeCameraStream = stream;
    videoEl.srcObject = stream;

    // Ambil daftar kamera untuk fungsi ganti kamera di background
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      posScannerAvailableCameras = devices.filter(d => d.kind === "videoinput");
    } catch(e){}

    const onStreamReady = async () => {
      try {
        await videoEl.play();
      } catch (e) {
        console.warn("Video play notice:", e);
      }
      if (loadingEl) loadingEl.classList.add("hidden");
      posScannerIsScanning = true;
      startPosDetectionLoop(videoEl);
    };

    videoEl.onloadedmetadata = () => onStreamReady();
    setTimeout(() => {
      if (loadingEl && !loadingEl.classList.contains("hidden")) {
        onStreamReady();
      }
    }, 250);

  } catch (err) {
    console.error("Camera access error:", err);
    if (loadingEl) loadingEl.classList.add("hidden");
    
    // Tampilkan pesan error jelas dengan tombol coba lagi (JANGAN TUTUP MODAL!)
    const isPermissionError = err.name === "NotAllowedError" || err.name === "PermissionDeniedError";
    readerEl.innerHTML = `
      <div class="p-6 text-center text-slate-300 flex flex-col items-center justify-center gap-3">
        <span class="text-4xl text-amber-400">📷</span>
        <p class="text-xs font-bold text-white uppercase tracking-wider">Akses Kamera Belum Aktif</p>
        <p class="text-[11px] text-slate-400 max-w-xs leading-relaxed">
          ${isPermissionError 
            ? 'Izin kamera belum diizinkan oleh browser. Silakan tap ikon gembok / pengaturan situs di Chrome dan pilih "Izinkan Kamera".' 
            : (err.message || 'Kamera sedang digunakan aplikasi lain atau tidak terdeteksi.')}
        </p>
        <button type="button" onclick="startPosCameraStream()" class="mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer transition flex items-center gap-1.5">
          <span>🔄</span>
          <span>Izinkan & Coba Lagi</span>
        </button>
      </div>
    `;
    showToast(isPermissionError ? "⚠️ Izin kamera ditolak. Silakan izinkan di browser." : "Gagal membuka kamera: " + (err.message || err.name), "warning", 5000);
  }
}

function stopActiveCameraTracks() {
  if (posNativeAnimationId) {
    cancelAnimationFrame(posNativeAnimationId);
    posNativeAnimationId = null;
  }
  if (posNativeCameraStream) {
    try {
      posNativeCameraStream.getTracks().forEach(t => t.stop());
    } catch(e){}
    posNativeCameraStream = null;
  }
}

async function startPosDetectionLoop(videoEl) {
  if (!posScannerIsScanning) return;

  // 1. Native Web BarcodeDetector (Standar Chrome Android sejak v84, hardware-accelerated & 100% kompatibel)
  if ("BarcodeDetector" in window) {
    try {
      if (!posScannerDetector) {
        const supported = await window.BarcodeDetector.getSupportedFormats().catch(() => []);
        const desired = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93", "itf", "qr_code"];
        const formats = (supported && supported.length > 0) ? desired.filter(f => supported.includes(f)) : desired;
        posScannerDetector = new window.BarcodeDetector({ formats: formats.length > 0 ? formats : ["qr_code", "ean_13", "code_128"] });
      }

      async function nativeDetectLoop() {
        if (!posScannerIsScanning || !posNativeCameraStream) return;
        if (videoEl.readyState >= 2 && !videoEl.paused) {
          try {
            const barcodes = await posScannerDetector.detect(videoEl);
            if (barcodes && barcodes.length > 0) {
              const raw = barcodes[0].rawValue;
              if (raw) {
                onPosBarcodeDetected(raw);
              }
            }
          } catch(e){}
        }
        posNativeAnimationId = requestAnimationFrame(nativeDetectLoop);
      }

      posNativeAnimationId = requestAnimationFrame(nativeDetectLoop);
      return;
    } catch(detErr) {
      console.warn("Native BarcodeDetector init notice:", detErr);
    }
  }

  // 2. Fallback Html5Qrcode jika BarcodeDetector tidak didukung oleh browser
  if (typeof Html5Qrcode !== "undefined") {
    try {
      stopActiveCameraTracks();
      const readerEl = document.getElementById("pos-camera-scanner-reader");
      if (readerEl) readerEl.innerHTML = "";

      if (!posHtml5QrCode) {
        posHtml5QrCode = new Html5Qrcode("pos-camera-scanner-reader", { verbose: false });
      }
      await posHtml5QrCode.start(
        posScannerSelectedDeviceId || { facingMode: "environment" },
        { fps: 15 },
        onPosBarcodeDetected,
        () => {}
      );
      posScannerIsScanning = true;
      return;
    } catch(h5Err) {
      console.warn("Html5Qrcode fallback error:", h5Err);
    }
  }
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

  // Jika ini adalah custom callback dari SIS Logistik Gudang (LPB, SO, Repack, Master Produk, Label, Waste)
  if (typeof activeScannerCustomCallback === "function") {
    const cb = activeScannerCustomCallback;
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

  const hadCustomCallback = Boolean(activeScannerCustomCallback);
  activeScannerCustomCallback = null;

  // Pulihkan tampilan bilah ringkasan kasir
  const cartBar = document.getElementById("pos-scanner-cart-bar");
  if (cartBar) cartBar.classList.remove("hidden");

  // Kembalikan fokus ke kotak pencarian barcode kasir hanya jika bukan dari modal kustom
  if (!hadCustomCallback) {
    setTimeout(() => {
      const searchInput = document.getElementById("pos-barcode-search");
      if (searchInput) searchInput.focus();
    }, 100);
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
    posScannerSelectedDeviceId = nextCam.deviceId || nextCam.id;

    if (posHtml5QrCode && posHtml5QrCode.isScanning) {
      await posHtml5QrCode.stop();
      await posHtml5QrCode.start(
        posScannerSelectedDeviceId,
        { fps: 15 },
        onPosBarcodeDetected,
        () => {}
      );
    } else {
      await startPosCameraStream(posScannerSelectedDeviceId);
    }
    showToast(`Beralih ke: ${nextCam.label || 'Kamera ' + (posScannerCurrentCameraIndex + 1)}`, "info");
  } catch (err) {
    console.warn("Gagal switch kamera:", err);
    showToast("Gagal beralih kamera: " + (err.message || err), "warning");
  }
}

// Tombol Nyalakan / Matikan Senter HP (Torch)
async function togglePosScannerTorch() {
  try {
    let track = null;
    if (posNativeCameraStream) {
      track = posNativeCameraStream.getVideoTracks()[0];
    } else if (posHtml5QrCode && posHtml5QrCode.isScanning) {
      posScannerTorchActive = !posScannerTorchActive;
      await posHtml5QrCode.applyVideoConstraints({
        advanced: [{ torch: posScannerTorchActive }]
      });
      const label = document.getElementById("label-pos-scanner-torch");
      if (label) label.textContent = posScannerTorchActive ? "Mati" : "Senter";
      showToast(posScannerTorchActive ? "🔦 Senter kamera dinyalakan" : "Senter kamera dimatikan", "info");
      return;
    }

    if (!track) {
      showToast("Kamera belum aktif.", "info");
      return;
    }

    posScannerTorchActive = !posScannerTorchActive;
    await track.applyConstraints({
      advanced: [{ torch: posScannerTorchActive }]
    });

    const label = document.getElementById("label-pos-scanner-torch");
    if (label) label.textContent = posScannerTorchActive ? "Mati" : "Senter";
    showToast(posScannerTorchActive ? "🔦 Senter kamera dinyalakan" : "Senter kamera dimatikan", "info");
  } catch (err) {
    console.warn("Torch constraint not supported:", err);
    showToast("Fitur lampu senter tidak didukung oleh kamera/browser ini.", "info");
    posScannerTorchActive = false;
    const label = document.getElementById("label-pos-scanner-torch");
    if (label) label.textContent = "Senter";
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

// Simulasi Scan Cepat untuk Pengujian (seperti di Mockup!)
function simulateBarcodeScanDemo() {
  const currentPos = window.pos || pos;
  const products = (currentPos && currentPos.products) ? currentPos.products : [];
  if (products.length === 0) {
    showToast("Katalog produk toko masih kosong!", "warning");
    return;
  }
  const randomProduct = products[Math.floor(Math.random() * products.length)];
  const code = randomProduct.barcode || randomProduct.id;
  onPosBarcodeDetected(code);
  showToast(`🎲 [Demo Scan] Membaca: [${code}] ${randomProduct.name}`, "success");
}

if (typeof window !== "undefined") {
  window.openPosCameraScanner = openPosCameraScanner;
  window.closePosCameraScanner = closePosCameraScanner;
  window.simulateBarcodeScanDemo = simulateBarcodeScanDemo;
}
