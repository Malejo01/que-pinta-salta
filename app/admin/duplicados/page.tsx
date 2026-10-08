import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Copy, ExternalLink, MapPin, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getDuplicateCandidates, type DuplicateCandidateEvent } from '@/lib/events/duplicate-candidates'
import { formatEventDate, formatEventTime } from '@/lib/date-format'
import { resolveEventSource, describeSource } from '@/lib/scraper/source-priority'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

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

  const pairs = await getDuplicateCandidates(supabase)

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

      {/* Instrucciones de fusión manual */}
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <p>
          Esta lista es solo para revisión: no tiene acciones de fusión. Si dos eventos de acá son el
          mismo, se fusionan a mano desde la ficha de cada evento: el flyer apunta al evento que queda
          publicado, y el otro pasa a estado <span className="font-medium text-foreground">DRAFT</span>{' '}
          con <code className="rounded bg-muted px-1 py-0.5 text-xs">ai_metadata.merged_into_event_id</code>{' '}
          apuntando al que queda.
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
              <CardContent className="flex flex-col gap-3 sm:flex-row">
                <EventColumn event={a} />
                <EventColumn event={b} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
