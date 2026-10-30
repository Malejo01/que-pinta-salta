import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ExternalLink, MapPin, MapPinOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { saltaStartOfDayISO } from '@/lib/event-display'
import { formatSaltaClock, formatSaltaDayKey } from '@/lib/date-format'
import { traerTodasLasFilas } from '@/lib/images/paginar-filas'
import { urlBuscarEnOsm, urlVerEnOsm } from '@/lib/venues/coordenadas-manuales'
import { LugarUbicacionForm } from '@/components/admin/lugar-ubicacion-form'
import { LugarMapaUbicar } from '@/components/admin/lugar-mapa-ubicar'
import { isUuid } from '@/lib/metricas'
import { direccionUtil } from '@/lib/venues/geocodificacion/consultas'
import { proximaFuentePorLugar, type FilaFuente } from '@/lib/admin/fuente-lugar'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

type Pestaña = 'sin-ubicacion' | 'para-revisar' | 'a-mano'

interface VenueFila {
  id: string
  name: string
  address: string
  latitude: number | null
  longitude: number | null
  geocode_source: string | null
  geocoded_at: string | null
}

const TABS: Array<{ ver: Pestaña; label: string }> = [
  { ver: 'sin-ubicacion', label: 'Sin ubicación' },
  { ver: 'para-revisar', label: 'Para revisar' },
  { ver: 'a-mano', label: 'A mano' },
]

/**
 * Criterio de "para-revisar" del plan de la R53: los que vinieron de
 * Nominatim, UNIDOS con los que ya tenían coordenadas antes de que existiera
 * la columna `geocode_source` (sin origen). A propósito NO es el mismo
 * criterio que `lugaresAGeocodificar` en lib/venues/geocodificacion/plan.ts:
 * ahí `elegibles` solo toma los `nominatim` cuando se le pasa
 * `rehacerNominatim`, y `paraRevisarPrevios` son SOLO los sin origen (nunca
 * los `nominatim`). Esta pestaña junta los dos grupos en una sola lista para
 * revisar a mano.
 */
function perteneceA(venue: VenueFila, pestaña: Pestaña): boolean {
  if (pestaña === 'sin-ubicacion') return venue.latitude === null
  if (pestaña === 'a-mano') return venue.geocode_source === 'manual'
  return venue.latitude !== null && (venue.geocode_source === 'nominatim' || venue.geocode_source === null)
}

function origenLabel(source: string | null): string {
  if (source === 'nominatim') return 'Nominatim'
  if (source === 'manual') return 'A mano'
  return 'Sin origen'
}

/** "dd/mm/yyyy HH:mm" en hora de Salta. */
function formatGeocodedAt(iso: string): string {
  const [year, month, day] = formatSaltaDayKey(iso).split('-')
  return `${day}/${month}/${year} ${formatSaltaClock(iso)}`
}

export default async function AdminLugaresPage({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string; ubicar?: string; guardado?: string }>
}) {
  const supabase = await createClient()

  // 1. Validar autenticación
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/auth/login?redirect=/admin/lugares')
  }

  // 2. Validar rol de administrador
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()

  if (profile?.role !== 'ADMIN') {
    redirect('/?error=unauthorized')
  }

  const params = await searchParams
  const pestañaActual: Pestaña = TABS.some((t) => t.ver === params?.ver) ? (params!.ver as Pestaña) : 'sin-ubicacion'

  // PostgREST corta cada `select` en 1000 filas (el `max-rows` de Supabase):
  // sin paginar, un `select('venue_id')` de los eventos publicados desde hoy
  // puede superarlas, el conteo por lugar queda corto para una parte de los
  // venues y el orden de esta página (que es justamente por esa cantidad)
  // sale mal en silencio — es el mismo bug de QPS-162 que ya pasó en
  // scripts/imagenes-externas.ts. Se pagina con traerTodasLasFilas() y un
  // .order('id') estable, para las dos consultas.
  const [venues, eventRows] = await Promise.all([
    traerTodasLasFilas<VenueFila>((desde, hasta) =>
      supabase
        .from('venues')
        .select('id, name, address, latitude, longitude, geocode_source, geocoded_at')
        .is('canonical_venue_id', null)
        .is('merged_at', null)
        .eq('is_placeholder', false)
        .order('id')
        .range(desde, hasta)
    ),
    traerTodasLasFilas<FilaFuente>((desde, hasta) =>
      supabase
        .from('events')
        .select('venue_id, start_date, ticket_url')
        .eq('status', 'PUBLISHED')
        .gte('start_date', saltaStartOfDayISO())
        .order('id')
        .range(desde, hasta)
    ),
  ])

  const conteoPorVenue = new Map<string, number>()
  for (const fila of eventRows) {
    if (!fila.venue_id) continue
    conteoPorVenue.set(fila.venue_id, (conteoPorVenue.get(fila.venue_id) ?? 0) + 1)
  }

  const fuentePorVenue = proximaFuentePorLugar(eventRows)

  const porPestaña: Record<Pestaña, VenueFila[]> = {
    'sin-ubicacion': venues.filter((v) => perteneceA(v, 'sin-ubicacion')),
    'para-revisar': venues.filter((v) => perteneceA(v, 'para-revisar')),
    'a-mano': venues.filter((v) => perteneceA(v, 'a-mano')),
  }

  const lugares = [...porPestaña[pestañaActual]].sort((a, b) => {
    const diff = (conteoPorVenue.get(b.id) ?? 0) - (conteoPorVenue.get(a.id) ?? 0)
    if (diff !== 0) return diff
    return a.name.localeCompare(b.name, 'es')
  })

  // Un lugar a la vez: `?ubicar=<id>` abre el mapa solo si es un uuid de la lista de la pestaña.
  const ubicarId = isUuid(params?.ubicar) && lugares.some((v) => v.id === params.ubicar) ? params.ubicar : null

  // `?guardado=<id>` lo agrega el panel al guardar OK (el panel se desmonta, así que el aviso vive acá).
  // Si el lugar ya no está en esta pestaña (p. ej. pasó de "Sin ubicación" a "A mano"), el aviso va arriba.
  const guardadoId = isUuid(params?.guardado) ? params.guardado : null
  const guardadoEnLista = guardadoId !== null && lugares.some((v) => v.id === guardadoId)
  const guardadoNombre = guardadoId !== null && !guardadoEnLista ? venues.find((v) => v.id === guardadoId)?.name : undefined
  const avisoArriba =
    guardadoId !== null && !guardadoEnLista
      ? guardadoNombre
        ? `Ubicación de ${guardadoNombre} guardada.`
        : 'Ubicación guardada.'
      : null

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
          <MapPin className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Lugares sin ubicación</h1>
          <p className="text-sm text-muted-foreground">
            Sin ubicación: {porPestaña['sin-ubicacion'].length} · Para revisar: {porPestaña['para-revisar'].length} ·
            A mano: {porPestaña['a-mano'].length} — Los ubica el script{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">geocodificar-lugares.ts</code>, que corre Mauro;
            acá se corrige a mano.
          </p>
        </div>
      </div>

      {/* Pestañas */}
      <nav className="flex flex-wrap gap-2 border-b border-border pb-2" aria-label="Pestañas de lugares">
        {TABS.map((tab) => (
          <Link
            key={tab.ver}
            href={`/admin/lugares?ver=${tab.ver}`}
            aria-current={pestañaActual === tab.ver ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors ${
              pestañaActual === tab.ver
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {tab.label} ({porPestaña[tab.ver].length})
          </Link>
        ))}
      </nav>

      {avisoArriba && (
        <p role="status" aria-live="polite" className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">
          {avisoArriba}
        </p>
      )}

      {/* Lista de lugares */}
      {lugares.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center border rounded-lg border-dashed bg-muted/30">
          <MapPinOff className="size-10 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No hay lugares en esta pestaña</p>
        </div>
      ) : (
        <div className="space-y-4">
          {lugares.map((venue) => {
            const cantidadEventos = conteoPorVenue.get(venue.id) ?? 0
            const fuente = fuentePorVenue.get(venue.id) ?? null
            return (
              <Card key={venue.id}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-foreground">{venue.name}</p>
                    <span className="text-xs text-muted-foreground">
                      {cantidadEventos} evento{cantidadEventos === 1 ? '' : 's'} próximo
                      {cantidadEventos === 1 ? '' : 's'}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {direccionUtil(venue.address, venue.name)
                      ? `Dirección de la ingesta: ${venue.address}`
                      : 'Sin dirección'}
                  </p>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {guardadoId === venue.id && (
                    <p role="status" aria-live="polite" className="text-sm font-medium text-foreground">
                      Ubicación guardada.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      {venue.latitude !== null && venue.longitude !== null
                        ? `${venue.latitude}, ${venue.longitude}`
                        : 'Sin coordenadas'}
                    </span>
                    <span>Origen: {origenLabel(venue.geocode_source)}</span>
                    {venue.geocoded_at && <span>Actualizado: {formatGeocodedAt(venue.geocoded_at)}</span>}
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs">
                    {venue.latitude !== null && venue.longitude !== null && (
                      <a
                        href={urlVerEnOsm(venue.latitude, venue.longitude)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center gap-1 font-medium text-primary hover:underline"
                      >
                        Ver en OpenStreetMap
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                    <a
                      href={urlBuscarEnOsm(venue.name, venue.address)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center gap-1 font-medium text-primary hover:underline"
                    >
                      Buscar en OpenStreetMap
                      <ExternalLink className="size-3" />
                    </a>
                    {fuente && (
                      <a
                        href={fuente.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center gap-1 font-medium text-primary hover:underline"
                      >
                        Fuente del próximo evento: {fuente.rotulo}
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                    {/* No hay fusión de lugares en el admin (la de /admin/duplicados es de eventos): por eso es solo el link. */}
                    <Link
                      href="/admin/duplicados"
                      className="inline-flex min-h-11 items-center gap-1 font-medium text-primary hover:underline"
                    >
                      Es un duplicado de…
                    </Link>
                    {ubicarId === venue.id ? (
                      <Link
                        href={`/admin/lugares?ver=${pestañaActual}`}
                        aria-label={`Cerrar el mapa de ${venue.name}`}
                        scroll={false}
                        className="inline-flex min-h-11 items-center gap-1 font-medium text-primary hover:underline"
                      >
                        Cerrar mapa
                      </Link>
                    ) : (
                      <Link
                        href={`/admin/lugares?ver=${pestañaActual}&ubicar=${venue.id}`}
                        aria-label={`Ubicar ${venue.name} en el mapa`}
                        scroll={false}
                        className="inline-flex min-h-11 items-center gap-1 font-medium text-primary hover:underline"
                      >
                        Ubicar
                      </Link>
                    )}
                  </div>
                  {ubicarId === venue.id && (
                    <LugarMapaUbicar
                      venueId={venue.id}
                      nombre={venue.name}
                      latitude={venue.latitude}
                      longitude={venue.longitude}
                      ver={pestañaActual}
                    />
                  )}
                  <LugarUbicacionForm venueId={venue.id} />
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Atribución (la licencia ODbL de OpenStreetMap la exige) */}
      <p className="text-xs text-muted-foreground">
        Ubicaciones: ©{' '}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          colaboradores de OpenStreetMap (ODbL)
        </a>
      </p>
    </div>
  )
}
