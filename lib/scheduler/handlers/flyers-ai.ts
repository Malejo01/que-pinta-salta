import { createAdminClient } from '@/lib/supabase/server'
import { processFlyerWithAI } from '@/lib/ai/process-flyer-ai'
import { withRetry } from '../retry'
import type { JobError, JobHandler } from '../types'

/**
 * Cola de lectura de flyers con IA.
 *
 * Lee `instagram_flyers` con `ai_status = 'PENDING'` y llama al parser
 * existente (`processFlyerWithAI`) una vez por flyer. El parser no se toca:
 * él mismo mueve el `ai_status` a PROCESSED / SKIPPED / FAILED, así que un
 * flyer no vuelve a entrar a la cola aunque falle.
 *
 * Lo que aporta esta capa es control de costo: tope de items por corrida y
 * tope de llamadas simultáneas a Gemini.
 */

/** Llamadas a Gemini en paralelo. Acota el pico de cuota y de memoria. */
const CONCURRENCY = 3

async function fetchPendingFlyers(limit: number) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('instagram_flyers')
    .select('id, ig_post_id')
    .eq('ai_status', 'PENDING')
    .eq('status', 'ACTIVE')
    .order('published_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`No se pudo leer la cola de flyers pendientes: ${error.message}`)
  }

  return data ?? []
}

export const flyersAiHandler: JobHandler = async (ctx) => {
  // El fetch de la cola sí se reintenta: es una lectura idempotente y una
  // caída momentánea de Supabase no debería costar un tick entero.
  const fetched = await withRetry(
    () => fetchPendingFlyers(ctx.limit),
    { attempts: 3, baseDelayMs: 500, factor: 2, maxDelayMs: 4_000 },
  )

  if (fetched.error || !fetched.value) {
    throw fetched.error instanceof Error
      ? fetched.error
      : new Error(String(fetched.error))
  }

  const pending = fetched.value

  if (pending.length === 0) {
    return {
      itemsProcessed: 0,
      skipped: true,
      skipReason: 'No hay flyers pendientes de procesar.',
    }
  }

  ctx.log(`Procesando ${pending.length} flyers (tope de la corrida: ${ctx.limit}).`)

  const errors: JobError[] = []
  let processed = 0
  let failed = 0
  let cursor = 0

  // Worker pool: `CONCURRENCY` corredores tomando del mismo cursor. Se evita
  // `Promise.all` sobre el lote entero para no disparar N llamadas a Gemini
  // de golpe cuando la cola viene con arrastre (hoy hay 46 acumulados).
  async function worker() {
    while (cursor < pending.length) {
      const flyer = pending[cursor++]

      try {
        const result = await processFlyerWithAI(flyer.id)

        if (result.success) {
          processed++
        } else {
          failed++
          errors.push({
            scope: `flyer:${flyer.ig_post_id}`,
            message: result.error ?? 'El parser devolvió success=false sin detalle.',
          })
        }
      } catch (err) {
        // Un flyer que explota no puede frenar al resto de la cola.
        failed++
        errors.push({
          scope: `flyer:${flyer.ig_post_id}`,
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, pending.length) }, () => worker()),
  )

  // Cuánto queda en la cola después de esta corrida: es el número que dice
  // si el tope por corrida alcanza para drenar el arrastre o hay que subirlo.
  let remaining: number | null = null
  try {
    const supabase = createAdminClient()
    const { count } = await supabase
      .from('instagram_flyers')
      .select('*', { count: 'exact', head: true })
      .eq('ai_status', 'PENDING')
      .eq('status', 'ACTIVE')
    remaining = count ?? null
  } catch {
    // Es sólo telemetría; si falla, la corrida no se ve afectada.
  }

  ctx.log(`Lote terminado: ${processed} ok, ${failed} con error, ${remaining ?? '?'} en cola.`)

  return {
    itemsProcessed: processed,
    itemsFailed: failed,
    errors,
    details: {
      batchSize: pending.length,
      limit: ctx.limit,
      pendingAfterRun: remaining,
    },
  }
}
