import { describe, expect, it } from 'vitest'
import { mergeEvents } from '@/lib/scraper/merge-events'

// Mismo prefijo de URL pública que usa lib/images/external.ts
// (isOwnStorageUrl): no se mockea el módulo porque isOwnStorageUrl es puro
// texto sobre la URL, sin red ni base.
const URL_PROPIA = 'https://proyecto-de-prueba.supabase.co/storage/v1/object/public/flyers_ig/externas/hash-a.jpg'
const URL_PROPIA_2 = 'https://proyecto-de-prueba.supabase.co/storage/v1/object/public/flyers_ig/externas/hash-b.jpg'
const URL_EXTERNA = 'https://entradauno.com/flyers/evento-grande.jpg'
const URL_EXTERNA_2 = 'https://norteticket.com/flyers/evento-grande-2.jpg'
// `copyExternalImage` siempre nombra el archivo `externas/<sha1 hex>.<ext>`:
// un path realista como este nunca puede contener "150x150" ni "thumb" (el
// hash sólo tiene [0-9a-f]). Ver el test de abajo que lo documenta.
const URL_PROPIA_HASH_PURO = `https://proyecto-de-prueba.supabase.co/storage/v1/object/public/flyers_ig/externas/${'a'.repeat(40)}.jpg`
// Lo que EntradaUno publica de verdad como miniatura (con espacios escapados
// en el medio del tamaño) — nunca copiada a Storage después del arreglo de
// run-scrape-job.ts, así que sigue siendo detectable como miniatura.
const URL_MINIATURA_EXTERNA = 'https://entradauno.com/flyers/150%20x%20150%20(5).jpg'

const base = (over: Record<string, unknown> = {}) => ({
  id: 'eeeeeeee-eeee-4eee-8eee-000000000001',
  title: 'Evento de Prueba',
  status: 'PUBLISHED',
  start_date: '2026-11-20T23:00:00.000Z',
  scrape_source_key: 'vamos',
  ...over,
})
const incoming = (over: Record<string, unknown> = {}) => ({
  title: 'Evento de Prueba',
  status: 'PUBLISHED',
  start_date: '2026-11-20T23:00:00.000Z',
  ...over,
})
const opts = (src: string) => ({
  incomingSource: src,
  dedupKey: 'evento de prueba|2026-11-20',
  context: 'ingest' as const,
})

describe('mergeEvents: image_url (QPS-144, Storage propio sobre externa)', () => {
  it('entra una URL externa y la base ya tiene una propia (de Storage): queda la propia', () => {
    // vamos (portal, 300) ya tenía la imagen copiada a Storage; entra
    // norteticket (ticketera, 400 > 300), que por prioridad normalmente
    // ganaría. La guarda nueva lo bloquea: Storage propio no se pisa por
    // prioridad de fuente.
    const b = base({ image_url: URL_PROPIA, scrape_source_key: 'vamos' })
    const i = incoming({ image_url: URL_EXTERNA })
    const { patch, conflicts } = mergeEvents(b, i, opts('norteticket'))

    expect('image_url' in patch).toBe(false)
    const conflict = conflicts.find((c) => c.field === 'image_url')
    expect(conflict?.kept).toBe(URL_PROPIA)
    expect(conflict?.discarded).toBe(URL_EXTERNA)
    expect(conflict?.rule).toBe('storage-propio-sobre-externa')
  })

  it('entra una URL propia y la base tenía una externa: queda la propia (entrante)', () => {
    // La guarda es asimétrica a propósito: lo que protege es que la URL ya
    // copiada a Storage no se pierda, sin importar de qué lado del merge
    // esté. Si la entrante ya trae Storage, gana igual que antes (por
    // prioridad, upgrade de calidad en los hechos: no hay excepción nueva
    // necesaria del lado de la entrante).
    const b = base({ image_url: URL_EXTERNA, scrape_source_key: 'instagram-ai' })
    const i = incoming({ image_url: URL_PROPIA })
    const { patch, conflicts } = mergeEvents(b, i, opts('norteticket'))

    expect(patch.image_url).toBe(URL_PROPIA)
    const conflict = conflicts.find((c) => c.field === 'image_url')
    expect(conflict?.kept).toBe(URL_PROPIA)
    expect(conflict?.rule).toBe('prioridad-de-fuente')
  })

  it('entran dos URLs externas: la regla de prioridad de siempre decide', () => {
    const b = base({ image_url: URL_EXTERNA, scrape_source_key: 'instagram-ai' })
    const i = incoming({ image_url: URL_EXTERNA_2 })
    const { patch, conflicts } = mergeEvents(b, i, opts('norteticket'))

    expect(patch.image_url).toBe(URL_EXTERNA_2)
    const conflict = conflicts.find((c) => c.field === 'image_url')
    expect(conflict?.rule).toBe('prioridad-de-fuente')
  })

  it('entran dos URLs externas y la entrante pierde por prioridad: queda la base', () => {
    const b = base({ image_url: URL_EXTERNA, scrape_source_key: 'norteticket' })
    const i = incoming({ image_url: URL_EXTERNA_2 })
    const { patch, conflicts } = mergeEvents(b, i, opts('instagram-ai'))

    expect('image_url' in patch).toBe(false)
    const conflict = conflicts.find((c) => c.field === 'image_url')
    expect(conflict?.kept).toBe(URL_EXTERNA)
    expect(conflict?.rule).toBe('prioridad-de-fuente')
  })

  it('excepción de calidad: una miniatura externa (sin copiar) sí se reemplaza por una externa grande', () => {
    // Caso raro a propósito (pedido explícito de la tarea): la excepción de
    // calidad tiene precedencia sobre la guarda nueva. Esto sólo puede
    // probarse de forma realista con la miniatura todavía CRUDA (no
    // copiada a Storage): run-scrape-job.ts (vuelta 1, 31-a) ya no copia una
    // miniatura a Storage precisamente porque, una vez copiada, el path pasa
    // a ser un hash puro y deja de ser detectable (ver el test de abajo) —
    // así que la base realista para este caso es la URL externa cruda, no
    // una de Storage.
    const b = base({ image_url: URL_MINIATURA_EXTERNA, scrape_source_key: 'vamos' })
    const i = incoming({ image_url: URL_EXTERNA })
    const { patch, conflicts } = mergeEvents(b, i, opts('instagram-ai'))

    expect(patch.image_url).toBe(URL_EXTERNA)
    const conflict = conflicts.find((c) => c.field === 'image_url')
    expect(conflict?.kept).toBe(URL_EXTERNA)
    expect(conflict?.rule).toBe('miniatura-reemplazada')
  })

  it('una miniatura que sí llegó a copiarse a Storage (path hash puro) queda atascada: isThumbnail ya no la detecta', () => {
    // Documenta el motivo de fondo del bloqueante del revisor (vuelta 1,
    // 31-a): un digest sha1 sólo tiene caracteres [0-9a-f], así que un path
    // `externas/<hash>.<ext>` realista NUNCA puede contener "150x150" ni
    // "thumb". Si una miniatura externa (de datos viejos, previos al
    // arreglo, o de save-to-supabase.ts, que tiene el mismo agujero y queda
    // fuera de esta tarea) ya está copiada a Storage, la excepción de
    // calidad no la puede alcanzar — queda protegida únicamente por la
    // guarda de Storage-propio, con la razón de siempre, nunca por
    // "miniatura-reemplazada".
    const b = base({ image_url: URL_PROPIA_HASH_PURO, scrape_source_key: 'vamos' })
    const i = incoming({ image_url: URL_EXTERNA })
    const { patch, conflicts } = mergeEvents(b, i, opts('norteticket'))

    expect('image_url' in patch).toBe(false)
    const conflict = conflicts.find((c) => c.field === 'image_url')
    expect(conflict?.kept).toBe(URL_PROPIA_HASH_PURO)
    expect(conflict?.rule).toBe('storage-propio-sobre-externa')
  })

  it('dos URLs propias distintas (ambas de Storage): decide la prioridad, no la guarda nueva', () => {
    const b = base({ image_url: URL_PROPIA, scrape_source_key: 'instagram-ai' })
    const i = incoming({ image_url: URL_PROPIA_2 })
    const { patch, conflicts } = mergeEvents(b, i, opts('norteticket'))

    expect(patch.image_url).toBe(URL_PROPIA_2)
    const conflict = conflicts.find((c) => c.field === 'image_url')
    expect(conflict?.rule).toBe('prioridad-de-fuente')
  })
})
