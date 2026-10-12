import { beforeEach, describe, expect, it, vi } from 'vitest'
import { INSTAGRAM_ENGINE_CONFIG } from '@/lib/instagram-config'
import { STORAGE_CACHE_CONTROL } from '@/lib/images/variants'
import type { BackfillStorageClient, StorageListItem } from '@/lib/images/backfill'

// `makeVariants` (sharp) se mockea: estos tests son sobre la orquestación del
// backfill (qué lista, qué cuenta, qué sube), no sobre la generación de la
// imagen en sí (eso lo cubre tests/images/variants.test.ts con sharp real).
const makeVariants = vi.hoisted(() => vi.fn())
vi.mock('@/lib/images/variants-server', () => ({
  makeVariants: (...a: unknown[]) => makeVariants(...a),
}))

import { runBackfill } from '@/lib/images/backfill'

interface FakeFile {
  name: string
  size: number
}

interface Upload {
  path: string
  body: Buffer
  options: { contentType: string; upsert: boolean; cacheControl?: string }
}

/**
 * Storage en memoria, sin red ni Supabase real. `accounts` es
 * cuenta -> archivos iniciales (originales y, si corresponde, variantes ya
 * subidas). `upload()` refleja lo subido en el mismo mapa, así que una
 * segunda corrida contra el mismo `storage` ve el estado real post-apply
 * (para testear idempotencia).
 */
function makeFakeStorage(accounts: Record<string, FakeFile[]>): {
  storage: BackfillStorageClient
  uploads: Upload[]
} {
  const files = new Map<string, FakeFile[]>(
    Object.entries(accounts).map(([username, list]) => [username, [...list]])
  )
  const uploads: Upload[] = []

  const storage: BackfillStorageClient = {
    async list(path, options) {
      const limit = options?.limit ?? Number.POSITIVE_INFINITY
      const offset = options?.offset ?? 0

      let items: StorageListItem[]
      if (path === '') {
        items = [...files.keys()].map((username) => ({ name: username, id: null }))
      } else {
        items = (files.get(path) ?? []).map((f) => ({
          name: f.name,
          id: 'fake-file-id',
          metadata: { size: f.size },
        }))
      }

      return { data: items.slice(offset, offset + limit), error: null }
    },

    async download(path) {
      const slash = path.indexOf('/')
      const username = path.slice(0, slash)
      const name = path.slice(slash + 1)
      const file = (files.get(username) ?? []).find((f) => f.name === name)
      if (!file) return { data: null, error: { message: `no existe ${path}` } }

      const buffer = Buffer.alloc(file.size, 7)
      return { data: new Blob([buffer]), error: null }
    },

    async upload(path, body, options) {
      uploads.push({ path, body, options })
      const slash = path.indexOf('/')
      const username = path.slice(0, slash)
      const name = path.slice(slash + 1)
      const list = files.get(username) ?? []
      list.push({ name, size: body.length })
      files.set(username, list)
      return { data: {}, error: null }
    },
  }

  return { storage, uploads }
}

/** `n` originales `.jpg` sin ninguna variante, `p0.jpg`..`p{n-1}.jpg`. */
function pendientes(n: number): FakeFile[] {
  return Array.from({ length: n }, (_, i) => ({ name: `p${i}.jpg`, size: 1000 + i }))
}

beforeEach(() => {
  makeVariants.mockReset()
  makeVariants.mockImplementation(async (buffer: Buffer) => ({
    400: Buffer.from(`w400:${buffer.length}`),
    800: Buffer.from(`w800:${buffer.length}`),
  }))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('runBackfill: dry-run', () => {
  it('no sube nada y cuenta bien originales, completos y a-generar', async () => {
    const { storage, uploads } = makeFakeStorage({
      cuenta_a: [
        { name: 'p1.jpg', size: 1000 }, // sin variantes
        { name: 'p2.jpg', size: 2000 },
        { name: 'p2.w400.webp', size: 50 },
        { name: 'p2.w800.webp', size: 80 }, // completo
        { name: 'p3.jpg', size: 1500 },
        { name: 'p3.w400.webp', size: 40 }, // le falta la de 800
      ],
    })

    const result = await runBackfill({ storage, bucket: 'flyers_ig_test' })

    expect(result).toEqual({
      originales: 3,
      completos: 1,
      aGenerar: 2,
      generados: 0,
      fallidos: 0,
      bytesOriginales: 1000 + 2000 + 1500,
      truncados: 0,
    })
    expect(uploads).toHaveLength(0)
    expect(makeVariants).not.toHaveBeenCalled()
  })
})

describe('runBackfill: con apply', () => {
  it('genera y sube sólo las variantes que faltan (no pisa las que ya están)', async () => {
    const { storage, uploads } = makeFakeStorage({
      cuenta_a: [
        { name: 'p1.jpg', size: 1000 }, // le faltan las dos
        { name: 'p2.jpg', size: 2000 },
        { name: 'p2.w400.webp', size: 50 },
        { name: 'p2.w800.webp', size: 80 }, // completo, no se toca
        { name: 'p3.jpg', size: 1500 },
        { name: 'p3.w400.webp', size: 40 }, // le falta sólo la de 800
      ],
    })

    const result = await runBackfill({ storage, bucket: 'flyers_ig_test', apply: true })

    expect(result.generados).toBe(2)
    expect(result.fallidos).toBe(0)
    expect(result.truncados).toBe(0)

    const paths = uploads.map((u) => u.path).sort()
    expect(paths).toEqual([
      'cuenta_a/p1.w400.webp',
      'cuenta_a/p1.w800.webp',
      'cuenta_a/p3.w800.webp',
    ])
    for (const u of uploads) {
      expect(u.options).toEqual({
        contentType: 'image/webp',
        cacheControl: STORAGE_CACHE_CONTROL,
        upsert: false,
      })
    }
  })

  it('una segunda corrida sobre el mismo bucket (ya al día) no sube nada más', async () => {
    const { storage, uploads } = makeFakeStorage({
      cuenta_a: [
        { name: 'p1.jpg', size: 1000 },
        { name: 'p2.jpg', size: 2000 },
        { name: 'p2.w400.webp', size: 50 },
        { name: 'p2.w800.webp', size: 80 },
      ],
    })

    const primera = await runBackfill({ storage, bucket: 'flyers_ig_test', apply: true })
    expect(primera.generados).toBe(1)
    expect(uploads).toHaveLength(2)

    const segunda = await runBackfill({ storage, bucket: 'flyers_ig_test', apply: true })

    expect(segunda).toEqual({
      originales: 2,
      completos: 2,
      aGenerar: 0,
      generados: 0,
      fallidos: 0,
      bytesOriginales: 1000 + 2000,
      truncados: 0,
    })
    // Nada nuevo se subió en la segunda corrida.
    expect(uploads).toHaveLength(2)
  })
})

describe('runBackfill: limit (QA fijo — Ronda 12)', () => {
  it('limit trunca sólo lo que se genera; originales/completos/aGenerar reflejan todo el alcance', async () => {
    const { storage, uploads } = makeFakeStorage({ cuenta_a: pendientes(10) })

    const result = await runBackfill({ storage, bucket: 'flyers_ig_test', apply: true, limit: 3 })

    expect(result.originales).toBe(10)
    expect(result.completos).toBe(0)
    expect(result.aGenerar).toBe(10)
    expect(result.generados).toBe(3)
    expect(result.truncados).toBe(7)
    expect(result.fallidos).toBe(0)

    // Sólo los primeros 3 (p0, p1, p2) se procesaron: 2 variantes cada uno.
    const paths = uploads.map((u) => u.path).sort()
    expect(paths).toEqual([
      'cuenta_a/p0.w400.webp',
      'cuenta_a/p0.w800.webp',
      'cuenta_a/p1.w400.webp',
      'cuenta_a/p1.w800.webp',
      'cuenta_a/p2.w400.webp',
      'cuenta_a/p2.w800.webp',
    ])
  })

  it('en dry-run (sin apply) el limit no afecta el conteo, que sigue siendo sobre todo el alcance', async () => {
    const { storage, uploads } = makeFakeStorage({ cuenta_a: pendientes(10) })

    const result = await runBackfill({ storage, bucket: 'flyers_ig_test', limit: 3 })

    expect(result.originales).toBe(10)
    expect(result.aGenerar).toBe(10)
    expect(result.generados).toBe(0)
    expect(result.truncados).toBe(7)
    expect(uploads).toHaveLength(0)
  })
})

describe('runBackfill: cuenta', () => {
  it('con `cuenta`, restringe el conteo y la subida a esa cuenta nada más', async () => {
    const { storage, uploads } = makeFakeStorage({
      cuenta_a: pendientes(3),
      cuenta_b: pendientes(2),
    })

    const result = await runBackfill({ storage, bucket: 'flyers_ig_test', apply: true, cuenta: 'cuenta_a' })

    expect(result.originales).toBe(3)
    expect(result.aGenerar).toBe(3)
    expect(result.generados).toBe(3)
    expect(uploads.every((u) => u.path.startsWith('cuenta_a/'))).toBe(true)
    expect(uploads.some((u) => u.path.startsWith('cuenta_b/'))).toBe(false)
  })
})

describe('runBackfill: tamaño máximo (QA fijo — Ronda 12)', () => {
  it('un original más grande que MAX_IMAGE_SIZE se descarta antes de llamar a sharp, cuenta como fallido, y no tira abajo la corrida', async () => {
    const tamañoGrande = INSTAGRAM_ENGINE_CONFIG.MAX_IMAGE_SIZE + 1024
    const { storage, uploads } = makeFakeStorage({
      cuenta_a: [
        { name: 'grande.jpg', size: tamañoGrande },
        { name: 'ok.jpg', size: 2048 },
      ],
    })

    const logs: string[] = []
    const result = await runBackfill({
      storage,
      bucket: 'flyers_ig_test',
      apply: true,
      log: (m) => logs.push(m),
    })

    expect(result.fallidos).toBe(1)
    expect(result.generados).toBe(1)

    // El original chico sí llegó a generar variantes; el grande nunca llamó a
    // makeVariants (sharp no se ejecuta sobre un buffer fuera de tamaño).
    expect(makeVariants).toHaveBeenCalledTimes(1)
    expect(makeVariants.mock.calls[0][0]).toHaveLength(2048)

    expect(uploads.every((u) => u.path.startsWith('cuenta_a/ok'))).toBe(true)

    expect(logs.some((m) => m.includes('FALLÓ') && m.includes('grande.jpg') && m.includes('excede'))).toBe(true)
  })
})
