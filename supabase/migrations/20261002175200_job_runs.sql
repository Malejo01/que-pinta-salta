-- Sprint 3 / 3.1: bitácora de corridas de los procesos programados.
--
-- Cada cron de Vercel y cada workflow de GitHub Actions deja una fila al
-- empezar (RUNNING) y la cierra al terminar. Lo leen /admin/scrape y
-- /api/cron/health. Viene de la rama feat/scheduler, recortada: sin el
-- dispatcher, sin el lock de concurrencia (nada limpiaría un RUNNING colgado)
-- y sin política de escritura (escribe solo el service role, que saltea RLS).
--
-- Tabla propia y no scrape_runs: esa está atada a scrape_sources (FK), la
-- escribe el panel con la sesión del admin y no cubre procesos que no son
-- fuentes de scraping (cola de IA, newsletter).

CREATE TABLE IF NOT EXISTS public.job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ticketeras | instagram | cines | cola_ia | radar_newsletter
  job_key text NOT NULL,

  status text NOT NULL CHECK (status IN (
    'RUNNING',  -- en vuelo (o murió sin cerrar la fila: timeout de la función)
    'SUCCESS',  -- terminó sin errores
    'PARTIAL',  -- terminó, pero algunos ítems o fuentes fallaron
    'FAILED',   -- falló entero
    'SKIPPED'   -- corrió y no había nada que hacer (cola vacía, sin suscriptores)
  )),

  -- vercel-cron | github-actions | manual
  trigger_source text NOT NULL DEFAULT 'manual',

  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,

  items_processed integer NOT NULL DEFAULT 0,
  items_failed integer NOT NULL DEFAULT 0,

  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS job_runs_job_key_started_at_idx
  ON public.job_runs (job_key, started_at DESC);

-- Última corrida y última corrida sana de cada job. "Sana" incluye SKIPPED:
-- una cola vacía es una comprobación exitosa, no un proceso atrasado.
CREATE OR REPLACE VIEW public.job_last_runs
WITH (security_invoker = on) AS
WITH last_any AS (
  SELECT DISTINCT ON (job_key)
    job_key,
    id              AS last_run_id,
    status          AS last_status,
    trigger_source  AS last_trigger_source,
    started_at      AS last_started_at,
    finished_at     AS last_finished_at,
    duration_ms     AS last_duration_ms,
    items_processed AS last_items_processed,
    items_failed    AS last_items_failed,
    errors          AS last_errors
  FROM public.job_runs
  ORDER BY job_key, started_at DESC
),
last_ok AS (
  SELECT DISTINCT ON (job_key)
    job_key,
    started_at AS last_ok_started_at,
    status     AS last_ok_status
  FROM public.job_runs
  WHERE status IN ('SUCCESS', 'PARTIAL', 'SKIPPED')
  ORDER BY job_key, started_at DESC
)
SELECT a.*, o.last_ok_started_at, o.last_ok_status
FROM last_any a
LEFT JOIN last_ok o ON o.job_key = a.job_key;

ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;

-- Lectura para el panel admin. Sin políticas de escritura.
CREATE POLICY "Allow read for admins" ON public.job_runs
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

-- Los default privileges de public les dan todo a anon/authenticated; RLS ya
-- los frena, pero no tienen por qué poder escribir ni ver la tabla.
REVOKE ALL ON TABLE public.job_runs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.job_runs FROM authenticated;
REVOKE ALL ON TABLE public.job_last_runs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.job_last_runs FROM authenticated;
