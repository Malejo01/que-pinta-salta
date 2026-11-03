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
  const v = decodeURIComponent(valor).trim().toLowerCase()
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
}

/** Separa en próximos (de más cerca a más lejos) y pasados recientes (de más nuevo a más viejo). */
export function separarEventosDeLugar(
  eventos: readonly { id: string; title: string; start_date: string; end_date?: string | null; is_free?: boolean | null }[],
  ahora: Date,
): { proximos: EventoDeLugar[]; pasados: EventoDeLugar[] } {
  const corte = ahora.getTime() - DIAS_PASADOS_RECIENTES * 24 * 60 * 60 * 1000
  const proximos: EventoDeLugar[] = []
  const pasados: EventoDeLugar[] = []
  for (const e of eventos) {
    const inicio = new Date(e.start_date).getTime()
    const fin = e.end_date ? new Date(e.end_date).getTime() : inicio
    if (!Number.isFinite(inicio)) continue
    const item = { id: e.id, titulo: e.title, inicio: e.start_date, gratis: e.is_free === true }
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
