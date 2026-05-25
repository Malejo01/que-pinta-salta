-- Nuevas categorías para eventos scrapeados de vamos.gob.ar
INSERT INTO categories (name, slug, icon, color) VALUES
  ('Ballet',        'ballet',       'drama',     '#E879F9'),
  ('Humor',         'humor',        'smile',     '#FACC15'),
  ('Infantil',      'infantil',     'baby',      '#34D399'),
  ('Deportes',      'deportes',     'trophy',    '#60A5FA'),
  ('Espectáculos',  'espectaculos', 'sparkles',  '#F97316')
ON CONFLICT (slug) DO NOTHING;
