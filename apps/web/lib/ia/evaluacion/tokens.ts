/**
 * Q6-4 · Estimación de tokens SIN llamar a nadie (aproximación por
 * caracteres; el modo --real mide los de verdad).
 *
 * Texto: cada carácter pesa 1, salvo los que están fuera del alfabeto latino
 * (U+0250 en adelante: emojis, flechas, letras «negrita» Unicode), que pesan
 * 2 (BMP) o 3 (fuera del BMP: casi todos los emojis), porque los
 * tokenizadores los parten en varios pedazos. Tokens = peso / caracteres por
 * token: Gemini 4, Claude 3,5 (su tokenizador parte más el castellano).
 *
 * Imagen: los tokens fijos por imagen de `precios.md` (Gemini) o la fórmula
 * de Claude (ancho × alto / 750 después de achicar). Ver `precios.md`.
 *
 * Extras de Claude con salida JSON: la herramienta forzada suma un prompt de
 * sistema de herramientas (~313 tokens de entrada) y el bloque `tool_use`
 * (~25 de salida). El esquema JSON se cuenta como entrada en los dos.
 */
import type { NombreProveedorIA } from '../tipos'

export const CARACTERES_POR_TOKEN: Record<NombreProveedorIA, number> = { gemini: 4, claude: 3.5 }
export const SOBRECARGA_HERRAMIENTA_CLAUDE_ENTRADA = 313
export const SOBRECARGA_HERRAMIENTA_CLAUDE_SALIDA = 25
/** Por mensaje (rol, separadores). */
export const SOBRECARGA_MENSAJE = 8
/** Medida típica de un flyer de Instagram (4:5). */
export const FLYER_ANCHO = 1080
export const FLYER_ALTO = 1350

/** El peso en «caracteres equivalentes» de un texto. */
export function pesoTexto(texto: string): number {
  let peso = 0
  for (const c of texto) {
    const cp = c.codePointAt(0) ?? 0
    peso += cp < 0x250 ? 1 : cp > 0xffff ? 3 : 2
  }
  return peso
}

export function estimarTokensTexto(texto: string, proveedor: NombreProveedorIA): number {
  if (!texto) return 0
  return Math.ceil(pesoTexto(texto) / CARACTERES_POR_TOKEN[proveedor])
}

/**
 * Claude: si el lado largo pasa de 1568 px o la imagen pasa de ~1,15 MP, se
 * achica manteniendo la proporción; después tokens = ancho × alto / 750.
 */
export function tokensImagenClaude(ancho: number, alto: number): number {
  const MAX_LADO = 1568
  const MAX_PIXELES = 1_150_000
  let escala = Math.min(1, MAX_LADO / Math.max(ancho, alto))
  if (ancho * alto * escala * escala > MAX_PIXELES) escala = Math.sqrt(MAX_PIXELES / (ancho * alto))
  const w = Math.floor(ancho * escala)
  const h = Math.floor(alto * escala)
  return Math.ceil((w * h) / 750)
}

/** Gemini 2.x (referencia): 258 tokens por mosaico de 768×768 (≤384 px en los dos lados = 1 solo). */
export function tokensImagenGemini2(ancho: number, alto: number): number {
  if (ancho <= 384 && alto <= 384) return 258
  const unidad = Math.floor(Math.min(ancho, alto) / 1.5)
  return Math.ceil(ancho / unidad) * Math.ceil(alto / unidad) * 258
}

/** Lo que el banco captura de cada pedido (ver `prompts.ts`). */
export interface PedidoCapturado {
  sistema?: string
  prompt: string
  esquema?: Record<string, unknown>
  conImagen: boolean
}

export interface EstimacionTokens {
  entrada: number
  salida: number
}

/**
 * Tokens de una llamada: sistema + prompt + esquema (+ imagen) de entrada;
 * la respuesta esperada (como JSON) de salida.
 */
export function estimarLlamada(
  pedido: PedidoCapturado,
  respuestaEsperada: unknown,
  proveedor: NombreProveedorIA,
  tokensPorImagen: number,
): EstimacionTokens {
  const textoEntrada = [pedido.sistema ?? '', pedido.prompt, pedido.esquema ? JSON.stringify(pedido.esquema) : ''].join('\n')
  let entrada = estimarTokensTexto(textoEntrada, proveedor) + SOBRECARGA_MENSAJE * (pedido.sistema ? 2 : 1)
  if (pedido.conImagen) entrada += tokensPorImagen
  let salida = estimarTokensTexto(JSON.stringify(respuestaEsperada), proveedor)
  if (proveedor === 'claude' && pedido.esquema) {
    entrada += SOBRECARGA_HERRAMIENTA_CLAUDE_ENTRADA
    salida += SOBRECARGA_HERRAMIENTA_CLAUDE_SALIDA
  }
  return { entrada, salida }
}
