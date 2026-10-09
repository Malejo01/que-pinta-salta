/**
 * Backfill de las imágenes externas ya guardadas en `events.image_url` y
 * `cinema_movies.poster_url` (Ronda 18-b): las copia al bucket `flyers_ig`
 * (`externas/<sha1 de la URL>.<ext>`, vía `copyExternalImage`) y actualiza la
 * fila para que apunte a Storage en vez de al sitio del tercero.
 *
 * Escribe en el Storage de producción: lo corre Mauro de día, siempre
 * primero en conteo (sin `--apply`). De noche no se ejecuta.
 *
 *   npx tsx scripts/imagenes-externas.ts                    # conteo, no toca nada
 *   npx tsx scripts/imagenes-externas.ts --apply --limit 20  # copia y actualiza, sólo 20 filas
 *   npx tsx scripts/imagenes-externas.ts --apply              # copia y actualiza todo lo pendiente
 *
 * Por defecto es conteo: cuántas filas tienen imagen externa, cuántas URLs
 * distintas y de qué hosts. Sin `--apply` no descarga, no sube ni actualiza
 * nada. `--apply` copia y actualiza; `--limit N` acota cuántas filas procesa
 * esta corrida; la copia va con concurrencia 3.
 *
 * Es idempotente: `copyExternalImage` no vuelve a copiar una URL cuyo hash
 * ya está en `externas/` (sin importar la extensión), y varias filas con la
 * misma URL comparten una sola copia dentro de esta misma corrida. Al final,
 * si a algún original de `externas/` le faltan las variantes de 400/800px
 * (de esta corrida o de una anterior), se generan con `runBackfill`
 * (`lib/images/backfill.ts`, sin cambios: ya trata `externas/` como una
 * carpeta más del bucket).
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { INSTAGRAM_ENGINE_CONFIG } from '../lib/instagram-config'
import { copyExternalImage, isOwnStorageUrl, EXTERNAL_IMAGES_FOLDER, type ExternalImageStorageClient } from '../lib/images/external'
import { runBackfill, type BackfillStorageClient } from '../lib/images/backfill'

/**
 * Carga .env.local sin dependencias, igual que scripts/imagenes-variantes.ts
 * (y scripts/dedup-events.ts). Sólo completa lo que no esté ya en el
 * entorno, para que las variables de CI o del shell tengan precedencia. No
 * se imprime ningún valor cargado.
 */
function loadEnvLocal() {
  for (const file of ['.env.local', '.env']) {
    let raw: string
    try {
      raw = readFileSync(resolve(process.cwd(), file), 'utf8')
    } catch {
      continue
    }

    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i)
      if (!match) continue
      const [, key, rawValue] = match
      if (process.env[key] !== undefined) continue
      process.env[key] = rawValue.trim().replace(/^["']|["']$/g, '')
    }
  }
}

function getFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

function getOption(name: string): string | undefined {
  const prefix = `--${name}=`
  const inline = process.argv.find((arg) => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)

  const idx = process.argv.indexOf(`--${name}`)
  if (idx !== -1 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('--')) {
    return process.argv[idx + 1]
  }
  return undefined
}

type Target = {
  table: 'events' | 'cinema_movies'
  id: string
  column: 'image_url' | 'poster_url'
  url: string
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return '(url inválida)'
  }
}

function sameHost(url: string, ownHost: string): boolean {
  try {
    return new URL(url).host === ownHost
  } catch {
    return false
  }
}

async function main() {
  console.log('[imagenes-externas] CONTEO por defecto: sin --apply no se copia ni se actualiza nada.')
  console.log('[imagenes-externas] Escribe en el Storage de producción con --apply: lo corre Mauro de día.')

  loadEnvLocal()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.\n' +
        'Definilas en .env.local o exportalas antes de correr el script.'
    )
    process.exit(1)
  }

  const apply = getFlag('apply')
  const limitOption = getOption('limit')
  const limit = limitOption ? Number(limitOption) : undefined

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const bucket = INSTAGRAM_ENGINE_CONFIG.STORAGE_BUCKET
  const client = supabase.storage.from(bucket)

  // Adaptador fino sobre el cliente real de Storage: satisface tanto
  // ExternalImageStorageClient (copyExternalImage) como BackfillStorageClient
  // (runBackfill), igual que hace scripts/imagenes-variantes.ts.
  const storage: ExternalImageStorageClient & BackfillStorageClient = {
    list: (path, options) => client.list(path, options),
    download: async (path) => {
      const { data, error } = await client.download(path)
      return { data, error }
    },
    upload: (path, body, options) => client.upload(path, body, options),
    getPublicUrl: (path) => client.getPublicUrl(path),
  }

  const ownHost = new URL(url).host

  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('id, image_url')
    .not('image_url', 'is', null)
  if (eventsError) {
    console.error(`[imagenes-externas] Error consultando events: ${eventsError.message}`)
    process.exit(1)
  }

  const { data: movies, error: moviesError } = await supabase
    .from('cinema_movies')
    .select('id, poster_url')
    .not('poster_url', 'is', null)
  if (moviesError) {
    console.error(`[imagenes-externas] Error consultando cinema_movies: ${moviesError.message}`)
    process.exit(1)
  }

  const targets: Target[] = []
  for (const row of events ?? []) {
    const value = row.image_url as string | null
    if (value && !isOwnStorageUrl(value) && !sameHost(value, ownHost)) {
      targets.push({ table: 'events', id: row.id as string, column: 'image_url', url: value })
    }
  }
  for (const row of movies ?? []) {
    const value = row.poster_url as string | null
    if (value && !isOwnStorageUrl(value) && !sameHost(value, ownHost)) {
      targets.push({ table: 'cinema_movies', id: row.id as string, column: 'poster_url', url: value })
    }
  }

  const eventsCount = targets.filter((t) => t.table === 'events').length
  const moviesCount = targets.filter((t) => t.table === 'cinema_movies').length
  const distinctUrls = new Set(targets.map((t) => t.url))

  const hostCounts = new Map<string, number>()
  for (const t of targets) {
    const host = hostOf(t.url)
    hostCounts.set(host, (hostCounts.get(host) ?? 0) + 1)
  }

  console.log(
    `[imagenes-externas] filas con imagen externa: ${targets.length} (events=${eventsCount}, cinema_movies=${moviesCount})`
  )
  console.log(`[imagenes-externas] URLs distintas: ${distinctUrls.size}`)
  for (const [host, count] of [...hostCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${host}: ${count}`)
  }

  if (!apply) {
    console.log('[imagenes-externas] CONTEO: no se copió ni se actualizó nada. Agregá --apply para aplicar.')
    process.exit(0)
  }

  const toProcess = limit ? targets.slice(0, limit) : targets
  console.log(`[imagenes-externas] Procesando ${toProcess.length} fila/s (de ${targets.length} pendientes)...`)

  // Varias filas pueden compartir la misma URL externa (el mismo flyer en
  // varias funciones, o el mismo póster reutilizado): se copia una sola vez
  // por URL dentro de esta corrida, el resto espera la misma promesa.
  const urlCache = new Map<string, Promise<string | null>>()
  let updated = 0
  let failed = 0
  let nextIndex = 0

  async function worker() {
    while (true) {
      const i = nextIndex
      nextIndex++
      if (i >= toProcess.length) return

      const target = toProcess[i]
      try {
        let resultPromise = urlCache.get(target.url)
        if (!resultPromise) {
          resultPromise = copyExternalImage(target.url, storage)
          urlCache.set(target.url, resultPromise)
        }
        const storageUrl = await resultPromise

        if (!storageUrl) {
          failed++
          console.warn(`[imagenes-externas] FALLÓ ${target.table}.${target.id}: no se pudo copiar ${target.url}`)
          continue
        }

        const { error } = await supabase
          .from(target.table)
          .update({ [target.column]: storageUrl })
          .eq('id', target.id)

        if (error) {
          failed++
          console.error(`[imagenes-externas] FALLÓ actualizando ${target.table}.${target.id}: ${error.message}`)
        } else {
          updated++
        }
      } catch (err) {
        failed++
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[imagenes-externas] Excepción en ${target.table}.${target.id}: ${message}`)
      }
    }
  }

  const CONCURRENCY = 3
  const workerCount = Math.min(CONCURRENCY, toProcess.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  console.log(`[imagenes-externas] filas actualizadas=${updated} fallidas=${failed}`)

  // Completa las variantes que falten en externas/: tanto las de lo que se
  // acaba de copiar arriba (ya debería tenerlas) como las de cualquier
  // original .jpg que hubiera quedado sin generar de una corrida anterior.
  const backfillResult = await runBackfill({
    storage,
    bucket,
    apply: true,
    cuenta: EXTERNAL_IMAGES_FOLDER,
    log: (message) => console.log(message),
  })
  console.log(
    `[imagenes-externas] variantes en ${EXTERNAL_IMAGES_FOLDER}/: originales=${backfillResult.originales} ` +
      `completos=${backfillResult.completos} generados=${backfillResult.generados} fallidos=${backfillResult.fallidos}`
  )

  process.exit(failed > 0 || backfillResult.fallidos > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error('[imagenes-externas] Falló:', error)
  process.exit(1)
})
