-- pgTAP de 20261103160000_q5_decisiones_q4.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- nº2: un teléfono sin cuenta con los patrocinados prendidos.
insert into public.push_tokens (id, token, platform, device_id, avisos_patrocinados)
values ('d5111111-1111-4111-8111-111111111111', 'ExponentPushToken[q5-decisiones-qa]', 'android',
        'd5222222-2222-4222-8222-222222222222', true);

-- Prender otra cosa no marca baja.
select ok(public.set_push_preferences('ExponentPushToken[q5-decisiones-qa]', 'd5222222-2222-4222-8222-222222222222', false, null), '1. set_push_preferences sigue devolviendo true');
select is((select avisos_patrocinados_baja_at from public.push_tokens where id = 'd5111111-1111-4111-8111-111111111111'), null, '2. cambiar avisos_equipo no marca baja');

-- Apagar los patrocinados (true -> false) marca la baja.
select ok(public.set_push_preferences('ExponentPushToken[q5-decisiones-qa]', 'd5222222-2222-4222-8222-222222222222', null, false), '3. apagar patrocinados: true');
select isnt((select avisos_patrocinados_baja_at from public.push_tokens where id = 'd5111111-1111-4111-8111-111111111111'), null, '4. true -> false marca avisos_patrocinados_baja_at');

-- Volver a mandar false (ya estaba apagado) no corre la marca.
update public.push_tokens set avisos_patrocinados_baja_at = '2026-01-01T00:00:00Z' where id = 'd5111111-1111-4111-8111-111111111111';
select public.set_push_preferences('ExponentPushToken[q5-decisiones-qa]', 'd5222222-2222-4222-8222-222222222222', null, false);
select is((select avisos_patrocinados_baja_at from public.push_tokens where id = 'd5111111-1111-4111-8111-111111111111'), '2026-01-01T00:00:00Z'::timestamptz, '5. false -> false no mueve la marca');

-- Privilegios: siguen siendo solo de service_role.
select ok(not has_function_privilege('anon', 'public.set_push_preferences(text, uuid, boolean, boolean)', 'execute'), '6. anon no ejecuta set_push_preferences');

-- nº7: la sugerencia va completa o no va.
insert into public.venues (id, name, address) values ('d5333333-3333-4333-8333-333333333333', 'Lugar QA Q5-16', 'Calle QA 123');
select lives_ok($$ update public.venues set geocode_sugerencia_lat = -24.78, geocode_sugerencia_lng = -65.41, geocode_sugerencia_texto = 'Calle QA 123, Salta', geocode_sugerencia_at = now() where id = 'd5333333-3333-4333-8333-333333333333' $$, '7. una sugerencia completa entra');
select throws_ok($$ update public.venues set geocode_sugerencia_lng = null where id = 'd5333333-3333-4333-8333-333333333333' $$, '23514', null, '8. lat sin lng no entra');
select throws_ok($$ update public.venues set geocode_sugerencia_lng = 190 where id = 'd5333333-3333-4333-8333-333333333333' $$, '23514', null, '9. longitud fuera de rango no entra (la latitud ya la frena numeric(10,8))');

select * from finish();
rollback;
