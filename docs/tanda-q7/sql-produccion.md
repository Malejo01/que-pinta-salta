# SQL de producción de la tanda Q7 (para pegar en el editor de Supabase)

Mauro corre el SQL en el editor de Supabase (SQL Editor → New query), no con la CLI. La sesión de la nube **no aplica nada** en producción.

Resumen:
- **Migraciones:** ninguna en la Q7 (ningún ticket necesitó cambiar el esquema).
- **Consultas de solo lectura** para el diagnóstico de la geocodificación (Q7-2). Se pueden correr cuando sea.
- **Un bloque opcional de datos** (Q7-2, bloque B): que los 20 lugares ya intentados vuelvan a la cola con las consultas nuevas, sin esperar los 30 días.

---

## Q7-2 · A · Diagnóstico de la geocodificación (solo lectura)

### A1 · Historial de la corrida diaria
Si las filas son `SKIPPED` con `candidatos: 0`, la corrida no tenía a quién mirar (solo miraba lugares con eventos próximos, y esos ya estaban intentados). Si faltan días desde el 4/11, ese día el workflow no llegó al script (por ejemplo, sin los secrets: avisa y termina en verde).

```sql
select
  started_at at time zone 'America/Argentina/Salta' as cuando,
  status,
  trigger_source,
  items_processed,
  items_failed,
  details
from public.job_runs
where job_key = 'geocodificacion'
order by started_at desc
limit 30;
```

### A2 · Lugares sin coordenadas, por qué no avanzan
```sql
with eventos as (
  select coalesce(v.canonical_venue_id, v.id) as venue_id, count(*) as proximos
  from public.events e
  join public.venues v on v.id = e.venue_id
  where e.status = 'PUBLISHED' and e.start_date >= now()
  group by 1
)
select
  (ev.proximos is not null) as con_eventos_proximos,
  (v.geocode_intentado_at is not null) as intentado,
  (v.geocode_sugerencia_lat is not null) as con_sugerencia_pendiente,
  count(*) as lugares
from public.venues v
left join eventos ev on ev.venue_id = v.id
where v.latitude is null
  and v.canonical_venue_id is null
  and v.merged_at is null
  and not v.is_placeholder
group by 1, 2, 3
order by 1 desc, 2, 3;
```

### A3 · Sugerencias que esperan un clic en /admin/lugares
Mientras una sugerencia esté pendiente, la corrida diaria no vuelve a mirar ese lugar (decisión nº7 de la Q5-16).

```sql
select name, geocode_sugerencia_at at time zone 'America/Argentina/Salta' as sugerida, geocode_sugerencia_texto
from public.venues
where latitude is null
  and geocode_sugerencia_lat is not null
  and canonical_venue_id is null
  and merged_at is null
order by geocode_sugerencia_at;
```

### A4 · Cuántos eventos traen un link de Google Maps
```sql
select
  count(*) as eventos,
  count(*) filter (where ticket_url ~* '(google\.[a-z.]+/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl/maps)') as link_en_ticket_url,
  count(*) filter (where description ~* '(google\.[a-z.]+/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl/maps)') as link_en_descripcion,
  count(*) filter (where ticket_sources::text ~* '(google\.[a-z.]+/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl/maps)') as link_en_fuentes,
  count(*) filter (where coalesce(ticket_url, '') || coalesce(description, '') || coalesce(ticket_sources::text, '') ~* '(maps\.app\.goo\.gl|goo\.gl/maps)') as con_link_corto
from public.events
where status = 'PUBLISHED'
  and start_date >= now() - interval '180 days';
```

---

## Q7-2 · B · Opcional: reintentar ya los 20 lugares intentados sin éxito

Esos 20 se intentaron antes de la consulta nueva («nombre, Salta, Argentina» dentro de la ciudad). Sin este bloque vuelven solos a la cola a los 30 días de su intento. **No toca** coordenadas, sugerencias pendientes ni lugares cargados a mano: solo borra la fecha del intento. Correrlo después del merge de la Q7.

```sql
begin;
update public.venues
set geocode_intentado_at = null
where latitude is null
  and geocode_sugerencia_lat is null
  and geocode_intentado_at is not null
  and canonical_venue_id is null
  and merged_at is null
  and not is_placeholder;
-- Verificación (solo lectura): tiene que dar 0.
select count(*) as siguen_marcados
from public.venues
where latitude is null and geocode_sugerencia_lat is null and geocode_intentado_at is not null
  and canonical_venue_id is null and merged_at is null and not is_placeholder;
commit;
```
