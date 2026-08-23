/**
 * Limpieza retroactiva de eventos duplicados, desde la línea de comandos.
 *
 *   npm run dedup:events                          # dry-run, de hoy en adelante
 *   npm run dedup:events -- --include-past        # dry-run, todo el histórico
 *   npm run dedup:events -- --from=2026-09-01     # dry-run acotado
 *   npm run dedup:events -- --json                # reporte en JSON
 *   npm run dedup:events -- --apply               # ejecuta las fusiones
 *
 * Sin --apply no escribe absolutamente nada: imprime qué fusionaría y cuántas
 * fusiones son. Correrlo primero en dry-run no es una recomendación, es el
 * flujo: --apply borra filas.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runDedupCleanup, formatReport } from '../lib/scraper/dedup-cleanup'

/**
 * Carga .env.local sin dependencias. `next dev` lo hace solo, pero este script
 * corre por fuera de Next (tsx). Sólo completa lo que no esté ya en el entorno,
 * para que las variables de CI o del shell tengan precedencia.
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
  const found = process.argv.find((arg) => arg.startsWith(prefix))
  return found ? found.slice(prefix.length) : undefined
}

async function main() {
  loadEnvLocal()

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Definilas en .env.local o exportalas antes de correr el script.'
    )
    process.exit(1)
  }

  const apply = getFlag('apply')
  const maxGroups = getOption('max-groups')

  const report = await runDedupCleanup({
    dryRun: !apply,
    from: getOption('from'),
    to: getOption('to'),
    includePast: getFlag('include-past'),
    maxGroups: maxGroups ? Number(maxGroups) : undefined,
  })

  if (getFlag('json')) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(formatReport(report))
  }

  process.exit(report.errors.length > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error('[dedup-events] Falló:', error)
  process.exit(1)
})
