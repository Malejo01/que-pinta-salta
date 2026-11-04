/**
 * Q6-4 · El modo --real del banco: llama de verdad al proveedor elegido con
 * los mismos pedidos de la app y mide calidad, tokens y costo reales.
 *
 * Es pago. Por eso: tope de llamadas por uso y proveedor, `--confirmo-costo`
 * obligatorio (lo controla `cli.ts`, que antes muestra el costo estimado) y
 * las claves se controlan ANTES de la primera llamada (sin la clave, falla
 * claro y no llama a nadie). Cada llamada queda en `ia_llamadas` con uso
 * `prueba` (si hay NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY), para
 * que no se mezcle con el consumo de la app.
 *
 * Si un proveedor responde sin_clave / no_autorizado / sin_credito, se corta
 * ese proveedor (seguir sería gastar llamadas que van a fallar igual).
 */
import { validarTraduccion as validarTraduccionProduccion } from '@qps/core/events/traduccion'
import { extractEventFromFlyer, generarJsonDeTexto } from '../../ai/llamadas-ia'
import { crearTraductor, textoParaElModelo } from '../../ai/traducir-evento'
import { CLAUDE_MODELO_POR_DEFECTO, crearProveedorClaude, type FetchIA } from '../claude'
import { GEMINI_MODEL, crearProveedorGemini } from '../gemini'
import { conRegistro, registradorPorDefecto, type RegistradorIA, type RegistroLlamadaIA } from '../registro'
import { modeloClaude, type EntornoIA } from '../seleccion'
import { ErrorIA, type CodigoErrorIA, type NombreProveedorIA, type ProveedorIA } from '../tipos'
import {
  compararFlyer,
  obtenidoDeExtraccion,
  puntuarTraduccion,
  resumirClasificacion,
  resumirFlyers,
  resumirTraduccion,
  type ResumenClasificacion,
  type ResumenFlyers,
  type ResumenTraduccion,
} from './metricas'
import { costoUsd } from './precios'
import { argumentosClasificacion, eventoParaTraducir } from './prompts'
import type { BancoEvaluacion, PrecioModelo, UsoEvaluado } from './tipos'

export const TOPE_POR_DEFECTO = 5
export const TOPE_MAXIMO = 30
const CORTAN_PROVEEDOR: CodigoErrorIA[] = ['sin_clave', 'no_autorizado', 'sin_credito']

export const VARIABLE_CLAVE: Record<NombreProveedorIA, string> = { gemini: 'GEMINI_API_KEY', claude: 'ANTHROPIC_API_KEY' }

/** Las claves que faltan para los proveedores pedidos (vacío si están todas). */
export function clavesFaltantes(proveedores: NombreProveedorIA[], entorno: EntornoIA): string[] {
  return proveedores.filter((p) => !entorno[VARIABLE_CLAVE[p]]?.trim()).map((p) => VARIABLE_CLAVE[p])
}

/** El modelo que se va a usar con cada proveedor (el mismo que usaría la app). */
export function modeloDe(proveedor: NombreProveedorIA, entorno: EntornoIA): string {
  return proveedor === 'gemini' ? GEMINI_MODEL : modeloClaude(entorno).modelo
}

export interface OpcionesReal {
  proveedores: NombreProveedorIA[]
  usos: UsoEvaluado[]
  tope: number
}

export interface DependenciasReal {
  entorno: EntornoIA
  /** Para bajar las imágenes de storage (y para Claude). */
  fetch: FetchIA
  /** Para tests: un proveedor doble. Si no, el de `lib/ia` con la clave del entorno. */
  crearProveedor?: (nombre: NombreProveedorIA, modelo: string) => ProveedorIA
  registrar?: RegistradorIA
  log?: (linea: string) => void
}

export interface ResultadoProveedor {
  proveedor: NombreProveedorIA
  modelo: string
  llamadas: number
  fallidas: Partial<Record<CodigoErrorIA | 'imagen', number>>
  cortado?: CodigoErrorIA
  tokensEntrada: number
  tokensSalida: number
  /** null si el modelo no está en precios.md. */
  usd: number | null
  porUso: Partial<{
    flyers: ResumenFlyers
    traduccion: ResumenTraduccion
    clasificacion: ResumenClasificacion
  }>
  tokensPorUso: Partial<Record<UsoEvaluado, { llamadas: number; entradaPromedio: number; salidaPromedio: number }>>
}

export interface InformeReal {
  modo: 'real'
  tope: number
  resultados: ResultadoProveedor[]
}

export class ErrorConfiguracionEvaluacion extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorConfiguracionEvaluacion'
  }
}

function crearProveedorReal(nombre: NombreProveedorIA, modelo: string, deps: DependenciasReal): ProveedorIA {
  if (nombre === 'gemini') return crearProveedorGemini({ apiKey: deps.entorno.GEMINI_API_KEY, modelo })
  return crearProveedorClaude({ apiKey: deps.entorno.ANTHROPIC_API_KEY, modelo: modelo || CLAUDE_MODELO_POR_DEFECTO, fetch: deps.fetch })
}

function sumar(fallidas: ResultadoProveedor['fallidas'], codigo: CodigoErrorIA | 'imagen') {
  fallidas[codigo] = (fallidas[codigo] ?? 0) + 1
}

export async function ejecutarReal(banco: BancoEvaluacion, precios: PrecioModelo[], opciones: OpcionesReal, deps: DependenciasReal): Promise<InformeReal> {
  const faltan = clavesFaltantes(opciones.proveedores, deps.entorno)
  if (faltan.length > 0) {
    throw new ErrorConfiguracionEvaluacion(`faltan ${faltan.join(' y ')} (en el entorno o en apps/web/.env.local); no se hizo ninguna llamada`)
  }
  if (!Number.isInteger(opciones.tope) || opciones.tope < 1 || opciones.tope > TOPE_MAXIMO) {
    throw new ErrorConfiguracionEvaluacion(`el tope va de 1 a ${TOPE_MAXIMO}`)
  }
  const log = deps.log ?? (() => {})
  const resultados: ResultadoProveedor[] = []

  for (const nombre of opciones.proveedores) {
    const modelo = modeloDe(nombre, deps.entorno)
    const registros: Array<RegistroLlamadaIA & { usoEvaluado: UsoEvaluado }> = []
    let usoActual: UsoEvaluado = 'flyers'
    const registrarSiempre = deps.registrar ?? registradorPorDefecto(deps.entorno)
    const registrar: RegistradorIA = (r) => {
      registros.push({ ...r, usoEvaluado: usoActual })
      return registrarSiempre(r)
    }
    const base = deps.crearProveedor ? deps.crearProveedor(nombre, modelo) : crearProveedorReal(nombre, modelo, deps)
    const ia = conRegistro(base, 'prueba', registrar)
    const r: ResultadoProveedor = { proveedor: nombre, modelo, llamadas: 0, fallidas: {}, tokensEntrada: 0, tokensSalida: 0, usd: null, porUso: {}, tokensPorUso: {} }
    log(`[evaluar-ia] ${nombre} (${modelo}): empieza`)

    const fallo = (error: unknown): boolean => {
      const codigo: CodigoErrorIA = error instanceof ErrorIA ? error.codigo : 'error_proveedor'
      sumar(r.fallidas, codigo)
      if (CORTAN_PROVEEDOR.includes(codigo)) {
        r.cortado = codigo
        log(`[evaluar-ia] ${nombre}: ${codigo}, se corta este proveedor`)
        return true
      }
      return false
    }

    if (opciones.usos.includes('flyers') && !r.cortado) {
      usoActual = 'flyers'
      const comparaciones = []
      for (const caso of banco.flyers.casos.slice(0, opciones.tope)) {
        let bytes: Uint8Array
        let mime: string
        try {
          const resp = await deps.fetch(caso.imagen_url, { method: 'GET' })
          if (!resp.ok) throw new Error(String(resp.status))
          bytes = new Uint8Array(await resp.arrayBuffer())
          mime = resp.headers.get('content-type') ?? 'image/jpeg'
        } catch {
          sumar(r.fallidas, 'imagen')
          log(`[evaluar-ia] ${caso.id}: no se pudo bajar la imagen; se saltea`)
          continue
        }
        r.llamadas++
        try {
          const datos = await extractEventFromFlyer(Buffer.from(bytes), mime, caso.caption, caso.cuenta, ia)
          comparaciones.push(compararFlyer(caso.esperado, obtenidoDeExtraccion(datos as unknown as Record<string, unknown>)))
        } catch (error) {
          comparaciones.push(compararFlyer(caso.esperado, {}))
          if (fallo(error)) break
        }
      }
      r.porUso.flyers = resumirFlyers(comparaciones)
    }

    if (opciones.usos.includes('traduccion') && !r.cortado) {
      usoActual = 'traduccion'
      const traducir = crearTraductor(ia)
      const puntajes = []
      const validas: boolean[] = []
      for (const caso of banco.traduccion.casos.slice(0, opciones.tope)) {
        r.llamadas++
        const evento = eventoParaTraducir(caso)
        try {
          const respuesta = (await traducir(textoParaElModelo(evento))) as Record<string, unknown>
          puntajes.push(puntuarTraduccion(caso, respuesta))
          validas.push(validarTraduccionProduccion(evento, respuesta) !== null)
        } catch (error) {
          puntajes.push(puntuarTraduccion(caso, null))
          validas.push(false)
          if (fallo(error)) break
        }
      }
      r.porUso.traduccion = resumirTraduccion(puntajes, validas)
    }

    if (opciones.usos.includes('clasificacion') && !r.cortado) {
      usoActual = 'clasificacion'
      const slugs = banco.clasificacion.categorias ?? []
      const pares: Array<{ esperado: string; obtenido: string | null }> = []
      for (const caso of banco.clasificacion.casos.slice(0, opciones.tope)) {
        r.llamadas++
        const a = argumentosClasificacion(caso, slugs)
        try {
          const respuesta = (await generarJsonDeTexto(a.sistema, a.texto, a.esquema, { uso: 'clasificacion', ia, maxTokens: a.maxTokens })) as { slug?: unknown }
          pares.push({ esperado: caso.esperado.categoria, obtenido: typeof respuesta.slug === 'string' ? respuesta.slug : null })
        } catch (error) {
          pares.push({ esperado: caso.esperado.categoria, obtenido: null })
          // Un slug fuera de la lista (respuesta_invalida) es un error de clasificación, no del proveedor.
          if (fallo(error)) break
        }
      }
      r.porUso.clasificacion = resumirClasificacion(pares)
    }

    r.tokensEntrada = registros.reduce((s, x) => s + (x.tokensEntrada ?? 0), 0)
    r.tokensSalida = registros.reduce((s, x) => s + (x.tokensSalida ?? 0), 0)
    const precio = precios.find((p) => p.clave === modelo)
    r.usd = precio ? costoUsd(r.tokensEntrada, r.tokensSalida, precio) : null
    for (const uso of ['flyers', 'traduccion', 'clasificacion'] as const) {
      const delUso = registros.filter((x) => x.usoEvaluado === uso)
      if (delUso.length === 0) continue
      r.tokensPorUso[uso] = {
        llamadas: delUso.length,
        entradaPromedio: Math.round(delUso.reduce((s, x) => s + (x.tokensEntrada ?? 0), 0) / delUso.length),
        salidaPromedio: Math.round(delUso.reduce((s, x) => s + (x.tokensSalida ?? 0), 0) / delUso.length),
      }
    }
    log(`[evaluar-ia] ${nombre}: ${r.llamadas} llamadas`)
    resultados.push(r)
  }
  return { modo: 'real', tope: opciones.tope, resultados }
}
