import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Copy, ExternalLink, MapPin, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import {
  canMerge,
  defaultKeeper,
  getDismissedPairs,
  getDuplicateCandidates,
  type DuplicateCandidateEvent,
} from '@/lib/events/duplicate-candidates'
import { formatEventDate, formatEventDayMonth, formatEventTime, formatSaltaDayKey } from '@/lib/date-format'
import { resolveEventSource, describeSource } from '@/lib/scraper/source-priority'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { DuplicatePairActions, RestorePairButton } from '@/components/admin/duplicate-pair-actions'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
  PUBLISHED: 'Publicado',
  DRAFT: 'Borrador',
}

function statusBadgeClass(status: string | null) {
  if (status === 'PUBLISHED') return 'bg-emerald-500/10 text-emerald-600 border-emerald-200'
  if (status === 'DRAFT') return 'bg-amber-500/10 text-amber-600 border-amber-200'
  return 'bg-muted text-muted-foreground border-border'
}

/** "dd/mm" en hora de Salta, para "marcado el dd/mm". */
function dayMonthSlash(iso: string): string {
  const [, month, day] = formatSaltaDayKey(iso).split('-')
  return `${day}/${month}`
}

function EventColumn({ event }: { event: DuplicateCandidateEvent }) {
  return (
    <div className="flex-1 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{event.title}</p>
        <Badge variant="outline" className={`shrink-0 text-xs ${statusBadgeClass(event.status)}`}>
          {STATUS_LABEL[event.status ?? ''] ?? event.status ?? 'Sin estado'}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Fuente: {describeSource(resolveEventSource(event))}
      </p>
      <Link
        href={`/evento/${event.id}`}
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        Ver ficha
        <ExternalLink className="size-3" />
      </Link>
    </div>
  )
}

export default async function AdminDuplicadosPage() {
  const supabase = await createClient()

  // 1. Validar autenticación
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/auth/login?redirect=/admin/duplicados')
  }

  // 2. Validar rol de administrador
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'ADMIN') {
    redirect('/?error=unauthorized')
  }

  const [pairs, dismissedPairs] = await Promise.all([
    getDuplicateCandidates(supabase),
    getDismissedPairs(supabase),
  ])

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-amber-500/10 p-2.5 text-amber-500">
          <Copy className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Posibles duplicados</h1>
          <p className="text-sm text-muted-foreground">
            Pares de eventos en el mismo lugar con menos de 24 h de diferencia, en los próximos 60 días.
          </p>
        </div>
      </div>

      {/* Explicación de las dos acciones */}
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Fusionar:</span> el evento elegido en &quot;Queda&quot;
          se mantiene; el otro pasa a borrador, sus favoritos y flyers se mueven al que queda, y su link
          redirige ahí.{' '}
          <span className="font-medium text-foreground">Son distintos:</span> el par se descarta y no vuelve
          a aparecer en esta lista (se puede deshacer con &quot;Volver a revisar&quot;, al pie de la página).
        </p>
      </div>

      {/* Lista de pares */}
      {pairs.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center border rounded-lg border-dashed bg-muted/30">
          <Copy className="size-10 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No hay posibles duplicados en los próximos 60 días</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pairs.map(({ a, b, hoursApart }) => (
            <Card key={`${a.id}-${b.id}`}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-4" />
                    {a.venue?.name ?? 'Sin lugar'}
                  </span>
                  <span>
                    {formatEventDate(a.start_date)}, {formatEventTime(a.start_date)} hs
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-4" />
                    {hoursApart.toFixed(1)} h de diferencia
                  </span>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <EventColumn event={a} />
                  <EventColumn event={b} />
                </div>
                <DuplicatePairActions
                  eventA={{ id: a.id, title: a.title }}
                  eventB={{ id: b.id, title: b.title }}
                  defaultKeeperId={defaultKeeper(a, b)}
                  canMergeKeepA={canMerge(a, b)}
                  canMergeKeepB={canMerge(b, a)}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pares marcados como "no son el mismo evento" */}
      {dismissedPairs.length > 0 && (
        <details className="rounded-lg border border-border bg-muted/20">
          <summary className="cursor-pointer select-none p-4 text-sm font-medium text-foreground">
            Marcados como distintos ({dismissedPairs.length})
          </summary>
          <div className="space-y-3 border-t border-border p-4">
            {dismissedPairs.map((pair, index) => (
              <div
                key={`${pair.eventA?.id ?? 'a'}-${pair.eventB?.id ?? 'b'}-${index}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/60 bg-background/40 p-3 text-sm"
              >
                <div className="min-w-0 flex-1 space-y-1 text-muted-foreground">
                  <p className="truncate text-foreground">
                    {pair.eventA ? pair.eventA.title : 'Evento borrado'}
                    {pair.eventA ? ` (${formatEventDayMonth(pair.eventA.start_date)})` : ''}
                  </p>
                  <p className="truncate text-foreground">
                    {pair.eventB ? pair.eventB.title : 'Evento borrado'}
                    {pair.eventB ? ` (${formatEventDayMonth(pair.eventB.start_date)})` : ''}
                  </p>
                  <p className="text-xs">marcado el {dayMonthSlash(pair.decidedAt)}</p>
                </div>
                {pair.eventA && pair.eventB && (
                  <RestorePairButton aId={pair.eventA.id} bId={pair.eventB.id} />
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
