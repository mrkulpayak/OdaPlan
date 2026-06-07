-- ============================================================
-- 005_more_sets.sql
-- Yeni kategoriler + 9 yeni model:
--   3 × Oturma Odası (koltuk takımı)
--   3 × Yemek Odası
--   3 × Genç Odası
-- Her model farklı ürün kombinasyonu ve farklı ölçüler
-- ============================================================

-- ── CHECK constraint: yeni kategoriler ekle ──────────────────
ALTER TABLE furniture_products
  DROP CONSTRAINT IF EXISTS furniture_products_category_check;

ALTER TABLE furniture_products
  ADD CONSTRAINT furniture_products_category_check
  CHECK (category IN (
    'Koltuk','Berjer','Sehpa','Yemek Masası','Sandalye',
    'Konsol','TV Ünitesi','Büfe','Kitaplık','Çalışma Masası',
    'Yatak','Komodin','Gardırop','Şifonyer','Dresuar',
    'Dolap','Mutfak Köşe','Özel'
  ));

-- ── 9 yeni model ─────────────────────────────────────────────
INSERT INTO furniture_models (id, dealer_id, company_id, name, room_type, is_global) VALUES
  -- Oturma Odası
  ('22222222-0000-0000-0000-000000000004', NULL, '11111111-0000-0000-0000-000000000001', 'Laguna',  'Oturma Odası', true),
  ('22222222-0000-0000-0000-000000000005', NULL, '11111111-0000-0000-0000-000000000002', 'Olympos', 'Oturma Odası', true),
  ('22222222-0000-0000-0000-000000000006', NULL, '11111111-0000-0000-0000-000000000003', 'Vega',    'Oturma Odası', true),
  -- Yemek Odası
  ('22222222-0000-0000-0000-000000000007', NULL, '11111111-0000-0000-0000-000000000001', 'Roma',    'Yemek Odası',  true),
  ('22222222-0000-0000-0000-000000000008', NULL, '11111111-0000-0000-0000-000000000002', 'Dora',    'Yemek Odası',  true),
  ('22222222-0000-0000-0000-000000000009', NULL, '11111111-0000-0000-0000-000000000003', 'Lara',    'Yemek Odası',  true),
  -- Genç Odası
  ('22222222-0000-0000-0000-000000000010', NULL, '11111111-0000-0000-0000-000000000001', 'Step',    'Genç Odası',   true),
  ('22222222-0000-0000-0000-000000000011', NULL, '11111111-0000-0000-0000-000000000002', 'Smart',   'Genç Odası',   true),
  ('22222222-0000-0000-0000-000000000012', NULL, '11111111-0000-0000-0000-000000000003', 'Neo',     'Genç Odası',   true);

-- ════════════════════════════════════════════════════════════
-- OTURMA ODASI TAKIMLARİ
-- ════════════════════════════════════════════════════════════

-- ── İstikbal / Laguna — 3+2 koltuk + berjer, Gri kumaş ──────
INSERT INTO furniture_products
  (dealer_id, company_id, model_id, name, category, shape_type, front_side, width_cm, depth_cm, color_family, is_global)
VALUES
  (NULL, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000004',
   'Laguna 3''lü Koltuk',   'Koltuk',    'rectangle', 'bottom', 220, 90, 'Gri', true),
  (NULL, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000004',
   'Laguna 2''li Koltuk',   'Koltuk',    'rectangle', 'bottom', 155, 90, 'Gri', true),
  (NULL, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000004',
   'Laguna Berjer',         'Berjer',    'rectangle', 'bottom',  90, 85, 'Gri', true),
  (NULL, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000004',
   'Laguna Orta Sehpa',     'Sehpa',     'rectangle', 'bottom', 110, 65, 'Gri', true),
  (NULL, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000004',
   'Laguna TV Ünitesi',     'TV Ünitesi','rectangle', 'bottom', 180, 45, 'Gri', true),
  (NULL, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000004',
   'Laguna Büfe',           'Büfe',      'rectangle', 'bottom', 120, 40, 'Gri', true);

-- ── Bellona / Olympos — Köşe koltuk + berjer, Bej kumaş ─────
INSERT INTO furniture_products
  (dealer_id, company_id, model_id, name, category, shape_type, front_side, width_cm, depth_cm, color_family, is_global)
VALUES
  (NULL, '11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000005',
   'Olympos Köşe Koltuk',   'Koltuk',    'rectangle', 'bottom', 260,170, 'Bej', true),
  (NULL, '11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000005',
   'Olympos Berjer',        'Berjer',    'rectangle', 'bottom',  95, 88, 'Bej', true),
  (NULL, '11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000005',
   'Olympos Orta Sehpa',    'Sehpa',     'rectangle', 'bottom', 100, 60, 'Bej', true),
  (NULL, '11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000005',
   'Olympos Yan Sehpa',     'Sehpa',     'rectangle', 'bottom',  55, 55, 'Bej', true),
  (NULL, '11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000005',
   'Olympos TV Ünitesi',    'TV Ünitesi','rectangle', 'bottom', 200, 42, 'Bej', true);

-- ── Mondi / Vega — 3+1 koltuk, Antrasit kumaş ───────────────
INSERT INTO furniture_products
  (dealer_id, company_id, model_id, name, category, shape_type, front_side, width_cm, depth_cm, color_family, is_global)
VALUES
  (NULL, '11111111-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000006',
   'Vega 3''lü Koltuk',     'Koltuk',    'rectangle', 'bottom', 230, 95, 'Antrasit', true),
  (NULL, '11111111-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000006',
   'Vega Berjer',           'Berjer',    'rectangle', 'bottom',  88, 88, 'Antrasit', true),
  (NULL, '11111111-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000006',
   'Vega Orta Sehpa',       'Sehpa',     'rectangle', 'bottom', 120, 70, 'Antrasit', true),
  (NULL, '11111111-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000006',
   'Vega TV Ünitesi',       'TV Ünitesi','rectangle', 'bottom', 160, 40, 'Antrasit', true),
  (NULL, '11111111-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000006',
   'Vega Büfe',             'Büfe',      'rectangle', 'bottom', 130, 42, 'Antrasit', true);

-- ════════════════════════════════════════════════════════════
-- YEMEK ODASI TAKIMLARİ
-- ════════════════════════════════════════════════════════════

-- ── İstikbal / Roma — 6 kişilik, Beyaz lake ─────────────────
INSERT INTO furniture_products
  (dealer_id, company_id, model_id, name, category, shape_type, front_side, width_cm, depth_cm, color_family, is_global)
VALUES
  (NULL, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000007',
   'Roma Yemek Masası 6K',  'Yemek Masası','rectangle','bottom', 160, 90, 'Beyaz', true),
  (NULL, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000007',
   'Roma Sandalye',         'Sandalye',  'rectangle', 'bottom',  45, 50, 'Beyaz', true),
  (NULL, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000007',
   'Roma Büfe',             'Büfe',      'rectangle', 'bottom', 150, 45, 'Beyaz', true),
  (NULL, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000007',
   'Roma Vitrin',           'Dolap',     'rectangle', 'bottom',  90, 38, 'Beyaz', true);

-- ── Bellona / Dora — 8 kişilik, büyük, Ceviz ────────────────
INSERT INTO furniture_products
  (dealer_id, company_id, model_id, name, category, shape_type, front_side, width_cm, depth_cm, color_family, is_global)
VALUES
  (NULL, '11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000008',
   'Dora Yemek Masası 8K',  'Yemek Masası','rectangle','bottom', 200,100, 'Ceviz', true),
  (NULL, '11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000008',
   'Dora Sandalye',         'Sandalye',  'rectangle', 'bottom',  48, 52, 'Ceviz', true),
  (NULL, '11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000008',
   'Dora Büfe',             'Büfe',      'rectangle', 'bottom', 170, 48, 'Ceviz', true);

-- ── Mondi / Lara — 4 kişilik, kompakt, Meşe ─────────────────
INSERT INTO furniture_products
  (dealer_id, company_id, model_id, name, category, shape_type, front_side, width_cm, depth_cm, color_family, is_global)
VALUES
  (NULL, '11111111-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000009',
   'Lara Yemek Masası 4K',  'Yemek Masası','rectangle','bottom', 120, 80, 'Meşe', true),
  (NULL, '11111111-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000009',
   'Lara Sandalye',         'Sandalye',  'rectangle', 'bottom',  44, 48, 'Meşe', true),
  (NULL, '11111111-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000009',
   'Lara Büfe',             'Büfe',      'rectangle', 'bottom', 120, 42, 'Meşe', true),
  (NULL, '11111111-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000009',
   'Lara Servis Dolabı',    'Dolap',     'rectangle', 'bottom',  75, 40, 'Meşe', true);

-- ════════════════════════════════════════════════════════════
-- GENÇ ODASI TAKIMLARİ
-- ════════════════════════════════════════════════════════════

-- ── İstikbal / Step — 3 kapılı gardırop, Beyaz ──────────────
INSERT INTO furniture_products
  (dealer_id, company_id, model_id, name, category, shape_type, front_side, width_cm, depth_cm, color_family, is_global)
VALUES
  (NULL, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000010',
   'Step Tek Kişilik Yatak','Yatak',         'rectangle','bottom', 100,200, 'Beyaz', true),
  (NULL, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000010',
   'Step 3 Kapılı Gardırop','Gardırop',      'rectangle','bottom', 150, 58, 'Beyaz', true),
  (NULL, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000010',
   'Step Komodin',          'Komodin',        'rectangle','bottom',  45, 40, 'Beyaz', true),
  (NULL, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000010',
   'Step Çalışma Masası',   'Çalışma Masası','rectangle','bottom', 120, 60, 'Beyaz', true),
  (NULL, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000010',
   'Step Kitaplık',         'Kitaplık',       'rectangle','bottom',  80, 30, 'Beyaz', true);

-- ── Bellona / Smart — 2 kapılı gardırop + alt ünite, Antrasit
INSERT INTO furniture_products
  (dealer_id, company_id, model_id, name, category, shape_type, front_side, width_cm, depth_cm, color_family, is_global)
VALUES
  (NULL, '11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000011',
   'Smart Tek Kişilik Yatak','Yatak',         'rectangle','bottom', 105,205, 'Antrasit', true),
  (NULL, '11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000011',
   'Smart 2 Kapılı Gardırop','Gardırop',      'rectangle','bottom', 120, 55, 'Antrasit', true),
  (NULL, '11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000011',
   'Smart Alt Ünite Dolap', 'Dolap',           'rectangle','bottom',  90, 55, 'Antrasit', true),
  (NULL, '11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000011',
   'Smart Komodin',         'Komodin',         'rectangle','bottom',  42, 38, 'Antrasit', true),
  (NULL, '11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000011',
   'Smart Çalışma Masası',  'Çalışma Masası', 'rectangle','bottom', 130, 65, 'Antrasit', true),
  (NULL, '11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000011',
   'Smart Kitaplık',        'Kitaplık',        'rectangle','bottom',  90, 32, 'Antrasit', true);

-- ── Mondi / Neo — 2 kapılı küçük gardırop, minimalist, Meşe ─
INSERT INTO furniture_products
  (dealer_id, company_id, model_id, name, category, shape_type, front_side, width_cm, depth_cm, color_family, is_global)
VALUES
  (NULL, '11111111-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000012',
   'Neo Tek Kişilik Yatak', 'Yatak',          'rectangle','bottom', 100,200, 'Meşe', true),
  (NULL, '11111111-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000012',
   'Neo 2 Kapılı Gardırop', 'Gardırop',       'rectangle','bottom', 110, 58, 'Meşe', true),
  (NULL, '11111111-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000012',
   'Neo Komodin',           'Komodin',         'rectangle','bottom',  45, 42, 'Meşe', true),
  (NULL, '11111111-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000012',
   'Neo Çalışma Masası',    'Çalışma Masası', 'rectangle','bottom', 140, 68, 'Meşe', true),
  (NULL, '11111111-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000012',
   'Neo Kitaplık',          'Kitaplık',        'rectangle','bottom',  85, 30, 'Meşe', true);
