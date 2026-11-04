/**
 * Q6-4 · Métricas del banco de evaluación (puras).
 *
 * Flyers: por campo (fecha, hora, lugar, precio; categoría aparte) se
 * normaliza lo esperado y lo obtenido y se cuenta acierto/error. «Total» es
 * el % de aciertos sobre los cuatro campos principales de todos los casos.
 *
 * Traducción: rúbrica de 0 a 4, un punto por criterio (detalle en
 * `puntuarTraduccion`).
 *
 * Clasificación: slug correcto y matriz de confusión resumida.
 */
import { UMBRAL_LUGAR, normalizarFecha, normalizarHora, normalizarPrecio, similitudLugar } from './normalizar'
import type { CasoTraduccion, EsperadoFlyer, PrecioNormalizado } from './tipos'

// ---------------------------------------------------------------------------
// Flyers
// ---------------------------------------------------------------------------

export const CAMPOS_FLYER = ['fecha', 'hora', 'lugar', 'precio'] as const
export type CampoFlyer = (typeof CAMPOS_FLYER)[number]

/** Lo que devolvió el modelo (o la IA de producción), sin normalizar. */
export interface ObtenidoFlyer {
  fecha?: unknown
  hora?: unknown
  lugar?: unknown
  precio?: unknown
  categoria?: unknown
}

export interface ComparacionFlyer {
  aciertos: Record<CampoFlyer | 'categoria', boolean>
  similitudLugar: number
  normalizado: { fecha: string | null; hora: string | null; precio: PrecioNormalizado; categoria: string | null }
}

function mismoPrecio(a: PrecioNormalizado, b: PrecioNormalizado): boolean {
  if (a === null || b === null || a === 'gratis' || b === 'gratis') return a === b
  return a === b
}

/** Pasa la salida cruda de `extractEventFromFlyer` al formato comparable. */
export function obtenidoDeExtraccion(r: Record<string, unknown> | null | undefined): ObtenidoFlyer {
  if (!r) return {}
  return { fecha: r.date, hora: r.start_time, lugar: r.venue_name, precio: r.price, categoria: r.category_slug }
}

export function compararFlyer(esperado: EsperadoFlyer, obtenido: ObtenidoFlyer): ComparacionFlyer {
  const fecha = normalizarFecha(obtenido.fecha)
  const hora = normalizarHora(obtenido.hora)
  const precio = normalizarPrecio(obtenido.precio)
  const categoria = typeof obtenido.categoria === 'string' && obtenido.categoria.trim() ? obtenido.categoria.trim() : null
  const sim = similitudLugar(obtenido.lugar, [esperado.lugar, ...esperado.lugar_alias])
  return {
    aciertos: {
      fecha: fecha === normalizarFecha(esperado.fecha),
      hora: hora === (esperado.hora === null ? null : normalizarHora(esperado.hora)),
      lugar: sim >= UMBRAL_LUGAR,
      precio: mismoPrecio(precio, esperado.precio),
      categoria: categoria === esperado.categoria,
    },
    similitudLugar: Math.round(sim * 100) / 100,
    normalizado: { fecha, hora, precio, categoria },
  }
}

export interface Porcentaje {
  correctos: number
  total: number
  /** 0..100 con un decimal; null si no hubo casos. */
  pct: number | null
}

export function porcentaje(correctos: number, total: number): Porcentaje {
  return { correctos, total, pct: total === 0 ? null : Math.round((correctos / total) * 1000) / 10 }
}

export interface ResumenFlyers {
  casos: number
  porCampo: Record<CampoFlyer | 'categoria', Porcentaje>
  /** Los cuatro campos principales juntos. */
  total: Porcentaje
  /** Casos con los cuatro campos bien. */
  casosPerfectos: Porcentaje
}

export function resumirFlyers(comparaciones: ComparacionFlyer[]): ResumenFlyers {
  const contar = (c: CampoFlyer | 'categoria') => comparaciones.filter((x) => x.aciertos[c]).length
  const porCampo = Object.fromEntries(
    [...CAMPOS_FLYER, 'categoria' as const].map((c) => [c, porcentaje(contar(c), comparaciones.length)]),
  ) as ResumenFlyers['porCampo']
  const aciertosPrincipales = CAMPOS_FLYER.reduce((s, c) => s + contar(c), 0)
  const perfectos = comparaciones.filter((x) => CAMPOS_FLYER.every((c) => x.aciertos[c])).length
  return {
    casos: comparaciones.length,
    porCampo,
    total: porcentaje(aciertosPrincipales, comparaciones.length * CAMPOS_FLYER.length),
    casosPerfectos: porcentaje(perfectos, comparaciones.length),
  }
}

// ---------------------------------------------------------------------------
// Traducción
// ---------------------------------------------------------------------------

/** NFKC (las letras «negrita» Unicode pasan a ASCII) y minúsculas sin tildes. */
function plano(texto: string): string {
  return texto.normalize('NFKC').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/**
 * Palabras que delatan castellano sin traducir. Solo palabras que no existen
 * en inglés (nada de «a», «me», «no», «sin»…). Se ignoran los nombres que hay
 * que conservar, los #hashtags y las @menciones.
 */
const MARCAS_CASTELLANO = new Set(
  (
    'de del la las el los y en para por que una un al su sus es más muy nuestra nuestro nuestros nuestras ' +
    'noche entrada entradas evento eventos gratis hoy mañana lunes martes miércoles jueves viernes sábado domingo ' +
    'este esta estos estas todos todas también desde hasta vení te tu tus esperamos reserva reservas mesa ' +
    'importado automáticamente con cada como pero porque donde cuando'
  )
    .split(' ')
    .map((p) => plano(p)),
)

export const LARGO_MIN = 0.6
export const LARGO_MAX = 1.6
/** Proporción máxima de palabras castellanas en la salida. */
export const UMBRAL_CASTELLANO = 0.05

/** Números del texto (fechas, horas, precios), sin separadores de miles: «$28.000» → «28000», «21:00» → «21:00». */
export function numerosDe(texto: string): string[] {
  const t = texto.normalize('NFKC')
  return [...t.matchAll(/\d+(?:[.,:/]\d+)*/g)].map((m) => m[0].replace(/(\d)[.,](?=\d{3}(?!\d))/g, '$1'))
}

function urlsDe(texto: string): string[] {
  return [...texto.normalize('NFKC').matchAll(/(?:https?:\/\/|www\.)[^\s)]+/gi)].map((m) => m[0].toLowerCase())
}

function palabras(texto: string): string[] {
  return plano(texto)
    .split(/\s+/)
    .filter((p) => !p.startsWith('#') && !p.startsWith('@'))
    .map((p) => p.replace(/[^a-zñ]/g, ''))
    .filter(Boolean)
}

export interface PuntajeTraduccion {
  /** 0..4. */
  puntos: number
  criterios: {
    /** Los nombres a conservar y todos los números del original siguen en la salida. */
    conserva: boolean
    /** Menos del 5 % de las palabras son castellano (sin contar nombres). */
    sinCastellano: boolean
    /** Largo total entre 0,6 y 1,6 veces la referencia (0,5–2 si la referencia es corta). */
    largo: boolean
    /** No aparecen números ni URLs que no estaban, y sin descripción → description_en null. */
    sinAgregados: boolean
  }
  detalle: { faltan: string[]; castellano: number; proporcionLargo: number | null; agregados: string[] }
}

export interface SalidaTraduccion {
  title_en?: unknown
  description_en?: unknown
}

export function puntuarTraduccion(caso: CasoTraduccion, salida: SalidaTraduccion | null | undefined): PuntajeTraduccion {
  const titulo = typeof salida?.title_en === 'string' ? salida.title_en : ''
  const descripcion = typeof salida?.description_en === 'string' ? salida.description_en : null
  const texto = `${titulo}\n${descripcion ?? ''}`
  const original = `${caso.titulo}\n${caso.descripcion ?? ''}`
  const textoPlano = plano(texto)

  // 1. Conserva nombres propios y números.
  const nombres = [...new Set([...caso.nombres_a_conservar, ...caso.artistas, ...(caso.lugar ? [caso.lugar] : [])])]
  const nombresQueAparecen = nombres.filter((n) => plano(original).includes(plano(n)))
  const faltanNombres = nombresQueAparecen.filter((n) => !textoPlano.includes(plano(n)))
  const numerosSalida = new Set(numerosDe(texto))
  const faltanNumeros = [...new Set(numerosDe(original))].filter((n) => !numerosSalida.has(n))
  const faltan = [...faltanNombres, ...faltanNumeros]

  // 2. Sin castellano residual (se sacan las palabras de los nombres a conservar).
  const palabrasDeNombres = new Set(nombres.flatMap((n) => palabras(n)))
  const ps = palabras(texto).filter((p) => !palabrasDeNombres.has(p))
  const enCastellano = ps.filter((p) => MARCAS_CASTELLANO.has(p)).length
  const proporcionCastellano = ps.length === 0 ? 0 : enCastellano / ps.length

  // 3. Largo razonable contra la referencia.
  const largoRef = caso.esperado.title_en.length + (caso.esperado.description_en ?? '').length
  const largoSalida = titulo.length + (descripcion ?? '').length
  const proporcionLargo = largoRef === 0 ? null : Math.round((largoSalida / largoRef) * 100) / 100
  const [min, max] = largoRef < 60 ? [0.5, 2] : [LARGO_MIN, LARGO_MAX]
  const largo = titulo.length > 0 && proporcionLargo !== null && proporcionLargo >= min && proporcionLargo <= max

  // 4. Sin agregar información.
  const numerosOriginal = new Set(numerosDe(original))
  const urlsOriginal = new Set(urlsDe(original))
  const agregados = [
    ...[...numerosSalida].filter((n) => !numerosOriginal.has(n)),
    ...urlsDe(texto).filter((u) => !urlsOriginal.has(u)),
  ]
  const descripcionInventada = (caso.descripcion === null || !caso.descripcion.trim()) && descripcion !== null && descripcion.trim() !== ''
  if (descripcionInventada) agregados.push('description_en sin descripción original')

  const criterios = {
    conserva: titulo.length > 0 && faltan.length === 0,
    sinCastellano: titulo.length > 0 && proporcionCastellano <= UMBRAL_CASTELLANO,
    largo,
    sinAgregados: titulo.length > 0 && agregados.length === 0,
  }
  return {
    puntos: Object.values(criterios).filter(Boolean).length,
    criterios,
    detalle: { faltan, castellano: Math.round(proporcionCastellano * 1000) / 1000, proporcionLargo, agregados },
  }
}

export interface ResumenTraduccion {
  casos: number
  /** Promedio de la rúbrica (0..4). */
  promedio: number | null
  /** Casos con 4/4. */
  completos: Porcentaje
  porCriterio: Record<keyof PuntajeTraduccion['criterios'], Porcentaje>
  /** Casos que pasan `validarTraduccion` de producción (solo en --real). */
  validasProduccion?: Porcentaje
}

export function resumirTraduccion(puntajes: PuntajeTraduccion[], validas?: boolean[]): ResumenTraduccion {
  const n = puntajes.length
  const criterios = ['conserva', 'sinCastellano', 'largo', 'sinAgregados'] as const
  return {
    casos: n,
    promedio: n === 0 ? null : Math.round((puntajes.reduce((s, p) => s + p.puntos, 0) / n) * 100) / 100,
    completos: porcentaje(puntajes.filter((p) => p.puntos === 4).length, n),
    porCriterio: Object.fromEntries(
      criterios.map((c) => [c, porcentaje(puntajes.filter((p) => p.criterios[c]).length, n)]),
    ) as ResumenTraduccion['porCriterio'],
    ...(validas ? { validasProduccion: porcentaje(validas.filter(Boolean).length, validas.length) } : {}),
  }
}

// ---------------------------------------------------------------------------
// Clasificación
// ---------------------------------------------------------------------------

export const SIN_RESPUESTA = '(sin respuesta)'

export interface ResumenClasificacion {
  casos: number
  correctas: Porcentaje
  /** esperado → obtenido → cantidad (solo las celdas con algo). */
  matriz: Record<string, Record<string, number>>
  /** Los errores más frecuentes, de mayor a menor. */
  confusiones: Array<{ esperado: string; obtenido: string; casos: number }>
  /** Acierto por categoría esperada. */
  porCategoria: Record<string, Porcentaje>
}

export function resumirClasificacion(pares: Array<{ esperado: string; obtenido: string | null }>): ResumenClasificacion {
  const matriz: Record<string, Record<string, number>> = {}
  for (const { esperado, obtenido } of pares) {
    const o = obtenido ?? SIN_RESPUESTA
    matriz[esperado] ??= {}
    matriz[esperado][o] = (matriz[esperado][o] ?? 0) + 1
  }
  const confusiones = Object.entries(matriz)
    .flatMap(([esperado, fila]) =>
      Object.entries(fila)
        .filter(([obtenido]) => obtenido !== esperado)
        .map(([obtenido, casos]) => ({ esperado, obtenido, casos })),
    )
    .sort((a, b) => b.casos - a.casos || a.esperado.localeCompare(b.esperado))
  const porCategoria = Object.fromEntries(
    Object.entries(matriz).map(([esperado, fila]) => {
      const total = Object.values(fila).reduce((s, n) => s + n, 0)
      return [esperado, porcentaje(fila[esperado] ?? 0, total)]
    }),
  )
  return {
    casos: pares.length,
    correctas: porcentaje(pares.filter((p) => p.obtenido === p.esperado).length, pares.length),
    matriz,
    confusiones,
    porCategoria,
  }
}
