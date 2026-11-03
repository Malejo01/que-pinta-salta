> Relevamiento de Gemini (G-3, 3/11). La lista consolidada de Q5-10 está en `candidatas.md`.

# Fuentes candidatas de agenda cultural en Salta (`docs/fuentes/candidatas.md`)

Relevamiento de sitios web públicos y cuentas oficiales de Salta Capital y el Gran Salta que publican programación cultural, espectáculos, ferias, vida nocturna y actividades infantiles.

- **Qué ya ingiere hoy QPS** (`apps/web/lib/scraper/`):
  - Ticketeras activas: **NorteTicket**, **EntradaUno**, **Alpogo**.
  - Portal provincial: **Vamos Salta** (`vamos.gob.ar`).
  - Cartelera de cine: **Hoyts Salta**, **Cinemark Paseo Salta**, **Cine Ópera**.
  - Generadores recurrentes: 6 museos provinciales (`cargar-museos.mjs`) y 2 peñas (`cargar-penas.mjs`, Balderrama y La Vieja Estación), más cuentas de Instagram vía Apify + Gemini.
- **Método de relevamiento (3/11/2026):** consulta de páginas públicas y lectura puntual de `/robots.txt` sin ejecutar scraping sobre el contenido.

---

## 1. Portales oficiales y Cultura Provincial

| Fuente | URL / Canal público | Qué publica | Frecuencia | ¿Agenda estructurada? | `robots.txt` y Términos de uso |
|---|---|---|---|---|---|
| **Secretaría de Cultura de Salta** | https://www.culturasalta.gov.ar/ <br> IG: `@culturasalta` | Agenda oficial de organismos estables (Orquesta Sinfónica, Ballet de la Provincia, Ballet Folklórico), muestras de museos provinciales, teatro, cine INCAA y talleres. | Diaria / semanal | **Sí.** Sección de Agenda Cultural filtrable por categoría, fecha y espacio; WordPress con `sitemap.xml` y `sitemap.rss`. | `robots.txt` (HTTP 200): `User-agent: *` solo bloquea `/wp-admin/` (permite `/wp-admin/admin-ajax.php`) y publica `sitemap.xml`. Información pública estatal de difusión cultural; sin restricción de lectura en términos. |
| **Turismo de la Provincia (Visit Salta)** | https://visitsalta.ar/ <br> https://calendario.turismosalta.gov.ar/ | Grandes eventos, festivales provinciales, congresos (Centro de Convenciones Salta), ferias gastronómicas y calendario turístico anual. | Semanal / mensual | **Sí.** Calendario de eventos por localidad y fecha (`wp-sitemap.xml`). | `robots.txt` (HTTP 200): `User-agent: *` solo bloquea `/wp-admin/`. Contenido oficial de promoción turística provincial. |

---

## 2. Teatros y salas escénicas

| Fuente | URL / Canal público | Qué publica | Frecuencia | ¿Agenda estructurada? | `robots.txt` y Términos de uso |
|---|---|---|---|---|---|
| **Teatro Provincial «Juan Carlos Saravia»** | https://teatroprovincial.gob.ar/ <br> IG: `@teatroprovincialsalta` | Conciertos sinfónicos, ballet, ópera, giras nacionales de teatro, espectáculos de danza y música en Zuviría 70. | Semanal (2 a 5 funciones por semana) | **Sí.** Cartelera en portada con fichas individuales por espectáculo (fecha, hora y derivación a boletería / Vamos Salta / NorteTicket). | `robots.txt` (HTTP 200): contiene únicamente `User-agent: *` sin directivas `Disallow` (acceso total permitido). Sin términos restrictivos para indexación de cartelera pública. |
| **Casa de la Cultura de Salta (Sala Juan Carlos Dávalos / Sala Mecano)** | https://www.culturasalta.gov.ar/ (filtro Casa de la Cultura) <br> IG: `@casadelaculturasalta` | Teatro independiente y oficial, ciclos de música, presentaciones de libros, muestras plásticas y cine en Caseros 460. | Semanal (varias funciones de jueves a domingo) | **Parcial.** En `culturasalta.gov.ar` aparece estructurada por espacio; las novedades de último momento salen como flyers en Instagram. | En la web rige el `robots.txt` de `culturasalta.gov.ar` (permitido). En Instagram rigen los Términos de Meta (solo mediante el flujo autorizado de cuentas configuradas). |
| **La Ventolera Espacio de Arte** | IG: `@laventoleraespaciodearte` <br> FB: `/laventolera` | Teatro independiente, títeres e infantiles los fines de semana, música acústica y talleres en O'Higgins 585. | Semanal (jueves a domingo) | **No tiene web propia estructurada.** Publica flyers semanales en Instagram y vende anticipadas por Alpogo o reserva directa. | En Instagram rigen los Términos de Meta; cuando vende por Alpogo ya entra por `alpogo-scraper.ts`. |
| **El Teatrino** | IG: `@elteatrinosalta` | Obras de teatro en gira, stand-up, recitales íntimos y espectáculos infantiles en Aniceto Latorre y Alvear (Paseo de los Poetas / Alto NOA). | Semanal | **Parcial.** No mantiene cartelera web propia estable; la venta estructurada se distribuye entre NorteTicket, EntradaUno y Plateanet. | Las funciones con venta en NorteTicket y EntradaUno ya entran por ticketera; las de Plateanet/Passline requieren cubrir esas ticketeras. |
| **Teatro Fundación Salta** | IG: `@fundacionsalta` | Conciertos de cámara, teatro, conferencias y muestras en Gral. Güemes 434. | Quincenal / semanal | **No.** Difusión principalmente por redes sociales y comunicados de prensa. | Rigen políticas de redes sociales (Meta). |

---

## 3. Centros culturales y espacios multidisciplinarios

| Fuente | URL / Canal público | Qué publica | Frecuencia | ¿Agenda estructurada? | `robots.txt` y Términos de uso |
|---|---|---|---|---|---|
| **Usina Cultural de Salta** | https://usinacultural.gob.ar/ <br> IG: `@usinaculturalsalta` | Recitales en anfiteatro, cine en pantalla gigante, ferias de diseño y emprendedores, teatro en auditorio Macacha Güemes, talleres y muestras en España 1–98. | Semanal (actividad casi diaria de miércoles a domingo) | **Parcial.** El sitio `usinacultural.gob.ar` es mayormente institucional y gran parte de la grilla semanal se publica en `culturasalta.gov.ar` y en `@usinaculturalsalta`. | `/robots.txt` devuelve 404 (sin bloqueos declarados). Información pública de organismo provincial. |
| **Centro Cultural América** | https://www.culturasalta.gov.ar/ <br> IG: `@ccamericasalta` | Exposiciones permanentes y temporarias, muestras fotográficas, ferias del libro/arte y conciertos de cámara en Mitre 23. | Semanal / mensual | **Parcial.** Integrado en la agenda de `culturasalta.gov.ar` y flyers en Instagram. | Rige `culturasalta.gov.ar/robots.txt` (permitido). |
| **Distrito Cultural «Dino Saluzzi»** | https://municipalidadsalta.gob.ar/ <br> IG: `@municipalidadsalta` | Encuentros corales, talleres infantiles de vacaciones y fines de semana, ferias barriales y muestras en Av. Independencia 910. | Semanal | **No como calendario aislado:** sale en comunicados de prensa de `municipalidadsalta.gob.ar/noticias/`. | `municipalidadsalta.gob.ar/robots.txt` (HTTP 200, archivo vacío: 0 bytes, todo permitido). Datos públicos municipales. |
| **Pro Cultura Salta** | IG: `@proculturasalta` | Abril Cultural Salteño, conciertos líricos y de guitarra, muestras de arte y presentaciones literarias en Mitre 331. | Semanal (diaria en abril/mayo) | **No.** Grilla en publicaciones de Instagram y gacetillas. | Rigen términos de Meta para Instagram. |

---

## 4. Museos (propuestas especiales y talleres infantiles)

> *Nota:* las visitas generales de martes a domingo de los 6 museos provinciales de Capital ya se generan con `apps/web/scripts/cargar-museos.mjs`. Lo que falta captar son las **actividades puntuales** (talleres para chicos, Noche de los Museos, charlas e inauguraciones).

| Fuente | URL / Canal público | Qué publica | Frecuencia | ¿Agenda estructurada? | `robots.txt` y Términos de uso |
|---|---|---|---|---|---|
| **Museo Güemes** | https://www.museoguemes.gob.ar/ <br> IG: `@museoguemes` | Actividades infantiles («El Museo va a la escuela», talleres de fin de semana), visitas nocturnas y proyecciones en España 730. | Quincenal / semanal | **Parcial.** Sección de noticias/novedades en su web (WordPress) y agenda de talleres en IG. | Sitio oficial provincial (`.gob.ar`); divulgación pública. |
| **MAAM (Museo de Arqueología de Alta Montaña)** | https://www.maam.gob.ar/ <br> IG: `@museomaam` | Talleres infantiles de arqueología («MAAM para chicos»), charlas científicas y muestras temporarias en Mitre 77. | Quincenal / mensual | **Parcial.** Novedades en portal `.gob.ar` y calendario de talleres en Instagram. | Sitio oficial provincial (`.gob.ar`); divulgación pública. |
| **MAC (Museo de Arte Contemporáneo)** | IG: `@macsalta` <br> Web vía `culturasalta.gov.ar` | Inauguraciones de muestras, recorridos dialogados, talleres de arte para infancias y performances en Zuviría 90. | Quincenal | **Sí, dentro de `culturasalta.gov.ar`.** | Permitido en `culturasalta.gov.ar/robots.txt`. |
| **Museo de la Ciudad «Casa de Hernández»** | https://municipalidadsalta.gob.ar/ | Muestras históricas de Salta, conciertos de música de cámara y visitas guiadas gratuitas en Florida 97 (esquina Alvarado). | Mensual / quincenal | **No estructurada** (sale en el portal de noticias municipal). | `municipalidadsalta.gob.ar/robots.txt` vacío (permitido). |

---

## 5. Municipios del Gran Salta

| Fuente | URL / Canal público | Qué publica | Frecuencia | ¿Agenda estructurada? | `robots.txt` y Términos de uso |
|---|---|---|---|---|---|
| **Municipalidad de Salta Capital** | https://municipalidadsalta.gob.ar/ <br> IG: `@municipalidadsalta` | Ferias gastronómicas y artesanales (Paseo de los Poetas, Plaza Güemes, Parque San Martín), festivales gratuitos, Teatro Municipal y anfiteatro Cuchi Leguizamón. | Semanal (jueves/viernes publica agenda del finde) | **Parcial.** Publica notas de prensa semanales con el cronograma completo de fin de semana (HTML de noticias WordPress). | `robots.txt` (HTTP 200, vacío: permite todo). Información pública municipal. |
| **Municipalidad de San Lorenzo** | https://sanlorenzo.gob.ar/ <br> IG: `@munisanlorenzo` | Feria gastronómica «El Zorzal», peñas al aire libre, senderismo guiado en Quebrada de San Lorenzo, corsos y talleres culturales. | Semanal (fines de semana) | **Parcial.** WordPress con `sitemap_index.xml` y sección de turismo/novedades; grilla fina en Instagram. | `robots.txt` (HTTP 200): `User-agent: *` solo bloquea `/wp-admin/` y un JSON interno de plugin (`wpo-plugins-tables-list.json`). |
| **Municipalidad de Vaqueros** | IG: `@vaquerosmun` | Ferias de artesanos y productores del río Vaqueros, serenatas, peñas folklóricas y encuentros culturales. | Semanal / quincenal | **No tiene agenda web estructurada.** Publica flyers en Instagram y Facebook. | Rigen políticas de Meta. |
| **Municipalidad de Cerrillos** | IG: `@municipalidad.cerrillos` | Corsos de Flores, festivales folklóricos, ferias en la plaza principal y actividades en el Anfiteatro Municipal. | Semanal / estacional | **No tiene agenda web estructurada.** Publica en redes sociales oficiales. | Rigen políticas de Meta. |

---

## 6. Universidades

| Fuente | URL / Canal público | Qué publica | Frecuencia | ¿Agenda estructurada? | `robots.txt` y Términos de uso |
|---|---|---|---|---|---|
| **Universidad Nacional de Salta (UNSa) · Centro Cultural Martínez Borelli** | https://www.unsa.edu.ar/ <br> IG: `@extensionunsa` | Ciclos de cine debate, presentaciones de libros, muestras en el Palacio Zorrilla (Alvarado 551), conciertos didácticos y «Octubre Cultural». | Semanal | **Parcial.** Portal WordPress con `wp-sitemap.xml` y boletín de noticias; el detalle de talleres y muestras sale en `@extensionunsa`. | `robots.txt` (HTTP 200): bloque Yoast con `User-agent: * / Disallow:` vacío (permite todo) y enlace a `wp-sitemap.xml`. |
| **Universidad Católica de Salta (UCASAL)** | https://www.ucasal.edu.ar/ <br> IG: `@ucasaloficial` / `@culturaucasal` | Conciertos de la Escuela Universitaria de Música, muestras de arte, jornadas abiertas, presentaciones de EUCASA y deportes en Campo Castañares. | Semanal / quincenal | **Parcial.** Noticias y eventos institucionales en web; agenda cultural en Instagram. | `robots.txt` (HTTP 200): bloquea `/wp-admin/`, `/carreras/`, `/eucasa/` y landings viejas; permite la portada y secciones de noticias/eventos. |

---

## 7. Peñas folklóricas, boliches y música en vivo

> *Nota:* `@bolichebalderrama` y `@laviejaestacionensalta` ya están relevadas en `docs/PENDIENTES.md` §11. Aquí se listan nuevas candidatas de alta rotación de cartelera.

| Fuente | URL / Canal público | Qué publica | Frecuencia | ¿Agenda estructurada? | `robots.txt` y Términos de uso |
|---|---|---|---|---|---|
| **La Casona del Molino** | IG: `@lacasonadelmolino` | Peña tradicional de guitarra y canto libre, fechas especiales e invitados en Luis Burela 1 (Cnel. Suárez y Virgen de Lourdes). | Semanal | **No.** Avisos y horarios por Instagram. | Términos de Meta. |
| **Peña Gauchos de Güemes** | IG: `@penagauchosdeguemes` | Cartelera de artistas folklóricos de miércoles a domingo en Av. Uruguay 750. | Semanal (varios flyers por semana) | **No.** Flyers por día en Instagram. | Términos de Meta. |
| **Cautiva Salta** | IG: `@cautivasalta` | Peña y espectáculos folklóricos en vivo sobre el corredor Balcarce. | Semanal (jueves a domingo) | **No.** Flyers en Instagram. | Términos de Meta. |
| **Macondo Bar** | IG: `@macondobarsalta` | Música en vivo (rock, jazz, indie, acústicos), stand-up y ciclos culturales en Balcarce 980. | Semanal (3 a 4 shows por semana) | **No.** Flyers en Instagram y entradas ocasionales por Alpogo. | Términos de Meta / Alpogo. |
| **Fábrica de Música / Takku** | IG: `@fabricademusicasalta` | Recitales de bandas locales, tributos y fiestas temáticas en zona Balcarce / Pellegrini. | Semanal (fines de semana) | **No.** Flyers en Instagram y preventas en Alpogo / NorteTicket. | Términos de Meta. |
| **Hakuna / Castillo Mao Mao** | IG: `@hakunasalta` / `@castillomaomao` | Fiestas electrónicas, cachengue y shows de música tropical en vivo los fines de semana. | Semanal (viernes a domingo) | **Parcial.** Cuando venden entradas anticipadas usan **Passline** (estructurado); el resto son flyers en IG. | Ver fila de Passline abajo. |

---

## 8. Ticketeras con eventos en Salta aún no conectadas

`apps/web/lib/scraper/source-priority.ts` ya define el tramo `ticketera (400)` para `passline`, `paseshow`, `ticketek` y `tuentrada`, pero hoy solo corren scrapers para NorteTicket, EntradaUno y Alpogo.

| Ticketera | URL de búsqueda en Salta | Qué publica en Salta | Frecuencia | ¿Agenda estructurada? | `robots.txt` y Términos de uso |
|---|---|---|---|---|---|
| **Passline Argentina** | https://www.passline.com/eventos?q=Salta | Fiestas electrónicas, boliches, stand-up, bandas indie y eventos en salas medianas de Salta y San Lorenzo. | Continua (alta rotación) | **Sí.** Cards con título, fecha, hora, lugar, imagen y precio. | `robots.txt` (HTTP 200): `User-agent: *` bloquea solo rutas de compra y carrito (`/carro*`, `/ticket*`, `/mis-tickets*`) y tiene `Allow:` general para el catálogo público de eventos. |
| **Paseshow** | https://www.paseshow.com.ar/ | Recitales masivos en Estadio Delmi, Teatro Provincial y giras nacionales que pasan por el NOA. | Semanal | **Sí.** Catálogo SPA/API con detalle estructurado por función y sede. | `/robots.txt` devuelve el HTML de la SPA (sin reglas `Disallow` específicas). Términos prohíben reventa automatizada de tickets, no el enlace informativo a la ficha oficial. |
| **Ticketek Argentina** | https://www.ticketek.com.ar/ | Grandes recitales y espectáculos nacionales en Estadio Delmi, Padre Martearena o Teatro Provincial. | Quincenal / mensual | **Sí.** Páginas estructuradas con esquema de evento. | `robots.txt` (HTTP 200): `User-agent: *` tiene `Allow: /` y solo bloquea `/websource/`. Bloquea bots de entrenamiento LLM (`GPTBot`, `ClaudeBot`, `CCBot`) en `/websource/`. |

---

## 9. Recomendación de prioridad para ingesta

1. **Corto plazo (estructuradas y con `robots.txt` permisivo):**
   - **Agenda de `culturasalta.gov.ar` y `teatroprovincial.gob.ar`**: completan toda la oferta pública provincial (Teatro Provincial, Usina Cultural, Casa de la Cultura y museos) con datos limpios y sin restricciones en `robots.txt`.
   - **Passline (filtro Salta)**: suma la mayor cantidad de eventos de música en vivo, stand-up y fiestas que hoy no pasan por NorteTicket ni Alpogo, con `robots.txt` explícitamente abierto fuera del carrito.
2. **Mediano plazo (noticias / comunicados):**
   - **Agenda de fin de semana de `municipalidadsalta.gob.ar` y `sanlorenzo.gob.ar`**: ideales para ferias gratuitas, paseos artesanales y actividades al aire libre.
3. **Vía pipeline de Instagram existente (`instagram_accounts`):**
   - Sumar `@usinaculturalsalta`, `@casadelaculturasalta`, `@laventoleraespaciodearte`, `@macondobarsalta` y `@lacasonadelmolino`.
