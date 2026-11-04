# SQL de producción de la tanda Q6 (para pegar en el editor de Supabase)

Mauro corre el SQL en el editor de Supabase (SQL Editor → New query), no con la CLI. Cada bloque va **completo, en una sola corrida**: si algo falla, la transacción se revierte entera y no queda nada a medias.

Orden recomendado:
1. **Bloque A**: alinear el historial de las 5 migraciones de Q5. No cambia el esquema.
2. **Bloque B**: `q6_ia_llamadas` (PR #187). Después se mergea #187 y, detrás, #191.
3. **Bloque C**: `q6_revision_q5` (PR #186). Hay dos opciones:
   - **C1, completa:** cupo y permisos. Es la recomendada.
   - **C2, solo el cupo:** sin tocar permisos.

   Después se mergea #186.

Cada bloque termina con su consulta de verificación, de solo lectura.

> Alternativa a pegar el SQL: decirle al agente «aplicá B y C1». Con eso, él las aplica con el conector, que te va a pedir confirmar en el momento (lo que quedó sin respuesta el 3/11), y alinea el historial.

---

## A · Alinear `schema_migrations` de Q5

El conector guardó estas migraciones con la hora en que se aplicaron, no con el número del archivo. Este bloque solo corrige el número de versión, una fila por migración.

```sql
begin;
update supabase_migrations.schema_migrations set version = '20261103120000' where version = '20261103151713' and name = 'q5_lugares_permanentes';
update supabase_migrations.schema_migrations set version = '20261103130000' where version = '20261103153915' and name = 'q5_lugares_chicos_pedidos';
update supabase_migrations.schema_migrations set version = '20261103140000' where version = '20261103175555' and name = 'q5_aperturas_app';
update supabase_migrations.schema_migrations set version = '20261103150000' where version = '20261103181126' and name = 'q5_invalidar_traduccion';
update supabase_migrations.schema_migrations set version = '20261103160000' where version = '20261103182024' and name = 'q5_decisiones_q4';
commit;
```

Verificación (tienen que aparecer las 5, con los números del archivo):

```sql
select version, name from supabase_migrations.schema_migrations where name like 'q5_%' order by version;
-- 20261103120000 q5_lugares_permanentes
-- 20261103130000 q5_lugares_chicos_pedidos
-- 20261103140000 q5_aperturas_app
-- 20261103150000 q5_invalidar_traduccion
-- 20261103160000 q5_decisiones_q4
```

---

## B · `q6_ia_llamadas` (PR #187: capa de IA)

Es aditiva: una tabla, sus índices, RLS y una policy de lectura para los admins. El archivo es `supabase/migrations/20261104010000_q6_ia_llamadas.sql`. Al final se registra en el historial con el número del archivo.

```sql
begin;
-- Q6-3: registro de cada llamada a la IA (flyers, traducción, clasificación),
-- para ver consumo, latencia y errores por proveedor y modelo ahora que la
-- IA es intercambiable (Gemini por defecto, Claude listo; `apps/web/lib/ia`).
--
-- Qué se guarda por fila: para qué fue (`uso`), proveedor, modelo, tokens de
-- entrada y de salida, latencia y, si falló, el código de error normalizado.
-- Qué NO: ni el prompt, ni la respuesta, ni la imagen, ni la clave, ni nada
-- del evento o de una persona.
--
-- Escribe SOLO el servidor con service_role (best-effort: si el insert falla,
-- la llamada a la IA sigue igual). Leen los admins. Aditiva: una tabla, dos
-- índices y una policy.

create table if not exists public.ia_llamadas (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  uso text not null,
  proveedor text not null,
  modelo text not null,
  tokens_entrada integer null,
  tokens_salida integer null,
  latencia_ms integer not null,
  ok boolean not null,
  error_codigo text null,
  constraint ia_llamadas_uso_check check (uso ~ '^[a-z_]{1,40}$'),
  constraint ia_llamadas_proveedor_check check (proveedor in ('gemini', 'claude')),
  constraint ia_llamadas_modelo_check check (modelo ~ '^[A-Za-z0-9._-]{1,80}$'),
  constraint ia_llamadas_tokens_entrada_check check (tokens_entrada is null or tokens_entrada >= 0),
  constraint ia_llamadas_tokens_salida_check check (tokens_salida is null or tokens_salida >= 0),
  constraint ia_llamadas_latencia_check check (latencia_ms >= 0),
  constraint ia_llamadas_error_codigo_check check (
    error_codigo is null or error_codigo in (
      'sin_clave', 'no_autorizado', 'sin_credito', 'limite', 'timeout',
      'respuesta_invalida', 'solicitud_invalida', 'error_proveedor', 'red'
    )
  ),
  constraint ia_llamadas_ok_coherente_check check (ok = (error_codigo is null))
);

comment on table public.ia_llamadas is
  'Q6-3: una fila por llamada a la IA (uso, proveedor, modelo, tokens, latencia, código de error). Nunca guarda prompts, respuestas, imágenes, claves ni datos personales. Escribe solo service_role (apps/web/lib/ia/registro.ts); leen los admins.';

create index if not exists ia_llamadas_created_at_idx on public.ia_llamadas (created_at desc);
create index if not exists ia_llamadas_uso_created_at_idx on public.ia_llamadas (uso, created_at desc);

alter table public.ia_llamadas enable row level security;

drop policy if exists "lectura admin" on public.ia_llamadas;
create policy "lectura admin"
  on public.ia_llamadas for select
  to authenticated
  using ((select public.is_admin()));

revoke all on public.ia_llamadas from anon;
revoke all on public.ia_llamadas from authenticated;
grant select on public.ia_llamadas to authenticated;
grant all on public.ia_llamadas to service_role;

insert into supabase_migrations.schema_migrations (version, name) values ('20261104010000', 'q6_ia_llamadas');
commit;
```

Verificación:

```sql
select
  to_regclass('public.ia_llamadas') is not null as tabla,
  (select relrowsecurity from pg_class where oid = 'public.ia_llamadas'::regclass) as rls,
  (select count(*) from pg_policies where tablename = 'ia_llamadas') as policies,
  has_table_privilege('anon', 'public.ia_llamadas', 'select') as anon_lee,
  (select version from supabase_migrations.schema_migrations where name = 'q6_ia_llamadas') as version;
-- Esperado: true, true, 1, false, 20261104010000
```

---

## C1 · `q6_revision_q5` completa (PR #186: revisión de Q5) — recomendada

Tiene dos partes:
1. **Permisos.** Ninguna persona con sesión (`authenticated`) puede leer `cargado_por` ni `verificado_por` de `lugares_permanentes`: antes cualquier persona con sesión podía sacar los uuid de los admins. Además, quien no tiene sesión (`anon`) no puede leer las notas internas `fuente_detalle` y `motivo_archivo`. Revisé que ningún código de la web ni de la app lea esas columnas con esos roles. No borra datos.
2. **Cupo diario** del formulario «Sumá un lugar para chicos». Es aditivo.

El archivo es `supabase/migrations/20261104020000_q6_revision_q5.sql`.

```sql
begin;
-- Q6-7 · Revisión del diff de la Q5 (#166). Dos arreglos de base:
--
-- 1. lugares_permanentes: SELECT por columnas también para `authenticated`.
--    La Q5-1 dejó a `authenticated` con SELECT de la tabla entera («la policy
--    solo le deja ver publicados»), pero la policy filtra FILAS, no columnas:
--    cualquier persona con sesión podía pedir por PostgREST
--    `select=cargado_por,verificado_por` de las fichas publicadas y llevarse
--    el uuid de los admins que las cargaron y verificaron (la decisión 8 dice
--    que esas dos columnas no se exponen). Ahora `authenticated` lee todas las
--    columnas MENOS esas dos. El admin no las lee desde la sesión (el panel
--    no las muestra) y las sigue escribiendo: INSERT / UPDATE quedan como
--    estaban (de toda la tabla). delete_my_account es SECURITY DEFINER.
--    Además, `anon` deja de leer `fuente_detalle` y `motivo_archivo`: notas
--    internas del equipo («llamado del 3/11», el motivo de archivo) que
--    ninguna pantalla pública usa (COLUMNAS_PUBLICAS_LUGAR no las pide).
--
-- 2. «Sumá un lugar para chicos»: un cupo por día EN LA BASE, además del
--    límite en memoria por instancia (que en Vercel se multiplica por la
--    cantidad de instancias y se pierde en cada arranque en frío). La server
--    action llama a `tomar_cupo_pedido_lugar_chicos(clave)` antes de guardar
--    el pedido: hasta 10 por día por clave y 100 por día en total. La clave es
--    un HMAC-SHA256 de la IP con el día de Salta, calculado en el servidor con
--    un secreto que la base no tiene: acá nunca llega la IP, y la clave de un
--    día no sirve para seguir a nadie al siguiente. Las filas de más de 2 días
--    se borran en cada llamada.
--
-- Aditiva salvo el ajuste de privilegios del punto 1 (que solo QUITA lectura
-- de columnas que ningún código lee con esos roles). Para volver atrás:
-- `grant select on public.lugares_permanentes to authenticated;`.

-- ---------------------------------------------------------------------------
-- 1. lugares_permanentes: privilegios de lectura por columna
-- ---------------------------------------------------------------------------

revoke select on public.lugares_permanentes from authenticated;
grant select (
  id, venue_id, tipo, estado, descripcion_corta, edad_min, edad_max, horarios,
  acceso, nota_precio, techado, tiene_rampa, tiene_bano_adaptado, tiene_cambiador,
  contacto_telefono, contacto_web, contacto_instagram, fuente, fuente_detalle,
  osm_ref, verificado_at, motivo_archivo, created_at, updated_at
) on public.lugares_permanentes to authenticated;

revoke select (fuente_detalle, motivo_archivo) on public.lugares_permanentes from anon;

comment on table public.lugares_permanentes is
  'Q5-1: lugares permanentes para chicos (peloteros, salones de juegos, plazas con juegos, espacios culturales infantiles), 1 a 1 con un venue canónico. Carga del equipo (admin) o importador OSM como borrador; nada se publica sin verificación. anon lee solo publicados y sin cargado_por / verificado_por / fuente_detalle / motivo_archivo; authenticated (Q6-7), sin cargado_por / verificado_por.';

-- ---------------------------------------------------------------------------
-- 2. Cupo diario de pedidos del formulario público
-- ---------------------------------------------------------------------------

create table if not exists public.lugares_chicos_pedidos_cupos (
  dia date not null,
  clave text not null,
  cantidad integer not null default 1,
  constraint lugares_chicos_pedidos_cupos_pkey primary key (dia, clave),
  -- '*' es el contador del día entero; el resto, HMAC-SHA256 en hex.
  constraint lugares_chicos_pedidos_cupos_clave_check check (clave = '*' or clave ~ '^[0-9a-f]{64}$'),
  constraint lugares_chicos_pedidos_cupos_cantidad_check check (cantidad >= 1)
);

comment on table public.lugares_chicos_pedidos_cupos is
  'Q6-7: cuántos pedidos de «Sumá un lugar para chicos» llegaron hoy por clave (HMAC de la IP con el día, calculado en el servidor: nunca la IP) y en total (clave *). La escribe solo tomar_cupo_pedido_lugar_chicos; se borra a los 2 días. Nadie la lee desde el cliente.';

alter table public.lugares_chicos_pedidos_cupos enable row level security;
-- Sin policies: ni anon ni authenticated la tocan.
revoke all on public.lugares_chicos_pedidos_cupos from anon;
revoke all on public.lugares_chicos_pedidos_cupos from authenticated;
grant all on public.lugares_chicos_pedidos_cupos to service_role;

create or replace function public.tomar_cupo_pedido_lugar_chicos(
  p_clave text,
  p_max_por_clave integer default 10,
  p_max_por_dia integer default 100
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dia date := (now() at time zone 'America/Argentina/Salta')::date;
  v_cantidad integer;
begin
  if p_clave is null or p_clave !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  -- Lo de anteayer para atrás ya no sirve (la tabla queda chica).
  delete from public.lugares_chicos_pedidos_cupos where dia < v_dia - 2;

  insert into public.lugares_chicos_pedidos_cupos as c (dia, clave, cantidad)
  values (v_dia, p_clave, 1)
  on conflict (dia, clave) do update set cantidad = least(c.cantidad + 1, 1000000)
  returning c.cantidad into v_cantidad;
  -- Pasado el cupo de la clave, ni siquiera suma al total del día: un solo
  -- origen no puede gastar el cupo de todos.
  if v_cantidad > coalesce(p_max_por_clave, 10) then
    return false;
  end if;

  insert into public.lugares_chicos_pedidos_cupos as c (dia, clave, cantidad)
  values (v_dia, '*', 1)
  on conflict (dia, clave) do update set cantidad = least(c.cantidad + 1, 1000000)
  returning c.cantidad into v_cantidad;
  return v_cantidad <= coalesce(p_max_por_dia, 100);
end;
$$;

revoke all on function public.tomar_cupo_pedido_lugar_chicos(text, integer, integer) from public, anon, authenticated;
grant execute on function public.tomar_cupo_pedido_lugar_chicos(text, integer, integer) to service_role;

comment on function public.tomar_cupo_pedido_lugar_chicos(text, integer, integer) is
  'Q6-7: suma un pedido de «Sumá un lugar para chicos» al cupo del día (hora de Salta) de p_clave (HMAC-SHA256 hex de la IP con el día) y al total del día. true si los dos siguen dentro del tope (10 por clave, 100 en total por defecto). Clave con otra forma: false. Borra las filas de más de 2 días. SECURITY DEFINER, search_path vacío, EXECUTE solo service_role.';

insert into supabase_migrations.schema_migrations (version, name) values ('20261104020000', 'q6_revision_q5');
commit;
```

**Para deshacer la parte 1**, si algo del panel deja de andar:

```sql
grant select on public.lugares_permanentes to authenticated;
grant select (fuente_detalle, motivo_archivo) on public.lugares_permanentes to anon;
```

## C2 · Solo el cupo, sin tocar permisos

Si preferís no tocar permisos ahora, corré esto en lugar de C1. El código de #186 funciona igual: lo que cambia es que la fuga de la parte 1 sigue abierta.

```sql
begin;
-- Q6-7 · Revisión del diff de la Q5 (#166). Dos arreglos de base:
--
-- 1. lugares_permanentes: SELECT por columnas también para `authenticated`.
--    La Q5-1 dejó a `authenticated` con SELECT de la tabla entera («la policy
--    solo le deja ver publicados»), pero la policy filtra FILAS, no columnas:
--    cualquier persona con sesión podía pedir por PostgREST
--    `select=cargado_por,verificado_por` de las fichas publicadas y llevarse
--    el uuid de los admins que las cargaron y verificaron (la decisión 8 dice
--    que esas dos columnas no se exponen). Ahora `authenticated` lee todas las
--    columnas MENOS esas dos. El admin no las lee desde la sesión (el panel
--    no las muestra) y las sigue escribiendo: INSERT / UPDATE quedan como
--    estaban (de toda la tabla). delete_my_account es SECURITY DEFINER.
--    Además, `anon` deja de leer `fuente_detalle` y `motivo_archivo`: notas
--    internas del equipo («llamado del 3/11», el motivo de archivo) que
--    ninguna pantalla pública usa (COLUMNAS_PUBLICAS_LUGAR no las pide).
--
-- 2. «Sumá un lugar para chicos»: un cupo por día EN LA BASE, además del
--    límite en memoria por instancia (que en Vercel se multiplica por la
--    cantidad de instancias y se pierde en cada arranque en frío). La server
--    action llama a `tomar_cupo_pedido_lugar_chicos(clave)` antes de guardar
--    el pedido: hasta 10 por día por clave y 100 por día en total. La clave es
--    un HMAC-SHA256 de la IP con el día de Salta, calculado en el servidor con
--    un secreto que la base no tiene: acá nunca llega la IP, y la clave de un
--    día no sirve para seguir a nadie al siguiente. Las filas de más de 2 días
--    se borran en cada llamada.
--
-- Aditiva salvo el ajuste de privilegios del punto 1 (que solo QUITA lectura
-- de columnas que ningún código lee con esos roles). Para volver atrás:
-- `grant select on public.lugares_permanentes to authenticated;`.

-- ---------------------------------------------------------------------------
-- 2. Cupo diario de pedidos del formulario público
-- ---------------------------------------------------------------------------

create table if not exists public.lugares_chicos_pedidos_cupos (
  dia date not null,
  clave text not null,
  cantidad integer not null default 1,
  constraint lugares_chicos_pedidos_cupos_pkey primary key (dia, clave),
  -- '*' es el contador del día entero; el resto, HMAC-SHA256 en hex.
  constraint lugares_chicos_pedidos_cupos_clave_check check (clave = '*' or clave ~ '^[0-9a-f]{64}$'),
  constraint lugares_chicos_pedidos_cupos_cantidad_check check (cantidad >= 1)
);

comment on table public.lugares_chicos_pedidos_cupos is
  'Q6-7: cuántos pedidos de «Sumá un lugar para chicos» llegaron hoy por clave (HMAC de la IP con el día, calculado en el servidor: nunca la IP) y en total (clave *). La escribe solo tomar_cupo_pedido_lugar_chicos; se borra a los 2 días. Nadie la lee desde el cliente.';

alter table public.lugares_chicos_pedidos_cupos enable row level security;
-- Sin policies: ni anon ni authenticated la tocan.
revoke all on public.lugares_chicos_pedidos_cupos from anon;
revoke all on public.lugares_chicos_pedidos_cupos from authenticated;
grant all on public.lugares_chicos_pedidos_cupos to service_role;

create or replace function public.tomar_cupo_pedido_lugar_chicos(
  p_clave text,
  p_max_por_clave integer default 10,
  p_max_por_dia integer default 100
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dia date := (now() at time zone 'America/Argentina/Salta')::date;
  v_cantidad integer;
begin
  if p_clave is null or p_clave !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  -- Lo de anteayer para atrás ya no sirve (la tabla queda chica).
  delete from public.lugares_chicos_pedidos_cupos where dia < v_dia - 2;

  insert into public.lugares_chicos_pedidos_cupos as c (dia, clave, cantidad)
  values (v_dia, p_clave, 1)
  on conflict (dia, clave) do update set cantidad = least(c.cantidad + 1, 1000000)
  returning c.cantidad into v_cantidad;
  -- Pasado el cupo de la clave, ni siquiera suma al total del día: un solo
  -- origen no puede gastar el cupo de todos.
  if v_cantidad > coalesce(p_max_por_clave, 10) then
    return false;
  end if;

  insert into public.lugares_chicos_pedidos_cupos as c (dia, clave, cantidad)
  values (v_dia, '*', 1)
  on conflict (dia, clave) do update set cantidad = least(c.cantidad + 1, 1000000)
  returning c.cantidad into v_cantidad;
  return v_cantidad <= coalesce(p_max_por_dia, 100);
end;
$$;

revoke all on function public.tomar_cupo_pedido_lugar_chicos(text, integer, integer) from public, anon, authenticated;
grant execute on function public.tomar_cupo_pedido_lugar_chicos(text, integer, integer) to service_role;

comment on function public.tomar_cupo_pedido_lugar_chicos(text, integer, integer) is
  'Q6-7: suma un pedido de «Sumá un lugar para chicos» al cupo del día (hora de Salta) de p_clave (HMAC-SHA256 hex de la IP con el día) y al total del día. true si los dos siguen dentro del tope (10 por clave, 100 en total por defecto). Clave con otra forma: false. Borra las filas de más de 2 días. SECURITY DEFINER, search_path vacío, EXECUTE solo service_role.';

insert into supabase_migrations.schema_migrations (version, name) values ('20261104020000', 'q6_revision_q5');
commit;
```

Más adelante podés cerrar la fuga con la parte 1 sola:

```sql
-- ---------------------------------------------------------------------------
-- 1. lugares_permanentes: privilegios de lectura por columna
-- ---------------------------------------------------------------------------

revoke select on public.lugares_permanentes from authenticated;
grant select (
  id, venue_id, tipo, estado, descripcion_corta, edad_min, edad_max, horarios,
  acceso, nota_precio, techado, tiene_rampa, tiene_bano_adaptado, tiene_cambiador,
  contacto_telefono, contacto_web, contacto_instagram, fuente, fuente_detalle,
  osm_ref, verificado_at, motivo_archivo, created_at, updated_at
) on public.lugares_permanentes to authenticated;

revoke select (fuente_detalle, motivo_archivo) on public.lugares_permanentes from anon;

comment on table public.lugares_permanentes is
  'Q5-1: lugares permanentes para chicos (peloteros, salones de juegos, plazas con juegos, espacios culturales infantiles), 1 a 1 con un venue canónico. Carga del equipo (admin) o importador OSM como borrador; nada se publica sin verificación. anon lee solo publicados y sin cargado_por / verificado_por / fuente_detalle / motivo_archivo; authenticated (Q6-7), sin cargado_por / verificado_por.';
```

Verificación (C1 o C2):

```sql
select
  to_regclass('public.lugares_chicos_pedidos_cupos') is not null as tabla_cupos,
  has_function_privilege('anon', 'public.tomar_cupo_pedido_lugar_chicos(text,integer,integer)', 'execute') as anon_ejecuta,
  has_function_privilege('service_role', 'public.tomar_cupo_pedido_lugar_chicos(text,integer,integer)', 'execute') as service_ejecuta,
  has_column_privilege('authenticated', 'public.lugares_permanentes', 'cargado_por', 'select') as auth_lee_cargado_por,
  has_column_privilege('authenticated', 'public.lugares_permanentes', 'descripcion_corta', 'select') as auth_lee_publicas,
  has_column_privilege('anon', 'public.lugares_permanentes', 'fuente_detalle', 'select') as anon_lee_fuente_detalle,
  (select version from supabase_migrations.schema_migrations where name = 'q6_revision_q5') as version;
-- C1 esperado: true, false, true, false, true, false, 20261104020000
-- C2 esperado: true, false, true, true,  true, true,  20261104020000
```
