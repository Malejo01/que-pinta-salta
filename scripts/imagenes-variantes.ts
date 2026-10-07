/**
 * Backfill de variantes WebP (400/800px) para los flyers de Instagram que ya
 * están subidos sin ellas (QPS-004 §5). Escribe en el Storage de producción:
 * lo corre Mauro de día. Correrlo antes de mergear la Ronda 12.
 *
 *   npx tsx scripts/imagenes-variantes.ts                    # dry-run, todo el bucket
 *   npx tsx scripts/imagenes-variantes.ts --apply --limit 20 # aplica, sólo 20 originales
 *   npx tsx scripts/imagenes-variantes.ts --apply            # aplica, todo lo que falte
 *
 * Por defecto es dry-run: no descarga ni sube nada, sólo cuenta. `--apply`
 * escribe; `--limit N` lo acota a N originales; `--cuenta usuario` lo acota
 * a una sola cuenta (carpeta del bucket).
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { INSTAGRAM_ENGINE_CONFIG } from '../lib/instagram-config'
import { runBackfill, type BackfillStorageClient } from '../lib/images/backfill'

/**
 * Carga .env.local sin dependencias, igual que scripts/dedup-events.ts. Sólo
 * completa lo que no esté ya en el entorno, para que las variables de CI o
 * del shell tengan precedencia. No se imprime ningún valor cargado.
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

  // Soporta también `--limit 20` (con espacio), como en el ejemplo del
  // comentario de cabecera.
  const idx = process.argv.indexOf(`--${name}`)
  if (idx !== -1 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('--')) {
    return process.argv[idx + 1]
  }
  return undefined
}

async function main() {
  console.log('[imagenes-variantes] DRY-RUN por defecto: sin --apply no se escribe nada en Storage.')

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
  const cuenta = getOption('cuenta')

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const bucket = INSTAGRAM_ENGINE_CONFIG.STORAGE_BUCKET
  const client = supabase.storage.from(bucket)

  // Adaptador fino sobre el cliente real de Storage: runBackfill recibe una
  // interfaz mínima (BackfillStorageClient) para poder testearse con un fake
  // en memoria sin red ni Supabase real.
  const storage: BackfillStorageClient = {
    list: (path, options) => client.list(path, options),
    download: async (path) => {
      const { data, error } = await client.download(path)
      return { data, error }
    },
    upload: (path, body, options) => client.upload(path, body, options),
  }

  const result = await runBackfill({
    storage,
    bucket,
    apply,
    limit,
    cuenta,
    log: (message) => console.log(message),
  })

  console.log(
    `[imagenes-variantes] originales=${result.originales} completos=${result.completos} ` +
      `a-generar=${result.aGenerar} generados=${result.generados} fallidos=${result.fallidos} ` +
      `truncados=${result.truncados} bytes-originales=${result.bytesOriginales}`
  )

  if (!apply) {
    console.log('[imagenes-variantes] DRY-RUN: no se escribió nada. Agregá --apply para aplicar.')
  }

  process.exit(result.fallidos > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error('[imagenes-variantes] Falló:', error)
  process.exit(1)
})
