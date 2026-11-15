/**
 * Q5-5 · La ficha pública de un lugar (/lugar/<slug>): reglas puras de
 * indexación y armado de los eventos. Sin red ni base.
 */

/** Cuántos días hacia atrás se muestran los eventos pasados recientes. */
export const DIAS_PASADOS_RECIENTES = 60
export const MAX_PROXIMOS = 30
export const MAX_PASADOS = 6

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** El parámetro de la URL: un slug, un uuid (se redirige al slug) o nada. */
export function leerParametroLugar(valor: string): { tipo: 'slug'; slug: string } | { tipo: 'id'; id: string } | null {
  // R-1: un «%» suelto o mal codificado hacía tirar a decodeURIComponent (un
  // 500 en /lugar/<…>); no es un slug ni un uuid: es «no existe» (404).
  let decodificado: string
  try {
    decodificado = decodeURIComponent(valor)
  } catch {
    return null
  }
  const v = decodificado.trim().toLowerCase()
  if (UUID.test(v)) return { tipo: 'id', id: v }
  if (v.length <= 100 && SLUG.test(v)) return { tipo: 'slug', slug: v }
  return null
}

/**
 * Se indexa si tiene algo que mostrar: eventos próximos o recientes, o una
 * ficha de lugar permanente publicada. Si no, `noindex` (página flaca).
 */
export function fichaLugarIndexable(d: { proximos: number; pasados: number; permanente: boolean }): boolean {
  return d.permanente || d.proximos > 0 || d.pasados > 0
}

export interface EventoDeLugar {
  id: string
  titulo: string
  inicio: string
  gratis: boolean
  /**
   * Q7-3: lo que necesita el `Event` del JSON-LD de la ficha del lugar
   * (descripción, imagen y oferta, igual que la ficha del evento). Opcionales:
   * solo vienen si la consulta trae esas columnas.
   */
  fin?: string | null
  descripcion?: string | null
  descripcionCorta?: string | null
  tituloEn?: string | null
  descripcionEn?: string | null
  imagen?: string | null
  precioMin?: number | null
  enlaceEntradas?: string | null
  creado?: string | null
}

/** Las columnas de `events` que lee la ficha del lugar (Q7-3: las del JSON-LD incluidas). */
export const COLUMNAS_EVENTO_DE_LUGAR =
  'id, title, start_date, end_date, is_free, description, short_description, title_en, description_en, image_url, price_min, ticket_url, created_at'

/** Una fila de `events` con esas columnas (todas opcionales salvo id, título e inicio). */
export interface FilaEventoDeLugar {
  id: string
  title: string
  start_date: string
  end_date?: string | null
  is_free?: boolean | null
  description?: string | null
  short_description?: string | null
  title_en?: string | null
  description_en?: string | null
  image_url?: string | null
  price_min?: number | null
  ticket_url?: string | null
  created_at?: string | null
}

/** La fila como `EventoDeLugar`. Los campos del JSON-LD van solo si la fila los trae. */
function aEventoDeLugar(e: FilaEventoDeLugar): EventoDeLugar {
  const item: EventoDeLugar = { id: e.id, titulo: e.title, inicio: e.start_date, gratis: e.is_free === true }
  if (e.end_date !== undefined) item.fin = e.end_date
  if (e.description !== undefined) item.descripcion = e.description
  if (e.short_description !== undefined) item.descripcionCorta = e.short_description
  if (e.title_en !== undefined) item.tituloEn = e.title_en
  if (e.description_en !== undefined) item.descripcionEn = e.description_en
  if (e.image_url !== undefined) item.imagen = e.image_url
  if (e.price_min !== undefined) item.precioMin = e.price_min
  if (e.ticket_url !== undefined) item.enlaceEntradas = e.ticket_url
  if (e.created_at !== undefined) item.creado = e.created_at
  return item
}

/** Separa en próximos (de más cerca a más lejos) y pasados recientes (de más nuevo a más viejo). */
export function separarEventosDeLugar(
  eventos: readonly FilaEventoDeLugar[],
  ahora: Date,
): { proximos: EventoDeLugar[]; pasados: EventoDeLugar[] } {
  const corte = ahora.getTime() - DIAS_PASADOS_RECIENTES * 24 * 60 * 60 * 1000
  const proximos: EventoDeLugar[] = []
  const pasados: EventoDeLugar[] = []
  for (const e of eventos) {
    const inicio = new Date(e.start_date).getTime()
    const fin = e.end_date ? new Date(e.end_date).getTime() : inicio
    if (!Number.isFinite(inicio)) continue
    const item = aEventoDeLugar(e)
    if (Math.max(inicio, fin) >= ahora.getTime()) proximos.push(item)
    else if (inicio >= corte) pasados.push(item)
  }
  proximos.sort((a, b) => a.inicio.localeCompare(b.inicio))
  pasados.sort((a, b) => b.inicio.localeCompare(a.inicio))
  return { proximos: proximos.slice(0, MAX_PROXIMOS), pasados: pasados.slice(0, MAX_PASADOS) }
}

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export interface LugarCoincidente {
  slug: string
  nombre: string
  eventos: number
}

/**
 * Q5-5 · Buscar: los lugares (con ficha) cuyo nombre contiene lo que se
 * tipeó, a partir de los eventos ya cargados (sin otra consulta). Desde 3
 * letras, sin tildes ni mayúsculas, los que más eventos tienen primero, hasta 5.
 */
export function lugaresQueCoinciden(
  eventos: readonly { venue: { slug?: string | null; name?: string | null; is_placeholder?: boolean | null } | null }[],
  texto: string,
  maximo = 5,
): LugarCoincidente[] {
  const q = normalizar(texto)
  if (q.length < 3) return []
  const porSlug = new Map<string, LugarCoincidente>()
  for (const e of eventos) {
    const v = e.venue
    if (!v || v.is_placeholder || !v.slug || !v.name) continue
    if (!normalizar(v.name).includes(q)) continue
    const previo = porSlug.get(v.slug)
    if (previo) previo.eventos++
    else porSlug.set(v.slug, { slug: v.slug, nombre: v.name, eventos: 1 })
  }
  return [...porSlug.values()].sort((a, b) => b.eventos - a.eventos || a.nombre.localeCompare(b.nombre, 'es')).slice(0, maximo)
}
