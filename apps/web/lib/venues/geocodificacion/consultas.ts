/**
 * Consultas de geocodificación para un lugar: qué texto mandarle a Nominatim
 * y en qué orden, y la URL exacta del pedido.
 *
 * Puro: no importa `@supabase/*`, no toca el sistema de archivos ni llama al
 * `fetch` global. `nominatim.ts` es quien hace el pedido de red.
 */

import { CONTACTO_EMAIL } from '@qps/core/contacto'
import { ZONA_SALTA } from '@qps/core/mapa/zona'

/** User-Agent exigido por la política de uso de Nominatim: identifica el sitio y un contacto real. */
export const USER_AGENT = `QuePintaSalta/1.0 (geocodificación de lugares; +https://www.quepintasalta.com.ar; ${CONTACTO_EMAIL})`

/** Referer del pedido: la política de Nominatim lo pide junto con el User-Agent. */
export const REFERER = 'https://www.quepintasalta.com.ar'

/** Política de uso de Nominatim que este cliente tiene que cumplir (máx. 1 pedido/segundo, etc.). */
export const URL_POLITICA = 'https://operations.osmfoundation.org/policies/nominatim/'

/** Direcciones que llegan de las fuentes pero no aportan nada para geocodificar (ya normalizadas). */
const DIRECCIONES_INUTILES = new Set(['salta', 'salta capital', 'a confirmar', 'sin direccion'])

/**
 * Clave de comparación y de caché: minúsculas, sin tildes, espacios
 * colapsados y recortados. No toca puntuación (una consulta real lleva comas).
 *
 *   "Balcarce, Salta, Argentina"  -> "balcarce, salta, argentina"
 *   "  Güemes   "                 -> "guemes"
 */
export function normalizarConsulta(q: string): string {
  return q
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * `false` si `address` no aporta nada para geocodificar: vacía, igual al
 * nombre del lugar (normalizada), o una de las direcciones placeholder que
 * mandan las fuentes ("Salta", "Salta Capital", "A confirmar", "Sin
 * dirección").
 */
export function direccionUtil(address: string | null | undefined, nombre: string | null | undefined): boolean {
  if (!address) return false
  const direccionNorm = normalizarConsulta(address)
  if (direccionNorm.length === 0) return false
  if (direccionNorm === normalizarConsulta(nombre ?? '')) return false
  if (DIRECCIONES_INUTILES.has(direccionNorm)) return false
  return true
}

/**
 * Hasta 3 consultas para un lugar, de la más específica a la más genérica,
 * sin repetidas (comparadas por `normalizarConsulta`):
 *
 *   1. "nombre, dirección, Salta, Argentina" (solo si la dirección sirve)
 *   2. "dirección, Salta, Argentina"         (solo si la dirección sirve)
 *   3. "nombre, Salta, Argentina"
 */
export function consultasParaLugar({
  nombre,
  direccion,
}: {
  nombre: string
  direccion?: string | null
}): string[] {
  const candidatas: string[] = []
  if (direccionUtil(direccion, nombre) && direccion) {
    candidatas.push(`${nombre}, ${direccion}, Salta, Argentina`)
    candidatas.push(`${direccion}, Salta, Argentina`)
  }
  candidatas.push(`${nombre}, Salta, Argentina`)

  const vistas = new Set<string>()
  const consultas: string[] = []
  for (const candidata of candidatas) {
    const clave = normalizarConsulta(candidata)
    if (vistas.has(clave)) continue
    vistas.add(clave)
    consultas.push(candidata)
  }
  return consultas.slice(0, 3)
}

/**
 * URL del pedido de búsqueda a Nominatim para `q`, acotado a la zona de Salta
 * (`bounded=1` + `viewbox`), en español, con los parámetros que pide la
 * política de uso (`email`).
 */
export function urlDeBusqueda(q: string, { email }: { email: string }): string {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  const params = new URLSearchParams([
    ['format', 'jsonv2'],
    ['q', q],
    ['limit', '3'],
    ['countrycodes', 'ar'],
    ['viewbox', `${ZONA_SALTA.lngMin},${ZONA_SALTA.latMax},${ZONA_SALTA.lngMax},${ZONA_SALTA.latMin}`],
    ['bounded', '1'],
    ['addressdetails', '1'],
    ['accept-language', 'es'],
    ['email', email],
  ])
  url.search = params.toString()
  return url.toString()
}
