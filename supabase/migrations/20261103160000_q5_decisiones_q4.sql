-- ============================================================================
-- Q5-16 · Decisiones de Mauro sobre la Q4 (docs/tanda-q5/README.md).
-- ============================================================================
--
-- nº2: las bajas de patrocinados de los teléfonos SIN cuenta también cuentan
-- en sponsored_campaigns.bajas_48h. Para saber CUÁNDO se apagó el interruptor
-- (la ventana es de 48 h desde el envío) hace falta una marca propia:
-- push_tokens.updated_at no sirve porque la toca cualquier renovación, y
-- unlink_push_token (cerrar sesión) también pone avisos_patrocinados en false
-- sin que la persona lo haya apagado. La marca la pone SOLO
-- set_push_preferences, y solo cuando el interruptor pasa de true a false.
--
-- nº7: la geocodificación guarda la mejor sugerencia de Nominatim cuando no
-- hay un match seguro («para revisar»), para que un admin la confirme desde
-- /admin/lugares con un botón. Un lugar con sugerencia pendiente ya no se
-- vuelve a consultar a los 30 días: espera a que alguien la confirme o la
-- descarte.
--
-- Aditiva y compatible hacia atrás: columnas NULL, un check sobre columnas
-- nuevas y un CREATE OR REPLACE de set_push_preferences (misma firma, mismos
-- privilegios, misma respuesta).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- nº2 · push_tokens.avisos_patrocinados_baja_at
-- ---------------------------------------------------------------------------

alter table public.push_tokens
  add column if not exists avisos_patrocinados_baja_at timestamptz null;

comment on column public.push_tokens.avisos_patrocinados_baja_at is
  'Q5-16: cuándo la persona apagó los avisos patrocinados de este teléfono sin cuenta (true -> false por set_push_preferences). Cerrar sesión no la marca. La usa la medición de bajas_48h; solo se cuentan cantidades.';

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

  -- En el SET, `avisos_patrocinados` es el valor ANTERIOR de la fila.
  update public.push_tokens
  set avisos_equipo = coalesce(p_avisos_equipo, avisos_equipo),
      avisos_patrocinados = coalesce(p_avisos_patrocinados, avisos_patrocinados),
      avisos_patrocinados_baja_at = case
        when p_avisos_patrocinados is false and avisos_patrocinados then clock_timestamp()
        else avisos_patrocinados_baja_at
      end,
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
  'R82: cambia avisos_equipo / avisos_patrocinados de una fila anónima (user_id nulo) si token y device_id coinciden; un parámetro nulo no cambia ese interruptor. Q5-16: al apagar los patrocinados (true -> false) marca avisos_patrocinados_baja_at. SECURITY DEFINER, search_path vacío, EXECUTE solo service_role. false si no coincide (la API no distingue los motivos).';


-- ---------------------------------------------------------------------------
-- nº7 · venues: la sugerencia de Nominatim para revisar
-- ---------------------------------------------------------------------------

alter table public.venues
  add column if not exists geocode_sugerencia_lat numeric(10,8) null,
  add column if not exists geocode_sugerencia_lng numeric(11,8) null,
  add column if not exists geocode_sugerencia_texto text null,
  add column if not exists geocode_sugerencia_at timestamptz null;

alter table public.venues
  drop constraint if exists venues_geocode_sugerencia_check;
alter table public.venues
  add constraint venues_geocode_sugerencia_check check (
    (geocode_sugerencia_lat is null) = (geocode_sugerencia_lng is null)
    and (geocode_sugerencia_lat is null) = (geocode_sugerencia_at is null)
    and (geocode_sugerencia_lat is null or (geocode_sugerencia_lat between -90 and 90 and geocode_sugerencia_lng between -180 and 180))
    and (geocode_sugerencia_texto is null or char_length(geocode_sugerencia_texto) <= 300)
  );

create index if not exists venues_geocode_sugerencia_idx
  on public.venues (geocode_sugerencia_at)
  where geocode_sugerencia_lat is not null;

comment on column public.venues.geocode_sugerencia_lat is
  'Q5-16: latitud de la mejor sugerencia de Nominatim cuando no hubo un match seguro. La confirma (o descarta) un admin en /admin/lugares; mientras esté, la corrida programada no vuelve a consultar el lugar.';
comment on column public.venues.geocode_sugerencia_lng is
  'Q5-16: longitud de la sugerencia (va junto con geocode_sugerencia_lat).';
comment on column public.venues.geocode_sugerencia_texto is
  'Q5-16: la dirección que devolvió Nominatim para la sugerencia (display_name, hasta 300 caracteres). Datos © colaboradores de OpenStreetMap (ODbL).';
comment on column public.venues.geocode_sugerencia_at is
  'Q5-16: cuándo se guardó la sugerencia.';
