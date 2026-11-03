/**
 * Q6-3 · Proveedor Gemini (el de siempre, por defecto).
 *
 * Usa el SDK oficial `@google/genai`, como antes de Q6-3, con el mismo modelo
 * (`GEMINI_MODEL`) y los mismos parámetros: el pedido que llega a Google es
 * idéntico al de antes (contents, systemInstruction, temperature,
 * responseMimeType, responseSchema). Lo nuevo es alrededor: lee el consumo de
 * tokens (`usageMetadata`), mide la latencia y normaliza los errores.
 *
 * Diferencias a propósito: no manda `maxOutputTokens` (antes tampoco; el tope
 * de la interfaz es para Claude) ni corte por tiempo salvo que se pida.
 */
import { GoogleGenAI } from '@google/genai'
import { codigoPorEstado, esCortePorTiempo, fallo } from './errores'
import { controlarRespuesta } from './esquema'
import { aBase64 } from './imagen'
import type {
  ConsumoIA,
  FalloIA,
  PeticionJson,
  PeticionJsonConImagen,
  PeticionTexto,
  ProveedorIA,
  ResultadoJson,
  ResultadoTexto,
} from './tipos'

/** Modelo de extracción. 3.5 Flash-Lite reemplaza a 2.5 Flash, que Google retira. */
export const GEMINI_MODEL = 'gemini-3.5-flash-lite'

interface RespuestaGemini {
  text?: string
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    thoughtsTokenCount?: number
  }
}

/** Lo mínimo del cliente del SDK que se usa (los tests pasan un doble). */
export interface ClienteGemini {
  models: { generateContent(params: Record<string, unknown>): Promise<RespuestaGemini> }
}

export interface OpcionesGemini {
  apiKey: string | undefined
  modelo?: string
  /** Para tests: un doble del cliente. Si no, se crea el del SDK (sin red hasta llamar). */
  cliente?: ClienteGemini
  reloj?: () => number
}

function enteroONulo(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null
}

/** Normaliza un error del SDK de Gemini (ApiError con `status`) sin copiar su mensaje. */
export function normalizarErrorGemini(error: unknown): FalloIA {
  if (esCortePorTiempo(error)) return fallo('gemini', 'timeout')
  const estado = (error as { status?: unknown } | null)?.status
  const mensaje = String((error as { message?: unknown } | null)?.message ?? '')
  if (typeof estado === 'number') {
    // Se mira el mensaje solo para clasificar; nunca se copia.
    if (estado === 400 && /API_KEY_INVALID|API key not valid/i.test(mensaje)) return fallo('gemini', 'no_autorizado', estado)
    if (estado === 429 && /prepay|credit|billing/i.test(mensaje)) return fallo('gemini', 'sin_credito', estado)
    return fallo('gemini', codigoPorEstado(estado), estado)
  }
  if (/timed? ?out|timeout/i.test(mensaje)) return fallo('gemini', 'timeout')
  if (error instanceof TypeError || /fetch failed|ECONN|ENOTFOUND|network/i.test(mensaje)) return fallo('gemini', 'red')
  return fallo('gemini', 'error_proveedor')
}

export function crearProveedorGemini(opciones: OpcionesGemini): ProveedorIA {
  const modelo = opciones.modelo ?? GEMINI_MODEL
  const reloj = opciones.reloj ?? (() => Date.now())
  let cliente: ClienteGemini | undefined = opciones.cliente
  const obtenerCliente = (): ClienteGemini => {
    cliente ??= new GoogleGenAI({ apiKey: opciones.apiKey }) as unknown as ClienteGemini
    return cliente
  }

  async function llamar(
    peticion: PeticionTexto,
    extra: { json?: PeticionJson; imagen?: PeticionJsonConImagen['imagen'] },
  ): Promise<{ respuesta?: RespuestaGemini; error?: FalloIA; uso: ConsumoIA }> {
    const inicio = reloj()
    const uso = (r?: RespuestaGemini): ConsumoIA => {
      const salida = enteroONulo(r?.usageMetadata?.candidatesTokenCount)
      const pensamiento = enteroONulo(r?.usageMetadata?.thoughtsTokenCount)
      return {
        proveedor: 'gemini',
        modelo,
        tokensEntrada: enteroONulo(r?.usageMetadata?.promptTokenCount),
        // Los tokens de razonamiento se cobran como salida.
        tokensSalida: salida === null && pensamiento === null ? null : (salida ?? 0) + (pensamiento ?? 0),
        latenciaMs: Math.max(0, Math.round(reloj() - inicio)),
      }
    }
    if (!opciones.apiKey) {
      return { error: fallo('gemini', 'sin_clave', undefined, 'GEMINI_API_KEY no está configurada'), uso: uso() }
    }
    const contents: unknown[] = []
    if (extra.imagen) {
      contents.push({
        inlineData: { data: aBase64(extra.imagen.datos), mimeType: extra.imagen.mimeType },
      })
    }
    contents.push(peticion.prompt)
    const config: Record<string, unknown> = {}
    if (peticion.sistema !== undefined) config.systemInstruction = peticion.sistema
    if (peticion.temperatura !== undefined) config.temperature = peticion.temperatura
    if (extra.json) {
      config.responseMimeType = 'application/json'
      config.responseSchema = extra.json.esquema
    }
    if (peticion.timeoutMs !== undefined) config.httpOptions = { timeout: peticion.timeoutMs }
    try {
      const respuesta = await obtenerCliente().models.generateContent({ model: modelo, contents, config })
      return { respuesta, uso: uso(respuesta) }
    } catch (error) {
      return { error: normalizarErrorGemini(error), uso: uso() }
    }
  }

  async function json<T>(peticion: PeticionJson, imagen?: PeticionJsonConImagen['imagen']): Promise<ResultadoJson<T>> {
    const r = await llamar(peticion, { json: peticion, imagen })
    if (r.error) return { ok: false, error: r.error, uso: r.uso }
    const texto = r.respuesta?.text
    if (!texto) return { ok: false, error: fallo('gemini', 'respuesta_invalida', undefined, 'vacía'), uso: r.uso }
    let datos: unknown
    try {
      datos = JSON.parse(texto)
    } catch {
      return { ok: false, error: fallo('gemini', 'respuesta_invalida', undefined, 'no es JSON'), uso: r.uso }
    }
    const control = controlarRespuesta(datos, peticion.esquema, peticion.validacion)
    if (!control.ok) return { ok: false, error: fallo('gemini', 'respuesta_invalida', undefined, control.detalle), uso: r.uso }
    return { ok: true, datos: datos as T, uso: r.uso }
  }

  return {
    nombre: 'gemini',
    modelo,
    async generarTexto(peticion): Promise<ResultadoTexto> {
      const r = await llamar(peticion, {})
      if (r.error) return { ok: false, error: r.error, uso: r.uso }
      const texto = r.respuesta?.text
      if (!texto) return { ok: false, error: fallo('gemini', 'respuesta_invalida', undefined, 'vacía'), uso: r.uso }
      return { ok: true, texto, uso: r.uso }
    },
    generarJson: <T>(peticion: PeticionJson) => json<T>(peticion),
    generarJsonDesdeImagen: <T>(peticion: PeticionJsonConImagen) => json<T>(peticion, peticion.imagen),
  }
}
