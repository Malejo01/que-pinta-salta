/**
 * Q6-4 · Validación de los fixtures del banco (`docs/evaluacion-ia/*.json`):
 * forma, campos, formatos y que no haya datos personales. Pura: recibe el
 * JSON ya parseado y devuelve la lista de problemas (vacía si está bien).
 */
import { datosPersonalesEnFixture } from './datos-personales'
import type { ArchivoFixtures, CasoClasificacion, CasoFlyer, CasoTraduccion, UsoEvaluado } from './tipos'

/** Las categorías del catálogo (las mismas que `VALID_CATEGORIES` del flyer). */
export const CATEGORIAS = [
  'penas', 'humor', 'infantil', 'ballet', 'recitales', 'teatro', 'boliches', 'cine',
  'ferias', 'talleres', 'deportes', 'congresos', 'automovilismo', 'espectaculos', 'museos', 'alternativo',
] as const

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const RE_IMAGEN = /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/[\w./-]+\.(jpe?g|png|webp)$/i

type Obj = Record<string, unknown>
const esObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const esTexto = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const esTextoONulo = (v: unknown) => v === null || typeof v === 'string'
const esListaDeTextos = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')

export interface ResultadoValidacion<C> {
  archivo?: ArchivoFixtures<C>
  problemas: string[]
}

function validarCabecera(json: unknown, uso: UsoEvaluado, problemas: string[]): json is Obj {
  if (!esObj(json)) {
    problemas.push('no es un objeto JSON')
    return false
  }
  if (json.version !== 1) problemas.push('version tiene que ser 1')
  if (json.uso !== uso) problemas.push(`uso tiene que ser «${uso}»`)
  for (const k of ['descripcion', 'criterio', 'consulta'] as const) if (!esTexto(json[k])) problemas.push(`falta ${k}`)
  if (typeof json.extraido !== 'string' || !RE_FECHA.test(json.extraido)) problemas.push('extraido tiene que ser YYYY-MM-DD')
  if (json.cuentas_publicas !== undefined && !esListaDeTextos(json.cuentas_publicas)) problemas.push('cuentas_publicas tiene que ser una lista de textos')
  if (!Array.isArray(json.casos) || json.casos.length === 0) {
    problemas.push('casos tiene que ser una lista no vacía')
    return false
  }
  return true
}

function validarComunes(caso: Obj, i: number, tabla: string, ids: Set<string>, problemas: string[]): string {
  const id = typeof caso.id === 'string' ? caso.id : `#${i + 1}`
  if (!esTexto(caso.id)) problemas.push(`${id}: falta id`)
  else if (ids.has(caso.id)) problemas.push(`${id}: id repetido`)
  else ids.add(caso.id)
  const origen = caso.origen
  if (!esObj(origen) || origen.tabla !== tabla || typeof origen.id !== 'string' || !RE_UUID.test(origen.id)) {
    problemas.push(`${id}: origen tiene que ser { tabla: '${tabla}', id: <uuid> }`)
  }
  return id
}

function controlarDatosPersonales(json: Obj, problemas: string[]) {
  const publicas = esListaDeTextos(json.cuentas_publicas) ? json.cuentas_publicas : []
  for (const h of datosPersonalesEnFixture(json.casos, publicas)) problemas.push(`dato personal (${h.tipo}) en ${h.ruta}: ${h.valor}`)
}

function esPrecioEsperado(v: unknown): boolean {
  return v === null || v === 'gratis' || (typeof v === 'number' && Number.isInteger(v) && v > 0)
}

export function validarFixtureFlyers(json: unknown): ResultadoValidacion<CasoFlyer> {
  const problemas: string[] = []
  if (!validarCabecera(json, 'flyers', problemas)) return { problemas }
  const ids = new Set<string>()
  ;(json.casos as unknown[]).forEach((c, i) => {
    if (!esObj(c)) return void problemas.push(`#${i + 1}: no es un objeto`)
    const id = validarComunes(c, i, 'instagram_flyers', ids, problemas)
    if (!esTexto(c.cuenta)) problemas.push(`${id}: falta cuenta`)
    if (typeof c.publicado !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(c.publicado)) problemas.push(`${id}: publicado tiene que ser YYYY-MM-DDTHH:MM`)
    if (!esTextoONulo(c.caption)) problemas.push(`${id}: caption tiene que ser texto o null`)
    if (c.imagen !== 'no-descargada' && c.imagen !== 'descargada') problemas.push(`${id}: imagen tiene que ser «no-descargada» o «descargada»`)
    if (typeof c.imagen_url !== 'string' || !RE_IMAGEN.test(c.imagen_url)) problemas.push(`${id}: imagen_url tiene que ser la URL pública de storage`)
    const e = c.esperado
    if (!esObj(e)) return void problemas.push(`${id}: falta esperado`)
    if (typeof e.fecha !== 'string' || !RE_FECHA.test(e.fecha)) problemas.push(`${id}: esperado.fecha tiene que ser YYYY-MM-DD`)
    if (!(e.hora === null || (typeof e.hora === 'string' && RE_HORA.test(e.hora)))) problemas.push(`${id}: esperado.hora tiene que ser HH:MM o null`)
    if (e.hora === '00:00') problemas.push(`${id}: esperado.hora 00:00 es «sin hora» → null`)
    if (!esTexto(e.lugar)) problemas.push(`${id}: falta esperado.lugar`)
    if (!esListaDeTextos(e.lugar_alias)) problemas.push(`${id}: esperado.lugar_alias tiene que ser una lista`)
    if (!esPrecioEsperado(e.precio)) problemas.push(`${id}: esperado.precio tiene que ser un entero > 0, «gratis» o null`)
    if (!(CATEGORIAS as readonly string[]).includes(String(e.categoria))) problemas.push(`${id}: esperado.categoria no es del catálogo`)
    const p = c.ia_produccion
    if (p !== undefined) {
      if (!esObj(p) || !esTexto(p.modelo) || typeof p.procesado !== 'string' || !RE_FECHA.test(p.procesado)) {
        problemas.push(`${id}: ia_produccion necesita modelo y procesado (YYYY-MM-DD)`)
      }
    }
  })
  controlarDatosPersonales(json, problemas)
  return problemas.length ? { problemas } : { archivo: json as unknown as ArchivoFixtures<CasoFlyer>, problemas }
}

export function validarFixtureTraduccion(json: unknown): ResultadoValidacion<CasoTraduccion> {
  const problemas: string[] = []
  if (!validarCabecera(json, 'traduccion', problemas)) return { problemas }
  const ids = new Set<string>()
  ;(json.casos as unknown[]).forEach((c, i) => {
    if (!esObj(c)) return void problemas.push(`#${i + 1}: no es un objeto`)
    const id = validarComunes(c, i, 'events', ids, problemas)
    if (!esTexto(c.titulo)) problemas.push(`${id}: falta titulo`)
    if (!esTextoONulo(c.descripcion)) problemas.push(`${id}: descripcion tiene que ser texto o null`)
    if (!esTextoONulo(c.lugar)) problemas.push(`${id}: lugar tiene que ser texto o null`)
    if (!esListaDeTextos(c.artistas)) problemas.push(`${id}: artistas tiene que ser una lista`)
    if (!esListaDeTextos(c.nombres_a_conservar)) problemas.push(`${id}: nombres_a_conservar tiene que ser una lista`)
    if (c.referencia !== 'agente' && c.referencia !== 'revisada') problemas.push(`${id}: referencia tiene que ser «agente» o «revisada»`)
    const e = c.esperado
    if (!esObj(e) || !esTexto(e.title_en) || !esTextoONulo(e.description_en)) {
      return void problemas.push(`${id}: esperado tiene que ser { title_en, description_en }`)
    }
    if ((c.descripcion === null) !== (e.description_en === null)) problemas.push(`${id}: description_en es null si y solo si no hay descripción`)
  })
  controlarDatosPersonales(json, problemas)
  return problemas.length ? { problemas } : { archivo: json as unknown as ArchivoFixtures<CasoTraduccion>, problemas }
}

export function validarFixtureClasificacion(json: unknown): ResultadoValidacion<CasoClasificacion> {
  const problemas: string[] = []
  if (!validarCabecera(json, 'clasificacion', problemas)) return { problemas }
  const categorias = json.categorias
  if (!esListaDeTextos(categorias) || categorias.length === 0) problemas.push('falta categorias (la lista de slugs que se le pasa al modelo)')
  const lista = esListaDeTextos(categorias) ? categorias : []
  const ids = new Set<string>()
  ;(json.casos as unknown[]).forEach((c, i) => {
    if (!esObj(c)) return void problemas.push(`#${i + 1}: no es un objeto`)
    const id = validarComunes(c, i, 'events', ids, problemas)
    if (!esTexto(c.titulo)) problemas.push(`${id}: falta titulo`)
    if (typeof c.descripcion !== 'string') problemas.push(`${id}: descripcion tiene que ser texto`)
    if (!esObj(c.esperado) || !lista.includes(String(c.esperado.categoria))) problemas.push(`${id}: esperado.categoria no está en categorias`)
    if (!['manual', 'scraper', 'alias', 'sin-dato'].includes(String(c.fuente_categoria))) problemas.push(`${id}: fuente_categoria inválida`)
  })
  controlarDatosPersonales(json, problemas)
  return problemas.length ? { problemas } : { archivo: json as unknown as ArchivoFixtures<CasoClasificacion>, problemas }
}
