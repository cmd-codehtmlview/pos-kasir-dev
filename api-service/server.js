/**
 * SnackPOS API Backend Service (Node.js & Express)
 * Menggantikan Cloudflare Pages Functions untuk dijalankan mandiri di VPS
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: "*", methods: ["GET", "POST", "OPTIONS"] }));
// Simpan rawBody untuk verifikasi signature webhook
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

const OTP_SECRET = process.env.OTP_SECRET || "SNACKPOS_MASTER_OTP_SECRET_KEY_2026";

// =============================================================================
// HEALTH CHECK
// =============================================================================
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "SnackPOS VPS API Service",
    timestamp: new Date().toISOString()
  });
});

// =============================================================================
// 1. MIDTRANS TOKEN GENERATOR
// =============================================================================
app.get("/api/midtrans-token", (req, res) => {
  res.json({
    status: "active",
    service: "SnackPOS Midtrans Snap Token Service",
    provider: "VPS Node.js Service",
    timestamp: new Date().toISOString()
  });
});

app.post("/api/midtrans-token", async (req, res) => {
  try {
    const {
      order_id,
      gross_amount,
      customer_details,
      item_details,
      custom_field1, // store_id
      custom_field2, // plan_type
      custom_field3, // duration
      server_key: clientServerKey,
      is_production: clientIsProduction
    } = req.body;

    if (!order_id || !gross_amount) {
      return res.status(400).json({
        success: false,
        message: "Parameter order_id dan gross_amount wajib diisi."
      });
    }

    const serverKey = process.env.MIDTRANS_SERVER_KEY || clientServerKey;
    const isProduction = process.env.MIDTRANS_IS_PRODUCTION === "true" || clientIsProduction === true;

    if (!serverKey) {
      return res.status(400).json({
        success: false,
        message: "Server Key Midtrans belum dikonfigurasi. Harap konfigurasikan di .env VPS atau menu Gateway."
      });
    }

    const midtransEndpoint = isProduction
      ? "https://app.midtrans.com/snap/v1/transactions"
      : "https://app.sandbox.midtrans.com/snap/v1/transactions";

    const snapPayload = {
      transaction_details: {
        order_id: String(order_id),
        gross_amount: Math.round(Number(gross_amount))
      },
      customer_details: {
        first_name: customer_details?.first_name || "Pemilik Toko",
        email: customer_details?.email || "customer@example.com",
        phone: customer_details?.phone || ""
      },
      item_details: item_details && item_details.length > 0 ? item_details.map(item => ({
        id: String(item.id || "SPOS-ITEM"),
        price: Math.round(Number(item.price)),
        quantity: Number(item.quantity || 1),
        name: String(item.name).slice(0, 50)
      })) : [
        {
          id: custom_field2 || "PAKET_1",
          price: Math.round(Number(gross_amount)),
          quantity: 1,
          name: "Lisensi Kasir SnackPOS"
        }
      ],
      custom_field1: custom_field1 || "",
      custom_field2: custom_field2 || "",
      custom_field3: custom_field3 || customer_details?.email || ""
    };

    const authString = Buffer.from(`${serverKey.trim()}:`).toString("base64");
    const midtransRes = await fetch(midtransEndpoint, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": `Basic ${authString}`
      },
      body: JSON.stringify(snapPayload)
    });

    const midtransData = await midtransRes.json();

    if (!midtransRes.ok) {
      return res.status(midtransRes.status).json({
        success: false,
        message: midtransData.error_messages ? midtransData.error_messages.join(", ") : "Gagal membuat transaksi di Midtrans.",
        details: midtransData
      });
    }

    return res.status(200).json({
      success: true,
      token: midtransData.token,
      redirect_url: midtransData.redirect_url,
      is_production: isProduction
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// 2. MIDTRANS WEBHOOK
// =============================================================================
app.get("/api/midtrans-webhook", (req, res) => {
  res.json({
    status: "active",
    service: "SnackPOS Midtrans Webhook Service",
    provider: "VPS Node.js Service",
    timestamp: new Date().toISOString()
  });
});

app.post("/api/midtrans-webhook", async (req, res) => {
  try {
    const data = req.body;
    const orderId = data.order_id;
    const statusCode = data.status_code;
    const grossAmount = data.gross_amount;
    const signatureKey = data.signature_key;
    const serverKey = process.env.MIDTRANS_SERVER_KEY;

    // 1. Verifikasi Signature SHA-512
    if (serverKey && signatureKey && orderId && statusCode && grossAmount) {
      const rawString = `${orderId}${statusCode}${grossAmount}${serverKey.trim()}`;
      const computedSignature = crypto.createHash("sha512").update(rawString).digest("hex");

      if (computedSignature !== signatureKey) {
        return res.status(403).json({ success: false, message: "Invalid Midtrans signature" });
      }
    }

    const transactionStatus = data.transaction_status;
    const fraudStatus = data.fraud_status;
    const isSuccess = transactionStatus === "settlement" || 
                      (transactionStatus === "capture" && fraudStatus === "accept");

    if (isSuccess) {
      const storeId = data.custom_field1 || `STR-${Date.now().toString().slice(-4)}`;
      const planCode = data.custom_field2 || "PAKET_1";
      const email = (data.custom_field3 || "").trim().toLowerCase();
      const storePin = (data.custom_field4 || "").trim();
      const paymentType = (data.payment_type || "qris").toUpperCase();
      const totalAmount = parseFloat(data.gross_amount) || 0;

      let planType = "PAKET_1";
      let posExpiresAt = null;
      let cloudStatus = "INACTIVE";
      let cloudExpiresAt = null;

      if (planCode.includes("PAKET_2")) {
        planType = "PAKET_2";
        cloudStatus = "ACTIVE";
        let days = 30;
        if (planCode.includes("3M") || planCode.includes("3_BULAN")) days = 90;
        else if (planCode.includes("6M") || planCode.includes("6_BULAN")) days = 180;
        else if (planCode.includes("1Y") || planCode.includes("1_TAHUN")) days = 365;

        posExpiresAt = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
        cloudExpiresAt = posExpiresAt;
      } else {
        planType = "PAKET_1";
        posExpiresAt = null;
        if (planCode.includes("CLOUD")) {
          cloudStatus = "ACTIVE";
          let cDays = 30;
          if (planCode.includes("3M") || planCode.includes("3_BULAN")) cDays = 90;
          else if (planCode.includes("6M") || planCode.includes("6_BULAN")) cDays = 180;
          else if (planCode.includes("1Y") || planCode.includes("1_TAHUN")) cDays = 365;

          cloudExpiresAt = new Date(Date.now() + cDays * 24 * 3600 * 1000).toISOString();
        }
      }

      // Upsert ke Supabase / PostgREST lokal
      const supabaseUrl = process.env.SUPABASE_URL || "http://127.0.0.1:8000";
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

      if (supabaseUrl && email) {
        try {
          const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/store_licenses`;
          const rowItem = {
            store_id: storeId,
            owner_email: email,
            plan_type: planType,
            pos_status: "ACTIVE",
            pos_expires_at: posExpiresAt,
            cloud_status: cloudStatus,
            cloud_expires_at: cloudExpiresAt,
            last_payment_method: paymentType,
            last_amount_paid: totalAmount,
            updated_at: new Date().toISOString()
          };
          if (storePin) rowItem.pin = storePin;

          await fetch(endpoint, {
            method: "POST",
            headers: {
              ...(supabaseKey ? { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}` } : {}),
              "Content-Type": "application/json",
              "Prefer": "resolution=merge-duplicates"
            },
            body: JSON.stringify([rowItem])
          });
        } catch (dbErr) {
          console.error("Database connection error:", dbErr.message);
        }
      }

      return res.status(200).json({
        success: true,
        message: "Midtrans payment processed & store license activated successfully",
        order_id: orderId,
        store_id: storeId,
        owner_email: email
      });
    }

    return res.status(200).json({
      success: true,
      message: `Midtrans transaction status: ${transactionStatus}`,
      order_id: orderId
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// 3. TRIPAY WEBHOOK
// =============================================================================
app.get("/api/tripay-webhook", (req, res) => {
  res.json({
    status: "active",
    service: "SnackPOS Tripay Webhook Service",
    provider: "VPS Node.js Service",
    timestamp: new Date().toISOString()
  });
});

app.post("/api/tripay-webhook", async (req, res) => {
  try {
    const data = req.body;
    const callbackSignature = req.headers["x-callback-signature"];
    const privateKey = process.env.TRIPAY_PRIVATE_KEY;

    if (privateKey && callbackSignature) {
      const computedSignature = crypto
        .createHmac("sha256", privateKey)
        .update(req.rawBody || JSON.stringify(data))
        .digest("hex");

      if (computedSignature !== callbackSignature) {
        return res.status(403).json({ success: false, message: "Invalid callback signature" });
      }
    }

    if (data.status === "PAID") {
      const email = data.customer_email ? data.customer_email.trim().toLowerCase() : null;
      const storeName = data.customer_name || "Toko Retail";
      const storeId = data.merchant_ref || `STR-${Date.now().toString().slice(-4)}`;
      const totalAmount = Number(data.total_amount) || 0;
      const paymentMethod = data.payment_method || "QRIS";

      let planType = "PAKET_1";
      let posExpiresAt = null;
      let cloudStatus = "INACTIVE";
      let cloudExpiresAt = null;

      const firstItem = (data.order_items && data.order_items[0]) || {};
      const sku = (firstItem.sku || "").toUpperCase();
      const itemName = (firstItem.name || "").toUpperCase();

      if (sku.includes("PAKET_2") || itemName.includes("SAAS") || itemName.includes("PAKET 2")) {
        planType = "PAKET_2";
        cloudStatus = "ACTIVE";
        const durationDays = itemName.includes("1 TAHUN") ? 365 : (itemName.includes("6 BULAN") ? 180 : (itemName.includes("3 BULAN") ? 90 : 30));
        posExpiresAt = new Date(Date.now() + durationDays * 24 * 3600 * 1000).toISOString();
        cloudExpiresAt = posExpiresAt;
      } else {
        planType = "PAKET_1";
        posExpiresAt = null;
        if (itemName.includes("CLOUD")) {
          cloudStatus = "ACTIVE";
          const cDays = itemName.includes("1 TAHUN") ? 365 : (itemName.includes("6 BULAN") ? 180 : (itemName.includes("3 BULAN") ? 90 : 30));
          cloudExpiresAt = new Date(Date.now() + cDays * 24 * 3600 * 1000).toISOString();
        }
      }

      const supabaseUrl = process.env.SUPABASE_URL || "http://127.0.0.1:8000";
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

      if (supabaseUrl && email) {
        try {
          const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/store_licenses`;
          const payload = [{
            store_id: storeId,
            store_name: storeName,
            owner_email: email,
            plan_type: planType,
            pos_status: "ACTIVE",
            pos_expires_at: posExpiresAt,
            cloud_status: cloudStatus,
            cloud_expires_at: cloudExpiresAt,
            whatsapp: data.customer_phone || null,
            last_payment_method: paymentMethod,
            last_amount_paid: totalAmount,
            updated_at: new Date().toISOString()
          }];

          await fetch(endpoint, {
            method: "POST",
            headers: {
              ...(supabaseKey ? { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}` } : {}),
              "Content-Type": "application/json",
              "Prefer": "resolution=merge-duplicates"
            },
            body: JSON.stringify(payload)
          });
        } catch (dbErr) {
          console.error("Database connection error:", dbErr.message);
        }
      }

      return res.status(200).json({
        success: true,
        message: "Payment processed & store license activated successfully",
        store_id: storeId,
        owner_email: email
      });
    }

    return res.status(200).json({ success: true, message: `Ignored status: ${data.status}` });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// 4. SEND OTP
// =============================================================================
app.post("/api/send-otp", async (req, res) => {
  try {
    const body = req.body;
    const email = (body.email || "").trim().toLowerCase();
    const storeName = (body.storeName || "Toko Kasir").trim();
    const storeId = (body.storeId || ("STR-" + Math.floor(100 + Math.random() * 900))).trim();

    if (!email || !email.includes("@")) {
      return res.status(400).json({ success: false, message: "Masukkan alamat email yang valid" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + (10 * 60 * 1000); // 10 menit

    // Challenge HMAC
    const secretKey = process.env.OTP_SECRET || OTP_SECRET;
    const rawData = `${email}:${otp}:${expiresAt}:${secretKey}`;
    const challenge = crypto.createHash("sha256").update(rawData).digest("hex");

    // Kirim via Resend API jika key tersedia
    const resendApiKey = process.env.RESEND_API_KEY;
    let emailSent = false;
    let emailError = null;

    if (resendApiKey) {
      try {
        const mailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey.trim()}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: "SnackPOS Security <onboarding@resend.dev>",
            to: [email],
            subject: `🔐 ${otp} adalah Kode Verifikasi Kasir Anda (${storeName})`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
                <h2 style="color: #d61823; margin-bottom: 8px;">SnackPOS Indonesia</h2>
                <p style="color: #475569; font-size: 14px;">Halo <strong>${storeName}</strong>,</p>
                <p style="color: #475569; font-size: 14px;">Berikut adalah kode OTP untuk login/aktivasi perangkat kasir Anda:</p>
                <div style="text-align: center; margin: 24px 0;">
                  <span style="display: inline-block; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1e293b; background: #f1f5f9; padding: 12px 24px; border-radius: 8px; border: 1px dashed #cbd5e1;">${otp}</span>
                </div>
                <p style="color: #64748b; font-size: 12px;">Kode ini berlaku selama 10 menit. Jangan bagikan kode ini kepada siapapun.</p>
              </div>
            `
          })
        });

        if (mailRes.ok) emailSent = true;
        else emailError = await mailRes.text();
      } catch (mErr) {
        emailError = mErr.message;
      }
    }

    return res.status(200).json({
      success: true,
      message: emailSent 
        ? `Kode OTP 6-digit berhasil dikirim ke ${email}.`
        : `Kode OTP dibuat. (Gunakan Master OTP jika email gateway belum aktif).`,
      challenge: challenge,
      expiresAt: expiresAt,
      emailSent: emailSent
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// 5. VERIFY OTP
// =============================================================================
app.post("/api/verify-otp", async (req, res) => {
  try {
    const body = req.body;
    const email = (body.email || "").trim().toLowerCase();
    const otp = (body.otp || "").trim();
    const challenge = (body.challenge || "").trim();
    const expiresAt = parseInt(body.expiresAt, 10) || 0;
    const deviceId = (body.deviceId || "").trim();
    const storeName = (body.storeName || "Toko Kasir").trim();
    const storeId = (body.storeId || ("STR-" + Math.floor(100 + Math.random() * 900))).trim();

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: "Email dan kode OTP wajib diisi" });
    }

    let isValid = false;

    // Bypass Master OTP
    if (otp === "888888" || otp === "123456") {
      isValid = true;
    } else {
      if (expiresAt > 0 && Date.now() > expiresAt) {
        return res.status(400).json({
          success: false,
          message: "Kode OTP telah kadaluarsa (melewati 10 menit). Silakan klik 'Kirim Ulang OTP'."
        });
      }

      const secretKey = process.env.OTP_SECRET || OTP_SECRET;
      const rawData = `${email}:${otp}:${expiresAt}:${secretKey}`;
      const computedChallenge = crypto.createHash("sha256").update(rawData).digest("hex");

      if (computedChallenge === challenge) {
        isValid = true;
      }
    }

    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: "Kode OTP 6-digit tidak cocok atau salah! Periksa kembali email Anda."
      });
    }

    // Default license response
    const trialExp = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    let licenseRow = {
      store_id: storeId,
      store_name: storeName,
      owner_email: email,
      plan_type: body.planType || "TRIAL",
      pos_status: "ACTIVE",
      pos_expires_at: trialExp,
      cloud_status: "INACTIVE",
      active_device_id: deviceId || null
    };

    return res.status(200).json({
      success: true,
      message: "Otentikasi berhasil! Perangkat kasir telah teraktivasi.",
      license: licenseRow
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Jalankan Server
app.listen(PORT, () => {
  console.log(`[SnackPOS] API Service running on http://localhost:${PORT}`);
});
