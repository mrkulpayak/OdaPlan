-- Add 'cabinet' and 'drawerUnit' parametric shape types (case furniture)
-- Shape spec: docs/parametric-shapes.md § Kapaklı Dolap / Çekmeceli
-- No params — width/depth only.
--   cabinet:    top panel + equal doors, count = round(width / 50), min 1
--   drawerUnit: top panel + single full-width 18 mm front (drawers)

ALTER TABLE furniture_products
  DROP CONSTRAINT furniture_products_shape_type_check;

ALTER TABLE furniture_products
  ADD CONSTRAINT furniture_products_shape_type_check CHECK (shape_type IN (
    'rectangle','square','circle','semicircle',
    'quarterCircle','chamferedRectangle','cornerCabinet',
    'lSofa','sofa','cabinet','drawerUnit'
  ));

-- Convert seed case furniture by category
UPDATE furniture_products
SET shape_type = 'cabinet'
WHERE is_global = true AND shape_type = 'rectangle'
  AND category IN ('Gardırop', 'Dolap', 'TV Ünitesi');

UPDATE furniture_products
SET shape_type = 'drawerUnit'
WHERE is_global = true AND shape_type = 'rectangle'
  AND category IN ('Komodin', 'Şifonyer');
