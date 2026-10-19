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
