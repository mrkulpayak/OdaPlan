-- Add 'sofa' parametric shape type (straight sofa: 1/2/3 seats, no chaise)
-- Shape spec: docs/parametric-shapes.md § Koltuk
-- params: { seatCount: 1 | 2 | 3 }

ALTER TABLE furniture_products
  DROP CONSTRAINT furniture_products_shape_type_check;

ALTER TABLE furniture_products
  ADD CONSTRAINT furniture_products_shape_type_check CHECK (shape_type IN (
    'rectangle','square','circle','semicircle',
    'quarterCircle','chamferedRectangle','cornerCabinet','lSofa','sofa'
  ));

-- Convert seed sofa products to the parametric shape by name pattern
UPDATE furniture_products
SET shape_type = 'sofa', params = '{"seatCount": 3}'::jsonb
WHERE is_global = true AND category = 'Koltuk' AND name LIKE '%3''lü%';

UPDATE furniture_products
SET shape_type = 'sofa', params = '{"seatCount": 2}'::jsonb
WHERE is_global = true AND category = 'Koltuk' AND name LIKE '%2''li%';

UPDATE furniture_products
SET shape_type = 'sofa', params = '{"seatCount": 1}'::jsonb
WHERE is_global = true AND category = 'Berjer';
