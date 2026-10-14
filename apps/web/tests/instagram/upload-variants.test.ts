import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApifyInstagramPost } from '@/lib/instagram-config'
import { INSTAGRAM_ENGINE_CONFIG } from '@/lib/instagram-config'

// Sin red, sin Supabase real: se mockea el cliente admin (DB + Storage), el
// `fetch` que descarga la imagen de la CDN de Instagram, y `makeVariants`
// (sharp) — este archivo es sobre la orquestación de la subida (original +
// variantes), no sobre sharp en sí (eso lo cubre tests/images/variants.test.ts).
const makeVariants = vi.hoisted(() => vi.fn())
vi.mock('@/lib/images/variants-server', () => ({
  makeVariants: (...a: unknown[]) => makeVariants(...a),
}))

const createAdminClientMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => createAdminClientMock(),
}))

import { processApifyPayload } from '@/lib/instagram/process-apify-payload'

interface Upload {
  path: string
  body: Buffer
  options: Record<string, unknown>
}

const BUCKET = INSTAGRAM_ENGINE_CONFIG.STORAGE_BUCKET

function fakeSupabase(opts: {
  accounts: Array<{
    id: string
    username: string
    default_venue_name: string | null
    default_maps_url: string | null
    default_category: string
  }>
  existingPostIds?: string[]
}) {
  const uploads: Upload[] = []
  const inserted: Array<Record<string, unknown>> = []

  const upload = vi.fn(async (path: string, body: Buffer, options: Record<string, unknown>) => {
    uploads.push({ path, body, options })
    return { data: {}, error: null }
  })
  const getPublicUrl = vi.fn((path: string) => ({
    data: { publicUrl: `https://proyecto-de-prueba.supabase.co/storage/v1/object/public/${BUCKET}/${path}` },
  }))
  const storageFrom = vi.fn(() => ({ upload, getPublicUrl }))

  const from = vi.fn((table: string) => {
    if (table === 'instagram_accounts') {
      return { select: () => ({ eq: () => Promise.resolve({ data: opts.accounts, error: null }) }) }
    }
    if (table === 'instagram_flyers') {
      return {
        select: () => ({
          in: () => Promise.resolve({ data: (opts.existingPostIds ?? []).map((id) => ({ ig_post_id: id })), error: null }),
        }),
        insert: (payload: Record<string, unknown>) => {
          inserted.push(payload)
          return Promise.resolve({ error: null })
        },
      }
    }
    throw new Error(`tabla inesperada en el falso: ${table}`)
  })

  return { client: { from, storage: { from: storageFrom } }, uploads, inserted }
}

function post(overrides: Partial<ApifyInstagramPost> = {}): ApifyInstagramPost {
  return {
    id: 'post-de-prueba-1',
    url: 'https://instagram.ejemplo.test/p/post-de-prueba-1',
    displayUrl: 'https://cdn.ejemplo.test/imagen-de-prueba.jpg',
    caption: 'Flyer de prueba',
    timestamp: '2030-10-01T00:00:00.000Z',
    ownerUsername: 'cuenta_de_prueba',
    type: 'Image',
    ...overrides,
  }
}

const cuentaDePrueba = {
  id: 'cuenta-de-prueba-id',
  username: 'cuenta_de_prueba',
  default_venue_name: 'Venue de Prueba',
  default_maps_url: null,
  default_category: 'boliches',
}

function mockFetchOk(bytes = 2048) {
  const arr = new Uint8Array(bytes).fill(9)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: async () => arr.buffer,
    }))
  )
}

beforeEach(() => {
  makeVariants.mockReset()
  createAdminClientMock.mockReset()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ingesta de Instagram: original + variantes', () => {
  it('sube el original y las dos variantes (400 y 800) al bucket de flyers', async () => {
    mockFetchOk(2048)
    makeVariants.mockResolvedValue({ 400: Buffer.from('variante-400-de-prueba'), 800: Buffer.from('variante-800-de-prueba') })
    const fake = fakeSupabase({ accounts: [cuentaDePrueba] })
    createAdminClientMock.mockReturnValue(fake.client)

    const result = await processApifyPayload([post()])

    expect(result.inserted).toBe(1)
    expect(result.errors).toEqual([])

    expect(fake.uploads).toHaveLength(3)
    const byPath = new Map(fake.uploads.map((u) => [u.path, u]))

    expect(byPath.has('cuenta_de_prueba/post-de-prueba-1.jpg')).toBe(true)
    expect(byPath.get('cuenta_de_prueba/post-de-prueba-1.jpg')!.options.contentType).toBe('image/jpeg')

    expect(byPath.has('cuenta_de_prueba/post-de-prueba-1.w400.webp')).toBe(true)
    expect(byPath.get('cuenta_de_prueba/post-de-prueba-1.w400.webp')!.options.contentType).toBe('image/webp')

    expect(byPath.has('cuenta_de_prueba/post-de-prueba-1.w800.webp')).toBe(true)
    expect(byPath.get('cuenta_de_prueba/post-de-prueba-1.w800.webp')!.options.contentType).toBe('image/webp')

    // El registro insertado apunta a la URL pública del original re-subido.
    expect(fake.inserted).toHaveLength(1)
    expect(fake.inserted[0].storage_image_url as string).toContain('cuenta_de_prueba/post-de-prueba-1.jpg')
    expect(fake.inserted[0].storage_image_path).toBe('cuenta_de_prueba/post-de-prueba-1.jpg')
  })

  it('si makeVariants lanza: sube el original igual, inserta su URL pública, y la ingesta no se cae', async () => {
    mockFetchOk(2048)
    makeVariants.mockRejectedValue(new Error('boom de variantes (de prueba)'))
    const fake = fakeSupabase({ accounts: [cuentaDePrueba] })
    createAdminClientMock.mockReturnValue(fake.client)

    const unPost = post({
      id: 'post-de-prueba-2',
      url: 'https://instagram.ejemplo.test/p/post-de-prueba-2',
    })

    const result = await processApifyPayload([unPost])

    expect(result.inserted).toBe(1)
    expect(result.errors).toEqual([])

    // Sólo se subió el original: ninguna variante.
    expect(fake.uploads).toHaveLength(1)
    expect(fake.uploads[0].path).toBe('cuenta_de_prueba/post-de-prueba-2.jpg')

    // El registro insertado usa la URL pública del original re-subido, no el
    // fallback a la URL (efímera) de la CDN de Instagram.
    expect(fake.inserted).toHaveLength(1)
    const fila = fake.inserted[0]
    expect(fila.storage_image_url as string).toContain('cuenta_de_prueba/post-de-prueba-2.jpg')
    expect(fila.storage_image_url).not.toBe(fila.original_image_url)
  })
})
