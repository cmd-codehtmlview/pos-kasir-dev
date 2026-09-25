/**
 * SnackPOS - Native Device Bridge (Capacitor Hardware Integration)
 * Menghubungkan driver hardware native Android ke antarmuka web POS:
 * 1. KeepAwake: Mencegah layar tablet/HP kasir padam/terkunci saat transaksi
 * 2. Haptics: Respon getar fisik saat scan barcode, klik tombol, & selesai transaksi
 * 3. StatusBar: Mengatur warna status bar Android agar senada dengan UI kasir (#0b1120)
 * 4. Network: Mendeteksi koneksi online/offline secara native & real-time
 */

const NativeDevice = {
  isAvailable() {
    return typeof window !== "undefined" && !!window.Capacitor;
  },

  getPlugin(name) {
    if (!this.isAvailable()) return null;
    return window.Capacitor.Plugins?.[name] || null;
  },

  // 1. Keep Awake (Layar Tetap Menyala)
  async enableKeepAwake() {
    try {
      const KeepAwake = this.getPlugin("KeepAwake");
      if (KeepAwake && typeof KeepAwake.keepAwake === "function") {
        await KeepAwake.keepAwake();
        console.log("[NativeDevice] ⚡ KeepAwake diaktifkan: Layar kasir akan selalu standby menyala.");
      }
    } catch (e) {
      console.warn("[NativeDevice] KeepAwake warning:", e);
    }
  },

  async disableKeepAwake() {
    try {
      const KeepAwake = this.getPlugin("KeepAwake");
      if (KeepAwake && typeof KeepAwake.allowSleep === "function") {
        await KeepAwake.allowSleep();
        console.log("[NativeDevice] KeepAwake dinonaktifkan: Layar dapat beristirahat.");
      }
    } catch (e) {}
  },

  // 2. Haptic Feedback (Respon Getar Fisik)
  haptic: {
    light() {
      try {
        const Haptics = NativeDevice.getPlugin("Haptics");
        if (Haptics && typeof Haptics.impact === "function") {
          Haptics.impact({ style: "LIGHT" });
        } else if (navigator.vibrate) {
          navigator.vibrate(15);
        }
      } catch (e) {}
    },
    medium() {
      try {
        const Haptics = NativeDevice.getPlugin("Haptics");
        if (Haptics && typeof Haptics.impact === "function") {
          Haptics.impact({ style: "MEDIUM" });
        } else if (navigator.vibrate) {
          navigator.vibrate(30);
        }
      } catch (e) {}
    },
    heavy() {
      try {
        const Haptics = NativeDevice.getPlugin("Haptics");
        if (Haptics && typeof Haptics.impact === "function") {
          Haptics.impact({ style: "HEAVY" });
        } else if (navigator.vibrate) {
          navigator.vibrate(50);
        }
      } catch (e) {}
    },
    success() {
      try {
        const Haptics = NativeDevice.getPlugin("Haptics");
        if (Haptics && typeof Haptics.notification === "function") {
          Haptics.notification({ type: "SUCCESS" });
        } else if (navigator.vibrate) {
          navigator.vibrate([20, 50, 40]);
        }
      } catch (e) {}
    },
    warning() {
      try {
        const Haptics = NativeDevice.getPlugin("Haptics");
        if (Haptics && typeof Haptics.notification === "function") {
          Haptics.notification({ type: "WARNING" });
        } else if (navigator.vibrate) {
          navigator.vibrate([40, 40, 40]);
        }
      } catch (e) {}
    }
  },

  // 3. Status Bar Styling
  async setupStatusBar() {
    try {
      const StatusBar = this.getPlugin("StatusBar");
      if (StatusBar) {
        if (typeof StatusBar.setBackgroundColor === "function") {
          await StatusBar.setBackgroundColor({ color: "#0b1120" });
        }
        if (typeof StatusBar.setStyle === "function") {
          await StatusBar.setStyle({ style: "DARK" });
        }
        console.log("[NativeDevice] 🎨 StatusBar dikonfigurasi ke tema gelap #0b1120.");
      }
    } catch (e) {
      console.warn("[NativeDevice] StatusBar setup warning:", e);
    }
  },

  // 4. Native Network Listener (Cerdas & Tidak Spam)
  _hasShownConnectedToast: false,
  _lastNetworkConnectedState: null,

  async initNetworkMonitoring() {
    try {
      const Network = this.getPlugin("Network");
      if (Network && typeof Network.addListener === "function") {
        // Cek status koneksi awal secara hening
        if (typeof Network.getStatus === "function") {
          try {
            const initialStatus = await Network.getStatus();
            const isConn = Boolean(initialStatus?.connected);
            this._lastNetworkConnectedState = isConn;
            if (isConn && !this._hasShownConnectedToast) {
              this._hasShownConnectedToast = true;
              if (typeof showToast === "function") {
                const connType = (initialStatus.connectionType || "online").toUpperCase();
                showToast(`🌐 Terhubung ke Internet (${connType})`, "info", 3500);
              }
            }
          } catch (e) {}
        }

        Network.addListener("networkStatusChange", status => {
          console.log("[NativeDevice] Status Jaringan berubah:", status);
          const isConnected = Boolean(status?.connected);

          // Jika status online/offline sama seperti sebelumnya, abaikan (mencegah spam)
          if (this._lastNetworkConnectedState === isConnected) {
            return;
          }

          if (isConnected) {
            // Hanya tampilkan jika sebelumnya terputus (reconnect) atau saat pertama kali start
            if (this._lastNetworkConnectedState === false) {
              if (typeof showToast === "function") {
                showToast("🌐 Koneksi internet kembali terhubung", "success", 3000);
              }
            } else if (!this._hasShownConnectedToast) {
              this._hasShownConnectedToast = true;
              if (typeof showToast === "function") {
                const connType = (status.connectionType || "online").toUpperCase();
                showToast(`🌐 Terhubung ke Internet (${connType})`, "info", 3500);
              }
            }
          } else {
            // Koneksi terputus: selalu beri tahu kasir bahwa mode offline aktif
            this._hasShownConnectedToast = false;
            if (typeof showToast === "function") {
              showToast("⚠️ Koneksi internet terputus (Mode Kasir Offline Aktif)", "warning", 5000);
            }
          }

          this._lastNetworkConnectedState = isConnected;
        });
        return;
      }

      // Fallback web browser standar
      if (typeof window !== "undefined") {
        window.addEventListener("offline", () => {
          if (this._lastNetworkConnectedState !== false) {
            this._lastNetworkConnectedState = false;
            this._hasShownConnectedToast = false;
            if (typeof showToast === "function") {
              showToast("⚠️ Koneksi internet terputus (Mode Kasir Offline Aktif)", "warning", 5000);
            }
          }
        });
        window.addEventListener("online", () => {
          if (this._lastNetworkConnectedState === false) {
            this._lastNetworkConnectedState = true;
            if (typeof showToast === "function") {
              showToast("🌐 Koneksi internet kembali terhubung", "success", 3000);
            }
          }
        });
      }
    } catch (e) {}
  },

  // Inisialisasi Seluruh Driver
  init() {
    this.enableKeepAwake();
    this.setupStatusBar();
    this.initNetworkMonitoring();
  }
};

// Pasang ke window & inisialisasi otomatis
if (typeof window !== "undefined") {
  window.NativeDevice = NativeDevice;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => NativeDevice.init());
  } else {
    NativeDevice.init();
  }
}

