-- ============================================================
-- Scheduler unificado: bitácora de corridas de jobs
-- ============================================================
-- Tabla propia y no reutilización de `scrape_runs` a propósito:
-- `scrape_runs` está atada a `scrape_sources` (FK) y la escribe el panel
-- admin con la sesión del usuario. El scheduler corre sin usuario, cubre
-- procesos que no son fuentes de scraping (newsletter, cola de IA) y
-- necesita un lock de concurrencia que `scrape_runs` no tiene.

create extension if not exists pgcrypto;

create table if not exists public.job_runs (
  id uuid primary key default gen_random_uuid(),

  -- Clave del job en el registro de `lib/scheduler/jobs.ts`
  job_key text not null,

  status text not null check (status in (
    'RUNNING',   -- en vuelo
    'SUCCESS',   -- terminó sin errores
    'PARTIAL',   -- terminó, pero algunos items fallaron
    'FAILED',    -- el job entero falló tras agotar reintentos
    'SKIPPED',   -- no correspondía correr (no due / sin trabajo pendiente)
    'TIMEOUT'    -- quedó colgado en RUNNING y lo recuperó el barrido
  )),

  -- 'cron' (dispatcher automático) | 'manual' (endpoint /run/[job]) | 'backfill'
  trigger_source text not null default 'cron',

  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,

  items_processed integer not null default 0,
  items_failed integer not null default 0,

  -- Cantidad de intentos consumidos (1 = salió al primer intento)
  attempts integer not null default 1,

  -- Errores estructurados: [{ scope, message, attempt }]
  errors jsonb not null default '[]'::jsonb,

  -- Payload libre por job (contadores propios de cada proceso)
  details jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

-- Consulta principal del health check: último run por job.
create index if not exists job_runs_job_key_started_at_idx
  on public.job_runs (job_key, started_at desc);

-- Lock de concurrencia: a lo sumo un run RUNNING por job.
-- Si el dispatcher y un trigger manual coinciden, el segundo insert falla
-- con violación de unicidad y el runner lo traduce a SKIPPED en vez de
-- correr el mismo proceso dos veces en paralelo.
create unique index if not exists job_runs_single_running_idx
  on public.job_runs (job_key)
  where status = 'RUNNING';

-- Vista de conveniencia: la última corrida y la última corrida exitosa de
-- cada job, que es exactamente lo que responde /api/cron/health.
create or replace view public.job_last_runs as
with last_any as (
  select distinct on (job_key)
    job_key,
    id            as last_run_id,
    status        as last_status,
    started_at    as last_started_at,
    finished_at   as last_finished_at,
    duration_ms   as last_duration_ms,
    items_processed as last_items_processed,
    items_failed  as last_items_failed,
    errors        as last_errors
  from public.job_runs
  order by job_key, started_at desc
),
-- "Corrida sana" incluye SKIPPED a propósito: un tick que corrió y encontró
-- la cola vacía o sin suscriptores es una comprobación exitosa, no un
-- proceso desactualizado. Si SKIPPED no contara, el health check marcaría
-- como vencida a la cola de IA justo cuando está al día.
last_ok as (
  select distinct on (job_key)
    job_key,
    started_at      as last_ok_started_at,
    finished_at     as last_ok_finished_at,
    status          as last_ok_status,
    items_processed as last_ok_items_processed
  from public.job_runs
  where status in ('SUCCESS', 'PARTIAL', 'SKIPPED')
  order by job_key, started_at desc
)
select
  a.job_key,
  a.last_run_id,
  a.last_status,
  a.last_started_at,
  a.last_finished_at,
  a.last_duration_ms,
  a.last_items_processed,
  a.last_items_failed,
  a.last_errors,
  o.last_ok_started_at,
  o.last_ok_finished_at,
  o.last_ok_status,
  o.last_ok_items_processed
from last_any a
left join last_ok o on o.job_key = a.job_key;

-- ------------------------------------------------------------
-- RLS: misma política que `scrape_runs`. El scheduler escribe con la
-- service role key, que se saltea RLS; acá sólo se habilita lectura para
-- el panel admin.
-- ------------------------------------------------------------
alter table public.job_runs enable row level security;

drop policy if exists "Allow read for admins" on public.job_runs;
create policy "Allow read for admins"
  on public.job_runs for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Allow write for admins" on public.job_runs;
create policy "Allow write for admins"
  on public.job_runs for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- La vista hereda los permisos del invocador sobre `job_runs`.
alter view public.job_last_runs set (security_invoker = on);
