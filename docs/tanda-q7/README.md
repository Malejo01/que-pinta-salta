# Tanda Q7 · 15/11 tarde → 23:30 (hora de Salta)

Base: `main` en `1298983` (después de #202, ahorro de builds de Vercel). Rama de integración: `ronda/integracion-q7`.

Contexto: el acceso a producción en Play se pidió el 15/11 (Google tarda hasta 7 días). Desde #202 las ramas no construyen en Vercel salvo que el último commit diga `[preview]` (ver `CLAUDE.md`).

## Estado medido al arrancar (15/11)
- Lugares: 167, de los cuales 19 tienen coordenadas. 128 nunca se intentaron geocodificar y 20 se intentaron sin éxito. 16 eventos futuros publicados caen en lugares sin mapa.
- 73 eventos futuros publicados y 1 destacado vigente.
- Workflows de Actions en verde; Sentry sin errores de QPS.
- Search Console marca eventos sin `description`, `offers` ni `image`, en los `Event` anidados de `/lugar/<slug>` (`apps/web/lib/seo/json-ld-lugar.ts`).

## Reglas
- **Prefijo** de commits y PRs: `[nube Q7]`. Ramas `nube/q7-<tema>`, un PR por ticket contra `ronda/integracion-q7`.
- **Previews de Vercel:** sin `[preview]` en los commits, salvo el último del ticket de admin (Q7-4), para revisar la UI.
- **Migraciones:** solo aditivas, en `supabase/migrations` con timestamp nuevo, test pgTAP y tipos. **No las aplica la sesión**: van en `docs/tanda-q7/sql-produccion.md` para que Mauro las corra en el editor de Supabase.
- **Sin dependencias nuevas.** Si hace falta una, va como «Propuesta» en el PR. Excepción: `expo-build-properties` en Q7-5, si no está.
- **Prohibido tocar:** `.env*`, `.claude/`, las páginas legales (privacidad, términos, eliminar cuenta), `lib/publicidad/**` y `app/api/cron/publicidad/**`.
- **Gasto en APIs pagas:** USD 0. Supabase solo con datos inventados y los dobles de prueba que ya existen.
- **Nada se mergea a `main`.** Lo integra el supervisor.
- **Control:** antes de cada ticket, la sesión lee el último comentario del issue #106. Solo cuentan los de Malejo01 o los que empiezan con «supervisor». «PAUSA» = terminar el paso, comentar el estado y revisar cada 15 min. «SEGUÍ» = continuar.
- **Cierre:** a más tardar a las 23:30 del 15/11 (hora de Salta).
- Textos en castellano rioplatense, con voseo.

## Cola
| Ticket | Rama | Qué |
|---|---|---|
| Q7-1 | `nube/q7-base` | Esta base: rama de integración, PR draft y este README |
| Q7-2 | `nube/q7-geocodificacion` | Que la geocodificación avance de verdad: diagnóstico, prioridad a lugares con eventos, tope configurable, fallback por nombre, links de Google Maps y script en seco |
| Q7-3 | `nube/q7-jsonld-lugar` | `description`, `image` y `offers` en los `Event` del JSON-LD de `/lugar/<slug>` y del resto de los JSON-LD de eventos |
| Q7-4 | `nube/q7-admin-modal` | En el modal de evento, para ADMIN: «Abrir ficha completa» y estado del destacado |
| Q7-5 | `nube/q7-peso-app` | Peso del AAB: R8, shrink de recursos, reglas de ProGuard y mapeo a Sentry; propuesta de dependencias y assets |
| Q7-6 | `nube/q7-cierre` | Integración y resumen |

## Cierre (Q7-6)

Todo está mergeado en `ronda/integracion-q7`, con CI en verde. El PR a `main` es Malejo01/que-pinta-salta#204 (draft): **lo integra el supervisor**. En la punta de la integración pasan el typecheck del monorepo, los tests de la web (13 128) y los de la app (7 692).

### Qué se hizo
| Ticket | PR | Qué |
|---|---|---|
| Q7-1 · Base | #203 | Rama de integración, PR draft y este README |
| Q7-2 · Geocodificación | #205 | La corrida diaria mira **todos** los lugares sin coordenadas, primero los que tienen eventos (antes, solo esos: por eso la cola no avanzaba).<br>Tope de 20 por corrida (`GEOCODIFICACION_TOPE`, hasta 30), siempre a menos de 4 pedidos por minuto.<br>«nombre, Salta, Argentina» acotado a la ciudad cuando la dirección es vacía o genérica.<br>Coordenadas sacadas de los **links de Google Maps** de los eventos (solo se parsea el link) como sugerencia de confianza alta.<br>`--seco --prioridad-eventos`.<br>En `/admin/lugares`, las sugerencias van primero, con contador; la portada del admin avisa cuántas hay |
| Q7-3 · JSON-LD | #206 | Los `Event` de `/lugar/<slug>` suman `description`, `image` y `offers` con funciones compartidas con la ficha del evento (`lib/seo/json-ld-evento.ts`). La portada, `/cines` y `/finde` (que no existe como ruta) no tienen `Event` embebidos |
| Q7-4 · Admin en el modal | #207 | En el modal del evento (la ruta interceptada `@modal`, que abren la portada y `/buscar`), para ADMIN: el estado del destacado y «Abrir ficha completa». El rol se lee en el servidor. Preview: https://quepintasalta-git-nube-q7-admin-modal-lizarraga-mauros-projects.vercel.app |
| Q7-5 · Peso de la app | #208 | **Requiere build 10.**<br>R8 y `shrinkResources` con `expo-build-properties`, más reglas para las librerías nativas. Todo detrás del perfil `production-r8`, así que `production` no cambia.<br>El mapeo de R8 sube a Sentry si hay token; sin token, `-dontobfuscate`.<br>Línea base: AAB del build 9 = 96,5 MB, sin R8. Detalle y checklist en `docs/tanda-q7/peso-app.md` |
| Pendiente de #173 | #209 | «Peña» sola en el título o en el lugar clasifica como peña. El texto se normalizaba sin tildes y `/peña/` nunca coincidía |

### SQL para Mauro
`docs/tanda-q7/sql-produccion.md`. **No hay migraciones en esta tanda.** El archivo trae:
- **A1–A4**, solo lectura: diagnóstico de la geocodificación (historial de `job_runs`, por qué no avanzan los lugares, sugerencias pendientes y links de Maps en los eventos).
- **B**, opcional: que los 20 lugares ya intentados vuelvan a la cola sin esperar los 30 días.

### Decisiones abiertas
1. **Coordenadas por link de Maps:** A) quedan como sugerencia que confirma un admin con un botón (lo que hace #205, sin migración); B) migración aditiva para `geocode_source = 'enlace'` y guardado directo, sin clic.
2. **Bloque B del SQL:** A) correrlo ahora, y los 20 se reintentan desde mañana con la consulta nueva; B) esperar a que vuelvan solos (30 días desde su intento).
3. **Tope de la geocodificación:** A) dejar 20 por corrida (no hace falta tocar nada); B) subir a 30 con la variable `GEOCODIFICACION_TOPE`.
4. **Build 10:** A) sale del perfil `production-r8` (con R8) después de la prueba manual de `peso-app.md`; B) sale de `production` como siempre y R8 se prueba en un build aparte.
5. **Mapeo de R8 en Sentry:** A) cargar `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` y `SENTRY_PROJECT` en EAS y sacar `SENTRY_DISABLE_AUTO_UPLOAD`, para ofuscar y subir el mapeo; B) seguir sin token, con R8 sin ofuscar (`-dontobfuscate`).
6. **MapLibre**, que la app no importa en ningún lado: A) sacarlo en la próxima tanda (≈ 15,6 MB menos de AAB y ≈ 10,8 MB menos instalada en arm64); B) mantenerlo para un mapa nativo futuro.
7. **Solo ABIs ARM** (`buildArchs`): A) sí, el AAB baja ≈ 40 % del peso nativo; B) no, para seguir cubriendo x86 (emuladores, algunos Chromebooks).
8. **`components/event-modal.tsx`**, que `/buscar` monta pero nunca abre: A) borrarlo junto con `selectedEvent` en `buscar-content.tsx`; B) dejarlo.

### Pasos manuales
1. **Supabase**, SQL Editor (https://supabase.com/dashboard → proyecto → SQL Editor): correr **A1** y **A2** de `sql-produccion.md` y, según la decisión 2, el **B**.
2. **GitHub:**
   - confirmar que estén los secrets `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`: https://github.com/Malejo01/que-pinta-salta/settings/secrets/actions (sin ellos, la geocodificación diaria termina en verde sin hacer nada);
   - opcional: la variable `GEOCODIFICACION_TOPE` en https://github.com/Malejo01/que-pinta-salta/settings/variables/actions;
   - para probar ya: Actions → «Lugares al mapa (geocodificación diaria)» → *Run workflow* (https://github.com/Malejo01/que-pinta-salta/actions/workflows/geocodificar-lugares.yml).
3. **Admin:** después del merge, entrar a https://www.quepintasalta.com.ar/admin/lugares y confirmar o descartar las sugerencias. Ahora van primero.
4. **Search Console**, después del merge a `main`: https://search.google.com/search-console → Mejoras → Eventos → «Validar corrección».
5. **EAS** (si la decisión 5 es A): https://expo.dev/accounts/malejo01/projects/que-pinta-salta/environment-variables → entorno `production`.
6. **Build 10:** `eas build -p android --profile production-r8`, el checklist de `docs/tanda-q7/peso-app.md` y la comparación con el AAB de 96,5 MB.
7. **Vercel** (de la lista de Mauro): https://vercel.com/dashboard → quepintasalta → Settings:
   - en Build & Deployment, la build machine estándar y el «Ignored Build Step» del panel vacío;
   - en Deployment Retention, los previews a 7 o 14 días.
8. **Play Console:** declarar el estado de operador en https://play.google.com/console/u/0/developers/8560134222829965882/home («Empezar»). Es obligatorio antes de febrero de 2027.
