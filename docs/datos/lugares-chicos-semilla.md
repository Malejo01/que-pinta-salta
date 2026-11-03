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
