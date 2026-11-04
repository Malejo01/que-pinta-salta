/**
 * Q6-3 · Capa de proveedor de IA intercambiable. Punto de entrada.
 *
 *   const ia = iaPara('traduccion')            // proveedor del entorno + registro
 *   const r = await ia.generarJson({ ... })    // nunca tira: mirar r.ok / r.error
 *
 * Gemini por defecto; Claude con IA_PROVEEDOR=claude (ver `seleccion.ts`).
 */
import { conRegistro, registradorPorDefecto, type RegistradorIA } from './registro'
import { obtenerProveedorIA } from './seleccion'
import type { ProveedorIA, UsoIA } from './tipos'

export * from './tipos'
export { normalizarEsquema, validarContraEsquema } from './esquema'
export { crearProveedorGemini, GEMINI_MODEL } from './gemini'
export { crearProveedorClaude, CLAUDE_MODELO_POR_DEFECTO } from './claude'
export { obtenerProveedorIA, crearProveedorDesdeEntorno, proveedorYModeloActivos, elegirProveedor } from './seleccion'
export { conRegistro, crearRegistradorSupabase, registradorPorDefecto, registradorNulo, type RegistradorIA } from './registro'

/** El proveedor activo, con cada llamada registrada en `ia_llamadas` bajo `uso`. */
export function iaPara(uso: UsoIA, opciones: { proveedor?: ProveedorIA; registrar?: RegistradorIA } = {}): ProveedorIA {
  return conRegistro(opciones.proveedor ?? obtenerProveedorIA(), uso, opciones.registrar ?? registradorPorDefecto())
}
