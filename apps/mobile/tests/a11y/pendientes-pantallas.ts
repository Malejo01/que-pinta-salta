// 46-b/46-d: línea de base de `tests/accesibilidad-detector.test.ts` para
// `app/**` — mismo criterio que `tests/a11y/pendientes-componentes.ts` (leer
// su comentario de cabecera primero): lo que el barrido encuentra HOY, solo
// puede bajar, un archivo ausente vale 0 para las seis reglas.
//
// 46-d bajó los 19 hallazgos que había (18/10): `app/_layout.tsx`,
// `app/bienvenida.tsx`, `app/evento/[id].tsx`, `app/flyer/[id].tsx`,
// `app/pelicula/[id].tsx`, `app/cines.tsx`, `app/(tabs)/cuenta.tsx` y
// `app/(tabs)/buscar.tsx` ya no tienen hallazgos de `sin-rol`,
// `link-externo` ni `area-chica`: ver el reporte de la tarea para el detalle
// de cada atributo sumado. Esta lista queda vacía a propósito.
import type { LineaBaseAccesibilidad } from './pendientes-componentes'

export const PENDIENTES_PANTALLAS: LineaBaseAccesibilidad = {}
