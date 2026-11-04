# Qué Pinta Salta

Agenda cultural automatizada de Salta Capital. Sitio en producción: **[quepintasalta.com.ar](https://www.quepintasalta.com.ar)**

**Estructura (monorepo, npm workspaces + Turborepo):** el sitio está en `apps/web/` y la app de Android (Expo / React Native, en prueba cerrada de Google Play) en `apps/mobile/`; `packages/db` tiene los tipos generados de Supabase, `packages/core` la lógica de dominio compartida con la app y `packages/config` el `tsconfig` base. `supabase/`, `.github/`, `docs/` y `scripts/db/` siguen en la raíz. En este README, las rutas de código (`lib/…`, `app/…`, `components/…`) son relativas a `apps/web/`. Los comandos `npm run …` se corren desde la raíz.

---

## Descripción y problema que resuelve

La oferta de eventos de Salta Capital está fragmentada entre ticketeras que no se hablan entre sí (NorteTicket, EntradaUno, AlPogo, el portal provincial Vamos Salta) y, sobre todo, entre historias y posteos de Instagram de boliches y productores independientes, donde la información vive como imagen y texto libre — no como dato.

El resultado para el usuario es que no existe un único lugar donde ver qué hay para hacer esta noche, y para los organizadores, que su evento aparece disperso o directamente no aparece.

Qué Pinta Salta resuelve eso con un pipeline de ingesta multi-fuente que:

1. **Extrae** eventos de cuatro ticketeras (tres vía API JSON, una vía scraping HTML) y de cuentas de Instagram monitoreadas a través de Apify.
2. **Estructura** los flyers de Instagram con **Gemini 3.5 Flash-Lite** como extractor multimodal: la imagen del flyer más el caption entran, y sale un JSON con título, fecha, hora, precio, lugar, categoría y artistas, validado contra un `responseSchema` estricto. Con Q6-3 (PR #187) el modelo pasa a llamarse a través de una capa de proveedor intercambiable (Gemini por defecto, Claude como alternativa): ver [Capa de IA](#capa-de-ia-proveedor-intercambiable).
3. **Deduplica** eventos que aparecen en varias fuentes usando similitud de títulos (Jaccard con normalización y stop words, umbral 0.65) acotada a mismo venue y mismo día calendario. Cuando hay match, no crea un duplicado: fusiona los links de compra en un array `ticket_sources` y se queda con el precio más bajo y la mejor imagen.
4. **Decide** con un filtro determinista en TypeScript — no con la IA — si un evento se auto-publica o cae a revisión humana en un panel admin.

El punto de diseño importante es el número 4: el modelo extrae, pero no publica. La compuerta es código, y es auditable.

---

## Arquitectura

```mermaid
flowchart TB
    subgraph FUENTES["Fuentes de datos"]
        NT["NorteTicket<br/>HTML + Cheerio"]
        VS["Vamos Salta<br/>API EntradaUno Salta"]
        EU["EntradaUno<br/>JSON en CDN S3"]
        AP["AlPogo<br/>API POST getEvents2"]
        IG["Instagram<br/>cuentas monitoreadas"]
        CIN["Cinemark Alto Noa<br/>y Cine Ópera"]
    end

    subgraph INGESTA["Ingesta"]
        CRON1["Vercel Cron 08:00<br/>GET /api/cron/scrape"]
        SA["Server Action<br/>triggerSourceScrape<br/>panel /admin/scrape"]
        CRON2["Vercel Cron 00:00 V-S-D-L<br/>GET /api/cron/instagram"]
        APIFY["Actor Apify<br/>instagram-post-scraper<br/>polling hasta SUCCEEDED"]
        WH["POST /api/webhooks/apify<br/>entrada alternativa"]
        CINAPI["GET /api/scrape-cinemas"]
    end

    subgraph AI["IA: extracción multimodal y traducción"]
        STORE["Descarga de imagen y<br/>re-upload a Supabase Storage<br/>bucket flyers_ig"]
        FLY[("instagram_flyers<br/>ai_status = PENDING")]
        BATCH["POST /api/ai/process-flyers<br/>lote de hasta 10"]
        GEM["Capa lib/ia: Gemini 3.5 Flash-Lite<br/>por defecto, o Claude con IA_PROVEEDOR<br/>imagen + caption -> JSON<br/>responseSchema estricto"]
        TRAD["GitHub Actions diario<br/>GET /api/cron/traducir-eventos<br/>con tope por día"]
    end

    subgraph NORM["Normalización y decisión"]
        CAT["inferCategorySlug<br/>keywords + aliases de BD"]
        VEN["upsertVenue<br/>resolución de lugar"]
        TZ["saltaWallClockToUtcISO<br/>hora de Salta -> instante UTC"]
        GATE{"¿título + fecha +<br/>hora + lugar?"}
        DEDUP["upsertEventWithDeduplication<br/>similitud 0.65, mismo venue y día<br/>fusiona ticket_sources"]
    end

    subgraph DB["Supabase Postgres con RLS"]
        EVP[("events<br/>status = PUBLISHED")]
        EVD[("events<br/>status = DRAFT")]
        EVPEND[("events<br/>status = PENDING")]
        MOV[("cinema_movies")]
        LUG[("lugares_permanentes<br/>lugares para chicos")]
        PEDT[("lugares_chicos_pedidos")]
        IALOG[("ia_llamadas<br/>una fila por llamada")]
    end

    subgraph APP["Next.js App Router"]
        REV["/admin/revision<br/>split-screen flyer vs formulario"]
        PEND["/admin/pendientes<br/>aprobación de envíos"]
        WEB["Home, /buscar, /evento/id,<br/>/cines, /favoritos, /radar,<br/>/mapa, /lugar/slug y todo en /en"]
        MAIL["Radar por email<br/>Resend"]
        DUPQ["/admin/duplicados<br/>pares entre fuentes"]
        SUMAR["/lugares-chicos/sumar<br/>pedido público"]
        LCH["/admin/lugares-chicos<br/>verificar y publicar"]
    end

    subgraph MOVIL["App Android (Expo)"]
        MOB["Inicio, Buscar, Mis eventos,<br/>Radar, Cuenta y lugares para chicos<br/>en castellano o inglés"]
    end

    NT --> CRON1
    VS --> SA
    EU --> CRON1
    AP --> CRON1
    NT --> SA
    EU --> SA
    AP --> SA
    CIN --> CINAPI

    IG --> APIFY
    CRON2 --> APIFY
    APIFY --> STORE
    WH --> STORE
    STORE --> FLY
    FLY --> BATCH
    BATCH --> GEM
    GEM --> GATE

    CRON1 --> CAT
    SA --> CAT
    CAT --> VEN
    VEN --> TZ
    TZ --> DEDUP
    GATE -->|"sí"| TZ
    GATE -->|"no"| EVD
    GEM -.->|"error de IA o imagen rota"| EVD

    DEDUP --> EVP
    CINAPI --> MOV

    EVD --> REV
    REV -->|aprobar| EVP
    EVPEND --> PEND
    PEND -->|aprobar| EVP

    EVP --> WEB
    MOV --> WEB
    EVP --> MAIL
    EVP --> MOB

    EVP --> TRAD
    TRAD -.->|"usa la capa de IA"| GEM
    TRAD -->|"title_en y description_en"| EVP
    GEM -.->|"registro"| IALOG
    EVP --> DUPQ
    DUPQ -->|"fusionar a mano"| EVP

    SUMAR --> PEDT
    PEDT --> LCH
    LCH -->|"publicar verificado"| LUG
    LUG --> WEB
    LUG --> MOB
```

### Notas sobre el flujo real

- **En la ingesta, solo Instagram pasa por la IA.** Las otras cuatro fuentes devuelven datos ya estructurados (JSON de API en Vamos Salta, EntradaUno y AlPogo; DOM parseado con Cheerio en NorteTicket) y se normalizan con código determinista. No hay LLM en esa ruta. Fuera de la ingesta, la IA se usa en dos lugares más: la traducción diaria de títulos y descripciones al inglés y, solo a mano, la clasificación de eventos sin categoría de `scripts/revisar-calidad.ts --ia`.
- **Existen dos rutas de ingesta para las ticketeras**: el cron diario usa los providers de `app/api/cron/scrape/providers/`, y el panel admin usa los scrapers de `lib/scraper/` mediante Server Actions. La diferencia práctica es que la ruta manual además visita la página de detalle de cada evento, así que trae descripción real y clasifica mejor; el cron se queda con lo que hay en el listado.
- **La clasificación tiene tres niveles de prioridad**: alias definidos por un admin en la tabla `aliases` (override manual), inferencia por keywords de `inferCategorySlug`, y fallback a `espectaculos`. El campo `classification_source` deja registro de cuál ganó.
- **Los flyers de Instagram tienen TTL de 14 días**: `archiveExpiredFlyers` corre al final del cron de scraping y los pasa a `ARCHIVED`.
- **Si Gemini falla** (timeout, imagen ilegible, error de API), el pipeline no descarta el flyer: crea un evento `DRAFT` con título `Revisar: Flyer de @cuenta`, marca el flyer como `FAILED` y lo deja en la cola de revisión humana con el caption original como descripción.

### Manejo de horarios

`events.start_date` es `timestamptz` y guarda el **instante UTC real**. Las fuentes, en cambio, publican la hora de pared de Salta sin zona (`2026-08-07T21:00:00`), igual que los `<input type="datetime-local">` de los formularios. La conversión entre ambos mundos vive en [`lib/date-format.ts`](apps/web/lib/date-format.ts) y es obligatoria en los dos sentidos:

- Al escribir: `saltaWallClockToUtcISO()`. Es idempotente — si el valor ya trae `Z` u offset explícito, lo respeta.
- Al leer: `formatEventDate` / `formatEventTime` / `formatSaltaDayKey` / `formatSaltaClock`, todas ancladas a `America/Argentina/Salta`.

La única excepción es `instagram_flyers.published_at`, que Apify entrega como instante UTC real y no se convierte. Cuando Gemini no logra extraer la fecha del flyer, ese valor se usa como `start_date` tal cual.

Nunca hay que hacer `start_date.split('T')[0]` ni `toISOString().split('T')[0]` para obtener el día: devuelven el día UTC y corren la fecha en cualquier evento de la noche. Para eso está `formatSaltaDayKey()`.

### Deduplicación de eventos

El mismo evento entra por varias fuentes a la vez y sin dedup queda como N filas con datos contradictorios. La clave de agrupación es **título normalizado + día calendario de Salta** ([`lib/scraper/dedup-key.ts`](apps/web/lib/scraper/dedup-key.ts)): sin diacríticos, en minúsculas, sin sufijo de ciudad (`"EN SALTA"`, `"Salta 2026"`, `"Salta Capital"`) y con los espacios colapsados. El venue no entra en la clave, pero sí en la decisión: dos filas con la misma clave se fusionan solo si el venue es compatible (el mismo venue canónico, o a una le falta). Así, dos boliches con "Fiesta de fin de semana" el mismo sábado siguen siendo dos eventos. Los grupos de misma clave con venues distintos aparecen en el dry-run como "NO SE FUSIONAN" para revisarlos a mano.

Cuando dos registros coinciden pero difieren en un campo, gana la fuente de mayor prioridad ([`lib/scraper/source-priority.ts`](apps/web/lib/scraper/source-priority.ts)):

| Tramo | Peso | Fuentes | Por qué |
|---|---|---|---|
| Ticketera oficial | 400 | `norteticket`, `entradauno`, `alpogo`, … | Vende la entrada: si el evento se mudó de sala o cambió de horario, su dato tiene que estar bien o no cobra |
| Portal provincial | 300 | `vamos` | Agenda oficial, confiable pero copiada a mano y lenta para los cambios |
| Carga manual | 200 | formulario de admin/colaborador | Puede ser más precisa que cualquier scraper, pero nadie vuelve a editarla |
| Instagram | 100 | `instagram-ai` | Máxima cobertura, mínima precisión: el lugar sale del handle y el horario lo leyó Gemini de una imagen |

El merge **no pisa datos**: une todos los links de compra en `ticket_sources`, completa los campos vacíos, y guarda cada variante descartada — con su motivo y su fuente — en `events.merge_audit`. `price_min` se agrega al mínimo positivo en vez de resolverse por prioridad (es "lo más barato que se consigue", no un dato en disputa), el `slug` nunca cambia porque la URL ya está publicada, y el `status` no se toca salvo para promover un `DRAFT` que una ticketera confirmó.

La dedup se aplica **en la ingesta**, en `upsertEventWithDeduplication()`, que es el único punto de escritura de las tres rutas automáticas (cron, panel admin, Instagram). El job de limpieza es sólo para lo que ya está en la base:

```bash
npm run dedup:events                 # dry-run desde hoy: reporta qué fusionaría
npm run dedup:events -- --include-past   # dry-run sobre todo el histórico
npm run dedup:events -- --apply      # ejecuta las fusiones
npm run dedup:check                  # chequeo de la lógica sobre fixtures, sin base
```

El dry-run es el default y no escribe nada: imprime el total de fusiones, quién sobrevive en cada grupo y qué conflicto se resuelve cómo. Lo mismo está expuesto en `GET /api/admin/dedup` (dry-run) y `POST /api/admin/dedup` con `{ "apply": true }`. Al aplicar, las filas absorbidas se borran recién después de dejar su snapshot JSON completo en el `merge_audit` del sobreviviente, y los favoritos se repuntan.

### Duplicados entre fuentes y calidad de los eventos

La ingesta solo fusiona sola lo seguro. Lo dudoso va a revisión humana:

- **`/admin/duplicados`** compara primero pares del mismo `venue_id` y, desde la tanda Q5, hace una **segunda pasada entre fuentes distintas** aunque no compartan venue: el caso típico es la ticketera con «LOS ARTISTAS - GIRA 2026» en el «Teatro Provincial Juan Carlos Saravia» y el flyer de Instagram con «Los Artistas en Salta» en un «Teatro Provincial» que la IA creó como otro lugar. La confianza (alta, media o baja) la calcula `@qps/core/events/duplicados-entre-fuentes` con el mismo día de Salta, la hora compatible (hasta 90 minutos o una de las dos sin hora), el parecido de títulos sin el ruido de flyers y ticketeras («gira», «en Salta», el año, emojis) y nombres de lugar compatibles. Los pares de confianza alta o media aparecen con el badge «Entre fuentes» y **nada se fusiona solo**, ni siquiera los de confianza alta.
- **Calidad** (`@qps/core/events/calidad` y `lib/calidad/revision.ts`): detecta eventos sin imagen, sin categoría, sin lugar, con precio dudoso (0 sin evidencia de gratis, de $1 a $99, máximo menor que el mínimo) o con horario 00:00. Solo propone arreglos automáticos seguros: gratis si el texto lo dice (`detectarGratis`), lugar por alias exacto y categoría por palabras clave o, con `--ia`, por la IA con tope. Cada update lleva la guarda del valor leído para no pisar una edición del admin. `/admin/calidad` muestra el reporte (solo lectura) y el script corre en seco por defecto y no está programado:

```bash
cd apps/web
npx tsx scripts/revisar-calidad.ts                          # en seco: reporte, no escribe
npx tsx scripts/revisar-calidad.ts --aplicar                # gratis con evidencia, lugar por alias, categoría por palabras
npx tsx scripts/revisar-calidad.ts --aplicar --ia --tope-ia 5
```

La auditoría de fuentes de la tanda Q5 está en `docs/fuentes/auditoria-2026-11.md` y las fuentes candidatas (todavía sin scraper) en `docs/fuentes/candidatas.md`.

### El filtro determinista

En `lib/ai/process-flyer-ai.ts`, después de la extracción:

```ts
const hasTitle = !!extractedData.title && extractedData.title.trim().length > 0
const hasDate  = !!extractedData.date && /^\d{4}-\d{2}-\d{2}$/.test(extractedData.date)
const hasTime  = !!extractedData.start_time && /^\d{2}:\d{2}$/.test(extractedData.start_time)
const hasVenue = !!venueName && venueName !== 'Lugar no especificado'

const qualifiesForAutoPublish = !!(hasTitle && hasDate && hasTime && hasVenue)
const eventStatus = qualifiesForAutoPublish ? 'PUBLISHED' : 'DRAFT'
```

Los cuatro campos son obligatorios y se validan por forma, no por confianza del modelo. Además, si la fecha extraída es anterior a hoy en `America/Argentina/Salta`, el flyer se marca `SKIPPED` y no genera evento.

### Capa de IA (proveedor intercambiable)

> **Estado.** La capa (Q6-3, PR #187) y el banco de evaluación (Q6-4, PR #191, que sale de #187) estaban **abiertos, sin mergear,** cuando se escribió esta sección. Los dos necesitan la migración aditiva `supabase/migrations/20261104010000_q6_ia_llamadas.sql` **aplicada en producción** para dejar registro: mientras no esté, cada llamada deja un aviso en el log y la IA funciona igual que antes. Con la configuración de hoy (solo `GEMINI_API_KEY`) no cambia nada: mismo SDK, mismo modelo y mismo pedido.

Ningún archivo fuera de `lib/ia` le habla directo a un proveedor (lo fija el detector `tests/ia/proveedor-ia.test.ts`). Las funciones de dominio (`lib/ai/llamadas-ia.ts`: `extractEventFromFlyer`, `generarJsonDeTexto`) piden un proveedor con `iaPara(uso)` y reciben siempre la misma interfaz:

| Pieza | Archivo | Qué hace |
|---|---|---|
| Interfaz | `lib/ia/tipos.ts` | `ProveedorIA` con `generarTexto`, `generarJson` y `generarJsonDesdeImagen`. Devuelve `{ ok, texto \| datos, uso, error? }` y nunca tira |
| Errores | `lib/ia/errores.ts` | Códigos normalizados (`sin_clave`, `no_autorizado`, `sin_credito`, `limite`, `timeout`, `respuesta_invalida`, `solicitud_invalida`, `error_proveedor`, `red`) y un mensaje seguro, sin la clave, el pedido ni la respuesta |
| Gemini | `lib/ia/gemini.ts` | `@google/genai` con `gemini-3.5-flash-lite`, `temperature: 0.1` y el `responseSchema` de siempre. Es el **proveedor por defecto** |
| Claude | `lib/ia/claude.ts` | `fetch` a la API de Messages, sin SDK. JSON por tool use, imágenes en base64 (tope 5 MB), corte a los 60 s y sin reintentos (cada llamada es paga; la cola reintenta en la corrida siguiente) |
| Selección | `lib/ia/seleccion.ts` | `IA_PROVEEDOR=gemini\|claude` (por defecto `gemini`; otro valor cae en `gemini` con un aviso). Con `claude` usa `ANTHROPIC_API_KEY` e `IA_MODELO_CLAUDE` (por defecto `claude-haiku-4-5`) |
| Registro | `lib/ia/registro.ts` | Una fila por llamada en `ia_llamadas`: uso, proveedor, modelo, tokens de entrada y salida, latencia, `ok` y código de error. No guarda el pedido ni la respuesta. RLS: solo los admins leen y solo `service_role` escribe |

Usos que pasan por la capa (el `uso` es la columna de `ia_llamadas`):

| Uso | Dónde | Qué pide | Tope |
|---|---|---|---|
| `flyers` | `lib/ai/process-flyer-ai.ts`, desde `POST /api/ai/process-flyers` (workflow `ai-queue.yml`) | imagen + caption → JSON de 8 campos | lotes de 5, hasta 10 lotes por corrida |
| `traduccion` | `lib/ai/traducir-evento.ts`, desde `GET /api/cron/traducir-eventos` (workflow `traducir-eventos.yml`) | título y descripción → `{ title_en, description_en }` | `TRADUCCION_TOPE_DIARIO` (100 por defecto) |
| `clasificacion` | `scripts/revisar-calidad.ts --aplicar --ia` | texto → slug de categoría | 10 por corrida, a mano |

**Si se elige `claude` sin `ANTHROPIC_API_KEY`, las llamadas fallan a la vista (`sin_clave`) y no se usa Gemini en su lugar**: así no se esconde una configuración rota ni se gasta el otro saldo. Para cambiar de proveedor alcanza con las variables de Vercel (`IA_PROVEEDOR`, `ANTHROPIC_API_KEY` y, si hace falta, `IA_MODELO_CLAUDE`); los workflows no se tocan porque llaman a los endpoints con `CRON_SECRET`. Volver a Gemini es poner `IA_PROVEEDOR=gemini` o borrarla.

**Banco de evaluación** (`scripts/evaluar-ia.ts`, Q6-4). Mide con 30 casos reales por uso (`docs/evaluacion-ia/`: flyers, traducción y clasificación, con datos personales reemplazados) qué tan bien hace cada proveedor los tres trabajos y cuánto cuesta. **Por defecto corre en seco**: arma los pedidos con las funciones de la app, estima tokens y costo, y no llama a ninguna API. El modo real exige elegir proveedor y confirmar el costo (antes imprime el máximo estimado), tiene tope y registra sus llamadas en `ia_llamadas` con `uso = 'prueba'`. No está en ningún workflow ni en `vercel.json`.

```bash
cd apps/web
npx tsx scripts/evaluar-ia.ts                                                  # en seco: sin red ni gasto
npx tsx scripts/evaluar-ia.ts --real --proveedor gemini|claude|ambos --confirmo-costo --tope 30
```

Cómo leer el informe y los umbrales para decidir están en `docs/evaluacion-ia/README.md`; los precios con sus fuentes oficiales, en `docs/evaluacion-ia/precios-fuentes.md`.

**Traducción al inglés y errores del proveedor (Q6-10).** Un error del proveedor (sin crédito, clave inválida, límite, caída) **ya no se cuenta como traducción descartada**: el evento no se marca y se reintenta otro día, la corrida se corta en esa llamada para no seguir gastando, `job_runs` guarda `descartesPorMotivo` y `errorProveedor` (solo conteos y códigos) y la ruta responde 503, así el workflow falla y GitHub manda el mail. `/api/cron/health` suma el chequeo `traduccion`.

---

## Estado de las fuentes

| Fuente | Método de extracción | Pasa por Gemini | Estado |
|---|---|---|---|
| Vamos Salta | API REST de EntradaUno Salta (`/v1/api/v2/Cartelera`), JSON estructurado | No | Activo |
| EntradaUno | JSON estático en CDN S3, filtrado por `idProvincia = 16` | No | Activo |
| AlPogo | API POST `getEvents2`, JSON estructurado | No | Activo |
| Instagram (Apify) | Actor `apify~instagram-post-scraper` + Gemini 3.5 Flash-Lite | Sí | Activo |
| Cines | Scraping HTML de Cinemark Alto Noa y Cine Ópera | No | Activo |
| NorteTicket | Scraping HTML con Cheerio | No | Activo |

### Nota sobre el parseo de NorteTicket

Los selectores del DOM de NorteTicket viven en un solo lugar, `parseAllEventsFromHtml` en [`lib/scraper/parsers.ts`](apps/web/lib/scraper/parsers.ts), y tanto el cron como la ruta manual del panel admin los consumen desde ahí. Si NorteTicket cambia su HTML, se toca un archivo y no dos.

El provider del cron lanza en vez de devolver un array vacío cuando la fuente no responde o cuando el HTML deja de matchear el selector `div#boxEvent`. El job usa `Promise.allSettled`, así que una fuente caída no frena a las otras, pero el error queda en el campo `sourceErrors` de la respuesta y `success` pasa a `false`. Ese comportamiento es deliberado: la falla anterior de esta fuente fue invisible durante meses justamente porque el `catch` se tragaba el error y el cron reportaba `success: true` con cero eventos.

---

## Stack técnico

| Capa | Tecnología | Notas |
|---|---|---|
| Framework | Next.js 16 (App Router) | Server Components, Server Actions, rutas interceptadas (`@modal`) para modales de evento y flyer |
| UI | React 19 | |
| Estilos | Tailwind CSS 4 | Modo oscuro por clase vía `next-themes`, default `dark` |
| Componentes | Radix UI + shadcn/ui | Set completo en `components/ui/` |
| Animaciones | Framer Motion 12 | |
| Base de datos | Supabase (PostgreSQL) | RLS activo en todas las tablas de dominio |
| Auth | Supabase Auth | Email/password y Google OAuth; middleware refresca la sesión en cada request |
| Storage | Supabase Storage | Bucket `flyers_ig` para re-upload de imágenes de Instagram (máx. 5 MB) |
| IA | Gemini 3.5 Flash-Lite vía `@google/genai`, detrás de la capa `apps/web/lib/ia` (Q6-3: Claude listo con `IA_PROVEEDOR=claude`; cada llamada queda en `ia_llamadas`) | `temperature: 0.1`, `responseMimeType: application/json`, `responseSchema` con enum de categorías |
| Scraping | Cheerio 1.2, Puppeteer 25 | Cheerio para HTML estático, Puppeteer disponible para carteleras de cine |
| Scraping externo | Apify | Actor `apify~instagram-post-scraper`, disparado por cron con polling (timeout 3 min) o recibido por webhook |
| Email | Resend | Newsletter del Radar |
| Validación | Zod 3 + React Hook Form | |
| Analítica | Vercel Analytics + Google Tag Manager | |
| Hosting y cron | Vercel | `apps/web/vercel.json` define los cron jobs (Root Directory de Vercel: `apps/web`) |
| Lenguaje | TypeScript 5.7 | |

### Modelo de datos

Tablas principales: `events`, `venues`, `categories`, `aliases`, `profiles`, `user_favorites`, `instagram_accounts`, `instagram_flyers`, `cinema_movies`, `scrape_sources`, `scrape_runs`, y las tablas del Radar (`user_radar_settings`, `user_followed_categories`, `user_followed_venues`, `user_followed_instagram_accounts`).

`data_migrations` es una tabla auxiliar: registra las migraciones que modifican datos (no esquema) para que reaplicarlas sea idempotente.

Tablas y columnas de las tandas Q5 y Q6:

| Tabla o columna | Para qué | Migración |
|---|---|---|
| `lugares_permanentes` | Ficha de un lugar para chicos, 1 a 1 con `venues`: tipo, horarios en hora de Salta (o «Con reserva»), edades, acceso, accesibilidad verificada, contacto, fuente y `osm_ref`. Estados `borrador` / `publicado` / `vencido` / `archivado`; para publicar hacen falta `verificado_at` y una fuente verificada (OpenStreetMap o un pedido del público no alcanzan, lo exige un check). `anon` lee solo lo publicado y nunca `cargado_por` ni `verificado_por` | `20261103120000_q5_lugares_permanentes.sql` |
| `lugares_chicos_pedidos` | Pedidos del formulario público «Sumá un lugar». Escribe solo el servidor; leen y cambian solo los admins | `20261103130000_q5_lugares_chicos_pedidos.sql` |
| `app_aperturas_diarias` | Aperturas anónimas de la app por día de Salta para `/admin/uso`: guarda hashes del id de métricas por día y por semana, nunca el id, la IP ni el usuario. Escribe solo `registrar_apertura_app` (`service_role`) | `20261103140000_q5_aperturas_app.sql` |
| trigger `events_invalidar_traduccion` | Si cambia el título o la descripción de un evento, borra `title_en`, `description_en` y `traducido_en_at` para que el job lo vuelva a traducir | `20261103150000_q5_invalidar_traduccion.sql` |
| `venues.geocode_sugerencia_*`, `push_tokens.avisos_patrocinados_baja_at` | Sugerencia de Nominatim para confirmar a mano en `/admin/lugares` y bajas de patrocinados de teléfonos sin cuenta | `20261103160000_q5_decisiones_q4.sql` |
| `ia_llamadas` | Una fila por llamada a la IA (ver [Capa de IA](#capa-de-ia-proveedor-intercambiable)) | `20261104010000_q6_ia_llamadas.sql` (PR #187, sin aplicar al escribir esto) |
| `lugares_chicos_pedidos_cupos` | Cupo diario de pedidos «Sumá un lugar» en la base (10 por conexión y 100 en total); guarda un HMAC del día y la IP, nunca la IP. También pasa `lugares_permanentes` a SELECT por columnas para `authenticated` | `20261104020000_q6_revision_q5.sql` (PR #186, sin aplicar al escribir esto) |

Enums relevantes:

- `UserRole`: `USER` | `ADMIN` | `COLLABORATOR`
- `EventStatus`: `DRAFT` | `PUBLISHED` | `CANCELLED` | `PAST` | `PENDING`
- `ai_status` de flyers: `PENDING` | `PROCESSED` | `FAILED` | `SKIPPED`

RLS está habilitado en todas ellas. El patrón general es lectura pública de contenido publicado, escritura restringida a `ADMIN` o al dueño de la fila, y una migración dedicada (`20260623_prevent_role_tampering.sql`) que impide que un usuario se escale el propio `role`.

### Cron jobs

| Path | Schedule | Qué hace |
|---|---|---|
| `/api/cron/scrape` | `0 8 * * *` | Corre los tres providers de ticketeras en paralelo (`allSettled`), hace upsert con deduplicación y archiva flyers de Instagram vencidos |
| `/api/cron/instagram` | `0 0 * * 0,1,5,6` | Dispara el actor de Apify sobre las cuentas activas, espera el run y persiste los flyers nuevos. Informa las cuentas de las que Apify no trajo nada (`no_items`) |
| `/api/scrape-cinemas` | `0 13 * * *` | Cartelera de Cinemark y Cine Ópera |

Los tres validan `Authorization: Bearer ${CRON_SECRET}`. `/api/ai/process-flyers` (POST y GET) acepta `Bearer ${CRON_SECRET}` o `Bearer ${APIFY_WEBHOOK_SECRET}`, y `/api/webhooks/apify` el header `x-apify-webhook-secret`. Todos fallan cerrado (`lib/api-auth.ts`): si la variable no está definida responden 401, y ninguno acepta el secreto por `?secret=`.

### GitHub Actions (procesos que no entran en Vercel Hobby)

Hobby permite un disparo por cron por día, así que lo que necesita más frecuencia, o que no entra en `vercel.json`, corre en `.github/workflows/`. Si un workflow programado falla, GitHub le manda un mail a quien lo creó (o a quien cambió después su `cron`), siempre que tenga activadas las notificaciones de Actions (Settings → Notifications → Actions en la cuenta de GitHub).

| Workflow | Cuándo | Qué hace | Falla si |
|---|---|---|---|
| `ai-queue.yml` | cada 6 h | `POST /api/ai/process-flyers?limit=5` en loop hasta vaciar la cola o 10 llamadas | error HTTP o algún flyer con `success: false` |
| `radar-newsletter.yml` | jueves 21:00 UTC (18:00 Salta) | `GET /api/cron/radar-newsletter` | error HTTP o `stats.errors > 0` |
| `recurrentes.yml` | lunes 09:00 UTC (06:00 Salta) | `GET /api/cron/recurrentes`: genera las fechas futuras de peñas (14 días) y museos (7 días); idempotente, se puede correr a mano | error HTTP o algún ítem con error |
| `health.yml` | todos los días 15:00 UTC (12:00 Salta) | `GET /api/cron/health` | algún proceso pasó su umbral (respuesta 503) |
| `notificaciones.yml` | cada hora, minuto 5 (desde Q5-14) | `GET /api/cron/notificaciones`: arma la tanda de recordatorios y novedades push respetando el horario de silencio y el tope diario. **No manda nada** (modo de prueba) mientras `PUSH_ENVIO_REAL` no sea `1` en Vercel. Como todo `schedule`, GitHub solo lo corre desde `main` | error HTTP |
| `traducir-eventos.yml` | todos los días 10:10 UTC (07:10 Salta) | `GET /api/cron/traducir-eventos` en lotes de 10 hasta el tope diario (`TRADUCCION_TOPE_DIARIO`) o 10 llamadas | error HTTP, incluido el 503 cuando la IA corta la corrida (Q6-10) |
| `geocodificar-lugares.yml` | todos los días 09:30 UTC (06:30 Salta) | `scripts/geocodificar-lugares.ts --programado` en el runner: hasta 10 lugares sin coordenadas contra Nominatim, menos de 4 pedidos por minuto; lo dudoso queda como sugerencia en `/admin/lugares` | error del script. Sin los secrets `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` avisa y no hace nada |
| `publicidad.yml` | todos los días 09:00 UTC (06:00 Salta) | `GET /api/cron/publicidad`: ocupación del día, ciclo de precios del mes, bajas del push patrocinado a las 48 h y reportes de campañas terminadas; idempotente | error HTTP o corrida `FAILED` |

**Bitácora de corridas.** Cada proceso programado (ticketeras, instagram, cines, cola de IA, newsletter) deja una fila en `job_runs` al empezar y la cierra al terminar, con estado (`SUCCESS`, `PARTIAL`, `FAILED`, `SKIPPED`), origen (`vercel-cron`, `github-actions` o `manual`), duración, ítems y errores (`lib/job-runs.ts`). Se ve en `/admin/scrape`, sección "Procesos automáticos".

`/api/cron/health` mide cada proceso por su última corrida sana en `job_runs` (vista `job_last_runs`) y, si todavía no tiene historial, por el rastro que deja en la base: ticketeras (último `updated_at` de eventos de entradauno/norteticket/alpogo/vamos, máx. 36 h), cines (`cinema_movies.updated_at`, 36 h), Instagram (`instagram_flyers.fetched_at`, **100 h**, porque su cron no corre de martes a jueves) y cola de IA (antigüedad del flyer pendiente más viejo, 36 h; con la cola vacía da OK). Desde Q6-10 también mira la traducción (`lib/traduccion/salud.ts`): se pone en rojo si la última corrida con trabajo de las últimas 48 h terminó `FAILED` o con un aviso `proveedor:` o `validacion:`, o si no hubo una corrida sana en 36 h.

**Secrets que hay que cargar a mano** en GitHub (repo → Settings → Secrets and variables → Actions):

- `CRON_SECRET` (secret, obligatorio): **el mismo valor** que `CRON_SECRET` en Vercel. En Vercel es de tipo *sensitive* y no se puede volver a leer: si no lo tenés guardado, generá uno nuevo (`openssl rand -hex 32`), cargalo en los dos lados y redeployá Vercel.
- `SITE_URL` (variable, opcional): por defecto `https://www.quepintasalta.com.ar`.
- `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` (secrets): solo para `geocodificar-lugares.yml`, que corre el script en el runner y escribe en la base.

Ojo: `radar-newsletter.yml` se puede correr a mano (`workflow_dispatch`), pero no hay registro de envíos y cada corrida vuelve a mandar el mail a todos.

---

## Funcionalidades

Todo lo listado acá está implementado y activo en el código.

**Descubrimiento**

- Home con carrusel de destacados, filas por categoría y filtros por categoría, lugar, fecha y precio.
- Búsqueda en `/buscar`.
- Detalle de evento con rutas interceptadas: el mismo contenido se abre como modal desde la grilla o como página completa en `/evento/[id]`, con URL compartible en ambos casos.
- Cartelera de cines en `/cines`, con normalización de títulos que colapsa las variantes de formato (2D, 3D, XD, doblada, subtitulada) en una sola ficha con todas sus funciones.
- Multi-ticketera: cuando el mismo evento se scrapea de varias fuentes, la ficha muestra todos los links de compra desde `ticket_sources`.

**Lugares (tanda Q5)**

- **Lugares para chicos**: plazas, peloteros, salones de juegos y espacios culturales cargados y verificados por el equipo. En `/mapa` y `/en/mapa` aparecen como una capa propia (un ícono de casita, distinto de los pines de eventos) que se prende con el chip «Para chicos» o con el chip «Lugares para chicos». La lista de abajo es la alternativa accesible al mapa: tipo, edades, horario de hoy en hora de Salta («Espacio abierto», «Con reserva» u «Horario sin confirmar»), accesibilidad solo si está verificada, «Cómo llegar», contactos y la atribución de OpenStreetMap cuando corresponde. «Cerca mío» pide la ubicación aproximada solo al tocarlo, y «Elegí tu barrio» ordena por 20 barrios con puntos aproximados (`packages/core/src/datos/barrios.ts`); ninguna de las dos sale del navegador. Solo se ve lo publicado.
- **Alta a pedido**: `/lugares-chicos/sumar` (y `/en/lugares-chicos/sumar`) es un formulario público para sugerir un lugar, con contacto opcional y anti-spam sin dependencias (campo trampa, tiempo mínimo y límite por IP). El pedido va a una tabla aparte y un admin lo pasa a borrador desde `/admin/lugares-chicos`; nada se publica sin verificación.
- **Importador de OpenStreetMap** (`scripts/importar-lugares-chicos.ts`): un pedido a Overpass por corrida sobre Salta Capital; por defecto solo muestra el plan y con `--aplicar` crea los lugares como borrador. No está programado.
- **Fichas de lugar** en `/lugar/<slug>` y `/en/place/<slug>`: mapa chico, próximos eventos y los de los últimos 60 días, horarios si es un lugar para chicos, «Cómo llegar», «Seguir» y «Compartir». Un link con el id del lugar, con el slug en mayúsculas o de un lugar fusionado redirige (308) al slug canónico. JSON-LD (`EventVenue`, o `Playground` / `Place`), hreflang, sitemap solo con las fichas indexables y `noindex` si el lugar no tiene eventos ni ficha de lugar para chicos. Se llega desde la ficha del evento, la lista de `/mapa` y un bloque «Lugares» en `/buscar`.
- **Seguir lugares**: «Lugares que seguís» en `/favoritos` y en Mis eventos de la app. El aviso push de novedades ya cruza los eventos nuevos con `user_followed_venues`.

**Inglés**

- **Sitio**: todo lo público tiene versión en `/en`, y desde las tandas Q5 y Q6 también el ingreso, el alta, el perfil y la carga de eventos (`/en/auth/login`, `/en/auth/sign-up`, `/en/perfil`, `/en/nuevo-evento`). Lo que queda solo en castellano, con su motivo, está en `tests/i18n/cobertura-en.test.ts` (entre otros, `/favoritos`, `/mis-eventos` y `/perfil/eliminar-cuenta`). Las páginas legales tienen su `/en` con una nota en inglés y el texto en castellano.
- **Eventos traducidos**: `title_en` y `description_en`, que completa la traducción diaria con tope; sin traducción se muestra el original marcado «(in Spanish)». En `/en/evento/<id>` el JSON-LD va traducido con `inLanguage: "en"`.
- **App**: Cuenta → Idioma (Automático, Español o English); «Automático» sigue el idioma del teléfono y la elección se guarda solo en el teléfono. Desde Q6 están en inglés todas las pantallas, incluidas Inicio, Buscar, Mis eventos, Radar, Cuenta, la ficha, Contraseña, Eliminar mi cuenta y la pantalla de error general; las fechas van en `en-GB` y en hora de Salta, y los recordatorios y «Este finde pinta» se reprograman en el idioma elegido. Lo que se comparte por WhatsApp sigue en castellano y la palabra para confirmar el borrado de la cuenta sigue siendo ELIMINAR.

**Avisos en la app**

- **Sin cuenta**: los avisos se activan sin iniciar sesión (`POST /api/push/registrar`, 6 pedidos por hora por dispositivo).
- **Recordatorios**: la tarde anterior a las 18:00, de lo que guardaste o marcaste «Voy» (notificación local).
- **«Este finde pinta»**: los jueves a las 18:00, cuántos planes hay para el finde. No sale si ese día llegó un «Aviso del equipo»; desde Q6-8 tampoco cuando el aviso llegó con la app cerrada y se descartó sin tocarlo, siempre que la app se abra antes de las 18 (consulta `GET /api/app/aviso-equipo`, un dato global sin datos de nadie).
- **Push del servidor**: `notificaciones.yml` arma la tanda cada hora, pero no manda nada hasta que `PUSH_ENVIO_REAL=1`.

**Cuenta y personalización**

- Registro y login con email/password o Google OAuth.
- Favoritos por usuario, persistidos en `user_favorites` con RLS por dueño.
- **Compartir agenda por WhatsApp**: desde `/favoritos` se arma un mensaje con la lista de eventos guardados y un link a cada uno, y se abre el share nativo de WhatsApp. También hay compartir individual desde cada tarjeta.
- **Radar por email**: suscripción por categoría, por lugar y por cuenta de Instagram, con frecuencia configurable (semanal, quincenal, mensual o desactivado). El envío usa Resend con plantilla HTML propia.
- Modo oscuro con `next-themes`, default oscuro y respeto por la preferencia del sistema.
- Carga de eventos por usuarios autenticados en `/nuevo-evento`, con gestión propia en `/mis-eventos` y aprobación por admin en `/admin/pendientes`.

**Panel administrativo**

- `/admin/revision`: revisión de borradores en layout split-screen — el flyer original de Instagram fijo a un lado, el formulario editable con lo que extrajo Gemini al otro, más el JSON crudo de `ai_metadata` para auditar la extracción. Publicar o descartar en un click.
- `/admin/scrape`: ejecución manual de cada fuente con historial de corridas en `scrape_runs` (estado, insertados, omitidos, errores, quién la disparó).
- `/admin/clasificacion`: clasificación manual de eventos sin categoría.
- `/admin/aliases`: mapeo de alias a categorías y lugares, que tiene prioridad sobre la inferencia automática.
- `/admin/instagram`: alta y baja de cuentas monitoreadas, con venue, categoría y URL de Maps por defecto para cada una.
- `/admin/users`: gestión de roles.
- `/admin/lugares-chicos`: borradores, publicados, «Para volver a verificar» (plazos de 90 y 180 días) y archivados, con edición de horarios en grilla y los pedidos del formulario público.
- `/admin/lugares`: lugares sin ubicación, con la sugerencia de Nominatim para «Confirmar» o «Descartar».
- `/admin/calidad`: reporte de calidad de los eventos (solo lectura).
- `/admin/duplicados`: pares de posibles duplicados, también entre fuentes distintas, para fusionar o descartar a mano.
- `/admin/avisos`: aviso del equipo y su historial, con cuántos teléfonos sin cuenta lo recibieron.
- `/admin/uso`: panel de uso. Personas activas por día y por semana en la app (aperturas anónimas), aperturas con sesión, avisos activos con y sin cuenta, guardados y «Voy», y vistas de eventos en la web y la app. Gráficos SVG con resumen accesible y tabla de datos, «Descargar CSV» (`/admin/uso/csv`) y la tarjeta «¿Llegamos al pedido de producción?». Qué se mide y qué no está en `docs/METRICAS.md`.

**Monetización directa**

- Botón de contacto por WhatsApp para anunciantes en el footer y en los slots publicitarios, con mensaje pre-cargado. El número sale de `NEXT_PUBLIC_CONTACT_WHATSAPP`.
- Marcado de eventos como `is_commercial` y `is_featured` para priorización en home.

**SEO**

- `sitemap.ts` y `robots.ts` dinámicos, Open Graph y Twitter Cards, metadata por evento.

**Rendimiento y accesibilidad**

- Desde Q6-5, supabase-js, framer-motion del layout, los menús de Radix, el modal de ingreso, los avisos (toast) y Google Tag Manager se cargan recién cuando hacen falta, así que salen del JavaScript inicial. En Lighthouse (celular, medido en local) las cinco páginas medidas (`/`, `/mapa`, `/lugar/<slug>`, `/en` y `/evento/<id>`) quedan con accesibilidad 100.

---

## Roadmap

- **Google AdSense.** El componente `AdSenseBanner`, `/ads.txt` y el interruptor `NEXT_PUBLIC_ADS_ENABLED` ya existen; hoy está apagado. Para prenderlo faltan los bloques de anuncios: los slots que se pasan (`home-middle-banner`, `event-detail-bottom-banner`) son nombres, y `data-ad-slot` tiene que ser el ID numérico de cada bloque creado en AdSense. Con un slot no numérico el componente muestra el CTA de WhatsApp.
- **Analítica de datos para campañas publicitarias.** Ya se cuentan vistas y clics por evento, día y origen, sin IP ni usuario (`event_metrics_daily`, ver `docs/METRICAS.md`); hay un reporte por evento para anunciantes (`/admin/reporte/<eventId>` y el link privado `/reporte/<token>`), y `/admin/uso` resume el uso de la web y la app. Falta el tablero agregado por categoría, por venue y por franja horaria, para vender espacios con números en la mano.
- **Rol de colaborador / RRPP para boliches.** La base ya está mergeada — `COLLABORATOR` en `UserRole`, `PENDING` en `EventStatus`, campos `contact_type` y `contact_value` en `profiles`, y el circuito `/nuevo-evento` → `/mis-eventos` → `/admin/pendientes`. Falta el onboarding específico para RRPP, los permisos diferenciados por local y las métricas propias de cada colaborador.
- **Geocodificación de venues.** Los scrapers siguen sin completar `latitude` y `longitude` ([`lib/scraper/venue-enrichment.ts`](apps/web/lib/scraper/venue-enrichment.ts) quedó como stub sin usar): de eso se encarga aparte `geocodificar-lugares.yml` (Nominatim, 10 lugares por día), con lo dudoso para confirmar a mano en `/admin/lugares`. Para correr necesita sus dos secrets en GitHub (ver más arriba).
- **IA: elegir proveedor por uso.** La capa de `lib/ia` ya permite pasar de Gemini a Claude con una variable, para toda la app. Falta correr el banco de evaluación en real y, si conviene, sumar una variable por uso (flyers, traducción, clasificación). Decide la calidad: con el volumen actual la diferencia de costo es chica.
- **Expansión a otras provincias**: Qué Pinta Mendoza y Qué Pinta Córdoba, reutilizando el pipeline con fuentes y configuración por provincia.

---

## Desarrollo local

```bash
npm install
```

Variables de entorno en `apps/web/.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# IA y scraping externo
GEMINI_API_KEY=
# Q6-3: proveedor de IA (gemini por defecto | claude). Con claude hace falta
# ANTHROPIC_API_KEY (si falta, las llamadas fallan: no se usa Gemini en su lugar).
# IA_PROVEEDOR=gemini
# ANTHROPIC_API_KEY=
# IA_MODELO_CLAUDE=claude-haiku-4-5
APIFY_API_TOKEN=
APIFY_WEBHOOK_SECRET=

# Cron
CRON_SECRET=

# Email
RESEND_API_KEY=
RESEND_FROM_EMAIL=

# Avisos push y traducción (vacías = comportamiento por defecto)
PUSH_ENVIO_REAL=                 # con "1" el cron de notificaciones manda de verdad; si no, solo arma la tanda
TRADUCCION_TOPE_DIARIO=          # eventos traducidos por día (100 por defecto; con 0 no traduce)

# Contacto y publicidad
NEXT_PUBLIC_CONTACT_WHATSAPP=
NEXT_PUBLIC_ADS_ENABLED=false    # interruptor de monetización: anuncios + donaciones
NEXT_PUBLIC_ADSENSE_CLIENT_ID=   # solo se usa con NEXT_PUBLIC_ADS_ENABLED=true
```

`NEXT_PUBLIC_ADS_ENABLED` (`lib/config/monetization.ts`) solo prende con `true`; si falta, queda apagado. Apagado no se carga el script de AdSense, no se renderizan los slots ni el cartel de "Anunciá", la CSP no incluye dominios de anuncios (`next.config.mjs`) y se ocultan las donaciones de Mercado Pago. Se lee en el build: cambiarla en Vercel exige redeployar. `/ads.txt` (`public/ads.txt`) se publica siempre.

### Base de datos y esquema

El esquema está versionado en `supabase/migrations/` y arranca con un **baseline** (`20261002160000_baseline.sql`) que es un volcado verificado del esquema de producción. Las migraciones anteriores están en `supabase/migrations_legacy/` solo como historia (ver su README). Las migraciones nuevas van en `supabase/migrations/` con versión posterior al baseline; el CI las aplica sobre una base vacía en cada push.

Base local (requiere Docker):

```bash
npx supabase start          # levanta Postgres 17 + auth + storage y aplica las migraciones
npx supabase db reset       # vuelve a aplicar todas las migraciones desde cero
npx supabase stop
```

Base local **con los datos de producción**, para probar migraciones contra datos reales:

```bash
bash scripts/db/load-prod-data.sh           # baja los datos de prod y los carga (resetea la base local)
bash scripts/db/load-prod-data.sh --reuse   # vuelve a cargar el último dump sin bajarlo
```

Lee `POSTGRES_URL_NON_POOLING` de `apps/web/.env.local` y solo lee de prod. Baja el schema `public` completo y, de `auth`, solo `users` e `identities`. **El dump tiene emails de usuarios**: queda en `supabase/.data-dumps/`, que está en `.gitignore`; no lo commitees ni lo compartas. Conexión local: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

Otros comandos:

```bash
npm run db:types                   # regenera packages/db/src/database.types.ts desde la base local
npm run typecheck
bash scripts/db/check-drift.sh     # compara prod contra lo que reconstruyen las migraciones; falla si difieren
```

Los tipos de la app (`lib/types.ts`) derivan de `packages/db/src/database.types.ts` (`@qps/db`). Si una migración cambia el esquema, regenerá los tipos y commitealos en el mismo cambio: el CI falla si no coinciden.

```bash
npm run dev
```

Ejecución manual de scrapers:

```bash
npx tsx apps/web/lib/scraper/vamos-scraper.ts
```

Los scrapers también se pueden disparar desde `/admin/scrape` con una cuenta `ADMIN`, que es la vía recomendada porque registra la corrida en `scrape_runs`.

---

## Autor

**Mauro Alejandro Lizárraga**

- LinkedIn: [mauro-alejandro-lizarraga](https://www.linkedin.com/in/mauro-alejandro-lizarraga-8260711a3/)
- Portfolio: [malejoportfolio.netlify.app](https://malejoportfolio.netlify.app)
- GitHub: [@Malejo01](https://github.com/Malejo01)
- Producción: [quepintasalta.com.ar](https://www.quepintasalta.com.ar)
