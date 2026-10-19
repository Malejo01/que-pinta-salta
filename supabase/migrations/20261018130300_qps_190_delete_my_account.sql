-- QPS-190 (y QPS-185): borrar la propia cuenta en UNA transacción.
--
-- Hoy apps/web/lib/cuenta/eliminar.ts hace llamadas sucesivas con la service
-- key (desvincular, borrar tabla por tabla, admin.auth.admin.deleteUser): si
-- una falla en el medio, lo anterior ya quedó aplicado (incluida la
-- desvinculación irreversible de events.created_by) y la cuenta sigue viva.
-- public.delete_my_account() hace lo mismo, en el mismo orden, en una sola
-- transacción: o se borra todo, o no cambia nada.
--
-- Qué hace, sobre auth.uid() y nada más:
--   0. Falla con 42501 si no hay sesión (auth.uid() null).
--   1. Bloquea la fila de public.profiles con FOR UPDATE (QPS-185): un
--      createEvent concurrente de la misma persona queda esperando el lock de
--      la FK y, cuando esta transacción termina, falla por FK en vez de dejar
--      un evento apuntando a un perfil a medio borrar.
--   2. Desvincula (pone en null) las columnas de COLUMNAS_A_DESVINCULAR de
--      apps/web/lib/cuenta/tablas-personales.ts: events.created_by,
--      events.featured_set_by, aliases.created_by, venue_aliases.created_by,
--      venue_review_queue.reviewed_by, scrape_runs.triggered_by y
--      sponsored_campaigns.created_by. Las que ya son on delete set null se
--      ponen en null igual, a mano, para no depender del cascade.
--   3. Borra las filas de TABLAS_A_BORRAR, en el mismo orden (profiles al
--      final, después de duplicate_dismissals, por la FK NO ACTION).
--   4. Borra la fila de auth.users. Lo que cuelga de ahí (identities,
--      sessions, refresh_tokens) se va por el cascade de Supabase Auth.
--
-- El servidor ya no necesita la service key para borrar: llama al RPC con el
-- cliente de la sesión de la persona (cookie en la web, Bearer en la app) y
-- después cierra la sesión local. El JWT que ya emitió sigue siendo válido
-- hasta que vence, pero apunta a un usuario que no existe: cualquier escritura
-- falla por FK y los refresh tokens ya no están. Cambiar el endpoint
-- (app/api/cuenta/eliminar) para que use este RPC es de la R48.
--
-- SECURITY DEFINER con search_path vacío (todo va calificado). EXECUTE solo
-- para authenticated (revocado a public, anon y service_role: con la service
-- key auth.uid() es null y no tendría a quién borrar).
--
-- Si se agrega una tabla personal o una columna *_by nueva, va acá y en
-- tablas-personales.ts (el test tests/cuenta/tablas-personales.test.ts avisa
-- de las columnas nuevas; el pgTAP qps_190_delete_my_account.test.sql
-- compara las FK hacia auth.users y profiles con las que cubre esta función).
--
-- Idempotente: create or replace function.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  -- 1. QPS-185: el perfil queda bloqueado hasta el final de la transacción.
  perform 1 from public.profiles where id = v_uid for update;

  -- 2. Desvincular el contenido público.
  update public.events set created_by = null where created_by = v_uid;
  update public.events set featured_set_by = null where featured_set_by = v_uid;
  update public.aliases set created_by = null where created_by = v_uid;
  update public.venue_aliases set created_by = null where created_by = v_uid;
  update public.venue_review_queue set reviewed_by = null where reviewed_by = v_uid;
  update public.scrape_runs set triggered_by = null where triggered_by = v_uid;
  update public.sponsored_campaigns set created_by = null where created_by = v_uid;

  -- 3. Borrar las filas personales (orden de TABLAS_A_BORRAR).
  delete from public.favorites where user_id = v_uid;
  delete from public.user_favorites where user_id = v_uid;
  delete from public.event_attendance where user_id = v_uid;
  delete from public.push_tokens where user_id = v_uid;
  delete from public.notification_preferences where user_id = v_uid;
  delete from public.notification_sends where user_id = v_uid;
  delete from public.user_radar_settings where user_id = v_uid;
  delete from public.user_followed_categories where user_id = v_uid;
  delete from public.user_followed_venues where user_id = v_uid;
  delete from public.user_followed_instagram_accounts where user_id = v_uid;
  delete from public.duplicate_dismissals where decided_by = v_uid;
  delete from public.profiles where id = v_uid;

  -- 4. La cuenta misma.
  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon, service_role;
grant execute on function public.delete_my_account() to authenticated;

comment on function public.delete_my_account() is
  'QPS-190/QPS-185: borra la cuenta de auth.uid() en una transacción (bloquea su perfil, desvincula su contenido público, borra sus filas personales y su fila de auth.users). SECURITY DEFINER, search_path vacío, EXECUTE solo authenticated. 42501 sin sesión.';
