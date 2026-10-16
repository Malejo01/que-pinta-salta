import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { INSTAGRAM_ENGINE_CONFIG } from '@/lib/instagram-config'
import { flyerVariantUrl, variantPath } from '@/lib/images/variants'

// `makeVariants` (sharp) se mockea: estos tests son sobre la orquestación de
// `copyExternalImage` (qué valida, qué descarga, qué sube), no sobre la
// generación de la imagen en sí (eso lo cubre tests/images/variants.test.ts
// con sharp real). Mismo patrón que tests/images/backfill.test.ts.
const makeVariants = vi.hoisted(() => vi.fn())
vi.mock('@/lib/images/variants-server', () => ({
  makeVariants: (...a: unknown[]) => makeVariants(...a),
}))

import { copyExternalImage, isOwnStorageUrl, validateExternalImageUrl } from '@/lib/images/external'
import type { ExternalImageStorageClient } from '@/lib/images/external'

interface Upload {
  path: string
  body: Buffer
  options: { contentType: string; cacheControl?: string; upsert?: boolean }
}

/** Storage en memoria, sin red ni Supabase real. */
function makeFakeStorage(initialFiles: string[] = []): {
  storage: ExternalImageStorageClient
  uploads: Upload[]
} {
  const files = new Set(initialFiles)
  const uploads: Upload[] = []

  const storage: ExternalImageStorageClient = {
    async list(path, options) {
      const prefix = `${path}/`
      const names = [...files]
        .filter((f) => f.startsWith(prefix))
        .map((f) => f.slice(prefix.length))
      const search = options?.search
      const matched = search ? names.filter((n) => n.startsWith(search)) : names
      return { data: matched.map((name) => ({ name })), error: null }
    },
    async upload(path, body, options) {
      uploads.push({ path, body, options })
      files.add(path)
      return { data: {}, error: null }
    },
    getPublicUrl(path) {
      return {
        data: { publicUrl: `https://proyecto-de-prueba.supabase.co/storage/v1/object/public/flyers_ig/${path}` },
      }
    },
  }

  return { storage, uploads }
}

type FakeResponseInit = {
  status?: number
  contentType?: string | null
  contentLength?: string
  location?: string
  bytes?: Uint8Array
}

function fakeResponse({
  status = 200,
  contentType = 'image/jpeg',
  contentLength,
  location,
  bytes = new Uint8Array([1, 2, 3, 4]),
}: FakeResponseInit = {}) {
  const headers = new Map<string, string>()
  if (contentType !== null) headers.set('content-type', contentType)
  if (contentLength !== undefined) headers.set('content-length', contentLength)
  if (location !== undefined) headers.set('location', location)

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    arrayBuffer: async () => bytes.buffer,
  }
}

beforeEach(() => {
  makeVariants.mockReset()
  makeVariants.mockResolvedValue({
    400: Buffer.from('variante-400'),
    800: Buffer.from('variante-800'),
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('validateExternalImageUrl', () => {
  it('rechaza http:', () => {
    expect(validateExternalImageUrl('http://ejemplo.com/flyer.jpg').ok).toBe(false)
  })

  it('rechaza 127.0.0.1 (loopback)', () => {
    expect(validateExternalImageUrl('https://127.0.0.1/flyer.jpg').ok).toBe(false)
  })

  it('rechaza 10.x (privada)', () => {
    expect(validateExternalImageUrl('https://10.0.0.5/flyer.jpg').ok).toBe(false)
  })

  it('rechaza 172.16-31.x (privada)', () => {
    expect(validateExternalImageUrl('https://172.20.0.5/flyer.jpg').ok).toBe(false)
    expect(validateExternalImageUrl('https://172.15.0.5/flyer.jpg').ok).toBe(true)
    expect(validateExternalImageUrl('https://172.32.0.5/flyer.jpg').ok).toBe(true)
  })

  it('rechaza 192.168.x (privada)', () => {
    expect(validateExternalImageUrl('https://192.168.1.1/flyer.jpg').ok).toBe(false)
  })

  it('rechaza 169.254.x (link-local)', () => {
    expect(validateExternalImageUrl('https://169.254.1.1/flyer.jpg').ok).toBe(false)
  })

  it('rechaza 0.0.0.0 (0/8, llega a la propia loopback en Linux/contenedores)', () => {
    expect(validateExternalImageUrl('https://0.0.0.0/flyer.jpg').ok).toBe(false)
    expect(validateExternalImageUrl('https://0.1.2.3/flyer.jpg').ok).toBe(false)
  })

  // Las 4 formas siguientes son la misma IPv4 (127.0.0.1) escrita distinto:
  // entero decimal de 32 bits, primer octeto en hex, primer octeto en octal,
  // y la forma corta "a.d" (con ceros implícitos en el medio). El parser de
  // `URL` de Node (WHATWG URL) ya las normaliza todas a "127.0.0.1" en el
  // `hostname` — comprobado corriendo este mismo test antes de escribirlo:
  // las 4 quedan cubiertas por el chequeo de 127.0.0.0/8 sin tocar
  // `isIPv4Literal`. Si algún día el parser dejara de normalizar alguna, este
  // test lo detectaría (dejaría de dar `false`).
  it('rechaza las formas codificadas de 127.0.0.1 que el parser de URL normaliza', () => {
    const encoded = [
      'https://2130706433/flyer.jpg', // entero decimal de 32 bits
      'https://0x7f.0.0.1/flyer.jpg', // primer octeto en hexadecimal
      'https://0177.0.0.1/flyer.jpg', // primer octeto en octal
      'https://127.1/flyer.jpg', // forma corta "a.d"
    ]
    for (const url of encoded) {
      const parsed = new URL(url)
      expect(parsed.hostname).toBe('127.0.0.1') // documenta la normalización
      expect(validateExternalImageUrl(url).ok).toBe(false)
    }
  })

  it('rechaza localhost', () => {
    expect(validateExternalImageUrl('https://localhost/flyer.jpg').ok).toBe(false)
    expect(validateExternalImageUrl('https://LOCALHOST/flyer.jpg').ok).toBe(false)
  })

  it('rechaza ::1 y fc00::/7, fe80::/10 (IPv6)', () => {
    expect(validateExternalImageUrl('https://[::1]/flyer.jpg').ok).toBe(false)
    expect(validateExternalImageUrl('https://[fc00::1]/flyer.jpg').ok).toBe(false)
    expect(validateExternalImageUrl('https://[fe80::1]/flyer.jpg').ok).toBe(false)
  })

  it('rechaza las formas comprimidas que empiezan con "::" (antes pasaban como permitidas)', () => {
    // El bug original: se tomaba el primer grupo de texto antes del primer
    // ':' para decidir fc00::/7 y fe80::/10, y si ese grupo era vacío (toda
    // forma que empieza con "::", salvo el "::1" que estaba hardcodeado)
    // se devolvía `false` (permitida). Eso deja pasar un IPv4-mapeado a
    // loopback o a metadata de nube en un host dual-stack.
    //
    // El parser de `URL` además reescribe cualquier IPv4 embebida a
    // hexadecimal antes de que la veamos: `[::ffff:127.0.0.1]` llega aquí
    // como hostname `[::ffff:7f00:1]` (comprobado corriendo este test), no
    // con el punto literal — por eso el arreglo detecta el IPv4 embebido a
    // partir del patrón de bits (`::ffff:0:0/96` o `::/96`), no de un punto
    // en el texto.
    expect(validateExternalImageUrl('https://[::ffff:127.0.0.1]/flyer.jpg').ok).toBe(false)
    expect(validateExternalImageUrl('https://[::ffff:169.254.169.254]/flyer.jpg').ok).toBe(false)
    expect(validateExternalImageUrl('https://[::]/flyer.jpg').ok).toBe(false) // equivalente de 0.0.0.0
  })

  it('acepta una IPv6 pública (para que el arreglo no rechace todo IPv6)', () => {
    expect(validateExternalImageUrl('https://[2001:db8::1]/flyer.jpg').ok).toBe(true)
    // IPv4-mapeada a una IP pública: debe aceptarse igual que la IPv4 sola.
    expect(validateExternalImageUrl('https://[::ffff:8.8.8.8]/flyer.jpg').ok).toBe(true)
  })

  it('acepta un host público https normal', () => {
    expect(validateExternalImageUrl('https://cdn.ejemplo.com/flyer.jpg').ok).toBe(true)
  })

  it('rechaza una URL inválida', () => {
    expect(validateExternalImageUrl('no-es-una-url').ok).toBe(false)
  })
})

describe('isOwnStorageUrl', () => {
  // Sin NEXT_PUBLIC_SUPABASE_URL definida (no se lee ningún .env en los
  // tests), isOwnStorageUrl cae al fallback: exige que el host termine en
  // ".supabase.co". Documentado explícitamente en cada test que depende de
  // esto, para que no se rompa en silencio si algún día se agrega la
  // variable al entorno de test.
  it('reconoce una URL del bucket flyers_ig (de Instagram o de externas/)', () => {
    expect(isOwnStorageUrl('https://x.supabase.co/storage/v1/object/public/flyers_ig/cuenta/post.jpg')).toBe(true)
    expect(isOwnStorageUrl('https://x.supabase.co/storage/v1/object/public/flyers_ig/externas/abc123.jpg')).toBe(true)
  })

  it('no reconoce una URL de otro bucket o de un tercero', () => {
    expect(isOwnStorageUrl('https://x.supabase.co/storage/v1/object/public/otro-bucket/a.jpg')).toBe(false)
    expect(isOwnStorageUrl('https://ticketera.com/flyer.jpg')).toBe(false)
    expect(isOwnStorageUrl(null)).toBe(false)
    expect(isOwnStorageUrl(undefined)).toBe(false)
  })

  // Arreglo de seguridad (vuelta 1, 31-a): antes era un `url.includes()` de
  // texto libre sobre la URL completa, así que la subcadena del bucket en
  // cualquier parte del texto (path de un host ajeno, query string,
  // fragmento) daba `true`. `image_url` sale del HTML de la ticketera —
  // texto de un tercero — y un `true` falso desactivaba la copia a Storage
  // en run-scrape-job.ts y la guarda que protege una imagen propia en
  // merge-events.ts. Ahora se parsea con `new URL()` y se decide sobre
  // `hostname` + `pathname`, nunca sobre el texto entero.
  it('host ajeno con el path del bucket propio: no alcanza con el path, el host no es nuestro', () => {
    expect(
      isOwnStorageUrl('https://sitio-malo.com/storage/v1/object/public/flyers_ig/x.jpg')
    ).toBe(false)
  })

  it('la subcadena del bucket en el query string o el fragmento no cuenta: sólo importa el pathname real', () => {
    expect(
      isOwnStorageUrl('https://sitio-malo.com/x.jpg?u=/storage/v1/object/public/flyers_ig/a.jpg')
    ).toBe(false)
    expect(
      isOwnStorageUrl('https://sitio-malo.com/x.jpg#/storage/v1/object/public/flyers_ig/a.jpg')
    ).toBe(false)
  })

  it('credenciales en la autoridad (usuario@host): el host real es el que está después de la @', () => {
    // `new URL()` interpreta "x.supabase.co" como userinfo, no como host:
    // el hostname real es "sitio-malo.com".
    expect(
      isOwnStorageUrl('https://x.supabase.co@sitio-malo.com/storage/v1/object/public/flyers_ig/a.jpg')
    ).toBe(false)
  })

  it('un hostname que sólo termina parecido (subdominio de un tercero) no matchea', () => {
    expect(
      isOwnStorageUrl('https://x.supabase.co.sitio-malo.com/storage/v1/object/public/flyers_ig/a.jpg')
    ).toBe(false)
  })

  it('una URL que no parsea da false, nunca true', () => {
    expect(isOwnStorageUrl('no-es-una-url')).toBe(false)
  })

  describe('con NEXT_PUBLIC_SUPABASE_URL definida: exige el host exacto, no sólo terminar en .supabase.co', () => {
    const ENV = process.env.NEXT_PUBLIC_SUPABASE_URL

    beforeEach(() => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyecto-de-prueba.supabase.co'
    })

    afterEach(() => {
      if (ENV === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
      else process.env.NEXT_PUBLIC_SUPABASE_URL = ENV
    })

    it('el host exacto de nuestro proyecto sigue dando true', () => {
      expect(
        isOwnStorageUrl('https://proyecto-de-prueba.supabase.co/storage/v1/object/public/flyers_ig/externas/a.jpg')
      ).toBe(true)
    })

    it('otro proyecto de Supabase (termina en .supabase.co, pero no es el nuestro) da false', () => {
      expect(
        isOwnStorageUrl('https://otro-proyecto.supabase.co/storage/v1/object/public/flyers_ig/externas/a.jpg')
      ).toBe(false)
    })
  })
})

describe('copyExternalImage: rechazos sin red', () => {
  it('URL http: no llega a llamar fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { storage } = makeFakeStorage()

    const result = await copyExternalImage('http://ejemplo.com/flyer.jpg', storage)

    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('127.0.0.1 no llega a llamar fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { storage } = makeFakeStorage()

    const result = await copyExternalImage('https://127.0.0.1/flyer.jpg', storage)

    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('10.0.0.5 no llega a llamar fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { storage } = makeFakeStorage()

    const result = await copyExternalImage('https://10.0.0.5/flyer.jpg', storage)

    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('169.254.1.1 no llega a llamar fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { storage } = makeFakeStorage()

    const result = await copyExternalImage('https://169.254.1.1/flyer.jpg', storage)

    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('localhost no llega a llamar fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { storage } = makeFakeStorage()

    const result = await copyExternalImage('https://localhost/flyer.jpg', storage)

    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('copyExternalImage: validaciones de la respuesta', () => {
  it('Content-Type que no es imagen: devuelve null y no sube nada', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse({ contentType: 'text/html' })))
    const { storage, uploads } = makeFakeStorage()

    const result = await copyExternalImage('https://ticketera.ejemplo.com/flyer.jpg', storage)

    expect(result).toBeNull()
    expect(uploads).toHaveLength(0)
  })

  it('Content-Length por encima del máximo de Instagram: devuelve null y no sube nada', async () => {
    const tooLarge = String(INSTAGRAM_ENGINE_CONFIG.MAX_IMAGE_SIZE + 1)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse({ contentLength: tooLarge })))
    const { storage, uploads } = makeFakeStorage()

    const result = await copyExternalImage('https://ticketera.ejemplo.com/flyer.jpg', storage)

    expect(result).toBeNull()
    expect(uploads).toHaveLength(0)
  })

  it('el buffer descargado por encima del máximo (sin Content-Length confiable): devuelve null', async () => {
    const bytes = new Uint8Array(INSTAGRAM_ENGINE_CONFIG.MAX_IMAGE_SIZE + 1)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse({ bytes })))
    const { storage, uploads } = makeFakeStorage()

    const result = await copyExternalImage('https://ticketera.ejemplo.com/flyer-grande.jpg', storage)

    expect(result).toBeNull()
    expect(uploads).toHaveLength(0)
  })

  it('HTTP 404: devuelve null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse({ status: 404, contentType: null })))
    const { storage, uploads } = makeFakeStorage()

    const result = await copyExternalImage('https://ticketera.ejemplo.com/no-existe.jpg', storage)

    expect(result).toBeNull()
    expect(uploads).toHaveLength(0)
  })

  it('error de red: devuelve null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')))
    const { storage, uploads } = makeFakeStorage()

    const result = await copyExternalImage('https://ticketera.ejemplo.com/flyer.jpg', storage)

    expect(result).toBeNull()
    expect(uploads).toHaveLength(0)
  })

  it('una redirección a un host privado se rechaza (no sigue el salto)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(fakeResponse({ status: 302, contentType: null, location: 'https://127.0.0.1/interno.jpg' }))
    )
    const { storage, uploads } = makeFakeStorage()

    const result = await copyExternalImage('https://ticketera.ejemplo.com/flyer.jpg', storage)

    expect(result).toBeNull()
    expect(uploads).toHaveLength(0)
  })
})

describe('copyExternalImage: copia exitosa e idempotencia', () => {
  it('descarga, sube el original y las variantes de 400/800px', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { storage, uploads } = makeFakeStorage()

    const result = await copyExternalImage('https://ticketera.ejemplo.com/flyer.jpg', storage)

    expect(result).not.toBeNull()
    expect(result).toContain('/storage/v1/object/public/flyers_ig/externas/')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Original + dos variantes.
    expect(uploads).toHaveLength(3)
    const originalUpload = uploads.find((u) => !u.path.includes('.w400.') && !u.path.includes('.w800.'))
    expect(originalUpload?.path).toMatch(/^externas\/[0-9a-f]{40}\.jpg$/)
    expect(originalUpload?.options.contentType).toBe('image/jpeg')

    const variant400 = variantPath(originalUpload!.path, 400)
    const variant800 = variantPath(originalUpload!.path, 800)
    expect(uploads.some((u) => u.path === variant400)).toBe(true)
    expect(uploads.some((u) => u.path === variant800)).toBe(true)
  })

  it('la misma URL produce siempre la misma ruta en externas/', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse()))
    const { storage: storageA, uploads: uploadsA } = makeFakeStorage()
    const { storage: storageB, uploads: uploadsB } = makeFakeStorage()

    await copyExternalImage('https://ticketera.ejemplo.com/el-mismo-flyer.jpg', storageA)
    await copyExternalImage('https://ticketera.ejemplo.com/el-mismo-flyer.jpg', storageB)

    const pathA = uploadsA.find((u) => u.path.startsWith('externas/') && u.path.endsWith('.jpg'))!.path
    const pathB = uploadsB.find((u) => u.path.startsWith('externas/') && u.path.endsWith('.jpg'))!.path
    expect(pathA).toBe(pathB)
  })

  it('si el objeto ya existe, no vuelve a descargar ni a subir', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { storage, uploads } = makeFakeStorage()

    const first = await copyExternalImage('https://ticketera.ejemplo.com/flyer-repetido.jpg', storage)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(uploads).toHaveLength(3)

    const second = await copyExternalImage('https://ticketera.ejemplo.com/flyer-repetido.jpg', storage)

    expect(second).toBe(first)
    // No se llamó a fetch de nuevo ni se subió nada más.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(uploads).toHaveLength(3)
  })

  it('un Content-Type de imagen no soportado (p.ej. SVG) no sube nada', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse({ contentType: 'image/svg+xml' })))
    const { storage, uploads } = makeFakeStorage()

    const result = await copyExternalImage('https://ticketera.ejemplo.com/flyer.svg', storage)

    expect(result).toBeNull()
    expect(uploads).toHaveLength(0)
  })

  it('si falla la subida del original, devuelve null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse()))
    const { storage } = makeFakeStorage()
    const uploadSpy = vi.spyOn(storage, 'upload').mockResolvedValue({ data: null, error: { message: 'boom' } })

    const result = await copyExternalImage('https://ticketera.ejemplo.com/flyer.jpg', storage)

    expect(result).toBeNull()
    expect(uploadSpy).toHaveBeenCalledTimes(1)
  })

  it('si falla una variante, el original igual queda subido y se devuelve su URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse()))
    const { storage } = makeFakeStorage()
    let call = 0
    vi.spyOn(storage, 'upload').mockImplementation(async () => {
      call++
      if (call === 2) return { data: null, error: { message: 'variante rota' } }
      return { data: {}, error: null }
    })

    const result = await copyExternalImage('https://ticketera.ejemplo.com/flyer.jpg', storage)

    expect(result).not.toBeNull()
  })
})

describe('copyExternalImage: lectura incremental del cuerpo y timeout', () => {
  it('sin Content-Length, un cuerpo que supera el máximo se corta sin leerlo entero', async () => {
    const chunkSize = 1024 * 1024 // 1MB
    const totalChunksAvailable = 10 // de sobra para superar el máximo de 5MB
    let reads = 0
    let cancelled = false

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => (name.toLowerCase() === 'content-type' ? 'image/jpeg' : null),
      },
      body: {
        getReader: () => ({
          read: async () => {
            if (cancelled || reads >= totalChunksAvailable) {
              return { done: true, value: undefined }
            }
            reads++
            return { done: false, value: new Uint8Array(chunkSize) }
          },
          cancel: async () => {
            cancelled = true
          },
        }),
      },
    })
    vi.stubGlobal('fetch', fetchMock)
    const { storage, uploads } = makeFakeStorage()

    const result = await copyExternalImage('https://ticketera.ejemplo.com/enorme.jpg', storage)

    expect(result).toBeNull()
    expect(uploads).toHaveLength(0)
    // 5MB de máximo / 1MB por trozo: con 6 trozos (6MB) ya se supera. No
    // debería haber necesitado leer los 10 trozos disponibles para
    // rechazarla (lo que probaría que bufferizó todo antes de medir).
    expect(reads).toBeLessThan(totalChunksAvailable)
    expect(cancelled).toBe(true)
  })

  it('un cuerpo lento se corta por el timeout (abort), no cuelga la descarga', async () => {
    vi.useFakeTimers()
    try {
      const { storage, uploads } = makeFakeStorage()

      const fetchMock = vi.fn((_url: string, init?: { signal?: AbortSignal }) => {
        const signal = init?.signal
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: {
            get: (name: string) => (name.toLowerCase() === 'content-type' ? 'image/jpeg' : null),
          },
          body: {
            // Un cuerpo que nunca termina de llegar: `read()` sólo se resuelve
            // (rechazando) cuando el `AbortSignal` del timeout se dispara —
            // igual que hace un stream real de `fetch` cuando se aborta.
            getReader: () => ({
              read: () =>
                new Promise((_resolve, reject) => {
                  signal?.addEventListener('abort', () => {
                    reject(new Error('The operation was aborted'))
                  })
                }),
              cancel: async () => {},
            }),
          },
        })
      })
      vi.stubGlobal('fetch', fetchMock)

      const resultPromise = copyExternalImage('https://ticketera.ejemplo.com/lento.jpg', storage)

      // Dispara el setTimeout(10_000) sin esperar 10s reales.
      await vi.advanceTimersByTimeAsync(10_000)

      const result = await resultPromise
      expect(result).toBeNull()
      expect(uploads).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('FlyerImage: flyerVariantUrl arma la variante para externas/…', () => {
  const BUCKET = INSTAGRAM_ENGINE_CONFIG.STORAGE_BUCKET
  const publicUrl = (path: string) =>
    `https://proyecto-de-prueba.supabase.co/storage/v1/object/public/${BUCKET}/${path}`

  it('un original .jpg copiado a externas/ tiene variante de 400 y 800px', () => {
    const hash = 'a'.repeat(40)
    const url = publicUrl(`externas/${hash}.jpg`)

    expect(flyerVariantUrl(url, 400)).toBe(publicUrl(`externas/${hash}.w400.webp`))
    expect(flyerVariantUrl(url, 800)).toBe(publicUrl(`externas/${hash}.w800.webp`))
  })

  it('un original .png copiado a externas/ no tiene variante: FlyerImage cae al original', () => {
    const hash = 'b'.repeat(40)
    const url = publicUrl(`externas/${hash}.png`)

    // Mismo comportamiento que ya cubre variants.test.ts para penas/*.webp:
    // sin variante, flyerVariantUrl devuelve la URL sin tocar.
    expect(flyerVariantUrl(url, 400)).toBe(url)
  })
})
