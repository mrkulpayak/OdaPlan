-- ============================================================
-- 004_add_filter_fields.sql
-- furniture_models   → room_type  (oda tipi)
-- furniture_products → color_family (renk ailesi)
-- Mevcut test datası güncellenir
-- ============================================================

-- ── Sütunlar ekle ─────────────────────────────────────────────
ALTER TABLE furniture_models
  ADD COLUMN IF NOT EXISTS room_type TEXT DEFAULT NULL;

ALTER TABLE furniture_products
  ADD COLUMN IF NOT EXISTS color_family TEXT DEFAULT NULL;

-- ── Mevcut modellere oda tipi ata ────────────────────────────
UPDATE furniture_models SET room_type = 'Yatak Odası'
  WHERE id IN (
    '22222222-0000-0000-0000-000000000001',  -- Atlas
    '22222222-0000-0000-0000-000000000002',  -- Venüs
    '22222222-0000-0000-0000-000000000003'   -- Luna
  );

-- ── Mevcut ürünlere renk ata ──────────────────────────────────
-- Atlas → Beyaz
UPDATE furniture_products SET color_family = 'Beyaz'
  WHERE model_id = '22222222-0000-0000-0000-000000000001';

-- Venüs → Antrasit
UPDATE furniture_products SET color_family = 'Antrasit'
  WHERE model_id = '22222222-0000-0000-0000-000000000002';

-- Luna → Ceviz
UPDATE furniture_products SET color_family = 'Ceviz'
  WHERE model_id = '22222222-0000-0000-0000-000000000003';
