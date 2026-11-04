/**
 * Q6-3 · Errores normalizados de los proveedores de IA.
 *
 * Regla: el mensaje que sale de acá nunca lleva la clave, el prompt, la
 * respuesta ni el cuerpo del error del proveedor (puede repetir el pedido).
 * Solo el código, el proveedor y el estado HTTP.
 */
import type { CodigoErrorIA, FalloIA, NombreProveedorIA } from './tipos'

const DESCRIPCION: Record<CodigoErrorIA, string> = {
  sin_clave: 'falta la clave',
  no_autorizado: 'clave inválida o sin permiso',
  sin_credito: 'sin crédito o problema de facturación',
  limite: 'límite de uso alcanzado',
  timeout: 'no respondió a tiempo',
  respuesta_invalida: 'respuesta vacía o fuera del formato pedido',
  solicitud_invalida: 'el proveedor rechazó el pedido',
  error_proveedor: 'error del proveedor',
  red: 'no se pudo conectar',
}

export function fallo(proveedor: NombreProveedorIA, codigo: CodigoErrorIA, estado?: number, detalle?: string): FalloIA {
  const http = estado !== undefined ? ` (HTTP ${estado})` : ''
  const extra = detalle ? `: ${detalle}` : ''
  return { codigo, estado, mensaje: `IA ${proveedor}: ${DESCRIPCION[codigo]}${http}${extra}` }
}

/** Código por estado HTTP, igual para los dos proveedores. */
export function codigoPorEstado(estado: number): CodigoErrorIA {
  if (estado === 401 || estado === 403) return 'no_autorizado'
  if (estado === 402) return 'sin_credito'
  if (estado === 429) return 'limite'
  if (estado === 408 || estado === 504) return 'timeout'
  if (estado >= 500) return 'error_proveedor'
  return 'solicitud_invalida'
}

/** ¿Es un corte por tiempo (AbortSignal.timeout o un abort)? */
export function esCortePorTiempo(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const nombre = (error as { name?: unknown }).name
  return nombre === 'TimeoutError' || nombre === 'AbortError'
}
