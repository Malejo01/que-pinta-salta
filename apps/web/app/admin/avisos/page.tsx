import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Megaphone } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatSaltaClock, formatSaltaDayKey } from '@/lib/date-format'
import { obtenerCampanias, type CampaniaParaAdmin, type EstadoCampania } from '@/lib/admin/avisos-patrocinados-actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { historialAvisosEquipo } from '@/lib/admin/avisos-equipo-actions'
import { modoEnvioReal } from '@/lib/notificaciones/envio-admin'
import { FormularioCampania, BotonCancelarCampania, type CampaniaInicial } from './formulario-campania'
import { FormularioAvisoEquipo } from './formulario-aviso-equipo'

export const dynamic = 'force-dynamic'

const ETIQUETA_POR_ESTADO: Record<EstadoCampania, string> = {
  'por-venir': 'Por venir',
  'en-envio': 'En envío',
  terminada: 'Terminada',
  cancelada: 'Cancelada',
}

/** "dd/mm/yyyy HH:mm" en hora de Salta (mismo formato que /admin/lugares). */
function formatFecha(iso: string): string {
  const [year, month, day] = formatSaltaDayKey(iso).split('-')
  return `${day}/${month}/${year} ${formatSaltaClock(iso)}`
}

/** "dd/mm/yyyy" a partir de un `YYYY-MM-DD` de Salta. */
function formatDia(diaKey: string): string {
  const [year, month, day] = diaKey.split('-')
  return `${day}/${month}/${year}`
}

function campaniaInicialDesde(campania: CampaniaParaAdmin): CampaniaInicial {
  return {
    id: campania.id,
    titulo: campania.titulo,
    cuerpo: campania.cuerpo,
    eventoId: campania.eventoId,
    url: campania.url,
    startsAt: campania.startsAt,
    endsAt: campania.endsAt,
  }
}

export default async function AdminAvisosPage({
  searchParams,
}: {
  searchParams: Promise<{ editar?: string }>
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') redirect('/')

  const campanias = await obtenerCampanias()
  const lista = campanias ?? []
  const historial = (await historialAvisosEquipo()) ?? []
  const envioReal = modoEnvioReal()

  const { editar } = await searchParams
  const campaniaEnEdicion = editar ? lista.find((c) => c.id === editar && c.estado === 'por-venir') : undefined

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
          <Megaphone className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Avisos</h1>
          <p className="text-sm text-muted-foreground">
            El aviso del equipo (manual) y los avisos patrocinados (campañas).
          </p>
        </div>
      </div>

      {envioReal ? (
        <Alert>
          <AlertTitle>El envío real está prendido</AlertTitle>
          <AlertDescription>El envío real está prendido: lo que mandes llega a teléfonos de verdad.</AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <AlertTitle>El envío real todavía está apagado</AlertTitle>
          <AlertDescription>
            El envío real está apagado: los avisos se simulan (no sale nada a los teléfonos). Las campañas se guardan
            y la corrida las cuenta en modo de prueba.
          </AlertDescription>
        </Alert>
      )}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">Aviso del equipo</h2>
        <FormularioAvisoEquipo />
        <Card>
          <CardHeader>
            <CardTitle>Últimos avisos del equipo</CardTitle>
          </CardHeader>
          <CardContent>
            {historial.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no se mandó ningún aviso del equipo.</p>
            ) : (
              <ul className="space-y-1 text-sm text-foreground">
                {historial.map((fila) => (
                  <li key={fila.dia}>
                    {formatDia(fila.dia)}: llegó a {fila.personas} {fila.personas === 1 ? 'persona' : 'personas'}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <h2 className="text-xl font-semibold text-foreground">Avisos patrocinados</h2>
      <p className="-mt-4 text-sm text-muted-foreground">
        Llega como mucho 1 por semana a cada persona, respetando su horario de silencio, y solo a quien no lo apagó.
      </p>

      <FormularioCampania campaniaInicial={campaniaEnEdicion ? campaniaInicialDesde(campaniaEnEdicion) : null} />

      <Card>
        <CardHeader>
          <CardTitle>Campañas cargadas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {lista.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no se cargó ninguna campaña.</p>
          ) : (
            lista.map((campania) => (
              <div
                key={campania.id}
                className="flex flex-col gap-2 rounded-lg border border-border p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{ETIQUETA_POR_ESTADO[campania.estado]}</Badge>
                    <p className="font-medium text-foreground">{campania.titulo}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{campania.cuerpo}</p>
                  <p className="text-xs text-muted-foreground">
                    Evento: {campania.eventoTitulo ?? 'sin ficha propia'} — Desde {formatFecha(campania.startsAt)}{' '}
                    hasta {formatFecha(campania.endsAt)}
                    {campania.sentAt && <> — Enviada por primera vez el {formatFecha(campania.sentAt)}</>}
                    {campania.cargadoPor && <> — Cargada por {campania.cargadoPor}</>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {campania.estado === 'por-venir' && (
                    <Link
                      href={`/admin/avisos?editar=${campania.id}`}
                      className="inline-flex min-h-9 items-center rounded-md border border-input px-3 text-sm font-medium text-foreground hover:bg-accent"
                    >
                      Editar
                    </Link>
                  )}
                  {(campania.estado === 'por-venir' || campania.estado === 'en-envio') && (
                    <BotonCancelarCampania id={campania.id} />
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
