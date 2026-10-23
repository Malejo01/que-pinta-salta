-- pgTAP de 20261019120000_r58_precios_publicidad.sql:
-- ad_price_cycles, ad_prices, ad_settings (+ trigger ad_settings_exigir_ciclos),
-- ad_occupancy_daily, ad_campaign_reports y las columnas de bajas de
-- sponsored_campaigns. uuid fijo, prefijo "58" (inventados, "qa-r58-...").
-- Todo en una transacción con rollback.
--   U = 58000000-0000-4000-8000-000000000001: usuario común.
--   A = 58000000-0000-4000-8000-000000000002: admin.
begin;
create extension if not exists pgtap with schema extensions;
select plan(105);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', '58000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'qa-r58-u@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '58000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'qa-r58-admin@example.com', 'qa-no-es-password-real',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');

alter table public.profiles disable trigger tr_prevent_role_tampering;
update public.profiles set role = 'ADMIN' where id = '58000000-0000-4000-8000-000000000002';
alter table public.profiles enable trigger tr_prevent_role_tampering;

-- Punto de partida determinista: sin ciclos ni ocupación previos.
delete from public.ad_price_cycles;
delete from public.ad_occupancy_daily;
update public.ad_settings set aprobacion_automatica = false;

insert into public.events (id, title, slug, start_date, status)
values ('58111111-1111-4111-8111-111111111111', 'Evento de Prueba R58', 'qa-r58-evento',
        now() + interval '1 day', 'PUBLISHED');

insert into public.sponsored_campaigns (id, title, body, url, starts_at, ends_at)
values ('58222222-2222-4222-8222-222222222222', 'Campaña de Prueba R58', 'Texto QA', 'https://example.com/qa',
        now(), now() + interval '7 days');

-- C1 aprobado, C2 propuesto.
insert into public.ad_price_cycles
  (ciclo, audiencia_web_28d, audiencia, fuente_audiencia, tramo_calculado, tramo_vigente,
   tipo_cambio, fuente_tipo_cambio, estado, approved_at)
values ('2026-01-01', 1000, 1000, 'manual', 1000, 1000, 1000.00, 'qa', 'aprobado', now());
insert into public.ad_price_cycles
  (ciclo, audiencia_web_28d, audiencia, fuente_audiencia, tramo_calculado, tramo_vigente,
   tipo_cambio, fuente_tipo_cambio)
values ('2026-02-01', 1200, 1200, 'vercel', 1000, 1000, 1000.00, 'qa');

insert into public.ad_prices (id, ciclo, producto, tramo_ref, precio_usd, precio_ars, precio_fundador_ars,
                              tipo_cambio, vigente_desde, estado)
values ('58aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '2026-01-01', 'destacado-3', 1000, 10.00, 10000, 7500,
        1000.00, '2026-01-01', 'aprobado'),
       ('58aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '2026-02-01', 'destacado-3', 1000, 11.00, 11000, null,
        1000.00, '2026-02-01', 'propuesto');

insert into public.ad_occupancy_daily (day, hero_ocupados, hero_cupos)
values ('2026-01-01', 1, 3);

insert into public.ad_campaign_reports (id, event_id, tipo, desde, hasta)
values ('58bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', '58111111-1111-4111-8111-111111111111', 'destacado',
        '2026-01-01', '2026-01-08');

-- ---------------------------------------------------------------------------
-- 1. RLS y TRUNCATE
-- ---------------------------------------------------------------------------
select ok((select relrowsecurity from pg_class where oid = 'public.ad_price_cycles'::regclass),
  '1. ad_price_cycles: RLS habilitada');
select ok((select relrowsecurity from pg_class where oid = 'public.ad_prices'::regclass),
  '2. ad_prices: RLS habilitada');
select ok((select relrowsecurity from pg_class where oid = 'public.ad_settings'::regclass),
  '3. ad_settings: RLS habilitada');
select ok((select relrowsecurity from pg_class where oid = 'public.ad_occupancy_daily'::regclass),
  '4. ad_occupancy_daily: RLS habilitada');
select ok((select relrowsecurity from pg_class where oid = 'public.ad_campaign_reports'::regclass),
  '5. ad_campaign_reports: RLS habilitada');

select ok(
  not has_table_privilege('anon', 'public.ad_price_cycles', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.ad_price_cycles', 'TRUNCATE'),
  '6. ad_price_cycles: ni anon ni authenticated tienen TRUNCATE');
select ok(
  not has_table_privilege('anon', 'public.ad_prices', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.ad_prices', 'TRUNCATE'),
  '7. ad_prices: ni anon ni authenticated tienen TRUNCATE');
select ok(
  not has_table_privilege('anon', 'public.ad_settings', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.ad_settings', 'TRUNCATE'),
  '8. ad_settings: ni anon ni authenticated tienen TRUNCATE');
select ok(
  not has_table_privilege('anon', 'public.ad_occupancy_daily', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.ad_occupancy_daily', 'TRUNCATE'),
  '9. ad_occupancy_daily: ni anon ni authenticated tienen TRUNCATE');
select ok(
  not has_table_privilege('anon', 'public.ad_campaign_reports', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.ad_campaign_reports', 'TRUNCATE'),
  '10. ad_campaign_reports: ni anon ni authenticated tienen TRUNCATE');

-- ---------------------------------------------------------------------------
-- 2. CHECKs (como postgres)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into public.ad_price_cycles (ciclo, audiencia_web_28d, audiencia, fuente_audiencia, tramo_calculado, tramo_vigente, tipo_cambio, fuente_tipo_cambio)
    values ('2026-03-02', 1, 1, 'manual', 1, 1, 1, 'qa')$$,
  '23514', NULL, '11. ciclo: un día distinto del 1 se rechaza');
select throws_ok(
  $$insert into public.ad_price_cycles (ciclo, audiencia_web_28d, audiencia, fuente_audiencia, tramo_calculado, tramo_vigente, tipo_cambio, fuente_tipo_cambio, estado)
    values ('2026-03-01', 1, 1, 'manual', 1, 1, 1, 'qa', 'inventado')$$,
  '23514', NULL, '12. ciclo: estado inválido se rechaza');
select throws_ok(
  $$insert into public.ad_price_cycles (ciclo, audiencia_web_28d, audiencia, fuente_audiencia, tramo_calculado, tramo_vigente, tipo_cambio, fuente_tipo_cambio, estado)
    values ('2026-03-01', 1, 1, 'manual', 1, 1, 1, 'qa', 'aprobado')$$,
  '23514', NULL, '13. ciclo: aprobado sin approved_at se rechaza');
select throws_ok(
  $$insert into public.ad_price_cycles (ciclo, audiencia_web_28d, audiencia, fuente_audiencia, tramo_calculado, tramo_vigente, tipo_cambio, fuente_tipo_cambio, estado)
    values ('2026-03-01', 1, 1, 'manual', 1, 1, 1, 'qa', 'automatico')$$,
  '23514', NULL, '14. ciclo: automatico sin approved_at se rechaza');
select throws_ok(
  $$insert into public.ad_price_cycles (ciclo, audiencia_web_28d, audiencia, fuente_audiencia, tramo_calculado, tramo_vigente, tipo_cambio, fuente_tipo_cambio, factor_hero)
    values ('2026-03-01', 1, 1, 'manual', 1, 1, 1, 'qa', 0.79)$$,
  '23514', NULL, '15. ciclo: factor_hero 0,79 (< 0,8) se rechaza');
select throws_ok(
  $$insert into public.ad_price_cycles (ciclo, audiencia_web_28d, audiencia, fuente_audiencia, tramo_calculado, tramo_vigente, tipo_cambio, fuente_tipo_cambio, factor_push)
    values ('2026-03-01', 1, 1, 'manual', 1, 1, 1, 'qa', 1.51)$$,
  '23514', NULL, '16. ciclo: factor_push 1,51 (> 1,5) se rechaza');
select lives_ok(
  $$insert into public.ad_price_cycles (ciclo, audiencia_web_28d, audiencia, fuente_audiencia, tramo_calculado, tramo_vigente, tipo_cambio, fuente_tipo_cambio, factor_hero, factor_push)
    values ('2026-03-01', 1, 1, 'manual', 1, 1, 1, 'qa', 0.8, 1.5)$$,
  '17. ciclo: factores en los bordes 0,8 y 1,5 se aceptan');
select throws_ok(
  $$insert into public.ad_price_cycles (ciclo, audiencia_web_28d, audiencia, fuente_audiencia, tramo_calculado, tramo_vigente, tipo_cambio, fuente_tipo_cambio)
    values ('2026-04-01', 1, 1, 'otra', 1, 1, 1, 'qa')$$,
  '23514', NULL, '18. ciclo: fuente_audiencia desconocida se rechaza');
select throws_ok(
  $$insert into public.ad_price_cycles (ciclo, audiencia_web_28d, audiencia, fuente_audiencia, tramo_calculado, tramo_vigente, tipo_cambio, fuente_tipo_cambio, ocupacion_hero)
    values ('2026-04-01', 1, 1, 'manual', 1, 1, 1, 'qa', 1.5)$$,
  '23514', NULL, '19. ciclo: ocupacion_hero mayor a 1 se rechaza');
select throws_ok(
  $$insert into public.ad_price_cycles (ciclo, audiencia_web_28d, audiencia, fuente_audiencia, tramo_calculado, tramo_vigente, tipo_cambio, fuente_tipo_cambio)
    values ('2026-04-01', 1, 1, 'manual', 1, 1, 0, 'qa')$$,
  '23514', NULL, '20. ciclo: tipo_cambio 0 se rechaza');

select throws_ok(
  $$insert into public.ad_prices (ciclo, producto, tramo_ref, precio_usd, precio_ars, tipo_cambio, vigente_desde)
    values ('2026-02-01', 'destacado-7', 1000, 1, 1250, 1000, '2026-02-01')$$,
  '23514', NULL, '21. precio: precio_ars que no es múltiplo de 500 se rechaza');
select throws_ok(
  $$insert into public.ad_prices (ciclo, producto, tramo_ref, precio_usd, precio_ars, tipo_cambio, vigente_desde)
    values ('2026-02-01', 'destacado-7', 1000, 1, 0, 1000, '2026-02-01')$$,
  '23514', NULL, '22. precio: precio_ars 0 se rechaza');
select throws_ok(
  $$insert into public.ad_prices (ciclo, producto, tramo_ref, precio_usd, precio_ars, tipo_cambio, vigente_desde)
    values ('2026-02-01', 'destacado-7', 1000, 1, -500, 1000, '2026-02-01')$$,
  '23514', NULL, '23. precio: precio_ars negativo se rechaza');
select throws_ok(
  $$insert into public.ad_prices (ciclo, producto, tramo_ref, precio_usd, precio_ars, precio_fundador_ars, tipo_cambio, vigente_desde)
    values ('2026-02-01', 'destacado-7', 1000, 1, 10000, 10500, 1000, '2026-02-01')$$,
  '23514', NULL, '24. precio: fundador mayor al de lista se rechaza');
select throws_ok(
  $$insert into public.ad_prices (ciclo, producto, tramo_ref, precio_usd, precio_ars, precio_fundador_ars, tipo_cambio, vigente_desde)
    values ('2026-02-01', 'destacado-7', 1000, 1, 10000, 7250, 1000, '2026-02-01')$$,
  '23514', NULL, '25. precio: fundador que no es múltiplo de 500 se rechaza');
select lives_ok(
  $$insert into public.ad_prices (ciclo, producto, tramo_ref, precio_usd, precio_ars, precio_fundador_ars, tipo_cambio, vigente_desde)
    values ('2026-02-01', 'destacado-7', 1000, 1, 10000, 10000, 1000, '2026-02-01')$$,
  '26. precio: fundador igual al de lista se acepta');
select throws_ok(
  $$insert into public.ad_prices (ciclo, producto, tramo_ref, precio_usd, precio_ars, tipo_cambio, vigente_desde)
    values ('2026-02-01', 'producto-inventado', 1000, 1, 500, 1000, '2026-02-01')$$,
  '23514', NULL, '27. precio: producto desconocido se rechaza');
select throws_ok(
  $$insert into public.ad_prices (ciclo, producto, tramo_ref, precio_usd, precio_ars, tipo_cambio, vigente_desde)
    values ('2026-02-01', 'destacado-3', 1000, 1, 500, 1000, '2026-02-01')$$,
  '23505', NULL, '28. precio: (ciclo, producto) duplicado se rechaza');
select throws_ok(
  $$insert into public.ad_prices (ciclo, producto, tramo_ref, precio_usd, precio_ars, tipo_cambio, vigente_desde)
    values ('2026-12-01', 'destacado-14', 1000, 1, 500, 1000, '2026-12-01')$$,
  '23503', NULL, '29. precio: un ciclo que no existe se rechaza (FK)');
select throws_ok(
  $$insert into public.ad_prices (ciclo, producto, tramo_ref, precio_usd, precio_ars, tipo_cambio, vigente_desde, estado)
    values ('2026-02-01', 'push', 1000, 1, 500, 1000, '2026-02-01', 'descartado')$$,
  '23514', NULL, '30. precio: estado fuera de propuesto/aprobado se rechaza');

select throws_ok(
  $$insert into public.ad_settings (id) values (false)$$,
  '23514', NULL, '31. ad_settings: id = false se rechaza');
select throws_ok(
  $$insert into public.ad_settings (id) values (true)$$,
  '23505', NULL, '32. ad_settings: una segunda fila se rechaza');
select throws_ok(
  $$update public.ad_settings set umbral_bajas_push = 0$$,
  '23514', NULL, '33. ad_settings: umbral 0 se rechaza');
select throws_ok(
  $$update public.ad_settings set umbral_bajas_push = 1.5$$,
  '23514', NULL, '34. ad_settings: umbral mayor a 1 se rechaza');
select lives_ok(
  $$update public.ad_settings set umbral_bajas_push = 1$$,
  '35. ad_settings: umbral 1 (borde) se acepta');
update public.ad_settings set umbral_bajas_push = 0.02;
select throws_ok(
  $$update public.ad_settings set push_patrocinado_pausa_motivo = 'qa'$$,
  '23514', NULL, '36. ad_settings: motivo de pausa sin fecha de pausa se rechaza');

select throws_ok(
  $$insert into public.ad_occupancy_daily (day, hero_ocupados, hero_cupos) values ('2026-01-02', 4, 3)$$,
  '23514', NULL, '37. ocupación: hero_ocupados mayor a hero_cupos se rechaza');
select throws_ok(
  $$insert into public.ad_occupancy_daily (day, hero_ocupados, hero_cupos) values ('2026-01-02', 0, 0)$$,
  '23514', NULL, '38. ocupación: hero_cupos 0 se rechaza');

select throws_ok(
  $$insert into public.ad_campaign_reports (event_id, tipo, desde, hasta)
    values ('58111111-1111-4111-8111-111111111111', 'destacado', '2026-02-10', '2026-02-10')$$,
  '23514', NULL, '39. reporte: hasta igual a desde se rechaza');
select throws_ok(
  $$insert into public.ad_campaign_reports (event_id, tipo, desde, hasta)
    values ('58111111-1111-4111-8111-111111111111', 'destacado', '2026-02-10', '2026-02-09')$$,
  '23514', NULL, '40. reporte: hasta antes de desde se rechaza');
select throws_ok(
  $$insert into public.ad_campaign_reports (event_id, tipo, desde, hasta, token)
    values ('58111111-1111-4111-8111-111111111111', 'destacado', '2026-02-10', '2026-02-12', 'corto')$$,
  '23514', NULL, '41. reporte: token mal formado se rechaza');
select throws_ok(
  $$insert into public.ad_campaign_reports (event_id, tipo, desde, hasta, token)
    values ('58111111-1111-4111-8111-111111111111', 'destacado', '2026-02-10', '2026-02-12', 'ABCDEF0123456789ABCDEF0123456789')$$,
  '23514', NULL, '42. reporte: token en mayúsculas se rechaza');
select throws_ok(
  $$insert into public.ad_campaign_reports (event_id, tipo, desde, hasta)
    values ('58111111-1111-4111-8111-111111111111', 'push', '2026-02-10', '2026-02-12')$$,
  '23514', NULL, '43. reporte: push sin campaña se rechaza');
select lives_ok(
  $$insert into public.ad_campaign_reports (event_id, tipo, sponsored_campaign_id, desde, hasta)
    values ('58111111-1111-4111-8111-111111111111', 'push', '58222222-2222-4222-8222-222222222222', '2026-02-10', '2026-02-12')$$,
  '44. reporte: push con campaña se acepta');
select throws_ok(
  $$insert into public.ad_campaign_reports (event_id, tipo, desde, hasta, metricas)
    values ('58111111-1111-4111-8111-111111111111', 'destacado', '2026-02-10', '2026-02-12', '[1,2]'::jsonb)$$,
  '23514', NULL, '45. reporte: metricas que no es objeto (array) se rechaza');
select throws_ok(
  $$insert into public.ad_campaign_reports (event_id, tipo, desde, hasta)
    values ('58111111-1111-4111-8111-111111111111', 'otro', '2026-02-10', '2026-02-12')$$,
  '23514', NULL, '46. reporte: tipo desconocido se rechaza');
select throws_ok(
  $$insert into public.ad_campaign_reports (event_id, tipo, desde, hasta)
    values ('58111111-1111-4111-8111-111111111111', 'destacado', '2026-01-01', '2026-01-08')$$,
  '23505', NULL, '47. reporte: (evento, tipo, desde) duplicado se rechaza');
select throws_ok(
  $$insert into public.ad_campaign_reports (event_id, tipo, desde, hasta, precio_ars)
    values ('58111111-1111-4111-8111-111111111111', 'destacado', '2026-03-10', '2026-03-12', -1)$$,
  '23514', NULL, '48. reporte: precio_ars negativo se rechaza');

select throws_ok(
  $$update public.sponsored_campaigns set destinatarios = 10, bajas_48h = 11, bajas_medidas_at = now()
    where id = '58222222-2222-4222-8222-222222222222'$$,
  '23514', NULL, '49. campaña: bajas_48h mayor a destinatarios se rechaza');
select throws_ok(
  $$update public.sponsored_campaigns set destinatarios = 10, bajas_48h = 1
    where id = '58222222-2222-4222-8222-222222222222'$$,
  '23514', NULL, '50. campaña: bajas_48h sin bajas_medidas_at se rechaza');
select throws_ok(
  $$update public.sponsored_campaigns set destinatarios = -1
    where id = '58222222-2222-4222-8222-222222222222'$$,
  '23514', NULL, '51. campaña: destinatarios negativo se rechaza');
select lives_ok(
  $$update public.sponsored_campaigns set destinatarios = 10, bajas_48h = 10, bajas_medidas_at = now()
    where id = '58222222-2222-4222-8222-222222222222'$$,
  '52. campaña: bajas_48h igual a destinatarios (borde) se acepta');

-- ---------------------------------------------------------------------------
-- 3. Defaults
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.ad_settings), 1,
  '53. ad_settings: tiene su única fila');
select ok(
  (select aprobacion_automatica = false and umbral_bajas_push = 0.02
          and push_patrocinado_pausado_at is null and updated_by is null
   from public.ad_settings),
  '54. ad_settings: aprobacion_automatica false, umbral 0,02 y sin pausa');
select ok(
  (select token ~ '^[0-9a-f]{32}$' from public.ad_campaign_reports
   where id = '58bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'),
  '55. reporte: el token por defecto tiene 32 caracteres hex');
select is(
  (select count(distinct token)::int from public.ad_campaign_reports),
  (select count(*)::int from public.ad_campaign_reports),
  '56. reporte: los tokens por defecto son únicos');
select ok(
  (select estado = 'propuesto' and factor_hero = 1 and factor_push = 1
   from public.ad_price_cycles where ciclo = '2026-02-01'),
  '57. ciclo: estado propuesto y factores 1 por defecto');

-- ---------------------------------------------------------------------------
-- 4. ad_prices por rol
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select ok(
  (select count(*) from public.ad_prices) >= 1
  and (select count(*) from public.ad_prices where estado <> 'aprobado') = 0,
  '58. ad_prices: anon ve solo precios aprobados');
select is((select count(*)::int from public.ad_prices where id = '58aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'), 0,
  '59. ad_prices: anon no ve el propuesto');
select throws_ok(
  $$insert into public.ad_prices (ciclo, producto, tramo_ref, precio_usd, precio_ars, tipo_cambio, vigente_desde, estado)
    values ('2026-02-01', 'plan-mensual', 1000, 1, 500, 1000, '2026-02-01', 'aprobado')$$,
  '42501', NULL, '60. ad_prices: anon no puede insertar');
select throws_ok(
  $$update public.ad_prices set estado = 'aprobado'$$,
  '42501', NULL, '61. ad_prices: anon no puede actualizar');

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims = '{"sub":"58000000-0000-4000-8000-000000000001","role":"authenticated"}';

select ok(
  (select count(*) from public.ad_prices) >= 1
  and (select count(*) from public.ad_prices where estado <> 'aprobado') = 0,
  '62. ad_prices: un usuario común ve solo precios aprobados');
select throws_ok(
  $$insert into public.ad_prices (ciclo, producto, tramo_ref, precio_usd, precio_ars, tipo_cambio, vigente_desde, estado)
    values ('2026-02-01', 'plan-mensual', 1000, 1, 500, 1000, '2026-02-01', 'aprobado')$$,
  '42501', NULL, '63. ad_prices: un usuario común no puede insertar');
update public.ad_prices set estado = 'aprobado' where id = '58aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
update public.ad_prices set precio_ars = 500 where id = '58aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

reset role;
reset request.jwt.claims;

select is(
  (select estado from public.ad_prices where id = '58aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'),
  'propuesto',
  '64. ad_prices: el UPDATE de un usuario común no cambió el estado (RLS lo filtra)');
select is(
  (select precio_ars from public.ad_prices where id = '58aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  10000,
  '65. ad_prices: el UPDATE de un usuario común no cambió el precio');

set local role authenticated;
set local request.jwt.claims = '{"sub":"58000000-0000-4000-8000-000000000002","role":"authenticated"}';

select ok((select count(*) from public.ad_prices where estado = 'propuesto') >= 1,
  '66. ad_prices: el admin ve también los propuestos');
select lives_ok(
  $$update public.ad_prices set estado = 'aprobado' where id = '58aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'$$,
  '67. ad_prices: el admin puede actualizar el estado');
select is(
  (select estado from public.ad_prices where id = '58aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'),
  'aprobado',
  '68. ad_prices: el estado quedó aprobado');
select throws_ok(
  $$insert into public.ad_prices (ciclo, producto, tramo_ref, precio_usd, precio_ars, tipo_cambio, vigente_desde)
    values ('2026-02-01', 'plan-mensual', 1000, 1, 500, 1000, '2026-02-01')$$,
  '42501', NULL, '69. ad_prices: el admin no inserta (solo la service key)');

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 5. ciclos, ocupación y reportes por rol
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok($$select count(*) from public.ad_price_cycles$$, '42501', NULL,
  '70. ad_price_cycles: anon no puede leer');
select throws_ok($$select count(*) from public.ad_occupancy_daily$$, '42501', NULL,
  '71. ad_occupancy_daily: anon no puede leer');
select throws_ok($$select count(*) from public.ad_campaign_reports$$, '42501', NULL,
  '72. ad_campaign_reports: anon no puede leer');
select throws_ok(
  $$insert into public.ad_campaign_reports (event_id, tipo, desde, hasta)
    values ('58111111-1111-4111-8111-111111111111', 'destacado', '2026-05-01', '2026-05-02')$$,
  '42501', NULL, '73. ad_campaign_reports: anon no puede insertar');
select throws_ok(
  $$update public.ad_price_cycles set estado = 'descartado'$$,
  '42501', NULL, '74. ad_price_cycles: anon no puede actualizar');

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims = '{"sub":"58000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is((select count(*)::int from public.ad_price_cycles), 0,
  '75. ad_price_cycles: un usuario común ve 0 filas');
select is((select count(*)::int from public.ad_occupancy_daily), 0,
  '76. ad_occupancy_daily: un usuario común ve 0 filas');
select is((select count(*)::int from public.ad_campaign_reports), 0,
  '77. ad_campaign_reports: un usuario común ve 0 filas');
select throws_ok(
  $$insert into public.ad_price_cycles (ciclo, audiencia_web_28d, audiencia, fuente_audiencia, tramo_calculado, tramo_vigente, tipo_cambio, fuente_tipo_cambio)
    values ('2026-06-01', 1, 1, 'manual', 1, 1, 1, 'qa')$$,
  '42501', NULL, '78. ad_price_cycles: un usuario común no puede insertar');
select throws_ok(
  $$insert into public.ad_occupancy_daily (day, hero_ocupados, hero_cupos) values ('2026-01-05', 0, 3)$$,
  '42501', NULL, '79. ad_occupancy_daily: un usuario común no puede insertar');
select throws_ok(
  $$insert into public.ad_campaign_reports (event_id, tipo, desde, hasta)
    values ('58111111-1111-4111-8111-111111111111', 'destacado', '2026-05-01', '2026-05-02')$$,
  '42501', NULL, '80. ad_campaign_reports: un usuario común no puede insertar (RLS)');
update public.ad_price_cycles set estado = 'descartado' where ciclo = '2026-02-01';
delete from public.ad_campaign_reports;

reset role;
reset request.jwt.claims;

select is((select estado from public.ad_price_cycles where ciclo = '2026-02-01'), 'propuesto',
  '81. ad_price_cycles: el UPDATE de un usuario común no cambió nada');
select ok((select count(*)::int from public.ad_campaign_reports) >= 1,
  '82. ad_campaign_reports: el DELETE de un usuario común no borró nada');

set local role authenticated;
set local request.jwt.claims = '{"sub":"58000000-0000-4000-8000-000000000002","role":"authenticated"}';

select is((select count(*)::int from public.ad_price_cycles), 3,
  '83. ad_price_cycles: el admin lee los ciclos');
select is((select count(*)::int from public.ad_occupancy_daily), 1,
  '84. ad_occupancy_daily: el admin lee la ocupación');
select ok((select count(*)::int from public.ad_campaign_reports) >= 1,
  '85. ad_campaign_reports: el admin lee los reportes');
select lives_ok(
  $$update public.ad_price_cycles set factor_hero = 1.2 where ciclo = '2026-02-01'$$,
  '86. ad_price_cycles: el admin puede actualizar');
select is((select factor_hero from public.ad_price_cycles where ciclo = '2026-02-01'), 1.2::numeric,
  '87. ad_price_cycles: la actualización del admin quedó');
select throws_ok(
  $$insert into public.ad_price_cycles (ciclo, audiencia_web_28d, audiencia, fuente_audiencia, tramo_calculado, tramo_vigente, tipo_cambio, fuente_tipo_cambio)
    values ('2026-06-01', 1, 1, 'manual', 1, 1, 1, 'qa')$$,
  '42501', NULL, '88. ad_price_cycles: el admin no inserta (solo la service key)');
select throws_ok(
  $$delete from public.ad_price_cycles where ciclo = '2026-02-01'$$,
  '42501', NULL, '89. ad_price_cycles: el admin no borra');
select throws_ok(
  $$insert into public.ad_occupancy_daily (day, hero_ocupados, hero_cupos) values ('2026-01-05', 0, 3)$$,
  '42501', NULL, '90. ad_occupancy_daily: el admin no inserta (solo la service key)');
select throws_ok(
  $$update public.ad_occupancy_daily set hero_ocupados = 2$$,
  '42501', NULL, '91. ad_occupancy_daily: el admin no actualiza');
select lives_ok(
  $$insert into public.ad_campaign_reports (event_id, tipo, desde, hasta, created_by)
    values ('58111111-1111-4111-8111-111111111111', 'destacado', '2026-05-01', '2026-05-02',
            '58000000-0000-4000-8000-000000000002')$$,
  '92. ad_campaign_reports: el admin puede insertar');

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 6. ad_settings y el trigger ad_settings_exigir_ciclos
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok($$select count(*) from public.ad_settings$$, '42501', NULL,
  '93. ad_settings: anon no puede leer');
select throws_ok($$update public.ad_settings set aprobacion_automatica = true$$, '42501', NULL,
  '94. ad_settings: anon no puede actualizar');

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims = '{"sub":"58000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is((select count(*)::int from public.ad_settings), 0,
  '95. ad_settings: un usuario común no la lee');
update public.ad_settings set umbral_bajas_push = 0.5;

reset role;
reset request.jwt.claims;

select is((select umbral_bajas_push from public.ad_settings), 0.02::numeric,
  '96. ad_settings: el UPDATE de un usuario común no cambió nada');

-- Hasta acá hay 1 ciclo aprobado (2026-01-01): el admin no puede prender.
set local role authenticated;
set local request.jwt.claims = '{"sub":"58000000-0000-4000-8000-000000000002","role":"authenticated"}';

select throws_ok(
  $$update public.ad_settings set aprobacion_automatica = true$$,
  '23514', NULL,
  '97. trigger: el admin no prende la aprobación automática con menos de 3 ciclos aprobados');

reset role;
reset request.jwt.claims;

-- 2 ciclos aprobados más (como postgres) = 3.
insert into public.ad_price_cycles
  (ciclo, audiencia_web_28d, audiencia, fuente_audiencia, tramo_calculado, tramo_vigente,
   tipo_cambio, fuente_tipo_cambio, estado, approved_at)
values ('2026-04-01', 1, 1, 'manual', 1, 1, 1, 'qa', 'aprobado', now()),
       ('2026-05-01', 1, 1, 'manual', 1, 1, 1, 'qa', 'aprobado', now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"58000000-0000-4000-8000-000000000002","role":"authenticated"}';

select lives_ok(
  $$update public.ad_settings set aprobacion_automatica = true, updated_by = '58000000-0000-4000-8000-000000000002'$$,
  '98. trigger: con 3 ciclos aprobados el admin sí prende la aprobación automática');
select ok(
  (select aprobacion_automatica and updated_by = '58000000-0000-4000-8000-000000000002' from public.ad_settings),
  '99. trigger: el cambio quedó guardado');
-- now() es fijo dentro de la transacción: se prueba que el trigger pisa un
-- updated_at mandado por el cliente.
update public.ad_settings set updated_at = '2000-01-01', umbral_bajas_push = 0.05;
select ok(
  (select updated_at > '2001-01-01' and umbral_bajas_push = 0.05 from public.ad_settings),
  '100. trigger: updated_at lo fija el trigger aunque el cliente mande otro valor');
select lives_ok(
  $$update public.ad_settings set aprobacion_automatica = false$$,
  '101. trigger: apagar la aprobación automática no pide ciclos');

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 7. La función del trigger
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.ad_settings_exigir_ciclos()', 'execute'),
  '102. función del trigger: anon no tiene execute');
select ok(
  not has_function_privilege('authenticated', 'public.ad_settings_exigir_ciclos()', 'execute'),
  '103. función del trigger: authenticated no tiene execute');
select ok(
  (select coalesce(proconfig, '{}') @> array['search_path=""']
   from pg_proc where oid = 'public.ad_settings_exigir_ciclos()'::regprocedure),
  '104. función del trigger: search_path vacío');
select ok(
  (select tgenabled = 'O' and tgtype & 2 = 2 and tgtype & 16 = 16
   from pg_trigger
   where tgrelid = 'public.ad_settings'::regclass and tgname = 'ad_settings_exigir_ciclos'),
  '105. trigger ad_settings_exigir_ciclos: habilitado, BEFORE UPDATE');

select * from finish();
rollback;
