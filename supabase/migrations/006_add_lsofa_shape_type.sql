-- Add 'lSofa' parametric shape type
-- Shape spec: docs/parametric-shapes.md § L Koltuk
-- params: { bodyDepthCm: number, chaiseSide: 'left' | 'right' }
-- width_cm = total width (A), depth_cm = chaise depth (C)

ALTER TABLE furniture_products
  DROP CONSTRAINT furniture_products_shape_type_check;

ALTER TABLE furniture_products
  ADD CONSTRAINT furniture_products_shape_type_check CHECK (shape_type IN (
    'rectangle','square','circle','semicircle',
    'quarterCircle','chamferedRectangle','cornerCabinet','lSofa'
  ));

-- Convert existing corner sofa seed products to the parametric L shape
UPDATE furniture_products
SET shape_type = 'lSofa',
    params = '{"bodyDepthCm": 95, "chaiseSide": "left"}'::jsonb
WHERE name = 'Olympos Köşe Koltuk Sol' AND is_global = true;

UPDATE furniture_products
SET shape_type = 'lSofa',
    params = '{"bodyDepthCm": 100, "chaiseSide": "right"}'::jsonb
WHERE name = 'Olympos Köşe Koltuk' AND is_global = true;
