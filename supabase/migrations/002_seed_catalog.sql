-- Seed global furniture catalog data
-- 3 companies × 2 models × 3-4 products each (~21 products total)
-- All records are global (dealer_id = NULL, is_global = true)

-- Companies
INSERT INTO furniture_companies (id, dealer_id, name, is_global) VALUES
  ('11111111-0000-0000-0000-000000000001', NULL, 'İstikbal', true),
  ('11111111-0000-0000-0000-000000000002', NULL, 'Bellona', true),
  ('11111111-0000-0000-0000-000000000003', NULL, 'Mondi', true);

-- Models (2 per company)
INSERT INTO furniture_models (id, dealer_id, company_id, name, is_global) VALUES
  -- İstikbal models
  ('22222222-0000-0000-0000-000000000001', NULL, '11111111-0000-0000-0000-000000000001', 'Laguna', true),
  ('22222222-0000-0000-0000-000000000002', NULL, '11111111-0000-0000-0000-000000000001', 'Natura', true),
  -- Bellona models
  ('22222222-0000-0000-0000-000000000003', NULL, '11111111-0000-0000-0000-000000000002', 'Olympos', true),
  ('22222222-0000-0000-0000-000000000004', NULL, '11111111-0000-0000-0000-000000000002', 'Venüs', true),
  -- Mondi models
  ('22222222-0000-0000-0000-000000000005', NULL, '11111111-0000-0000-0000-000000000003', 'Trend', true),
  ('22222222-0000-0000-0000-000000000006', NULL, '11111111-0000-0000-0000-000000000003', 'Concept', true);

-- Products
-- İstikbal / Laguna
INSERT INTO furniture_products (dealer_id, company_id, model_id, name, category, shape_type, front_side, width_cm, depth_cm, is_global) VALUES
  (NULL, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'Laguna 3''lü Koltuk', 'Koltuk', 'rectangle', 'bottom', 220, 95, true),
  (NULL, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'Laguna 2''li Koltuk', 'Koltuk', 'rectangle', 'bottom', 160, 95, true),
  (NULL, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'Laguna Berjer', 'Berjer', 'rectangle', 'bottom', 90, 95, true),
  (NULL, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'Laguna Sehpa', 'Sehpa', 'rectangle', 'bottom', 110, 60, true);

-- İstikbal / Natura
INSERT INTO furniture_products (dealer_id, company_id, model_id, name, category, shape_type, front_side, width_cm, depth_cm, is_global) VALUES
  (NULL, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'Natura Yatak 160x200', 'Yatak', 'rectangle', 'bottom', 160, 200, true),
  (NULL, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'Natura Yatak 180x200', 'Yatak', 'rectangle', 'bottom', 180, 200, true),
  (NULL, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'Natura Komodin', 'Komodin', 'rectangle', 'bottom', 50, 45, true);

-- Bellona / Olympos
INSERT INTO furniture_products (dealer_id, company_id, model_id, name, category, shape_type, front_side, width_cm, depth_cm, is_global) VALUES
  (NULL, '11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000003', 'Olympos Köşe Koltuk Sol', 'Koltuk', 'rectangle', 'bottom', 280, 160, true),
  (NULL, '11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000003', 'Olympos 3''lü Koltuk', 'Koltuk', 'rectangle', 'bottom', 230, 90, true),
  (NULL, '11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000003', 'Olympos TV Ünitesi', 'TV Ünitesi', 'rectangle', 'bottom', 180, 45, true),
  (NULL, '11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000003', 'Olympos Orta Sehpa', 'Sehpa', 'rectangle', 'bottom', 100, 55, true);

-- Bellona / Venüs
INSERT INTO furniture_products (dealer_id, company_id, model_id, name, category, shape_type, front_side, width_cm, depth_cm, is_global) VALUES
  (NULL, '11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000004', 'Venüs Yemek Masası 6 Kişilik', 'Yemek Masası', 'rectangle', 'bottom', 160, 90, true),
  (NULL, '11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000004', 'Venüs Sandalye', 'Sandalye', 'rectangle', 'bottom', 45, 50, true),
  (NULL, '11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000004', 'Venüs Büfe', 'Konsol', 'rectangle', 'bottom', 140, 45, true);

-- Mondi / Trend
INSERT INTO furniture_products (dealer_id, company_id, model_id, name, category, shape_type, front_side, width_cm, depth_cm, is_global) VALUES
  (NULL, '11111111-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000005', 'Trend Gardırop 3 Kapılı', 'Gardırop', 'rectangle', 'bottom', 180, 60, true),
  (NULL, '11111111-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000005', 'Trend Gardırop 2 Kapılı', 'Gardırop', 'rectangle', 'bottom', 120, 60, true),
  (NULL, '11111111-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000005', 'Trend Şifonyer', 'Şifonyer', 'rectangle', 'bottom', 80, 45, true);

-- Mondi / Concept
INSERT INTO furniture_products (dealer_id, company_id, model_id, name, category, shape_type, front_side, width_cm, depth_cm, is_global) VALUES
  (NULL, '11111111-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000006', 'Concept Çalışma Masası', 'Konsol', 'rectangle', 'bottom', 140, 70, true),
  (NULL, '11111111-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000006', 'Concept Kitaplık', 'Dolap', 'rectangle', 'bottom', 90, 35, true),
  (NULL, '11111111-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000006', 'Concept TV Ünitesi', 'TV Ünitesi', 'rectangle', 'bottom', 200, 50, true);
