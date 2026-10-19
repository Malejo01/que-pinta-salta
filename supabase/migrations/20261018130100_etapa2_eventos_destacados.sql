-- Etapa 2 (contrato de esquema de las rondas R48 a R57): destacados con
-- vencimiento.
--
--   * events.featured_until: hasta cuándo está destacado. Vence solo: quien
--     lee compara contra now() (featured_until > now()); no hay cron.
--   * events.featured_set_by / featured_set_at: quién lo destacó y cuándo
--     (auditoría del panel). featured_set_by va a auth.users con
--     on delete set null.
--   * Índice parcial en featured_until (where featured_until is not null).
--
-- is_featured (boolean, de antes) NO se toca ni se migra: sigue existiendo y
-- lo siguen usando merge_events/unmerge_event, idx_events_featured y
-- record_event_metric. Sin backfill: los is_featured = true de hoy quedan con
-- featured_until null. Qué hacer con ellos lo decide la ronda que cambia la
-- interfaz (R50).
--
-- La escritura de events NO es solo admin: el dueño de un evento puede
-- insertarlo y editarlo (policies "inserción del dueño o admin" y
-- "actualización del dueño o admin"). Lo que el dueño no puede tocar lo
-- fuerza el trigger tr_enforce_event_user_rules
-- (20261009120000_reglas_app.sql). Por eso esta migración lo reemplaza con el
-- mismo cuerpo más las tres columnas nuevas: al insertar quedan en null y al
-- editar conservan el valor de OLD, igual que is_featured. Sin esto, un dueño
-- se destacaría solo por la API.
--
-- Idempotente (add column if not exists, create index if not exists, create
-- or replace function). Cambia el esquema: npm run db:types en el mismo commit.

alter table public.events
  add column if not exists featured_until timestamptz null,
  add column if not exists featured_set_by uuid null references auth.users(id) on delete set null,
  add column if not exists featured_set_at timestamptz null;

create index if not exists events_featured_until_idx
  on public.events (featured_until)
  where featured_until is not null;

-- Índice de la FK, para el advisor (y para el set null al borrar un usuario).
create index if not exists events_featured_set_by_idx
  on public.events (featured_set_by)
  where featured_set_by is not null;

comment on column public.events.featured_until is
  'Etapa 2: destacado hasta esta fecha. Vence solo: se compara contra now() al leer (featured_until > now()), sin cron. Null = sin destacado con vencimiento.';
comment on column public.events.featured_set_by is
  'Etapa 2: quién lo destacó (admin). FK a auth.users on delete set null.';
comment on column public.events.featured_set_at is
  'Etapa 2: cuándo se lo destacó.';


-- ---------------------------------------------------------------------------
-- enforce_event_user_rules(): el cuerpo de 20261009120000_reglas_app.sql sin
-- cambios, más featured_until, featured_set_by y featured_set_at.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_event_user_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  -- Alcance: ver cabecera de 20261009120000_reglas_app.sql. service_role y
  -- postgres pasan sin cambios; un admin autenticado también (ya lo cubre
  -- RLS vía is_admin()).
  IF current_user NOT IN ('authenticated', 'anon') OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'DRAFT'::public.event_status;
    NEW.is_featured := false;
    NEW.featured_until := NULL;
    NEW.featured_set_by := NULL;
    NEW.featured_set_at := NULL;
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
    NEW.featured_until := OLD.featured_until;
    NEW.featured_set_by := OLD.featured_set_by;
    NEW.featured_set_at := OLD.featured_set_at;
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
  'Auditoría 4.1 + etapa 2: un usuario (authenticated/anon, no admin) no publica, no destaca (is_featured, featured_until, featured_set_by, featured_set_at) y no toca las columnas de ingesta de events; editar devuelve el evento a DRAFT. service_role y postgres no están alcanzados.';
