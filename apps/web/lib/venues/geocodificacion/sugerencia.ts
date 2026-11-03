/**
 * Sugerencia de ubicación (Q5-16, decisión nº7 de Mauro): cuando Nominatim no
 * da un match seguro (`'para-revisar'`), la corrida con `--aplicar` o
 * `--programado` guarda su mejor candidato en `venues.geocode_sugerencia_*`
 * SIN tocar `latitude`/`longitude`. Un admin la confirma (o la descarta) en la
 * pestaña «Sin ubicación» de /admin/lugares; mientras esté pendiente, la
 * corrida programada no vuelve a consultar ese lugar (ver `./programado`).
 *
 * Los datos de la sugerencia son © colaboradores de OpenStreetMap (ODbL): el
 * admin los muestra con esa atribución.
 *
 * Puro: sin red ni base. No importa `./nominatim` (la lista cerrada de
 * `tests/venues/geocodificacion/no-programado.test.ts`).
 */

/** Largo máximo de `geocode_sugerencia_texto` (el check de la migración Q5-16). */
export const MAX_TEXTO_SUGERENCIA = 300

/** Las cuatro columnas de la sugerencia, tal como se escriben en `venues`. */
export interface ColumnasSugerencia {
  geocode_sugerencia_lat: number | null
  geocode_sugerencia_lng: number | null
  geocode_sugerencia_texto: string | null
  geocode_sugerencia_at: string | null
}

/**
 * Las cuatro columnas en null: se usa al guardar con confianza alta, al cargar
 * a mano, al confirmar y al descartar. Se devuelve un objeto nuevo cada vez
 * para que nadie lo modifique sin querer.
 */
export function sugerenciaVacia(): ColumnasSugerencia {
  return {
    geocode_sugerencia_lat: null,
    geocode_sugerencia_lng: null,
    geocode_sugerencia_texto: null,
    geocode_sugerencia_at: null,
  }
}

/**
 * El `display_name` de Nominatim, sin espacios de más y recortado a
 * `MAX_TEXTO_SUGERENCIA` caracteres (contados como los cuenta Postgres, por
 * punto de código, no por unidad UTF-16). `null` si queda vacío.
 */
export function textoDeSugerencia(displayName: string | null | undefined): string | null {
  if (typeof displayName !== 'string') return null
  const limpio = displayName.replace(/\s+/g, ' ').trim()
  if (limpio.length === 0) return null
  const caracteres = Array.from(limpio)
  if (caracteres.length <= MAX_TEXTO_SUGERENCIA) return limpio
  return caracteres.slice(0, MAX_TEXTO_SUGERENCIA - 1).join('').trimEnd() + '…'
}

/** Lo mínimo de un resultado de Nominatim que hace falta para la sugerencia. */
export interface CandidatoSugerencia {
  lat: number
  lon: number
  display_name: string | null
}

/**
 * Las columnas a escribir para el mejor candidato `para-revisar`. `ahora` se
 * inyecta (los tests usan una fecha fija).
 */
export function columnasDeSugerencia(candidato: CandidatoSugerencia, ahora: Date): ColumnasSugerencia {
  return {
    geocode_sugerencia_lat: candidato.lat,
    geocode_sugerencia_lng: candidato.lon,
    geocode_sugerencia_texto: textoDeSugerencia(candidato.display_name),
    geocode_sugerencia_at: ahora.toISOString(),
  }
}

/** `true` si el lugar tiene una sugerencia pendiente (lat y lng no nulos). */
export function tieneSugerencia(lugar: {
  geocode_sugerencia_lat?: number | null
  geocode_sugerencia_lng?: number | null
}): boolean {
  return (
    lugar.geocode_sugerencia_lat !== null &&
    lugar.geocode_sugerencia_lat !== undefined &&
    lugar.geocode_sugerencia_lng !== null &&
    lugar.geocode_sugerencia_lng !== undefined
  )
}

/**
 * El filtro `.or()` de supabase-js que deja afuera una ubicación cargada a
 * mano (`geocode_source` null o `'nominatim'`). El mismo que usa
 * `filtroDeActualizacion` en `./plan`; repetido acá para que
 * `lib/admin/lugares-actions.ts` no dependa del plan del script.
 */
export const FILTRO_NO_MANUAL = 'geocode_source.is.null,geocode_source.eq.nominatim'
