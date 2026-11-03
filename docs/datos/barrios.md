# Barrios y zonas de Salta Capital (`docs/datos/barrios.md`)

Lista de **25 barrios y zonas conocidas de Salta Capital** para el selector «Elegí tu barrio» de `/mapa` (propuesta de `docs/propuestas/lugares-para-chicos.md` §3.4 y decisión 10 de `docs/tanda-q5/README.md`).

- **Precisión:** 3 decimales (~110 metros), suficiente para ordenar lugares por cercanía y centrar el mapa sin identificar domicilios.
- **Fuente:** nodos `place=suburb`, `place=quarter` y `place=neighbourhood` de **OpenStreetMap** dentro del ejido de Salta Capital, más la constante `CENTRO_SALTA_CAPITAL` de `packages/core/src/mapa/zona.ts`.
- **Criterio de selección:** cobertura geográfica equilibrada (Centro, Norte, Noroeste, Oeste, Este, Sudeste y Sur) priorizando las zonas de referencia más usadas por residentes.

---

## 1. Tabla principal (25 barrios y zonas)

| # | Barrio / Zona | Sector | Latitud | Longitud | Estado | Fuente (OpenStreetMap) | Observaciones |
|---|---|---|---:|---:|---|---|---|
| 1 | **Centro (Plaza 9 de Julio)** | Centro | `-24.788` | `-65.411` | Verificado | `packages/core/src/mapa/zona.ts` (`-24.7883, -65.4106`) | Punto cero de referencia del mapa de QPS. |
| 2 | **Hernando de Lerma** | Macrocentro Sur | `-24.803` | `-65.407` | Verificado | https://www.openstreetmap.org/node/11808105621 | Zona Parque San Martín / terminal. |
| 3 | **20 de Febrero** | Macrocentro Oeste | `-24.775` | `-65.422` | Verificado | https://www.openstreetmap.org/node/11808143278 | Zona Monumento 20 de Febrero / Hospital Materno Infantil. |
| 4 | **Tres Cerritos** | Noreste | `-24.768` | `-65.393` | Verificado | https://www.openstreetmap.org/node/8122572009 | Nodo central del barrio; en OSM también figura `Lomas de Tres Cerritos` más al norte (`-24.763, -65.390`). |
| 5 | **El Pilar** | Norte | `-24.769` | `-65.409` | Verificado | https://www.openstreetmap.org/node/5252391947 | Entre Av. Reyes Católicos y Zuviría. |
| 6 | **Vicente Solá** | Norte | `-24.763` | `-65.409` | Verificado | https://www.openstreetmap.org/node/5782220371 | Contiguo a El Pilar y Miguel Ortiz. |
| 7 | **Miguel Ortiz** | Norte | `-24.755` | `-65.407` | Verificado | https://www.openstreetmap.org/node/9521850457 | Referencia de zona norte tradicional. |
| 8 | **Pereyra Rozas** | Norte | `-24.745` | `-65.407` | Verificado | https://www.openstreetmap.org/node/9524505022 | En expansión; cerca del Parque Bicentenario. |
| 9 | **Parque General Belgrano** | Norte | `-24.737` | `-65.405` | Verificado | https://www.openstreetmap.org/node/9528144388 | Todas sus etapas alrededor de este punto. |
| 10 | **Castañares** | Norte | `-24.731` | `-65.401` | **Dudoso** | https://www.openstreetmap.org/node/5127854659 | Corresponde al complejo frente a la UNSa (`place=quarter`). En OSM existe otro nodo `Barrio Castañares Viejo` en `-24.766, -65.410` (`node/11808143176`). Conviene usar este (`-24.731, -65.401`). |
| 11 | **Ciudad del Milagro** | Norte | `-24.720` | `-65.407` | Verificado | https://www.openstreetmap.org/node/5127854663 | Extremo norte junto a Av. Bolivia / Ruta 9. |
| 12 | **El Huaico** | Norte / Noroeste | `-24.725` | `-65.424` | **Dudoso** | https://www.openstreetmap.org/node/9547963295 | Barrio muy extendido de oeste a este: `El Huaico` está en `-24.725, -65.424` y `El Huaico II` en `-24.720, -65.416` (`node/5667528907`). |
| 13 | **Alto La Loma** | Oeste | `-24.770` | `-65.439` | Verificado | https://www.openstreetmap.org/node/14325320648 | Camino a Grand Bourg; contiguo a `La Loma` (`-24.772, -65.435`). |
| 14 | **Grand Bourg** | Oeste | `-24.776` | `-65.446` | Verificado | https://www.openstreetmap.org/node/11261716421 | Principal referencia del sector oeste. |
| 15 | **Villa Primavera** | Suroeste | `-24.798` | `-65.441` | Verificado | https://www.openstreetmap.org/node/9984282674 | Zona oeste-centro. |
| 16 | **Santa Lucía** | Suroeste | `-24.809` | `-65.440` | Verificado | https://www.openstreetmap.org/node/11808143301 | Junto al río Arenales, sector oeste. |
| 17 | **Villa Las Rosas** | Este | `-24.804` | `-65.394` | Verificado | https://www.openstreetmap.org/node/14331187229 | Al pie del cerro San Bernardo. |
| 18 | **Portezuelo** | Este | `-24.794` | `-65.394` | **Dudoso** | https://www.openstreetmap.org/node/14331187231 | En OSM está dividido en `Portezuelo Norte` (`-24.794, -65.394`) y `Portezuelo Sur` (`-24.796, -65.393`, `node/14331187230`). La diferencia es de ~200 m. |
| 19 | **Villa Mitre** | Este | `-24.813` | `-65.377` | Verificado | https://www.openstreetmap.org/node/14325370570 | Referencia principal de la zona este / Villa Floresta. |
| 20 | **Solidaridad** | Sudeste | `-24.841` | `-65.393` | Verificado | https://www.openstreetmap.org/node/8777665979 | Referencia principal del sector sudeste (Ruta 26 / Av. Discépolo). |
| 21 | **Parque La Vega** | Sur | `-24.836` | `-65.429` | Verificado | https://www.openstreetmap.org/node/9528650524 | Próximo a Av. Tavella / Rotonda de Limache. |
| 22 | **San Remo** | Sur | `-24.830` | `-65.424` | Verificado | https://www.openstreetmap.org/node/14323929308 | Zona sur sobre eje Av. Tavella / Av. Paraguay. |
| 23 | **El Tribuno** | Sur | `-24.845` | `-65.442` | Verificado | https://www.openstreetmap.org/node/14325520307 | Uno de los barrios más grandes y poblados del sur. |
| 24 | **Limache** | Sur | `-24.851` | `-65.431` | Verificado | https://www.openstreetmap.org/node/14325555514 | Contiguo a Bancario, Intersindical y Ciudad Valdivia. |
| 25 | **Santa Ana I** | Sur | `-24.858` | `-65.467` | **Dudoso** | https://www.openstreetmap.org/node/11371222827 | En OSM conviven dos nodos: `Bº Santa Ana I` (`-24.858, -65.467`) y `Bº Santa Ana 1` (`-24.864, -65.473`, `node/11371222829`), separados ~800 m. |

---

## 2. Casos descartados o con coordenadas vacías por ambigüedad

Estos nombres son frecuentes en el habla cotidiana pero **no tienen un único nodo de barrio claro en OpenStreetMap** o presentan homónimos entre extremos opuestos de la ciudad:

| Nombre | Latitud | Longitud | Motivo de exclusión / duda |
|---|---|---|---|
| **Juan Pablo II** | *(vacío)* | *(vacío)* | **Homónimo en OSM:** existen dos barrios con el mismo nombre en extremos opuestos: zona norte (`-24.723, -65.398`, https://www.openstreetmap.org/node/5127854662) y zona sur (`-24.846, -65.454`, https://www.openstreetmap.org/node/9525930792). Si se incluye, debe desambiguarse como «Juan Pablo II (Norte)» y «Juan Pablo II (Sur)». |
| **26 de Marzo** | *(vacío)* | *(vacío)* | **Homónimo en OSM:** aparece en zona sudeste (`-24.827, -65.404`, https://www.openstreetmap.org/node/12452998204) y en zona sur-oeste (`-24.865, -65.450`, https://www.openstreetmap.org/node/9739804918). |
| **Paseo Balcarce** | *(vacío)* | *(vacío)* | Corredor gastronómico y cultural sobre calle Balcarce (entre Av. Entre Ríos y Ameghino), no registrado como nodo `place=neighbourhood` ni `suburb` en OSM. Queda cubierto a menos de 900 m por **Centro**. |
| **Paseo Güemes** | *(vacío)* | *(vacío)* | Corredor gastronómico sobre Av. Gral. Güemes, sin etiqueta de barrio en OSM. Queda entre **Centro** y **Tres Cerritos**. |
