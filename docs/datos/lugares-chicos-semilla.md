# Semilla de lugares para chicos en Salta Capital (`docs/datos/lugares-chicos-semilla.md`)

> **Importante:** Esta lista es un **insumo en borrador para que un administrador verifique** antes de publicar en `lugares_permanentes` (según `docs/propuestas/lugares-para-chicos.md` y las decisiones de `docs/tanda-q5/README.md`). **Ninguna fila de este documento se publica sola.**
>
> **Criterio de privacidad y seguridad aplicado:** Solo se incluyen espacios públicos, instituciones culturales, centros comerciales y locales con habilitación/dirección comercial pública. **Quedan excluidos emprendimientos en domicilios particulares.**

---

## Tipos del modelo (`lugares_permanentes.tipo`)

- `plaza_juegos`: parques urbanos y plazas públicas con sector de juegos infantiles.
- `espacio_cultural_infantil`: museos con recorridos/talleres para infancias, bibliotecas infantiles y ludotecas públicas.
- `salon_juegos`: centros de entretenimiento familiar y salones de juegos infantiles que abren al público o con reserva.
- `pelotero`: peloteros y salas de juego blando con dirección comercial pública.

---

## 1. Parques y plazas con juegos (`plaza_juegos`)

| # | Nombre | Dirección (Salta Capital) | Tipo | ¿Con reserva? | Horario de referencia | Fuente pública | Notas para verificar |
|---|---|---|---|---|---|---|---|
| 1 | **Parque del Bicentenario** | Av. Bolivia s/n (frente a Ciudad Judicial, Zona Norte) | `plaza_juegos` | No | Todos los días de 07:00 a 23:00 | https://visitsalta.ar/ / https://www.salta.gob.ar/ | Gratis. Sector de juegos integradores, plaza blanda, carrusel y trencito. |
| 2 | **Parque Sur** | Av. Ex Combatientes de Malvinas s/n (frente a Bº San Remo, Zona Sur) | `plaza_juegos` | No | Todos los días de 07:00 a 23:00 | https://www.salta.gob.ar/ | Gratis. Juegos infantiles, pista de patinaje/skate y anfiteatro. |
| 3 | **Parque San Martín (Sector Juegos y Lago)** | Av. San Martín e Hipólito Yrigoyen (Centro / Macrocentro) | `plaza_juegos` | No | Abierto las 24 h (juegos y calesitas principalmente de 10:00 a 21:00) | https://municipalidadsalta.gob.ar/ | Gratis (calesitas e inflables pagos). Principal paseo familiar céntrico. |
| 4 | **Plaza Alvarado** | Av. Belgrano y Moldes (Macrocentro Oeste) | `plaza_juegos` | No | Abierto todo el día | https://municipalidadsalta.gob.ar/ / OpenStreetMap | Gratis. Sector de juegos infantiles renovado y feria los fines de semana. |
| 5 | **Plaza Belgrano** | Av. Belgrano y Balcarce (Centro) | `plaza_juegos` | No | Abierto todo el día | https://municipalidadsalta.gob.ar/ / OpenStreetMap | Gratis. Juegos de plaza en pleno microcentro. |
| 6 | **Plaza Güemes** | Mitre y Av. Entre Ríos (frente al Palacio Legislativo) | `plaza_juegos` | No | Abierto todo el día | https://municipalidadsalta.gob.ar/ / OpenStreetMap | Gratis. Juegos infantiles; los fines de semana suma feria de emprendedores. |
| 7 | **Plaza Evita** | Av. Entre Ríos y Av. Sarmiento | `plaza_juegos` | No | Abierto todo el día | https://municipalidadsalta.gob.ar/ / OpenStreetMap | Gratis. Juegos infantiles en el corredor Sarmiento-Entre Ríos. |
| 8 | **Plaza España** | Av. Entre Ríos y Cnel. Suárez (Oeste) | `plaza_juegos` | No | Abierto todo el día | https://municipalidadsalta.gob.ar/ / OpenStreetMap | Gratis. Amplio playón deportivo y sector de juegos para chicos. |
| 9 | **Plaza Macacha Güemes (Tres Cerritos)** | Av. Reyes Católicos y Los Carolinos (Bº Tres Cerritos) | `plaza_juegos` | No | Abierto todo el día | OpenStreetMap (`leisure=park`) | Gratis. Principal plaza con juegos infantiles de Tres Cerritos. |

---

## 2. Museos con propuesta infantil, bibliotecas y ludotecas (`espacio_cultural_infantil`)

| # | Nombre | Dirección (Salta Capital) | Tipo | ¿Con reserva? | Horario de referencia | Fuente pública | Notas para verificar |
|---|---|---|---|---|---|---|---|
| 10 | **Complejo de Bibliotecas y Archivos · Sector Infantil** | Av. Belgrano 1002 (esq. Av. Sarmiento) | `espacio_cultural_infantil` | No | Lunes a viernes de 08:00 a 20:00 | https://www.culturasalta.gov.ar/ / `bibliotecasyarchivosalta.gob.ar` | Gratis. Sala de lectura infantil/juvenil, bebeteca y talleres literarios. |
| 11 | **Usina Cultural de Salta (Anfiteatro y Plaza)** | España 1–98 (esq. Juramento) | `espacio_cultural_infantil` | No | Martes a domingo de 09:00 a 21:00 | https://usinacultural.gob.ar/ / `@usinaculturalsalta` | Espacio cultural abierto con talleres de fin de semana, pantallas y ferias aptas para familias. |
| 12 | **Distrito Cultural «Dino Saluzzi»** | Av. Independencia 910 | `espacio_cultural_infantil` | No | Lunes a viernes de 08:00 a 20:00; fines de semana según programación | https://municipalidadsalta.gob.ar/ | Sede de talleres artísticos infantiles gratuitos y actividades recreativas municipales. |
| 13 | **Ludoteca Pública · Predio Natatorio Juan Domingo Perón** | Ayacucho 76 (frente a Plaza Alvarado) | `espacio_cultural_infantil` | No (confirmar cupos) | Lunes a viernes por la mañana y tarde (horario administrativo municipal) | https://municipalidadsalta.gob.ar/ / `salta.gob.ar` | Espacio del programa provincial/municipal de Primera Infancia con material didáctico y facilitadores. |
| 14 | **Museo Güemes** | España 730 | `espacio_cultural_infantil` | No (talleres puntuales con inscripción) | Martes a domingo de 11:00 a 19:00 | https://www.museoguemes.gob.ar/ / `@museoguemes` | Ya existe como `venue` (`a6368e1a`). Recorrido audiovisual inmersivo muy atractivo para chicos y talleres de fin de semana. |
| 15 | **MAAM (Museo de Arqueología de Alta Montaña)** | Mitre 77 (frente a Plaza 9 de Julio) | `espacio_cultural_infantil` | No (talleres con cupo) | Martes a domingo de 11:00 a 19:00 | https://www.maam.gob.ar/ / `@museomaam` | Ya existe como `venue` (`48f05894`). Ciclo permanente «MAAM para chicos» con actividades didácticas. |
| 16 | **Complejo Museológico Explora Salta** | Florida 20 (Casa Arias Rengel / Casa Leguizamón) | `espacio_cultural_infantil` | No | Martes a domingo de 10:00 a 19:00 | https://www.culturasalta.gov.ar/ | Ya existe como `venue` (`8ee81049`). Museografía interactiva pensada para recorrido familiar e infantil. |
| 17 | **Museo de Ciencias Naturales «Lic. Miguel Á. Arra» (UNSa)** | Mendoza 2 (Parque San Martín) | `espacio_cultural_infantil` | No | Martes a domingo (tarde, verificar horario estacional) | https://www.unsa.edu.ar/ | Clásico paseo escolar y familiar frente al lago del Parque San Martín (fauna, minerales y paleontología). |

---

## 3. Centros de juegos y peloteros comerciales (`salon_juegos` y `pelotero`)

| # | Nombre | Dirección (Salta Capital) | Tipo | ¿Con reserva? | Horario de referencia | Fuente pública | Notas para verificar |
|---|---|---|---|---|---|---|---|
| 18 | **Neverland · Alto NOA Shopping** | Av. Bicentenario de la Batalla de Salta 702 (Alto NOA Shopping) | `salon_juegos` | No | Lunes a domingo de 10:00 a 22:00 | https://neverland.com.ar/ | Centro de entretenimiento familiar techado (ideal días de lluvia), juegos mecánicos y arcade con tarjeta recargable. |
| 19 | **Neverland · Portal Salta Shopping** | Av. Virrey Toledo 702 (Portal Salta / Easy) | `salon_juegos` | No | Lunes a domingo de 10:00 a 22:00 | https://neverland.com.ar/ | Sala de juegos infantiles y mecánicos cubierta dentro del centro comercial. |
| 20 | **Pelotero Aventura** | Gral. José Antonio Uriburu 1370 | `pelotero` | **Sí** («Con reserva») | Según turnos de eventos / atención por la tarde | Guía pública de salones (`peloterosenlaweb.com`) | Verificar teléfono comercial vigente y si ofrece horas de juego libre además de cumpleaños con reserva. |
| 21 | **Punto Diversión** | Marcelo T. de Alvear 427 | `salon_juegos` | **Sí** («Con reserva») | Atención comercial vespertina / eventos reservados | Directorio público (`salones.ar`) | Salón infantil céntrico; confirmar en verificación si mantiene turnos abiertos o solo eventos con reserva. |
| 22 | **Kids Club** | 25 de Mayo 660 | `pelotero` | **Sí** («Con reserva») | Lunes a viernes de 18:00 a 20:00 (atención comercial) y turnos de fin de semana | Directorio público (`elsitiodelpelotero.com`) | Salón en macrocentro; requiere verificación telefónica o presencial antes de pasar a publicado. |

---

## Verificación contra fuentes públicas (G-3 Q6, consultado el 2026-11-03)

> Revisión **documental** hecha por Gemini; nadie fue al lugar ni llamó por teléfono. Los enlaces son los sitios de las fuentes (la búsqueda no devuelve la URL de cada página) y los objetos de OpenStreetMap. Cada fila de arriba sigue sin publicarse sola: esto solo dice qué coincide y qué hay que mirar.
>
> **Leyenda:** ✅ coincide · ⚠️ dudoso (difiere o no se pudo confirmar) · ⛔ cerrado. **No se encontró ningún lugar cerrado**, pero tampoco hay confirmación de «abierto hoy» para los comerciales.
>
> Falta en todos los parques y plazas: OSM no confirmó el sector de juegos (la consulta a Overpass falló), así que «tiene juegos» queda por mirar en el lugar o en Google Maps.

| # | Lugar | Dirección | Horario | Fuente(s) | Qué cambiar o mirar |
|---|---|---|---|---|---|
| 1 | Parque del Bicentenario | ✅ en OSM («B° El Parque», Capital) | ⚠️ sin fuente | [OSM way/197709147](https://www.openstreetmap.org/way/197709147) | Calle exacta («Av. Bolivia») y horario 07:00–23:00 sin confirmar. |
| 2 | Parque Sur | ⚠️ OSM lo ubica en B° La Aldea / La Jorgelina, no «frente a B° San Remo» | ⚠️ sin fuente | [OSM way/1270463992](https://www.openstreetmap.org/way/1270463992) | Corregir la referencia al barrio. |
| 3 | Parque San Martín | ✅ (B° 13 de Abril) | ⚠️ sin fuente | [OSM relation/19188202](https://www.openstreetmap.org/relation/19188202) | Horario de juegos y calesitas sin confirmar. |
| 4 | Plaza Alvarado | ⚠️ OSM la ubica en B° Campo Caseros, cerca del natatorio (Ayacucho); «Belgrano y Moldes» no coincide | ⚠️ | [OSM way/125164409](https://www.openstreetmap.org/way/125164409) | Revisar las calles. |
| 5 | Plaza Belgrano | ✅ zona centro (El Pilar) | ⚠️ | [OSM way/110355106](https://www.openstreetmap.org/way/110355106) | Esquina sin confirmar. |
| 6 | Plaza Güemes | ⚠️ **no está en OSM en Salta Capital** (solo en Cafayate y Coronel Moldes) | ⚠️ | — | No publicar sin confirmar que existe con ese nombre y esa ubicación. |
| 7 | Plaza Evita | ✅ zona B° La Loma | ⚠️ | [OSM way/103437505](https://www.openstreetmap.org/way/103437505) | Esquinas sin confirmar. |
| 8 | Plaza España | ⚠️ OSM tiene **dos** en Capital (El Pilar y B° La Loma); la dirección del seed no distingue | ⚠️ | [OSM relation/19212725](https://www.openstreetmap.org/relation/19212725), [OSM node/4868105021](https://www.openstreetmap.org/node/4868105021) | Decidir cuál es. |
| 9 | Plaza Macacha Güemes | ⚠️ **no apareció en OSM** | ⚠️ | — | La nota dice «OSM leisure=park»: no se pudo reproducir. |
| 10 | Complejo de Bibliotecas y Archivos | ✅ Av. Belgrano 1002 (esq. Sarmiento) | ✅ L–V 08:00–20:00; además sábados 09:30–17:00 | culturasalta.gov.ar, bibliotecasyarchivosalta.gob.ar, saltatransparente.com.ar | Sector infantil: «Biblioteca Infantil Eva Perón». Se puede sumar el sábado. |
| 11 | Usina Cultural | ✅ España 1-98 (esq. Juramento) | ⚠️ las fuentes dicen **L a D 09:00–13:30 y 17:00–21:30**; el seed dice «Mar–Dom 09:00–21:00» | [OSM node/8122996617](https://www.openstreetmap.org/node/8122996617), saltaciudad.travel, saltatransparente.com.ar | Corregir días y corte del mediodía. |
| 12 | Distrito Cultural Dino Saluzzi | ✅ Av. Independencia 910 | ⚠️ solo se halló horario administrativo (08:00–13:00); los de los talleres varían | municipalidadsalta.gob.ar, quepasasalta.com.ar | «Talleres infantiles gratuitos» no confirmado. |
| 13 | Ludoteca (natatorio) | ✅ Ayacucho 76, dentro del Natatorio Municipal J. D. Perón | ⚠️ no se halló horario | [OSM way/196521309](https://www.openstreetmap.org/way/196521309), municipalidadsalta.gob.ar, ariesonline.com.ar | El nombre público es «Ludoteca Ciudad Infantil». Confirmar horario y cupos. |
| 14 | Museo Güemes | ✅ España 730 | ✅ Mar–Dom y feriados 11:00–19:00 | [OSM node/5213142895](https://www.openstreetmap.org/node/5213142895), museoguemes.gob.ar, culturasalta.gov.ar | — |
| 15 | MAAM | ✅ Mitre 77 | ✅ Mar–Dom 11:00–19:00, último ingreso 18:30; lunes cerrado | maam.gob.ar, saltaciudad.travel | OSM solo tiene «Bar del MAAM». |
| 16 | Explora Salta | ✅ La Florida 20 (esq. Caseros) | ⚠️ las fuentes dicen **10:00–20:00**; el seed dice 10:00–19:00 | culturasalta.gov.ar, saltaciudad.travel | Corregir el cierre a las 20:00. |
| 17 | Museo de Ciencias Naturales (UNSa) | ✅ Mendoza 2 | ⚠️ difiere: Mar–Vie 09–13 y 15–19; Sáb–Dom 15–19 (fuente secundaria) | [OSM way/1390782203](https://www.openstreetmap.org/way/1390782203), saltaciudad.travel, ariesonline.com.ar | Confirmar en el sitio de la UNSa. |
| 18 | Neverland (Alto NOA) | ⚠️ dirección coincide en directorios, pero el lugar se **remodeló y reabrió como «Neverland Sport Play»** | ⚠️ difiere: L–V 12–22, Sáb–Dom 13–23 (kupi.com) | near-place.com, defrentesalta.com.ar, insalta.info | Revisar nombre y horario antes de publicar. |
| 19 | Neverland (Portal Salta) | ⚠️ «Av. Virrey Toledo 702» no se pudo confirmar | ⚠️ la web del shopping dice **L–D 12:00–22:00**, no 10:00 | shoppingscencosud.com.ar | Corregir el horario. |
| 20 | Pelotero Aventura | ⚠️ **discrepancia: las guías dicen «Urquiza 1370»; el seed dice «Uriburu 1370»** | ⚠️ no publicado | peloterosenlaweb.com, paginasamarillas.com.ar, laserena.com.ar | Dudoso. Confirmar la dirección antes de cualquier uso. |
| 21 | Punto Diversión | ✅ Alvear 427 (dos directorios) | ⚠️ no publicado | elsitiodelpelotero.com, salonesdeeventos.com.ar | Fuentes solo comerciales; sin horario. |
| 22 | Kids Club | ✅ 25 de Mayo 660 | ⚠️ «L–V 18–20» no tiene fuente | elsitiodelpelotero.com, peloterosenlaweb.com, salones.ar | Sin horario confirmado. |

**Resumen:** horario confirmado en 3 lugares (10, 14, 15); horario distinto de la fuente en 5 (11, 16, 17, 18, 19); dirección dudosa en 8 (2, 4, 6, 8, 9, 18, 19, 20), de los cuales 6 y 9 no aparecen en OSM; sin horario en las fuentes: parques, plazas, 12, 13, 20, 21 y 22. Cerrados: ninguno.
