/**
 * Q6-4 · El modo EN SECO del banco: con los fixtures ya validados arma los
 * pedidos reales de cada uso (sin llamar a nadie), estima tokens y costo por
 * modelo de `precios.md`, proyecta el costo mensual con `volumenes.json` y
 * calcula dos controles sin gasto:
 *
 * - Línea de base: lo que la IA de producción extrajo en su momento de cada
 *   flyer (`ia_produccion`) contra lo que quedó publicado.
 * - Autocontrol: las métricas aplicadas a lo esperado contra sí mismo (tiene
 *   que dar 100 % / 4 de 4; si no, el fixture o la métrica están mal).
 */
import { validarTraduccion as validarTraduccionProduccion } from '@qps/core/events/traduccion'
import { compararFlyer, puntuarTraduccion, resumirClasificacion, resumirFlyers, resumirTraduccion } from './metricas'
import type { ResumenClasificacion, ResumenFlyers, ResumenTraduccion } from './metricas'
import { costoUsd } from './precios'
import {
  eventoParaTraducir,
  pedidoClasificacion,
  pedidoFlyer,
  pedidoTraduccion,
  respuestaEsperadaClasificacion,
  respuestaEsperadaFlyer,
  respuestaEsperadaTraduccion,
  type PedidoCompleto,
} from './prompts'
import { estimarLlamada, pesoTexto } from './tokens'
import type { BancoEvaluacion, PrecioModelo, UsoEvaluado, Volumenes } from './tipos'
import { USOS_EVALUADOS } from './tipos'

export interface EntradaEvaluacion {
  banco: BancoEvaluacion
  precios: PrecioModelo[]
  volumenes: Volumenes
}

export interface FilaCosto {
  uso: UsoEvaluado
  modelo: string
  proveedor: PrecioModelo['proveedor']
  estadoPrecio: PrecioModelo['estado']
  casos: number
  tokensEntradaPromedio: number
  tokensSalidaPromedio: number
  usdPorLlamada: number
  usdPor1000: number
  llamadasPorMes: number
  usdPorMes: number
}

export interface ResumenPedidos {
  casos: number
  conImagen: number
  caracteresPromedio: number
  maxTokens: number
}

export interface InformeSeco {
  modo: 'seco'
  fixtures: Record<UsoEvaluado, { casos: number; extraido: string }>
  pedidos: Record<UsoEvaluado, ResumenPedidos>
  costos: FilaCosto[]
  /** USD por mes de los tres usos juntos, por modelo. */
  totalMensual: Array<{ modelo: string; estadoPrecio: PrecioModelo['estado']; usdPorMes: number }>
  volumenes: Volumenes
  lineaBase: { flyers: Array<{ modelo: string; resumen: ResumenFlyers }> }
  autocontrol: { flyers: ResumenFlyers; traduccion: ResumenTraduccion; clasificacion: ResumenClasificacion }
}

function promedio(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length
}

export function resumirPedidos(pedidos: PedidoCompleto[]): ResumenPedidos {
  return {
    casos: pedidos.length,
    conImagen: pedidos.filter((p) => p.conImagen).length,
    caracteresPromedio: Math.round(promedio(pedidos.map((p) => pesoTexto(`${p.sistema ?? ''}${p.prompt}`)))),
    maxTokens: Math.max(0, ...pedidos.map((p) => p.maxTokens)),
  }
}

/** Arma todos los pedidos de un uso con su respuesta esperada. */
export async function pedidosDe(banco: BancoEvaluacion, uso: UsoEvaluado): Promise<Array<{ pedido: PedidoCompleto; respuesta: unknown }>> {
  if (uso === 'flyers') {
    return Promise.all(banco.flyers.casos.map(async (c) => ({ pedido: await pedidoFlyer(c), respuesta: respuestaEsperadaFlyer(c) })))
  }
  if (uso === 'traduccion') {
    return Promise.all(banco.traduccion.casos.map(async (c) => ({ pedido: await pedidoTraduccion(c), respuesta: respuestaEsperadaTraduccion(c) })))
  }
  const slugs = banco.clasificacion.categorias ?? []
  return Promise.all(
    banco.clasificacion.casos.map(async (c) => ({ pedido: await pedidoClasificacion(c, slugs), respuesta: respuestaEsperadaClasificacion(c) })),
  )
}

export function filaDeCosto(
  uso: UsoEvaluado,
  precio: PrecioModelo,
  pedidos: Array<{ pedido: PedidoCompleto; respuesta: unknown }>,
  llamadasPorMes: number,
): FilaCosto {
  const estimaciones = pedidos.map(({ pedido, respuesta }) => estimarLlamada(pedido, respuesta, precio.proveedor, precio.tokensPorImagen))
  const entrada = promedio(estimaciones.map((e) => e.entrada))
  const salida = promedio(estimaciones.map((e) => e.salida))
  const usd = costoUsd(entrada, salida, precio)
  return {
    uso,
    modelo: precio.clave,
    proveedor: precio.proveedor,
    estadoPrecio: precio.estado,
    casos: pedidos.length,
    tokensEntradaPromedio: Math.round(entrada),
    tokensSalidaPromedio: Math.round(salida),
    usdPorLlamada: usd,
    usdPor1000: usd * 1000,
    llamadasPorMes,
    usdPorMes: usd * llamadasPorMes,
  }
}

export async function evaluarEnSeco({ banco, precios, volumenes }: EntradaEvaluacion): Promise<InformeSeco> {
  const pedidos = {} as Record<UsoEvaluado, Array<{ pedido: PedidoCompleto; respuesta: unknown }>>
  for (const uso of USOS_EVALUADOS) pedidos[uso] = await pedidosDe(banco, uso)

  const costos = USOS_EVALUADOS.flatMap((uso) => precios.map((p) => filaDeCosto(uso, p, pedidos[uso], volumenes.porMes[uso])))
  const totalMensual = precios.map((p) => ({
    modelo: p.clave,
    estadoPrecio: p.estado,
    usdPorMes: costos.filter((c) => c.modelo === p.clave).reduce((s, c) => s + c.usdPorMes, 0),
  }))

  // Línea de base de producción, por modelo que la extrajo.
  const conBase = banco.flyers.casos.filter((c) => c.ia_produccion)
  const modelos = [...new Set(conBase.map((c) => c.ia_produccion!.modelo))].sort()
  const lineaBase = modelos.map((modelo) => ({
    modelo,
    resumen: resumirFlyers(conBase.filter((c) => c.ia_produccion!.modelo === modelo).map((c) => compararFlyer(c.esperado, c.ia_produccion!))),
  }))
  if (modelos.length > 1) lineaBase.push({ modelo: 'todos', resumen: resumirFlyers(conBase.map((c) => compararFlyer(c.esperado, c.ia_produccion!))) })

  const autocontrol = {
    flyers: resumirFlyers(
      banco.flyers.casos.map((c) =>
        compararFlyer(c.esperado, { fecha: c.esperado.fecha, hora: c.esperado.hora, lugar: c.esperado.lugar, precio: c.esperado.precio === 'gratis' ? 0 : c.esperado.precio, categoria: c.esperado.categoria }),
      ),
    ),
    traduccion: resumirTraduccion(
      banco.traduccion.casos.map((c) => puntuarTraduccion(c, c.esperado)),
      banco.traduccion.casos.map((c) => validarTraduccionProduccion(eventoParaTraducir(c), c.esperado) !== null),
    ),
    clasificacion: resumirClasificacion(banco.clasificacion.casos.map((c) => ({ esperado: c.esperado.categoria, obtenido: c.esperado.categoria }))),
  }

  return {
    modo: 'seco',
    fixtures: {
      flyers: { casos: banco.flyers.casos.length, extraido: banco.flyers.extraido },
      traduccion: { casos: banco.traduccion.casos.length, extraido: banco.traduccion.extraido },
      clasificacion: { casos: banco.clasificacion.casos.length, extraido: banco.clasificacion.extraido },
    },
    pedidos: {
      flyers: resumirPedidos(pedidos.flyers.map((p) => p.pedido)),
      traduccion: resumirPedidos(pedidos.traduccion.map((p) => p.pedido)),
      clasificacion: resumirPedidos(pedidos.clasificacion.map((p) => p.pedido)),
    },
    costos,
    totalMensual,
    volumenes,
    lineaBase: { flyers: lineaBase },
    autocontrol,
  }
}
