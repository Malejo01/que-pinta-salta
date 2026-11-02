-- ============================================================================
-- Tanda Q4 (Q4-5): la audiencia que el cron copió del ciclo anterior se marca
-- como tal (pregunta 18, opción recomendada).
-- ============================================================================
--
-- Hasta hoy el cron de publicidad escribía fuente_audiencia = 'manual' cuando
-- el ciclo nuevo nacía con la audiencia del anterior (o 0), y el aviso del
-- admin («Es la audiencia del mes anterior: cargala a mano») salía de comparar
-- números. Ahora el cron escribe 'anterior', el admin la pasa a 'manual' al
-- cargarla, y el aviso sale de ese valor.
--
-- Solo AMPLÍA el check (suma 'anterior'): todas las filas actuales ('vercel' o
-- 'manual') lo siguen cumpliendo. No toca datos. Compatible hacia atrás: el
-- código viejo nunca escribe 'anterior'.
-- ============================================================================

alter table public.ad_price_cycles
  drop constraint if exists ad_price_cycles_fuente_audiencia_check,
  add constraint ad_price_cycles_fuente_audiencia_check
    check (fuente_audiencia in ('vercel', 'manual', 'anterior'));

comment on column public.ad_price_cycles.fuente_audiencia is
  'De dónde salió la audiencia: vercel (automática), manual (la cargó un admin) o anterior (Q4-5: el cron la copió del ciclo previo; falta cargarla antes de aprobar).';
