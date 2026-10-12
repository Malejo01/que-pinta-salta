import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_CACHE_CONTROL } from '@/lib/images/variants'
import { runRecache, type BackfillStorageClient, type StorageListItem } from '@/lib/images/backfill'

interface FakeFile {
  name: string
  size: number
  /** `undefined` si la carpeta/API no expone cache-control en el listado. */
  cacheControl?: string
}

interface Upload {
  path: string
  body: Buffer
  options: { contentType: string; upsert: boolean; cacheControl?: string }
}

/**
 * Storage en memoria, sin red ni Supabase real — igual estilo que
 * `tests/images/backfill.test.ts`, pero exponiendo `cacheControl` en la
 * metadata del listado cuando el fixture lo trae, para poder testear el
 * "salteo" de lo ya cacheado por un año.
 */
function makeFakeStorage(folders: Record<string, FakeFile[]>): {
  storage: BackfillStorageClient
  uploads: Upload[]
} {
  const files = new Map<string, FakeFile[]>(
    Object.entries(folders).map(([name, list]) => [name, [...list]])
  )
  const uploads: Upload[] = []

  const storage: BackfillStorageClient = {
    async list(path, options) {
      const limit = options?.limit ?? Number.POSITIVE_INFINITY
      const offset = options?.offset ?? 0

      let items: StorageListItem[]
      if (path === '') {
        items = [...files.keys()].map((name) => ({ name, id: null }))
      } else {
        items = (files.get(path) ?? []).map((f) => ({
          name: f.name,
          id: 'fake-file-id',
          metadata: {
            size: f.size,
            ...(f.cacheControl !== undefined ? { cacheControl: f.cacheControl } : {}),
          },
        }))
      }

      return { data: items.slice(offset, offset + limit), error: null }
    },

    async download(path) {
      const slash = path.indexOf('/')
      const folder = path.slice(0, slash)
      const name = path.slice(slash + 1)
      const file = (files.get(folder) ?? []).find((f) => f.name === name)
      if (!file) return { data: null, error: { message: `no existe ${path}` } }

      const buffer = Buffer.alloc(file.size, 7)
      return { data: new Blob([buffer]), error: null }
    },

    async upload(path, body, options) {
      uploads.push({ path, body, options })
      const slash = path.indexOf('/')
      const folder = path.slice(0, slash)
      const name = path.slice(slash + 1)
      const list = files.get(folder) ?? []
      const existing = list.find((f) => f.name === name)
      if (existing) {
        existing.size = body.length
        existing.cacheControl = options.cacheControl
      } else {
        list.push({ name, size: body.length, cacheControl: options.cacheControl })
      }
      files.set(folder, list)
      return { data: {}, error: null }
    },
  }

  return { storage, uploads }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('runRecache: dry-run', () => {
  it('no descarga ni sube nada, y cuenta objetos sin distinguir original/variante', async () => {
    const { storage, uploads } = makeFakeStorage({
      cuenta_a: [
        { name: 'p1.jpg', size: 1000 },
        { name: 'p1.w400.webp', size: 50 },
        { name: 'p1.w800.webp', size: 80 },
        { name: 'p2.jpg', size: 2000 },
      ],
    })

    const result = await runRecache({ storage, bucket: 'flyers_ig_test' })

    expect(result).toEqual({
      objetos: 4,
      yaCacheados: 0,
      aRecachear: 4,
      recacheados: 0,
      fallidos: 0,
      bytes: 1000 + 50 + 80 + 2000,
      truncados: 0,
      metadataCacheControlDisponible: false,
    })
    expect(uploads).toHaveLength(0)
  })
})

describe('runRecache: metadata con cache-control', () => {
  it('saltea los objetos que ya tienen el año puesto, y lo refleja en metadataCacheControlDisponible', async () => {
    const { storage, uploads } = makeFakeStorage({
      cuenta_a: [
        { name: 'viejo.jpg', size: 1000, cacheControl: 'max-age=3600' }, // 1h: pendiente
        { name: 'nuevo.jpg', size: 2000, cacheControl: `max-age=${STORAGE_CACHE_CONTROL}` }, // ya al día
      ],
    })

    const result = await runRecache({ storage, bucket: 'flyers_ig_test', apply: true })

    expect(result.objetos).toBe(2)
    expect(result.yaCacheados).toBe(1)
    expect(result.aRecachear).toBe(1)
    expect(result.recacheados).toBe(1)
    expect(result.bytes).toBe(1000)
    expect(result.metadataCacheControlDisponible).toBe(true)

    expect(uploads).toHaveLength(1)
    expect(uploads[0].path).toBe('cuenta_a/viejo.jpg')
  })
})

describe('runRecache: apply', () => {
  it('descarga y vuelve a subir con upsert:true y la constante de cache-control', async () => {
    const { storage, uploads } = makeFakeStorage({
      cuenta_a: [
        { name: 'p1.jpg', size: 1000 },
        { name: 'p1.w400.webp', size: 50 },
      ],
    })

    const result = await runRecache({ storage, bucket: 'flyers_ig_test', apply: true })

    expect(result.recacheados).toBe(2)
    expect(result.fallidos).toBe(0)

    const paths = uploads.map((u) => u.path).sort()
    expect(paths).toEqual(['cuenta_a/p1.jpg', 'cuenta_a/p1.w400.webp'])

    for (const u of uploads) {
      expect(u.options.upsert).toBe(true)
      expect(u.options.cacheControl).toBe(STORAGE_CACHE_CONTROL)
    }
    const jpgUpload = uploads.find((u) => u.path.endsWith('.jpg'))
    const webpUpload = uploads.find((u) => u.path.endsWith('.webp'))
    expect(jpgUpload?.options.contentType).toBe('image/jpeg')
    expect(webpUpload?.options.contentType).toBe('image/webp')
  })

  it('incluye la carpeta externas/ igual que cualquier otra cuenta', async () => {
    const { storage, uploads } = makeFakeStorage({
      cuenta_a: [{ name: 'p1.jpg', size: 1000 }],
      externas: [
        { name: 'flyer1.jpg', size: 500 },
        { name: 'flyer1.w400.webp', size: 30 },
      ],
    })

    const result = await runRecache({ storage, bucket: 'flyers_ig_test', apply: true })

    expect(result.objetos).toBe(3)
    expect(result.recacheados).toBe(3)
    expect(uploads.some((u) => u.path === 'externas/flyer1.jpg')).toBe(true)
    expect(uploads.some((u) => u.path === 'externas/flyer1.w400.webp')).toBe(true)
  })

  it('si la carpeta externas/ todavía está vacía (18-b no subió nada), cuenta 0 ahí', async () => {
    const { storage } = makeFakeStorage({
      cuenta_a: [{ name: 'p1.jpg', size: 1000 }],
      externas: [],
    })

    const result = await runRecache({ storage, bucket: 'flyers_ig_test' })

    expect(result.objetos).toBe(1)
  })
})

describe('runRecache: limit', () => {
  it('limit trunca sólo lo que se procesa; objetos/aRecachear reflejan todo el alcance', async () => {
    const archivos = Array.from({ length: 10 }, (_, i) => ({ name: `p${i}.jpg`, size: 100 + i }))
    const { storage, uploads } = makeFakeStorage({ cuenta_a: archivos })

    const result = await runRecache({ storage, bucket: 'flyers_ig_test', apply: true, limit: 3 })

    expect(result.objetos).toBe(10)
    expect(result.aRecachear).toBe(10)
    expect(result.recacheados).toBe(3)
    expect(result.truncados).toBe(7)
    expect(uploads).toHaveLength(3)
  })

  it('en dry-run el limit no afecta el conteo', async () => {
    const archivos = Array.from({ length: 10 }, (_, i) => ({ name: `p${i}.jpg`, size: 100 + i }))
    const { storage, uploads } = makeFakeStorage({ cuenta_a: archivos })

    const result = await runRecache({ storage, bucket: 'flyers_ig_test', limit: 3 })

    expect(result.objetos).toBe(10)
    expect(result.aRecachear).toBe(10)
    expect(result.recacheados).toBe(0)
    expect(result.truncados).toBe(7)
    expect(uploads).toHaveLength(0)
  })
})

describe('runRecache: cuenta', () => {
  it('con `cuenta`, restringe el conteo y la subida a esa sola carpeta', async () => {
    const { storage, uploads } = makeFakeStorage({
      cuenta_a: [{ name: 'p1.jpg', size: 100 }],
      cuenta_b: [{ name: 'p2.jpg', size: 200 }],
    })

    const result = await runRecache({ storage, bucket: 'flyers_ig_test', apply: true, cuenta: 'cuenta_a' })

    expect(result.objetos).toBe(1)
    expect(uploads).toHaveLength(1)
    expect(uploads[0].path).toBe('cuenta_a/p1.jpg')
  })
})

describe('runRecache: fallos', () => {
  it('un fallo en la descarga se cuenta como fallido y no tira abajo la corrida', async () => {
    const { storage, uploads } = makeFakeStorage({
      cuenta_a: [{ name: 'p1.jpg', size: 100 }],
    })
    // Lo borramos "a mano" del storage en memoria después de listar, para
    // forzar que la descarga falle sin tocar el fixture inicial.
    const originalDownload = storage.download.bind(storage)
    storage.download = async (path: string) => {
      if (path === 'cuenta_a/p1.jpg') return { data: null, error: { message: 'boom' } }
      return originalDownload(path)
    }

    const logs: string[] = []
    const result = await runRecache({
      storage,
      bucket: 'flyers_ig_test',
      apply: true,
      log: (m) => logs.push(m),
    })

    expect(result.fallidos).toBe(1)
    expect(result.recacheados).toBe(0)
    expect(uploads).toHaveLength(0)
    expect(logs.some((m) => m.includes('FALLÓ') && m.includes('p1.jpg'))).toBe(true)
  })
})
