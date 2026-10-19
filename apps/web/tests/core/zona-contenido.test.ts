/**
 * `packages/core/src/mapa/zona.ts` lo crea la Ronda 53, pero R54 y R55 pueden
 * agregar el mismo archivo con el mismo contenido exacto (cada una lo crea si
 * no existe todavía, para no depender del orden de merge entre rondas). Para
 * que el merge entre las tres no pelee, las tres tienen que escribir byte por
 * byte lo mismo.
 *
 * Este test fija ese contenido: lee el archivo de verdad con `readFileSync`
 * y lo compara con el texto esperado, copiado aquí mismo (no en `ops/`, que
 * no está en git y no vería ningún otro agente ni CI). Si R54 o R55 cambian
 * una coma, un nombre o un comentario de ese archivo, este test se pone en
 * rojo en esta rama: así se entera quien lo tocó, en vez de descubrir un
 * conflicto de merge silencioso (o peor, una resolución "automática" que deja
 * el archivo distinto en cada rama). Y si alguien quiere cambiar la zona de
 * Salta (el rectángulo, el centro del mapa, o el criterio de
 * `coordenadasEnSalta`), tiene que cambiarlo en las tres rondas a la vez: este
 * test es, a propósito, lo que lo obliga a notarlo.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const RUTA_ZONA = fileURLToPath(new URL('../../../../packages/core/src/mapa/zona.ts', import.meta.url))

// Copiado tal cual del encargo de la tarea 53-q2 (el texto que R53, R54 y R55
// tienen que compartir). Con un salto de línea final.
const CONTENIDO_ESPERADO = `/**
 * Zona de Salta para el mapa y la geocodificación (R53, R54 y R55).
 *
 * Lo crea la primera de esas tres rondas que corra, con este contenido exacto:
 * así ninguna depende del merge de otra. Si ya existe, se importa y no se toca.
 */

/** Rectángulo que contiene a la provincia de Salta, con un margen (aproximado). */
export const ZONA_SALTA = { latMin: -26.6, latMax: -21.8, lngMin: -68.7, lngMax: -62.2 } as const

/** Plaza 9 de Julio, el centro de Salta capital (aproximado): el centro inicial del mapa. */
export const CENTRO_SALTA_CAPITAL = { lat: -24.7883, lng: -65.4106 } as const

/** \`true\` si las dos son números finitos y caen adentro de \`ZONA_SALTA\`. */
export function coordenadasEnSalta(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  return lat >= ZONA_SALTA.latMin && lat <= ZONA_SALTA.latMax && lng >= ZONA_SALTA.lngMin && lng <= ZONA_SALTA.lngMax
}
`

describe('packages/core/src/mapa/zona.ts: contenido compartido entre R53, R54 y R55', () => {
  it('es exactamente el texto acordado (normalizando solo \\r\\n -> \\n)', () => {
    // Si cualquiera de las tres rondas reescribe este archivo con otro
    // contenido (otro margen de la zona, otro centro, otro criterio en
    // coordenadasEnSalta, un comentario distinto), esta comparación deja de
    // ser igual y el test cae: es justo lo que tiene que pasar.
    const crudo = readFileSync(RUTA_ZONA, 'utf8')
    const normalizado = crudo.replace(/\r\n/g, '\n')
    expect(normalizado).toBe(CONTENIDO_ESPERADO)
  })
})
