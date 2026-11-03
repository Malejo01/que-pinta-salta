# Auditoría de fuentes · noviembre 2026 (Q5-7)

Hecha el **martes 3/11/2026** con consultas **de solo lectura** a producción (conector de Supabase), sobre `events`, `job_runs`, `venues`, `instagram_accounts`, `instagram_flyers` y `venue_review_queue`. Las consultas están al final para repetirlas. Ventanas:
- **30 d**: eventos cargados (`created_at`) en los últimos 30 días.
- **Agenda**: eventos publicados que empiezan entre hace 30 días y dentro de 14 días (399 eventos).

## 1. Resumen en cinco líneas

1. **La IA de flyers está frenada desde el 2/11**: la cola de IA (`cola_ia`) cortó con «créditos de prepago agotados» del proveedor (HTTP 402). Hay **47 eventos de Instagram de los últimos 30 días sin publicar**. Es lo único que hoy pierde eventos de forma activa. **Lo tiene que resolver Mauro** (cargar créditos o cambiar el plan); el código no puede.
2. **El precio está mal en 130 eventos de la agenda**: tienen `price_min = 0` y `is_free = false`, así que se muestran «A confirmar» aunque muchos son gratis (museos, recurrentes, flyers). **Ningún evento de la agenda figura como gratis**, y eso deja vacío el chip «Gratis». Lo encara Q5-8.
3. **El 43 % de la agenda no tiene coordenadas** (170 de 399): no aparece en `/mapa` ni en la capa de chicos. La geocodificación programada hace 10 lugares por día y quedan 33 lugares en la cola de revisión.
4. **Dos ticketeras están calladas**: `vamos` no carga nada desde el **4/9** (probablemente cambió el sitio) y `alpogo` cargó 1 evento en 30 días (último el 9/10).
5. **La cobertura es casi toda del Centro**: 196 de 229 eventos con coordenadas caen a menos de 4 km del Centro y el resto, cerca de Solidaridad. De los 20 barrios de la lista, **17 no tienen ningún evento** cerca. Faltan los rubros de barrio: ferias, deportes, talleres, actividades de centros vecinales y parroquias.

## 2. Por fuente

| Fuente (`scrape_source_key`) | Cargados 30 d | Publicados 30 d | Sin publicar 30 d | Próximos publicados | Anticipación media | Último cargado | Estado |
|---|---|---|---|---|---|---|---|
| `entradauno` (ticketera) | 131 | 130 | 1 | 36 | 10,5 días | 3/11 | ✅ Sana. Trae museos (7 × 31 fechas) y teatro |
| `instagram-ai` (flyers de 24 cuentas) | 99 | 52 | **47** | 4 | 4,3 días | 2/11 | ⚠️ Frenada por los créditos de IA (402) |
| `recurrentes` (plantillas semanales) | 84 | 84 | 0 | 53 | 8,7 días | 2/11 | ✅ Sana (corre los lunes) |
| `norteticket` (ticketera) | 7 | 7 | 0 | 13 | 27,9 días | 30/10 | ✅ Poca cantidad pero estable: anuncia con mucha anticipación |
| `alpogo` (ticketera) | 1 | 1 | 0 | 1 | 22,7 días | 9/10 | ⚠️ Casi sin datos: revisar si Salta tiene eventos ahí o si el filtro de ciudad corta de más |
| `vamos` (ticketera) | 0 | 0 | 0 | 0 | — | **4/9** | ❌ Callada hace 2 meses: el scraper no encuentra nada |
| sin fuente (cargas viejas) | 0 | 0 | 0 | 0 | — | 2/10 | — |
| carga manual (`/nuevo-evento`) | 0 | 0 | 0 | 0 | — | — | Nadie cargó eventos a mano en 30 días |

Calidad dentro de lo cargado en 30 días: **0** eventos sin imagen, **1** sin lugar (Instagram) y **0** sin categoría. La calidad de esos campos está bien; los problemas están en el precio, las coordenadas y el horario (ver §4).

## 3. Procesos programados (`job_runs`, 30 días)

| Job | Corridas | OK | Parcial | Fallas | Ítems | Última OK | Nota |
|---|---|---|---|---|---|---|---|
| `ticketeras` | 30 | 30 | 0 | 0 | 2.008 | 3/11 08:00 UTC | Diario (Vercel cron 08:00 UTC) |
| `cines` | 30 | 30 | 0 | 0 | 435 | 3/11 13:00 UTC | Diario |
| `instagram` | 17 | 17 | 0 | 0 | 255 flyers | 2/11 00:00 UTC | Vie, sáb, dom y lun a las 00:00 UTC |
| `cola_ia` | 173 | 56 | 1 | 0 | 251 | 2/11 03:33 UTC | Las 116 restantes son `SKIPPED` (no había nada para procesar), no fallas. La `PARTIAL` del 2/11 es el **402 de créditos agotados** |
| `recurrentes` | 5 | 5 | 0 | 0 | 156 | 2/11 | Semanal |
| `traduccion` | 10 | 10 | 0 | 0 | 100 | 3/11 | Diario, tope de 10 |
| `geocodificacion` | 1 | 1 | 0 | 0 | 10 | 3/11 | Arrancó con Q4-3: 10 lugares por día |
| `radar_newsletter` | 4 | 4 | 0 | 0 | 14 | 29/10 | Semanal |
| `publicidad` | 6 | 5 | 1 | 0 | 0 | 2/11 | — |

No hay corridas colgadas (`RUNNING` de más de 2 horas). **Ojo:** `cola_ia` registra la 402 como `PARTIAL`, no como falla, y el chequeo de salud no la marca. *Sugerencia (no implementada):* que `health.yml` avise si `cola_ia` lleva más de 24 h sin un `SUCCESS` con ítems y hay flyers pendientes.

**Tiempo hasta publicar.** Las ticketeras y las recurrentes se publican en la misma corrida en que entran (el 99 % queda publicado). Los flyers necesitan la IA: con créditos andan en menos de 6 h (`ai-queue.yml` corre cada 6 h); sin créditos no se publican. La anticipación media de Instagram es de 4,3 días: un flyer que espera 6 h más pierde una parte relevante de su vida útil.

## 4. Qué tipo de eventos se pierde o se muestra mal

| Hueco | Dato | Efecto |
|---|---|---|
| **Gratis mal marcado** | 130 de la agenda con `price_min = 0` y `is_free = false` (54 recurrentes, 51 de Instagram, 20 viejos, 5 de entradauno). Ninguno de la agenda tiene `is_free = true` | El chip «Gratis» (web, app y mapa) queda vacío. Q5-8 lo revisa con reglas y modo en seco |
| **Sin coordenadas** | 170 de 399 | No aparecen en el mapa ni en «Cerca de casa» |
| **Horario 00:00** | 30 de la agenda | Probable hora sin dato que quedó como medianoche. Q5-8 los lista para revisar |
| **Flyers sin IA** | 47 sin publicar | Eventos chicos (peñas, recitales en bares) que solo están en Instagram |
| **Fin de semana largo** | Lunes: 15 eventos contra 88 el sábado | Coherente con la oferta, pero el lunes queda casi vacío |

### Por rubro (agenda)

| Categoría | Próximos 14 d | Últimos 30 d | Lugares distintos | Lectura |
|---|---|---|---|---|
| Museos | 30 | 156 | 7 | Sobrerrepresentado: 7 museos × 1 evento por día inflan el total |
| Peñas | 23 | 64 | 6 | Bien en Balderrama y La Vieja Estación; faltan peñas de barrio |
| Espectáculos | 11 | 46 | 13 | OK |
| Recitales | 3 | 9 | 9 | **Bajo** para una capital: faltan bares y centros culturales independientes |
| Boliches | 1 | 39 | 23 | Depende de Instagram: con la IA frenada, cayó a 1 |
| Teatro | 2 | 0 | 2 | **Bajo**: falta la cartelera de salas independientes |
| Infantil | 1 | 0 | 1 | **Muy bajo**: justo el pedido de los testers (lo compensan en parte los lugares para chicos de Q5-1 a Q5-4) |
| Talleres, Alternativo, Humor, Ballet, Congresos | 0 a 2 | 1 a 4 | 1 a 3 | Casi sin cobertura |
| Ferias, deportes | — | — | — | **No hay categoría ni fuente** |

### Por lugar (los 15 con más eventos de la agenda)

La Vieja Estación (43), Balderrama (32), los 6 museos (31 cada uno: MAC, Antropológico, Bellas Artes, MAAM, Explora, Güemes), Teatro Provincial (25), Usina Cultural (20), Casa de la Cultura (15), Casagrande Peña (8), Bounce (6), Amnesia (6) y El Teatrino (5). **Fuera de esos 15, nadie supera 5 eventos en 6 semanas.**

### Por zona

Con los 229 eventos que tienen coordenadas, asignados al barrio más cercano de `packages/core/src/datos/barrios.ts` (a menos de 4 km):
- Centro: 196
- Solidaridad: 32
- El Huaico: 1
- **Los otros 17 barrios: 0**, entre ellos Tres Cerritos, Grand Bourg, Castañares, Limache, Santa Ana, San Lorenzo Chico, Parque La Vega, El Tribuno y San Carlos.

## 5. Huecos priorizados

| # | Hueco | Impacto | Esfuerzo | Qué hacer | Ticket |
|---|---|---|---|---|---|
| 1 | IA de flyers sin créditos (402) | **Alto**: 47 eventos frenados y los boliches casi en cero | Mauro, minutos | Cargar créditos o cambiar el plan del proveedor de IA. Después, `ai-queue.yml` se pone al día solo | Fuera del código |
| 2 | Gratis mal marcado (130) | **Alto**: el chip «Gratis» vacío | Medio | Reglas en seco + revisión manual | **Q5-8** |
| 3 | Sin coordenadas (170) | **Alto** para el mapa y los lugares | Medio | Subir el tope diario de la geocodificación (Q5-16 nº7 suma «sugerencia + Confirmar») y atender la cola de 33 lugares | Q5-16 y admin |
| 4 | `vamos` callado desde el 4/9 | Medio | Bajo a medio | Revisar el HTML actual con `scripts/dry-run-*`; si cambió el sitio, actualizar los parsers | Q5-10 (si entra) |
| 5 | Teatro, recitales y cultura independiente | Medio | Medio | Fuentes nuevas: agenda cultural municipal, Usina Cultural, salas independientes | **Q5-10** |
| 6 | Barrios sin eventos | Medio | Alto | Centros vecinales, parroquias, ferias y polideportivos municipales: cargarlos como **recurrentes** o como lugares permanentes, más que con scrapers | Plan de contenido |
| 7 | Horario 00:00 (30) | Bajo a medio | Bajo | Listarlos en `/admin/calidad` | **Q5-8** |
| 8 | Ferias y deportes sin categoría | Bajo | Bajo | Decidir si se suman categorías | Decisión de Mauro |
| 9 | Museos que inflan el conteo | Bajo | Bajo | Agruparlos como «Abierto hoy» y no como 7 eventos diarios (lo hace la portada; revisar el mapa) | Futuro |

## 6. Consultas (solo lectura)

```sql
-- Por fuente (30 días y agenda)
select coalesce(scrape_source_key, '(sin fuente)') fuente,
  count(*) filter (where created_at >= now() - interval '30 days') cargados_30d,
  count(*) filter (where created_at >= now() - interval '30 days' and status = 'PUBLISHED') publicados_30d,
  count(*) filter (where start_date >= now() and status = 'PUBLISHED') proximos_publicados,
  round((avg(extract(epoch from (start_date - created_at)) / 86400)
    filter (where created_at >= now() - interval '30 days' and status = 'PUBLISHED'))::numeric, 1) anticipacion_dias,
  max(created_at)::date ultimo
from events group by 1 order by 2 desc;

-- Procesos (30 días)
select job_key, count(*), count(*) filter (where status = 'SUCCESS') ok,
  count(*) filter (where status = 'PARTIAL') parcial, count(*) filter (where status = 'SKIPPED') salteadas,
  max(started_at) filter (where status in ('SUCCESS', 'PARTIAL')) ultima_ok
from job_runs where started_at >= now() - interval '30 days' group by 1 order by 1;

-- Precio y gratis en la agenda
select scrape_source_key, count(*) filter (where price_min = 0 and not coalesce(is_free, false)) precio0_no_gratis
from events where status = 'PUBLISHED' and start_date >= now() - interval '30 days' group by 1;

-- Sin coordenadas y a las 00:00
select count(*) filter (where v.latitude is null) sin_coordenadas,
  count(*) filter (where to_char(e.start_date at time zone 'America/Argentina/Salta', 'HH24:MI') = '00:00') a_las_00
from events e left join venues v on v.id = e.venue_id
where e.status = 'PUBLISHED' and e.start_date >= now() - interval '30 days' and e.start_date < now() + interval '14 days';
```
