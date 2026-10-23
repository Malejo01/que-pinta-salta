-- ============================================================================
-- APLICAR EN PRODUCCIÓN: migraciones de la etapa 2 (contrato de las R48 a R57)
-- ============================================================================
-- Lo pega Mauro en el SQL Editor de Supabase (proyecto de producción), o lo
-- aplica el lead con apply_migration y la confirmación de Mauro. Es una sola
-- transacción: si algo falla, no queda nada a medias.
--
-- ANTES: correr la parte "ANTES" de scripts/db/produccion/verificar-etapa-2.sql.
-- La consulta A1 (venues con una sola coordenada o fuera de rango) tiene que
-- dar 0: si no, el VALIDATE de los CHECK de venues falla y no se aplica nada.
--
-- Contiene, sin cambios y en orden, el contenido de:
--   supabase/migrations/20261018130000_etapa2_venues_geocodificacion.sql
--   supabase/migrations/20261018130100_etapa2_eventos_destacados.sql
--   supabase/migrations/20261018130200_etapa2_campanias_patrocinadas.sql
--   supabase/migrations/20261018130300_qps_190_delete_my_account.sql
--   supabase/migrations/20261018130400_qps_238_purge_notification_sends.sql
-- y al final registra las cinco versiones en
-- supabase_migrations.schema_migrations.
--
-- Es independiente de la migración de la R47 (20261018120000, PR aparte): se
-- pueden aplicar en cualquier orden.
--
-- Probado el 18/10 en la base local: `npx supabase db reset` (todas las
-- migraciones sobre una base vacía), `npx supabase test db` (19 archivos,
-- 435 tests en verde) y una segunda corrida de las cinco migraciones dentro
-- de una transacción (idempotentes).
--
-- Después: scripts/db/produccion/verificar-etapa-2.sql, parte "DESPUÉS".
-- ============================================================================

begin;


-- ============================================================================
-- 20261018130000_etapa2_venues_geocodificacion.sql
-- ============================================================================

-- Etapa 2 (contrato de esquema de las rondas R48 a R57): ubicación de los
-- lugares para el mapa y la geocodificación.
--
-- venues YA tiene latitude numeric(10,8) y longitude numeric(11,8) (baseline;
-- 20261002190000_venue_canonical.sql las renombró a propósito, las usa el
-- JSON-LD de la web y las expone venues_canonical). Esta migración NO crea
-- columnas de coordenadas nuevas: suma de dónde salió la ubicación y cuándo,
-- y los CHECK que faltaban sobre las que ya existen.
--
--   * geocoded_at: cuándo se fijó la ubicación (null = nunca se geocodificó).
--   * geocode_source: de dónde salió ('nominatim' o 'manual'; null = sin dato,
--     por ejemplo las coordenadas cargadas antes de esta migración).
--   * latitude y longitude van juntas (las dos null o las dos con valor) y en
--     rango (-90..90, -180..180).
--   * Índice parcial de "lugares sin ubicación" (where latitude is null), para
--     que el proceso que geocodifica levante la cola sin recorrer la tabla.
--
-- Los CHECK sobre latitude/longitude van NOT VALID + VALIDATE: si una fila de
-- producción no los cumple, el VALIDATE falla y la transacción entera se
-- deshace (no queda nada a medias). scripts/db/produccion/verificar-etapa-2.sql
-- trae la consulta "ANTES" que tiene que dar 0 antes de aplicar.
--
-- Idempotente (add column if not exists, drop constraint if exists, create
-- index if not exists). Cambia el esquema: npm run db:types en el mismo commit.

alter table public.venues
  add column if not exists geocoded_at timestamptz null,
  add column if not exists geocode_source text null;

alter table public.venues
  drop constraint if exists venues_geocode_source_check;
alter table public.venues
  add constraint venues_geocode_source_check
  check (geocode_source in ('nominatim', 'manual'));

alter table public.venues
  drop constraint if exists venues_coordenadas_juntas_check;
alter table public.venues
  add constraint venues_coordenadas_juntas_check
  check ((latitude is null) = (longitude is null)) not valid;
alter table public.venues
  validate constraint venues_coordenadas_juntas_check;

alter table public.venues
  drop constraint if exists venues_coordenadas_rango_check;
alter table public.venues
  add constraint venues_coordenadas_rango_check
  check (latitude between -90 and 90 and longitude between -180 and 180) not valid;
alter table public.venues
  validate constraint venues_coordenadas_rango_check;

create index if not exists venues_sin_ubicacion_idx
  on public.venues (id)
  where latitude is null;

comment on column public.venues.geocoded_at is
  'Etapa 2: cuándo se fijó la ubicación (latitude/longitude). Null = nunca se geocodificó.';
comment on column public.venues.geocode_source is
  'Etapa 2: de dónde salió la ubicación: ''nominatim'' (geocodificación automática) o ''manual'' (la cargó un admin). Null = sin dato (coordenadas de antes de la etapa 2).';
comment on constraint venues_coordenadas_juntas_check on public.venues is
  'Etapa 2: latitude y longitude van juntas: las dos null o las dos con valor.';
comment on constraint venues_coordenadas_rango_check on public.venues is
  'Etapa 2: latitude entre -90 y 90, longitude entre -180 y 180.';


-- ============================================================================
-- 20261018130100_etapa2_eventos_destacados.sql
-- ============================================================================

-- Etapa 2 (contrato de esquema de las rondas R48 a R57): destacados con
-- vencimiento.
--
--   * events.featured_until: hasta cuándo está destacado. Vence solo: quien
--     lee compara contra now() (featured_until > now()); no hay cron.
--   * events.featured_set_by / featured_set_at: quién lo destacó y cuándo
--     (auditoría del panel). featured_set_by va a auth.users con
--     on delete set null.
--   * Índice parcial en featured_until (where featured_until is not null).
--
-- is_featured (boolean, de antes) NO se toca ni se migra: sigue existiendo y
-- lo siguen usando merge_events/unmerge_event, idx_events_featured y
-- record_event_metric. Sin backfill: los is_featured = true de hoy quedan con
-- featured_until null. Qué hacer con ellos lo decide la ronda que cambia la
-- interfaz (R50).
--
-- La escritura de events NO es solo admin: el dueño de un evento puede
-- insertarlo y editarlo (policies "inserción del dueño o admin" y
-- "actualización del dueño o admin"). Lo que el dueño no puede tocar lo
-- fuerza el trigger tr_enforce_event_user_rules
-- (20261009120000_reglas_app.sql). Por eso esta migración lo reemplaza con el
-- mismo cuerpo más las tres columnas nuevas: al insertar quedan en null y al
-- editar conservan el valor de OLD, igual que is_featured. Sin esto, un dueño
-- se destacaría solo por la API.
--
-- Idempotente (add column if not exists, create index if not exists, create
-- or replace function). Cambia el esquema: npm run db:types en el mismo commit.

alter table public.events
  add column if not exists featured_until timestamptz null,
  add column if not exists featured_set_by uuid null references auth.users(id) on delete set null,
  add column if not exists featured_set_at timestamptz null;

create index if not exists events_featured_until_idx
  on public.events (featured_until)
  where featured_until is not null;

-- Índice de la FK, para el advisor (y para el set null al borrar un usuario).
create index if not exists events_featured_set_by_idx
  on public.events (featured_set_by)
  where featured_set_by is not null;

comment on column public.events.featured_until is
  'Etapa 2: destacado hasta esta fecha. Vence solo: se compara contra now() al leer (featured_until > now()), sin cron. Null = sin destacado con vencimiento.';
comment on column public.events.featured_set_by is
  'Etapa 2: quién lo destacó (admin). FK a auth.users on delete set null.';
comment on column public.events.featured_set_at is
  'Etapa 2: cuándo se lo destacó.';


-- ---------------------------------------------------------------------------
-- enforce_event_user_rules(): el cuerpo de 20261009120000_reglas_app.sql sin
-- cambios, más featured_until, featured_set_by y featured_set_at.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_event_user_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  -- Alcance: ver cabecera de 20261009120000_reglas_app.sql. service_role y
  -- postgres pasan sin cambios; un admin autenticado también (ya lo cubre
  -- RLS vía is_admin()).
  IF current_user NOT IN ('authenticated', 'anon') OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'DRAFT'::public.event_status;
    NEW.is_featured := false;
    NEW.featured_until := NULL;
    NEW.featured_set_by := NULL;
    NEW.featured_set_at := NULL;
    NEW.created_by := auth.uid();
    NEW.view_count := 0;
    -- Columnas de la ingesta: valores por defecto de la tabla (baseline y
    -- 20261002193000_event_dedup.sql), nunca los que mande el cliente.
    NEW.ai_metadata := NULL;
    NEW.ticket_sources := '[]'::jsonb;
    NEW.dedup_key := NULL;
    NEW.merge_audit := '[]'::jsonb;
    NEW.scrape_source_key := NULL;
    NEW.classification_source := NULL;
    NEW.is_commercial := false;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Editar un evento (publicado o no) lo devuelve a DRAFT, igual que hace
    -- hoy updateUserEvent() a mano. El resto de las columnas de arriba
    -- conserva el valor de OLD: el dueño no puede destacarse, reasignarse el
    -- evento ni tocar los datos de la ingesta.
    NEW.status := 'DRAFT'::public.event_status;
    NEW.is_featured := OLD.is_featured;
    NEW.featured_until := OLD.featured_until;
    NEW.featured_set_by := OLD.featured_set_by;
    NEW.featured_set_at := OLD.featured_set_at;
    NEW.created_by := OLD.created_by;
    NEW.view_count := OLD.view_count;
    NEW.ai_metadata := OLD.ai_metadata;
    NEW.ticket_sources := OLD.ticket_sources;
    NEW.dedup_key := OLD.dedup_key;
    NEW.merge_audit := OLD.merge_audit;
    NEW.scrape_source_key := OLD.scrape_source_key;
    NEW.classification_source := OLD.classification_source;
    NEW.is_commercial := OLD.is_commercial;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_event_user_rules() IS
  'Auditoría 4.1 + etapa 2: un usuario (authenticated/anon, no admin) no publica, no destaca (is_featured, featured_until, featured_set_by, featured_set_at) y no toca las columnas de ingesta de events; editar devuelve el evento a DRAFT. service_role y postgres no están alcanzados.';


-- ============================================================================
-- 20261018130200_etapa2_campanias_patrocinadas.sql
-- ============================================================================

-- Etapa 2 (contrato de esquema de las rondas R48 a R57): avisos patrocinados.
--
--   1. public.sponsored_campaigns: la campaña (título, texto, destino, ventana
--      de fechas, quién la cargó y cuándo se mandó). Solo admin, por RLS, para
--      leer, insertar, actualizar y borrar. anon sin ningún privilegio;
--      TRUNCATE revocado también a authenticated (RLS no filtra TRUNCATE,
--      mismo criterio que 20261014120000_revoke_truncate_tablas_personales.sql).
--      Las escribe el panel admin; el envío lo hace el servidor con la
--      service key (bypassea RLS).
--   2. notification_sends.campaign_id: de qué campaña salió cada envío
--      (on delete set null: borrar una campaña no borra el historial).
--   3. notification_preferences.sponsored: el interruptor de avisos
--      patrocinados. Prendido por defecto (decisión de Mauro, 18/10: la
--      política de Google Play no exige un opt-in aparte). Las filas que ya
--      existen quedan en true por el default.
--
-- Destino de la campaña: url o event_id (al menos uno). La url, si está, tiene
-- que empezar con http:// o https:// (agregado al contrato: frena un
-- javascript: o un esquema raro en un aviso que la app abre con Linking).
--
-- Idempotente (create table if not exists, add column if not exists, drop
-- policy if exists, create index if not exists). Cambia el esquema:
-- npm run db:types en el mismo commit.

-- ---------------------------------------------------------------------------
-- 1. sponsored_campaigns
-- ---------------------------------------------------------------------------

create table if not exists public.sponsored_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  url text null,
  event_id uuid null references public.events(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz null,
  constraint sponsored_campaigns_fechas_check check (ends_at > starts_at),
  constraint sponsored_campaigns_destino_check check (url is not null or event_id is not null),
  constraint sponsored_campaigns_url_check check (url is null or url ~* '^https?://')
);

comment on table public.sponsored_campaigns is
  'Etapa 2: avisos patrocinados. Solo admin (RLS con is_admin()) para select/insert/update/delete; anon sin privilegios; TRUNCATE revocado. El envío lo hace el servidor con la service key y lo registra en notification_sends.campaign_id.';

-- Índices de las FK, para el advisor.
create index if not exists sponsored_campaigns_event_id_idx
  on public.sponsored_campaigns (event_id)
  where event_id is not null;
create index if not exists sponsored_campaigns_created_by_idx
  on public.sponsored_campaigns (created_by)
  where created_by is not null;

alter table public.sponsored_campaigns enable row level security;

drop policy if exists "lectura admin" on public.sponsored_campaigns;
create policy "lectura admin"
  on public.sponsored_campaigns for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists "inserción admin" on public.sponsored_campaigns;
create policy "inserción admin"
  on public.sponsored_campaigns for insert
  to authenticated
  with check ((select public.is_admin()));

drop policy if exists "actualización admin" on public.sponsored_campaigns;
create policy "actualización admin"
  on public.sponsored_campaigns for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "eliminación admin" on public.sponsored_campaigns;
create policy "eliminación admin"
  on public.sponsored_campaigns for delete
  to authenticated
  using ((select public.is_admin()));

revoke all on public.sponsored_campaigns from anon;
grant select, insert, update, delete on public.sponsored_campaigns to authenticated;
revoke truncate on public.sponsored_campaigns from authenticated;


-- ---------------------------------------------------------------------------
-- 2. notification_sends.campaign_id
-- ---------------------------------------------------------------------------

alter table public.notification_sends
  add column if not exists campaign_id uuid null
  references public.sponsored_campaigns(id) on delete set null;

create index if not exists notification_sends_campaign_id_idx
  on public.notification_sends (campaign_id)
  where campaign_id is not null;

comment on column public.notification_sends.campaign_id is
  'Etapa 2: campaña patrocinada de la que salió este envío (null = no es un aviso patrocinado). On delete set null.';


-- ---------------------------------------------------------------------------
-- 3. notification_preferences.sponsored
-- ---------------------------------------------------------------------------

alter table public.notification_preferences
  add column if not exists sponsored boolean not null default true;

comment on column public.notification_preferences.sponsored is
  'Etapa 2: recibir avisos patrocinados. Prendido por defecto (decisión de Mauro, 18/10).';


-- ============================================================================
-- 20261018130300_qps_190_delete_my_account.sql
-- ============================================================================

-- QPS-190 (y QPS-185): borrar la propia cuenta en UNA transacción.
--
-- Hoy apps/web/lib/cuenta/eliminar.ts hace llamadas sucesivas con la service
-- key (desvincular, borrar tabla por tabla, admin.auth.admin.deleteUser): si
-- una falla en el medio, lo anterior ya quedó aplicado (incluida la
-- desvinculación irreversible de events.created_by) y la cuenta sigue viva.
-- public.delete_my_account() hace lo mismo, en el mismo orden, en una sola
-- transacción: o se borra todo, o no cambia nada.
--
-- Qué hace, sobre auth.uid() y nada más:
--   0. Falla con 42501 si no hay sesión (auth.uid() null).
--   1. Bloquea la fila de public.profiles con FOR UPDATE (QPS-185): un
--      createEvent concurrente de la misma persona queda esperando el lock de
--      la FK y, cuando esta transacción termina, falla por FK en vez de dejar
--      un evento apuntando a un perfil a medio borrar.
--   2. Desvincula (pone en null) las columnas de COLUMNAS_A_DESVINCULAR de
--      apps/web/lib/cuenta/tablas-personales.ts: events.created_by,
--      events.featured_set_by, aliases.created_by, venue_aliases.created_by,
--      venue_review_queue.reviewed_by, scrape_runs.triggered_by y
--      sponsored_campaigns.created_by. Las que ya son on delete set null se
--      ponen en null igual, a mano, para no depender del cascade.
--   3. Borra las filas de TABLAS_A_BORRAR, en el mismo orden (profiles al
--      final, después de duplicate_dismissals, por la FK NO ACTION).
--   4. Borra la fila de auth.users. Lo que cuelga de ahí (identities,
--      sessions, refresh_tokens) se va por el cascade de Supabase Auth.
--
-- El servidor ya no necesita la service key para borrar: llama al RPC con el
-- cliente de la sesión de la persona (cookie en la web, Bearer en la app) y
-- después cierra la sesión local. El JWT que ya emitió sigue siendo válido
-- hasta que vence, pero apunta a un usuario que no existe: cualquier escritura
-- falla por FK y los refresh tokens ya no están. Cambiar el endpoint
-- (app/api/cuenta/eliminar) para que use este RPC es de la R48.
--
-- SECURITY DEFINER con search_path vacío (todo va calificado). EXECUTE solo
-- para authenticated (revocado a public, anon y service_role: con la service
-- key auth.uid() es null y no tendría a quién borrar).
--
-- Si se agrega una tabla personal o una columna *_by nueva, va acá y en
-- tablas-personales.ts (el test tests/cuenta/tablas-personales.test.ts avisa
-- de las columnas nuevas; el pgTAP qps_190_delete_my_account.test.sql
-- compara las FK hacia auth.users y profiles con las que cubre esta función).
--
-- Idempotente: create or replace function.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  -- 1. QPS-185: el perfil queda bloqueado hasta el final de la transacción.
  perform 1 from public.profiles where id = v_uid for update;

  -- 2. Desvincular el contenido público.
  update public.events set created_by = null where created_by = v_uid;
  update public.events set featured_set_by = null where featured_set_by = v_uid;
  update public.aliases set created_by = null where created_by = v_uid;
  update public.venue_aliases set created_by = null where created_by = v_uid;
  update public.venue_review_queue set reviewed_by = null where reviewed_by = v_uid;
  update public.scrape_runs set triggered_by = null where triggered_by = v_uid;
  update public.sponsored_campaigns set created_by = null where created_by = v_uid;

  -- 3. Borrar las filas personales (orden de TABLAS_A_BORRAR).
  delete from public.favorites where user_id = v_uid;
  delete from public.user_favorites where user_id = v_uid;
  delete from public.event_attendance where user_id = v_uid;
  delete from public.push_tokens where user_id = v_uid;
  delete from public.notification_preferences where user_id = v_uid;
  delete from public.notification_sends where user_id = v_uid;
  delete from public.user_radar_settings where user_id = v_uid;
  delete from public.user_followed_categories where user_id = v_uid;
  delete from public.user_followed_venues where user_id = v_uid;
  delete from public.user_followed_instagram_accounts where user_id = v_uid;
  delete from public.duplicate_dismissals where decided_by = v_uid;
  delete from public.profiles where id = v_uid;

  -- 4. La cuenta misma.
  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon, service_role;
grant execute on function public.delete_my_account() to authenticated;

comment on function public.delete_my_account() is
  'QPS-190/QPS-185: borra la cuenta de auth.uid() en una transacción (bloquea su perfil, desvincula su contenido público, borra sus filas personales y su fila de auth.users). SECURITY DEFINER, search_path vacío, EXECUTE solo authenticated. 42501 sin sesión.';


-- ============================================================================
-- 20261018130400_qps_238_purge_notification_sends.sql
-- ============================================================================

-- QPS-238: plazo de retención de notification_sends.
--
-- public.purge_notification_sends(p_days integer default 90) borra los envíos
-- con sent_at más viejo que p_days días y devuelve cuántas filas borró.
-- SECURITY DEFINER con search_path vacío; EXECUTE solo para service_role (la
-- llama un proceso programado del servidor). p_days tiene que ser >= 1
-- (22023 si no): un 0 o un negativo no puede vaciar la tabla por error.
--
-- Nadie la llama todavía: el llamado programado (cron o workflow, con su
-- registro en job_runs) lo agrega la R51. Esta migración no toca .github/ ni
-- vercel.json.
--
-- notification_sends.dedupe_key es único y sirve para no mandar dos veces lo
-- mismo: al purgar, una clave de más de p_days días deja de existir. Las
-- claves de hoy son de eventos o del día, así que con 90 días no hay nada que
-- se pueda repetir; si se agrega un aviso con una clave "para siempre", hay
-- que tenerlo en cuenta.
--
-- Índice en sent_at para que el borrado no recorra la tabla entera.
--
-- Idempotente (create index if not exists, create or replace function).

create index if not exists notification_sends_sent_at_idx
  on public.notification_sends (sent_at);

create or replace function public.purge_notification_sends(p_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_borradas integer;
begin
  if p_days is null or p_days < 1 then
    raise exception 'p_days tiene que ser un entero mayor o igual a 1' using errcode = '22023';
  end if;

  delete from public.notification_sends
  where sent_at < now() - make_interval(days => p_days);

  get diagnostics v_borradas = row_count;
  return v_borradas;
end;
$$;

revoke all on function public.purge_notification_sends(integer) from public, anon, authenticated;
grant execute on function public.purge_notification_sends(integer) to service_role;

comment on function public.purge_notification_sends(integer) is
  'QPS-238: borra de notification_sends los envíos con sent_at más viejo que p_days días (default 90, mínimo 1) y devuelve cuántos borró. SECURITY DEFINER, search_path vacío, EXECUTE solo service_role. La llama el proceso programado que agrega la R51.';


insert into supabase_migrations.schema_migrations (version, name)
values
  ('20261018130000', 'etapa2_venues_geocodificacion'),
  ('20261018130100', 'etapa2_eventos_destacados'),
  ('20261018130200', 'etapa2_campanias_patrocinadas'),
  ('20261018130300', 'qps_190_delete_my_account'),
  ('20261018130400', 'qps_238_purge_notification_sends')
on conflict (version) do nothing;

commit;
