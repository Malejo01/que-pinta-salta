import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Cliente falso de @supabase/supabase-js: mismo patrón que
// tests/scraper/save-events-venue-errors.test.ts. `rpc` resuelve siempre un
// venue_id válido (no es el foco de este test); categorías/alias responden
// vacío/benigno. `storage.from()` devuelve un objeto marcador cualquiera: lo
// único que importa es que llegue como argumento a `copyExternalImage`
// (mockeado más abajo), nunca se usa de verdad.
const rpc = vi.fn()
const FAKE_STORAGE_CLIENT = { marca: 'storage-de-prueba' }

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: (...a: unknown[]) => rpc(...a),
    from: (table: string) => {
      if (table === 'categories') {
        const single = () => Promise.resolve({ data: { id: 'cat-id-de-prueba' } })
        return { select: () => ({ eq: () => ({ single }), order: () => ({ limit: () => ({ single }) }) }) }
      }
      if (table === 'aliases') {
        return { select: () => ({ eq: () => Promise.resolve({ data: [] }) }) }
      }
      throw new Error('tabla inesperada: ' + table)
    },
    storage: { from: () => FAKE_STORAGE_CLIENT },
  }),
}))

const upsertEventWithDeduplication = vi.fn()
vi.mock('@/lib/scraper/deduplicate', () => ({
  upsertEventWithDeduplication: (...a: unknown[]) => upsertEventWithDeduplication(...a),
}))

// Mismo patrón que tests/images/external.test.ts para `copyExternalImage`,
// pero mockeando el módulo entero (pedido explícito de la tarea): `isOwnStorageUrl`
// se reimplementa acá igual que la real (mismo prefijo de URL pública de
// Storage), así los tests pueden seguir distinguiendo "ya es nuestra" de "es
// del tercero" sin importar la implementación real.
const copyExternalImage = vi.fn()
const STORAGE_PREFIX = '/storage/v1/object/public/flyers_ig/'
vi.mock('@/lib/images/external', () => ({
  copyExternalImage: (...a: unknown[]) => copyExternalImage(...a),
  isOwnStorageUrl: (url: string | null | undefined) => Boolean(url && url.includes(STORAGE_PREFIX)),
}))

import { saveEventsToSupabase } from '@/lib/scraper/save-to-supabase'

const URL_ENV = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY_ENV = process.env.SUPABASE_SERVICE_ROLE_KEY

const URL_PROPIA = 'https://proyecto-de-prueba.supabase.co/storage/v1/object/public/flyers_ig/externas/hash-de-prueba.jpg'
const URL_TICKETERA = 'https://entradauno.com/flyers/evento-de-prueba.jpg'

const evento = (overrides: Partial<{ image_url: string; venue: string; title: string }> = {}) => ({
  title: 'Evento de Prueba',
  slug: 'evento-de-prueba',
  venue: 'Venue de Prueba',
  start_date: '2026-12-01T22:00:00Z',
  price_min: 0,
  is_free: false,
  image_url: URL_TICKETERA,
  ...overrides,
})

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ data: 'venue-id-de-prueba', error: null })
  upsertEventWithDeduplication.mockReset()
  upsertEventWithDeduplication.mockResolvedValue({ success: true, action: 'update', eventId: 'ev-de-prueba' })
  copyExternalImage.mockReset()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-prueba'
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  if (URL_ENV === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = URL_ENV
  if (KEY_ENV === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
  else process.env.SUPABASE_SERVICE_ROLE_KEY = KEY_ENV
})

describe('saveEventsToSupabase: copia de imagen a Storage (Ronda 18, vuelta 2)', () => {
  it('copia la imagen entrante aunque el evento con el que va a fusionar (menor prioridad) ya tenga imagen de Storage', async () => {
    // Antes del arreglo, la condición de save-to-supabase.ts consultaba un
    // "duplicado existente" y, si éste ya tenía imagen de Storage, se
    // SALTEABA la copia de la imagen entrante — dejando que merge-events.ts
    // (prioridad de fuente) pisara image_url con la URL cruda del tercero.
    // Este caso (una ticketera, prioridad mayor, matcheando un evento creado
    // antes por `vamos`) es exactamente el que probaba que esa premisa era
    // falsa. Con el arreglo, la copia se intenta siempre.
    copyExternalImage.mockResolvedValue(URL_PROPIA)

    const r = await saveEventsToSupabase([evento({ image_url: URL_TICKETERA })], 'entradauno')

    expect(copyExternalImage).toHaveBeenCalledTimes(1)
    expect(copyExternalImage).toHaveBeenCalledWith(URL_TICKETERA, FAKE_STORAGE_CLIENT)
    expect(upsertEventWithDeduplication.mock.calls[0][0].image_url).toBe(URL_PROPIA)
    expect(r.errors).toEqual([])
  })

  it('si la URL entrante ya es de nuestro Storage, no se intenta copiar', async () => {
    const r = await saveEventsToSupabase([evento({ image_url: URL_PROPIA })], 'entradauno')

    expect(copyExternalImage).not.toHaveBeenCalled()
    expect(upsertEventWithDeduplication.mock.calls[0][0].image_url).toBe(URL_PROPIA)
    expect(r.errors).toEqual([])
  })

  it('si la copia falla (copyExternalImage devuelve null), se guarda la URL original y la corrida sigue', async () => {
    copyExternalImage.mockResolvedValue(null)

    const r = await saveEventsToSupabase([evento({ image_url: URL_TICKETERA })], 'entradauno')

    expect(copyExternalImage).toHaveBeenCalledTimes(1)
    expect(upsertEventWithDeduplication.mock.calls[0][0].image_url).toBe(URL_TICKETERA)
    expect(r.inserted + r.skipped).toBe(1)
    expect(r.errors).toEqual([])
  })
})
