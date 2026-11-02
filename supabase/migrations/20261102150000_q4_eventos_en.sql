-- ============================================================================
-- Tanda Q4 (Q4-7): títulos y descripciones de eventos en inglés.
-- ============================================================================
--
-- Aditiva y compatible hacia atrás: tres columnas nuevas, NULL por defecto.
--   title_en / description_en: la traducción (NULL = no hay: /en muestra el
--     original con «(in Spanish)»).
--   traducido_en_at: cuándo se intentó traducir (con o sin resultado). Sirve
--     para no reintentar y para el tope diario del proceso
--     (`GET /api/cron/traducir-eventos`, por defecto 100 por día de Salta).
-- Las escribe solo el proceso con la service key; las lecturas públicas de
-- events siguen con las mismas policies. title y description no se tocan.
-- ============================================================================

alter table public.events
  add column if not exists title_en text,
  add column if not exists description_en text,
  add column if not exists traducido_en_at timestamptz;

-- Para contar los intentos del día (el tope) sin barrer la tabla.
create index if not exists events_traducido_en_at_idx
  on public.events (traducido_en_at)
  where traducido_en_at is not null;

comment on column public.events.title_en is
  'Q4-7: título en inglés (traducción automática; los nombres de lugares y artistas quedan como en el original). NULL = sin traducción.';
comment on column public.events.description_en is
  'Q4-7: descripción en inglés. NULL = sin traducción (o el evento no tiene descripción).';
comment on column public.events.traducido_en_at is
  'Q4-7: cuándo el proceso de traducción intentó este evento (con o sin resultado). NULL = nunca. Cuenta para el tope diario.';
