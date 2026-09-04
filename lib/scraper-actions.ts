"use server"

import { createClient } from "@/lib/supabase/server"
import { getScrapeSourceConfig, SCRAPE_SOURCES, type ScrapeSourceKey } from "@/lib/scraper-config"
import { revalidatePath } from "next/cache"

export type ScrapeResult = {
  success: boolean
  /** La fuente no tiene scraper implementado: no se ejecutó, no es un fallo. */
  pending?: boolean
  sourceKey: ScrapeSourceKey
  sourceName: string
  inserted: number
  skipped: number
  errors: string[]
  message: string
  startedAt: string
  finishedAt: string
}

export type TriggerAllScrapesResult = {
  success: boolean
  message: string
  successful: number
  failed: number
  pending: number
  results: ScrapeResult[]
}

async function ensureAdmin() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { supabase, user: null, error: 'No autenticado' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'ADMIN') {
    return { supabase, user: null, error: 'Sin permisos de administrador' }
  }

  return { supabase, user, error: null }
}

async function ensureSourceRow(supabase: Awaited<ReturnType<typeof createClient>>, sourceKey: ScrapeSourceKey) {
  const source = getScrapeSourceConfig(sourceKey)
  if (!source) return null

  try {
    const { data: existing } = await supabase
      .from('scrape_sources')
      .select('id')
      .eq('key', source.key)
      .single()

    if (existing?.id) {
      return existing.id as string
    }

    const { data: created } = await supabase
      .from('scrape_sources')
      .insert({
        key: source.key,
        name: source.name,
        description: source.description,
        site_url: source.siteUrl,
        is_enabled: source.enabled,
      })
      .select('id')
      .single()

    return (created?.id as string | undefined) ?? null
  } catch {
    return null
  }
}

async function startRun(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sourceId: string | null,
  sourceKey: ScrapeSourceKey,
  userId: string | undefined,
  startedAt: string,
) {
  try {
    const { data } = await supabase
      .from('scrape_runs')
      .insert({
        source_id: sourceId,
        source_key: sourceKey,
        status: 'RUNNING',
        started_at: startedAt,
        triggered_by: userId ?? null,
      })
      .select('id')
      .single()

    return (data?.id as string | undefined) ?? null
  } catch {
    return null
  }
}

async function finishRun(
  supabase: Awaited<ReturnType<typeof createClient>>,
  runId: string | null,
  result: ScrapeResult,
) {
  if (!runId) return

  try {
    await supabase
      .from('scrape_runs')
      .update({
        status: result.success ? 'SUCCESS' : 'FAILED',
        finished_at: result.finishedAt,
        inserted_count: result.inserted,
        skipped_count: result.skipped,
        errors: result.errors,
        message: result.message,
      })
      .eq('id', runId)
  } catch {
    // Historial opcional hasta que exista la migración.
  }
}

async function executeSourceScrape(sourceKey: ScrapeSourceKey): Promise<Omit<ScrapeResult, 'startedAt' | 'finishedAt'>> {
  switch (sourceKey) {
    case 'norteticket': {
      const { scrapeNorteticketSalta } = await import('@/lib/scraper/norteticket-scraper')
      const { saveEventsToSupabase } = await import('@/lib/scraper/save-to-supabase')

      const events = await scrapeNorteticketSalta()
      const result = await saveEventsToSupabase(events as any, 'norteticket')

      return {
        success: true,
        sourceKey,
        sourceName: getScrapeSourceConfig(sourceKey)?.name ?? sourceKey,
        inserted: result.inserted,
        skipped: result.skipped,
        errors: result.errors,
        message: `Scrape completado: ${result.inserted} eventos nuevos, ${result.skipped} ya existían.`,
      }
    }
    case 'vamos': {
      const { scrapeVamosGobAr } = await import('@/lib/scraper/vamos-scraper')

      const result = await scrapeVamosGobAr()

      return {
        success: true,
        sourceKey,
        sourceName: getScrapeSourceConfig(sourceKey)?.name ?? sourceKey,
        inserted: result.inserted,
        skipped: result.skipped,
        errors: result.errors,
        message: `Scrape completado: ${result.inserted} eventos nuevos, ${result.skipped} ya existían.`,
      }
    }
    case 'entradauno': {
      const { scrapeEntradaUno } = await import('@/lib/scraper/entradauno-scraper')

      const result = await scrapeEntradaUno()

      return {
        success: true,
        sourceKey,
        sourceName: getScrapeSourceConfig(sourceKey)?.name ?? sourceKey,
        inserted: result.inserted,
        skipped: result.skipped,
        errors: result.errors,
        message: `Scrape completado: ${result.inserted} eventos nuevos, ${result.skipped} ya existían.`,
      }
    }
    case 'alpogo': {
      const { scrapeAlpogoSalta } = await import('@/lib/scraper/alpogo-scraper')

      const result = await scrapeAlpogoSalta()

      return {
        success: true,
        sourceKey,
        sourceName: getScrapeSourceConfig(sourceKey)?.name ?? sourceKey,
        inserted: result.inserted,
        skipped: result.skipped,
        errors: result.errors,
        message: `Scrape completado: ${result.inserted} eventos nuevos, ${result.skipped} ya existían.`,
      }
    }
    case 'instagram': {
      const { triggerApifyInstagramScraper } = await import('@/lib/instagram/process-apify-payload')

      const result = await triggerApifyInstagramScraper()

      return {
        success: result.success,
        sourceKey,
        sourceName: getScrapeSourceConfig(sourceKey)?.name ?? sourceKey,
        inserted: result.inserted,
        skipped: result.skipped,
        errors: result.errors,
        message: result.message,
      }
    }
    default: {
      return {
        success: false,
        sourceKey,
        sourceName: getScrapeSourceConfig(sourceKey)?.name ?? sourceKey,
        inserted: 0,
        skipped: 0,
        errors: ['Fuente todavía no implementada.'],
        message: 'Fuente todavía no implementada.',
      }
    }
  }
}

export async function triggerSourceScrape(sourceKey: ScrapeSourceKey): Promise<ScrapeResult> {
  const source = getScrapeSourceConfig(sourceKey)
  const startedAt = new Date().toISOString()

  if (!source) {
    return {
      success: false,
      sourceKey,
      sourceName: sourceKey,
      inserted: 0,
      skipped: 0,
      errors: ['Fuente inexistente.'],
      message: 'Fuente inexistente.',
      startedAt,
      finishedAt: new Date().toISOString(),
    }
  }

  const { supabase, user, error } = await ensureAdmin()
  if (error) {
    return {
      success: false,
      sourceKey,
      sourceName: source.name,
      inserted: 0,
      skipped: 0,
      errors: [],
      message: error,
      startedAt,
      finishedAt: new Date().toISOString(),
    }
  }

  const sourceId = await ensureSourceRow(supabase, sourceKey)
  const runId = await startRun(supabase, sourceId, sourceKey, user?.id, startedAt)

  try {
    const baseResult = await executeSourceScrape(sourceKey)
    const result: ScrapeResult = {
      ...baseResult,
      startedAt,
      finishedAt: new Date().toISOString(),
    }

    await finishRun(supabase, runId, result)
    revalidatePath('/')
    revalidatePath('/admin')
    revalidatePath('/admin/scrape')
    return result
  } catch (e: any) {
    const result: ScrapeResult = {
      success: false,
      sourceKey,
      sourceName: source.name,
      inserted: 0,
      skipped: 0,
      errors: [e?.message ?? 'Error desconocido'],
      message: 'Error durante el scrape',
      startedAt,
      finishedAt: new Date().toISOString(),
    }

    await finishRun(supabase, runId, result)
    revalidatePath('/admin/scrape')
    return result
  }
}

export async function triggerAllScrapes(): Promise<TriggerAllScrapesResult> {
  const results: ScrapeResult[] = []

  for (const source of SCRAPE_SOURCES) {
    if (!source.enabled) {
      results.push({
        success: false,
        pending: true,
        sourceKey: source.key,
        sourceName: source.name,
        inserted: 0,
        skipped: 0,
        errors: ['Fuente pendiente de implementación.'],
        message: 'Pendiente de implementación.',
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      })
      continue
    }

    const result = await triggerSourceScrape(source.key)
    results.push(result)
  }

  const successful = results.filter((result) => result.success).length
  const pending = results.filter((result) => result.pending).length
  const failed = results.length - successful - pending

  // Las fuentes sin implementar no son un fallo: si se contaran como error, una caída
  // real de un scraper vivo quedaría escondida detrás del mismo mensaje de siempre.
  const parts = [
    `${successful} ${successful === 1 ? 'fuente correcta' : 'fuentes correctas'}`,
    `${failed} con error`,
  ]
  if (pending > 0) {
    parts.push(`${pending} pendientes de implementación`)
  }

  return {
    success: failed === 0,
    message: `Actualización completa: ${parts.join(', ')}.`,
    successful,
    failed,
    pending,
    results,
  }
}

export async function triggerScrape(): Promise<ScrapeResult> {
  return triggerSourceScrape('norteticket')
}
