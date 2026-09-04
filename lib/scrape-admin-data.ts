import { createClient } from '@/lib/supabase/server'
import { SCRAPE_SOURCES, type ScrapeSourceConfig, type ScrapeSourceKey } from '@/lib/scraper-config'

export type ScrapeRunStatus = 'RUNNING' | 'SUCCESS' | 'FAILED'

export type ScrapeRunHistoryItem = {
  id: string
  sourceKey: ScrapeSourceKey
  status: ScrapeRunStatus
  startedAt: string
  finishedAt: string | null
  insertedCount: number
  skippedCount: number
  errors: string[]
  message: string | null
}

export type ScrapeSourceDashboardItem = ScrapeSourceConfig & {
  sourceId: string | null
  lastRun: ScrapeRunHistoryItem | null
  runs: ScrapeRunHistoryItem[]
}

export type ScrapeDashboardData = {
  sources: ScrapeSourceDashboardItem[]
  warning: string | null
}

export async function getScrapeDashboardData(): Promise<ScrapeDashboardData> {
  const supabase = await createClient()
  let warning: string | null = null

  let sourceRows: Array<{ id: string; key: ScrapeSourceKey; is_enabled: boolean | null }> = []
  try {
    const { data, error } = await supabase
      .from('scrape_sources')
      .select('id, key, is_enabled')

    if (error) {
      warning = 'Las tablas de historial de scrapers todavía no existen. Aplicá la migración SQL para activar última ejecución e historial.'
    } else {
      sourceRows = (data as Array<{ id: string; key: ScrapeSourceKey; is_enabled: boolean | null }>) ?? []
    }
  } catch {
    warning = 'Las tablas de historial de scrapers todavía no existen. Aplicá la migración SQL para activar última ejecución e historial.'
  }

  let runRows: Array<{
    id: string
    source_key: ScrapeSourceKey
    status: ScrapeRunStatus
    started_at: string
    finished_at: string | null
    inserted_count: number | null
    skipped_count: number | null
    errors: string[] | null
    message: string | null
  }> = []

  try {
    const { data, error } = await supabase
      .from('scrape_runs')
      .select('id, source_key, status, started_at, finished_at, inserted_count, skipped_count, errors, message')
      .order('started_at', { ascending: false })
      .limit(100)

    if (!error) {
      runRows = (data as typeof runRows) ?? []
    }
  } catch {
    // Sin historial todavía.
  }

  const sources: ScrapeSourceDashboardItem[] = SCRAPE_SOURCES.map((source) => {
    const dbSource = sourceRows.find((row) => row.key === source.key)
    const runs = runRows
      .filter((run) => run.source_key === source.key)
      .slice(0, 10)
      .map((run) => ({
        id: run.id,
        sourceKey: run.source_key,
        status: run.status,
        startedAt: run.started_at,
        finishedAt: run.finished_at,
        insertedCount: run.inserted_count ?? 0,
        skippedCount: run.skipped_count ?? 0,
        errors: run.errors ?? [],
        message: run.message,
      }))

    return {
      ...source,
      // El config manda: 'enabled' refleja si la fuente tiene scraper implementado
      // (lo mismo que decide triggerAllScrapes). La fila de scrape_sources se siembra
      // una sola vez y quedaba desincronizada, mostrando fuentes vivas como pendientes.
      enabled: source.enabled,
      sourceId: dbSource?.id ?? null,
      lastRun: runs[0] ?? null,
      runs,
    }
  })

  return { sources, warning }
}
