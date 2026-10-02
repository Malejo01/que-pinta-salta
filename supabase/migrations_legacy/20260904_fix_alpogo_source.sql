-- AlPogo ya tiene scraper implementado (lib/scraper/alpogo-scraper.ts) y se ejecuta
-- en "Actualizar todo", pero la fila sembrada en 20260525_scrape_admin.sql quedó como
-- fuente pendiente (is_enabled = false, descripción de placeholder). Eso hacía que el
-- panel la mostrara como "Pendiente", la contara fuera de "activos" y deshabilitara su
-- botón individual, aunque el batch sí la corría.
--
-- Sincroniza la fila con lib/scraper-config.ts. Idempotente.
update public.scrape_sources
set
  description = 'Eventos publicados para Salta en AlPogo.',
  site_url = 'https://alpogo.com/',
  is_enabled = true
where key = 'alpogo';
