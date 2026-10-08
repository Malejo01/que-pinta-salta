/**
 * Backfill de variantes WebP (400/800px) para los flyers de Instagram que ya
 * están en el bucket (subidos antes de que la ingesta generara variantes).
 *
 * El cliente de Storage se recibe por parámetro (no se crea acá) para poder
 * testear con un fake en memoria, sin red ni Supabase real. El runner real
 * (`scripts/imagenes-variantes.ts`) le pasa un adaptador fino sobre
 * `supabase.storage.from(bucket)`.
 */

import { VARIANT_WIDTHS, variantPath, type VariantWidth } from './variants'
import { makeVariants } from './variants-server'
import { INSTAGRAM_ENGINE_CONFIG } from '@/lib/instagram-config'

/** Subconjunto de `FileObject` de `@supabase/storage-js` que usa el backfill. */
export interface StorageListItem {
  name: string
  /** `null` en las "carpetas" (prefijos) que devuelve `list()`. */
  id?: string | null
  metadata?: { size?: number } | null
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
    options: { contentType: string; upsert: boolean }
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

  const topLevel = await listAll(storage, '')
  const cuentas = topLevel
    .filter((item) => item.id === null || item.id === undefined)
    .map((item) => item.name)
    .filter((name) => !cuenta || name === cuenta)

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
