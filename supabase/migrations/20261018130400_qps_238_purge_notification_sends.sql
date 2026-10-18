-- QPS-238: plazo de retención de notification_sends.
--
-- public.purge_notification_sends(p_days integer default 90) borra los envíos
-- con sent_at más viejo que p_days días y devuelve cuántas filas borró.
-- SECURITY DEFINER con search_path vacío; EXECUTE solo para service_role (la
-- llama un proceso programado del servidor). p_days tiene que ser >= 1
-- (22023 si no): un 0 o un negativo no puede vaciar la tabla por error.
--
-- Nadie la llama todavía: el llamado programado (cron o workflow, con su
-- registro en job_runs) lo agrega la R51. Esta migración no toca .github/ ni
-- vercel.json.
--
-- notification_sends.dedupe_key es único y sirve para no mandar dos veces lo
-- mismo: al purgar, una clave de más de p_days días deja de existir. Las
-- claves de hoy son de eventos o del día, así que con 90 días no hay nada que
-- se pueda repetir; si se agrega un aviso con una clave "para siempre", hay
-- que tenerlo en cuenta.
--
-- Índice en sent_at para que el borrado no recorra la tabla entera.
--
-- Idempotente (create index if not exists, create or replace function).

create index if not exists notification_sends_sent_at_idx
  on public.notification_sends (sent_at);

create or replace function public.purge_notification_sends(p_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_borradas integer;
begin
  if p_days is null or p_days < 1 then
    raise exception 'p_days tiene que ser un entero mayor o igual a 1' using errcode = '22023';
  end if;

  delete from public.notification_sends
  where sent_at < now() - make_interval(days => p_days);

  get diagnostics v_borradas = row_count;
  return v_borradas;
end;
$$;

revoke all on function public.purge_notification_sends(integer) from public, anon, authenticated;
grant execute on function public.purge_notification_sends(integer) to service_role;

comment on function public.purge_notification_sends(integer) is
  'QPS-238: borra de notification_sends los envíos con sent_at más viejo que p_days días (default 90, mínimo 1) y devuelve cuántos borró. SECURITY DEFINER, search_path vacío, EXECUTE solo service_role. La llama el proceso programado que agrega la R51.';
