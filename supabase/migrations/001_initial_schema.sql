-- Dealer accounts
CREATE TABLE dealers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Furniture companies / brands
-- is_global=true + dealer_id=null = visible to all dealers
-- dealer_id set = private to that dealer
CREATE TABLE furniture_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID REFERENCES dealers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_global BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Furniture models / sets (optional grouping)
CREATE TABLE furniture_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID REFERENCES dealers(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES furniture_companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_global BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Individual furniture products
CREATE TABLE furniture_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID REFERENCES dealers(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES furniture_companies(id) ON DELETE CASCADE,
  model_id UUID REFERENCES furniture_models(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'Koltuk','Berjer','Sehpa','Yemek Masası','Sandalye','Konsol',
    'TV Ünitesi','Yatak','Komodin','Gardırop','Şifonyer','Dolap',
    'Mutfak Köşe','Özel'
  )),
  shape_type TEXT NOT NULL CHECK (shape_type IN (
    'rectangle','square','circle','semicircle',
    'quarterCircle','chamferedRectangle','cornerCabinet'
  )),
  front_side TEXT NOT NULL DEFAULT 'bottom' CHECK (front_side IN ('top','right','bottom','left')),
  width_cm NUMERIC NOT NULL CHECK (width_cm > 0 AND width_cm <= 9999),
  depth_cm NUMERIC NOT NULL CHECK (depth_cm > 0 AND depth_cm <= 9999),
  params JSONB,
  is_global BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dealer favorites (company, model, or product)
CREATE TABLE dealer_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('company','model','product')),
  target_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (dealer_id, target_type, target_id)
);

-- Indexes
CREATE INDEX idx_furniture_companies_dealer ON furniture_companies(dealer_id);
CREATE INDEX idx_furniture_companies_global ON furniture_companies(is_global) WHERE is_global = true;
CREATE INDEX idx_furniture_models_company ON furniture_models(company_id);
CREATE INDEX idx_furniture_products_company ON furniture_products(company_id);
CREATE INDEX idx_furniture_products_model ON furniture_products(model_id);
CREATE INDEX idx_dealer_favorites_dealer ON dealer_favorites(dealer_id);
CREATE INDEX idx_dealer_favorites_target ON dealer_favorites(target_type, target_id);
CREATE INDEX idx_furniture_products_name ON furniture_products USING gin(to_tsvector('simple', name));
CREATE INDEX idx_furniture_companies_name ON furniture_companies USING gin(to_tsvector('simple', name));
CREATE INDEX idx_furniture_models_name ON furniture_models USING gin(to_tsvector('simple', name));

-- Enable RLS on all tables
ALTER TABLE dealers ENABLE ROW LEVEL SECURITY;
ALTER TABLE furniture_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE furniture_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE furniture_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealer_favorites ENABLE ROW LEVEL SECURITY;

-- Dealers: can only read/update their own row
CREATE POLICY "dealers_own" ON dealers
  USING (id = auth.uid());

-- Companies: can read own + global; can write own only
CREATE POLICY "companies_read" ON furniture_companies
  FOR SELECT USING (dealer_id = auth.uid() OR is_global = true);
CREATE POLICY "companies_write" ON furniture_companies
  FOR INSERT WITH CHECK (dealer_id = auth.uid());
CREATE POLICY "companies_update" ON furniture_companies
  FOR UPDATE USING (dealer_id = auth.uid());
CREATE POLICY "companies_delete" ON furniture_companies
  FOR DELETE USING (dealer_id = auth.uid());

-- Models: same pattern as companies
CREATE POLICY "models_read" ON furniture_models
  FOR SELECT USING (dealer_id = auth.uid() OR is_global = true);
CREATE POLICY "models_write" ON furniture_models
  FOR INSERT WITH CHECK (dealer_id = auth.uid());

-- Products: same pattern
CREATE POLICY "products_read" ON furniture_products
  FOR SELECT USING (dealer_id = auth.uid() OR is_global = true);
CREATE POLICY "products_write" ON furniture_products
  FOR INSERT WITH CHECK (dealer_id = auth.uid());
CREATE POLICY "products_update" ON furniture_products
  FOR UPDATE USING (dealer_id = auth.uid());
CREATE POLICY "products_delete" ON furniture_products
  FOR DELETE USING (dealer_id = auth.uid());

-- Favorites: own rows only
CREATE POLICY "favorites_own" ON dealer_favorites
  USING (dealer_id = auth.uid())
  WITH CHECK (dealer_id = auth.uid());

-- Auto-upsert dealer row on first login (called from app on session start)
-- The app will call: INSERT INTO dealers (id, name) VALUES (auth.uid(), email) ON CONFLICT (id) DO NOTHING
