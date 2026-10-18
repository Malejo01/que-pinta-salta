# Métricas de vistas y clics

Desde la Ronda 4 (QPS-027), el sitio cuenta **vistas de evento** y **clics a la ticketera**, por evento, día de Salta, origen y si el evento estaba destacado. Es la base para cualquier reporte a un anunciante, socio o inversor.

## Qué se cuenta

| Métrica | Cuándo suma | Dónde |
|---|---|---|
| **Vista** (`views`) | Cada vez que se abre la ficha o el modal de un evento. El navegador manda un aviso (`sendBeacon`) al montarse. La app de Android manda la vista con `User-Agent: QuePintaSaltaApp/<versión>` (sin eso, el endpoint la descartaría como bot: el `fetch` de React Native sale con `okhttp/x.y.z`). | `components/view-beacon.tsx` → `POST /api/metricas/vista`; en la app, `apps/mobile/lib/metricas.ts` |
| **Clic** (`clicks`) | Cada vez que alguien toca "Comprar tickets" (ficha o modal). Pasa por `/go/[id]`, que cuenta y redirige al link de compra guardado. | `app/go/[id]/route.ts` |

**Origen** (`origin`): de dónde vino la persona. Viaja como `?o=` en los links internos.

| Origen | Significa |
|---|---|
| `hero` | Carrusel de arriba de la home |
| `hoy` | Fila "Hoy en Salta" |
| `fila` | Filas de categoría o grilla filtrada |
| `busqueda` | `/buscar` |
| `favoritos` | `/favoritos` |
| `ficha` | Botón "Comprar" de la ficha o el modal (solo clics) |
| `radar` | Link del mail del Radar |
| `app` | La app de Android: vistas de la ficha y clics a "Comprar" |
| `directo` | Sin `?o=`: link compartido, Google, URL escrita a mano |

**Destacado** (`featured`): el valor de `events.is_featured` en el momento de contar. Sirve para comparar destacado contra no destacado.

## Qué NO se guarda

Ni IP, ni user agent, ni cookies, ni id de usuario. La tabla tiene solo evento, día, origen, destacado y los dos contadores. El user agent se lee para filtrar bots y se descarta. (Vercel registra IP y user agent en sus propios logs de plataforma, con su retención: eso va en la política de privacidad, QPS-040.) La app tampoco manda nada de la persona: el cuerpo de la vista es solo `{ eventId, origin: 'app' }` — sin usuario, sin dispositivo y sin la versión de la app (esa va en el `User-Agent`, no en el cuerpo).

## Qué no cuenta (filtro de bots)

No suman: requests sin user agent o con user agent de bot (Googlebot, facebookexternalhit, WhatsApp, Slackbot, curl, headless, etc.), `HEAD`, y las precargas (`Purpose`/`Sec-Purpose: prefetch`, `next-router-prefetch`). Las vistas no se cuentan en el servidor justamente para que la precarga de Next no las infle.

## Cómo leerlas (SQL)

La tabla es `event_metrics_daily`; solo la leen los admins (RLS) o el SQL Editor de Supabase.

```sql
-- Vistas y clics por día (últimos 30 días)
select day, sum(views) as vistas, sum(clicks) as clics
from event_metrics_daily
where day >= current_date - 30
group by day order by day;

-- Top 20 eventos por clics a la ticketera
select e.title, v.name as lugar, sum(m.views) as vistas, sum(m.clicks) as clics,
       round(100.0 * sum(m.clicks) / nullif(sum(m.views), 0), 1) as clics_por_100_vistas
from event_metrics_daily m
join events e on e.id = m.event_id
left join venues v on v.id = e.venue_id
group by e.title, v.name
order by clics desc limit 20;

-- ¿De dónde llega la gente?
select origin, sum(views) as vistas, sum(clicks) as clics
from event_metrics_daily
group by origin order by vistas desc;

-- Destacado vs. no destacado (cuando haya destacados)
select featured, count(distinct event_id) as eventos,
       sum(views) as vistas, sum(clicks) as clics
from event_metrics_daily group by featured;
```

## Límites que hay que decir siempre

- **Son eventos, no personas.** Una persona que abre la misma ficha tres veces suma tres vistas.
- **Incluye las visitas propias** (Mauro, admins, pruebas). En los primeros días pueden pesar.
- **Se puede inflar** con un user agent de navegador falso. Hasta tener límite de pedidos (QPS-041), no prometer números a un anunciante sin mirar que sean razonables.
- **Clics solo en eventos con link de compra real.** Los eventos de Instagram enlazan a un post: ahí el clic mide "fue a Instagram", no "fue a comprar".
- `events.view_count` es una columna vieja que nada incrementa: no usarla.

## Despliegue

La migración `supabase/migrations/20261005120000_event_metrics.sql` la aplica Mauro en producción **antes** del merge. Si el código se despliega sin la migración, todo funciona igual pero no cuenta (la escritura falla en silencio y `/go` redirige igual).
