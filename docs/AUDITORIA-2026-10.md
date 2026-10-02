# Auditoría de estado: Qué Pinta Salta

| | |
|---|---|
| **Fecha de medición** | 2026-10-02, 03:27–04:20 UTC (00:27–01:20 hora de Salta) |
| **Código auditado** | `main` = `5f46fa2`. Es el mismo commit que el deployment de producción `dpl_2bH6dpgECgdAxb8oBV86HoSFvQwT` (READY, 2026-09-15 17:32 UTC) |
| **Base** | Supabase `splzietmyydqhmdxijcn`, plan **Free**, Postgres 17.6, us-east-1 |
| **Hosting** | Vercel, proyecto `quepintasalta` (`prj_vaAxkXR0yXGDfq6t42z88LF2xWZJ`). La facturación devolvió `costs_not_found` para 2026-07-01 → 2026-10-01, sin cargos: plan **Hobby** |

**Qué se tocó y qué no.** No se aplicó ningún fix, no se ejecutó ninguna migración y no se deployó nada. En producción no quedó ninguna escritura persistente. Todo lo que se corrió fue esto:

- Consultas `SELECT` sobre la base.
- Dos bloques `DO` que **siempre abortan** con `RAISE EXCEPTION`, así que hacen rollback completo:
  - una prueba de RLS en `events` y `event_views`;
  - una simulación en memoria del plan de fusión de venues.
- Los dry-runs oficiales de las ramas: `scripts/dedup-events.ts` sin `--apply` y `scripts/venue-audit.mjs`. Los dos solo leen; ver el §10-11.
- Requests HTTP a producción, todas con credenciales inválidas o contra endpoints de health. Ninguna disparó trabajo.
- Lecturas por REST con la anon key.

En local:

- `main` estaba 24 commits detrás de `origin/main` y sin commits propios. Se hizo fast-forward, y por eso ahora existen `docs/` y este archivo.
- El typecheck y el build de las ramas se corrieron en un worktree temporal fuera del repo, que se borró al terminar.

---

## A. Resumen ejecutivo: los 5 problemas más graves

Están ordenados por riesgo real, medido hoy.

### 1. Cualquier usuario registrado puede publicar eventos sin moderación y marcarlos como destacados

- **Dónde.** En `public.events` hay una política llamada `Creators can manage own events`. Es `FOR ALL`, rol `public`, `USING (auth.uid() = created_by)` y **sin `WITH CHECK`**. No figura en ningún archivo del repo.
  - Las políticas permisivas se combinan con OR, así que esta anula la restricción `status = 'DRAFT'` de `Allow insert for owner or admin` (`supabase/migrations/20260704_community_security.sql:46-52`).
  - También anula la de `Allow update…` (`:58-68`).
- **Medido.** Simulé el rol `authenticated` dentro de un bloque `DO` con rollback. Un `INSERT` con `status='PUBLISHED', is_featured=true, created_by=<uid propio>` **pasó RLS**. Solo falló la FK `events_created_by_fkey`, porque el uid de prueba era ficticio; con un usuario real la fila se inserta. El caso de control (`created_by` de otro usuario) devuelve `42501 new row violates row-level security policy`.
- **Por qué es explotable hoy, sin app móvil:**
  - El signup está abierto (`/auth/v1/settings`: `disable_signup:false`, email y Google habilitados).
  - La anon key **ya es pública**: en los 24 chunks JS que sirve la web hay exactamente 1 JWT y su payload es `"role":"anon"`.
- **Impacto.** El carrusel de la home pone primero los eventos con `isFeatured` (`components/home-content.tsx:337-342`).

### 2. `public.event_views` tiene RLS deshabilitado

- `relrowsecurity = false`, 0 políticas, y `anon` tiene SELECT, INSERT, UPDATE y DELETE (`has_table_privilege`).
- Columnas: `ip_address inet`, `user_agent`, `user_id`. Hoy tiene 0 filas.
- **Ningún archivo del código la lee ni la escribe** (`grep event_views` en `app/ components/ lib/` da 0 resultados).
- La migración `supabase/migrations/20260729_enable_rls_event_views.sql` **nunca se aplicó**.
- En la prueba con rollback, el `INSERT` pasó RLS y solo lo frenó la FK de `event_id`. Cualquier id de evento publicado la satisface, y hay 1229 legibles con la anon key.
- **Riesgo.** Cualquiera puede escribir filas sin límite y sin autenticarse en una base con tope de 500 MB (plan Free). Si alguna vez se empieza a usar la tabla, además expone IPs y user agents.
- El advisor de Supabase la marca como `rls_disabled_in_public`, nivel ERROR.

### 3. Lo que muestra la home está vencido o sin procesar

- Hay **73 eventos futuros publicados en total**. Por categoría:
  - **Peñas: 0** eventos. La fila "Peñas 24" que muestra la home son 24 posts de Instagram sin procesar y sin fecha.
  - **Museos: 1**, **Teatro: 1**.
  - **Cine (como eventos): 0**. La fila "Cine 13" sale de `cinema_movies`.
- **La cola de IA de flyers no tiene cron.** Hay 87 flyers `ACTIVE/PENDING` acumulados desde 2026-09-25 y la última corrida fue el 2026-09-24 a las 23:03 UTC.
- **El Radar Salteño no está programado.** `/api/cron/radar-newsletter` no figura en `vercel.json`, y los 3 suscriptores semanales no reciben nada de forma automática.
- **El flag de orden de la demo venció** el 2026-09-08 (`lib/config/category-order.ts:63`). Hoy la home ordena por volumen y aparece **Boliches primero, con 63 items: 59 son posts crudos de IG**.

### 4. `/admin/instagram` responde 200 sin sesión

- **Medido.** `GET https://www.quepintasalta.com.ar/admin/instagram` sin cookies devuelve **200, 222.170 bytes**. Las otras 7 páginas de `/admin` responden 307 al login.
- **Por qué pasa:**
  - `app/admin/instagram/page.tsx:6-11` no tiene guarda.
  - `app/admin/layout.tsx:1` es un client component sin guarda.
  - La página llama a `getInstagramAccounts()` y `getInstagramStats()`, que usan `createAdminClient()` (service role, `lib/instagram/data.ts:57-58` y `:76-77`) **en cada request anónimo**.
- **Qué expone.** El HTML trae las 24 cuentas con sus `notes` internas y `activeFlyers: 126`, en vivo.
- **Qué no expone.** Las mutaciones exigen `ensureAdmin()` (`lib/instagram/admin-actions.ts:6-24`).

### 5. El esquema de producción no está bajo control de versiones

- `supabase_migrations.schema_migrations` tiene **1 de las 23** migraciones del repo (`20260525 clasificacion`). El resto se aplicó a mano o no se aplicó; la `20260729` no se aplicó.
- Hay políticas activas que no están en el repo:
  - 3 de las 6 de `events`, incluida la del punto 1;
  - 2 de `profiles`;
  - 3 de `favorites`;
  - 1 de `aliases`;
  - 4 de storage.
- No hay `supabase/config.toml` ni tipos generados.
- Las 3 ramas pendientes traen 5 archivos SQL que nunca se corrieron contra Postgres:
  - **`fix/event-dedup`**: su `--apply` **borra 13 eventos**.
  - **`fix/venue-canonical`**: su plan se escribió sobre 103 venues y hoy hay 136. Además renombra venues, y eso no se revierte con el `_down.sql`.
- **Esto bloquea la app móvil.** Con una app que habla directo con Supabase, RLS es el único control, y hoy no se puede reproducir ni auditar desde el repo.

**Otros hallazgos fuera del top 5,** con detalle en el anexo:

- Open redirect en `/auth/callback` (§7).
- Política de storage que deja a cualquier usuario autenticado subir archivos a cualquier ruta del bucket `flyers` (§5).
- `GET /api/ai/process-flyers` responde sin autenticación usando service role (§7).
- `/ads.txt` da 404 y no hay CMP de consentimiento (§8).
- 56 eventos `PUBLISHED` con el título "Revisar: Flyer de @…" (§4).
- Las corridas por cron no se registran en `scrape_runs`, así que el panel muestra 2026-09-04 como última corrida (§3).
- `/admin/pendientes` redirige a `/login`, que da 404 (§7).
- El patrón de auth *fail-open* se repite en los 7 handlers de `/api` (§7).

---

## B. Tabla de RLS (el punto crítico para la app móvil)

Notas para leer la tabla:

- Una política con rol `public` aplica **tanto a `anon` como a `authenticated`**.
- En las 18 tablas, `anon` y `authenticated` tienen los GRANT completos (SELECT, INSERT, UPDATE y DELETE; medido con `has_table_privilege`). La única barrera es RLS.
- "Anon lee (medido)" sale de `GET /rest/v1/<tabla>` con `Prefer: count=exact` usando la anon key real.

| Tabla | RLS | Políticas para anon (rol `public`) | Políticas para `authenticated` | Anon lee (medido) | Qué puede escribir alguien sin privilegios | Riesgo |
|---|---|---|---|---|---|---|
| `events` | ON | `Allow read for published or owner or admin` (SELECT); `Anyone can view published events` (SELECT, *legacy*); **`Creators can manage own events` (ALL, *legacy*, sin WITH CHECK)** | INSERT, UPDATE y DELETE dueño-o-admin (repo) **+ la legacy ALL** | 1229/1229 (todas `PUBLISHED`) | **Usuario registrado: INSERT y UPDATE de eventos propios con cualquier `status` e `is_featured` (medido)** | **CRÍTICO** |
| `event_views` | **OFF** | — | — | Todo (0 filas hoy) | **Anon: INSERT, UPDATE y DELETE de todo (medido INSERT)** | **ALTO** |
| `profiles` | ON | INSERT propio (×2); SELECT propio; UPDATE propio (sin WITH CHECK) | SELECT y UPDATE propio-o-admin | 0 | UPDATE propio. El cambio de `role` lo bloquea el trigger `tr_prevent_role_tampering`, pero solo en `BEFORE UPDATE`. Un INSERT propio con `role='ADMIN'` **no lo cubre el trigger**; hoy no se puede porque `handle_new_user` ya crea la fila (26 users = 26 profiles) y no hay política DELETE | Medio-bajo (latente) |
| `user_radar_settings` | ON | — | ALL propio | 0 | Propio. `email_target` acepta cualquier dirección y `triggerTestRadarEmail` (`lib/actions/radar.ts:265`) manda mail a esa dirección | Medio (mails a terceros) |
| `aliases` | ON | SELECT `true`; ALL si `profiles.role='ADMIN'` (*legacy*) | + `Allow read/write for admins` (`is_admin()`) | 6/6 | No | Bajo |
| `categories` | ON | SELECT `true` | ALL `is_admin()` | 16/16 | No | Bajo |
| `cinema_movies` | ON | SELECT `true` | ALL `is_admin()` | 45/45 (incluye 32 que no están en cartelera) | No | Bajo |
| `instagram_accounts` | ON | SELECT `true` | ALL `is_admin()` | 24/24, con `notes` internas | No | Bajo |
| `instagram_flyers` | ON | SELECT `status='ACTIVE'` | ALL `is_admin()` | 126/691, todas las columnas (incluye `ai_metadata` y `caption`) | No | Bajo |
| `venues` | ON | SELECT `true` | ALL `is_admin()` | 136/136 | No | Bajo |
| `favorites` | ON | INSERT, SELECT y DELETE propio (3 *legacy*) | 3 duplicadas de las anteriores | 0 | Propio | Bajo. Tabla sin uso: 0 filas, la app usa `user_favorites` |
| `user_favorites` | ON | — | SELECT, INSERT y DELETE propio | 0 | Propio | Bajo |
| `user_followed_categories` | ON | — | ALL propio | 0 | Propio | Bajo |
| `user_followed_venues` | ON | — | ALL propio | 0 | Propio | Bajo |
| `user_followed_instagram_accounts` | ON | — | ALL propio | 0 | Propio | Bajo |
| `scrape_runs` | ON | — | SELECT y ALL `is_admin()` | 0 | No | Bajo |
| `scrape_sources` | ON | — | SELECT y ALL `is_admin()` | 0 | No | Bajo |
| `data_migrations` | ON | ninguna | ninguna | 0 | No | Ninguno (INFO del advisor) |

### Vistas

- **En producción no hay ninguna vista** en `public`, ni en otro schema de usuario. Las únicas que existen son de sistema: `extensions.pg_stat_statements`, `extensions.pg_stat_statements_info` y `vault.decrypted_secrets`. **Las "dos vistas sin `security_invoker`" no existen en prod.**
- Las ramas crean 3 vistas, y **solo una** no tiene `security_invoker`:

| Vista | Rama | `security_invoker` | Qué pasaría |
|---|---|---|---|
| `venues_canonical` | `fix/venue-canonical` (`_data.sql:367`) | `on` (`:379`) | OK |
| `job_last_runs` | `feat/scheduler` (`:63`) | `on` (`:131`) | OK |
| **`event_duplicate_groups`** | `fix/event-dedup` (`20260821_event_dedup.sql:85-96`) | **no se setea** | La vista correría como `postgres`, salteando RLS. Anon vería ids, `dedup_key` y fuentes de eventos `DRAFT` y `PENDING`, porque solo filtra `CANCELLED`. **Hay que agregar `security_invoker = on` antes de aplicarla** |

### Funciones expuestas por RPC

- `is_admin()` es `SECURITY DEFINER`, la pueden ejecutar `anon` y `authenticated`, y **no tiene `search_path` fijo**. La usan todas las políticas de admin.
- `handle_new_user()` es `SECURITY DEFINER` y la puede ejecutar `anon`. Es una función de trigger, así que llamada por RPC falla.
- El advisor marca 4 funciones con `search_path` mutable: `is_admin`, `prevent_role_tampering`, `set_updated_at` y `update_updated_at`.
- En la rama `fix/venue-canonical`, `resolve_venue_id` es `SECURITY DEFINER` con EXECUTE solo para `service_role` (`20260821_venue_canonical.sql:433-434`). Está bien.

### Storage

- **Bucket `flyers`**: público, 5 MB, solo mime de imagen, 12 objetos y 5,98 MB.
  - Tiene 7 políticas.
  - `Authenticated users can upload flyers` (INSERT, rol `public`, `bucket_id='flyers' AND auth.role()='authenticated'`) **deja subir a cualquier ruta del bucket**. La política paralela `Allow authenticated upload of flyers` sí exige que la carpeta sea el uid. No se puede sobrescribir, porque el UPDATE está restringido a la carpeta propia o al admin.
- **Bucket `flyers_ig`**: público, sin restricción de mime y sin políticas, así que solo escribe el service role. Tiene 707 objetos y 133 MB.

### Auth

- Signup abierto, con confirmación de email obligatoria (`mailer_autoconfirm:false`).
- Google habilitado; usuarios anónimos deshabilitados.
- Protección contra contraseñas filtradas: **apagada** (advisor WARN).

### Qué cambia con la app móvil

La exposición de la anon key no cambia, porque ya es pública.

Lo que sí cambia es que la app no pasa por las server actions. Toda regla que hoy vive solo en el servidor queda sin aplicar si no se mueve a RLS, a triggers o a una Edge Function. Por ejemplo:

- el status según el rol (`lib/actions.ts:71-73`);
- la notificación al admin (`lib/actions.ts:104-133`);
- la verificación de propiedad antes de editar (`lib/actions.ts:279-287`).

---

## C. Estado real vs. `docs/PENDIENTES.md`

Este archivo no corrige `PENDIENTES.md`; solo lista qué quedó desactualizado.

| Ítem en PENDIENTES.md | Estado medido hoy |
|---|---|
| **"Cerrado: `CRON_SECRET`"** (`:17-25`) | Hoy está bien: los 5 endpoints devuelven 401 sin Bearer y con un Bearer inválido; `scrape-cinemas` también con `?secret=`. **Pero el relato no cierra con el historial.** La variable se creó en Vercel el 2026-08-24 a las 01:45 UTC (22:45 del 23 en Salta) y **no hay ningún deployment de producción entre 2026-07-31 00:57 UTC y 2026-09-04 17:00 UTC** (`list_deployments` filtrado por esa ventana). Sin redeploy, la variable no aplica: los endpoints habrían seguido abiertos hasta el 2026-09-04. El "se redeployó y se verificó esa noche" no figura (ver E) |
| "Ramas locales sin pushear: cerrado" (`:27-31`) | Correcto: están en `origin` y sin mergear. Hoy `fix/venue-canonical` va 2 commits adelante y 24 detrás; `fix/event-dedup`, 1 adelante y 23 detrás; `feat/scheduler`, 2 adelante y 23 detrás |
| Ítem 1, "re-disparar el scraper de cines de día" (`:37-52`) | **Obsoleto.** El cron `0 13 * * *` corre: `cinema_movies.updated_at` máximo es 2026-10-01 13:27:26 UTC y hay 13 películas en cartelera |
| Ítem 2 (`:54-59`) | Confirmado |
| Ítem 3, `cinema_movies` sin fechas (`:73-80`) | Sigue vigente: `showings` solo guarda horas (`lib/types.ts:124`) |
| **Sección "IA de flyers"** (`:84-94`) | **Desactualizada en 4 puntos:** (a) dice que los flyers quedaron `PROCESSED`; hoy los 71 con `is_fallback` están `ARCHIVED` (55 PROCESSED, 9 FAILED y 7 SKIPPED). (b) No dice que el fallback **creó 56 eventos**: 53 el 2026-09-15 y 3 en julio, todos `PUBLISHED`, con el título "Revisar: Flyer de @…" y con `start_date` igual a la fecha del post (`lib/ai/process-flyer-ai.ts:304`). Hoy no hay ninguno futuro. (c) "Decidir si reprocesar" ya no afecta la agenda, porque están todos vencidos; sí afecta la limpieza. (d) **No dice que la cola de IA no tiene cron**: hay 87 pendientes y la última corrida fue el 2026-09-24 23:03 UTC. El modelo `gemini-3.5-flash-lite` está confirmado (`GET /api/ai/process-flyers`) |
| Ítem 4, `Button` < 44 px | El código sigue igual (`components/ui/button.tsx:24-29`). No re-medí el render |
| Ítem 5, `images.unoptimized` | Sigue vigente (`next.config.mjs:7`) |
| **Ítem 6, peso de la home** | **Desactualizado.** El HTML pesa hoy **1.272.951 B sin comprimir** (el doc dice 759 KB) y **110.993 B con gzip** (el doc dice 48,9 KB) |
| Ítems 7, 8, 10, 12 y 13 | No re-medidos |
| Ítem 9, grilla de `/favoritos` | Sigue vigente: `app/favoritos/favoritos-list.tsx:183` y `:209` todavía tienen `justify-items-center` |
| **Ítem 11, solapamiento de peñas manuales vs IG** | **Ya no aplica, porque las filas manuales vencieron.** `cargar-penas.mjs` cargó 14 filas de La Vieja Estación y 9 de Balderrama, con última fecha **2026-09-06** (horizonte por defecto de 4 semanas, `scripts/cargar-penas.mjs:59`). @bolichebalderrama trajo 10 flyers (3 activos, último fetch 2026-10-02). **@laviejaestacionensalta trajo 0 flyers** desde que se dio de alta el 2026-08-24. El problema real hoy es que Peñas tiene 0 eventos |
| Ítem 14, worktrees viejos | En este checkout no hay `.claude/`, ni las ramas `chore/seo-audit` y `claude/mcp-list-eec87a` (`git branch --list`). Corresponde a otra copia del repo |
| Ítem 15, `c08eb58` | Está en `main` y `scripts/cargar-museos.mjs` existe. Las filas que generó vencieron: no hay filas de museos generadas por adelantado después del 2026-10-01, y el horizonte por defecto es de 2 semanas (`scripts/cargar-museos.mjs:75`) |
| **Lo que falta en PENDIENTES.md** | Todo el top 5 de la sección A. También el open redirect, `/ads.txt` en 404, el flag de demo vencido, la newsletter sin programar, que `scrape_runs` no registra los crons, el 404 de `/admin/pendientes`, que solo 1 de 23 migraciones está registrada y que el plan de venues de la rama quedó viejo |

### Supuestos del pedido que la medición contradice

| Supuesto | Medido |
|---|---|
| "`/privacidad` devuelve 404" | **200** en `https://www.quepintasalta.com.ar/privacidad` (57.174 B, título "Política de Privacidad"). Se deployó el 2026-09-15 con el commit `7c0e43a` y está linkeada en el footer |
| "Falta `*.adtrafficquality.google` en la CSP" | **Está** en `script-src`, `img-src`, `connect-src` y `frame-src` (`next.config.mjs:18,20,22,23`). Cargué y recorrí toda la home: **0 violaciones**, y `ep1` y `ep2.adtrafficquality.google` cargaron bien |
| "Al menos dos vistas sin `security_invoker`" | En prod hay **0** vistas. Entre las ramas hay **1**: `event_duplicate_groups` |
| "Merge plan de venues: 32 fusiones, 103 → 70" | Hoy hay **136 venues**. Las 32 fusiones curadas siguen aplicando, más 1 automática por clave y 1 placeholder: quedarían **102 canónicos**. Hay 37 venues nuevos desde el 2026-08-21 que el plan no contempla (§11) |
| "El cron de cines está en `vercel.json` y también en `feat/scheduler`" | Confirmado, y hay algo más: la rama **reemplaza** la entrada de `vercel.json` (conflicto de merge, §12) |

---

## D. Secuencia de trabajo recomendada

Cada paso indica de qué depende. Los pasos 0 y 1 se pueden hacer en paralelo; el 2 es requisito del 3 y del 5.

### Paso 0. Cerrar los agujeros explotables hoy (SQL a mano y un deploy chico)

| # | Acción | Depende de | Nota |
|---|---|---|---|
| 0.1 | Borrar la política `Creators can manage own events` y consolidar las duplicadas de `events` | **Antes**, cambiar `updateUserEvent` (`lib/actions.ts:306-324`), que hoy no toca `status` | Sin la política legacy, la del repo exige `status='DRAFT'` en el `WITH CHECK` de UPDATE. Un dueño que edite su evento publicado recibiría un error de RLS si el update no lo vuelve a `DRAFT`. Hoy hay 10 eventos con `created_by`, todos pasados |
| 0.2 | `event_views`: hacer DROP, porque no la usa ningún código, **o** habilitar RLS sin INSERT anónimo | — | La migración `20260729` tal como está agrega `INSERT WITH CHECK (true)` para `public`, así que mantiene abierto el vector de llenado |
| 0.3 | Agregar la guarda de admin en `app/admin/instagram/page.tsx` (copiar el patrón de `app/admin/aliases/page.tsx:12,23`) | — | Requiere deploy |
| 0.4 | Borrar la política de storage `Authenticated users can upload flyers` | — | Queda la que exige carpeta = uid |
| 0.5 | Validar el parámetro `next` en `app/auth/callback/route.ts:7,13` (solo rutas relativas que empiecen con `/` y no con `//`) | — | Requiere deploy |
| 0.6 | Fijar `search_path` en `is_admin()` y hacer REVOKE de EXECUTE de `handle_new_user()` para `anon` y `authenticated` | — | |

### Paso 1. Recuperar el contenido visible

| # | Acción | Depende de | Nota |
|---|---|---|---|
| 1.1 | Drenar la cola de IA: 87 pendientes | — | Hoy solo se dispara a mano: el botón del admin (`lib/admin-actions.ts:428`) o `POST /api/ai/process-flyers`, que procesa 3 por defecto y como máximo 10 (`route.ts:45`). Se necesitan 9 o más llamadas |
| 1.2 | Pasar a `DRAFT` o `CANCELLED` los 56 eventos "Revisar: Flyer de @…" | — | Todos son pasados, pero se pueden abrir por `/evento/[id]` |
| 1.3 | Decidir cómo se mantienen Peñas y Museos: volver a correr los scripts o automatizarlos | El paso 3.1 si se automatiza con el scheduler | `cargar-penas.mjs` lo dice en su encabezado: "N filas VENCE" |
| 1.4 | Decidir el orden de categorías. Hoy el flag está activo pero vencido; conviene ponerlo en `false` o borrarlo para que no engañe | — | Hoy aparece Boliches primero con 59 posts crudos |
| 1.5 | Revisar por qué @laviejaestacionensalta trae 0 flyers | — | |

### Paso 2. Poner el esquema bajo control (requisito del paso 3 y de la app móvil)

| # | Acción | Depende de | Nota |
|---|---|---|---|
| 2.1 | Inicializar Supabase CLI (`supabase/config.toml`) y volcar el esquema real de prod como migración *baseline* | 0.x, para que el baseline no capture los agujeros | Hoy solo 1 de 23 migraciones está registrada y hay 3+2+3+1+4 políticas que no están en el repo |
| 2.2 | Generar los tipos (`supabase gen types`) y reemplazar `lib/types.ts` | 2.1 | Ver §16 sobre el drift medido |
| 2.3 | Armar un Postgres de prueba con el dump de prod (`supabase start` local) | 2.1 | El plan Free no tiene branching. **Ninguna de las migraciones de las ramas se corrió contra Postgres** |

### Paso 3. Aplicar las ramas (siempre: migración primero y deploy después)

| # | Rama | Depende de | Pasos destructivos o irreversibles | Conflictos a resolver |
|---|---|---|---|---|
| 3.1 | `feat/scheduler` | 2.3 | Ninguno: solo crea `job_runs` y `job_last_runs` | `vercel.json` y `README.md`. Resolver el cron de cines según §12 |
| 3.2 | `fix/venue-canonical` | 2.3; **regenerar el plan contra 136 venues** | **Renombra venues** (`_data.sql:264`) y **copia address y geo del duplicado al canónico** (`:156-171`); `_down.sql` **no revierte ninguna de las dos** (`_down.sql:78-79` lo admite para geo). Las columnas, tablas y funciones nuevas no tienen down | `app/api/cron/scrape/route.ts`: `main` movió la lógica a `run-scrape-job.ts` en `6e5e28b`. Hay que portar `resolveVenue` → `resolveVenueId` a **`app/api/cron/scrape/run-scrape-job.ts:33-66`**, o el cron va a seguir con `ilike` |
| 3.3 | `fix/event-dedup` | 3.2 (recomendado: el merge usa el venue para resolver conflictos, y conviene que ya sea canónico); **agregar `security_invoker` a la vista** | La migración solo agrega columnas, índices y la vista. **`npm run dedup:events -- --apply` borra 13 filas de `events`.** Solo se pueden reconstruir a mano desde el snapshot en `merge_audit` | Merge limpio contra `main` |

### Paso 4. Endurecer para la app móvil

| # | Acción | Depende de |
|---|---|---|
| 4.1 | Mover a RLS o triggers las reglas que hoy aplican las server actions (status por rol, notificación al admin por un webhook de DB o Edge Function) | 0.1, 2.1 |
| 4.2 | Agregar un trigger `BEFORE INSERT` en `profiles` que fuerce `role='USER'` | — |
| 4.3 | Verificar `user_radar_settings.email_target` (o limitarlo al email de la cuenta) | — |
| 4.4 | Activar la protección contra contraseñas filtradas | — |
| 4.5 | Reescribir las 25 políticas marcadas por `auth_rls_initplan` usando `(select auth.uid())` y consolidar las 33 duplicadas | 2.1 |

### Paso 5. App móvil

Depende de los pasos 2.2, 3.1 (para push) y 4. Ver §14-19.

### Paso 6. Monetización y aspectos legales

| # | Acción | Depende de |
|---|---|---|
| 6.1 | Publicar `/ads.txt` (hoy da 404) | — |
| 6.2 | CMP de consentimiento si hay tráfico del EEE o del Reino Unido (hoy hay 0 rastros de `fundingchoices` o `googlefc` en la home) | — |
| 6.3 | Revisar el slot de AdSense: la consola muestra `TagError: No slot size for availableWidth=0` y el slot queda `unfilled` | — |
| 6.4 | Confirmar si la política de Vercel Hobby permite un sitio con AdSense y donaciones (ver E) | — |

---

## E. Lo que no pude determinar, y por qué

| Pregunta | Por qué no se pudo |
|---|---|
| Consumo real de Vercel (bandwidth, invocaciones, CPU) y qué se rompe primero ahí | El MCP de Vercel no expone el uso. La facturación devuelve `costs_not_found`. Los logs de runtime **retienen alrededor de 1 h** (en `group_by requestPath` de 7 días solo aparecieron mis propias requests) |
| Si hubo un redeploy el 2026-08-23 (PENDIENTES `:17-25`) | No figura en `list_deployments`. No hay forma de verificar qué deployment contestó el 401 que se menciona ese día |
| Costos de Gemini, Apify, Resend y el dominio | No tengo acceso a esas cuentas. El dominio `quepintasalta.com.ar` no se compró en Vercel (`boughtAt: null`), así que está en NIC.ar o en otro registrador |
| Si la newsletter se envió alguna vez y cuándo fue la última | No hay tabla de envíos y no tengo acceso a los logs de Resend. Tampoco si `RESEND_FROM_EMAIL` usa un dominio verificado |
| Por qué los 56 eventos de fallback están `PUBLISHED` cuando el código los inserta como `DRAFT` (`lib/ai/process-flyer-ai.ts:315`) | No hay auditoría de cambios de status. 9 de los 56 tienen `updated_at > created_at` |
| Por qué @laviejaestacionensalta trae 0 flyers | Haría falta mirar el run de Apify |
| Si el open redirect de `/auth/callback` es explotable de punta a punta | Depende de la allowlist de *Redirect URLs* de Supabase Auth, que no es legible con las herramientas disponibles. El código vulnerable está confirmado (`route.ts:7,13`) |
| Si Vercel Hobby acepta 4 crons en `vercel.json` (escenario §12-B) | No se deployó nada. Hoy hay 3 y el deploy funciona |
| Wording vigente del uso comercial en Vercel Hobby (AdSense y donaciones) | La búsqueda en la documentación de Vercel no devolvió la política. Hay que verificarlo a mano |
| Cómo se comportan las migraciones de las ramas en Postgres real | Estaba prohibido ejecutarlas. Solo se simuló el plan de venues en memoria y se corrió el dry-run de dedup |
| CSP en páginas que no sean la home | Solo se cargó la home en el navegador |
| Ítems de la auditoría mobile 4, 7, 8, 10, 12 y 13 de PENDIENTES | No se re-midieron |
| Egress de Supabase sin el ruido de esta auditoría | Los 31,7 MB en 24 h incluyen mis requests REST y la carga de la home en el navegador (entre 20 y 40 requests) |

---

# Anexo: evidencia por pregunta

## Fase 1: Estado visible

### 1. Eventos futuros por categoría

Medido a las 03:28 UTC. Cuenta `status='PUBLISHED' AND start_date >= now()`.

| Categoría | Futuros | Próx. 7 días | Último `start_date` publicado | Filas totales |
|---|---|---|---|---|
| espectaculos | 40 | 6 | 2027-04-04 | 154 |
| recitales | 17 | 2 | 2026-12-28 | 79 |
| humor | 6 | 3 | 2026-11-14 | 30 |
| boliches | 4 | 0 | 2026-11-22 | 244 |
| ballet | 2 | 1 | 2026-11-08 | 18 |
| infantil, museos, talleres, teatro | 1 cada una | 0 | — | 14, 549, 1, 18 |
| **penas** | **0** | 0 | 2026-10-01 00:00 UTC | 85 |
| **cine** (como evento) | **0** | 0 | 2026-08-14 | 9 |
| alternativo, automovilismo, congresos, deportes, ferias | 0 | 0 | — | — |
| **Total** | **73** | | | 1229 |

- **Museos.** El único evento futuro es de AlPogo (2026-11-21). EntradaUno sigue generando entre 5 y 6 filas por día con fecha del mismo día; la última es del 2026-10-01. Las filas generadas por adelantado con `cargar-museos.mjs` se terminaron.
- **Peñas.** Las 23 filas manuales vencieron el 2026-09-06.
- **Cine.** La fila de la home sale de `cinema_movies`: 13 en cartelera y 45 en total.
- **Qué muestra la home.** Las filas mezclan eventos, flyers de IG `ACTIVE/PENDING` (`lib/instagram/data.ts:18-19`) y películas, y agrupan las ocurrencias por título+lugar (`components/home-content.tsx:251-294`):
  - Boliches 63 = 59 flyers + 4 eventos.
  - Peñas 24 = 24 flyers + 0 eventos.
  - Alternativo 4 = 4 flyers.
  - Espectáculos 38 y Recitales 12: son los 40 y 17 eventos, una vez agrupadas las fechas repetidas.

### 2. Orden real de las categorías en la home

Leído del HTML que sirve `https://www.quepintasalta.com.ar/`, los `<h2>` de las filas:

1. Boliches (63)
2. Espectáculos (38)
3. Peñas (24)
4. Cine (13)
5. Recitales (12)
6. Humor (5)
7. Alternativo (4)
8. Ballet (2)
9. Infantil (1)
10. Museos (1)
11. Talleres (1)
12. Teatro (1)

`ORDEN_DEMO_ACTIVO = true` (`lib/config/category-order.ts:56`), pero `ORDEN_DEMO_HASTA = '2026-09-08T00:00:00-03:00'` (`:63`) ya pasó, así que `aplicarOrdenDemo` (`:89-90`) no hace nada. El orden efectivo es por volumen (`components/home-content.tsx:471-482`).

### 3. Última corrida de cada proceso de ingesta

| Proceso | ¿En cron? | Última corrida medida | Evidencia |
|---|---|---|---|
| `/api/cron/scrape` (ticketeras) | Sí, `0 8 * * *` (`vercel.json`) | **2026-10-01 08:49:56 UTC** | `events.created_at` máximo de `entradauno`; `updated_at` de norteticket, vamos y alpogo a las 08:49:5x |
| `/api/cron/instagram` | Sí, `0 0 * * 0,1,5,6` | **2026-10-02 00:38:12 UTC** | `instagram_flyers.fetched_at` máximo; último objeto de `flyers_ig` a la misma hora |
| `/api/scrape-cinemas` | Sí, `0 13 * * *` | **2026-10-01 13:27:26 UTC** | `cinema_movies.updated_at` máximo |
| Cola de IA de flyers | **No** | **2026-09-24 23:03:21 UTC** | `instagram_flyers.ai_processed_at` máximo. Solo se dispara a mano |
| Newsletter / Radar Salteño | **No** | No determinable (ver E) | `app/api/cron/radar-newsletter/route.ts` no figura en `vercel.json`. Hay 3 `user_radar_settings` con frecuencia `weekly` |
| `/api/cron/keep-alive` | No | — | No hace falta: los crons diarios ya mantienen activo el proyecto Free |

Detalle: `scrape_runs` solo registra corridas manuales del admin (la última es del 2026-09-04 16:49). `run-scrape-job.ts` no escribe en `scrape_runs`, así que el panel de admin muestra datos viejos aunque el cron corra todos los días.

### 4. Cola de flyers y fallback

- **Sin procesar, en la home:** 87 flyers `ACTIVE/PENDING`, con fetch entre 2026-09-25 00:37 y 2026-10-02 00:38. Por categoría: boliches 59, penas 24, alternativo 4.
- **Archivados sin procesar nunca:** 33 `ARCHIVED/PENDING`.
- **Procesados por mes con respuesta del modelo:** julio 201, agosto 157, septiembre 142. Errores con fallback: julio 7, septiembre 64 (todos el 2026-09-15).
- **Flyers con `is_fallback`:** 71, todos `ARCHIVED`.
- **Eventos con `is_fallback`:** 56. **53 se crearon después del 2026-09-05**, todos el 2026-09-15. Todos son `PUBLISHED`, el título es "Revisar: Flyer de @cuenta" (por ejemplo @lametrosalta ×7 o @oneoficialsalta ×5), tienen `start_date` igual a la fecha del post, ninguno es futuro y ninguno tiene `venue_id` nulo.

## Fase 2: Seguridad

### 5. RLS

Ver la sección B. Advisors de Supabase:

- **Seguridad:** 1 ERROR (`event_views`), 4 WARN de `search_path` mutable, 2+2 WARN por `SECURITY DEFINER` ejecutable por anon y authenticated, 1 WARN por la protección de contraseñas filtradas apagada y 1 INFO (`data_migrations` sin políticas).
- **Performance:** 25 `auth_rls_initplan`, 33 `multiple_permissive_policies`, 9 FK sin índice y 5 índices sin uso.

### 6. Service role y variables `NEXT_PUBLIC_`

- **Service role** (`lib/supabase/server.ts:5-17`, `lib/admin-actions.ts:18-27`):
  - Se usa en 11 archivos y ninguno es `"use client"`.
  - Revisé el bundle servido: 24 chunks, 1,41 MB. Hay **0** coincidencias de `service_role` (literal o en base64), `sb_secret_`, claves de Gemini, Apify o Resend. El único JWT es el de rol `anon`.
- **Módulo `"use server"` sin auth.** `lib/instagram/process-apify-payload.ts` usa service role y exporta tres funciones sin chequeo de autenticación: `processApifyPayload` (`:93`), `archiveExpiredFlyers` (`:208`) y `triggerApifyInstagramScraper` (`:243`).
  - Hoy solo las importan route handlers y otras acciones del servidor (`app/api/webhooks/apify/route.ts:2`, `app/api/cron/instagram/route.ts:2`, `run-scrape-job.ts:6` y `lib/scraper-actions.ts:200`), así que no quedan referenciadas desde un cliente.
  - Igual conviene sacar `"use server"` del archivo o marcarlo con `server-only`: si mañana un client component lo importa, quedan expuestas como acciones públicas.
- **Variables `NEXT_PUBLIC_` en Vercel:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SITE_URL`, `ADSENSE_CLIENT_ID` y `CONTACT_WHATSAPP`.
  - **Ninguna es sensible**; todas son públicas por diseño.
  - El código además referencia `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL`, que no está definida en Vercel.
- **Secretos legibles en el dashboard.** Vercel marca `readable-secret` en 7 variables que agregó la integración de Supabase (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWT_SECRET`, `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_PRISMA_URL` y `POSTGRES_PASSWORD`). Son de tipo `encrypted` y no `sensitive`, así que cualquier miembro del team las puede leer, también en el entorno *development*.

### 7. Endpoints

| Ruta | Método | Auth que exige | Sin credencial (medido) |
|---|---|---|---|
| `/api/cron/scrape` | GET | Bearer `CRON_SECRET`, *fail-open* si la variable falta (`route.ts:9`) | 401 |
| `/api/cron/instagram` | GET | Igual (`route.ts:11`) | 401 |
| `/api/scrape-cinemas` | GET | Bearer **o `?secret=`**, *fail-open*, y bypass en `NODE_ENV=development` (`route.ts:12-16`) | 401 (por header y por query) |
| `/api/cron/radar-newsletter` | GET | Bearer, *fail-open* (`route.ts:73`) | 401 |
| `/api/cron/keep-alive` | GET | Bearer, *fail-open* (`route.ts:13`) | 401 |
| `/api/webhooks/apify` | POST | Header `x-apify-webhook-secret` **o `?secret=`**, *fail-open* (`route.ts:19-22`) | 401 |
| `/api/webhooks/apify` | GET | **Ninguna** (`:105`) | **200** (health) |
| `/api/ai/process-flyers` | POST | Bearer o `?secret=` con `APIFY_WEBHOOK_SECRET`, *fail-open* (`route.ts:23-31`) | 401 |
| `/api/ai/process-flyers` | GET | **Ninguna, y usa service role** (`:141-172`) | **200**: `pending_active_flyers 87, processed 329, failed 9`, modelo |
| `/auth/callback` | GET | Código OAuth | **Open redirect**: `next` va directo a `` `${origin}${next}` `` (`route.ts:7,13`). Con `next=@evil.com` el resultado es `https://www.quepintasalta.com.ar@evil.com` |
| Server actions de admin | POST | Chequean `role='ADMIN'` (`lib/admin-actions.ts`, `lib/scraper-actions.ts`, `lib/instagram/admin-actions.ts`, `lib/user-actions.ts`) | — |

- **Rutas nuevas en las ramas.** `/api/admin/dedup` (sesión de admin o Bearer), `/api/cron/dispatch`, `/api/cron/health` y `/api/cron/run/[job]`. Las tres de `/api/cron` usan `checkSchedulerAuth`, que es ***fail-closed*** (`lib/scheduler/auth.ts`).
- **Páginas.** `/admin/instagram` responde 200 (§A.4). `/admin/pendientes` redirige a `/login` (`app/admin/pendientes/page.tsx:17`), que da **404**. El middleware solo protege `/nuevo-evento`, `/crear-evento`, `/perfil` y `/protected` (`lib/supabase/proxy.ts:44`).

### 8. Páginas legales y AdSense

- **Estado HTTP:**
  - `/privacidad`: **200**. Tiene una sección de cookies y publicidad con los links de Google (`app/privacidad/page.tsx:83-112`) y está linkeada desde el footer.
  - `/terminos`, `/terminos-y-condiciones`, `/cookies`, `/politica-de-cookies`, `/contacto` y `/acerca`: **404**.
  - **`/ads.txt`: 404.**
- **Qué exige AdSense.** Las políticas de AdSense piden una política de privacidad que informe sobre las cookies y los proveedores de terceros, y eso ya está cubierto. Las páginas de términos y de cookies **no son obligatorias** para AdSense. Lo que sí falta:
  - **`ads.txt`**: sin ese archivo AdSense muestra la advertencia de "ingresos en riesgo".
  - **Un CMP certificado** para servir anuncios a tráfico del EEE, Reino Unido o Suiza. Hoy no hay ninguno en la home (0 coincidencias de `fundingchoices` o `googlefc`).
- **Estado del anuncio.** El script de AdSense carga con `ca-pub-2887416374800783` (`app/layout.tsx:114`). Hay 1 slot `ins.adsbygoogle` con estado **`unfilled`**, y la consola tira `TagError: adsbygoogle.push() error: No slot size for availableWidth=0`.

### 9. CSP

La política que se sirve es idéntica a `next.config.mjs:17-24`.

- **Violaciones:** 0, medidas en la home con un listener de `securitypolicyviolation`, con scroll completo y revisando la consola.
- **Hosts que cargaron:** `analytics.google.com`, `contenidos.entradauno.com`, `ep1` y `ep2.adtrafficquality.google`, `googleads.g.doubleclick.net`, `norteticket.com`, `pagead2.googlesyndication.com`, `*.supabase.co`, `stats.g.doubleclick.net`, `www.google.com`, `www.google.com.ar` y `www.googletagmanager.com`. También imágenes de `cdn.cinemark.com.ar`, `apiv2.gaf.adro.studio` e `imagenes.alpogo.com`, todas cubiertas por la política.
- **Debilidades (no bloquean nada):**
  - `script-src` incluye `'unsafe-inline'` y `'unsafe-eval'`.
  - Se carga el contenedor de GTM `GTM-WZK9W6BJ`, que puede inyectar cualquier script que la CSP permita.
  - Falta `base-uri`.
- **Otras cabeceras servidas:** HSTS `max-age=63072000`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` y `Permissions-Policy: geolocation=()`. Esta última bloquea la geolocalización en la web, lo que importa para una función de "cerca mío".

## Fase 3: Ramas sin aplicar

### 10. Merge, typecheck y build

Medido en un worktree temporal desde `origin/main`.

| Rama | Merge con `main` | Typecheck | `next build` |
|---|---|---|---|
| `main` (base) | — | **0 errores** | OK, 36 rutas |
| `fix/venue-canonical` | **Conflicto** en `app/api/cron/scrape/route.ts` | 0 errores* | OK* |
| `fix/event-dedup` | **Limpio** | 0 errores | OK |
| `feat/scheduler` | **Conflictos** en `vercel.json` y `README.md` | 0 errores* | OK* |
| Las tres juntas (venue → dedup → scheduler) | Entre ellas no hay conflictos; con `main`, los mismos de arriba | 0 errores* | OK* |

\* Los conflictos se resolvieron solo para poder compilar: `route.ts` y `README.md` quedaron con la versión de `main`, y `vercel.json` con la unión de los crons.

- **El build no detecta errores de tipos.** `next.config.mjs:4` tiene `typescript.ignoreBuildErrors: true`, así que un deploy en Vercel nunca falla por tipos. El typecheck se corrió aparte.
- **Para construir hacen falta variables de entorno.** `/admin/instagram` se prerenderiza en build y llama a `createAdminClient()`.

### 11. Duplicados hoy

- **Eventos.** El dry-run oficial de la rama (`scripts/dedup-events.ts --include-past`, sin `--apply`) dio:
  - **1229 eventos, 11 grupos, 13 fusiones → 1216**.
  - Desde hoy en adelante: **73 eventos, 2 grupos, 2 fusiones**.
  - Un port propio de `buildDedupKey()` a SQL dio el mismo número: 11 grupos y 13 filas. 7 de los grupos son de `instagram-ai` contra sí mismo y 5 tienen `venue_id` distintos.
- **Venues: 136.** Por mes de alta: mayo 27, junio 2, julio 54, agosto 24, septiembre 29. **37 se crearon después del 2026-08-21.** 20 no tienen eventos y solo 6 tienen latitud.
- **Simulación del plan de `fix/venue-canonical` contra los datos de hoy** (en memoria, con rollback):
  - **Las 32 fusiones curadas aplican, ninguna se saltea**, y mueven 74 eventos.
  - Hay **1 fusión automática** por clave exacta ("Marcelino Freyre 1438-1498", duplicado, 1 evento) y 1 placeholder.
  - Resultado: **136 → 102 canónicos**. En agosto era 103 → 70.
- **Lo que el plan no cubre.** Entre los 37 venues nuevos hay duplicados visibles que no están en la lista curada:
  - `Treinta y Pico Salta` y `Treintaypico`, frente a `30 y Pico`;
  - `Casa Grande`, frente al cluster de Casagrande;
  - `Balderrama` y `Peña Boliche Balderrama`;
  - `La Casona de G\r\nuemes`, **con un CRLF dentro del nombre**.
  - Además hay unos 10 venues que son direcciones sueltas ("Balcarce 920", "San martin 484", etc.).
- **El script `venue-audit.mjs` cuenta mal los eventos.** Imprime "Eventos totales: 1000" cuando son 1229, porque choca con el límite de 1000 filas de PostgREST. Los conteos por venue que muestra salen truncados.

### 12. Solapamiento del cron de cines

- **`main`:** `vercel.json` dispara `/api/scrape-cinemas` a las `0 13 * * *` (10:00 en Salta).
- **`feat/scheduler`:** en `vercel.json` **saca esa entrada** y pone `/api/cron/dispatch` a las `0 21 * * *`. En `lib/scheduler/jobs.ts` declara `cines` con `managed: true` a las 21:00 UTC (18:00 en Salta).
- **Si se hace la unión ingenua**, los cines corren dos veces por día. No se rompe nada, porque el upsert es idempotente, pero se duplica el trabajo.
- **Resolución recomendada (A):** dejar `/api/scrape-cinemas` en `vercel.json` a las 13:00 UTC y marcar `cines` como `managed: false` en `jobs.ts`, igual que `ticketeras`. Así se mantiene el horario diurno (el ítem 1 de PENDIENTES explica que de noche Cinemark ya rotó al día siguiente) y el dispatcher se ocupa solo de la cola de IA (20 por día) y de la newsletter (los jueves). Hay que verificar que Hobby acepte 4 crons (ver E).
- **Alternativa (B):** quedarse con la versión de la rama (sacar la entrada y que los cines corran a las 18:00 en Salta desde el dispatcher). Deja 3 crons en `vercel.json`, como hoy.

### 13. Si se aplican las tres migraciones en orden

**Dependencias entre ellas:**

- Ninguna referencia objetos de otra.
- Las tres dependen de `is_admin()` o de `profiles.role`, que ya existen.
- `venue_canonical.sql` crea la extensión `pg_trgm` y `data_migrations` con `IF NOT EXISTS`; la tabla ya existe.
- `event_dedup` no depende de `venue_canonical` en SQL, pero sí en la lógica de merge (§D 3.3).

**Dependencias entre código y migración (la migración tiene que ir antes que el deploy):**

| Rama | Si se deploya el código antes que la migración |
|---|---|
| `venue-canonical` | **Se degrada en silencio.** `resolveVenueId` loguea el error de la RPC y devuelve `null`, así que los eventos se guardan sin venue (`lib/venues/resolve.ts:57-70`). `getVenues()` devuelve `[]` porque filtra por `canonical_venue_id` (`lib/data.ts:163`) |
| `event-dedup` | Tolerante: detecta que faltan las columnas (`lib/scraper/deduplicate.ts:28`) |
| `scheduler` | El dispatcher falla porque no existe `job_runs`, pero el resto del sitio no se ve afectado |

**Pasos destructivos o irreversibles:**

1. **`venue_canonical_data.sql`.** Repunta `events.venue_id`; eso sí se puede revertir con el log. Pero **renombra venues** (`:264`) y **copia address y geo** del duplicado al canónico (`:156-171`), y `_down.sql` **no revierte ninguna de las dos cosas**. El `_down` tampoco borra las columnas, tablas ni funciones nuevas.
2. **`event_dedup.sql`.** Es aditiva y reversible. **El borrado de filas viene después, con `dedup:events --apply`**: hoy serían 13 eventos (`dedup-cleanup.ts:361`). Las referencias de `user_favorites` y `event_views` y los `ai_metadata` de los flyers se repuntan antes (`:253-281`).
3. **`scheduler_job_runs.sql`.** Es aditiva. Crea un índice único parcial `job_runs_single_running_idx`.

## Fase 4: Preparación para la app móvil

### 14. Capa de datos

- **Archivos con queries:**
  - **23** archivos en `app/` y `components/` hacen `.from(...)` directo. Por ejemplo `app/favoritos/page.tsx` (4), `app/evento/[id]/page.tsx` (2), `app/page.tsx` (1) y `components/navbar.tsx` (1, cliente).
  - **17** archivos en `lib/` tienen queries.
- **Acoplamiento a Next.** **10** archivos de `lib/` importan `next/headers`, `next/cache` o `next/navigation`. Todas las funciones de datos usan `createClient()` de `lib/supabase/server.ts`, que lee las cookies con `next/headers`.
- **Se reutiliza si se parametriza con un `SupabaseClient`:**
  - `lib/data.ts` (8 queries)
  - `lib/instagram/data.ts` (6)
  - `lib/actions/favorites.ts` (4)
  - `lib/actions/radar.ts` (13)
  - la lógica de matching del Radar (`app/api/cron/radar-newsletter/route.ts:107-193`)
- **Ya es portable:** `lib/date-format.ts` (sin imports), `lib/types.ts` y `lib/scraper/categorize.ts`.
- **Hay que reescribir o extraer:**
  - La **lógica de negocio que vive dentro del componente cliente** `components/home-content.tsx` (684 líneas): `transformEvent` (`:120`), `transformFlyer` (`:143`), el agrupado por título+lugar (`:251-294`), `getCategoryPriority` (`:33`), la selección del carrusel (`:332-376`), los filtros (`:378-458`) y el orden (`:460-483`).
  - Las server actions, que mezclan acceso a datos con `revalidatePath` y `redirect`.

### 15. Auth

- **Cómo funciona hoy:**
  - **Google:** `signInWithOAuth` con redirect a `/auth/callback?next=…` (`lib/supabase/client.ts:10-37`) y `exchangeCodeForSession` por cookies (`app/auth/callback/route.ts:11`).
  - **Email:** `signInWithPassword` (`app/auth/login/page.tsx:55`, `components/auth-modal.tsx:76`) y `signUp` con `emailRedirectTo` a la web (`app/auth/sign-up/page.tsx:68-72`, `components/auth-modal.tsx:87-91`).
  - **Sesión:** cookies de `@supabase/ssr`, que el middleware refresca (`lib/supabase/proxy.ts`).
- **Compatibilidad con React Native.** Es compatible a nivel Supabase Auth, porque es la misma instancia y los mismos usuarios (26: 12 identidades de email y 15 de Google). En la app hay que hacer:
  - sesión en SecureStore o AsyncStorage;
  - Google por SDK nativo con `signInWithIdToken`, o por OAuth con deep link (agregando el scheme a las *Redirect URLs*);
  - links de confirmación de email que abran la app o confirmen en la web.
- **No se porta** porque está atado a Next: `lib/supabase/server.ts`, `lib/supabase/proxy.ts`, `/auth/callback`, la protección de rutas del middleware y los chequeos de auth dentro de las server actions.
- **Se porta tal cual:** RLS y el patrón `profiles.role`.

### 16. Tipos

- **Están escritos a mano:**
  - `lib/types.ts`: 147 líneas, con el comentario "Database types matching Supabase schema";
  - `lib/instagram-config.ts`;
  - `lib/ai/types.ts`.
- **No hay generación automática:** no existe `supabase/config.toml` ni un tipo `Database`.
- **Drift medido:**
  - `UserRole` incluye `'COLLABORATOR'` (`lib/types.ts:2`), pero el enum `user_role` en la base es solo `USER,ADMIN`. Eso deja muertas la rama `isCollaborator → PENDING` de `createEvent` (`lib/actions.ts:72-73`) y la opción de `updateUserRole` (`lib/user-actions.ts:39`), que fallaría en la base.
  - `EventCategory` (`lib/types.ts:100`) lista 8 slugs; la tabla `categories` tiene 16.

### 17. Lo que el servidor de Next hace y la app no va a poder hacer con Supabase directo

- Los scrapers: ticketeras con cheerio, cines y AlPogo.
- El disparo de Apify y el webhook que recibe su resultado.
- El procesamiento con Gemini (`GEMINI_API_KEY`).
- Los mails de Resend:
  - aviso al admin cuando se carga un evento (`lib/actions.ts:104-133`);
  - mail de prueba del Radar (`lib/actions/radar.ts:265`);
  - newsletter.
- Los crons.
- Las acciones de admin que usan service role.
- La lógica de `createEvent`: generar el slug, decidir el status según el rol, notificar y `revalidatePath`.

Todo eso tiene que pasar a Edge Functions, webhooks o triggers de la base, o quedarse en Next como un backend que la app llama para esos casos puntuales.

### 18. Push notifications

**Lo que sirve como base:**

- Modelo de intereses: `user_radar_settings` (3 filas), `user_followed_categories` (16), `user_followed_venues` (9) y `user_followed_instagram_accounts` (7).
- Lógica de matching: `radar-newsletter/route.ts:107-193`.
- `profiles.notification_preferences`: tiene valores en 26 de 26 perfiles y el tipo `'PUSH'` está definido en `lib/types.ts:4`, **pero ningún código lo lee**.

**Lo que hay que construir desde cero:**

- una tabla de **tokens de dispositivo**, que hoy no existe entre las 18 tablas;
- un **log de envíos** con deduplicación por destinatario (la newsletter no lleva registro: lo dice el comentario de `lib/scheduler/jobs.ts` en la rama);
- la programación, porque la newsletter no está en ningún cron;
- el emisor con Expo Push.

### 19. Funcionalidades

**Tienen sentido en la app:**

- Agenda del día y de la semana. Los datos alcanzan: 73 eventos futuros con `start_date`.
- Búsqueda (`/buscar`).
- Ficha del evento, con compartir y link a la ticketera (`ticket_url`).
- Cines de hoy (13 películas; sin semana, ver PENDIENTES ítem 3).
- Favoritos (26 filas de 4 usuarios: 15 eventos, 9 flyers, 2 películas).
- Radar convertido en push.
- Login.

**No tienen sentido, o no todavía:**

- **Mapa.** Solo **6 de 136** venues tienen coordenadas; hay que geocodificar primero.
- Todo el panel de admin: scraping, revisión de IA, aliases y clasificación.
- SEO: sitemap y JSON-LD.
- AdSense, que en móvil sería AdMob, un producto distinto.
- Carga de eventos por usuarios, hasta que se cierre el §A.1.
- Donaciones con Mercado Pago: hay que revisar las políticas de las tiendas.

## Fase 5: Infraestructura y costos

### 20. Planes y consumo frente a los límites

| Recurso | Medido | Límite del plan Free de Supabase |
|---|---|---|
| Base de datos | **18 MB**. Las tablas más grandes: `events` 2,1 MB, `instagram_flyers` 1,4 MB | 500 MB |
| Storage | **139 MB** (`flyers_ig` 133 MB, 707 objetos, 193 KB promedio). Crecimiento por mes: julio 53 MB, agosto 28 MB, septiembre 44 MB | 1 GB |
| Egress | **31,7 MB en 24 h** (1782 requests en `edge_logs`, suma de `content-length`; incluye el ruido de esta auditoría) | 5 GB/mes |
| MAU | **2** (`last_sign_in_at` de los últimos 30 días); 26 usuarios en total | 50.000 |

- El crecimiento del storage depende de la ingesta de Instagram, no del tráfico.
- La organización tiene un segundo proyecto, `ventanilla-ciudadana`, en estado INACTIVE (pausado).
- En Vercel no se pudo medir el consumo (ver E).

**¿Qué se rompe primero si el tráfico se duplica?**

- Con lo que se pudo medir, **ningún límite de Supabase está cerca**.
- El recurso que más crece con el tráfico es el **egress de Supabase**. Las imágenes se sirven directo desde los buckets públicos porque `images.unoptimized: true` las saca de la CDN de Vercel (`next.config.mjs:7`).
- Proyección, no medida: duplicar el tráfico sería del orden de 2 GB por mes, sobre un límite de 5 GB.
- Con la app móvil, **todo** el tráfico de imágenes y de API pasa a Supabase.
- En Vercel no puedo responder con datos. Hay un riesgo que no depende del volumen: si el plan Hobby prohíbe el uso comercial, el sitio con AdSense y donaciones queda expuesto a una suspensión (ver E).

### 21. Costos mensuales

| Servicio | Costo medido | Volumen medido |
|---|---|---|
| Vercel | **US$0** (Hobby, sin cargos entre 2026-07-01 y 2026-10-01) | No medible |
| Supabase | **US$0** (plan Free) | Ver §20 |
| Gemini | No medible (ver E) | Llamadas con respuesta: julio 201, agosto 157, septiembre 142. Errores: septiembre 64 (404, sin costo de tokens) |
| Apify | No medible | Cron 4 veces por semana sobre 24 cuentas activas |
| Resend | No medible | — |
| Dominio `.com.ar` | No medible (no está registrado en Vercel) | — |

**Lo que agregaría la app móvil** (estimado, porque es lo que se pidió):

| Ítem | Costo |
|---|---|
| Apple Developer Program | US$99 por año |
| Google Play Console | US$25 una sola vez |
| EAS Build | Tiene un plan gratuito con builds limitados por mes; verificar el cupo vigente antes de decidir |
| Expo Push Service | Sin costo por envío |
| Supabase | Con el plan Free actual, el primer límite que se va a sentir es el egress (5 GB/mes), por el tráfico de imágenes y de API que hoy pasa por Vercel. El siguiente escalón es Supabase Pro |
