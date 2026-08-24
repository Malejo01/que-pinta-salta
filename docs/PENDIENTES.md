# Pendientes

Backlog abierto al **2026-08-23**. Sale de la auditoría mobile y de la revisión
del scraper de cines de esa noche. Lo que ya se arregló no está acá: está en
`git log`.

Cada ítem dice **dónde** se toca y **qué se midió**, para no re-diagnosticar.

---

## Bloqueantes de producción

### 1. `CRON_SECRET` parece no estar seteado en Vercel

`/api/scrape-cinemas`, `/api/cron/instagram` y `/api/cron/scrape` usan el mismo
patrón: si la variable no existe, **no validan nada**.

```js
// app/api/scrape-cinemas/route.ts:12
const isAuthorized = !CRON_SECRET || authHeader === "Bearer " + CRON_SECRET || ...
```

**Evidencia:** un GET a `/api/scrape-cinemas` en producción con el header
`Authorization: Bearer` vacío devolvió `200` y ejecutó el scraper. En producción
`NODE_ENV === 'production'`, y un Bearer vacío no puede igualar a un secreto no
vacío, así que la única rama que pudo pasar es `!CRON_SECRET`.

**Impacto:** cualquiera puede disparar scraping saliente y escrituras a la base.
Amplificación de costo, porque Apify se cobra por corrida.

**Además:** en `.env.local` la clave está escrita como `CRON_SECRET =`, con un
espacio antes del igual. Los scripts la levantan igual porque hacen `.trim()`,
pero conviene normalizarla.

---

## Cines

### 2. Re-disparar el scraper de día

Corrió el 2026-08-23 a las 23:02 de Salta y **capturó casi nada**: quedaron
**5 funciones**, todas de Cine Ópera. Los dos Cinemark devolvieron cero.

No es un bug del scraper. A esa hora la página de Cinemark ya rotó a mañana: sus
`startDate` eran `2026-08-24` (44), `2026-08-25` (44) y `2026-08-26` (44),
ninguno para el día en curso, y el filtro de `cinema-scraper.ts:177` y `:273`
descarta todo lo que no sea hoy.

Se arregla corriéndolo de día, con el mismo endpoint.

Antes de esa corrida había 61 funciones, pero eran del **2026-07-27** — un mes de
antigüedad mostrándose como si fueran de hoy. No se restauró ese snapshot a
propósito.

### 3. El scraper de cines no está en ningún cron

`vercel.json` tiene dos crons y ninguno lo incluye: `/api/cron/scrape` (08:00
diario) importa solo `scrapeNorteTicket`, `scrapeEntradaUno` y `scrapeAlpogo`.
El único disparador es a mano.

Cuando se enganche a un scheduler, **que corra de día** (ver ítem 2).

### 4. `cinema_movies` no guarda fechas — decisión de producto

Una fila por película, y las funciones viven en un JSON `showings` que solo tiene
horas: `"times": ["22:40"]`. No hay campo de fecha en ningún lado.

Consecuencia: **la cartelera de la semana no es representable** con este modelo,
solo la de hoy. Si se quiere semana, hay que cambiar el scraper y el esquema, no
solo la frecuencia de corrida.

---

## Auditoría mobile (390×844 y 360×800)

Medido sobre el HTML servido por `next start`, no sobre el className.

### 5. Ningún variant de `Button` llega a 44×44

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

### 6. `images: { unoptimized: true }`

`next.config.mjs:6-8`. Desactiva la optimización para **todo** el sitio.

Medido en la home: **86 `<img>`, 0 pasan por `/_next/image`, 0 tienen `srcset`**.
18 flyers de Supabase pesan **3,58 MB** juntos (promedio 203 KB, mediana 74,
máximo **951 KB**). 21 imágenes con resolución muy por encima del display:
**2160×2700 renderizadas en cajas de 180×270**.

Para revertirlo hacen falta `remotePatterns` de los 5 hosts: `*.supabase.co`,
`contenidos.entradauno.com`, `norteticket.com`, `cdn.cinemark.com.ar` y
`*.adro.studio`.

### 7. Peso de la home

| | Wire | Sin comprimir |
|---|---|---|
| HTML | 48,9 KB | **759 KB** |
| JS (20 chunks) | **411 KB** | 1,86 MB |
| CSS | 27,2 KB | 178 KB |
| Fuentes (3 woff2) | 61,6 KB | — |

Los 759 KB de HTML salen de serializar las 86 cards en el payload RSC inline.

### 8. Texto por debajo de 14px

**117 nodos en 9px** (`event-card.tsx:115, 125, 151, 159`) y **67 en 10px**
(`:108, :147, :197`). Los `text-[9px]` son los críticos; el resto es `text-xs` de
Tailwind, discutible pero convencional.

### 9. Prefetch RSC duplicado

30 requests de prefetch al cargar la home. `/auth/login` se pide **7 veces** con 7
hashes `_rsc` distintos, sin cache hit entre ellas, y `/buscar` 2 veces a **31 KB**
comprimidos cada una. Son ~150-200 KB de datos móviles que no se usan salvo que
el usuario navegue ahí.

### 10. Las 2 grillas de `/favoritos` tienen el bug de solape

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

### 11. Falta `viewportFit: 'cover'` (menor)

`app/layout.tsx:92-99`. El meta viewport está bien
(`width=device-width, initial-scale=1`, sin `user-scalable=no`), pero sin
`viewportFit` no se puede usar `env(safe-area-inset-bottom)`. Hoy no molesta
porque el wrapper tiene `pb-20` y la nav mide 56px.

---

## Peñas / Instagram

### 12. Revisar solapamiento después del próximo cron de IG

El 2026-08-23 se dieron de alta `@laviejaestacionensalta` y `@bolichebalderrama`
en `instagram_accounts`, activas y con `default_category: penas`.

El cron es `0 0 * * 0,1,5,6`. Después de la primera corrida sus posts van a entrar
como flyers y aparecer como cards propias en la categoría Peñas, **además** de las
14 + 9 filas manuales de `cargar-penas.mjs` para los mismos locales. Hay que mirar
cómo queda: puede que convenga desactivar la carga manual de esos dos, o al revés.

### 13. Las fotos de las peñas son de baja resolución

`flyers/penas/vieja-estacion.webp` (444×602) y `balderrama.webp` (447×597).
Alcanzan para las cards (200px CSS × 2 = 400px) pero quedan blandas en la ficha de
evento, que las muestra a 358px CSS, o sea ~716px en pantallas 2x.

Las dos capturas además tienen una **chincheta blanca en la esquina superior
derecha**, artefacto de la captura original.

Reemplazarlas es un comando:
`node scripts/imagen-penas.mjs --vieja-estacion=<archivo> --apply`

### 14. Cablear `imagen-penas.mjs` dentro de `cargar-penas.mjs`

Hoy son dos pasos: `cargar-penas.mjs --apply` inserta las fechas nuevas con
`image_url` en null, y hay que acordarse de correr `imagen-penas.mjs --apply`
después para taparlas. El segundo ya no necesita los archivos originales
(reutiliza lo que esté en el bucket), así que engancharlo al final del primero es
directo.

---

## Higiene del repo

### 15. Worktrees viejos

- `.claude/worktrees/mcp-list-eec87a` — worktree registrado en detached HEAD
  `60349cd`, del 2026-08-05, **sin cambios sin commitear**.
- `.claude/worktrees/readme-tecnico-github-e40a7a` — directorio **vacío**, huérfano.

Limpiar con `git worktree prune` y borrar los directorios. `.claude/` ya está en
`.gitignore` desde el 2026-08-23.

### 16. Ramas locales sin pushear

Cinco commits que existen **solo en esta máquina**: ninguna de estas ramas tiene
contraparte en `origin`.

| Rama | Commits fuera de main | Último |
|---|---|---|
| `feat/scheduler` | 2 | 2026-08-23 `fix(scheduler): un tick diario…` |
| `fix/venue-canonical` | 2 | 2026-08-23 `fix(venues): sacar el cluster Roka…` |
| `fix/event-dedup` | 1 | 2026-08-23 `feat(dedup): deduplicación por título…` |

`chore/seo-audit` y `claude/mcp-list-eec87a` están mergeadas (0 commits fuera de
main) y se pueden borrar.

### 17. Verificar `c08eb58`

`feat(contenido): generador de fechas futuras del circuito de museos` estaba
commiteado sin pushear cuando arrancó la sesión del 2026-08-23 y **se fue en el
push de esa noche**. Agrega solo `scripts/cargar-museos.mjs` (257 líneas), que no
lo importa nada de la app, así que no cambia el build ni el runtime. Conviene
confirmar igual que estaba listo para salir.
