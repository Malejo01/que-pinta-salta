-- Agregar categoría 'Museos' y re-categorizar eventos de museos
INSERT INTO categories (name, slug, icon, color) VALUES
  ('Museos', 'museos', 'landmark', '#8B5CF6')
ON CONFLICT (slug) DO NOTHING;

-- Agregar alias 'museo' para el autocategorizador
INSERT INTO aliases (alias, target_type, target_id)
SELECT 'museo', 'category', id FROM categories WHERE slug = 'museos'
ON CONFLICT DO NOTHING;

-- Actualizar eventos existentes que contengan 'museo' a la categoría 'Museos'
UPDATE events
SET category_id = (SELECT id FROM categories WHERE slug = 'museos')
WHERE title ILIKE '%museo%' OR description ILIKE '%museo%';
