/**
 * Localidades de Salta para acotar la geocodificación (R53-b).
 *
 * "Salta" a secas, para Nominatim, es la provincia: "Necochea 719, Salta"
 * terminaba en Tartagal y "San martin 484, Salta" en Rosario de la Frontera.
 * Por eso cada lugar se busca primero adentro del rectángulo de SU ciudad
 * (`bounded=1`): Salta Capital salvo que el nombre o la dirección mencionen
 * otra localidad conocida.
 *
 * Los rectángulos de las localidades del interior son APROXIMADOS: el centro
 * del pueblo con un margen de unos 6 km para cada lado. Si uno quedara corrido,
 * el efecto es conservador: la búsqueda acotada no encuentra nada, se pasa a la
 * de la provincia y el resultado va a revisar (nunca a confianza alta).
 *
 * Puro: sin red, sin base, sin sistema de archivos.
 */

/** Minúsculas, sin tildes y con espacios colapsados (igual que `normalizarConsulta`, sin importarla: consultas.ts importa este archivo). */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Rectángulo en grados. */
export interface Zona {
  latMin: number
  latMax: number
  lngMin: number
  lngMax: number
}

export interface Localidad {
  /** Cómo se nombra en la consulta libre y en el reporte ("Salta Capital", "Cafayate"). */
  nombre: string
  /** El `city` de la búsqueda estructurada de Nominatim. */
  ciudad: string
  zona: Zona
  /** Formas (ya normalizadas: minúsculas, sin tildes) que, como palabras sueltas en el nombre o la dirección, la señalan. */
  menciones: readonly string[]
}

/** Salta Capital, aproximado (lon -65.50 a -65.33, lat -24.86 a -24.70). */
export const ZONA_SALTA_CAPITAL: Zona = { latMin: -24.86, latMax: -24.7, lngMin: -65.5, lngMax: -65.33 }

export const SALTA_CAPITAL: Localidad = {
  nombre: 'Salta Capital',
  ciudad: 'Salta',
  zona: ZONA_SALTA_CAPITAL,
  menciones: [],
}

/** Margen alrededor del centro de una localidad del interior (≈ 6,5 km de lat, ≈ 7 km de lon). */
const MARGEN_LAT = 0.06
const MARGEN_LNG = 0.07

function alrededorDe(lat: number, lng: number): Zona {
  return { latMin: lat - MARGEN_LAT, latMax: lat + MARGEN_LAT, lngMin: lng - MARGEN_LNG, lngMax: lng + MARGEN_LNG }
}

/**
 * Localidades del interior que se reconocen por nombre. Quedan afuera a
 * propósito los nombres que en la capital también son calles o barrios
 * ("Güemes", "San Lorenzo", "Vaqueros", "Molinos", "La Viña"): confundir una
 * calle de la capital con un pueblo mandaría la búsqueda al lugar equivocado.
 */
export const LOCALIDADES_DEL_INTERIOR: readonly Localidad[] = [
  { nombre: 'Cafayate', ciudad: 'Cafayate', zona: alrededorDe(-26.073, -65.976), menciones: ['cafayate'] },
  { nombre: 'Cachi', ciudad: 'Cachi', zona: alrededorDe(-25.12, -66.163), menciones: ['cachi'] },
  {
    nombre: 'Orán',
    ciudad: 'San Ramón de la Nueva Orán',
    zona: alrededorDe(-23.132, -64.325),
    menciones: ['oran', 'nueva oran', 'san ramon de la nueva oran'],
  },
  { nombre: 'Tartagal', ciudad: 'Tartagal', zona: alrededorDe(-22.516, -63.801), menciones: ['tartagal'] },
  { nombre: 'Metán', ciudad: 'San José de Metán', zona: alrededorDe(-25.499, -64.973), menciones: ['metan'] },
  {
    nombre: 'Rosario de la Frontera',
    ciudad: 'Rosario de la Frontera',
    zona: alrededorDe(-25.797, -64.971),
    menciones: ['rosario de la frontera'],
  },
  { nombre: 'Rosario de Lerma', ciudad: 'Rosario de Lerma', zona: alrededorDe(-24.979, -65.58), menciones: ['rosario de lerma'] },
  { nombre: 'Cerrillos', ciudad: 'Cerrillos', zona: alrededorDe(-24.898, -65.488), menciones: ['cerrillos'] },
  { nombre: 'Campo Quijano', ciudad: 'Campo Quijano', zona: alrededorDe(-24.911, -65.639), menciones: ['campo quijano'] },
  { nombre: 'Chicoana', ciudad: 'Chicoana', zona: alrededorDe(-25.104, -65.534), menciones: ['chicoana'] },
  { nombre: 'El Carril', ciudad: 'El Carril', zona: alrededorDe(-25.078, -65.468), menciones: ['el carril'] },
  { nombre: 'Coronel Moldes', ciudad: 'Coronel Moldes', zona: alrededorDe(-25.281, -65.476), menciones: ['coronel moldes'] },
  { nombre: 'La Caldera', ciudad: 'La Caldera', zona: alrededorDe(-24.603, -65.381), menciones: ['la caldera'] },
  { nombre: 'Embarcación', ciudad: 'Embarcación', zona: alrededorDe(-23.209, -64.099), menciones: ['embarcacion'] },
  { nombre: 'Pichanal', ciudad: 'Pichanal', zona: alrededorDe(-23.316, -64.218), menciones: ['pichanal'] },
  { nombre: 'Aguaray', ciudad: 'Aguaray', zona: alrededorDe(-22.239, -63.731), menciones: ['aguaray'] },
  { nombre: 'Salvador Mazza', ciudad: 'Salvador Mazza', zona: alrededorDe(-22.049, -63.693), menciones: ['salvador mazza'] },
  {
    nombre: 'Joaquín V. González',
    ciudad: 'Joaquín V. González',
    zona: alrededorDe(-25.116, -64.127),
    menciones: ['joaquin v. gonzalez', 'joaquin v gonzalez', 'j. v. gonzalez'],
  },
  {
    nombre: 'San Antonio de los Cobres',
    ciudad: 'San Antonio de los Cobres',
    zona: alrededorDe(-24.221, -66.318),
    menciones: ['san antonio de los cobres'],
  },
  { nombre: 'Iruya', ciudad: 'Iruya', zona: alrededorDe(-22.789, -65.214), menciones: ['iruya'] },
  { nombre: 'San Carlos', ciudad: 'San Carlos', zona: alrededorDe(-25.892, -65.932), menciones: ['san carlos'] },
]

/** `true` si `(lat, lng)` cae adentro de `zona` (bordes incluidos). */
export function enZona(zona: Zona, lat: number, lng: number): boolean {
  return lat >= zona.latMin && lat <= zona.latMax && lng >= zona.lngMin && lng <= zona.lngMax
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** `true` si `mencion` aparece en `texto` como palabras enteras (no como parte de otra: "cachi" no está en "cachivache"). */
function mencionaComoPalabra(texto: string, mencion: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escaparRegex(mencion)}($|[^a-z0-9])`).test(texto)
}

/**
 * La localidad del lugar: la primera del interior que el nombre o la
 * dirección mencionen como palabra entera (sin tildes ni mayúsculas); si
 * ninguna, Salta Capital.
 */
export function localidadDelLugar({ nombre, direccion }: { nombre: string; direccion?: string | null }): Localidad {
  const texto = normalizar(`${nombre} ${direccion ?? ''}`)
  for (const localidad of LOCALIDADES_DEL_INTERIOR) {
    if (localidad.menciones.some((m) => mencionaComoPalabra(texto, m))) return localidad
  }
  return SALTA_CAPITAL
}
