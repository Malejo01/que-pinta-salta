-- Verificación de solo lectura de scripts/db/produccion/aplicar-r47.sql.
-- La corre el supervisor (o Mauro). No escribe nada. Solo agregados: ninguna
-- consulta devuelve user_id ni email.

-- ----------------------------------------------------------------------------
-- ANTES de aplicar (guardar los números para comparar).
-- ----------------------------------------------------------------------------

-- A1. Marcas por tipo.
select kind, count(*) as filas
from public.event_attendance
group by kind
order by kind;

-- A2. Marcas sin su favorito (las que el backfill va a guardar).
select a.kind, count(*) as sin_favorito
from public.event_attendance a
where not exists (
  select 1 from public.user_favorites f
  where f.user_id = a.user_id and f.event_id = a.event_id
)
group by a.kind
order by a.kind;

-- A3. Total de favoritos de eventos (después tiene que ser A3 + suma de A2).
select count(*) as favoritos from public.user_favorites;

-- A4. Totales agregados.
select sum(voy) as voy, sum(me_interesa) as me_interesa
from public.event_attendance_totals;

-- ----------------------------------------------------------------------------
-- DESPUÉS de aplicar.
-- ----------------------------------------------------------------------------

-- D1. Ninguna fila que no sea 'voy' (esperado: 0).
select count(*) as no_voy
from public.event_attendance
where kind <> 'voy';

-- D2. Ningún Voy sin Guardado (esperado: 0).
select count(*) as voy_sin_guardado
from public.event_attendance a
where not exists (
  select 1 from public.user_favorites f
  where f.user_id = a.user_id and f.event_id = a.event_id
);

-- D3. Favoritos (esperado: A3 + la suma de A2).
select count(*) as favoritos from public.user_favorites;

-- D4. El CHECK nuevo, validado.
-- Esperado: event_attendance_kind_check | CHECK ((kind = 'voy'::text)) | true
select conname, pg_get_constraintdef(oid) as definicion, convalidated
from pg_constraint
where conrelid = 'public.event_attendance'::regclass and contype = 'c';

-- D5. Totales: voy igual que en A4, me_interesa en 0.
select sum(voy) as voy, sum(me_interesa) as me_interesa
from public.event_attendance_totals;

-- D6. Ningún negativo (esperado: 0).
select count(*) as negativos
from public.event_attendance_totals
where voy < 0 or me_interesa < 0;

-- D7. La versión quedó registrada.
select version, name
from supabase_migrations.schema_migrations
where version = '20261018120000';
