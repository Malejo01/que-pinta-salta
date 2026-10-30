# Línea base de consumo de tokens por ronda

Fecha: 30/10/2026. Sirve de punto de comparación para la R79 (ahorro de tokens): cuánto gastaban las rondas nocturnas antes de tocar nada.

Los datos salen de los informes de la corrida nocturna (`manana.md` archivados en `ops/noche/`, carpeta local no versionada), sección "Uso del plan" que agrega `noche.mjs`, y de `ops/rondas/<NN>-*/progreso.md`. No se corrió nada nuevo para medir. Los equivalentes en US$ son una referencia de la API: con el plan Max no se cobran.

Una corrida es la sesión del lead de esa ronda. Los teammates (Sonnet) se suman en el mismo reparto por modelo. Entrada = tokens de entrada sin caché.

## Rondas principales

| Ronda | Tareas | Duración | Opus 5.5: entrada / salida / caché leída / caché escrita | Sonnet 5.5: entrada / salida / caché leída / caché escrita | Equiv. API | Vueltas de arreglo | Quién |
|---|---|---|---|---|---|---|---|
| R72 (app, PR #104) | 7 | 13 min | 194 / 67.793 / 15.152.129 / 236.359 | 208 / 129.150 / 3.958.396 / 556.227 | US$ 9,36 | 2 (72-a, 72-c) | Claude |
| R73 (web accesible, PR #105) | [COMPLETAR: cantidad; hubo 3 programadores] | 15 min | 118 / 37.624 / 5.421.950 / 121.259 | 86 / 29.175 / 952.510 / 136.953 | US$ 3,54 | 2 (73-a) | Claude |
| R76 (integración de la beta, PR #125) | [COMPLETAR: cantidad; 3 programadores, 3 revisores, 1 ux-ui] | 59 min | 262 / 74.261 / 20.575.343 / 271.805 | 430 / 158.546 / 16.156.337 / 896.352 | US$ 13,22 | 0 | Claude |
| R77 (web cierre Q2, PR #130) | 77-a1, 77-a2, 77-a3, 77-c, 77-d y revisión final 77-q; 77-b no se hizo | 56 min | 136 / 64.336 / 7.716.272 / 163.894 | 246 / 117.182 / 4.301.695 / 512.575 | US$ 7,03 | 1 (77-a1) | Claude hizo las del PR #130; la deuda de tests (77-b, J1/J2/J3) quedó para Google (Jules, y después Antigravity) |

Haiku: no figura en ningún informe (solo Opus y Sonnet).

## Extra (rondas con datos en los informes)

| Ronda | Tareas | Duración | Opus 5.5 (ent. / sal. / caché leída / caché escrita) | Sonnet 5.5 (ent. / sal. / caché leída / caché escrita) | Equiv. API | Vueltas | Quién |
|---|---|---|---|---|---|---|---|
| R74 (publicidad, PR #126) | [COMPLETAR]; 74-d no se hizo (pide migración) | 44 min | 192 / 71.265 / 12.616.100 / 199.245 | 144 / 70.188 / 1.480.155 / 367.964 | US$ 7,31 | 2 (74-a) | Claude |
| R75 (/admin/lugares, PR #127) | 3 (75-a, 75-b, 75-q) | 17 min | 86 / 26.503 / 3.444.666 / 110.153 | 82 / 28.869 / 1.016.624 / 132.222 | US$ 2,82 | 1 (75-a) | Claude |
| R78 (inglés en el resto, PR #133) | [COMPLETAR] | 6 min en el registro de `noche.mjs` [COMPLETAR: por qué es tan corta; puede ser una corrida de cierre] | 186 / 62.258 / 9.297.585 / 179.395 | 448 / 240.913 / 21.363.340 / 984.097 | US$ 11,55 | 5 (78-a: 2, 78-c: 1, 78-b: 1, tests de qa: 1) | Claude |

## Teammates lanzados por ronda

R72: 11 (programador 4 + 1 reanudado, qa 2, revisor 3, seguridad 1, ux-ui 1). R73: 6. R76: 7. R77: 14 (programador 6, revisor 6, seguridad 1, ux-ui 1). R74: 13. R75: 5. R78: 11.

## Lectura

- Por equivalente en API, la R76 fue la más cara (US$ 13,22), seguida de la R78 (11,55) y la R72 (9,36). La más barata fue la R75 (2,82).
- Por teammate lanzado, la R76 es la más cara (13,22 / 7 = US$ 1,89) y la R77 la más barata (7,03 / 14 = US$ 0,50). La R76 lanzó 7 teammates (contra 11 de la R72 y 14 de la R77) pero tuvo mucha más caché leída en Sonnet (16,2 M contra 1,0 M en la R73).
- La caché leída es el grueso de todo: en cada ronda es de millones de tokens, contra decenas o cientos de miles de salida. En la R78, Sonnet leyó 21,4 M de caché y generó 240.913 de salida; en la R72, Opus leyó 15,2 M y generó 67.793.
- La salida de Sonnet supera a la de Opus en la mayoría de las rondas (por ejemplo R78: 240.913 contra 62.258), salvo en la R73 (29.175 contra 37.624) y la R74 (70.188 contra 71.265).
- Opus lee más caché que Sonnet en todas las rondas salvo la R78 (por ejemplo R72: 15,2 M contra 4,0 M; R76: 20,6 M contra 16,2 M).
- Las vueltas de arreglo no explican el costo: la R76 tuvo 0 y fue la más cara; la R78 tuvo 5.
- No hay forma de medir la parte de Google (Jules/Antigravity) con estos informes: no registran sus tokens. [COMPLETAR: si Google informa uso por tarea].
