-- ============================================================================
-- Ronda 23 (23-a): tablas para la app — tokens push, preferencias de
-- notificación y registro de envíos.
-- ============================================================================
--
-- Tres tablas nuevas, ninguna existente se toca:
--   1. push_tokens: un token de FCM/APNs por dispositivo, único en toda la
--      base. El dueño lee y borra lo suyo (para cerrar sesión); NO hay
--      política de insert ni de update para authenticated (cambio a de
--      Mauro): la única vía de alta es public.register_push_token(), más
--      abajo.
--   2. notification_preferences: un reglón por usuario (PK = user_id) con
--      los interruptores y horarios de ops/alcance-app-v1.md. El dueño lee,
--      inserta y actualiza.
--   3. notification_sends: historial de envíos, para no repetir un aviso
--      (dedupe_key único) y para que el usuario vea qué le llegó. El dueño
--      SOLO lee: escribe el proceso del servidor con la service key, nunca
--      authenticated.
--
-- Cambio a (Mauro, 12/10): con `token` único, si alguien cierra sesión en un
-- celular y entra con otra cuenta, un INSERT directo fallaría (el token ya
-- existe) y la cuenta nueva no podría ver ni borrar la fila vieja por RLS
-- (es de otro user_id). Por eso el registro pasa SIEMPRE por
-- public.register_push_token(p_token, p_platform): hace un upsert por
-- `token` que reasigna la fila a quien esté llamando. Si A registra un
-- token y después B lo registra desde el mismo celular, el token queda de
-- B y A deja de verlo (lo prueba 23-b).
--
-- Idempotente: CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
-- CREATE INDEX IF NOT EXISTS, DROP POLICY IF EXISTS antes de cada CREATE
-- POLICY.
--
-- Todas las políticas van `to authenticated`, con `(select auth.uid())`
-- (nunca la llamada suelta: lo controla
-- supabase/tests/database/rls_lint.test.sql) y una sola policy permisiva
-- por tabla/rol/acción.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. push_tokens
-- ---------------------------------------------------------------------------

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint push_tokens_token_key unique (token),
  constraint push_tokens_platform_check check (platform in ('android', 'ios'))
);

comment on table public.push_tokens is
  'Token push (FCM/APNs) por dispositivo, para la app. Único por token en toda la base: la reasignación entre cuentas la hace exclusivamente public.register_push_token(). El dueño lee y borra lo suyo; sin alta ni edición directa desde authenticated.';

-- FK que no es la primera columna de la PK (id lo es): índice para el
-- advisor ("unindexed_foreign_keys").
create index if not exists push_tokens_user_id_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

drop policy if exists "lectura del dueño" on public.push_tokens;
create policy "lectura del dueño"
  on public.push_tokens for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "eliminación del dueño" on public.push_tokens;
create policy "eliminación del dueño"
  on public.push_tokens for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Sin policy de insert ni de update: cambio a de Mauro. Los default
-- privileges de `public` dan ALL a anon/authenticated sobre toda tabla
-- nueva (ver baseline, ALTER DEFAULT PRIVILEGES FOR ROLE postgres); se
-- recortan a lo que de verdad se usa.
revoke all on public.push_tokens from anon;
revoke insert, update, truncate on public.push_tokens from authenticated;

-- ---------------------------------------------------------------------------
-- public.register_push_token(p_token text, p_platform text)
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER (necesita escribir filas de cualquier user_id, para poder
-- reasignar un token existente a quien llama) con search_path = '': todo
-- objeto va calificado con su esquema. Sin SQL dinámico.

create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Primera instrucción del cuerpo: sin sesión, 42501 (mismo código que RLS).
  if (select auth.uid()) is null then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if p_platform is null or p_platform not in ('android', 'ios') then
    raise exception 'platform tiene que ser android o ios' using errcode = '22023';
  end if;

  if p_token is null or btrim(p_token) = '' then
    raise exception 'token no puede estar vacío' using errcode = '22023';
  end if;

  insert into public.push_tokens (user_id, token, platform, created_at, last_seen_at)
  values ((select auth.uid()), p_token, p_platform, now(), now())
  on conflict (token) do update
    set user_id = (select auth.uid()),
        platform = excluded.platform,
        last_seen_at = now();
end;
$$;

revoke all on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

comment on function public.register_push_token(text, text) is
  'Única vía de alta/renovación de push_tokens. SECURITY DEFINER, exige sesión (42501 si no hay), valida platform y token, y hace upsert por token: si el celular ya tenía el token de otra cuenta, pasa a ser de quien llama. EXECUTE solo para authenticated.';


-- ---------------------------------------------------------------------------
-- 2. notification_preferences
-- ---------------------------------------------------------------------------
-- Defaults de ops/alcance-app-v1.md: el Radar por correo (es lo de hoy);
-- recordatorio de favoritos y novedades de seguidos activados por defecto
-- (decisión 2 de Mauro, 12/10); avisos del panel desactivados por defecto
-- (el único default explícito del plan); silencio 23:00-09:00; tope 4 por
-- día. Son columnas con default: cambiarlos después no rompe nada.

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  radar_channel text not null default 'email'
    constraint notification_preferences_radar_channel_check
    check (radar_channel in ('email', 'push', 'ambos')),
  favorite_reminders boolean not null default true,
  follow_news boolean not null default true,
  announcements boolean not null default false,
  quiet_start time not null default '23:00',
  quiet_end time not null default '09:00',
  daily_cap integer not null default 4
    constraint notification_preferences_daily_cap_check check (daily_cap > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.notification_preferences is
  'Interruptores y horarios de notificación de la app, uno por usuario (ops/alcance-app-v1.md). El dueño lee, inserta y actualiza lo suyo.';

alter table public.notification_preferences enable row level security;

drop policy if exists "lectura del dueño" on public.notification_preferences;
create policy "lectura del dueño"
  on public.notification_preferences for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "inserción del dueño" on public.notification_preferences;
create policy "inserción del dueño"
  on public.notification_preferences for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "actualización del dueño" on public.notification_preferences;
create policy "actualización del dueño"
  on public.notification_preferences for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.notification_preferences from anon;
revoke delete, truncate on public.notification_preferences from authenticated;

drop trigger if exists set_notification_preferences_updated_at on public.notification_preferences;
create trigger set_notification_preferences_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 3. notification_sends
-- ---------------------------------------------------------------------------
-- Historial de envíos (para dedupe y para que el usuario vea qué le llegó).
-- Escribe solo el servidor con la service key: sin policy de insert, update
-- ni delete para authenticated. kind/channel/status quedan como texto libre
-- (el plan no da una lista cerrada de valores todavía).

create table if not exists public.notification_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  event_id uuid references public.events(id) on delete set null,
  channel text not null,
  sent_at timestamptz not null default now(),
  status text not null,
  dedupe_key text not null,
  constraint notification_sends_dedupe_key_key unique (dedupe_key)
);

comment on table public.notification_sends is
  'Historial de notificaciones enviadas por la app (Radar, recordatorios, novedades y avisos), para evitar duplicados (dedupe_key único) y para que el usuario vea qué recibió. El dueño solo lee: escribe el proceso del servidor con la service key.';

-- FKs que no son la primera columna de la PK (id lo es): índices para el
-- advisor.
create index if not exists notification_sends_user_id_idx on public.notification_sends (user_id);
create index if not exists notification_sends_event_id_idx on public.notification_sends (event_id) where event_id is not null;

alter table public.notification_sends enable row level security;

drop policy if exists "lectura del dueño" on public.notification_sends;
create policy "lectura del dueño"
  on public.notification_sends for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Sin policy de insert/update/delete: escribe service_role (bypassea RLS).
revoke all on public.notification_sends from anon;
revoke insert, update, delete, truncate on public.notification_sends from authenticated;
