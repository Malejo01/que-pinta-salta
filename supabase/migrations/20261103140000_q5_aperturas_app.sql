-- Q5-13: aperturas diarias de la app, livianas y anónimas, para el panel
-- /admin/uso (personas activas por día y por semana, testers activos).
--
-- Qué se guarda por fila: el día de Salta, dos hashes (del día y de la
-- semana ISO) de un id de métricas aleatorio que la app genera y guarda solo
-- en el teléfono, la plataforma, la versión de la app, si había sesión y
-- cuántas veces se abrió ese día (con tope). Qué NO: ni el id crudo (el
-- servidor solo guarda `sha256(id:día)` y `sha256(id:semana)`), ni el
-- device_id del push, ni IP, ni user agent, ni usuario. Con el hash del día
-- no se puede seguir a nadie de un día al otro; con el de la semana, solo
-- dentro de esa semana.
--
-- Escribe SOLO el servidor (POST /api/app/apertura, con límites) por
-- `registrar_apertura_app`, con EXECUTE solo para service_role. Leen los
-- admins. Aditiva: una tabla, una función y policies.

create table if not exists public.app_aperturas_diarias (
  day date not null,
  hash_dia text not null,
  hash_semana text not null,
  plataforma text not null default 'android',
  version_app text null,
  con_cuenta boolean not null default false,
  aperturas integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_aperturas_diarias_pkey primary key (day, hash_dia),
  constraint app_aperturas_hash_dia_check check (hash_dia ~ '^[0-9a-f]{64}$'),
  constraint app_aperturas_hash_semana_check check (hash_semana ~ '^[0-9a-f]{64}$'),
  constraint app_aperturas_plataforma_check check (plataforma in ('android', 'ios')),
  constraint app_aperturas_version_check check (version_app is null or version_app ~ '^[0-9A-Za-z._-]{1,20}$'),
  constraint app_aperturas_aperturas_check check (aperturas between 1 and 1000)
);

comment on table public.app_aperturas_diarias is
  'Q5-13: aperturas de la app por día de Salta, anónimas: hashes diario y semanal de un id de métricas que vive solo en el teléfono (nunca el id crudo, ni el device_id del push, ni IP ni usuario). Escribe solo registrar_apertura_app (service_role); leen los admins.';

create index if not exists app_aperturas_semana_idx on public.app_aperturas_diarias (hash_semana, day);

alter table public.app_aperturas_diarias enable row level security;

drop policy if exists "lectura admin" on public.app_aperturas_diarias;
create policy "lectura admin"
  on public.app_aperturas_diarias for select
  to authenticated
  using ((select public.is_admin()));

revoke all on public.app_aperturas_diarias from anon;
revoke all on public.app_aperturas_diarias from authenticated;
grant select on public.app_aperturas_diarias to authenticated;
grant all on public.app_aperturas_diarias to service_role;

-- Alta o suma del día (atómica). `con_cuenta` queda en true si alguna vez
-- ese día se abrió con sesión. Las aperturas tienen tope (1000).
create or replace function public.registrar_apertura_app(
  p_day date,
  p_hash_dia text,
  p_hash_semana text,
  p_plataforma text,
  p_version text,
  p_con_cuenta boolean
) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.app_aperturas_diarias (day, hash_dia, hash_semana, plataforma, version_app, con_cuenta)
  values (p_day, p_hash_dia, p_hash_semana, p_plataforma, p_version, coalesce(p_con_cuenta, false))
  on conflict (day, hash_dia) do update
    set aperturas = least(public.app_aperturas_diarias.aperturas + 1, 1000),
        con_cuenta = public.app_aperturas_diarias.con_cuenta or excluded.con_cuenta,
        version_app = coalesce(excluded.version_app, public.app_aperturas_diarias.version_app),
        updated_at = now();
$$;

revoke all on function public.registrar_apertura_app(date, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.registrar_apertura_app(date, text, text, text, text, boolean) to service_role;

comment on function public.registrar_apertura_app(date, text, text, text, text, boolean) is
  'Q5-13: suma una apertura del día para un hash anónimo. Solo service_role (POST /api/app/apertura).';
