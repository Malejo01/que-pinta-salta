"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, CheckCircle2, Clock3, History, Loader2, Play, RefreshCw } from "lucide-react"
import { triggerAllScrapes, triggerSourceScrape, type ScrapeResult, type TriggerAllScrapesResult } from "@/lib/scraper-actions"
import type { ScrapeSourceKey } from "@/lib/scraper-config"
import type { ScrapeSourceDashboardItem } from "@/lib/scrape-admin-data"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface ScrapeManagerProps {
  sources: ScrapeSourceDashboardItem[]
  warning?: string | null
}

function formatRunTimestamp(value: string | null) {
  if (!value) return "Nunca ejecutado"

  const formatted = new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Argentina/Salta",
  }).format(new Date(value))

  return formatted.replace(/\u00a0/g, " ")
}

function getStatusBadge(lastRun: ScrapeSourceDashboardItem["lastRun"]) {
  if (!lastRun) {
    return <Badge variant="outline">Sin historial</Badge>
  }

  if (lastRun.status === "SUCCESS") {
    return <Badge className="bg-green-600 text-white hover:bg-green-600">Correcto</Badge>
  }

  if (lastRun.status === "RUNNING") {
    return <Badge className="bg-amber-500 text-white hover:bg-amber-500">En curso</Badge>
  }

  return <Badge variant="destructive">Falló</Badge>
}

export function ScrapeManager({ sources, warning }: ScrapeManagerProps) {
  const router = useRouter()
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const [runningAll, setRunningAll] = useState(false)
  const [resultsByKey, setResultsByKey] = useState<Record<string, ScrapeResult>>({})
  const [allResult, setAllResult] = useState<TriggerAllScrapesResult | null>(null)

  const enabledCount = sources.filter((source) => source.enabled).length

  async function handleSourceScrape(sourceKey: ScrapeSourceKey) {
    setLoadingKey(sourceKey)
    setAllResult(null)

    try {
      const result = await triggerSourceScrape(sourceKey)
      setResultsByKey((current) => ({ ...current, [sourceKey]: result }))
      router.refresh()
    } catch (e: any) {
      setResultsByKey((current) => ({
        ...current,
        [sourceKey]: {
          success: false,
          sourceKey,
          sourceName: sourceKey,
          inserted: 0,
          skipped: 0,
          errors: [e?.message ?? "Error inesperado"],
          message: "Error inesperado",
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        },
      }))
    } finally {
      setLoadingKey(null)
    }
  }

  async function handleRunAll() {
    setRunningAll(true)
    setAllResult(null)

    try {
      const result = await triggerAllScrapes()
      setAllResult(result)
      setResultsByKey((current) => {
        const next = { ...current }
        for (const item of result.results) {
          next[item.sourceKey] = item
        }
        return next
      })
      router.refresh()
    } finally {
      setRunningAll(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Scrapers de Eventos
              <Badge variant="outline">{enabledCount} activos</Badge>
            </CardTitle>
            <CardDescription>
              Ejecuta una fuente puntual o lanza una actualización secuencial de todas las fuentes activas.
            </CardDescription>
          </div>
          <Button onClick={handleRunAll} disabled={runningAll || loadingKey !== null} size="lg">
            {runningAll ? (
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Actualizando todo...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <RefreshCw className="size-4" />
                Actualizar todo
              </span>
            )}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {warning && (
            <Alert>
              <AlertCircle className="size-4" />
              <AlertDescription>{warning}</AlertDescription>
            </Alert>
          )}

          {allResult && (
            <Alert variant={allResult.success ? "default" : "destructive"}>
              <AlertDescription className="space-y-2">
                <p className="font-medium">{allResult.message}</p>
                <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                  {allResult.results.map((result) => (
                    <span key={result.sourceKey}>
                      {result.sourceName}: {result.success ? "ok" : "error"}
                    </span>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {sources.map((source) => {
          const liveResult = resultsByKey[source.key]
          const lastRun = source.lastRun
          const isRunningThis = loadingKey === source.key

          return (
            <Card key={source.key}>
              <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-xl">{source.name}</CardTitle>
                    {source.enabled ? <Badge variant="outline">Activo</Badge> : <Badge variant="secondary">Pendiente</Badge>}
                    {getStatusBadge(lastRun)}
                  </div>
                  <CardDescription>{source.description}</CardDescription>
                  <p className="text-sm text-muted-foreground">
                    Último scrape: {formatRunTimestamp(lastRun?.startedAt ?? null)}
                  </p>
                </div>

                <Button
                  onClick={() => handleSourceScrape(source.key)}
                  disabled={!source.enabled || runningAll || loadingKey !== null}
                >
                  {isRunningThis ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" />
                      Ejecutando...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Play className="size-4" />
                      Scrapear {source.name}
                    </span>
                  )}
                </Button>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                  <a href={source.siteUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                    Ir al sitio fuente
                  </a>
                  {lastRun && (
                    <span>
                      Insertados: {lastRun.insertedCount} · Omitidos: {lastRun.skippedCount}
                    </span>
                  )}
                </div>

                {liveResult && (
                  <Alert variant={liveResult.success ? "default" : "destructive"}>
                    <AlertDescription className="space-y-2">
                      <p className="font-medium">{liveResult.message}</p>
                      <p className="text-sm text-muted-foreground">
                        Inicio: {formatRunTimestamp(liveResult.startedAt)} · Fin: {formatRunTimestamp(liveResult.finishedAt)}
                      </p>
                      {liveResult.errors.length > 0 && (
                        <ul className="list-disc space-y-1 pl-5 text-sm">
                          {liveResult.errors.map((error, index) => (
                            <li key={`${liveResult.sourceKey}-${index}`}>{error}</li>
                          ))}
                        </ul>
                      )}
                    </AlertDescription>
                  </Alert>
                )}

                <div className="rounded-lg border">
                  <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-medium">
                    <History className="size-4" />
                    Historial reciente
                  </div>
                  <div className="divide-y">
                    {source.runs.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-muted-foreground">
                        Todavía no hay ejecuciones registradas para esta fuente.
                      </div>
                    ) : (
                      source.runs.map((run) => (
                        <div key={run.id} className="px-4 py-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {run.status === "SUCCESS" ? (
                                <CheckCircle2 className="size-4 text-green-600" />
                              ) : run.status === "FAILED" ? (
                                <AlertCircle className="size-4 text-destructive" />
                              ) : (
                                <Clock3 className="size-4 text-amber-500" />
                              )}
                              <span>{formatRunTimestamp(run.startedAt)}</span>
                            </div>
                            <span className="text-muted-foreground">
                              {run.insertedCount} insertados · {run.skippedCount} omitidos
                            </span>
                          </div>
                          {run.message && <p className="mt-1 text-muted-foreground">{run.message}</p>}
                          {run.errors.length > 0 && (
                            <ul className="mt-2 list-disc space-y-1 pl-5 text-destructive">
                              {run.errors.map((error, index) => (
                                <li key={`${run.id}-${index}`}>{error}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
