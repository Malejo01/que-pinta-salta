-- ============================================================================
-- Ronda 82 (82-a): avisos para quien no inició sesión.
-- ============================================================================
--
-- Hasta hoy push_tokens.user_id era NOT NULL: solo recibían avisos quienes
-- tenían cuenta. Esta migración deja que un dispositivo se registre SIN cuenta,
-- identificado por un `device_id` que genera el teléfono.
--
-- Qué cambia:
--   1. push_tokens: user_id pasa a NULL permitido; suma device_id,
--      avisos_equipo, avisos_patrocinados e idioma. Una fila sin usuario
--      (anónima) tiene que tener device_id (check). Único por token (ya lo era).
--   2. notification_sends: user_id pasa a NULL permitido y suma push_token_id
--      (FK a push_tokens, ON DELETE CASCADE). Es la opción mínima para el
--      dedupe y el tope semanal de los envíos a anónimos, sin una tabla nueva:
--      una fila de envío pertenece a un usuario O a un token (check). La
--      dedupe_key de los anónimos usa el id de la fila de push_tokens donde
--      las claves de hoy usan el user_id (los dos son uuid, no chocan).
--   3. Cuatro funciones SECURITY DEFINER con search_path vacío:
--        register_anon_push_token   (solo service_role)   alta/renovación anónima
--        set_push_preferences       (solo service_role)   interruptores de la fila anónima
--        unlink_push_token          (solo authenticated)  al cerrar sesión: la fila queda anónima
--        purge_push_tokens_anonimos (solo service_role)   limpieza de filas anónimas viejas
--
-- Qué NO cambia:
--   * RLS de push_tokens y notification_sends: ninguna policy nueva. anon sigue
--     sin ningún privilegio sobre las dos tablas; las filas anónimas (user_id
--     nulo) no las ve nadie con la anon key ni con una sesión (la policy de
--     lectura compara auth.uid() = user_id y NULL nunca coincide). Todo lo
--     anónimo pasa por la API del servidor con la service key.
--   * register_push_token(p_token, p_platform): sigue siendo la vía de alta de
--     quien tiene sesión. Su upsert por token pasa a ser, además, el VÍNCULO
--     de una fila anónima con la cuenta: pone user_id y deja device_id,
--     avisos_* e idioma como estaban (el DO UPDATE no los toca). No se
--     duplica la fila: el token es único.
--   * delete_my_account(): sin cambios. Ya borra push_tokens por user_id, así
--     que la fila del teléfono de quien borra su cuenta se borra (y con ella,
--     por cascada, sus notification_sends por push_token_id). El teléfono
--     queda sin registro hasta que la app vuelva a registrarse como anónima.
--
-- Qué interruptor manda en cada caso (decisión de diseño, ver
-- diseno-82-bcd.md): con user_id, mandan las preferencias de la cuenta
-- (notification_preferences.announcements / .sponsored, más silencio y tope);
-- avisos_equipo y avisos_patrocinados de push_tokens solo valen para filas
-- anónimas (user_id nulo). Así no hay dos fuentes de verdad para una cuenta.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT IF EXISTS antes de
-- cada ADD CONSTRAINT, CREATE INDEX IF NOT EXISTS, CREATE OR REPLACE FUNCTION.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. push_tokens
-- ---------------------------------------------------------------------------

alter table public.push_tokens
  alter column user_id drop not null;

alter table public.push_tokens
  add column if not exists device_id uuid,
  add column if not exists avisos_equipo boolean not null default true,
  add column if not exists avisos_patrocinados boolean not null default false,
  add column if not exists idioma text;

-- Una fila sin cuenta se identifica por su dispositivo: sin device_id no
-- habría con qué autorizar un cambio de preferencias.
alter table public.push_tokens
  drop constraint if exists push_tokens_anonimo_device_check;
alter table public.push_tokens
  add constraint push_tokens_anonimo_device_check
  check (user_id is not null or device_id is not null);

-- Código de idioma corto ("es", "es-AR", "en"); lo valida también la API.
alter table public.push_tokens
  drop constraint if exists push_tokens_idioma_check;
alter table public.push_tokens
  add constraint push_tokens_idioma_check
  check (idioma is null or idioma ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$');

create index if not exists push_tokens_device_id_idx
  on public.push_tokens (device_id)
  where device_id is not null;

comment on table public.push_tokens is
  'Token push (Expo/FCM/APNs) por dispositivo, para la app. Único por token. user_id nulo = dispositivo sin cuenta (R82), identificado por device_id: esas filas solo las toca el servidor con la service key. El dueño (con cuenta) lee y borra lo suyo; el alta con cuenta es exclusivamente public.register_push_token().';
comment on column public.push_tokens.user_id is
  'Dueño de la fila. NULL = dispositivo sin cuenta (R82). Se completa al iniciar sesión (register_push_token) y se vuelve a poner en NULL al cerrar sesión (unlink_push_token).';
comment on column public.push_tokens.device_id is
  'R82: uuid que genera el teléfono y guarda en el almacenamiento seguro. Es la "contraseña" de la fila anónima: solo quien manda token + device_id coincidentes puede cambiar sus interruptores. Nunca se muestra ni se loguea.';
comment on column public.push_tokens.avisos_equipo is
  'R82: avisos del equipo de Qué Pinta Salta. Solo vale si user_id es NULL; con cuenta manda notification_preferences.announcements.';
comment on column public.push_tokens.avisos_patrocinados is
  'R82: avisos patrocinados. Default false (política de anuncios de Play). Solo vale si user_id es NULL; con cuenta manda notification_preferences.sponsored.';
comment on column public.push_tokens.idioma is
  'R82: idioma de la app en el dispositivo (código corto). Opcional.';


-- ---------------------------------------------------------------------------
-- 2. notification_sends
-- ---------------------------------------------------------------------------
-- Opción mínima elegida: user_id nullable + push_token_id nullable, con un
-- check de que haya uno de los dos. Alternativa descartada: no registrar nada
-- para anónimos y deduplicar "en memoria" (no sirve: el tope semanal de los
-- patrocinados y el "un aviso del equipo por día" necesitan memoria entre
-- corridas). Otra descartada: tabla aparte (más superficie: RLS, purga, tipos).

alter table public.notification_sends
  alter column user_id drop not null;

alter table public.notification_sends
  add column if not exists push_token_id uuid
    references public.push_tokens(id) on delete cascade;

alter table public.notification_sends
  drop constraint if exists notification_sends_destinatario_check;
alter table public.notification_sends
  add constraint notification_sends_destinatario_check
  check (user_id is not null or push_token_id is not null);

-- FK que no es la primera columna de la PK: índice para el advisor.
create index if not exists notification_sends_push_token_id_idx
  on public.notification_sends (push_token_id)
  where push_token_id is not null;

comment on column public.notification_sends.user_id is
  'Destinatario con cuenta. NULL en los envíos a dispositivos sin cuenta (R82), que llevan push_token_id.';
comment on column public.notification_sends.push_token_id is
  'R82: fila de push_tokens destinataria cuando no hay cuenta. ON DELETE CASCADE: si el token se borra (DeviceNotRegistered, cuenta eliminada, limpieza) se va con su historial. La dedupe_key de estos envíos usa este id donde las demás usan el user_id.';


-- ---------------------------------------------------------------------------
-- public.register_anon_push_token(p_token, p_device_id, p_platform, p_idioma)
-- ---------------------------------------------------------------------------
-- Alta/renovación de un dispositivo sin cuenta. SOLO service_role (la llama
-- POST /api/push/registrar con la service key). Devuelve true si la fila
-- quedó registrada/renovada y false si el token ya pertenece a OTRO
-- dispositivo (otro device_id): en ese caso no toca nada, para que conocer un
-- token no alcance para quedarse con su fila.
--
-- Nunca toca user_id: si el token ya está vinculado a una cuenta, solo
-- renueva last_seen_at/platform/idioma (y completa device_id si faltaba, que
-- es el caso de las filas creadas antes de la R82).
--
-- Tope por dispositivo: se conservan las 3 filas anónimas más recientes del
-- mismo device_id (un teléfono reinstalado cambia de token; los viejos se
-- limpian solos). No acota a quien rota device_id: eso lo frena el límite de
-- tasa de la API.
--
-- last_seen_at usa clock_timestamp() (no now()) para que el orden entre dos
-- altas dentro de una misma transacción sea el real (lo usa la poda y el test).

create or replace function public.register_anon_push_token(
  p_token text,
  p_device_id uuid,
  p_platform text,
  p_idioma text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_filas integer;
  v_idioma text;
begin
  if p_device_id is null then
    raise exception 'device_id no puede ser nulo' using errcode = '22023';
  end if;

  if p_platform is null or p_platform not in ('android', 'ios') then
    raise exception 'platform tiene que ser android o ios' using errcode = '22023';
  end if;

  -- Misma forma que acepta el envío (esTokenExpoValido): nada más entra.
  if p_token is null or length(p_token) > 200 or p_token !~ '^ExponentPushToken\[[^\]\s]+\]$' then
    raise exception 'token con formato inválido' using errcode = '22023';
  end if;

  -- Un idioma raro no tumba el alta: se guarda sin idioma.
  v_idioma := case when p_idioma ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$' then p_idioma else null end;

  insert into public.push_tokens as t (user_id, device_id, token, platform, idioma, created_at, last_seen_at)
  values (null, p_device_id, p_token, p_platform, v_idioma, clock_timestamp(), clock_timestamp())
  on conflict (token) do update
    set device_id = excluded.device_id,
        platform = excluded.platform,
        idioma = coalesce(excluded.idioma, t.idioma),
        last_seen_at = excluded.last_seen_at
    where t.device_id is null or t.device_id = excluded.device_id;

  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    return false;
  end if;

  -- Poda: de las filas anónimas de este dispositivo quedan las 3 más recientes.
  delete from public.push_tokens
  where user_id is null
    and device_id = p_device_id
    and id not in (
      select id from public.push_tokens
      where user_id is null and device_id = p_device_id
      order by last_seen_at desc, id
      limit 3
    );

  return true;
end;
$$;

revoke all on function public.register_anon_push_token(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.register_anon_push_token(text, uuid, text, text) to service_role;

comment on function public.register_anon_push_token(text, uuid, text, text) is
  'R82: alta/renovación de un dispositivo sin cuenta (upsert por token). SECURITY DEFINER, search_path vacío, EXECUTE solo service_role. Valida formato del token de Expo, platform e idioma. Devuelve false (sin tocar nada) si el token ya es de otro device_id. Nunca modifica user_id. Conserva las 3 filas anónimas más recientes por device_id.';


-- ---------------------------------------------------------------------------
-- public.set_push_preferences(p_token, p_device_id, p_avisos_equipo, p_avisos_patrocinados)
-- ---------------------------------------------------------------------------
-- Cambia los interruptores de una fila ANÓNIMA, solo si token y device_id
-- coinciden. Un parámetro nulo deja ese interruptor como está. Devuelve true
-- si cambió/encontró la fila y false si no coincide (token inexistente,
-- device_id distinto o fila ya vinculada a una cuenta): la API responde igual
-- en todos esos casos, para no revelar qué tokens existen.

create or replace function public.set_push_preferences(
  p_token text,
  p_device_id uuid,
  p_avisos_equipo boolean default null,
  p_avisos_patrocinados boolean default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_filas integer;
begin
  if p_token is null or p_device_id is null then
    return false;
  end if;

  update public.push_tokens
  set avisos_equipo = coalesce(p_avisos_equipo, avisos_equipo),
      avisos_patrocinados = coalesce(p_avisos_patrocinados, avisos_patrocinados),
      last_seen_at = clock_timestamp()
  where token = p_token
    and device_id = p_device_id
    and user_id is null;

  get diagnostics v_filas = row_count;
  return v_filas > 0;
end;
$$;

revoke all on function public.set_push_preferences(text, uuid, boolean, boolean) from public, anon, authenticated;
grant execute on function public.set_push_preferences(text, uuid, boolean, boolean) to service_role;

comment on function public.set_push_preferences(text, uuid, boolean, boolean) is
  'R82: cambia avisos_equipo / avisos_patrocinados de una fila anónima (user_id nulo) si token y device_id coinciden; un parámetro nulo no cambia ese interruptor. SECURITY DEFINER, search_path vacío, EXECUTE solo service_role. false si no coincide (la API no distingue los motivos).';


-- ---------------------------------------------------------------------------
-- public.unlink_push_token(p_token)
-- ---------------------------------------------------------------------------
-- Al cerrar sesión: la fila del teléfono NO se borra, queda anónima. Hace
-- falta una función porque authenticated no tiene UPDATE sobre push_tokens.
-- Solo desvincula filas del propio auth.uid().
--   * La fila conserva device_id, así que sigue recibiendo avisos.
--   * Los interruptores anónimos se copian de las preferencias de la cuenta
--     (announcements -> avisos_equipo, sponsored -> avisos_patrocinados; sin
--     fila de preferencias, ambos false): el teléfono sigue como la persona lo
--     dejó, y nunca se prende solo algo que no había prendido.
--   * Si la fila no tiene device_id (creada antes de la R82 y nunca renovada
--     por la API anónima), no puede quedar anónima (check): se borra, y la app
--     se vuelve a registrar como anónima al cerrar sesión.
-- Devuelve true si desvinculó o borró; false si el token no es de quien llama.

create or replace function public.unlink_push_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_device uuid;
begin
  -- Primera instrucción útil: sin sesión, 42501 (mismo código que RLS).
  if v_uid is null then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select device_id into v_device
  from public.push_tokens
  where token = p_token and user_id = v_uid
  for update;

  if not found then
    return false;
  end if;

  if v_device is null then
    delete from public.push_tokens where token = p_token and user_id = v_uid;
    return true;
  end if;

  update public.push_tokens
  set user_id = null,
      avisos_equipo = coalesce(
        (select np.announcements from public.notification_preferences np where np.user_id = v_uid), false),
      avisos_patrocinados = coalesce(
        (select np.sponsored from public.notification_preferences np where np.user_id = v_uid), false),
      last_seen_at = clock_timestamp()
  where token = p_token and user_id = v_uid;

  return true;
end;
$$;

revoke all on function public.unlink_push_token(text) from public, anon;
grant execute on function public.unlink_push_token(text) to authenticated;

comment on function public.unlink_push_token(text) is
  'R82: al cerrar sesión, deja anónima (user_id nulo) la fila de push_tokens de auth.uid() con ese token, copiando announcements/sponsored a avisos_equipo/avisos_patrocinados. Si la fila no tiene device_id la borra. SECURITY DEFINER, search_path vacío, EXECUTE solo authenticated; 42501 sin sesión. false si el token no es del que llama.';


-- ---------------------------------------------------------------------------
-- public.purge_push_tokens_anonimos(p_days)
-- ---------------------------------------------------------------------------
-- Una fila anónima no tiene cuenta que la limpie. Si el teléfono no se
-- renueva (la app registra en cada arranque) en p_days días, se borra; sus
-- notification_sends se van por cascada. Las filas con cuenta no se tocan.
-- Mínimo 30 días (un valor menor se sube a 30). Misma forma que
-- purge_notification_sends; la llamaría el proceso programado que ya limpia
-- envíos (job_runs), [COMPLETAR: decidir de día si se engancha a ese proceso].

create or replace function public.purge_push_tokens_anonimos(p_days integer default 180)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_borradas integer;
begin
  delete from public.push_tokens
  where user_id is null
    and last_seen_at < now() - make_interval(days => greatest(coalesce(p_days, 180), 30));

  get diagnostics v_borradas = row_count;
  return v_borradas;
end;
$$;

revoke all on function public.purge_push_tokens_anonimos(integer) from public, anon, authenticated;
grant execute on function public.purge_push_tokens_anonimos(integer) to service_role;

comment on function public.purge_push_tokens_anonimos(integer) is
  'R82: borra las filas anónimas (user_id nulo) de push_tokens sin renovar hace más de p_days días (default 180, mínimo 30) y devuelve cuántas borró. SECURITY DEFINER, search_path vacío, EXECUTE solo service_role.';
