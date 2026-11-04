/**
 * Q6-3 · Proveedor Claude (listo, apagado por defecto).
 *
 * `fetch` directo a la Messages API, sin SDK nuevo:
 *   POST https://api.anthropic.com/v1/messages
 *   x-api-key, anthropic-version: 2023-06-01, content-type: application/json
 *
 * - Texto: `system` + un mensaje `user`.
 * - JSON con esquema: una herramienta `responder` con el esquema como
 *   `input_schema`; con los modelos 4.x se fuerza con `tool_choice`, con los
 *   más nuevos (que no aceptan forzarla) va `auto` más una instrucción. En los
 *   dos casos la respuesta se valida contra el esquema.
 * - Visión: un bloque `image` base64 antes del texto.
 * - Consumo: `usage.input_tokens` / `usage.output_tokens`.
 * - Sin reintentos: cada llamada es paga y la cola ya reintenta en su corrida.
 */
import { codigoPorEstado, esCortePorTiempo, fallo } from './errores'
import { aBase64 } from './imagen'
import { controlarRespuesta, normalizarEsquema, raizEsObjeto } from './esquema'
import type {
  ConsumoIA,
  FalloIA,
  ImagenIA,
  PeticionJson,
  PeticionTexto,
  ProveedorIA,
  ResultadoJson,
  ResultadoTexto,
} from './tipos'

export const CLAUDE_URL = 'https://api.anthropic.com/v1/messages'
export const CLAUDE_VERSION_API = '2023-06-01'
export const CLAUDE_MODELO_POR_DEFECTO = 'claude-haiku-4-5'
export const CLAUDE_TIMEOUT_MS = 60_000
export const HERRAMIENTA_JSON = 'responder'
/** Tope de la API para una imagen. */
export const CLAUDE_MAX_BYTES_IMAGEN = 5 * 1024 * 1024
const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const

export type FetchIA = (url: string, init: RequestInit) => Promise<Response>

export interface OpcionesClaude {
  apiKey: string | undefined
  modelo?: string
  /** Para tests: un doble de fetch. */
  fetch?: FetchIA
  reloj?: () => number
}

/**
 * Qué acepta cada generación. Los 4.x (Haiku 4.5, el default) corren sin
 * razonamiento extendido si no se pide, así que aceptan `tool_choice` forzado;
 * los más nuevos lo rechazan con 400. `temperature` la aceptan hasta los 4.6.
 */
export function perfilModeloClaude(modelo: string): { herramientaForzada: boolean; temperatura: boolean } {
  const generacion4 = /^claude-(haiku|sonnet|opus)-4-\d/.test(modelo) || /^claude-3/.test(modelo)
  const conTemperatura = /^claude-(haiku|sonnet|opus)-4-[0-6](?!\d)/.test(modelo) || /^claude-3/.test(modelo)
  return { herramientaForzada: generacion4, temperatura: conTemperatura }
}

/** Tipo de imagen para Claude: el declarado si sirve, si no por los bytes del archivo. */
export function tipoImagenClaude(imagen: ImagenIA): (typeof TIPOS_IMAGEN)[number] | null {
  const declarado = imagen.mimeType.split(';')[0].trim().toLowerCase().replace('image/jpg', 'image/jpeg')
  if ((TIPOS_IMAGEN as readonly string[]).includes(declarado)) return declarado as (typeof TIPOS_IMAGEN)[number]
  const b = imagen.datos
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b.length >= 3 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif'
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return 'image/webp'
  }
  return null
}

interface CuerpoClaude {
  content?: Array<{ type?: string; text?: string; name?: string; input?: unknown }>
  stop_reason?: string
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
  error?: { type?: string; message?: string }
}

function entero(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0
}

/** Error HTTP de Claude → código normalizado. El mensaje se mira solo para clasificar. */
export function normalizarErrorClaude(estado: number, cuerpo: CuerpoClaude | null): FalloIA {
  const tipo = cuerpo?.error?.type
  const mensaje = String(cuerpo?.error?.message ?? '')
  if (tipo === 'billing_error' || (estado === 400 && /credit balance/i.test(mensaje))) return fallo('claude', 'sin_credito', estado)
  if (tipo === 'authentication_error' || tipo === 'permission_error') return fallo('claude', 'no_autorizado', estado)
  if (tipo === 'rate_limit_error') return fallo('claude', 'limite', estado)
  if (tipo === 'overloaded_error' || tipo === 'api_error') return fallo('claude', 'error_proveedor', estado)
  return fallo('claude', codigoPorEstado(estado), estado)
}

export function crearProveedorClaude(opciones: OpcionesClaude): ProveedorIA {
  const modelo = opciones.modelo ?? CLAUDE_MODELO_POR_DEFECTO
  const reloj = opciones.reloj ?? (() => Date.now())
  const hacerFetch: FetchIA = opciones.fetch ?? ((url, init) => fetch(url, init))
  const perfil = perfilModeloClaude(modelo)

  async function llamar(
    peticion: PeticionTexto,
    extra: { json?: PeticionJson; imagen?: ImagenIA },
  ): Promise<{ cuerpo?: CuerpoClaude; error?: FalloIA; uso: ConsumoIA }> {
    const inicio = reloj()
    const uso = (c?: CuerpoClaude): ConsumoIA => ({
      proveedor: 'claude',
      modelo,
      tokensEntrada: c?.usage
        ? entero(c.usage.input_tokens) + entero(c.usage.cache_creation_input_tokens) + entero(c.usage.cache_read_input_tokens)
        : null,
      tokensSalida: c?.usage ? entero(c.usage.output_tokens) : null,
      latenciaMs: Math.max(0, Math.round(reloj() - inicio)),
    })
    if (!opciones.apiKey) {
      return { error: fallo('claude', 'sin_clave', undefined, 'IA_PROVEEDOR=claude pero falta ANTHROPIC_API_KEY'), uso: uso() }
    }

    let contenido: unknown = peticion.prompt
    if (extra.imagen) {
      const tipo = tipoImagenClaude(extra.imagen)
      if (!tipo) return { error: fallo('claude', 'solicitud_invalida', undefined, 'tipo de imagen no soportado'), uso: uso() }
      if (extra.imagen.datos.byteLength > CLAUDE_MAX_BYTES_IMAGEN) {
        return { error: fallo('claude', 'solicitud_invalida', undefined, 'imagen de más de 5 MB'), uso: uso() }
      }
      contenido = [
        { type: 'image', source: { type: 'base64', media_type: tipo, data: aBase64(extra.imagen.datos) } },
        { type: 'text', text: peticion.prompt },
      ]
    }

    let sistema = peticion.sistema
    const cuerpo: Record<string, unknown> = {
      model: modelo,
      max_tokens: peticion.maxTokens,
      messages: [{ role: 'user', content: contenido }],
    }
    if (perfil.temperatura && peticion.temperatura !== undefined) cuerpo.temperature = peticion.temperatura
    if (extra.json) {
      if (!raizEsObjeto(extra.json.esquema)) {
        return { error: fallo('claude', 'solicitud_invalida', undefined, 'el esquema tiene que ser un objeto'), uso: uso() }
      }
      cuerpo.tools = [
        {
          name: HERRAMIENTA_JSON,
          description: 'Delivers the answer in the required format. Always answer by calling this tool.',
          input_schema: normalizarEsquema(extra.json.esquema),
        },
      ]
      if (perfil.herramientaForzada) {
        cuerpo.tool_choice = { type: 'tool', name: HERRAMIENTA_JSON }
      } else {
        cuerpo.tool_choice = { type: 'auto' }
        const instruccion = `Answer only by calling the \`${HERRAMIENTA_JSON}\` tool.`
        sistema = sistema ? `${sistema}\n\n${instruccion}` : instruccion
      }
    }
    if (sistema !== undefined) cuerpo.system = sistema

    let respuesta: Response
    try {
      respuesta = await hacerFetch(CLAUDE_URL, {
        method: 'POST',
        headers: {
          'x-api-key': opciones.apiKey,
          'anthropic-version': CLAUDE_VERSION_API,
          'content-type': 'application/json',
        },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(peticion.timeoutMs ?? CLAUDE_TIMEOUT_MS),
      })
    } catch (error) {
      return { error: esCortePorTiempo(error) ? fallo('claude', 'timeout') : fallo('claude', 'red'), uso: uso() }
    }

    let leido: CuerpoClaude | null = null
    try {
      leido = (await respuesta.json()) as CuerpoClaude
    } catch (error) {
      if (esCortePorTiempo(error)) return { error: fallo('claude', 'timeout'), uso: uso() }
      leido = null
    }
    if (!respuesta.ok) return { error: normalizarErrorClaude(respuesta.status, leido), uso: uso() }
    if (!leido || typeof leido !== 'object') {
      return { error: fallo('claude', 'respuesta_invalida', respuesta.status, 'no es JSON'), uso: uso() }
    }
    if (leido.stop_reason === 'refusal') {
      return { error: fallo('claude', 'respuesta_invalida', undefined, 'el modelo se negó'), uso: uso(leido) }
    }
    if (leido.stop_reason === 'max_tokens') {
      return { error: fallo('claude', 'respuesta_invalida', undefined, 'cortada por maxTokens'), uso: uso(leido) }
    }
    return { cuerpo: leido, uso: uso(leido) }
  }

  async function json<T>(peticion: PeticionJson, imagen?: ImagenIA): Promise<ResultadoJson<T>> {
    const r = await llamar(peticion, { json: peticion, imagen })
    if (r.error) return { ok: false, error: r.error, uso: r.uso }
    const bloque = (r.cuerpo?.content ?? []).find((b) => b?.type === 'tool_use' && b.name === HERRAMIENTA_JSON)
    if (!bloque) return { ok: false, error: fallo('claude', 'respuesta_invalida', undefined, 'no usó la herramienta'), uso: r.uso }
    const control = controlarRespuesta(bloque.input, peticion.esquema, peticion.validacion)
    if (!control.ok) return { ok: false, error: fallo('claude', 'respuesta_invalida', undefined, control.detalle), uso: r.uso }
    return { ok: true, datos: bloque.input as T, uso: r.uso }
  }

  return {
    nombre: 'claude',
    modelo,
    async generarTexto(peticion): Promise<ResultadoTexto> {
      const r = await llamar(peticion, {})
      if (r.error) return { ok: false, error: r.error, uso: r.uso }
      const texto = (r.cuerpo?.content ?? [])
        .filter((b) => b?.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('')
      if (!texto) return { ok: false, error: fallo('claude', 'respuesta_invalida', undefined, 'vacía'), uso: r.uso }
      return { ok: true, texto, uso: r.uso }
    },
    generarJson: <T>(peticion: PeticionJson) => json<T>(peticion),
    generarJsonDesdeImagen: <T>(peticion: PeticionJson & { imagen: ImagenIA }) => json<T>(peticion, peticion.imagen),
  }
}
