/**
 * Fuente del próximo evento de un lugar, para el admin de lugares.
 * Funciones puras: sin Next ni Supabase. El `ticket_url` es dato externo
 * (scrapeado), así que solo se acepta `http:` / `https:`.
 */

export interface FuenteLugar {
  href: string
  rotulo: 'Instagram' | 'Entrada'
}

export interface FilaFuente {
  venue_id: string | null
  start_date: string
  ticket_url: string | null
}

export function linkDeFuente(url: string | null): FuenteLugar | null {
  if (!url) return null
  let parsed: URL
  try {
    parsed = new URL(url.trim())
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  const host = parsed.hostname.toLowerCase()
  const rotulo = host === 'instagram.com' || host === 'www.instagram.com' ? 'Instagram' : 'Entrada'
  return { href: parsed.href, rotulo }
}

/** Por lugar: el link del evento de `start_date` más chico que tenga un link válido. */
export function proximaFuentePorLugar(filas: FilaFuente[]): Map<string, FuenteLugar> {
  const elegidas = new Map<string, { start: number; fuente: FuenteLugar }>()
  for (const fila of filas) {
    if (!fila.venue_id) continue
    const fuente = linkDeFuente(fila.ticket_url)
    if (!fuente) continue
    const start = Date.parse(fila.start_date)
    if (Number.isNaN(start)) continue
    const previa = elegidas.get(fila.venue_id)
    if (!previa || start < previa.start) elegidas.set(fila.venue_id, { start, fuente })
  }
  return new Map([...elegidas].map(([id, { fuente }]) => [id, fuente]))
}
