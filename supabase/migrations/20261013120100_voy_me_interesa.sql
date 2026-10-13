-- ============================================================================
-- Ronda 23 (23-a): "voy" / "me interesa" y la vista pública de cantidades.
-- ============================================================================
--
-- event_attendance: una marca por usuario y evento (unique), pide cuenta
-- (ops/alcance-app-v1.md). event_attendance_totals: cantidades agregadas,
-- mantenidas por un trigger SECURITY DEFINER; no tiene ninguna columna de
-- persona. event_attendance_counts: vista pública, security_invoker, solo
-- eventos PUBLISHED.
--
-- Cambio b (Mauro, 12/10): el trigger de totales también maneja un UPDATE
-- que cambia event_id (resta en el viejo evento y suma, con upsert, en el
-- nuevo), además del cambio de kind. En el DELETE, solo hace UPDATE de los
-- totales, nunca upsert: así, cuando un evento con marcas se borra (el
-- cascade de events hacia event_attendance), la fila de totales ya puede no
-- existir y el UPDATE simplemente afecta 0 filas, sin fallar.
--
-- Cambio c (Mauro, 12/10): la vista es security_invoker (no SECURITY
-- DEFINER, que el advisor marca como error), así que necesita que
-- event_attendance_totals tenga su propia política de SELECT para anon y
-- authenticated, y el GRANT SELECT correspondiente. Es seguro porque esa
-- tabla no tiene ninguna columna de persona: nadie puede llegar desde ahí a
-- quién marcó. anon no tiene ningún privilegio sobre event_attendance.
--
-- No se toca merge_events() ni lib/scraper/dedup-cleanup.ts: el repuntado
-- de marcas en las fusiones queda en QPS-110 (otra ronda, antes de la
-- noche 10).
--
-- Idempotente: CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE FUNCTION/VIEW,
-- CREATE INDEX IF NOT EXISTS, DROP POLICY/TRIGGER IF EXISTS antes de cada
-- CREATE.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. event_attendance
-- ---------------------------------------------------------------------------

create table if not exists public.event_attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_attendance_user_event_key unique (user_id, event_id),
  constraint event_attendance_kind_check check (kind in ('voy', 'me_interesa'))
);

comment on table public.event_attendance is
  'Marca "voy" / "me interesa" de un usuario sobre un evento (ops/alcance-app-v1.md). Pide cuenta; uno por usuario y evento (unique user_id, event_id): marcar el otro lo cambia (UPDATE), desmarcar lo borra. El dueño lee, inserta, actualiza y borra lo suyo; anon no tiene ningún privilegio. Los totales agregados viven en event_attendance_totals, mantenidos por el trigger tr_sync_event_attendance_totals.';

-- user_id ya queda indexado porque es la primera columna del unique
-- (user_id, event_id). event_id, la otra FK, se indexa acá para el
-- advisor ("unindexed_foreign_keys").
create index if not exists event_attendance_event_id_idx on public.event_attendance (event_id);

alter table public.event_attendance enable row level security;

drop policy if exists "lectura del dueño" on public.event_attendance;
create policy "lectura del dueño"
  on public.event_attendance for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "inserción del dueño" on public.event_attendance;
create policy "inserción del dueño"
  on public.event_attendance for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "actualización del dueño" on public.event_attendance;
create policy "actualización del dueño"
  on public.event_attendance for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "eliminación del dueño" on public.event_attendance;
create policy "eliminación del dueño"
  on public.event_attendance for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- anon no tiene ningún permiso sobre esta tabla (ni siquiera vía los
-- default privileges de `public`).
revoke all on public.event_attendance from anon;

-- TRUNCATE no lo filtra RLS: es la única acción de la tabla que no queda
-- acotada a la fila propia, así que se recorta igual que en las tablas
-- hermanas (push_tokens, notification_preferences, notification_sends). El
-- dueño sigue con select/insert/update/delete, las cuatro acotadas por RLS.
revoke truncate on public.event_attendance from authenticated;

drop trigger if exists set_event_attendance_updated_at on public.event_attendance;
create trigger set_event_attendance_updated_at
  before update on public.event_attendance
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 2. event_attendance_totals
-- ---------------------------------------------------------------------------

create table if not exists public.event_attendance_totals (
  event_id uuid primary key references public.events(id) on delete cascade,
  voy integer not null default 0,
  me_interesa integer not null default 0,
  constraint event_attendance_totals_non_negative_check check (voy >= 0 and me_interesa >= 0)
);

comment on table public.event_attendance_totals is
  'Cantidades agregadas de "voy" / "me interesa" por evento, mantenidas por el trigger tr_sync_event_attendance_totals sobre event_attendance. No tiene ninguna columna de persona (sin user_id ni nada que identifique a quién marcó): por eso (cambio c, Mauro) es seguro darle SELECT a anon y a authenticated con using (true) y GRANT SELECT a los dos roles — es la única forma de que la vista event_attendance_counts, que es security_invoker, muestre cantidades a un usuario sin sesión. Sin políticas de escritura: solo el trigger (SECURITY DEFINER) escribe.';

alter table public.event_attendance_totals enable row level security;

drop policy if exists "lectura pública" on public.event_attendance_totals;
create policy "lectura pública"
  on public.event_attendance_totals for select
  to anon, authenticated
  using (true);

-- Cambio c: sin esto, anon no vería cantidades a través de la vista
-- security_invoker. Es seguro porque la tabla no tiene ninguna columna de
-- persona (ver comentario de la tabla).
revoke all on public.event_attendance_totals from anon, authenticated;
grant select on public.event_attendance_totals to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3. Trigger que mantiene los totales
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER (bypassea RLS de event_attendance_totals, que no tiene
-- policy de escritura) con search_path fijo, todo calificado con su
-- esquema, sin SQL dinámico.

create or replace function public.sync_event_attendance_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.event_attendance_totals as t (event_id, voy, me_interesa)
    values (
      new.event_id,
      case when new.kind = 'voy' then 1 else 0 end,
      case when new.kind = 'me_interesa' then 1 else 0 end
    )
    on conflict (event_id) do update
      set voy = t.voy + excluded.voy,
          me_interesa = t.me_interesa + excluded.me_interesa;
    return new;

  elsif tg_op = 'UPDATE' then
    -- Cambio b (Mauro): si cambia event_id, resta en el evento viejo (con
    -- el kind de OLD) y suma, con upsert, en el nuevo (con el kind de NEW).
    if new.event_id is distinct from old.event_id then
      update public.event_attendance_totals
      set voy = voy - case when old.kind = 'voy' then 1 else 0 end,
          me_interesa = me_interesa - case when old.kind = 'me_interesa' then 1 else 0 end
      where event_id = old.event_id;

      insert into public.event_attendance_totals as t (event_id, voy, me_interesa)
      values (
        new.event_id,
        case when new.kind = 'voy' then 1 else 0 end,
        case when new.kind = 'me_interesa' then 1 else 0 end
      )
      on conflict (event_id) do update
        set voy = t.voy + excluded.voy,
            me_interesa = t.me_interesa + excluded.me_interesa;

    elsif new.kind is distinct from old.kind then
      -- Mismo evento, cambia el kind: mueve 1 de una columna a la otra.
      update public.event_attendance_totals
      set voy = voy
            + case when new.kind = 'voy' then 1 when old.kind = 'voy' then -1 else 0 end,
          me_interesa = me_interesa
            + case when new.kind = 'me_interesa' then 1 when old.kind = 'me_interesa' then -1 else 0 end
      where event_id = new.event_id;
    end if;
    return new;

  elsif tg_op = 'DELETE' then
    -- Solo UPDATE, nunca upsert: si la fila de totales ya no existe porque
    -- el evento se está borrando en cascada, este UPDATE afecta 0 filas y
    -- no falla.
    update public.event_attendance_totals
    set voy = voy - case when old.kind = 'voy' then 1 else 0 end,
        me_interesa = me_interesa - case when old.kind = 'me_interesa' then 1 else 0 end
    where event_id = old.event_id;
    return old;
  end if;

  return null;
end;
$$;

comment on function public.sync_event_attendance_totals() is
  'Mantiene event_attendance_totals a partir de los INSERT/UPDATE/DELETE de event_attendance. SECURITY DEFINER con search_path fijo, sin SQL dinámico. UPDATE: si cambia event_id resta en el viejo y hace upsert en el nuevo (cambio b); si cambia kind, mueve 1 de una columna a otra. DELETE: solo UPDATE, nunca upsert, para no fallar ni dejar una fila huérfana cuando un evento con marcas se borra en cascada. No conoce merge_events() (QPS-110, otra ronda).';

revoke all on function public.sync_event_attendance_totals() from public, anon, authenticated;

drop trigger if exists tr_sync_event_attendance_totals on public.event_attendance;
create trigger tr_sync_event_attendance_totals
  after insert or update or delete on public.event_attendance
  for each row execute function public.sync_event_attendance_totals();


-- ---------------------------------------------------------------------------
-- 4. Vista pública: event_attendance_counts
-- ---------------------------------------------------------------------------
-- security_invoker = true: corre con los privilegios de quien consulta, no
-- es SECURITY DEFINER (el advisor la marca como error). Solo lee de
-- event_attendance_totals (sin columnas de persona) y events (ya público
-- para PUBLISHED). Nunca toca event_attendance.

create or replace view public.event_attendance_counts
  with (security_invoker = true)
as
  select t.event_id, t.voy, t.me_interesa
  from public.event_attendance_totals t
  join public.events e on e.id = t.event_id and e.status = 'PUBLISHED'::public.event_status;

comment on view public.event_attendance_counts is
  'Cantidades públicas de "voy" / "me interesa" por evento PUBLISHED. security_invoker = true (no SECURITY DEFINER): corre con los privilegios de quien consulta. Solo lee event_attendance_totals (sin columnas de persona) y events; nunca event_attendance.';

revoke all on public.event_attendance_counts from anon, authenticated;
grant select on public.event_attendance_counts to anon, authenticated;
