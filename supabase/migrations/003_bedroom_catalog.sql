-- ============================================================
-- 003_bedroom_catalog.sql
-- 1. Category check constraint'e 'Dresuar' ekle
-- 2. Mevcut global kataloğu temizle
-- 3. 3 tam yatak odası seti ekle (7 ürün × 3 model = 21 ürün)
-- ============================================================

-- ── CHECK constraint güncelle ─────────────────────────────────
ALTER TABLE furniture_products
  DROP CONSTRAINT IF EXISTS furniture_products_category_check;

ALTER TABLE furniture_products
  ADD CONSTRAINT furniture_products_category_check
  CHECK (category IN (
    'Koltuk','Berjer','Sehpa','Yemek Masası','Sandalye','Konsol',
    'TV Ünitesi','Yatak','Komodin','Gardırop','Şifonyer','Dresuar',
    'Dolap','Mutfak Köşe','Özel'
  ));

-- ── Mevcut global veriyi temizle ─────────────────────────────
DELETE FROM furniture_products  WHERE dealer_id IS NULL;
DELETE FROM furniture_models    WHERE dealer_id IS NULL;
DELETE FROM furniture_companies WHERE dealer_id IS NULL;

-- ── Şirketler ────────────────────────────────────────────────
INSERT INTO furniture_companies (id, dealer_id, name, is_global) VALUES
  ('11111111-0000-0000-0000-000000000001', NULL, 'İstikbal', true),
  ('11111111-0000-0000-0000-000000000002', NULL, 'Bellona',  true),
  ('11111111-0000-0000-0000-000000000003', NULL, 'Mondi',    true);

-- ── Modeller ─────────────────────────────────────────────────
INSERT INTO furniture_models (id, dealer_id, company_id, name, is_global) VALUES
  ('22222222-0000-0000-0000-000000000001', NULL, '11111111-0000-0000-0000-000000000001', 'Atlas', true),
  ('22222222-0000-0000-0000-000000000002', NULL, '11111111-0000-0000-0000-000000000002', 'Venüs', true),
  ('22222222-0000-0000-0000-000000000003', NULL, '11111111-0000-0000-0000-000000000003', 'Luna',  true);

-- ── SET 1: İstikbal / Atlas ───────────────────────────────────
INSERT INTO furniture_products
  (dealer_id, company_id, model_id, name, category, shape_type, front_side, width_cm, depth_cm, is_global)
VALUES
  (NULL, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001',
   'Atlas Çift Kişilik Yatak',   'Yatak',    'rectangle', 'bottom', 168, 205, true),
  (NULL, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001',
   'Atlas Komodin',              'Komodin',  'rectangle', 'bottom',  50,  42, true),
  (NULL, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001',
   'Atlas 3 Kapılı Gardırop',   'Gardırop', 'rectangle', 'bottom', 180,  60, true),
  (NULL, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001',
   'Atlas 2 Kapılı Gardırop',   'Gardırop', 'rectangle', 'bottom', 120,  60, true),
  (NULL, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001',
   'Atlas Tekli Dolap Modülü',  'Dolap',    'rectangle', 'bottom',  60,  58, true),
  (NULL, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001',
   'Atlas Şifonyer',            'Şifonyer', 'rectangle', 'bottom',  90,  45, true),
  (NULL, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001',
   'Atlas Dresuar',             'Dresuar',  'rectangle', 'bottom', 100,  45, true);

-- ── SET 2: Bellona / Venüs ────────────────────────────────────
INSERT INTO furniture_products
  (dealer_id, company_id, model_id, name, category, shape_type, front_side, width_cm, depth_cm, is_global)
VALUES
  (NULL, '11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002',
   'Venüs Çift Kişilik Yatak',  'Yatak',    'rectangle', 'bottom', 172, 210, true),
  (NULL, '11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002',
   'Venüs Komodin',             'Komodin',  'rectangle', 'bottom',  55,  44, true),
  (NULL, '11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002',
   'Venüs 3 Kapılı Gardırop',  'Gardırop', 'rectangle', 'bottom', 190,  62, true),
  (NULL, '11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002',
   'Venüs 2 Kapılı Gardırop',  'Gardırop', 'rectangle', 'bottom', 125,  62, true),
  (NULL, '11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002',
   'Venüs Tekli Dolap Modülü', 'Dolap',    'rectangle', 'bottom',  65,  60, true),
  (NULL, '11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002',
   'Venüs Şifonyer',           'Şifonyer', 'rectangle', 'bottom',  95,  48, true),
  (NULL, '11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002',
   'Venüs Dresuar',            'Dresuar',  'rectangle', 'bottom', 105,  48, true);

-- ── SET 3: Mondi / Luna ───────────────────────────────────────
INSERT INTO furniture_products
  (dealer_id, company_id, model_id, name, category, shape_type, front_side, width_cm, depth_cm, is_global)
VALUES
  (NULL, '11111111-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000003',
   'Luna Çift Kişilik Yatak',   'Yatak',    'rectangle', 'bottom', 165, 208, true),
  (NULL, '11111111-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000003',
   'Luna Komodin',              'Komodin',  'rectangle', 'bottom',  52,  40, true),
  (NULL, '11111111-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000003',
   'Luna 3 Kapılı Gardırop',   'Gardırop', 'rectangle', 'bottom', 185,  58, true),
  (NULL, '11111111-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000003',
   'Luna 2 Kapılı Gardırop',   'Gardırop', 'rectangle', 'bottom', 130,  58, true),
  (NULL, '11111111-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000003',
   'Luna Tekli Dolap Modülü',  'Dolap',    'rectangle', 'bottom',  60,  55, true),
  (NULL, '11111111-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000003',
   'Luna Şifonyer',            'Şifonyer', 'rectangle', 'bottom',  92,  46, true),
  (NULL, '11111111-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000003',
   'Luna Dresuar',             'Dresuar',  'rectangle', 'bottom', 102,  46, true);
