-- Radar con cadencias (QPS-045): registro del último envío por usuario.
--
-- last_sent_at es la fecha del último Radar que Resend aceptó para ese usuario.
-- El cron de los jueves lo usa para decidir a quién le toca: weekly siempre,
-- biweekly si es null o pasaron 13 días o más, monthly si es null o 27 o más.
-- Null = nunca se le envió. Solo lo escribe el cron (service role); la tabla
-- ya tiene RLS y no cambia ninguna política.

ALTER TABLE public.user_radar_settings
  ADD COLUMN IF NOT EXISTS last_sent_at timestamptz;

COMMENT ON COLUMN public.user_radar_settings.last_sent_at IS
  'Último envío del Radar aceptado por Resend (null = nunca). Lo escribe el cron radar-newsletter; define quién le toca en biweekly y monthly.';

-- Backfill: el envío del 2026-10-08 solo lo recibieron los weekly. Si existe esa
-- corrida SUCCESS en job_runs, se toma su started_at como último envío de los
-- weekly. biweekly y monthly quedan en null (no recibieron nada). Sin corrida,
-- no hace nada.
UPDATE public.user_radar_settings s
SET last_sent_at = r.started_at
FROM (
  SELECT started_at
  FROM public.job_runs
  WHERE job_key = 'radar_newsletter'
    AND status = 'SUCCESS'
    AND (started_at AT TIME ZONE 'America/Argentina/Salta')::date = DATE '2026-10-08'
  ORDER BY started_at DESC
  LIMIT 1
) r
WHERE s.email_frequency = 'weekly'
  AND s.last_sent_at IS NULL;
