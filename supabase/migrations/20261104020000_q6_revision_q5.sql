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
