-- =============================================================================
-- SNACKPOS COMPLETE DATABASE SCHEMA FOR POSTGREST & POSTGRESQL
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ROLES UNTUK POSTGREST
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'web_anon') THEN
    CREATE ROLE web_anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator WITH NOINHERIT LOGIN PASSWORD 'SnackPosSecurePass2026!';
  END IF;
END
$$;

GRANT web_anon TO authenticator;

-- 1. TABEL LISENSI TOKO & MULTI-TENANT
CREATE TABLE IF NOT EXISTS store_licenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id TEXT NOT NULL,
  store_name TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  plan_type TEXT NOT NULL DEFAULT 'PAKET_1',
  pos_status TEXT NOT NULL DEFAULT 'ACTIVE',
  pos_expires_at TIMESTAMPTZ,
  cloud_status TEXT NOT NULL DEFAULT 'ACTIVE',
  cloud_expires_at TIMESTAMPTZ,
  active_device_id TEXT,
  whatsapp TEXT,
  last_payment_method TEXT DEFAULT 'TUNAI',
  last_amount_paid NUMERIC DEFAULT 0,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_licenses_store_id ON store_licenses(store_id);
CREATE INDEX IF NOT EXISTS idx_store_licenses_email ON store_licenses(owner_email);
CREATE INDEX IF NOT EXISTS idx_store_licenses_whatsapp ON store_licenses(whatsapp);

-- 2. TABEL LISENSI LEGACY
CREATE TABLE IF NOT EXISTS licenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  license_key TEXT UNIQUE NOT NULL,
  client_name TEXT NOT NULL,
  store_id TEXT,
  device_id TEXT,
  license_type TEXT DEFAULT 'LIFETIME',
  status TEXT DEFAULT 'ACTIVE',
  max_devices INTEGER DEFAULT 1,
  expires_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key);

-- 3. TABEL CONFIG GLOBAL
CREATE TABLE IF NOT EXISTS app_config (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO app_config (key, value) VALUES 
('store_pins', '{"STR-001": "123456"}'::jsonb),
('pricing_config', '{"lifetimePrice": 99000, "multiKasirPrice": 40000, "cloudPricing": {"1m": 25000, "3m": 65000, "6m": 120000, "1y": 200000}}'::jsonb),
('payment_config', '{"activeGateway": "qris", "qrisImageUrl": ""}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 4. TABEL PRODUK
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  store_id TEXT,
  barcode TEXT,
  name TEXT NOT NULL,
  category TEXT,
  cost_price NUMERIC DEFAULT 0,
  price NUMERIC DEFAULT 0,
  stock INTEGER DEFAULT 0,
  min_stock INTEGER DEFAULT 5,
  unit TEXT DEFAULT 'Bungkus',
  image TEXT,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_store_updated ON products(store_id, updated_at DESC);

-- 5. TABEL TRANSAKSI KASIR
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  store_id TEXT,
  date DATE NOT NULL,
  time TEXT NOT NULL,
  cashier TEXT,
  shift TEXT,
  items JSONB DEFAULT '[]'::jsonb,
  subtotal NUMERIC DEFAULT 0,
  discount_amount NUMERIC DEFAULT 0,
  grand_total NUMERIC DEFAULT 0,
  profit NUMERIC DEFAULT 0,
  payment_method TEXT,
  cash_tendered NUMERIC DEFAULT 0,
  change_amount NUMERIC DEFAULT 0,
  member_id TEXT,
  member_name TEXT,
  member_phone TEXT,
  member_points INTEGER DEFAULT 0,
  points_redeemed INTEGER DEFAULT 0,
  point_discount NUMERIC DEFAULT 0,
  payable_amount NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_store_created ON transactions(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC);

-- 6. TABEL MUTASI STOK
CREATE TABLE IF NOT EXISTS stock_mutations (
  id TEXT PRIMARY KEY,
  store_id TEXT,
  date DATE NOT NULL,
  time TEXT NOT NULL,
  type TEXT NOT NULL,
  product_id TEXT,
  product_name TEXT,
  barcode TEXT,
  qty INTEGER NOT NULL,
  note TEXT,
  operator TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mutations_store_date ON stock_mutations(store_id, date DESC);

-- 7. TABEL RETUR PENJUALAN
CREATE TABLE IF NOT EXISTS returns (
  id TEXT PRIMARY KEY,
  store_id TEXT,
  original_trx_id TEXT NOT NULL,
  date DATE NOT NULL,
  time TEXT NOT NULL,
  cashier TEXT,
  shift TEXT,
  reason TEXT,
  restocked BOOLEAN DEFAULT true,
  items JSONB DEFAULT '[]'::jsonb,
  total_refund NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_returns_store ON returns(store_id, created_at DESC);

-- 8. TABEL MEMBER / PELANGGAN
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  store_id TEXT,
  phone TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  points INTEGER DEFAULT 0,
  total_spend NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_members_phone ON members(phone);
CREATE INDEX IF NOT EXISTS idx_members_store ON members(store_id);

-- 9. TABEL LPB
CREATE TABLE IF NOT EXISTS lpb_records (
  id TEXT PRIMARY KEY,
  store_id TEXT,
  date TEXT NOT NULL,
  time TEXT,
  supplier_name TEXT NOT NULL,
  invoice_no TEXT,
  payment_type TEXT DEFAULT 'KREDIT',
  note TEXT DEFAULT '',
  operator TEXT DEFAULT 'Kepala Toko',
  items JSONB DEFAULT '[]'::jsonb,
  total_items INTEGER DEFAULT 0,
  total_qty INTEGER DEFAULT 0,
  total_value NUMERIC(15,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lpb_store_date ON lpb_records(store_id, date DESC);

-- PERMISSIONS UNTUK POSTGREST
GRANT USAGE ON SCHEMA public TO web_anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO web_anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO web_anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO web_anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO web_anon;
