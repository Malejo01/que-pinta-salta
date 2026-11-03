# Checklist de QA — Build 8 (Tanda Q5)

Guía de prueba manual en un teléfono Android físico (y el navegador web donde se indica) para el **Build 8**. Sale de «Qué probar en el build 8» de #166 más el arreglo de «Filtros» (#182). Cada paso dice qué hacer y **qué tenés que ver**. Si algo no coincide, anotá el paso, qué viste y una captura.

**Antes de empezar**
- [ ] Build 8 instalado encima del 7 (no limpio), con una cuenta de prueba y otra sin sesión disponibles.
- [ ] Teléfono con Android en castellano; tener a mano un acceso a la web con la misma cuenta y, para los pasos 8 y 9, al panel `/admin/uso`.
- [ ] Anotá modelo de teléfono y tamaño de letra del sistema.

---

## 0. Arreglo de «Filtros» con las pills deslizadas (#182) — prioridad

*Bug del build 7: tras deslizar las pills de fecha, «Filtros» no respondía.*

- [ ] **0.1** Abrí la app en **Inicio**. Mirá la cabecera: pills de fecha (Hoy, Esta noche, Finde, Semana) y el botón «Filtros» al lado. **Ver:** una sola fila fija; el botón queda a la vista y no se tapa.
- [ ] **0.2** Deslizá las pills hacia la derecha hasta el final y volvé al principio. **Ver:** el contenido no se dibuja encima del botón «Filtros».
- [ ] **0.3** Con las pills deslizadas **hasta el final**, tocá «Filtros». **Ver:** se abre la hoja de filtros.
- [ ] **0.4** Repetí con las pills a medio recorrido y sin deslizar. **Ver:** abre siempre.
- [ ] **0.5** Tocá una pill, volvé a deslizar y tocá «Filtros» otra vez. **Ver:** responde y la pill elegida sigue marcada.
- [ ] **0.6** Probá con letra grande del sistema y en un teléfono angosto. **Ver:** el botón sigue visible y sin recortes.

---

## 1. Cuenta → Idioma

- [ ] **1.1** Entrá a **Cuenta → Idioma**. **Ver:** tres opciones: castellano, inglés y «automático».
- [ ] **1.2** Elegí **inglés**. **Ver:** cambian las pantallas migradas: bienvenida, ficha del evento, película, flyer, cines, filtros, búsquedas y lugares para chicos. Mirá el largo de los botones y chips: no tienen que cortarse ni pisarse.
- [ ] **1.3** Aclaración: Inicio, Buscar, Mis eventos, Radar y Cuenta **todavía no están migradas** (ver «Fuera de este build»). **Ver:** si siguen en castellano, no es un error.
- [ ] **1.4** Cerrá la app del todo y abrila. **Ver:** el idioma elegido sigue en inglés.
- [ ] **1.5** Elegí **castellano**. **Ver:** todo vuelve a castellano sin textos mezclados en las pantallas migradas.
- [ ] **1.6** Elegí **automático** con el teléfono en castellano, y después con el teléfono en inglés. **Ver:** la app sigue el idioma del teléfono en cada caso.
- [ ] **1.7** En inglés, revisá que los textos suenen naturales y no sean traducción literal.

---

## 2. Inicio → «Lugares para chicos»

- [ ] **2.1** En Inicio, buscá «Lugares para chicos» y entrá. **Ver:** una lista con nombre, tipo y barrio.
- [ ] **2.2** Filtrá por **barrio**. **Ver:** la lista muestra solo los lugares de ese barrio; al quitar el filtro vuelve completa.
- [ ] **2.3** Tocá «Cerca mío» **sin haber dado permiso de ubicación**. **Ver:** no pide permiso por sí solo ni se rompe (la opción solo funciona si ya diste permiso).
- [ ] **2.4** Dale permiso de ubicación desde los ajustes del teléfono y volvé. **Ver:** «Cerca mío» ordena por cercanía.
- [ ] **2.5** Abrí la **ficha** de un lugar. **Ver:** nombre, dirección, horario y tipo; la ubicación del lugar, nunca la tuya.
- [ ] **2.6** Tocá los **botones de contacto** (los que haya: teléfono, mapa, web). **Ver:** cada uno abre la app correcta (marcador, mapas, navegador) y no hay botones vacíos.
- [ ] **2.7** En inglés, repetí 2.1–2.6. **Ver:** textos en inglés y sin cortes en botones y chips.

---

## 3. Grilla de eventos de 2 columnas

- [ ] **3.1** En Inicio, mirá la grilla en un teléfono **angosto**. **Ver:** dos columnas parejas, sin textos cortados ni imágenes deformadas.
- [ ] **3.2** Subí la letra del sistema al máximo y volvé a mirar. **Ver:** la grilla sigue legible; los títulos largos pasan a otra línea o se recortan prolijo.
- [ ] **3.3** Desplazá la lista hasta el final y volvé. **Ver:** sin saltos ni huecos.

---

## 4. Lugares que seguís

- [ ] **4.1** En la **web**, con tu cuenta, seguí un lugar (ficha `/lugar/<slug>`).
- [ ] **4.2** En la app, con la misma cuenta, abrí **Mis eventos**. **Ver:** aparece «Lugares que seguís» con ese lugar (quizá hace falta traer la lista de nuevo).
- [ ] **4.3** Dejá de seguir el lugar desde la web y refrescá la app. **Ver:** desaparece.
- [ ] **4.4** Con un lugar seguido que tenga eventos próximos, abrí el **Radar**. **Ver:** el radar tiene en cuenta ese lugar.
- [ ] **4.5** Sin conexión (modo avión), abrí la sección. **Ver:** un mensaje claro, no una pantalla en blanco.

---

## 5. Avisos sin cuenta

- [ ] **5.1** Sin sesión, **abrí y cerrá la app más de 6 veces en una hora**. **Ver:** no se rompe nada, no hay cierres ni pantallas de error ni avisos de «demasiadas solicitudes».
- [ ] **5.2** Después de eso, entrá a Cuenta → Avisos. **Ver:** los interruptores siguen respondiendo.
- [ ] **5.3** Mandá un aviso de prueba. **Ver:** llega y, al tocarlo, abre la app.

---

## 6. «Este finde pinta»

- [ ] **6.1** Jueves, con avisos del equipo activados: **recibí el aviso del equipo** y tocalo. **Ver:** abre la app.
- [ ] **6.2** A las **18:00** de ese mismo jueves. **Ver:** **no** llega el aviso del finde.
- [ ] **6.3** (Comparación) Otro jueves, sin tocar el aviso del equipo. **Ver:** a las 18:00 **sí** llega el del finde.
- [ ] **6.4** Aclaración: con la app **cerrada** y el aviso descartado sin tocarlo, el caso no está cubierto en este build.

---

## 7. Cuenta eliminada desde la web

- [ ] **7.1** En la app, iniciá sesión con una **cuenta de prueba** y buscá algo en Buscar, para que haya búsquedas recientes.
- [ ] **7.2** En la **web**, con la misma cuenta, eliminá la cuenta.
- [ ] **7.3** Volvé a abrir la app. **Ver:** se cierra la sesión (Cuenta pide iniciar sesión) y **Buscar** queda sin búsquedas recientes.
- [ ] **7.4** Intentá iniciar sesión con la cuenta eliminada. **Ver:** no entra.

---

## 8. Panel de uso

- [ ] **8.1** Hoy, abrí la app con sesión y otra vez sin sesión.
- [ ] **8.2** Al **día siguiente**, entrá a `/admin/uso` (con tu usuario admin). **Ver:** la apertura de hoy suma, y las aperturas con cuenta y sin cuenta se distinguen.
- [ ] **8.3** Abrir la app varias veces el mismo día. **Ver:** el conteo cambia de acuerdo con las aperturas de ese día (si cuenta una por día o por apertura, anotá cuál ocurre).

---

## Fuera de este build (no es error)

- Inicio, Buscar, Mis eventos, Radar y Cuenta siguen en castellano al elegir inglés.
- En la web siguen en castellano `/auth/sign-up`, `/perfil` y `/nuevo-evento`.
- El caso «finde con la app cerrada y aviso descartado sin tocar» no está cubierto.

## Cierre

- [ ] Anotá el resultado: **OK / con observaciones / bloqueante**, el modelo de teléfono y la versión de Android.
- [ ] Todo bloqueante se avisa en #106 antes de subir el build a Play.
