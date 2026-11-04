/**
 * Q6-3 · Qué proveedor se usa, según el entorno.
 *
 *   IA_PROVEEDOR      gemini (por defecto) | claude. Otro valor → gemini, con aviso.
 *   GEMINI_API_KEY    la de siempre.
 *   ANTHROPIC_API_KEY solo si IA_PROVEEDOR=claude.
 *   IA_MODELO_CLAUDE  opcional; por defecto claude-haiku-4-5.
 *
 * Decisión: con IA_PROVEEDOR=claude y sin ANTHROPIC_API_KEY NO se cae en
 * silencio a Gemini: cada llamada vuelve con el error `sin_clave` (queda en
 * el log y en ia_llamadas). Elegir Claude y gastar Gemini sin saberlo sería
 * peor que fallar a la vista.
 */
import { crearProveedorClaude, CLAUDE_MODELO_POR_DEFECTO, type FetchIA } from './claude'
import { crearProveedorGemini, GEMINI_MODEL, type ClienteGemini } from './gemini'
import type { NombreProveedorIA, ProveedorIA } from './tipos'

export type EntornoIA = Record<string, string | undefined>

const avisados = new Set<string>()
function avisarUnaVez(aviso: string) {
  if (avisados.has(aviso)) return
  avisados.add(aviso)
  console.warn(`[ia] ${aviso}`)
}

export function elegirProveedor(entorno: EntornoIA): { nombre: NombreProveedorIA; aviso?: string } {
  const valor = (entorno.IA_PROVEEDOR ?? '').trim().toLowerCase()
  if (valor === '' || valor === 'gemini') return { nombre: 'gemini' }
  if (valor === 'claude') return { nombre: 'claude' }
  // El valor no se repite en el aviso: es una variable editable.
  return { nombre: 'gemini', aviso: 'IA_PROVEEDOR tiene un valor no reconocido (gemini | claude); se usa gemini' }
}

export function modeloClaude(entorno: EntornoIA): { modelo: string; aviso?: string } {
  const valor = (entorno.IA_MODELO_CLAUDE ?? '').trim()
  if (valor === '') return { modelo: CLAUDE_MODELO_POR_DEFECTO }
  if (/^claude-[a-z0-9.-]{1,60}$/.test(valor)) return { modelo: valor }
  return { modelo: CLAUDE_MODELO_POR_DEFECTO, aviso: `IA_MODELO_CLAUDE no parece un modelo de Claude; se usa ${CLAUDE_MODELO_POR_DEFECTO}` }
}

export interface DependenciasIA {
  fetch?: FetchIA
  clienteGemini?: ClienteGemini
}

/** Crea el proveedor que pide el entorno (sin cache). */
export function crearProveedorDesdeEntorno(entorno: EntornoIA = process.env, deps: DependenciasIA = {}): ProveedorIA {
  const eleccion = elegirProveedor(entorno)
  if (eleccion.aviso) avisarUnaVez(eleccion.aviso)
  if (eleccion.nombre === 'claude') {
    const { modelo, aviso } = modeloClaude(entorno)
    if (aviso) avisarUnaVez(aviso)
    if (!entorno.ANTHROPIC_API_KEY) avisarUnaVez('IA_PROVEEDOR=claude pero falta ANTHROPIC_API_KEY: las llamadas a la IA van a fallar (no se usa Gemini en su lugar)')
    return crearProveedorClaude({ apiKey: entorno.ANTHROPIC_API_KEY, modelo, fetch: deps.fetch })
  }
  if (!entorno.GEMINI_API_KEY) avisarUnaVez('GEMINI_API_KEY no está configurada: las llamadas a la IA van a fallar')
  return crearProveedorGemini({ apiKey: entorno.GEMINI_API_KEY, modelo: GEMINI_MODEL, cliente: deps.clienteGemini })
}

let enCache: { firma: string; proveedor: ProveedorIA } | undefined

/** El proveedor activo, reusado mientras no cambie el entorno (el cliente del SDK se crea una vez). */
export function obtenerProveedorIA(entorno: EntornoIA = process.env): ProveedorIA {
  const firma = JSON.stringify([
    entorno.IA_PROVEEDOR ?? '',
    entorno.IA_MODELO_CLAUDE ?? '',
    entorno.GEMINI_API_KEY ?? '',
    entorno.ANTHROPIC_API_KEY ?? '',
  ])
  if (enCache?.firma !== firma) enCache = { firma, proveedor: crearProveedorDesdeEntorno(entorno) }
  return enCache.proveedor
}

/** Para el GET de estado de la cola: proveedor y modelo activos (sin claves). */
export function proveedorYModeloActivos(entorno: EntornoIA = process.env): { proveedor: NombreProveedorIA; modelo: string } {
  const { nombre } = elegirProveedor(entorno)
  return { proveedor: nombre, modelo: nombre === 'claude' ? modeloClaude(entorno).modelo : GEMINI_MODEL }
}
