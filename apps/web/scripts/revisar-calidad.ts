/**
 * Q5-8 · Revisión de calidad de los eventos publicados vigentes (desde ayer
 * en adelante): sin imagen, sin categoría, sin lugar, precio dudoso y
 * horario 00:00. Reglas en `@qps/core/events/calidad`; orquestación en
 * `lib/calidad/revision.ts`.
 *
 *   npx tsx scripts/revisar-calidad.ts                    # en seco: solo lee e imprime el reporte; NO escribe
 *   npx tsx scripts/revisar-calidad.ts --aplicar          # escribe las correcciones seguras (gratis con evidencia,
 *                                                         #   lugar por alias exacto, categoría por palabras clave)
 *   npx tsx scripts/revisar-calidad.ts --aplicar --ia     # además clasifica con la IA los que quedaron sin categoría
 *   npx tsx scripts/revisar-calidad.ts --aplicar --ia --tope-ia 5
 *
 * Topes: 200 escrituras y 10 llamadas a la IA por corrida (la IA es paga).
 * Se corre a mano desde `apps/web`, de día; no está programado (lo fija
 * tests/calidad/revision.test.ts). Necesita NEXT_PUBLIC_SUPABASE_URL y
 * SUPABASE_SERVICE_ROLE_KEY (y, solo con --ia, GEMINI_API_KEY o, con
 * IA_PROVEEDOR=claude, ANTHROPIC_API_KEY). No imprime
 * ningún valor de entorno ni datos personales.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { ETIQUETA_REGLA, REGLAS_CALIDAD } from '@qps/core/events/calidad'
import { traerTodasLasFilas } from '../lib/images/paginar-filas'
import {
  COLUMNAS_CALIDAD,
  TOPE_IA_POR_DEFECTO,
  aplicarCorrecciones,
  desdeAyerISO,
  mapaDeAliases,
  revisarEventos,
  type Clasificador,
  type FilaEventoCalidad,
} from '../lib/calidad/revision'

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

function leerOpciones(argv: string[]): { aplicar: boolean; ia: boolean; topeIa: number } {
  let aplicar = false
  let ia = false
  let topeIa = TOPE_IA_POR_DEFECTO
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--aplicar') aplicar = true
    else if (a === '--ia') ia = true
    else if (a === '--tope-ia') {
      const n = Number(argv[++i])
      if (!Number.isInteger(n) || n < 0 || n > 50) throw new Error('--tope-ia va de 0 a 50')
      topeIa = n
    } else throw new Error(`opción desconocida: ${a}`)
  }
  if (ia && !aplicar) throw new Error('--ia solo tiene sentido con --aplicar')
  return { aplicar, ia, topeIa }
}

async function main() {
  loadEnvLocal()
  const opciones = leerOpciones(process.argv.slice(2))
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !clave) throw new Error('faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  const supabase = createClient(url, clave, { auth: { persistSession: false } })

  const desde = desdeAyerISO()
  const [filas, aliases, categorias] = await Promise.all([
    traerTodasLasFilas<FilaEventoCalidad>((d, h) =>
      supabase.from('events').select(COLUMNAS_CALIDAD).eq('status', 'PUBLISHED').gte('start_date', desde).order('id').range(d, h),
    ),
    traerTodasLasFilas<{ alias: string; alias_normalized: string | null; venue_id: string }>((d, h) =>
      supabase.from('venue_aliases').select('alias, alias_normalized, venue_id').order('id').range(d, h),
    ),
    supabase.from('categories').select('id, slug'),
  ])

  const resultado = revisarEventos(filas, mapaDeAliases(aliases))
  console.log(`[calidad] ${resultado.revisados} eventos publicados vigentes revisados`)
  console.table(
    REGLAS_CALIDAD.map((r) => ({ regla: ETIQUETA_REGLA[r], casos: resultado.conteo[r].total, automaticos: resultado.conteo[r].automaticos })),
  )
  const porId = new Map(filas.map((f) => [f.id, f]))
  console.table(
    resultado.hallazgos.slice(0, 60).map((h) => ({
      regla: h.regla,
      evento: porId.get(h.eventoId)?.slug ?? h.eventoId,
      propuesta: h.propuesta.tipo,
      detalle: 'motivo' in h.propuesta ? h.propuesta.motivo : 'frase' in h.propuesta ? h.propuesta.frase : 'slug' in h.propuesta ? h.propuesta.slug : '',
    })),
  )

  if (!opciones.aplicar) {
    console.log('[calidad] en seco: no se escribió nada. Con --aplicar se escriben las correcciones seguras.')
    return
  }

  let clasificar: Clasificador | undefined
  // Q6-3: por la capa de IA (Gemini por defecto; IA_PROVEEDOR=claude para Claude),
  // registrada en ia_llamadas como `clasificacion`.
  if (opciones.ia) {
    const { generarJsonDeTexto } = await import('../lib/ai/llamadas-ia')
    const { ErrorIA } = await import('../lib/ia/tipos')
    const slugs = (categorias.data ?? []).map((c) => c.slug as string)
    clasificar = async (titulo, descripcion) => {
      let r: { slug?: unknown }
      try {
        r = (await generarJsonDeTexto(
          'Clasificás eventos culturales de Salta (Argentina) en UNA categoría de la lista. Respondé solo el slug.',
          `Título: ${titulo}\nDescripción: ${descripcion}`,
          { type: 'object', properties: { slug: { type: 'string', enum: slugs } }, required: ['slug'] },
          { uso: 'clasificacion', maxTokens: 256 },
        )) as { slug?: unknown }
      } catch (error) {
        // Un slug fuera de la lista se salteaba en silencio antes de Q6-3: sigue igual.
        if (error instanceof ErrorIA && error.codigo === 'respuesta_invalida') return null
        throw error
      }
      return typeof r.slug === 'string' && slugs.includes(r.slug) ? r.slug : null
    }
  }

  const resumen = await aplicarCorrecciones(supabase, resultado.hallazgos, {
    categorias: new Map((categorias.data ?? []).map((c) => [c.slug as string, c.id as string])),
    clasificar,
    topeIa: opciones.topeIa,
    filas: porId,
  })
  console.log('[calidad] aplicado', resumen)
}

main().catch((error) => {
  console.error('[calidad] falló:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
