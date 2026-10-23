/**
 * Búsqueda de una dirección desde el panel de ubicar de /admin/lugares (R65,
 * tarea 65-b). Lógica pura: arma la consulta (con el sesgo a Salta Capital de
 * la R53-b) y filtra/acota los resultados. No importa Next ni Supabase y no
 * llama al `fetch` global: el pedido lo hace `nominatim.ts` desde la server
 * action.
 */

import { coordenadasEnSalta } from '@qps/core/mapa/zona'
import type { ConsultaLibre } from './consultas'
import { localidadDelLugar } from './localidades'
import type { ResultadoNominatim } from './nominatim'

const LARGO_MIN_TEXTO = 3
const LARGO_MAX_TEXTO = 200
const MAX_RESULTADOS = 3

export interface ResultadoAdmin {
  lat: number
  lng: number
  etiqueta: string
}

/** Consulta libre `q = texto`, acotada a la ciudad que el texto nombre (Salta Capital por defecto). */
export function consultaDeBusquedaAdmin(texto: string): ConsultaLibre {
  const localidad = localidadDelLugar({ nombre: texto })
  return { tipo: 'libre', q: texto, alcance: 'ciudad', zona: localidad.zona, donde: localidad.nombre }
}

/** Texto recortado y con espacios colapsados, de 3 a 200 caracteres; si no, `null`. */
export function normalizarTextoBusqueda(texto: unknown): string | null {
  if (typeof texto !== 'string') return null
  const limpio = texto.replace(/\s+/g, ' ').trim()
  if (limpio.length < LARGO_MIN_TEXTO || limpio.length > LARGO_MAX_TEXTO) return null
  return limpio
}

const redondear6 = (n: number) => Math.round(n * 1e6) / 1e6

/** Hasta 3 resultados dentro de Salta, en el orden de Nominatim. */
export function resultadosParaAdmin(resultados: ResultadoNominatim[]): ResultadoAdmin[] {
  const salida: ResultadoAdmin[] = []
  for (const r of resultados) {
    if (salida.length >= MAX_RESULTADOS) break
    if (!coordenadasEnSalta(r.lat, r.lon)) continue
    salida.push({ lat: redondear6(r.lat), lng: redondear6(r.lon), etiqueta: r.display_name.slice(0, LARGO_MAX_TEXTO) })
  }
  return salida
}
