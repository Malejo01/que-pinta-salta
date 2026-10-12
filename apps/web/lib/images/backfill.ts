/**
 * Backfill de variantes WebP (400/800px) para los flyers de Instagram que ya
 * están en el bucket (subidos antes de que la ingesta generara variantes).
 *
 * El cliente de Storage se recibe por parámetro (no se crea acá) para poder
 * testear con un fake en memoria, sin red ni Supabase real. El runner real
 * (`scripts/imagenes-variantes.ts`) le pasa un adaptador fino sobre
 * `supabase.storage.from(bucket)`.
 */

import { STORAGE_CACHE_CONTROL, VARIANT_WIDTHS, variantPath, type VariantWidth } from './variants'
import { makeVariants } from './variants-server'
import { INSTAGRAM_ENGINE_CONFIG } from '@/lib/instagram-config'

/** Subconjunto de `FileObject` de `@supabase/storage-js` que usa el backfill. */
export interface StorageListItem {
  name: string
  /** `null` en las "carpetas" (prefijos) que devuelve `list()`. */
  id?: string | null
  metadata?: {
    size?: number
    /**
     * El `Cache-Control` con el que está subido hoy el objeto, si la API de
     * Storage lo expone en el listado (no está documentado; ver el reporte
     * de la Ronda 18). Cuando está presente, `runRecache` lo usa para
     * saltear lo que ya tiene el año de caché; cuando no, trata todo como
     * pendiente y lo aclara en el conteo.
     */
    cacheControl?: string
  } | null
}

export interface StorageDownloadResult {
  data: Blob | null
  error: { message: string } | null
}

export interface StorageListResult {
  data: StorageListItem[] | null
  error: { message: string } | null
}

export interface StorageUploadResult {
  data: unknown
  error: { message: string } | null
}

/**
 * Subconjunto de la API de Storage que necesita el backfill, ya acotado a un
 * bucket (equivalente a `supabase.storage.from(bucket)`).
 */
export interface BackfillStorageClient {
  list(path: string, options?: { limit?: number; offset?: number }): Promise<StorageListResult>
  download(path: string): Promise<StorageDownloadResult>
  upload(
    path: string,
    body: Buffer,
    options: { contentType: string; upsert: boolean; cacheControl?: string }
  ): Promise<StorageUploadResult>
}

export interface RunBackfillOptions {
  storage: BackfillStorageClient
  bucket: string
  /** Por defecto `false`: sólo cuenta, no descarga ni sube nada. */
  apply?: boolean
  /** Tope de originales a procesar en esta corrida (generación acotada). */
  limit?: number
  /** Restringe el backfill a una sola cuenta (carpeta del bucket). */
  cuenta?: string
  log?: (message: string) => void
}

export interface RunBackfillResult {
  /** Originales `.jpg` encontrados en todo el alcance (bucket, o la cuenta si se pasó `cuenta`). Nunca se trunca por `limit`. */
  originales: number
  /** Originales que ya tenían las dos variantes, de todo el alcance. */
  completos: number
  /** Originales a los que les falta al menos una variante, de todo el alcance (no truncado por `limit`). */
  aGenerar: number
  /** Originales a los que, con `apply`, se les generaron y subieron las variantes faltantes (acotado por `limit`). */
  generados: number
  /** Originales en los que la descarga, la generación o la subida fallaron (acotado por `limit`). */
  fallidos: number
  /** Bytes totales de los originales contados en `originales`, de todo el alcance. */
  bytesOriginales: number
  /** Cuántos de los `aGenerar` quedaron sin procesar en esta corrida por el `limit`. */
  truncados: number
}

const LIST_PAGE_SIZE = 100
const DOWNLOAD_CONCURRENCY = 3

async function listAll(storage: BackfillStorageClient, path: string): Promise<StorageListItem[]> {
  const items: StorageListItem[] = []
  let offset = 0

  while (true) {
    const { data, error } = await storage.list(path, { limit: LIST_PAGE_SIZE, offset })
    if (error) {
      throw new Error(`Error listando "${path || '/'}" (offset ${offset}): ${error.message}`)
    }
    if (!data || data.length === 0) break

    items.push(...data)
    if (data.length < LIST_PAGE_SIZE) break
    offset += LIST_PAGE_SIZE
  }

  return items
}

function variantSuffix(width: VariantWidth): string {
  return `.w${width}.webp`
}

/**
 * Carpetas de primer nivel del bucket: una por cuenta de Instagram, más
 * `externas/` (flyers que no vienen de Instagram, Ronda 18-b). `list('')`
 * las devuelve como "archivos" con `id: null`. Si se pasa `cuenta`, la
 * restringe a esa sola carpeta (sea una cuenta o `externas`).
 */
async function listFolders(storage: BackfillStorageClient, cuenta?: string): Promise<string[]> {
  const topLevel = await listAll(storage, '')
  return topLevel
    .filter((item) => item.id === null || item.id === undefined)
    .map((item) => item.name)
    .filter((name) => !cuenta || name === cuenta)
}

interface PendingOriginal {
  path: string
  size: number
  faltantes: VariantWidth[]
}

/**
 * Agrupa los archivos de una cuenta: cada original `a.jpg` con el set de
 * variantes (`a.w400.webp`, `a.w800.webp`) que ya tenga subidas.
 */
function groupAccountFiles(
  username: string,
  files: StorageListItem[]
): { originals: Map<string, StorageListItem>; variantsByOriginal: Map<string, Set<VariantWidth>> } {
  const originals = new Map<string, StorageListItem>()
  const variantsByOriginal = new Map<string, Set<VariantWidth>>()

  for (const file of files) {
    if (file.name.endsWith('.jpg')) {
      const path = `${username}/${file.name}`
      originals.set(path, file)
    }
  }

  for (const file of files) {
    for (const width of VARIANT_WIDTHS) {
      const suffix = variantSuffix(width)
      if (!file.name.endsWith(suffix)) continue

      const baseName = `${file.name.slice(0, -suffix.length)}.jpg`
      const originalPath = `${username}/${baseName}`
      if (!originals.has(originalPath)) continue

      const set = variantsByOriginal.get(originalPath) ?? new Set<VariantWidth>()
      set.add(width)
      variantsByOriginal.set(originalPath, set)
    }
  }

  return { originals, variantsByOriginal }
}

/**
 * Lista el bucket (paginado: primero las carpetas por cuenta, después los
 * archivos de cada cuenta), agrupa originales `.jpg` con sus variantes, y —
 * si `apply` — baja cada original pendiente, genera sólo las variantes que
 * le faltan y las sube con `upsert: false` (no pisa lo que ya esté), con
 * concurrencia 3.
 *
 * Es idempotente: una corrida siguiente vuelve a listar el bucket, así que
 * las variantes ya subidas no se vuelven a pedir ni a subir.
 */
export async function runBackfill(options: RunBackfillOptions): Promise<RunBackfillResult> {
  const { storage, bucket, apply = false, limit, cuenta, log = () => {} } = options

  const result: RunBackfillResult = {
    originales: 0,
    completos: 0,
    aGenerar: 0,
    generados: 0,
    fallidos: 0,
    bytesOriginales: 0,
    truncados: 0,
  }

  const cuentas = await listFolders(storage, cuenta)

  // El conteo (originales/completos/aGenerar/bytesOriginales) es siempre
  // sobre todo el alcance (bucket completo, o la cuenta si se pasó
  // `cuenta`): el dry-run tiene que poder leerse como un número real, sin
  // que `limit` lo deje corto. `limit` sólo recorta cuántos de los
  // pendientes se procesan (abajo).
  const pendientes: PendingOriginal[] = []

  for (const username of cuentas) {
    const files = await listAll(storage, username)
    const { originals, variantsByOriginal } = groupAccountFiles(username, files)

    for (const [path, original] of originals) {
      result.originales++
      result.bytesOriginales += original.metadata?.size ?? 0

      const presentes = variantsByOriginal.get(path) ?? new Set<VariantWidth>()
      const faltantes = VARIANT_WIDTHS.filter((width) => !presentes.has(width))

      if (faltantes.length === 0) {
        result.completos++
        continue
      }

      result.aGenerar++
      pendientes.push({ path, size: original.metadata?.size ?? 0, faltantes })
    }
  }

  const aProcesar = limit ? pendientes.slice(0, limit) : pendientes
  result.truncados = pendientes.length - aProcesar.length

  log(
    `[backfill] bucket=${bucket}${cuenta ? ` cuenta=${cuenta}` : ''} originales=${result.originales} completos=${result.completos} a-generar=${result.aGenerar}` +
      (limit ? ` (esta corrida procesa ${aProcesar.length}, quedan ${result.truncados} para otra)` : '') +
      (apply ? '' : ' (dry-run, no se escribe nada)')
  )

  if (!apply || aProcesar.length === 0) {
    return result
  }

  let nextIndex = 0

  async function worker() {
    while (true) {
      const i = nextIndex
      nextIndex++
      if (i >= aProcesar.length) return

      const { path, faltantes } = aProcesar[i]
      try {
        const { data, error } = await storage.download(path)
        if (error || !data) {
          throw new Error(error?.message ?? 'descarga vacía')
        }

        const arrayBuffer = await data.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        // La ingesta chequea MAX_IMAGE_SIZE antes de pasarle el buffer a
        // sharp; todo lo que ya está en el bucket pasó por ese chequeo al
        // subirse, pero el backfill no debe asumirlo (asimetría barata de
        // cerrar: un original corrupto o reemplazado a mano no debería
        // llegar a sharp sin control de tamaño).
        if (buffer.length > INSTAGRAM_ENGINE_CONFIG.MAX_IMAGE_SIZE) {
          throw new Error(
            `excede ${INSTAGRAM_ENGINE_CONFIG.MAX_IMAGE_SIZE / 1024 / 1024}MB (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`
          )
        }

        const variants = await makeVariants(buffer)

        for (const width of faltantes) {
          const destPath = variantPath(path, width)
          if (!destPath) continue

          const { error: uploadError } = await storage.upload(destPath, variants[width], {
            contentType: 'image/webp',
            cacheControl: STORAGE_CACHE_CONTROL,
            upsert: false,
          })

          if (uploadError) {
            throw new Error(`subiendo ${destPath}: ${uploadError.message}`)
          }
        }

        result.generados++
        log(`[backfill] generado ${path} (${faltantes.join(', ')}px)`)
      } catch (err) {
        result.fallidos++
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[backfill] FALLÓ ${path}: ${message}`)
        log(`[backfill] FALLÓ ${path}: ${message}`)
      }
    }
  }

  const workerCount = Math.min(DOWNLOAD_CONCURRENCY, aProcesar.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  return result
}

export interface RunRecacheOptions {
  storage: BackfillStorageClient
  bucket: string
  /** Por defecto `false`: sólo cuenta, no descarga ni sube nada. */
  apply?: boolean
  /** Tope de objetos a procesar en esta corrida. */
  limit?: number
  /** Restringe el recache a una sola carpeta del bucket (cuenta, o `externas`). */
  cuenta?: string
  log?: (message: string) => void
}

export interface RunRecacheResult {
  /** Originales `.jpg` y variantes `.w400/800.webp` que ya existen en todo el alcance (incluye `externas/`). Nunca se trunca por `limit`. */
  objetos: number
  /** De esos, cuántos ya tenían el `Cache-Control` de un año (según la metadata del listado) y se saltearon sin tocarlos. */
  yaCacheados: number
  /** Objetos a los que les falta (o no se pudo confirmar) el `Cache-Control` de un año, de todo el alcance (no truncado por `limit`). */
  aRecachear: number
  /** Con `apply`, cuántos se bajaron y volvieron a subir en esta corrida (acotado por `limit`). */
  recacheados: number
  /** Objetos en los que la descarga o la subida fallaron (acotado por `limit`). */
  fallidos: number
  /** Bytes totales de los `aRecachear` (lo que esta corrida tocaría), de todo el alcance. */
  bytes: number
  /** Cuántos de los `aRecachear` quedaron sin procesar en esta corrida por el `limit`. */
  truncados: number
  /**
   * Si al menos un objeto del alcance trajo `cacheControl` en la metadata
   * del listado. Si queda en `false`, la API de Storage no lo expuso para
   * ninguno: `yaCacheados` es siempre 0 y todo se trata como pendiente,
   * aunque ya tenga el año de caché puesto por una corrida anterior.
   */
  metadataCacheControlDisponible: boolean
}

interface CacheTarget {
  path: string
  size: number
}

/**
 * De los archivos de una carpeta (cuenta o `externas`), los que son
 * originales `.jpg` o variantes `.w400/800.webp` que ya existen — sin
 * importar si están emparejados (a diferencia del backfill, acá no importa
 * si al original le falta una variante: sólo nos interesa re-cachear lo que
 * ya está subido).
 */
function collectCacheCandidates(username: string, files: StorageListItem[]): StorageListItem[] {
  return files.filter(
    (file) => file.name.endsWith('.jpg') || VARIANT_WIDTHS.some((width) => file.name.endsWith(variantSuffix(width)))
  ).map((file) => ({ ...file, name: `${username}/${file.name}` }))
}

/**
 * Compara el `Cache-Control` reportado por el listado (`"max-age=31536000"`
 * o, por si la API lo devolviera ya sin el prefijo, `"31536000"`) contra el
 * valor objetivo, en segundos.
 */
function isCachedFor(raw: string, seconds: string): boolean {
  const match = raw.match(/(\d+)/)
  return (match ? match[1] : raw) === seconds
}

function contentTypeForPath(path: string): string {
  return path.endsWith('.jpg') ? 'image/jpeg' : 'image/webp'
}

/**
 * Recorre el bucket igual que el backfill (misma lista de carpetas,
 * `externas/` incluida) y, para cada original `.jpg` y cada variante que ya
 * existe, la baja y la vuelve a subir con `upsert: true` y
 * `STORAGE_CACHE_CONTROL` — no genera nada nuevo, sólo corrige el
 * `Cache-Control` de lo que ya está. Si el listado de Storage expone el
 * `cacheControl` actual en la metadata, se saltean los objetos que ya tienen
 * el año puesto (y se cuentan en `yaCacheados`); si no lo expone para
 * ninguno, `metadataCacheControlDisponible` queda en `false` y todo se trata
 * como pendiente.
 *
 * Es idempotente: una corrida siguiente, si la API expone `cacheControl`,
 * ve que ya están al año y no los vuelve a tocar.
 */
export async function runRecache(options: RunRecacheOptions): Promise<RunRecacheResult> {
  const { storage, bucket, apply = false, limit, cuenta, log = () => {} } = options

  const result: RunRecacheResult = {
    objetos: 0,
    yaCacheados: 0,
    aRecachear: 0,
    recacheados: 0,
    fallidos: 0,
    bytes: 0,
    truncados: 0,
    metadataCacheControlDisponible: false,
  }

  const carpetas = await listFolders(storage, cuenta)

  // Igual que en el backfill: el conteo es siempre sobre todo el alcance;
  // `limit` sólo recorta cuántos pendientes se procesan.
  const pendientes: CacheTarget[] = []

  for (const username of carpetas) {
    const files = await listAll(storage, username)
    const candidatos = collectCacheCandidates(username, files)

    for (const file of candidatos) {
      result.objetos++

      const cacheControl = file.metadata?.cacheControl
      if (cacheControl !== undefined) {
        result.metadataCacheControlDisponible = true
        if (isCachedFor(cacheControl, STORAGE_CACHE_CONTROL)) {
          result.yaCacheados++
          continue
        }
      }

      result.aRecachear++
      const size = file.metadata?.size ?? 0
      result.bytes += size
      pendientes.push({ path: file.name, size })
    }
  }

  const aProcesar = limit ? pendientes.slice(0, limit) : pendientes
  result.truncados = pendientes.length - aProcesar.length

  log(
    `[recache] bucket=${bucket}${cuenta ? ` cuenta=${cuenta}` : ''} objetos=${result.objetos} ya-cacheados=${result.yaCacheados} a-recachear=${result.aRecachear} bytes=${result.bytes}` +
      (limit ? ` (esta corrida procesa ${aProcesar.length}, quedan ${result.truncados} para otra)` : '') +
      (apply ? '' : ' (dry-run, no se escribe nada)') +
      (result.metadataCacheControlDisponible
        ? ''
        : ' (el listado de Storage no trajo cache-control: no se puede confirmar cuáles ya están al día, se tratan todos como pendientes)')
  )

  if (!apply || aProcesar.length === 0) {
    return result
  }

  let nextIndex = 0

  async function worker() {
    while (true) {
      const i = nextIndex
      nextIndex++
      if (i >= aProcesar.length) return

      const { path } = aProcesar[i]
      try {
        const { data, error } = await storage.download(path)
        if (error || !data) {
          throw new Error(error?.message ?? 'descarga vacía')
        }

        const arrayBuffer = await data.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        const { error: uploadError } = await storage.upload(path, buffer, {
          contentType: contentTypeForPath(path),
          cacheControl: STORAGE_CACHE_CONTROL,
          upsert: true,
        })

        if (uploadError) {
          throw new Error(`subiendo ${path}: ${uploadError.message}`)
        }

        result.recacheados++
        log(`[recache] re-subido ${path}`)
      } catch (err) {
        result.fallidos++
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[recache] FALLÓ ${path}: ${message}`)
        log(`[recache] FALLÓ ${path}: ${message}`)
      }
    }
  }

  const workerCount = Math.min(DOWNLOAD_CONCURRENCY, aProcesar.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  return result
}
