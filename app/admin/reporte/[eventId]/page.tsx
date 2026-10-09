import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getEventReport } from '@/lib/admin/reporte-evento'
import { formatEventDate, formatEventTime } from '@/lib/date-format'
import { PrintButton } from '@/components/admin/print-button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

interface ReporteEventoPageProps {
  params: Promise<{ eventId: string }>
}

const ORIGIN_LABELS: Record<string, string> = {
  hero: 'Portada (destacado)',
  hoy: 'Hoy en Salta',
  fila: 'Filas de la portada',
  busqueda: 'Búsqueda',
  favoritos: 'Favoritos',
  ficha: 'Ficha',
  radar: 'Desde el Radar',
  directo: 'Directo',
}

function originLabel(origin: string): string {
  return ORIGIN_LABELS[origin] ?? origin
}

/** El día ya viene como calendario de Salta ("YYYY-MM-DD"): no hace falta convertir zona horaria. */
function formatDayShort(day: string): string {
  const [, month, date] = day.split('-')
  return `${date}/${month}`
}

function formatCtr(ctr: number | null): string {
  if (ctr === null) return '—'
  return `${ctr.toFixed(1).replace('.', ',')}%`
}

export default async function ReporteEventoPage({ params }: ReporteEventoPageProps) {
  const { eventId } = await params
  const supabase = await createClient()

  // 1. Validar autenticación
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/auth/login?redirect=${encodeURIComponent(`/admin/reporte/${eventId}`)}`)
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

  // 3. Uuid inválido o evento inexistente -> 404
  const result = await getEventReport(supabase, eventId)
  if (!result) notFound()

  const { event, report } = result
  const hayDatos = report.dias.length > 0
  const emitido = formatEventDate(new Date(), true)

  return (
    <div className="space-y-6 print:space-y-4 print:text-black">
      {/* Estilos de impresión: A4, sin header/nav/footer de la app, tablas sin cortes de fila. */}
      <style>{`
        @page { size: A4; margin: 15mm; }
        @media print {
          header, nav, footer, [data-print-hide] { display: none !important; }
          html, body { background: #fff !important; color: #000 !important; }
          table, tr { break-inside: avoid; }
        }
      `}</style>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground print:text-black">{event.title}</h1>
          <p className="text-sm text-muted-foreground print:text-black">
            {event.venue?.name ?? 'Sin lugar'} · {formatEventDate(event.start_date, true)}, {formatEventTime(event.start_date)} hs
          </p>
          <p className="mt-1 text-xs text-muted-foreground print:text-black">
            Reporte emitido el {emitido}
          </p>
        </div>
        <div data-print-hide>
          <PrintButton />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 print:grid-cols-3">
        <Card className="print:border-black/30">
          <CardHeader className="pb-0">
            <p className="text-sm text-muted-foreground print:text-black">Vistas</p>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground print:text-black">{report.totales.views}</p>
          </CardContent>
        </Card>
        <Card className="print:border-black/30">
          <CardHeader className="pb-0">
            <p className="text-sm text-muted-foreground print:text-black">Clics a la ticketera</p>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground print:text-black">{report.totales.clicks}</p>
          </CardContent>
        </Card>
        <Card className="print:border-black/30">
          <CardHeader className="pb-0">
            <p className="text-sm text-muted-foreground print:text-black">CTR</p>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground print:text-black">{formatCtr(report.totales.ctr)}</p>
          </CardContent>
        </Card>
      </div>

      {report.diasDestacado > 0 && (
        <p className="text-sm text-muted-foreground print:text-black">
          Estuvo destacado en la portada {report.diasDestacado} {report.diasDestacado === 1 ? 'día' : 'días'}.
        </p>
      )}

      {!hayDatos ? (
        <p className="text-muted-foreground print:text-black">
          Todavía no hay vistas registradas para este evento.
        </p>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground print:text-black">Vistas y clics por día</h2>
            <table className="w-full text-sm print:text-black">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-1.5 pr-2 font-medium text-muted-foreground print:text-black">Fecha</th>
                  <th className="py-1.5 pr-2 font-medium text-muted-foreground print:text-black">Vistas</th>
                  <th className="py-1.5 font-medium text-muted-foreground print:text-black">Clics</th>
                </tr>
              </thead>
              <tbody>
                {report.dias.map((dia) => (
                  <tr key={dia.day} className="border-b border-border/60">
                    <td className="py-1.5 pr-2 print:text-black">{formatDayShort(dia.day)}</td>
                    <td className="py-1.5 pr-2 print:text-black">{dia.views}</td>
                    <td className="py-1.5 print:text-black">{dia.clicks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground print:text-black">Vistas y clics por origen</h2>
            <table className="w-full text-sm print:text-black">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-1.5 pr-2 font-medium text-muted-foreground print:text-black">Origen</th>
                  <th className="py-1.5 pr-2 font-medium text-muted-foreground print:text-black">Vistas</th>
                  <th className="py-1.5 font-medium text-muted-foreground print:text-black">Clics</th>
                </tr>
              </thead>
              <tbody>
                {report.porOrigen.map((origen) => (
                  <tr key={origen.origin} className="border-b border-border/60">
                    <td className="py-1.5 pr-2 print:text-black">{originLabel(origen.origin)}</td>
                    <td className="py-1.5 pr-2 print:text-black">{origen.views}</td>
                    <td className="py-1.5 print:text-black">{origen.clicks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm print:border-black/30 print:bg-transparent print:text-black">
            <p className="font-medium text-foreground print:text-black">
              Desde el Radar: {report.desdeRadar.views} vistas, {report.desdeRadar.clicks} clics.
            </p>
            <p className="mt-1 text-muted-foreground print:text-black">
              Cuántas veces apareció el evento en los correos del Radar no se registra todavía.
            </p>
          </section>
        </>
      )}
    </div>
  )
}
