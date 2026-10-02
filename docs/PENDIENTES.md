# Pendientes

Backlog abierto al **2026-08-23**. Sale de la auditoría mobile y de la revisión
del scraper de cines de esa noche. Lo que ya se arregló no está acá: está en
`git log`.

Cada ítem dice **dónde** se toca y **qué se midió**, para no re-diagnosticar.

---

## Cerrados — no volver a abrirlos

Están acá, y no simplemente borrados, porque en el historial de chat de esa noche
figuran como problemas abiertos. Si alguien relee ese hilo sin ver esto, los
reabre.

- **`CRON_SECRET` en Vercel — CERRADO el 2026-08-23.** Durante la auditoría, un
  GET a `/api/scrape-cinemas` con Bearer vacío devolvía `200` y ejecutaba el
  scraper (16s), lo que implicaba que la variable no estaba seteada en Vercel y
  que los tres endpoints (`scrape-cinemas`, `cron/instagram`, `cron/scrape`)
  quedaban disparables por cualquiera. Se cargó la variable y se redeployó.
  **Verificado esa misma noche:** un Bearer inválido devuelve `401
  {"error":"Unauthorized"}` en 1,06s, sin ejecutar el scraper. La clave en
  `.env.local` también quedó normalizada (antes estaba escrita como
  `CRON_SECRET =`, con un espacio antes del igual).

- **Ramas locales sin pushear — CERRADO el 2026-08-23.** `feat/scheduler`,
  `fix/venue-canonical` y `fix/event-dedup` (5 commits: Olas 2, 3 y 4 con sus
  migraciones, el merge plan de venues y la dedup) existían solo en la máquina de
  Mauro. Están pusheadas y trackeando `origin`. Ninguna está mergeada a `main`;
  pushear no mergea ni deploya.

### Sprint 0 de seguridad — CERRADO el 2026-10-02

Los agujeros del Paso 0 de `docs/AUDITORIA-2026-10.md` (más §7). Cada cambio de
base es una migración en `supabase/migrations/20261002133*`, probada antes con
un bloque `DO` que termina en `RAISE EXCEPTION` (rollback) y después aplicada
en prod. **Los cambios de código (0.1, 0.3, 0.5, 0.7, 0.8) están en `main` pero
no deployados**: rigen recién con el próximo deploy.

- **0.1 Política `Creators can manage own events` (ALL, sin WITH CHECK) —
  borrada en prod.** También el SELECT duplicado `Anyone can view published
  events`. Quedan 4 políticas en `events`, una por comando. `updateUserEvent`
  (`lib/actions.ts`) ahora devuelve a `DRAFT` un evento no-`DRAFT` que edita un
  dueño no-admin, para que se re-apruebe en `/admin/revision`. **Evidencia:**
  con rol `authenticated` y un uid real, `INSERT` con `status='PUBLISHED',
  is_featured=true` → `42501 new row violates row-level security policy`
  (antes pasaba RLS). Update del dueño a `DRAFT` → OK; a `PUBLISHED` → 42501.
  Anon sigue leyendo los publicados. *Hasta el deploy*, un usuario no-admin que
  edite un evento publicado recibe error de RLS (hoy hay 1 solo evento así, y
  es pasado).
- **0.2 `event_views` — DROP en prod.** 0 filas, sin FKs, vistas ni triggers
  que dependieran de ella; `grep` en todo el repo: solo el README y la
  migración `20260729` (nunca aplicada). Cierra el ERROR
  `rls_disabled_in_public` del advisor.
- **0.3 `/admin/instagram` sin guarda — cerrado en código.** Mismo patrón que
  `/admin/aliases`. **Evidencia (local):** sin sesión → `307` a
  `/auth/login?redirect=/admin/instagram`. En el build pasa de prerenderizada
  a dinámica (ya no llama a `createAdminClient()` en build).
- **0.4 Storage `Authenticated users can upload flyers` — borrada en prod.**
  Queda `Allow authenticated upload of flyers` (carpeta = uid). **Evidencia:**
  subir a `flyers/otra-carpeta/…` → 42501; a `flyers/<uid>/…` → OK.
- **0.5 Open redirect en `/auth/callback` — cerrado en código.** `next` solo se
  acepta si empieza con `/` y no con `//` ni `/\`. **Evidencia:** con
  `next=@evil.com` el destino era host `evil.com`; ahora es `/`.
- **0.6 `is_admin()` y `handle_new_user()` — aplicado en prod.**
  `is_admin()` con `search_path=''`. `handle_new_user()`: REVOKE EXECUTE de
  `PUBLIC`, `anon` y `authenticated` (también de `PUBLIC`: si no, lo heredaban),
  GRANT explícito a `supabase_auth_admin`. **Evidencia:** `is_admin()` da
  `true` para un admin y `false` para un usuario; el INSERT en `auth.users`
  sigue creando el profile por trigger.
- **0.7 Auth fail-open en los 7 handlers de `/api` — cerrado en código.** Todos
  pasan por `lib/api-auth.ts`: si falta la variable, 401; el secreto solo por
  header (se sacó `?secret=` de `scrape-cinemas`, `webhooks/apify` y
  `ai/process-flyers`); comparación en tiempo constante. `CRON_SECRET` y
  `APIFY_WEBHOOK_SECRET` existen en Vercel (production y preview).
  **Evidencia (local, sin `CRON_SECRET`):** los 5 crons dan 401 incluso con
  `Bearer ` vacío (antes `keep-alive` pasaba); `?secret=<real>` sin header da
  401 en `webhooks/apify` y en `process-flyers`.
- **0.8 `GET /api/ai/process-flyers` sin auth — cerrado en código.** Exige el
  mismo Bearer que el POST. **Evidencia (local):** sin auth 401; con Bearer
  200.

**Advisors de seguridad de Supabase:**

| | Antes | Después |
|---|---|---|
| ERROR `rls_disabled_in_public` | 1 (`event_views`) | 0 |
| WARN `function_search_path_mutable` | 4 | 3 (`prevent_role_tampering`, `set_updated_at`, `update_updated_at`) |
| WARN `anon_security_definer_function_executable` | 2 | 1 (`is_admin`) |
| WARN `authenticated_security_definer_function_executable` | 2 | 1 (`is_admin`) |
| WARN `auth_leaked_password_protection` | 1 | 1 |
| INFO `rls_enabled_no_policy` | 1 (`data_migrations`) | 1 |
| **Total** | **11** | **7** |

Lo que queda abierto a propósito: `is_admin()` tiene que seguir siendo
ejecutable por `anon`/`authenticated` porque la llaman las políticas de RLS
(sacarla de la API exige moverla a un schema no expuesto, Paso 4); los otros 3
`search_path` y la protección de contraseñas filtradas (Paso 4.4) no eran del
Sprint 0.

**Acciones manuales pendientes:**

1. ~~**Push + deploy de `main`**~~ — hecho el 2026-10-02
   (`dpl_AWx2iRaWLkUqFsrUmsaF4mLW62nu`, commit `b772c82`). Verificado en
   producción: `/admin/instagram` 307, `GET /api/ai/process-flyers` 401,
   `?secret=` 401 en `scrape-cinemas`, `webhooks/apify` y `process-flyers`,
   `keep-alive` con `Bearer ` vacío 401. El primer push quedó `BLOCKED` en
   Vercel porque los commits tenían autor `audit@local` (config local del repo,
   ya borrada): Hobby solo deploya commits de autores con acceso al proyecto.
2. **Apify:** si el webhook configurado en la consola de Apify apunta a
   `/api/webhooks/apify?secret=…`, pasarlo a header `x-apify-webhook-secret`
   (headersTemplate); con query string ahora da 401. El cron de Instagram no
   depende del webhook: dispara el actor y espera el resultado.
3. **Local:** `.env.local` no tiene `CRON_SECRET`, así que los crons llamados a
   mano en local ahora dan 401 (antes pasaban abiertos). `scrape-cinemas`
   conserva el bypass de `NODE_ENV=development`.

### Sprint 1 (contenido, alertas y monetización) — CERRADO el 2026-10-02

Commits en `main` sin pushear. Lo de base ya está aplicado en prod; lo de código
rige con el próximo deploy.

- **1.1 `search_path` en `set_updated_at`, `update_updated_at` y
  `prevent_role_tampering` — aplicado en prod**
  (`20261002150000_fix_trigger_functions_search_path.sql`). **Evidencia** (con
  rollback): los `updated_at` de `events` y `cinema_movies` siguen avanzando; un
  USER que intenta subirse a ADMIN sigue rebotando con "No tienes permisos de
  administrador para modificar roles."; el advisor ya no marca
  `function_search_path_mutable`.
- **1.2 Cola de IA drenada — 87 de 87, el 2026-10-02 a las 14:16–14:20 UTC**,
  contra prod (`POST /api/ai/process-flyers`, 1 lote de 3 de prueba y 17 de 5).
  0 fallbacks. **29** flyers `SKIPPED` (evento caducado) y **58** `PROCESSED`,
  que dieron 57 eventos (uno se fusionó con uno existente):
  **3 publicados solos** (boliches, futuros) y **54 en `DRAFT` para revisión**
  (13 futuros y 41 pasados; 53 de los 55 borradores no traen hora, que es
  requisito para auto-publicar). Ojo con la home: solo muestra flyers
  `ACTIVE/PENDING` (`lib/instagram/data.ts:18-19`), así que los 87 posts crudos
  (Boliches 59, Peñas 24, Alternativo 4) dejaron de verse. **Los 13 borradores
  futuros esperan revisión en `/admin/revision`**; hasta entonces Peñas no
  tiene fila en la home.
- **1.3 GitHub Actions — en código** (`.github/workflows/`): cola de IA cada
  6 h, Radar los jueves 21:00 UTC, health check diario 15:00 UTC contra el
  endpoint nuevo `GET /api/cron/health` (Bearer `CRON_SECRET`, 503 si algo está
  viejo). **Desvío del pedido:** Instagram tiene umbral de 100 h y no 36 —su
  cron no corre de martes a jueves (96 h entre lunes y viernes) y con 36 h el
  check fallaría tres días por semana. `process-flyers` acepta también
  `CRON_SECRET`, para que los workflows necesiten un solo secret.
  **Evidencia (build local):** sin auth / Bearer malo → 401; con Bearer →
  200 con las 4 antigüedades (ticketeras 5,7 h, cines 1 h, instagram 13,9 h,
  cola vacía).
- **1.4 Flag vencido de orden — borrado.** `lib/config/category-order.ts` y sus
  2 llamadas en `components/home-content.tsx`; el orden por volumen queda
  explícito (favoritos y alfabético desempatan). Typecheck OK.
- **1.5 Los 56 "Revisar: Flyer de @…" — `CANCELLED` en prod**
  (`20261002151000_cancel_fallback_flyer_events.sql`; 54 con ese título y 2
  renombrados a mano: "@bresh", "@treintaypicosalta"). Ninguno era futuro ni
  estaba en favoritos; anon ya no los ve. **Por qué estaban `PUBLISHED`:** no hay
  camino automático. Se insertaron en `DRAFT` y **los 56 tienen el slug que
  genera `publishDraftEvent`** (`${slugify(title)}-${id.slice(0,5)}`,
  `lib/admin-actions.ts:333-338`), que solo se llama desde el botón "Publicar"
  de `/admin/revision` (`components/draft-events-manager.tsx:208`): se
  publicaron a mano el 2026-09-15 entre 13:52 y 13:58 de Salta, a menos de un
  minuto de crearse cada uno (3 más el 2026-07-09). El editor no impide
  publicar un fallback sin editarlo (título "Revisar:…", fecha del post).
- **1.6 @laviejaestacionensalta con 0 flyers — diagnosticado.** Está en el input
  de cada corrida de Apify, pero el actor devuelve para ella
  `{ "error": "no_items", "errorDescription": "Empty or private data for
  provided input" }` (runs del 27/09, 28/09 y 02/10). Lo mismo con
  `@brickell_club` (0 flyers desde julio), `@peppers.gintoneria` (1 flyer) y,
  a veces, `@casonadelsur.salta` y `@juandelospalotes.jp`. El filtro de posts
  válidos descartaba esos ítems sin dejar rastro; ahora el cron los loguea y los
  incluye en su mensaje (`lib/instagram/process-apify-payload.ts`). No pude
  confirmar cuál de las causas es (Instagram exige login para ver el perfil):
  cuenta privada o con restricción de edad, usuario mal escrito (el Facebook es
  `laviejaestacionsalta`, sin "en") o sin posts en la ventana de 7 días.
- **1.7 Monetización detrás de `NEXT_PUBLIC_ADS_ENABLED` — en código, apagada**
  (`lib/config/monetization.ts`). Solo prende con `true`. Apagado: sin script de
  AdSense, sin slots ni cartel de "Anunciá", sin dominios de anuncios en la CSP
  y sin donaciones de Mercado Pago (navbar, footer, Radar, favoritos y los
  "compartir"). Con `true` la CSP es idéntica a la anterior (comparada directiva
  por directiva). Además: `/ads.txt` con `pub-2887416374800783`; el slot espera
  a que el `<ins>` tenga ancho antes de `adsbygoogle.push()` ("No slot size for
  availableWidth=0"). **Evidencia (build local con `false`):** la home no trae
  `adsbygoogle.js`, "Apoyar" ni "Hacer un aporte" (producción hoy sí los trae);
  `/ads.txt` responde. **Pendiente para prenderlo:** los slots que pasa el
  código (`home-middle-banner`, `event-detail-bottom-banner`) son nombres, no
  IDs numéricos de bloques de AdSense: nunca se iban a llenar. Con un slot no
  numérico el componente cae al CTA de WhatsApp.

Advisors de seguridad después del Sprint 1: **4** (antes del Sprint 0: 11; al
cierre del Sprint 0: 7). Quedan `is_admin()` ejecutable por anon/authenticated
(2 WARN, a propósito), contraseñas filtradas (WARN, Paso 4.4) y
`data_migrations` sin políticas (INFO).

**Acciones manuales del Sprint 1:**

1. ~~**Secret `CRON_SECRET` en GitHub**~~ — cargado el 2026-10-02 desde
   `.env.local`, que coincide con el de Vercel (verificado: `keep-alive` con ese
   Bearer da 200 en producción).
2. ~~**Push + deploy**~~ — hecho el 2026-10-02 (`dpl_3F18tBC6CHvhSdqX1cAhpPg1T2dq`,
   commit `a702207`), con `NEXT_PUBLIC_ADS_ENABLED=false` creada explícitamente
   en Vercel (production, preview y development). Verificado en producción: la
   home no carga `adsbygoogle.js` ni muestra "Apoyar"/"Hacer un aporte", la CSP
   no tiene dominios de anuncios y `/ads.txt` responde. Workflows corridos a
   mano: `health.yml` → success (ticketeras 6,4 h, cines 1,8 h, instagram
   14,6 h, cola vacía) y `ai-queue.yml` → success (cola vacía, autenticó con
   `CRON_SECRET`). **`radar-newsletter.yml` no se probó a mano:** manda el mail
   real a los suscriptores; queda para que lo dispares vos desde Actions o para
   el jueves 21:00 UTC.
3. **Revisar los 13 borradores futuros** en `/admin/revision` (incluye peñas).
4. **Instagram:** abrir logueado `instagram.com/laviejaestacionensalta`,
   `brickell_club` y `peppers.gintoneria` y ver si existen, si son privadas o
   tienen restricción de edad, y cuándo fue el último post. Corregir el usuario o
   desactivarlas en `/admin/instagram`.
5. **AdSense (cuando se prenda):** crear los bloques de anuncios y reemplazar
   los nombres de slot por sus IDs numéricos.

---

## Cines

### 1. Re-disparar el scraper de día

Corrió el 2026-08-23 a las 23:02 de Salta y **capturó casi nada**: quedaron
**5 funciones**, todas de Cine Ópera. Los dos Cinemark devolvieron cero.

No es un bug del scraper. A esa hora la página de Cinemark ya rotó a mañana: sus
`startDate` eran `2026-08-24` (44), `2026-08-25` (44) y `2026-08-26` (44),
ninguno para el día en curso, y el filtro de `cinema-scraper.ts:177` y `:273`
descarta todo lo que no sea hoy.

Se arregla corriéndolo de día, con el mismo endpoint (ahora requiere el Bearer
correcto).

Antes de esa corrida había 61 funciones, pero eran del **2026-07-27** — un mes de
antigüedad mostrándose como si fueran de hoy. No se restauró ese snapshot a
propósito.

### 2. El scraper de cines no está en ningún cron — CERRADO el 2026-09-15

`vercel.json` ahora dispara `/api/scrape-cinemas` a las `0 13 * * *` UTC (10:00
de Salta, de día como pide el ítem 1). Hobby lo corre una vez por día dentro de
esa hora. Antes del cambio la última actualización de `cinema_movies` era del
2026-08-24.

### 2b. Cine Ópera con cero funciones — CERRADO el 2026-09-15, no es bug

El scraper no falló: ese martes Ópera no tenía funciones. Su API
(`apiv2.gaf.adro.studio/movie/84/{pref}`) devolvía para las 7 películas solo
funciones del miércoles 16 (y una preventa del 05/10), y la web oficial
`cineopera.com.ar/pelicula/84/...` mostraba lo mismo ("Funciones para el
Miércoles 16 — 22:30").

La API marca `fechaHora.timezone` como `UTC`, pero la hora es la local de Salta:
la web muestra 22:30 para `2026-09-16 22:30:00 UTC`. El scraper la toma como
local, y está bien. No convertirla.

### 3. `cinema_movies` no guarda fechas — decisión de producto

Una fila por película, y las funciones viven en un JSON `showings` que solo tiene
horas: `"times": ["22:40"]`. No hay campo de fecha en ningún lado.

Consecuencia: **la cartelera de la semana no es representable** con este modelo,
solo la de hoy. Si se quiere semana, hay que cambiar el scraper y el esquema, no
solo la frecuencia de corrida.

---

## IA de flyers

### Flyers que cayeron al fallback entre el 2026-09-05 y el 2026-09-15 — CERRADO el 2026-10-02

Los 56 eventos de fallback pasaron a `CANCELLED` (Sprint 1, ítem 1.5). Queda el
texto original como contexto:

Con la API key nueva, `gemini-2.5-flash` devuelve 404 ("no longer available to
new users"). Desde el 2026-09-05 (última extracción real) los flyers quedaron
`PROCESSED` con `ai_metadata.is_fallback: true` y sin `extracted_data`: título y
lugar genéricos, sin fecha ni hora. Ya se pasó a `gemini-3.5-flash-lite`, pero
esos flyers no se reprocesan solos porque `processFlyerWithAI` saltea los
`PROCESSED`. Reprocesarlos cuesta centavos (~US$0,0006 por flyer), pero toca
eventos ya creados: decidir antes.

## Auditoría mobile (390×844 y 360×800)

Medido sobre el HTML servido por `next start`, no sobre el className.

### 4. Ningún variant de `Button` llega a 44×44

`components/ui/button.tsx:24-30`: `default h-9` (36px), `sm h-8` (32),
`lg h-10` (40), `icon size-9` (36), `icon-sm size-8` (32), `icon-lg size-10` (40).

**220 elementos táctiles bajo 44×44 en la home** (37 únicos). Los peores:

| Elemento | Medido | Dónde |
|---|---|---|
| Dots del hero (×5) | **8×8** | `hero-carousel.tsx:186-194` |
| X "Quitar filtro" | **16×16** | `filters-bar.tsx:522-527` |
| Switch flyers de redes | **32×18.4** | `filters-bar.tsx:464` |
| ♥ favoritos (×82) | 32×32 | `favorite-button.tsx:107` |
| Compartir (×82) | 32×32 | `event-card.tsx:176` |
| "Limpiar todo" | 103×28 | `filters-bar.tsx:537` |
| "Ver todos" (×12) | 67×20 | `category-row.tsx:53-62` |
| Chips de filtro (~20) | alto 32 | vía `size="sm"` |

La bottom nav está bien: 56px.

Ojo al tocar `button.tsx`: los CTA de la ficha de evento quedaron en 40px
justamente porque `size="lg"` es `h-10`. Subir el variant los arregla de paso.

### 5. `images: { unoptimized: true }`

`next.config.mjs:6-8`. Desactiva la optimización para **todo** el sitio.

Medido en la home: **86 `<img>`, 0 pasan por `/_next/image`, 0 tienen `srcset`**.
18 flyers de Supabase pesan **3,58 MB** juntos (promedio 203 KB, mediana 74,
máximo **951 KB**). 21 imágenes con resolución muy por encima del display:
**2160×2700 renderizadas en cajas de 180×270**.

Para revertirlo hacen falta `remotePatterns` de los 5 hosts: `*.supabase.co`,
`contenidos.entradauno.com`, `norteticket.com`, `cdn.cinemark.com.ar` y
`*.adro.studio`.

### 6. Peso de la home

| | Wire | Sin comprimir |
|---|---|---|
| HTML | 48,9 KB | **759 KB** |
| JS (20 chunks) | **411 KB** | 1,86 MB |
| CSS | 27,2 KB | 178 KB |
| Fuentes (3 woff2) | 61,6 KB | — |

Los 759 KB de HTML salen de serializar las 86 cards en el payload RSC inline.

### 7. Texto por debajo de 14px

**117 nodos en 9px** (`event-card.tsx:115, 125, 151, 159`) y **67 en 10px**
(`:108, :147, :197`). Los `text-[9px]` son los críticos; el resto es `text-xs` de
Tailwind, discutible pero convencional.

### 8. Prefetch RSC duplicado

30 requests de prefetch al cargar la home. `/auth/login` se pide **7 veces** con 7
hashes `_rsc` distintos, sin cache hit entre ellas, y `/buscar` 2 veces a **31 KB**
comprimidos cada una. Son ~150-200 KB de datos móviles que no se usan salvo que
el usuario navegue ahí.

### 9. Las 2 grillas de `/favoritos` tienen el bug de solape

`app/favoritos/favoritos-list.tsx:183` y `:209` usan el mismo
`grid grid-cols-2 gap-4 ... justify-items-center` que tenía `home-content.tsx`.

**A 360px las cards se solapan 8px**: las pistas quedan en 156px y la card es
`w-[180px]`, y `justify-items-center` hace que el item se dimensione por su
contenido en vez de estirarse a la pista.

El fix ya está resuelto y probado en `home-content.tsx:601` — replicar: sacar
`justify-items-center` y pasarle a `EventCard` el className
`w-full sm:w-full max-w-[200px] mx-auto`.

**Cuidado:** sacar solo `justify-items-center` **empeora** las cosas. El item pasa
a 156 pero la card sigue pintando 180 y aparece scroll horizontal (`scrollWidth`
368 en un viewport de 360), que hoy no existe.

Se dejó afuera a propósito el 2026-08-23 por requerir sesión.

### 10. Falta `viewportFit: 'cover'` (menor)

`app/layout.tsx:92-99`. El meta viewport está bien
(`width=device-width, initial-scale=1`, sin `user-scalable=no`), pero sin
`viewportFit` no se puede usar `env(safe-area-inset-bottom)`. Hoy no molesta
porque el wrapper tiene `pb-20` y la nav mide 56px.

---

## Peñas / Instagram

### 11. Revisar solapamiento después del próximo cron de IG

El 2026-08-23 se dieron de alta `@laviejaestacionensalta` y `@bolichebalderrama`
en `instagram_accounts`, activas y con `default_category: penas`.

El cron es `0 0 * * 0,1,5,6`. Después de la primera corrida sus posts van a entrar
como flyers y aparecer como cards propias en la categoría Peñas, **además** de las
14 + 9 filas manuales de `cargar-penas.mjs` para los mismos locales. Hay que mirar
cómo queda: puede que convenga desactivar la carga manual de esos dos, o al revés.

### 12. Las fotos de las peñas son de baja resolución

`flyers/penas/vieja-estacion.webp` (444×602) y `balderrama.webp` (447×597).
Alcanzan para las cards (200px CSS × 2 = 400px) pero quedan blandas en la ficha de
evento, que las muestra a 358px CSS, o sea ~716px en pantallas 2x.

Las dos capturas además tienen una **chincheta blanca en la esquina superior
derecha**, artefacto de la captura original.

Reemplazarlas es un comando:
`node scripts/imagen-penas.mjs --vieja-estacion=<archivo> --apply`

### 13. Cablear `imagen-penas.mjs` dentro de `cargar-penas.mjs`

Hoy son dos pasos: `cargar-penas.mjs --apply` inserta las fechas nuevas con
`image_url` en null, y hay que acordarse de correr `imagen-penas.mjs --apply`
después para taparlas. El segundo ya no necesita los archivos originales
(reutiliza lo que esté en el bucket), así que engancharlo al final del primero es
directo.

---

## Higiene del repo

### 14. Worktrees viejos

- `.claude/worktrees/mcp-list-eec87a` — worktree registrado en detached HEAD
  `60349cd`, del 2026-08-05, **sin cambios sin commitear**.
- `.claude/worktrees/readme-tecnico-github-e40a7a` — directorio **vacío**, huérfano.

Limpiar con `git worktree prune` y borrar los directorios. `.claude/` ya está en
`.gitignore` desde el 2026-08-23.

También se pueden borrar `chore/seo-audit` y `claude/mcp-list-eec87a`: están
mergeadas, 0 commits fuera de `main`.

### 15. Verificar `c08eb58`

`feat(contenido): generador de fechas futuras del circuito de museos` estaba
commiteado sin pushear cuando arrancó la sesión del 2026-08-23 y **se fue en el
push de esa noche**. Agrega solo `scripts/cargar-museos.mjs` (257 líneas), que no
lo importa nada de la app, así que no cambia el build ni el runtime. Conviene
confirmar igual que estaba listo para salir.
