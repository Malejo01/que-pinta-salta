-- Ronda 17 (17-b): dos avisos del Performance Advisor sobre `public.events`.
--
-- 1. "duplicate_index": `events_start_date_idx` (creado en
--    supabase/migrations/20261002193000_event_dedup.sql) y
--    `idx_events_start_date` (creado antes, en
--    supabase/migrations/20261002160000_baseline.sql) son el mismo índice
--    btree sobre (start_date), sin WHERE y sin ninguna propiedad especial:
--    ninguno de los dos respalda una constraint (ni UNIQUE, ni PRIMARY KEY,
--    ni EXCLUDE — se verificó contra pg_constraint.conindid y pg_index en la
--    base local antes de escribir esto, y ninguno aparece), así que el
--    criterio de "no usar ningún constraint" no desempata por sí solo entre
--    los dos. Se elige borrar `idx_events_start_date`: es el más viejo, no
--    tiene comentario que explique para qué se usa, y no sigue la
--    convención de nombres `<tabla>_<columna>_idx` que ya usan los índices
--    más nuevos de esta misma tabla (events_dedup_key_idx,
--    events_merge_audit_idx) — incluido `events_start_date_idx`, que sí
--    queda, con su comentario original ("el job de limpieza y la ingesta
--    traen candidatos por rango de día").
--
-- 2. Dos columnas de `events` muy consultadas (filtros y joins) sin índice
--    propio: `venue_id` (fichas de lugar, resolución de venue) y
--    `created_by` (RLS de owner/admin en events, "mis eventos" del panel).
--
-- Va en un archivo aparte para poder revertirlo solo si hiciera falta, sin
-- tocar las políticas de RLS de 20261010120000_rls_initplan.sql.

drop index if exists public.idx_events_start_date;

create index if not exists events_venue_id_idx
  on public.events (venue_id);

create index if not exists events_created_by_idx
  on public.events (created_by);
