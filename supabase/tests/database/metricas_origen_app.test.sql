-- Ronda 23 (23-b): pgTAP del cambio "app" en record_event_metric() / el
-- CHECK de event_metrics_daily.origin, de la migración
-- 20261013120200_metricas_origen_app.sql. Única "baja" de 23-a: no cambia
-- ningún dato, solo suma 'app' a la lista de orígenes válidos.
--
-- Un solo evento PUBLISHED, id fijo, creado como postgres (prefijo
-- qa-app-metrica-). Todo dentro de una transacción con rollback; nada de
-- esto queda en la base.
--
-- record_event_metric() es SECURITY DEFINER, GRANT EXECUTE solo a
-- service_role: se llama como service_role, el camino real (API de métricas
-- con el cliente admin).
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into public.events (id, title, slug, start_date, status)
values ('e0000000-0000-4000-8000-000000000001', 'QA App Metrica Evento',
        'qa-app-metrica-evento', now() + interval '1 day', 'PUBLISHED');

set local role service_role;

-- 1. record_event_metric(<publicado>, 'view', 'app') no se rechaza.
select lives_ok(
  $$select public.record_event_metric('e0000000-0000-4000-8000-000000000001', 'view', 'app')$$,
  '1. record_event_metric: el origen "app" no se rechaza'
);

-- 2. Queda 1 vista con origin='app' para el día de hoy (misma zona horaria
--    que usa la función).
select is(
  (select views from public.event_metrics_daily
   where event_id = 'e0000000-0000-4000-8000-000000000001'
     and day = (now() at time zone 'America/Argentina/Salta')::date
     and origin = 'app'),
  1::bigint,
  '2. event_metrics_daily: queda 1 vista con origin = app'
);

-- 3. Un origen inventado no tira error (la función hace RETURN, en
--    silencio), igual que antes de esta migración.
select lives_ok(
  $$select public.record_event_metric('e0000000-0000-4000-8000-000000000001', 'view', 'qa-origen-inventado')$$,
  '3. record_event_metric: un origen inventado no tira error'
);

-- 4. Y no suma ninguna fila para ese origen inventado.
select is(
  (select count(*)::int from public.event_metrics_daily
   where event_id = 'e0000000-0000-4000-8000-000000000001'
     and origin = 'qa-origen-inventado'),
  0,
  '4. event_metrics_daily: el origen inventado no suma ninguna fila'
);

-- 5. Los ocho orígenes de antes del CHECK siguen aceptados: se llaman los
--    ocho de una (con kind='click', para no pisar la fila 'app'/'view' de
--    arriba).
select lives_ok(
  $$select public.record_event_metric('e0000000-0000-4000-8000-000000000001', 'click', o)
    from unnest(array['hero','hoy','fila','busqueda','favoritos','ficha','radar','directo']) as o$$,
  '5. record_event_metric: los ocho orígenes de antes siguen sin rechazarse'
);

-- 6. Las ocho filas quedan con 1 clic cada una.
select is(
  (select count(*)::int from public.event_metrics_daily
   where event_id = 'e0000000-0000-4000-8000-000000000001'
     and origin in ('hero','hoy','fila','busqueda','favoritos','ficha','radar','directo')
     and clicks = 1),
  8,
  '6. event_metrics_daily: las ocho filas quedan con 1 clic cada una'
);

reset role;

select * from finish();
rollback;
