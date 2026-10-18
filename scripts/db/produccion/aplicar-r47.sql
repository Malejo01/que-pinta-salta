-- ============================================================================
-- APLICAR EN PRODUCCIÓN: migración de la R47 (Guardar, Voy y Seguir)
-- ============================================================================
-- Lo pega Mauro en el SQL Editor de Supabase (proyecto de producción), o lo
-- aplica el lead con apply_migration y la confirmación de Mauro. Es una sola
-- transacción: si algo falla, no queda nada a medias.
--
-- Aplicar DESPUÉS de mergear y desplegar el PR de la R47 (#76): con ese código
-- la web y la app ya no escriben ni leen 'me_interesa'. Si se aplica antes,
-- un "Me interesa" que alguien toque en la versión vieja falla con 23514.
--
-- Contiene, sin cambios, el contenido de:
--   supabase/migrations/20261018120000_r47_guardar_voy.sql
-- y al final registra la versión en supabase_migrations.schema_migrations
-- (para que la versión de la base quede alineada con la del archivo).
--
-- Probado el 18/10 en la base local: `npx supabase migration up` y
-- `npx supabase test db` (15 archivos, 353 tests en verde).
--
-- Antes y después: scripts/db/produccion/verificar-r47.sql (solo lectura;
-- la parte "ANTES" se corre antes de esto para guardar los números).
-- ============================================================================

begin;

-- R47 "Guardar, Voy y Seguir" (QPS-197 y QPS-199): "Me interesa" desaparece
-- y "Voy" queda contenido en Guardados.
--
-- Pasado de ops/rondas/47-guardar-voy-seguir/aplicar-en-produccion.sql sin
-- cambios de lógica por el lead de día (18/10). En producción la aplica Mauro
-- (scripts/db/produccion/aplicar-r47.sql). Va después del PR de la R47 (#76),
-- que deja de escribir y de leer 'me_interesa' en la web y en la app.
--
-- Decisión de Mauro (18/10): el backfill pasa a Guardados (user_favorites)
-- TODAS las marcas existentes, 'voy' y 'me_interesa': los "voy" de antes de
-- esta ronda no se guardaban y la regla nueva es "Voy está contenido en
-- Guardados". Después se borra 'me_interesa' y el CHECK de kind queda en
-- 'voy'.
--
-- Por qué así (lo más simple):
--   * event_attendance.kind es TEXT con un CHECK (event_attendance_kind_check),
--     no un enum: alcanza con cambiar el CHECK. Los tipos generados
--     (packages/db) no cambian, porque kind sigue siendo string.
--   * Se conserva el NOMBRE del constraint, para que ningún mensaje de error,
--     test ni documentación cambie de referencia.
--   * La vista event_attendance_counts, la tabla event_attendance_totals y el
--     trigger quedan con su columna/rama me_interesa: después del delete vale
--     0 en todos lados y no la lee ninguna app. Sacarla obliga a recrear la
--     vista y el trigger y a regenerar los tipos: es una limpieza futura.
--   * NOT VALID + VALIDATE: el ADD no recorre la tabla y el VALIDATE toma un
--     lock más liviano (SHARE UPDATE EXCLUSIVE), y queda explícito que la
--     validación corre DESPUÉS del delete.
--   * on conflict do nothing sin columna: user_favorites tiene dos unique
--     sobre (user_id, event_id) (favorites_user_id_event_id_key y
--     unique_user_event_favorite); cualquiera de los dos frena el duplicado.
--     El favorite_item_check se cumple (solo event_id no nulo).
--   * El delete dispara tr_sync_event_attendance_totals (FOR EACH ROW), que
--     resta en event_attendance_totals.me_interesa: los totales quedan bien
--     sin ningún UPDATE manual.
--
-- Idempotente: correrla dos veces no cambia nada la segunda vez (el insert no
-- duplica, el delete no encuentra filas, el CHECK se vuelve a crear igual).
-- Sin cambios de tipos generados (kind sigue siendo text).

-- 1. Toda marca pasa a estar en Guardados.
insert into public.user_favorites (user_id, event_id)
select user_id, event_id
from public.event_attendance
on conflict do nothing;

-- 2. "Me interesa" desaparece.
delete from public.event_attendance
where kind = 'me_interesa';

-- 3. Solo 'voy', con el mismo nombre de constraint.
alter table public.event_attendance
  drop constraint if exists event_attendance_kind_check;

alter table public.event_attendance
  add constraint event_attendance_kind_check check (kind = 'voy') not valid;

alter table public.event_attendance
  validate constraint event_attendance_kind_check;

comment on constraint event_attendance_kind_check on public.event_attendance is
  'R47 (Guardar, Voy y Seguir): solo ''voy''. "Me interesa" se reemplazó por el favorito (♥ Guardar) y por seguir lugares y cuentas. La columna me_interesa de event_attendance_totals y de la vista event_attendance_counts queda en 0 hasta una limpieza futura.';


insert into supabase_migrations.schema_migrations (version, name)
values ('20261018120000', 'r47_guardar_voy')
on conflict (version) do nothing;

commit;
