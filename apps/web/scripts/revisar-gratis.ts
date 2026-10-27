/**
 * Revisión de `is_free` de los eventos ya cargados, Ronda 68-b.
 *
 * Marca como gratis (`is_free = true`) los eventos publicados y futuros que hoy figuran como no gratis, con precio 0 o
 * sin precio, y cuyo texto (título, descripciones, caption original del flyer) tiene evidencia clara de
 * entrada gratuita según `@qps/core/events/gratis`. Con `--aplicar` escribe en la base de PRODUCCIÓN: lo
 * corre Mauro de día, nunca programado (ver `tests/events/revisar-gratis.test.ts`). De noche no se
 * ejecuta.
 *
 *   npx tsx scripts/revisar-gratis.ts             # dry-run: solo lee e imprime el reporte; NO escribe
 *   npx tsx scripts/revisar-gratis.ts --aplicar   # además actualiza los eventos del reporte
 *
 * Se corre desde `apps/web`. Variables de entorno (en `.env.local` o exportadas; nunca se imprimen):
 * NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
 *
 * El update lleva la guarda `.eq('is_free', false)` y otra por el precio leído (`.is('price_min', null)` o
 * `.eq('price_min', 0)`): si alguien tocó el evento mientras corría, no se pisa.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { armarReporte, limpiarParaImprimir, type FilaRevisarGratis } from '../lib/events/revisar-gratis'
import { traerTodasLasFilas } from '../lib/images/paginar-filas'

/**
 * Carga .env.local sin dependencias, igual que scripts/geocodificar-lugares.ts. Sólo completa lo que no
 * esté ya en el entorno. No se imprime ningún valor cargado.
 */
function loadEnvLocal() {
  for (const file of ['.env.local', '.env']) {
    let raw: string
    try {
      raw = readFileSync(join(process.cwd(), file), 'utf8')
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

async function main() {
  loadEnvLocal()

  const args = process.argv.slice(2)
  const desconocidos = args.filter((a) => a !== '--aplicar')
  if (desconocidos.length > 0) {
    console.error(`[revisar-gratis] Opción desconocida: ${desconocidos.join(' ')}. Solo existe --aplicar.`)
    process.exit(1)
    return
  }
  const aplicar = args.includes('--aplicar')

  console.log(
    aplicar
      ? '[revisar-gratis] APLICAR: actualiza is_free en eventos de producción.'
      : '[revisar-gratis] DRY-RUN: no se escribe nada en la base.'
  )

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    const faltantes = [
      !supabaseUrl ? 'NEXT_PUBLIC_SUPABASE_URL' : null,
      !supabaseKey ? 'SUPABASE_SERVICE_ROLE_KEY' : null,
    ].filter((v): v is string => v !== null)
    console.error(
      `[revisar-gratis] Faltan las variables de entorno: ${faltantes.join(', ')}.\n` +
        'Definilas en .env.local o exportalas antes de correr el script.'
    )
    process.exit(1)
    return
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
  const ahora = new Date()

  let filas: FilaRevisarGratis[]
  try {
    filas = await traerTodasLasFilas<FilaRevisarGratis>((desde, hasta) =>
      supabase
        .from('events')
        .select(
          'id, title, slug, description, short_description, start_date, price_min, is_free, status, scrape_source_key, ai_metadata'
        )
        // Solo publicados (como geocodificar-lugares): los borradores los revisa el admin al publicar.
        .eq('status', 'PUBLISHED')
        .eq('is_free', false)
        .or('price_min.is.null,price_min.eq.0')
        .gte('start_date', ahora.toISOString())
        .order('id')
        .range(desde, hasta)
    )
  } catch (error) {
    console.error(`[revisar-gratis] Error consultando eventos: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
    return
  }

  const { cambios, descartados, resumen } = armarReporte(filas, ahora)
  const l = limpiarParaImprimir

  console.log(`[revisar-gratis] eventos leídos (publicados, futuros, is_free = false, precio 0 o sin precio): ${filas.length}`)
  console.log('[revisar-gratis] resumen:', JSON.stringify(resumen, null, 2))
  console.log(`[revisar-gratis] cambiarían a gratis: ${cambios.length}`)
  for (const c of cambios) {
    console.log(`  ${c.id}\t${l(c.slug) || '-'}\t${c.fecha}\t${l(c.fuente)}\t"${l(c.titulo)}"\t"${l(c.frase)}"`)
  }
  console.log(`[revisar-gratis] con frase de gratuidad pero descartados por una condición (para auditar): ${descartados.length}`)
  for (const d of descartados) {
    console.log(`  ${d.id}\t${l(d.slug) || '-'}\t${l(d.condicion)}\t"${l(d.frase)}"`)
  }

  if (!aplicar) {
    console.log('[revisar-gratis] DRY-RUN: no se escribió nada. Con --aplicar se actualizan los de arriba.')
    return
  }

  let actualizados = 0
  let errores = 0
  for (const c of cambios) {
    // Guarda contra carrera: además de is_free = false, el precio tiene que seguir como se leyó.
    const { data, error } =
      c.price_min === null
        ? await supabase
            .from('events')
            .update({ is_free: true, price_min: 0 })
            .eq('id', c.id)
            .eq('is_free', false)
            .is('price_min', null)
            .select('id')
        : await supabase
            .from('events')
            .update({ is_free: true })
            .eq('id', c.id)
            .eq('is_free', false)
            .eq('price_min', 0)
            .select('id')
    if (error) {
      errores += 1
      console.error(`[revisar-gratis] No se pudo actualizar ${c.id}: ${error.message}`)
    } else if ((data?.length ?? 0) > 0) {
      actualizados += 1
    }
  }
  console.log(
    `[revisar-gratis] actualizados: ${actualizados}, errores: ${errores}, sin cambio (ya no estaban en is_free = false): ${
      cambios.length - actualizados - errores
    }`
  )
  if (errores > 0) process.exit(2)
}

main().catch((error) => {
  console.error('[revisar-gratis] Falló:', error)
  process.exit(1)
})
