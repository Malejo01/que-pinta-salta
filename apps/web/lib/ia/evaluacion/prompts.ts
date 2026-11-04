/**
 * Q6-4 · Los pedidos REALES de cada uso, armados con las mismas funciones que
 * usa la app (`lib/ai/llamadas-ia.ts`, `lib/ai/traducir-evento.ts`,
 * `lib/ai/clasificar-categoria.ts`), pero con un proveedor doble que solo
 * anota lo que se le pide y no llama a nadie (ni red, ni SDK).
 */
import { extractEventFromFlyer, generarJsonDeTexto } from '../../ai/llamadas-ia'
import { crearTraductor, textoParaElModelo } from '../../ai/traducir-evento'
import {
  INSTRUCCION_CLASIFICACION,
  MAX_TOKENS_CLASIFICACION,
  esquemaClasificacion,
  textoClasificacion,
} from '../../ai/clasificar-categoria'
import type { EventoParaTraducir } from '@qps/core/events/traduccion'
import type { ConsumoIA, NombreProveedorIA, PeticionJson, PeticionTexto, ProveedorIA } from '../tipos'
import type { PedidoCapturado } from './tokens'
import type { CasoClasificacion, CasoFlyer, CasoTraduccion } from './tipos'

/** Lo que `revision.ts` le pasa al clasificador: la descripción recortada a 1500. */
export const LARGO_DESCRIPCION_CLASIFICACION = 1500
/** Supuesto para la salida: la transcripción del flyer (`flyer_text`) ronda los 350 caracteres. */
export const CARACTERES_FLYER_TEXT_ESTIMADOS = 350
/** Supuesto para la salida: el título que arma el modelo ronda los 45 caracteres. */
export const CARACTERES_TITULO_ESTIMADOS = 45

export interface PedidoCompleto extends PedidoCapturado {
  maxTokens: number
  temperatura?: number
}

/** Un proveedor que anota cada pedido y responde vacío. Nunca toca la red. */
export function crearCapturador(nombre: NombreProveedorIA = 'gemini'): { proveedor: ProveedorIA; pedidos: PedidoCompleto[] } {
  const pedidos: PedidoCompleto[] = []
  const uso: ConsumoIA = { proveedor: nombre, modelo: 'en-seco', tokensEntrada: null, tokensSalida: null, latenciaMs: 0 }
  const anotar = (p: PeticionTexto & Partial<Pick<PeticionJson, 'esquema'>>, conImagen: boolean) =>
    pedidos.push({ sistema: p.sistema, prompt: p.prompt, esquema: p.esquema, conImagen, maxTokens: p.maxTokens, temperatura: p.temperatura })
  const proveedor: ProveedorIA = {
    nombre,
    modelo: 'en-seco',
    async generarTexto(p) {
      anotar(p, false)
      return { ok: true, texto: '', uso }
    },
    async generarJson<T>(p: PeticionJson) {
      anotar(p, false)
      return { ok: true as const, datos: {} as T, uso }
    },
    async generarJsonDesdeImagen<T>(p: PeticionJson) {
      anotar(p, true)
      return { ok: true as const, datos: {} as T, uso }
    },
  }
  return { proveedor, pedidos }
}

function unico(pedidos: PedidoCompleto[]): PedidoCompleto {
  if (pedidos.length !== 1) throw new Error(`se esperaba un pedido y hubo ${pedidos.length}`)
  return pedidos[0]
}

export async function pedidoFlyer(caso: CasoFlyer): Promise<PedidoCompleto> {
  const { proveedor, pedidos } = crearCapturador()
  await extractEventFromFlyer(Buffer.alloc(0), 'image/jpeg', caso.caption, caso.cuenta, proveedor)
  return unico(pedidos)
}

export function eventoParaTraducir(caso: CasoTraduccion): EventoParaTraducir {
  return { id: caso.id, title: caso.titulo, description: caso.descripcion, venueName: caso.lugar, artists: caso.artistas }
}

export async function pedidoTraduccion(caso: CasoTraduccion): Promise<PedidoCompleto> {
  const { proveedor, pedidos } = crearCapturador()
  await crearTraductor(proveedor)(textoParaElModelo(eventoParaTraducir(caso)))
  return unico(pedidos)
}

export function argumentosClasificacion(caso: CasoClasificacion, slugs: string[]) {
  return {
    sistema: INSTRUCCION_CLASIFICACION,
    texto: textoClasificacion(caso.titulo, caso.descripcion.slice(0, LARGO_DESCRIPCION_CLASIFICACION)),
    esquema: esquemaClasificacion(slugs),
    maxTokens: MAX_TOKENS_CLASIFICACION,
  }
}

export async function pedidoClasificacion(caso: CasoClasificacion, slugs: string[]): Promise<PedidoCompleto> {
  const { proveedor, pedidos } = crearCapturador()
  const a = argumentosClasificacion(caso, slugs)
  await generarJsonDeTexto(a.sistema, a.texto, a.esquema, { uso: 'clasificacion', ia: proveedor, maxTokens: a.maxTokens })
  return unico(pedidos)
}

/** La respuesta que se espera del modelo, para estimar los tokens de salida. */
export function respuestaEsperadaFlyer(caso: CasoFlyer): Record<string, unknown> {
  const e = caso.esperado
  return {
    title: 'x'.repeat(CARACTERES_TITULO_ESTIMADOS),
    date: e.fecha,
    start_time: e.hora,
    flyer_text: 'x'.repeat(CARACTERES_FLYER_TEXT_ESTIMADOS),
    price: e.precio === 'gratis' ? 0 : e.precio,
    venue_name: e.lugar,
    category_slug: e.categoria,
    artists: [],
  }
}

export function respuestaEsperadaTraduccion(caso: CasoTraduccion): Record<string, unknown> {
  return { ...caso.esperado }
}

export function respuestaEsperadaClasificacion(caso: CasoClasificacion): Record<string, unknown> {
  return { slug: caso.esperado.categoria }
}
