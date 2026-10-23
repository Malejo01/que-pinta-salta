/**
 * Estilos y atribución del mapa (R54, `/mapa` en la web; R55 lo reusa en la
 * app).
 *
 * Fuente: <https://openfreemap.org/> ("There's no registration, no user
 * database, no API keys, and no cookies"; "there are no limits on the number
 * of map views or requests"; uso comercial: "Yes") y su quick start
 * (<https://openfreemap.org/quick_start/>), que lista las dos URL de estilo
 * de abajo. "Attribution is required. If you are using MapLibre, they are
 * automatically added" (MapLibre la toma del propio JSON del estilo: "©
 * OpenFreeMap © OpenMapTiles Data from OpenStreetMap"). Por eso el control de
 * atribución de MapLibre **no se apaga nunca** (`attributionControl: false`
 * está prohibido; compacto sí vale): sin él no hay atribución visible y los
 * datos de OpenStreetMap son ODbL.
 */

/** URL de los dos estilos de OpenFreeMap que usa el mapa (claro y oscuro). */
export const ESTILO_MAPA = {
  claro: 'https://tiles.openfreemap.org/styles/liberty',
  oscuro: 'https://tiles.openfreemap.org/styles/dark',
} as const

/** El origen de los tiles: lo usa la CSP (`connect-src`/`img-src`) de la tarea 54-c. */
export const ORIGEN_TILES = 'https://tiles.openfreemap.org'

/** Texto propio de atribución (además del control de MapLibre, que ya trae el suyo). */
export const ATRIBUCION_DATOS = '© colaboradores de OpenStreetMap'

/** Licencia ODbL de los datos de OpenStreetMap. */
export const URL_COPYRIGHT_OSM = 'https://www.openstreetmap.org/copyright'

/** El estilo de MapLibre según el tema resuelto del sitio (`resolvedTheme`). */
export function estiloSegunTema(tema: 'light' | 'dark'): string {
  return tema === 'dark' ? ESTILO_MAPA.oscuro : ESTILO_MAPA.claro
}
