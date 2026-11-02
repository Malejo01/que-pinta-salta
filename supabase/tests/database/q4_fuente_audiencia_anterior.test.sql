-- Q4-5: ad_price_cycles.fuente_audiencia admite 'anterior' (y nada más nuevo).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(4);

select lives_ok(
  $$insert into public.ad_price_cycles (ciclo, audiencia_web_28d, audiencia, fuente_audiencia, tramo_calculado, tramo_vigente, tipo_cambio, fuente_tipo_cambio)
    values ('2099-01-01', 0, 0, 'anterior', 1, 1, 1000, 'anterior')$$,
  '1. un ciclo con fuente_audiencia = anterior se guarda'
);
select lives_ok(
  $$update public.ad_price_cycles set fuente_audiencia = 'manual' where ciclo = '2099-01-01'$$,
  '2. el admin la pasa a manual'
);
select lives_ok(
  $$update public.ad_price_cycles set fuente_audiencia = 'vercel' where ciclo = '2099-01-01'$$,
  '3. vercel sigue valiendo'
);
select throws_ok(
  $$update public.ad_price_cycles set fuente_audiencia = 'adivinada' where ciclo = '2099-01-01'$$,
  '23514', NULL,
  '4. cualquier otro valor sigue rechazado por el check'
);

select * from finish();
rollback;
