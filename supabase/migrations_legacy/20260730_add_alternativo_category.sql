-- Agregar categoría 'Alternativo'
INSERT INTO categories (name, slug, icon, color) VALUES
  ('Alternativo', 'alternativo', 'flame', '#EF4444')
ON CONFLICT (slug) DO NOTHING;

-- Agregar alias para el autocategorizador
INSERT INTO aliases (alias, target_type, target_id)
SELECT 'alternativo', 'category', id FROM categories WHERE slug = 'alternativo'
ON CONFLICT DO NOTHING;

INSERT INTO aliases (alias, target_type, target_id)
SELECT 'gótica', 'category', id FROM categories WHERE slug = 'alternativo'
ON CONFLICT DO NOTHING;

INSERT INTO aliases (alias, target_type, target_id)
SELECT 'gotica', 'category', id FROM categories WHERE slug = 'alternativo'
ON CONFLICT DO NOTHING;

INSERT INTO aliases (alias, target_type, target_id)
SELECT 'tematica', 'category', id FROM categories WHERE slug = 'alternativo'
ON CONFLICT DO NOTHING;

INSERT INTO aliases (alias, target_type, target_id)
SELECT 'temática', 'category', id FROM categories WHERE slug = 'alternativo'
ON CONFLICT DO NOTHING;
