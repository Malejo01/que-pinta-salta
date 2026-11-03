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

## Uso de la app y panel `/admin/uso` (Q5-13)

### Qué se cuenta
| Métrica | De dónde sale | Cómo |
|---|---|---|
| **Personas activas por día (app)** | `app_aperturas_diarias` | Una fila por día de Salta y por **hash del día** de un id de métricas. La app avisa una vez por día, al abrirse o al volver al frente (`apps/mobile/lib/apertura.ts` → `POST /api/app/apertura`) |
| **Personas activas por semana (app)** | ídem | Hashes **semanales** distintos (semana ISO). Es también el indicio de «testers activos» |
| **Aperturas con sesión** | ídem | Si ese día se abrió al menos una vez con la sesión iniciada (sí/no, sin el usuario) |
| **Avisos activos, con y sin cuenta** | `push_tokens` | Solo el **total** de filas con y sin `user_id` (`count`, sin traer filas) |
| **Guardados y «Voy»** | `user_favorites`, `event_attendance` | Solo **totales**: en los últimos 30 días y desde siempre |
| **Vistas de eventos, web y app** | `event_metrics_daily` | Las vistas de siempre, separadas por `origin = 'app'` |

El panel incluye además la tarjeta **«¿Llegamos al pedido de producción?»**, con los criterios de `docs/play/produccion.md`. Lo que solo se ve en Play Console (testers que aceptaron la invitación, build y ficha) queda marcado «Ver en Play Console». Hay gráficos en SVG, cada uno con su tabla, y el botón **Descargar CSV** (`/admin/uso/csv`, solo admins).

### El id de métricas
- La app genera **un id aleatorio** de 32 caracteres hex y lo guarda **solo en el teléfono** (`qps.metricas.id`).
- **No** es el `device_id` del push ni sale de ningún dato del teléfono o de la cuenta.
- El servidor **no lo guarda**: guarda `sha256(id:díaDeSalta)` y `sha256(id:semanaISO)`. Con el hash del día no se puede seguir a nadie de un día al otro; con el de la semana, solo dentro de esa semana.
- Desinstalar la app o borrar sus datos genera un id nuevo.

### Qué NO se guarda
Ni el id crudo, ni IP, ni user agent (se usa para exigir que el aviso venga de la app y se descarta), ni usuario, ni ubicación. El endpoint tiene límite por IP y por id (en memoria, por instancia) y un formato estricto.

### Límites que hay que decir siempre
- **Son instalaciones, no personas**: dos teléfonos de la misma persona cuentan dos; reinstalar cuenta como otra.
- **Play cuenta testers en Play Console**, no aperturas: la tarjeta de producción es un indicio.
- Empieza a contar con el build que trae Q5-13 (antes no hay datos).

### PROPUESTA de texto para `/privacidad` (no se tocó la página)
> **Cuando abrís la app:** una vez por día la app nos avisa que se abrió, para saber cuántas personas la usan por día y por semana. Para eso genera un número al azar que queda solo en tu teléfono; nosotros no lo guardamos: guardamos una versión cifrada que cambia cada día y cada semana, así que no podemos seguirte ni saber quién sos. También guardamos la versión de la app y si tenías la sesión iniciada (sí o no). No guardamos tu IP, tu ubicación ni datos de tu cuenta.

### Para la ficha de Play («Seguridad de los datos»)
Declarar **Actividad en la app → Interacciones con la app**:
- recopilado;
- **no vinculado** a la identidad;
- no compartido;
- con fines de **estadísticas**.

Ver `docs/play/seguridad-de-datos.md`.
