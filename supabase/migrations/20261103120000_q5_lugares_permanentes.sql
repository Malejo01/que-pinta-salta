-- Q5-1 (tanda Q5, decisiones de Mauro del 2/11): lugares permanentes para
-- chicos. Contrato: docs/propuestas/lugares-para-chicos.md §2.4, con los
-- cambios que decidió Mauro en docs/tanda-q5/README.md:
--
--   · estado suma 'vencido' (borrador / publicado / vencido / archivado). Un
--     admin lo pone a mano cuando no pudo volver a verificar un lugar: deja de
--     verse en público hasta que alguien lo verifique otra vez. El plazo de
--     revisión (90 / 180 días) NO es columna: lo calcula una función pura de
--     packages/core (plazoDeRevision), así cambiarlo no exige migración.
--   · fuente suma 'openstreetmap' (el importador de scripts/) y
--     'pedido_publico' (el formulario «Sumá un lugar», Q5-3). Ninguna de las
--     dos alcanza para publicar: publicar exige verificación y una fuente
--     verificada (check lugares_permanentes_publicado_check).
--   · osm_ref ('node/123', 'way/456'): de qué objeto de OpenStreetMap salió la
--     ficha, para que el importador no la duplique al correrlo de nuevo y para
--     mostrar la atribución ODbL donde corresponda.
--   · Grant por columnas para anon: cargado_por y verificado_por no se exponen
--     (decisión 8). authenticated mantiene la tabla entera: la policy solo le
--     deja ver publicados salvo que sea admin.
--   · delete_my_account(): desvincula cargado_por y verificado_por (FK a
--     auth.users ON DELETE SET NULL, igual se ponen en null a mano como las
--     demás *_by; también están en COLUMNAS_A_DESVINCULAR).
--
-- Aditiva y compatible hacia atrás: una tabla nueva, índices, policies, un
-- trigger y un create or replace de delete_my_account con el mismo cuerpo
-- más dos updates.

create table if not exists public.lugares_permanentes (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete restrict,
  tipo text not null,
  estado text not null default 'borrador',
  descripcion_corta text null,
  edad_min smallint null,
  edad_max smallint null,
  horarios jsonb not null default '{"version": 1, "semana": {}}'::jsonb,
  acceso text not null default 'consultar',
  nota_precio text null,
  techado text null,
  tiene_rampa boolean null,
  tiene_bano_adaptado boolean null,
  tiene_cambiador boolean null,
  contacto_telefono text null,
  contacto_web text null,
  contacto_instagram text null,
  fuente text not null,
  fuente_detalle text null,
  osm_ref text null,
  verificado_at timestamptz null,
  verificado_por uuid null references auth.users(id) on delete set null,
  cargado_por uuid null references auth.users(id) on delete set null,
  motivo_archivo text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lugares_permanentes_venue_key unique (venue_id),
  constraint lugares_permanentes_osm_ref_key unique (osm_ref),
  constraint lugares_permanentes_tipo_check check (
    tipo in ('pelotero', 'salon_juegos', 'plaza_juegos', 'espacio_cultural_infantil')
  ),
  constraint lugares_permanentes_estado_check check (
    estado in ('borrador', 'publicado', 'vencido', 'archivado')
  ),
  constraint lugares_permanentes_edades_check check (
    (edad_min is null or edad_min between 0 and 17)
    and (edad_max is null or edad_max between 0 and 17)
    and (edad_min is null or edad_max is null or edad_min <= edad_max)
  ),
  constraint lugares_permanentes_acceso_check check (acceso in ('gratis', 'pago', 'consultar')),
  constraint lugares_permanentes_techado_check check (techado in ('techado', 'aire_libre', 'mixto')),
  constraint lugares_permanentes_horarios_check check (
    jsonb_typeof(horarios) = 'object' and horarios ? 'version'
  ),
  constraint lugares_permanentes_fuente_check check (
    fuente in (
      'visita', 'web_oficial', 'redes_oficiales', 'llamado', 'organismo_publico',
      'openstreetmap', 'pedido_publico'
    )
  ),
  -- Nada se publica sin verificación (decisión 2): fecha de verificación y una
  -- fuente que alguien del equipo confirmó (OSM y el pedido público no).
  constraint lugares_permanentes_publicado_check check (
    estado <> 'publicado'
    or (verificado_at is not null and fuente not in ('openstreetmap', 'pedido_publico'))
  ),
  constraint lugares_permanentes_archivado_check check (estado <> 'archivado' or motivo_archivo is not null),
  constraint lugares_permanentes_urls_check check (
    (contacto_web is null or contacto_web ~* '^https?://')
    and (contacto_instagram is null or contacto_instagram ~* '^https://(www\.)?instagram\.com/')
  ),
  constraint lugares_permanentes_descripcion_check check (
    descripcion_corta is null or char_length(descripcion_corta) <= 280
  ),
  constraint lugares_permanentes_osm_ref_check check (
    osm_ref is null or osm_ref ~ '^(node|way|relation)/[0-9]+$'
  )
);

comment on table public.lugares_permanentes is
  'Q5-1: lugares permanentes para chicos (peloteros, salones de juegos, plazas con juegos, espacios culturales infantiles), 1 a 1 con un venue canónico. Carga del equipo (admin) o importador OSM como borrador; nada se publica sin verificación. anon lee solo publicados y sin cargado_por / verificado_por.';
comment on column public.lugares_permanentes.osm_ref is
  'Objeto de OpenStreetMap del que salió la ficha (node/123). Datos ODbL: mostrar «© colaboradores de OpenStreetMap» donde se usen.';

-- Lo que lee /mapa: los publicados, por tipo.
create index if not exists lugares_permanentes_publicados_idx
  on public.lugares_permanentes (tipo)
  where estado = 'publicado';

-- La cola de «para volver a verificar» del admin.
create index if not exists lugares_permanentes_revision_idx
  on public.lugares_permanentes (verificado_at)
  where estado = 'publicado';

-- FK a auth.users con índice (las recorre delete_my_account).
create index if not exists lugares_permanentes_cargado_por_idx
  on public.lugares_permanentes (cargado_por) where cargado_por is not null;
create index if not exists lugares_permanentes_verificado_por_idx
  on public.lugares_permanentes (verificado_por) where verificado_por is not null;

drop trigger if exists lugares_permanentes_updated_at on public.lugares_permanentes;
create trigger lugares_permanentes_updated_at
  before update on public.lugares_permanentes
  for each row execute function public.set_updated_at();

alter table public.lugares_permanentes enable row level security;

-- Una sola política de SELECT por rol (multiple_permissive_policies).
drop policy if exists "lectura pública de publicados" on public.lugares_permanentes;
create policy "lectura pública de publicados"
  on public.lugares_permanentes for select
  to anon
  using (estado = 'publicado');

drop policy if exists "lectura de publicados o admin" on public.lugares_permanentes;
create policy "lectura de publicados o admin"
  on public.lugares_permanentes for select
  to authenticated
  using (estado = 'publicado' or (select public.is_admin()));

drop policy if exists "inserción admin" on public.lugares_permanentes;
create policy "inserción admin"
  on public.lugares_permanentes for insert
  to authenticated
  with check ((select public.is_admin()));

drop policy if exists "actualización admin" on public.lugares_permanentes;
create policy "actualización admin"
  on public.lugares_permanentes for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "borrado admin" on public.lugares_permanentes;
create policy "borrado admin"
  on public.lugares_permanentes for delete
  to authenticated
  using ((select public.is_admin()));

-- anon: solo SELECT y solo de las columnas públicas (decisión 8).
revoke all on public.lugares_permanentes from anon;
grant select (
  id, venue_id, tipo, estado, descripcion_corta, edad_min, edad_max, horarios,
  acceso, nota_precio, techado, tiene_rampa, tiene_bano_adaptado, tiene_cambiador,
  contacto_telefono, contacto_web, contacto_instagram, fuente, fuente_detalle,
  osm_ref, verificado_at, motivo_archivo, created_at, updated_at
) on public.lugares_permanentes to anon;
grant select, insert, update, delete on public.lugares_permanentes to authenticated;
revoke truncate on public.lugares_permanentes from authenticated;
grant all on public.lugares_permanentes to service_role;

-- ---------------------------------------------------------------------------
-- delete_my_account(): la misma de la R58 (20261019120000), más
-- lugares_permanentes.cargado_por y verificado_por. El resto, idéntico.
-- ---------------------------------------------------------------------------
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
  update public.lugares_permanentes set cargado_por = null where cargado_por = v_uid;
  update public.lugares_permanentes set verificado_por = null where verificado_por = v_uid;

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
  'QPS-190/QPS-185: borra la cuenta de auth.uid() en una transacción (bloquea su perfil, desvincula su contenido público, borra sus filas personales y su fila de auth.users). SECURITY DEFINER, search_path vacío, EXECUTE solo authenticated. 42501 sin sesión. R58: también desvincula ad_price_cycles.approved_by, ad_settings.updated_by y ad_campaign_reports.created_by. Q5-1: y lugares_permanentes.cargado_por / verificado_por.';
