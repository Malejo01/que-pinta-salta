/**
 * Q6-3 · Capa de proveedor de IA intercambiable: los tipos.
 *
 * Toda llamada a un modelo pasa por un `ProveedorIA` (Gemini por defecto,
 * Claude listo para usar). Los métodos NUNCA tiran: devuelven el resultado con
 * `error` cuando algo falla, con un código normalizado y un mensaje seguro
 * (sin claves, sin el prompt, sin la respuesta cruda del proveedor).
 */

export type NombreProveedorIA = 'gemini' | 'claude'

/** Para qué se usa la llamada (columna `uso` de `ia_llamadas`). */
export type UsoIA = 'flyers' | 'traduccion' | 'clasificacion' | 'prueba'

/**
 * Errores normalizados. Los mismos para los dos proveedores:
 * - `sin_clave`: falta la clave del proveedor elegido (no se cae a otro).
 * - `no_autorizado`: la clave es inválida o no tiene permiso (401/403).
 * - `sin_credito`: no hay saldo o hay un problema de facturación (402).
 * - `limite`: límite de uso o de cuota (429).
 * - `timeout`: no respondió a tiempo.
 * - `respuesta_invalida`: respondió, pero vacío, sin JSON o fuera del esquema.
 * - `solicitud_invalida`: el proveedor rechazó el pedido (400/404/413) o la
 *   imagen no se puede mandar.
 * - `error_proveedor`: error del lado del proveedor (5xx, sobrecarga).
 * - `red`: no se pudo conectar.
 */
export type CodigoErrorIA =
  | 'sin_clave'
  | 'no_autorizado'
  | 'sin_credito'
  | 'limite'
  | 'timeout'
  | 'respuesta_invalida'
  | 'solicitud_invalida'
  | 'error_proveedor'
  | 'red'

export const CODIGOS_ERROR_IA: readonly CodigoErrorIA[] = [
  'sin_clave',
  'no_autorizado',
  'sin_credito',
  'limite',
  'timeout',
  'respuesta_invalida',
  'solicitud_invalida',
  'error_proveedor',
  'red',
]

export interface FalloIA {
  codigo: CodigoErrorIA
  /** Texto seguro para logs y para la base: nunca trae claves ni contenido. */
  mensaje: string
  /** Estado HTTP, si lo hubo. */
  estado?: number
}

/** Lo que costó la llamada (lo que se registra en `ia_llamadas`). */
export interface ConsumoIA {
  proveedor: NombreProveedorIA
  modelo: string
  tokensEntrada: number | null
  tokensSalida: number | null
  latenciaMs: number
}

export interface PeticionTexto {
  sistema?: string
  prompt: string
  /** Tope de tokens de salida. Claude lo exige; Gemini no lo manda (igual que antes de Q6-3). */
  maxTokens: number
  temperatura?: number
  /** Corte por tiempo. Por defecto: Claude 60 s; Gemini sin corte (igual que antes). */
  timeoutMs?: number
}

/**
 * Esquema de la respuesta JSON. Se acepta el dialecto que ya usaba Gemini
 * (`type: 'OBJECT'`, `nullable: true`) o JSON Schema común (`type: 'object'`);
 * a Gemini se le pasa tal cual y para Claude y la validación se normaliza.
 */
export type EsquemaJson = Record<string, unknown>

export interface PeticionJson extends PeticionTexto {
  esquema: EsquemaJson
  /**
   * `estricta` (por defecto): la respuesta tiene que cumplir el esquema o
   * vuelve `respuesta_invalida`. `forma`: solo se exige un objeto JSON; los
   * campos los controla quien llama (los flyers tienen controles propios por
   * campo y un rechazo entero los mandaría al camino de falla).
   */
  validacion?: 'estricta' | 'forma'
}

/** Imagen en bytes, como la baja hoy la cola de flyers. */
export interface ImagenIA {
  datos: Uint8Array
  mimeType: string
}

export interface PeticionJsonConImagen extends PeticionJson {
  imagen: ImagenIA
}

export type ResultadoTexto =
  | { ok: true; texto: string; uso: ConsumoIA; error?: undefined }
  | { ok: false; texto?: undefined; uso: ConsumoIA; error: FalloIA }

export type ResultadoJson<T = unknown> =
  | { ok: true; datos: T; uso: ConsumoIA; error?: undefined }
  | { ok: false; datos?: undefined; uso: ConsumoIA; error: FalloIA }

export interface ProveedorIA {
  readonly nombre: NombreProveedorIA
  readonly modelo: string
  generarTexto(peticion: PeticionTexto): Promise<ResultadoTexto>
  generarJson<T = unknown>(peticion: PeticionJson): Promise<ResultadoJson<T>>
  generarJsonDesdeImagen<T = unknown>(peticion: PeticionJsonConImagen): Promise<ResultadoJson<T>>
}

/**
 * El error que tiran las funciones de dominio (`lib/ai/llamadas-ia.ts`)
 * cuando el resultado vino con `error`. El mensaje es el seguro.
 */
export class ErrorIA extends Error {
  readonly codigo: CodigoErrorIA
  readonly estado?: number
  readonly proveedor: NombreProveedorIA

  constructor(proveedor: NombreProveedorIA, fallo: FalloIA) {
    super(fallo.mensaje)
    this.name = 'ErrorIA'
    this.codigo = fallo.codigo
    this.estado = fallo.estado
    this.proveedor = proveedor
  }
}
