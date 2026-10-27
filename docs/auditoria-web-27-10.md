# Auditoría web base — 27/10/2026 (B1, nube Q2)

Línea de base de rendimiento, accesibilidad, buenas prácticas y SEO de cinco
páginas del sitio. Esta lista ordena los tickets B2 (datos estructurados y
sitemap), B3 (rendimiento) y B4 (accesibilidad). Es un PR de solo documento:
no cambia código.

Las rutas de código son relativas a `apps/web/`.

---

## Cómo se midió (leer antes de los números)

Desde la sesión en la nube **no se llega a producción ni a las previews**: el
proxy de salida responde `403` a `www.quepintasalta.com.ar` y a `*.vercel.app`,
y la API de PageSpeed Insights devolvió `429` (cuota diaria agotada). Por eso
la medición tiene dos fuentes:

1. **HTML real de producción** (deploy `dpl_Dw2ixYcK98TztJZSuLjJbdoqFh8D`),
   bajado con un GET por la integración de Vercel: `/`, una ficha real
   (`/evento/07a956c3-065c-46ad-86dc-69e318435e37`, «David Robles, Los Aimo e
   invitada Elisa Villareal»), `/cines`, `/radar`, `/favoritos`,
   `/sitemap.xml` y una URL inexistente. Sirve para el SEO (títulos,
   canónicas, Open Graph, JSON-LD, sitemap) y para el marcado de imágenes. No
   da números de Lighthouse.
2. **Lighthouse 13.5 móvil y axe-core 4.14 sobre un build local de
   producción** (`next build` + `next start`), con un Supabase falso que
   responde PostgREST con datos inventados: 16 categorías (los slugs reales),
   10 lugares de Salta, 28 eventos publicados en los próximos 15 días (16 con
   imagen), 6 flyers y 8 películas. El host falso se sirve como
   `https://qpsfake.supabase.co`, así que la CSP del sitio aplica igual que en
   producción. Las imágenes son JPEG de 1080×1350 (~145 KB) con sus variantes
   `.w400/.w800.webp`; son más livianas que fotos reales, así que el peso de
   imágenes es optimista. Lighthouse con *throttling* simulado, **mediana de 3
   corridas** por página. axe a 375 px, en claro y en oscuro, con
   `wcag2a/aa`, `wcag21a/aa` y `best-practice`.

**Los números del punto 2 sirven para comparar antes y después en el mismo
banco, no como valor de producción.** Buenas prácticas da 96 en todas las
páginas por un artefacto local: `/_vercel/insights/script.js` responde 404
fuera de Vercel y deja un error de consola. Cuando la red lo permita, conviene
repetir con PageSpeed contra producción.

`/radar` y `/favoritos` sin sesión redirigen (307) a
`/auth/login?next=…`: la fila «sin sesión» mide la pantalla de ingreso. Las
filas «con sesión» usan una cookie de sesión falsa para ver la página real.

## Números (Lighthouse móvil, mediana de 3)

| Página | URL medida | Rend. | Acces. | BP | SEO | FCP | LCP | TBT | CLS | JS (transfer.) |
|---|---|---|---|---|---|---|---|---|---|---|
| Portada | `/` | **68** | 91 | 96 | 100 | 1,4 s | **5,2 s** | **490 ms** | 0 | 391 KiB |
| Ficha | `/evento/<id>` | 86 | 94 | 96 | 100 | 1,2 s | 3,4 s | 280 ms | 0 | 384 KiB |
| Cines | `/cines` | 77 | 95 | 96 | 100 | 1,4 s | 4,8 s | 250 ms | 0 | 366 KiB |
| Radar, sin sesión | `/auth/login?next=/radar` | 72 | 95 | 96 | 66\* | 1,4 s | **7,6 s** | 210 ms | 0 | 370 KiB |
| Favoritos, sin sesión | `/auth/login?next=/favoritos` | 72 | 95 | 96 | 66\* | 1,2 s | **7,6 s** | 210 ms | 0 | 370 KiB |
| Radar, con sesión | `/radar` | 74 | 96 | 96 | 100 | 1,4 s | 4,4 s | 440 ms | 0 | 376 KiB |
| Favoritos, con sesión | `/favoritos` | 83 | 96 | 96 | 100 | 1,3 s | 4,4 s | 120 ms | 0 | 373 KiB |

\* El 66 de SEO en el ingreso es solo `is-crawlable`: `robots.txt` excluye
`/auth/` a propósito. No es un hallazgo.

Dispersión de rendimiento entre corridas: portada 74/67/68, ficha 86/81/87,
cines 72/77/78, ingreso 72/72/69, radar con sesión 74/78/72, favoritos con
sesión 83/87/83.

### Violaciones de axe (375 px)

| Página | Claro | Oscuro (el tema por defecto) |
|---|---|---|
| Portada | heading-order, label-content-name-mismatch, landmark-unique | + **color-contrast (4 nodos)** |
| Ficha | heading-order, label-content-name-mismatch (2), landmark-unique | + **color-contrast (4)** |
| Cines | heading-order, label-content-name-mismatch, landmark-unique | + **color-contrast (3)** |
| Ingreso (radar/favoritos sin sesión) | label-content-name-mismatch, **landmark-one-main**, **page-has-heading-one**, region (10) | + **color-contrast (7)** |
| Radar con sesión | **button-name (crítica)**, **link-name (2)**, color-contrast (1), label-content-name-mismatch, landmark-unique | + color-contrast (5) |
| Favoritos con sesión | **button-name (crítica)**, **link-name (2)**, color-contrast (1), label-content-name-mismatch, landmark-unique, scrollable-region-focusable | + color-contrast (8) |

---

## Por página: los 5 hallazgos más caros

El orden dentro de cada página es por costo (impacto en la métrica o en la
persona), no por facilidad.

### Portada `/` — Rend. 68, LCP 5,2 s, TBT 490 ms

1. **El elemento LCP es la copia desenfocada del hero, con `loading="lazy"`.**
   `components/hero-carousel.tsx:95-103` pinta el mismo flyer dos veces: un
   fondo `blur-2xl` con `loading="lazy"` y el póster nítido con `priority`.
   Lighthouse toma el fondo como LCP, y ese pedido arranca tarde. Además
   `priority` (líneas 113-116) solo genera un `<link rel="preload">`, sin
   `fetchpriority="high"`: ni en local ni en el HTML de producción hay un solo
   `fetchpriority="high"`. → **B3**.
2. **HTML muy pesado.** 439 KiB servidos en local con 28 eventos; en
   producción, **873 KiB** (sin comprimir). Cada título aparece 9 veces en el
   marcado: el árbol SSR más el payload RSC de `HomeContent`
   (`components/home-content.tsx`, cliente, 407 líneas), que recibe todos los
   eventos como prop. Unos 184 KB son atributos `class`, ~124 KB `<svg>`
   inline y ~101 KB datos de la página. → **B3** (pasar a servidor lo que no
   necesita estado; recortar lo que viaja en el payload).
3. **Hilo principal: 7,2 s de trabajo y 2,4 s de arranque de JS**, con 391 KiB
   de JS (≈1,1 MB sin comprimir; 75-98 KiB sin usar y 14 KiB de JS «legacy»).
   Los dos chunks más grandes (~230 KB sin comprimir cada uno) son el árbol
   cliente de la portada: `home-content.tsx`, `hero-carousel.tsx` y
   `event-card.tsx`, con Framer Motion. → **B3**.
4. **Sin datos estructurados.** La portada no tiene JSON-LD (ni
   `Organization`, ni `WebSite` con `SearchAction`, ni `ItemList` de los
   eventos visibles). → **B2**.
5. **Accesibilidad en oscuro y en todas las páginas:**
   - «Que pinta?» del pie en `#C12026` sobre el fondo oscuro: **3,32:1**
     (`components/footer.tsx:78`); los links de LinkedIn y del autor, 4,1:1
     y 4,38:1.
   - El link «Más info» del aviso de cookies tiene un `aria-label` que no
     contiene el texto visible (`components/consent-banner.tsx:131`).
   - Dos `<nav>` sin nombre (`components/navbar.tsx:75`,
     `components/mobile-nav.tsx:34`).
   - `heading-order`: `<h4>` de la tarjeta sin `<h3>` arriba
     (`components/event-card.tsx:147,181`).
   - No hay link para saltar al contenido.
   → **B4**.

Transversal que pega en todas las páginas: **los favicons pesan 200 KiB y
111 KiB**. `public/icon-light-32x32.png` mide 338×341 y
`public/icon-dark-32x32.png` 270×269; los dos se declaran como 32×32. → **B3**
(regenerar los PNG a 32×32; la declaración en `app/layout.tsx` no cambia).

### Ficha `/evento/<id>` — Rend. 86, LCP 3,4 s, TBT 280 ms

1. **El LCP (el flyer) no tiene `fetchpriority="high"`.** `priority` en
   `components/event-detail-page.tsx:187` deja solo el preload. → **B3**.
2. **Título con la marca dos veces.** En producción:
   «David Robles, Los Aimo e invitada Elisa Villareal - Que pinta Salta | Que
   pinta Salta». `app/evento/[id]/page.tsx:31` agrega « - Que pinta Salta» y
   la plantilla del layout (`%s | Que pinta Salta`) agrega otra. Lo mismo en
   `og:title`. → **B2**.
3. **La descripción es el caption crudo de Instagram cortado a 160
   caracteres**, con emojis y saltos de línea («🎶🔥 ¡UNA NOCHE CON ARTISTAS
   IMPERDIBLES EN CASA GRANDE! 🔥🎶 …»; `app/evento/[id]/page.tsx:32`). El
   corte puede caer a mitad de palabra. → **B2**.
4. **Sin `BreadcrumbList`.** El `Event` está bien (un bloque, válido, con
   `location`, `offers` y `startDate` con huso de Salta), pero no hay migas.
   → **B2**.
5. **Accesibilidad:** el botón «Voy» y «Más info» tienen `aria-label` que no
   contiene el texto visible (label-content-name-mismatch ×2); `<h3>` del pie
   sin `<h2>` previo; los dos `<nav>` sin nombre; contraste del pie en oscuro.
   → **B4**.

Además: TBT de 280 ms con 384 KiB de JS; `components/event-detail-page.tsx`
es cliente entero (447 líneas). Candidato a partir en B3 si el tiempo da.

### Cines `/cines` — Rend. 77, LCP 4,8 s, TBT 250 ms

1. **El LCP (el primer póster) tiene `loading="lazy"`** y además
   `unoptimized` (`components/movie-card.tsx:27-29`): el primer póster de la
   grilla espera al lazy-load. → **B3** (que las primeras tarjetas carguen
   ansiosas y la primera con prioridad).
2. **Open Graph incompleto y título duplicado.** `app/cines/page.tsx:9-18`
   define `openGraph` sin `images` ni `url`, y Next reemplaza el bloque del
   layout: **la página no tiene `og:image` ni `og:url` en producción**. El
   título queda «Cartelera de Cines en Salta | Qué Pinta Salta | Que pinta
   Salta». → **B2**.
3. **Sin `ItemList`** de las películas en cartel. → **B2**.
4. **Estructura:** el `<main>` envuelve al `Navbar` y al `MobileNav`
   (`app/cines/page.tsx`), así que las dos barras de navegación quedan dentro
   del contenido principal; `heading-order` en el `<h3>` de
   `components/movie-card.tsx`. → **B4**.
5. **Contraste en oscuro (3 nodos)**: el pie, igual que en todas las páginas.
   → **B4**.

### Radar y Favoritos sin sesión → `/auth/login` — Rend. 72, LCP 7,6 s

1. **La pantalla de ingreso no se renderiza en el servidor.** Todo el
   formulario está dentro de un `<Suspense>` porque usa `useSearchParams`
   (`app/auth/login/page.tsx:44` y `:232`), y el HTML que llega es el
   *fallback* vacío: en producción se ve `BAILOUT_TO_CLIENT_SIDE_RENDERING`
   y un `<div>` sin contenido. El LCP (un párrafo de texto) espera al JS: 7,6
   s. → **B3/B4** (la página puede leer `searchParams` en el servidor y
   pasarle `next` al formulario cliente).
2. **Sin `<main>` ni `<h1>` en el HTML del ingreso** (landmark-one-main,
   page-has-heading-one, 10 nodos fuera de regiones). Sale del mismo
   *fallback* vacío. → **B4**.
3. **Fondo de 381 KiB.** `public/brand/patron-claro.png` se carga como fondo
   (`app/auth/login/page.tsx:83`; también en `app/auth/recuperar/page.tsx:89`
   y `components/home-content.tsx:354`). → **B3** (recomprimir o pasar a un
   formato liviano).
4. **Contraste en oscuro: 7 nodos** (los links del ingreso a 4,32:1, el pie).
   Los formularios de ingreso y alta tienen `<Label htmlFor>`, pero los
   errores no se asocian al campo con `aria-describedby`. → **B4**.
5. **Metadatos de páginas privadas.** `/radar` y `/favoritos` declaran
   títulos con la marca duplicada («Mi Radar Salteño 📡 | Qué Pinta Salta |
   Que pinta Salta», `app/radar/page.tsx:11`, `app/favoritos/page.tsx:15`),
   heredan `index, follow` y no tienen canónica. Como sin sesión redirigen,
   el impacto real es bajo, pero corresponde `noindex`. El ingreso tiene el
   título genérico de la portada. → **B2**.

### Radar y Favoritos con sesión — Rend. 74 / 83

1. **El menú de usuario no tiene nombre accesible** (button-name, crítica):
   botón de ícono en `components/navbar.tsx:188-191`. → **B4**.
2. **«Mis eventos» y «Radar» de la barra superior se quedan sin nombre a
   375 px**: el texto está con `hidden sm:inline` y el link no tiene
   `aria-label` (`components/navbar.tsx:145-165`). → **B4**.
3. **Contraste en claro**: el chip de lugar del Radar con `text-emerald-300`
   da **1,08:1** (`components/radar-form.tsx:385-400`); el botón de WhatsApp
   de Favoritos (`bg-emerald-600`) da 3,65:1 en los dos temas
   (`app/favoritos/favoritos-list.tsx:193`); los títulos `text-zinc-500` de
   Favoritos dan 4,27:1 en oscuro (`favoritos-list.tsx:239`). → **B4**.
4. **El LCP de Favoritos es la primera tarjeta, con `loading="lazy"`**
   (`components/event-card.tsx`), igual que en Cines. Radar tiene 440 ms de
   TBT (`components/radar-form.tsx`, cliente, 453 líneas). → **B3**.
5. **La capa de la tarjeta en Favoritos es una región con scroll que no se
   alcanza con teclado** (scrollable-region-focusable,
   `components/event-card.tsx:145`). → **B4**.

---

## SEO: estado general (HTML de producción)

- **Canónicas**: bien en `/`, `/evento/<id>` y `/cines` (absolutas, sin
  `?o=`).
- **Títulos duplicados**: ficha, cines, radar, favoritos y flyer
  (`app/flyer/[id]/page.tsx:25`) agregan la marca a mano y la plantilla del
  layout la repite. `/buscar` ya lo hace bien (título sin marca y la marca solo
  en Open Graph).
- **JSON-LD**: solo la ficha (`Event`). Falta `Organization` + `WebSite` en
  la portada, `BreadcrumbList` en la ficha e `ItemList` en las listas
  públicas (portada y cines).
- **Sitemap en producción**: 588 URL — portada, `/cines`, `/buscar`, `/mapa`,
  `/privacidad`, `/terminos`, `/eliminar-cuenta`, `/anunciantes`, 460 fichas
  y 120 flyers. `lastModified` real en portada, cines, buscar, mapa, fichas y
  flyers; las tres páginas legales usan `now` en cada regeneración
  (`app/sitemap.ts`). `/radar` no está y no debería estar: sin sesión
  redirige al ingreso (se discute en B2).
- **robots.txt**: bien (excluye `/admin/`, `/api/`, `/auth/`, declara el
  sitemap).
- **404**: responde 404, con marca y en castellano («No encontramos esa
  página»), `noindex`, links a la portada y a Buscar. Imprime **dos** meta
  `robots` (`noindex` de Next y `noindex, follow` de `app/not-found.tsx`).
  `app/error.tsx` también tiene marca («Algo salió mal», «Probar de nuevo»).
  B6 queda chico: sumar Cines a los links y revisar la meta doble.

## Ya resuelto (no reabrir)

- Las tres fuentes (`next/font`) ya tienen `display: 'swap'` (`app/layout.tsx`).
- `viewport-fit=cover` ya está en el meta viewport.
- La portada ya declara su canónica.

## Lo que ordena B2 a B4

**B2 — Datos estructurados y metadatos** (puro, sin riesgo de rendimiento):
1. Títulos sin la marca duplicada: ficha, cines, radar, favoritos y flyer.
2. `Organization` + `WebSite` con `SearchAction` a `/buscar?q=` en la portada.
3. `BreadcrumbList` en la ficha (sin duplicar el `Event`).
4. `ItemList` en la portada y en cines.
5. Open Graph completo en cines (`og:image`, `og:url`); `noindex` en radar y
   favoritos; descripción de la ficha limpia (sin emojis ni saltos, cortada
   en palabra).
6. Sitemap: `lastModified` sin `now` donde haya una fecha real.
7. Un test que parsee el JSON-LD.

**B3 — Rendimiento** (con antes y después en este mismo banco):
1. LCP de la portada: que el fondo desenfocado no sea lazy ni compita, y que
   la imagen prioritaria lleve `fetchpriority="high"` (portada y ficha).
2. Primeras tarjetas ansiosas en Cines y Favoritos.
3. Favicons a 32×32 reales y `patron-claro.png` recomprimido.
4. Ingreso renderizado en el servidor (sacar `useSearchParams` del árbol).
5. Partir `home-content.tsx`: lo que no tiene estado, a Server Components.
   Es el cambio más grande; se mide y se decide en el PR.

**B4 — Accesibilidad**:
1. Nombre accesible del menú de usuario y de los links de ícono a 375 px.
2. Skip link al contenido y `<main id>` en las páginas que no lo tienen.
3. Contraste: pie en oscuro, chip del Radar y botón de WhatsApp en claro,
   títulos de Favoritos.
4. `aria-label` que contenga el texto visible («Más info», «Voy»).
5. `<nav>` con nombre; `<main>` sin las barras adentro en Cines; orden de
   encabezados en tarjetas y pie.
6. Ingreso y alta: errores asociados con `aria-describedby` y
   `aria-invalid`.
7. Región con scroll de la tarjeta alcanzable con teclado (o sin scroll).

## Fuera de la zona de esta sesión (propuestas)

- `app/layout.tsx`: la plantilla de título queda como está (el arreglo va en
  cada página). Si se quisiera un `<main id="contenido">` común o el skip
  link en el layout, es de otra sesión; B4 lo resuelve por página.
- `next.config.mjs` (`images.unoptimized: true`) **no** es zona prohibida,
  pero sacarlo pide `remotePatterns` de los cinco hosts y cambia el costo de
  Vercel Image Optimization: se deja como propuesta para Mauro, no se toca en
  B3 (ver `docs/PENDIENTES.md`, punto 5).
- Las tarjetas de anuncios y `components/adsense-*.tsx` no se tocan (zona de
  publicidad).
