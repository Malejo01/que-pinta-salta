-- ============================================================================
-- Reglas de usuario en la base (Ronda 15, auditoría 4.1, 4.2 y 4.3)
-- ============================================================================
--
-- Objetivo: que la futura app móvil, que va a hablar directo con Supabase sin
-- pasar por las server actions de Next, no pueda saltearse ninguna regla que
-- hoy solo aplica el servidor. Se mueven tres reglas de lib/actions.ts a
-- triggers de base:
--
--   4.1 events:   un usuario sin rol de admin no publica, no destaca y no
--                 toca las columnas de la ingesta; editar un evento (aunque
--                 esté PUBLISHED) lo devuelve a DRAFT.
--   4.2 profiles:  role = 'USER' forzado en el INSERT (hoy el trigger de rol,
--                 tr_prevent_role_tampering, solo cubre el UPDATE).
--   4.3 user_radar_settings: email_target queda limitado al email de la
--                 cuenta (auth.users.email), no a uno arbitrario.
--
-- Alcance
-- --------------------------------------------------------------------------
-- Las reglas valen solo para authenticated/anon que no sean admin. Fuera de
-- ese alcance quedan sin cambios:
--   - service_role: los crons (scrape, recurrentes, radar-newsletter, IA) y
--     los webhooks de Apify necesitan poder publicar, destacar y escribir las
--     columnas de ingesta directamente.
--   - postgres: migraciones, el SQL Editor y handle_new_user() (que corre
--     SECURITY DEFINER y hoy inserta profiles sin pasar por authenticated).
--   - un ADMIN autenticado: is_admin() ya lo autoriza vía RLS; estas reglas
--     no le agregan ni le sacan nada.
-- Si esta condición queda mal escrita, el síntoma es inmediato y grave: los
-- scrapers (service_role) empezarían a crear borradores en vez de eventos
-- publicados.
--
-- enforce_event_user_rules() y force_user_role_on_insert() son SECURITY
-- INVOKER (la segunda por default, sin la palabra clave), así que ahí
-- `current_user` es el rol que disparó el trigger: es la forma correcta y
-- más difícil de falsear, y se repite igual en las dos.
--
-- enforce_radar_email_target() es distinta: es SECURITY DEFINER (necesita
-- leer auth.users) y en una función SECURITY DEFINER `current_user` pasa a
-- ser el dueño de la función (postgres), no el rol que la disparó. Por eso
-- ahí el alcance se resuelve con el rol del JWT (auth.role()), con
-- `current_user` solo como respaldo; el porqué está en el comentario de esa
-- función.
--
-- Idempotente: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS antes de
-- cada CREATE TRIGGER. No se aplica en producción con esta migración: la
-- aplica Mauro de día.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. events (auditoría 4.1)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_event_user_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  -- Alcance: ver cabecera de la migración. service_role y postgres pasan sin
  -- cambios; un admin autenticado también (ya lo cubre RLS vía is_admin()).
  IF current_user NOT IN ('authenticated', 'anon') OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'DRAFT'::public.event_status;
    NEW.is_featured := false;
    NEW.created_by := auth.uid();
    NEW.view_count := 0;
    -- Columnas de la ingesta: valores por defecto de la tabla (baseline y
    -- 20261002193000_event_dedup.sql), nunca los que mande el cliente.
    NEW.ai_metadata := NULL;
    NEW.ticket_sources := '[]'::jsonb;
    NEW.dedup_key := NULL;
    NEW.merge_audit := '[]'::jsonb;
    NEW.scrape_source_key := NULL;
    NEW.classification_source := NULL;
    NEW.is_commercial := false;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Editar un evento (publicado o no) lo devuelve a DRAFT, igual que hace
    -- hoy updateUserEvent() a mano. El resto de las columnas de arriba
    -- conserva el valor de OLD: el dueño no puede destacarse, reasignarse el
    -- evento ni tocar los datos de la ingesta.
    NEW.status := 'DRAFT'::public.event_status;
    NEW.is_featured := OLD.is_featured;
    NEW.created_by := OLD.created_by;
    NEW.view_count := OLD.view_count;
    NEW.ai_metadata := OLD.ai_metadata;
    NEW.ticket_sources := OLD.ticket_sources;
    NEW.dedup_key := OLD.dedup_key;
    NEW.merge_audit := OLD.merge_audit;
    NEW.scrape_source_key := OLD.scrape_source_key;
    NEW.classification_source := OLD.classification_source;
    NEW.is_commercial := OLD.is_commercial;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_event_user_rules() IS
  'Auditoría 4.1: un usuario (authenticated/anon, no admin) no publica, no destaca y no toca las columnas de ingesta de events; editar devuelve el evento a DRAFT. service_role y postgres no están alcanzados.';

DROP TRIGGER IF EXISTS tr_enforce_event_user_rules ON public.events;
CREATE TRIGGER tr_enforce_event_user_rules
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_user_rules();


-- ---------------------------------------------------------------------------
-- 2. profiles (auditoría 4.2)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.force_user_role_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Alcance: ver cabecera de la migración.
  IF current_user NOT IN ('authenticated', 'anon') OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  NEW.role := 'USER'::public.user_role;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.force_user_role_on_insert() IS
  'Auditoría 4.2: role = USER forzado en el INSERT de profiles para authenticated/anon no admin. tr_prevent_role_tampering (UPDATE) no cambia.';

DROP TRIGGER IF EXISTS tr_force_user_role_on_insert ON public.profiles;
CREATE TRIGGER tr_force_user_role_on_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.force_user_role_on_insert();


-- ---------------------------------------------------------------------------
-- 3. user_radar_settings (auditoría 4.3)
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER porque necesita leer auth.users, a la que authenticated y
-- anon no tienen acceso directo. No recibe parámetros que vengan del cliente:
-- solo usa NEW.user_id, que RLS ya ata a auth.uid() ("Allow radar settings
-- management for owner"). Se le revoca EXECUTE a public, anon y
-- authenticated, igual que a handle_new_user() en el baseline: nadie puede
-- invocarla por RPC, solo corre como trigger.

CREATE OR REPLACE FUNCTION public.enforce_radar_email_target()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text;
BEGIN
  -- Alcance: esta función es SECURITY DEFINER (abajo, para leer auth.users).
  -- Dentro de una función SECURITY DEFINER, `current_user` deja de ser el
  -- rol que disparó el trigger y pasa a ser el dueño de la función
  -- (postgres, porque la crea esta migración). Si acá se usara
  -- `current_user NOT IN ('authenticated', 'anon')` como en las otras dos
  -- funciones, la condición sería siempre verdadera sin importar quién
  -- escribe, la regla nunca se aplicaría y email_target quedaría abierto a
  -- cualquier valor para usuarios reales: exactamente el agujero que la
  -- auditoría 4.3 quiere cerrar. Por eso el alcance se resuelve con el rol
  -- del JWT (auth.role(), que lee un GUC de sesión y no cambia al entrar en
  -- un contexto DEFINER), y `current_user` queda solo como respaldo para
  -- cuando no hay JWT (postgres: migraciones, SQL Editor, el UPDATE del
  -- punto 4 de esta misma migración).
  v_role := coalesce(auth.role(), current_user::text);
  IF v_role NOT IN ('authenticated', 'anon') OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Chequeo uniforme ANTES de consultar auth.users. Este trigger corre antes
  -- del WITH CHECK de RLS, así que si consultara auth.users con un user_id
  -- ajeno, el error distinguiría "esa cuenta existe" (lo rechaza RLS después)
  -- de "no existe" (no hay email): un oráculo de existencia de cuentas.
  -- Con user_id distinto del de la sesión, el error es siempre el mismo, y es
  -- el mismo que da RLS (SQLSTATE 42501 y su mensaje), exista o no la cuenta.
  -- service_role (cron del Radar y baja) ya salió arriba: este chequeo no lo
  -- alcanza (pgTAP, caso 14).
  IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'new row violates row-level security policy for table "user_radar_settings"'
      USING ERRCODE = '42501';
  END IF;

  SELECT u.email INTO NEW.email_target
  FROM auth.users u
  WHERE u.id = auth.uid();

  -- Fallar cerrado, con el mismo error genérico: la cuenta de la sesión
  -- siempre tendría que existir; si no (por ejemplo, borrada con un JWT
  -- todavía vigente), no se guarda un email_target en NULL.
  IF NEW.email_target IS NULL THEN
    RAISE EXCEPTION 'new row violates row-level security policy for table "user_radar_settings"'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.last_sent_at := NULL;
  ELSE
    NEW.last_sent_at := OLD.last_sent_at;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_radar_email_target() IS
  'Auditoría 4.3: email_target queda limitado al email de la cuenta (auth.users.email de NEW.user_id) para authenticated/anon no admin; last_sent_at conserva OLD en el UPDATE y es null en el INSERT. Alcance resuelto por auth.role() (JWT), con current_user como respaldo, porque dentro de esta función SECURITY DEFINER current_user es el dueño (postgres), no el invocador. Con user_id distinto de auth.uid(), o sin email resoluble, lanza el mismo error que RLS (42501), exista o no la cuenta: no revela si un user_id existe. service_role y postgres quedan fuera del alcance antes de ese chequeo. EXECUTE revocado a public/anon/authenticated.';

REVOKE EXECUTE ON FUNCTION public.enforce_radar_email_target() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS tr_enforce_radar_email_target ON public.user_radar_settings;
CREATE TRIGGER tr_enforce_radar_email_target
  BEFORE INSERT OR UPDATE ON public.user_radar_settings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_radar_email_target();


-- ---------------------------------------------------------------------------
-- 4. Datos: alinear las filas existentes de user_radar_settings
-- ---------------------------------------------------------------------------
-- Corre como postgres (la migración), fuera del alcance del trigger de
-- arriba, así que hace falta fijar el valor correcto a mano acá.

UPDATE public.user_radar_settings s
SET email_target = u.email
FROM auth.users u
WHERE u.id = s.user_id
  AND s.email_target IS DISTINCT FROM u.email;
