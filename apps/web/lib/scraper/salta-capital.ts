/**
 * Filtro geográfico: quedarse sólo con los establecimientos de Salta Capital.
 *
 * Por qué hace falta
 * ------------------
 * El filtro que ya tenían los scrapers de EntradaUno era por PROVINCIA:
 *
 *     (v.cZona?.toLowerCase().trim() === 'salta') || (v.idProvincia === 16)
 *
 * y la agenda es de Salta Capital. Cachi y Cafayate son provincia de Salta,
 * así que pasaban. Medido contra la cartelera real, de los 11 establecimientos
 * que aprobaba ese filtro:
 *
 *     154.2 km  Museo de la Vid y el Vino          (Cafayate)
 *      84.2 km  Museo Arqueológico de Cachi        (Cachi)
 *       1.4 km  Museo Antropologico
 *       ...     los otros 8, todos a menos de 1.5 km
 *
 * Ninguno de los campos declarados sirve para separarlos: `cZona` dice
 * "Salta" en los 11, `cLocalidad` e `idLocalidad` vienen vacíos, y Cachi
 * tiene `idProvincia = 0` (dato roto del lado de la fuente, no un marcador
 * de otra provincia). Lo único confiable son las coordenadas embebidas en
 * el iframe de `cGoogleMapTag`.
 *
 * El salto entre 1.4 km y 84 km es tan grande que el umbral no necesita
 * ajuste fino: cualquier valor entre 5 y 80 da el mismo resultado.
 *
 * Este filtro es ADICIONAL al de provincia, no lo reemplaza.
 */

/** Plaza 9 de Julio, centro de Salta Capital. */
export const PLAZA_9_DE_JULIO = { lat: -24.7859, lng: -65.4117 }

/** Radio desde la plaza que se considera "Salta Capital". */
export const RADIO_CAPITAL_KM = 25

export interface VenueDescartado {
  id: number | string
  nombre: string
  km: number | null
  motivo: 'fuera-de-radio' | 'sin-coordenadas'
  domicilio?: string
}

/**
 * Saca lat/lng del iframe de Google Maps que trae la fuente.
 * El embed codifica la posición como `!2d<lng>!3d<lat>`.
 */
export function extraerCoordenadas(
  googleMapTag: string | null | undefined,
): { lat: number; lng: number } | null {
  if (!googleMapTag) return null
  const m = /!2d(-?\d+\.?\d*)!3d(-?\d+\.?\d*)/.exec(googleMapTag)
  if (!m) return null
  const lng = Number.parseFloat(m[1])
  const lat = Number.parseFloat(m[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

/** Distancia en km entre dos puntos (haversine). */
export function distanciaKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371
  const rad = (x: number) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * Separa los establecimientos de Capital de los del interior.
 *
 * Un establecimiento SIN coordenadas se conserva, y se reporta aparte. Es
 * deliberado: no se puede afirmar que esté lejos, y descartar en la duda
 * perdería lugares reales de Capital en silencio. Que aparezca en el log
 * alcanza para detectarlo si alguna vez pasa.
 */
export function filtrarSaltaCapital<T extends Record<string, any>>(
  venues: T[],
  opciones: {
    radioKm?: number
    getNombre?: (v: T) => string
    getId?: (v: T) => number | string
    getMapTag?: (v: T) => string | null | undefined
    getDomicilio?: (v: T) => string | null | undefined
  } = {},
): { dentro: T[]; descartados: VenueDescartado[] } {
  const radio = opciones.radioKm ?? RADIO_CAPITAL_KM
  const getNombre = opciones.getNombre ?? ((v) => String(v.cNombre ?? ''))
  const getId = opciones.getId ?? ((v) => v.idEstablecimiento)
  const getMapTag = opciones.getMapTag ?? ((v) => v.cGoogleMapTag)
  const getDomicilio = opciones.getDomicilio ?? ((v) => v.cDomicilio)

  const dentro: T[] = []
  const descartados: VenueDescartado[] = []

  for (const v of venues) {
    const coords = extraerCoordenadas(getMapTag(v))

    if (!coords) {
      // Sin coordenadas no se puede decidir: se conserva y se deja registro.
      dentro.push(v)
      descartados.push({
        id: getId(v),
        nombre: getNombre(v),
        km: null,
        motivo: 'sin-coordenadas',
        domicilio: getDomicilio(v) ?? undefined,
      })
      continue
    }

    const km = distanciaKm(PLAZA_9_DE_JULIO, coords)
    if (km <= radio) {
      dentro.push(v)
    } else {
      descartados.push({
        id: getId(v),
        nombre: getNombre(v),
        km,
        motivo: 'fuera-de-radio',
        domicilio: getDomicilio(v) ?? undefined,
      })
    }
  }

  return { dentro, descartados }
}

/**
 * Log auditable de cada corrida: qué se descartó y a qué distancia.
 * Se emite siempre, incluso sin descartes, para que la ausencia de líneas
 * signifique "no corrió" y no "no descartó nada".
 */
export function loguearDescartes(prefijo: string, descartados: VenueDescartado[]): void {
  const fuera = descartados.filter((d) => d.motivo === 'fuera-de-radio')
  const sinCoords = descartados.filter((d) => d.motivo === 'sin-coordenadas')

  if (fuera.length === 0) {
    console.log(`${prefijo} Sin establecimientos fuera del radio de ${RADIO_CAPITAL_KM} km.`)
  } else {
    console.log(`${prefijo} Descartados ${fuera.length} fuera del radio de ${RADIO_CAPITAL_KM} km:`)
    for (const d of fuera.sort((a, b) => (b.km ?? 0) - (a.km ?? 0))) {
      console.log(
        `${prefijo}   - [id ${d.id}] ${d.nombre} — ${d.km!.toFixed(1)} km` +
          (d.domicilio ? ` (${d.domicilio})` : ''),
      )
    }
  }

  if (sinCoords.length > 0) {
    console.warn(
      `${prefijo} ${sinCoords.length} establecimiento(s) SIN coordenadas: se conservan por las dudas.`,
    )
    for (const d of sinCoords) {
      console.warn(`${prefijo}   - [id ${d.id}] ${d.nombre}${d.domicilio ? ` (${d.domicilio})` : ''}`)
    }
  }
}
