-- ============================================================
-- Instagram Event Engine - Nuevas Cuentas
-- ============================================================

-- Seed de nuevas cuentas de Instagram a monitorear
INSERT INTO public.instagram_accounts (username, display_name, notes, default_venue_name, default_maps_url, default_category) VALUES
  ('trewa.club', 'Trewa Club', 'Club nocturno / Bar', 'Trewa Club', 'https://maps.google.com/?q=Trewa+Club+Salta', 'boliches'),
  ('livefresh.ok', 'Live Fresh', 'Productora de eventos', NULL, NULL, 'boliches'),
  ('bresh', 'Bresh', 'Fiesta Bresh', NULL, NULL, 'boliches'),
  ('lajunglapro', 'La Jungla Pro', 'Productora de eventos', NULL, NULL, 'boliches'),
  ('peppers.gintoneria', 'Peppers Gintonería', 'Bar / Gintonería', 'Peppers Gintonería', 'https://maps.google.com/?q=Peppers+Gintoneria+Salta', 'boliches')
ON CONFLICT (username) DO NOTHING;
