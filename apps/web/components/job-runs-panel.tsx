import { Badge } from "@/components/ui/badge"
import { JOB_LABELS, type JobKey, type JobLastRun, type JobRunRow, type JobRunStatus } from "@/lib/job-runs"
import { formatSaltaDayKey, formatSaltaClock } from "@/lib/date-format"

const STATUS_LABEL: Record<JobRunStatus, string> = {
  RUNNING: "En curso",
  SUCCESS: "OK",
  PARTIAL: "Parcial",
  FAILED: "Falló",
  SKIPPED: "Sin trabajo",
}

const STATUS_VARIANT: Record<JobRunStatus, "default" | "secondary" | "destructive" | "outline"> = {
  RUNNING: "outline",
  SUCCESS: "default",
  PARTIAL: "secondary",
  FAILED: "destructive",
  SKIPPED: "secondary",
}

function when(iso: string | null) {
  return iso ? `${formatSaltaDayKey(iso)} ${formatSaltaClock(iso)}` : "—"
}

function duration(ms: number | null) {
  if (ms === null) return "—"
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}

function label(jobKey: string) {
  return JOB_LABELS[jobKey as JobKey] ?? jobKey
}

function firstError(errors: unknown): string | null {
  return Array.isArray(errors) && errors.length ? String(errors[0]) : null
}

/**
 * Corridas de los procesos programados (tabla job_runs): crons de Vercel y
 * workflows de GitHub Actions. Hora de Salta.
 */
export function JobRunsPanel({ lastRuns, recent, error }: { lastRuns: JobLastRun[]; recent: JobRunRow[]; error: string | null }) {
  const byKey = new Map(lastRuns.map((r) => [r.job_key, r]))
  const jobKeys = Object.keys(JOB_LABELS) as JobKey[]

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Procesos automáticos</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Crons de Vercel y workflows de GitHub Actions. Hora de Salta.
      </p>

      {error && (
        <p className="mb-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          No se pudo leer el historial de corridas: {error}
        </p>
      )}

      <div className="rounded-lg border divide-y">
        {jobKeys.map((key) => {
          const run = byKey.get(key)
          return (
            <div key={key} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <p className="text-sm font-medium">{label(key)}</p>
                <p className="text-xs text-muted-foreground">
                  {run
                    ? `Última: ${when(run.last_started_at)} · ${run.last_trigger_source} · ${duration(run.last_duration_ms)} · ${run.last_items_processed} ok${run.last_items_failed ? `, ${run.last_items_failed} con error` : ""}`
                    : "Sin corridas registradas todavía"}
                </p>
                {run && run.last_ok_started_at !== run.last_started_at && (
                  <p className="text-xs text-muted-foreground">Última sana: {when(run.last_ok_started_at)}</p>
                )}
                {run && firstError(run.last_errors) && (
                  <p className="text-xs text-destructive">{firstError(run.last_errors)}</p>
                )}
              </div>
              {run && <Badge variant={STATUS_VARIANT[run.last_status]}>{STATUS_LABEL[run.last_status]}</Badge>}
            </div>
          )
        })}
      </div>

      {recent.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-muted-foreground">Últimas {recent.length} corridas</summary>
          <div className="mt-2 overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Proceso</th>
                  <th className="px-3 py-2 font-medium">Inicio</th>
                  <th className="px-3 py-2 font-medium">Origen</th>
                  <th className="px-3 py-2 font-medium">Duración</th>
                  <th className="px-3 py-2 font-medium">Ítems</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recent.map((run) => (
                  <tr key={run.id}>
                    <td className="px-3 py-2">{label(run.job_key)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{when(run.started_at)}</td>
                    <td className="px-3 py-2">{run.trigger_source}</td>
                    <td className="px-3 py-2">{duration(run.duration_ms)}</td>
                    <td className="px-3 py-2">{run.items_processed}{run.items_failed ? ` / ${run.items_failed} err` : ""}</td>
                    <td className="px-3 py-2">{STATUS_LABEL[run.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  )
}
