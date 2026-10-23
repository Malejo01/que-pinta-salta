-- R58 (contrato de esquema): precios automáticos de la publicidad, aprobación
-- en el admin, reporte al anunciante y la medición de bajas del push
-- patrocinado. Decisión de Mauro del 19/10 (16:10), ops/plan-publicidad.md §3.
-- La aplica Mauro; la R58 escribe el código sobre este contrato.
--
--   1. public.ad_price_cycles: un ciclo por mes (el día 1). Guarda las
--      entradas de la fórmula (audiencia, tramo con histéresis, tipo de
--      cambio, ocupación y factores de demanda) y el estado de la propuesta.
--   2. public.ad_prices: el precio de cada producto en cada ciclo. La página
--      "Publicitá tu evento" lee solo los aprobados (anon y authenticated
--      pueden leer esos, y nada más).
--   3. public.ad_settings: una sola fila. El interruptor de aprobación
--      automática (solo después de 3 ciclos aprobados, lo controla un
--      trigger) y la pausa del push patrocinado por bajas.
--   4. public.ad_occupancy_daily: la ocupación diaria del Hero y del push,
--      para los factores de demanda.
--   5. public.ad_campaign_reports: el reporte de cada campaña (destacado o
--      push), con un token para la página compartible.
--   6. sponsored_campaigns: destinatarios y bajas en las 48 h posteriores al
--      envío (solo cantidades, nunca quién).
--   7. delete_my_account(): la misma función de QPS-190, que además pone en
--      null las tres columnas *_by nuevas (approved_by, updated_by y
--      created_by), como pide su contrato con tablas-personales.ts.
--
-- Escriben el cron (service key, bypassea RLS) y el admin (is_admin()). Nada
-- de esto es dato personal: solo cantidades y precios. anon solo lee los
-- precios aprobados. TRUNCATE revocado a authenticated (RLS no filtra
-- TRUNCATE, mismo criterio que 20261014120000_revoke_truncate_tablas_personales.sql).
--
-- Idempotente (create table if not exists, add column if not exists, drop
-- policy/trigger if exists, create index if not exists, on conflict do
-- nothing). Cambia el esquema: npm run db:types en el mismo commit.

-- Productos con precio (la publicación básica es gratis y no se guarda).
-- Los mismos id que packages/core/src/publicidad/precios.ts.

-- ---------------------------------------------------------------------------
-- 1. ad_price_cycles
-- ---------------------------------------------------------------------------

create table if not exists public.ad_price_cycles (
  ciclo date primary key,
  audiencia_web_28d integer not null,
  mau_app_28d integer null,
  dispositivos_push integer null,
  audiencia integer not null,
  fuente_audiencia text not null,
  tramo_calculado integer not null,
  tramo_vigente integer not null,
  cambio_tramo_desde date null,
  tipo_cambio numeric(10, 2) not null,
  fuente_tipo_cambio text not null,
  ocupacion_hero numeric(4, 3) null,
  ocupacion_push numeric(4, 3) null,
  factor_hero numeric(4, 2) not null default 1,
  factor_push numeric(4, 2) not null default 1,
  estado text not null default 'propuesto',
  approved_at timestamptz null,
  approved_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint ad_price_cycles_dia_uno_check check (extract(day from ciclo) = 1),
  constraint ad_price_cycles_audiencia_check check (
    audiencia_web_28d >= 0 and audiencia >= 0
    and (mau_app_28d is null or mau_app_28d >= 0)
    and (dispositivos_push is null or dispositivos_push >= 0)
  ),
  constraint ad_price_cycles_fuente_audiencia_check check (fuente_audiencia in ('vercel', 'manual')),
  constraint ad_price_cycles_tramo_check check (tramo_calculado > 0 and tramo_vigente > 0),
  constraint ad_price_cycles_tipo_cambio_check check (tipo_cambio > 0),
  constraint ad_price_cycles_ocupacion_check check (
    (ocupacion_hero is null or ocupacion_hero between 0 and 1)
    and (ocupacion_push is null or ocupacion_push between 0 and 1)
  ),
  constraint ad_price_cycles_factores_check check (factor_hero between 0.8 and 1.5 and factor_push between 0.8 and 1.5),
  constraint ad_price_cycles_estado_check check (estado in ('propuesto', 'aprobado', 'automatico', 'descartado')),
  constraint ad_price_cycles_aprobado_check check (estado not in ('aprobado', 'automatico') or approved_at is not null)
);

comment on table public.ad_price_cycles is
  'R58: un ciclo de precios por mes (día 1), con las entradas de la fórmula de ops/estudio-precios-publicidad.md. Lo propone el cron (service key); lo aprueba el admin. Solo admin por RLS.';

create index if not exists ad_price_cycles_approved_by_idx
  on public.ad_price_cycles (approved_by)
  where approved_by is not null;

alter table public.ad_price_cycles enable row level security;

drop policy if exists "lectura admin" on public.ad_price_cycles;
create policy "lectura admin"
  on public.ad_price_cycles for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists "actualización admin" on public.ad_price_cycles;
create policy "actualización admin"
  on public.ad_price_cycles for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on public.ad_price_cycles from anon;
grant select, update on public.ad_price_cycles to authenticated;
revoke insert, delete, truncate on public.ad_price_cycles from authenticated;


-- ---------------------------------------------------------------------------
-- 2. ad_prices
-- ---------------------------------------------------------------------------

create table if not exists public.ad_prices (
  id uuid primary key default gen_random_uuid(),
  ciclo date not null references public.ad_price_cycles(ciclo) on delete cascade,
  producto text not null,
  tramo_ref integer not null,
  precio_usd numeric(10, 2) not null,
  precio_ars integer not null,
  precio_fundador_ars integer null,
  tipo_cambio numeric(10, 2) not null,
  vigente_desde date not null,
  estado text not null default 'propuesto',
  created_at timestamptz not null default now(),
  constraint ad_prices_ciclo_producto_key unique (ciclo, producto),
  constraint ad_prices_producto_check check (
    producto in ('destacado-3', 'destacado-7', 'destacado-14', 'pack-lanzamiento', 'plan-mensual', 'plan-rrpp', 'push')
  ),
  constraint ad_prices_tramo_check check (tramo_ref > 0),
  constraint ad_prices_precio_usd_check check (precio_usd > 0),
  -- Redondeo a $500 (la fórmula: redondeo_500).
  constraint ad_prices_precio_ars_check check (precio_ars > 0 and precio_ars % 500 = 0),
  constraint ad_prices_fundador_check check (
    precio_fundador_ars is null or (precio_fundador_ars > 0 and precio_fundador_ars % 500 = 0 and precio_fundador_ars <= precio_ars)
  ),
  constraint ad_prices_tipo_cambio_check check (tipo_cambio > 0),
  constraint ad_prices_estado_check check (estado in ('propuesto', 'aprobado'))
);

comment on table public.ad_prices is
  'R58: precio de cada producto (ids de packages/core/src/publicidad/precios.ts) en cada ciclo. ARS redondeado a 500. anon y authenticated leen solo los aprobados; el admin, todos. Escribe el cron (service key) y aprueba el admin.';

create index if not exists ad_prices_vigentes_idx
  on public.ad_prices (estado, vigente_desde desc);

alter table public.ad_prices enable row level security;

-- Una sola policy de lectura por rol (rls_lint.test.sql): anon ve los
-- aprobados; authenticated, los aprobados o todos si es admin.
drop policy if exists "lectura de aprobados" on public.ad_prices;
create policy "lectura de aprobados"
  on public.ad_prices for select
  to anon
  using (estado = 'aprobado');

drop policy if exists "lectura admin" on public.ad_prices;
drop policy if exists "lectura" on public.ad_prices;
create policy "lectura"
  on public.ad_prices for select
  to authenticated
  using (estado = 'aprobado' or (select public.is_admin()));

drop policy if exists "actualización admin" on public.ad_prices;
create policy "actualización admin"
  on public.ad_prices for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on public.ad_prices from anon;
grant select on public.ad_prices to anon;
grant select, update on public.ad_prices to authenticated;
revoke insert, delete, truncate on public.ad_prices from authenticated;


-- ---------------------------------------------------------------------------
-- 3. ad_settings (una sola fila)
-- ---------------------------------------------------------------------------

create table if not exists public.ad_settings (
  id boolean primary key default true,
  aprobacion_automatica boolean not null default false,
  push_patrocinado_pausado_at timestamptz null,
  push_patrocinado_pausa_motivo text null,
  -- Proporción de destinatarios que desactiva las notificaciones en 48 h a
  -- partir de la cual se pausa el push patrocinado. Default propuesto: 2%.
  umbral_bajas_push numeric(4, 3) not null default 0.02,
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null,
  constraint ad_settings_una_fila_check check (id),
  constraint ad_settings_umbral_check check (umbral_bajas_push > 0 and umbral_bajas_push <= 1),
  constraint ad_settings_pausa_check check (push_patrocinado_pausado_at is not null or push_patrocinado_pausa_motivo is null)
);

comment on table public.ad_settings is
  'R58: una sola fila. aprobacion_automatica (solo con 3 ciclos aprobados, ver ad_settings_exigir_ciclos) y la pausa del push patrocinado por bajas. Solo admin por RLS (select y update).';

insert into public.ad_settings (id) values (true) on conflict (id) do nothing;

create index if not exists ad_settings_updated_by_idx
  on public.ad_settings (updated_by)
  where updated_by is not null;

-- La aprobación automática se puede prender recién con 3 ciclos aprobados a
-- mano (plan-publicidad.md §3, R58 punto 3). SECURITY INVOKER: quien prende
-- el interruptor es admin y lee ad_price_cycles por su policy.
create or replace function public.ad_settings_exigir_ciclos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.aprobacion_automatica and not old.aprobacion_automatica then
    if (select count(*) from public.ad_price_cycles where estado = 'aprobado') < 3 then
      raise exception 'La aprobación automática necesita 3 ciclos aprobados a mano'
        using errcode = '23514';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists ad_settings_exigir_ciclos on public.ad_settings;
create trigger ad_settings_exigir_ciclos
  before update on public.ad_settings
  for each row execute function public.ad_settings_exigir_ciclos();

alter table public.ad_settings enable row level security;

drop policy if exists "lectura admin" on public.ad_settings;
create policy "lectura admin"
  on public.ad_settings for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists "actualización admin" on public.ad_settings;
create policy "actualización admin"
  on public.ad_settings for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on public.ad_settings from anon;
grant select, update on public.ad_settings to authenticated;
revoke insert, delete, truncate on public.ad_settings from authenticated;
revoke execute on function public.ad_settings_exigir_ciclos() from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 4. ad_occupancy_daily
-- ---------------------------------------------------------------------------

create table if not exists public.ad_occupancy_daily (
  day date primary key,
  hero_ocupados integer not null,
  hero_cupos integer not null,
  push_cupos_usados integer not null default 0,
  push_cupos integer not null default 1,
  created_at timestamptz not null default now(),
  constraint ad_occupancy_daily_check check (
    hero_cupos > 0 and hero_ocupados between 0 and hero_cupos
    and push_cupos >= 0 and push_cupos_usados between 0 and greatest(push_cupos, push_cupos_usados)
  )
);

comment on table public.ad_occupancy_daily is
  'R58: foto diaria de la ocupación del Hero (destacados vigentes sobre cupos) y del push patrocinado, para los factores de demanda. La escribe el cron (service key). Solo admin por RLS.';

alter table public.ad_occupancy_daily enable row level security;

drop policy if exists "lectura admin" on public.ad_occupancy_daily;
create policy "lectura admin"
  on public.ad_occupancy_daily for select
  to authenticated
  using ((select public.is_admin()));

revoke all on public.ad_occupancy_daily from anon;
grant select on public.ad_occupancy_daily to authenticated;
revoke insert, update, delete, truncate on public.ad_occupancy_daily from authenticated;


-- ---------------------------------------------------------------------------
-- 5. ad_campaign_reports
-- ---------------------------------------------------------------------------

create table if not exists public.ad_campaign_reports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  tipo text not null,
  sponsored_campaign_id uuid null references public.sponsored_campaigns(id) on delete set null,
  desde timestamptz not null,
  hasta timestamptz not null,
  metricas jsonb not null default '{}'::jsonb,
  precio_ars integer null,
  -- Token de la página compartible (/reporte/<token>): 32 caracteres hex.
  token text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null,
  constraint ad_campaign_reports_token_key unique (token),
  constraint ad_campaign_reports_campania_key unique (event_id, tipo, desde),
  constraint ad_campaign_reports_tipo_check check (tipo in ('destacado', 'push')),
  constraint ad_campaign_reports_fechas_check check (hasta > desde),
  constraint ad_campaign_reports_token_check check (token ~ '^[0-9a-f]{32}$'),
  constraint ad_campaign_reports_metricas_check check (jsonb_typeof(metricas) = 'object'),
  constraint ad_campaign_reports_precio_check check (precio_ars is null or precio_ars >= 0),
  constraint ad_campaign_reports_push_check check (tipo <> 'push' or sponsored_campaign_id is not null)
);

comment on table public.ad_campaign_reports is
  'R58: reporte al anunciante al terminar cada campaña (alcance, vistas, clics a la ficha y a entradas, costo por clic, comparación con Meta), con token para la página compartible. Solo cantidades. Solo admin por RLS; la página pública lo lee del servidor por token, con la service key.';

create index if not exists ad_campaign_reports_sponsored_campaign_id_idx
  on public.ad_campaign_reports (sponsored_campaign_id)
  where sponsored_campaign_id is not null;
create index if not exists ad_campaign_reports_created_by_idx
  on public.ad_campaign_reports (created_by)
  where created_by is not null;

alter table public.ad_campaign_reports enable row level security;

drop policy if exists "lectura admin" on public.ad_campaign_reports;
create policy "lectura admin"
  on public.ad_campaign_reports for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists "inserción admin" on public.ad_campaign_reports;
create policy "inserción admin"
  on public.ad_campaign_reports for insert
  to authenticated
  with check ((select public.is_admin()));

drop policy if exists "actualización admin" on public.ad_campaign_reports;
create policy "actualización admin"
  on public.ad_campaign_reports for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "eliminación admin" on public.ad_campaign_reports;
create policy "eliminación admin"
  on public.ad_campaign_reports for delete
  to authenticated
  using ((select public.is_admin()));

revoke all on public.ad_campaign_reports from anon;
grant select, insert, update, delete on public.ad_campaign_reports to authenticated;
revoke truncate on public.ad_campaign_reports from authenticated;


-- ---------------------------------------------------------------------------
-- 6. sponsored_campaigns: destinatarios y bajas en 48 h
-- ---------------------------------------------------------------------------

alter table public.sponsored_campaigns
  add column if not exists destinatarios integer null,
  add column if not exists bajas_48h integer null,
  add column if not exists bajas_medidas_at timestamptz null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sponsored_campaigns_bajas_check') then
    alter table public.sponsored_campaigns
      add constraint sponsored_campaigns_bajas_check check (
        (destinatarios is null or destinatarios >= 0)
        and (bajas_48h is null or (bajas_48h >= 0 and (destinatarios is null or bajas_48h <= destinatarios)))
        and (bajas_48h is null or bajas_medidas_at is not null)
      );
  end if;
end;
$$;

comment on column public.sponsored_campaigns.destinatarios is
  'R58: a cuántos dispositivos se mandó (cantidad, no quiénes).';
comment on column public.sponsored_campaigns.bajas_48h is
  'R58: cuántos de esos destinatarios apagaron los avisos patrocinados o las notificaciones en las 48 h posteriores al envío. Si supera ad_settings.umbral_bajas_push, se pausa el producto.';
comment on column public.sponsored_campaigns.bajas_medidas_at is
  'R58: cuándo se midieron las bajas (una sola vez, entre 48 y 72 h después de sent_at).';


-- ---------------------------------------------------------------------------
-- 7. delete_my_account(): desvincula las tres columnas *_by nuevas
-- ---------------------------------------------------------------------------
-- ad_price_cycles.approved_by, ad_settings.updated_by y
-- ad_campaign_reports.created_by son FK a auth.users ON DELETE SET NULL. Mismo
-- criterio que sponsored_campaigns.created_by: se ponen en null a mano igual,
-- para no depender del cascade (ver 20261018130300_qps_190_delete_my_account.sql,
-- que esta definición reemplaza; también están en COLUMNAS_A_DESVINCULAR de
-- apps/web/lib/cuenta/tablas-personales.ts). El resto de la función, idéntico.

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
  update public.ad_price_cycles set approved_by = null where approved_by = v_uid;
  update public.ad_settings set updated_by = null where updated_by = v_uid;
  update public.ad_campaign_reports set created_by = null where created_by = v_uid;

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
  'QPS-190/QPS-185: borra la cuenta de auth.uid() en una transacción (bloquea su perfil, desvincula su contenido público, borra sus filas personales y su fila de auth.users). SECURITY DEFINER, search_path vacío, EXECUTE solo authenticated. 42501 sin sesión. R58: también desvincula ad_price_cycles.approved_by, ad_settings.updated_by y ad_campaign_reports.created_by.';
