import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/metricas'
import { formatSaltaDayKey } from '@/lib/date-format'
import { traerTodasLasFilas } from '@/lib/images/paginar-filas'
import {
  ATRIBUCION_OSM,
  ETIQUETA_TIPO,
  estadoDeRevision,
  esTipoLugar,
  horariosSeguros,
  type EstadoRevision,
} from '@qps/core/lugares/permanentes'
import { ETIQUETA_ESTADO, ETIQUETA_FUENTE } from '@/lib/lugares-chicos/textos-admin'
import { pestañaDeLugar, PESTAÑAS_LUGARES_CHICOS, type PestañaLugaresChicos } from '@/lib/lugares-chicos/pestanas'
import { FichaLugarChicosForm } from '@/components/admin/lugares-chicos/ficha-form'
import { AccionesLugarChicos } from '@/components/admin/lugares-chicos/acciones'
import { PedidoLugarChicos, type PedidoAdmin } from '@/components/admin/lugares-chicos/pedidos'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

type FilaLugar = {
  id: string
  venue_id: string
  tipo: string
  estado: string
  descripcion_corta: string | null
  edad_min: number | null
  edad_max: number | null
  horarios: unknown
  acceso: string
  nota_precio: string | null
  techado: string | null
  tiene_rampa: boolean | null
  tiene_bano_adaptado: boolean | null
  tiene_cambiador: boolean | null
  contacto_telefono: string | null
  contacto_web: string | null
  contacto_instagram: string | null
  fuente: string
  fuente_detalle: string | null
  osm_ref: string | null
  verificado_at: string | null
  motivo_archivo: string | null
  venue: { name: string; address: string; latitude: number | null; longitude: number | null } | null
}

const TEXTO_REVISION: Record<EstadoRevision, string> = {
  sin_verificar: 'Sin verificar',
  al_dia: 'Al día',
  para_revisar: 'Para volver a verificar',
  puede_haber_cambiado: 'Pasó el doble del plazo',
}

/** «dd/mm/aaaa» en hora de Salta. */
function fecha(iso: string): string {
  const [a, m, d] = formatSaltaDayKey(iso).split('-')
  return `${d}/${m}/${a}`
}

export default async function AdminLugaresChicosPage({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string; editar?: string; nuevo?: string; q?: string; venue?: string; pedidos?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?redirect=/admin/lugares-chicos')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') redirect('/?error=unauthorized')

  const params = await searchParams
  const pestaña: PestañaLugaresChicos = PESTAÑAS_LUGARES_CHICOS.some((p) => p.ver === params.ver)
    ? (params.ver as PestañaLugaresChicos)
    : 'borradores'
  const ahora = new Date()

  const lugares = await traerTodasLasFilas<FilaLugar>((desde, hasta) =>
    supabase
      .from('lugares_permanentes')
      .select(
        'id, venue_id, tipo, estado, descripcion_corta, edad_min, edad_max, horarios, acceso, nota_precio, techado, tiene_rampa, tiene_bano_adaptado, tiene_cambiador, contacto_telefono, contacto_web, contacto_instagram, fuente, fuente_detalle, osm_ref, verificado_at, motivo_archivo, venue:venues!inner(name, address, latitude, longitude)',
      )
      .order('id')
      .range(desde, hasta)
      .returns<FilaLugar[]>(),
  )

  const porPestaña = new Map<PestañaLugaresChicos, FilaLugar[]>(PESTAÑAS_LUGARES_CHICOS.map((p) => [p.ver, []]))
  for (const l of lugares) {
    porPestaña.get(pestañaDeLugar(l.estado, esTipoLugar(l.tipo) ? estadoDeRevision(l.tipo, l.verificado_at, ahora) : 'sin_verificar'))!.push(l)
  }
  // Q5-3: pedidos del formulario público (los nuevos arriba, con aviso).
  const verPedidosRevisados = params.pedidos === 'todos'
  let consultaPedidos = supabase
    .from('lugares_chicos_pedidos')
    .select('id, nombre, direccion, tipo, comentario, link, contacto, idioma, estado, created_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (!verPedidosRevisados) consultaPedidos = consultaPedidos.eq('estado', 'nuevo')
  const { data: pedidosData } = await consultaPedidos
  const pedidos: PedidoAdmin[] = pedidosData ?? []
  const pedidosNuevos = pedidos.filter((p) => p.estado === 'nuevo').length

  const lista = (porPestaña.get(pestaña) ?? []).sort((a, b) => (a.venue?.name ?? '').localeCompare(b.venue?.name ?? '', 'es'))
  const vencidos = porPestaña.get('vencidos')?.length ?? 0

  const editando = isUuid(params.editar) ? lugares.find((l) => l.id === params.editar) ?? null : null

  // Alta: buscar primero entre los venues canónicos (para no duplicar el museo que ya trae eventos).
  const esAlta = params.nuevo === '1'
  const q = (params.q ?? '').trim().slice(0, 80)
  let candidatos: { id: string; name: string; address: string; tieneFicha: boolean }[] = []
  if (esAlta && q.length >= 2) {
    const { data } = await supabase
      .from('venues')
      .select('id, name, address')
      .is('canonical_venue_id', null)
      .eq('is_placeholder', false)
      .ilike('name', `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`)
      .order('name')
      .limit(10)
    const conFicha = new Set(lugares.map((l) => l.venue_id))
    candidatos = (data ?? []).map((v) => ({ ...v, tieneFicha: conFicha.has(v.id) }))
  }
  let venueElegido: { id: string; nombre: string } | null = null
  if (esAlta && isUuid(params.venue)) {
    const { data } = await supabase.from('venues').select('id, name').eq('id', params.venue).maybeSingle()
    if (data) venueElegido = { id: data.id, nombre: data.name }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Lugares para chicos</h1>
        <p className="text-sm text-muted-foreground">
          Peloteros, salones de juegos, plazas con juegos y espacios culturales. Nada se publica sin verificar: 90 días
          de plazo para peloteros y salones, 180 para plazas y espacios.
        </p>
        <p role="status" className="text-sm font-medium">
          {vencidos === 1 ? '1 lugar para volver a verificar' : `${vencidos} lugares para volver a verificar`}
        </p>
        {pedidosNuevos > 0 ? (
          <p className="rounded-md border border-primary bg-primary/10 p-3 text-sm font-medium">
            <a href="#pedidos" className="underline underline-offset-2">
              {pedidosNuevos === 1 ? '1 pedido nuevo del formulario público' : `${pedidosNuevos} pedidos nuevos del formulario público`}
            </a>
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/lugares-chicos?nuevo=1" className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
            Sumar lugar para chicos
          </Link>
        </div>
      </header>

      {esAlta ? (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Sumar lugar para chicos</h2>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <form method="get" className="flex flex-col gap-2 sm:flex-row sm:items-end" role="search">
              <input type="hidden" name="nuevo" value="1" />
              <label className="flex flex-1 flex-col gap-1 text-sm font-medium">
                Primero buscalo entre los lugares que ya existen
                <input name="q" defaultValue={q} minLength={2} className="h-11 rounded-md border border-input bg-background px-3 text-sm" />
              </label>
              <button type="submit" className="min-h-11 rounded-md border border-border px-4 text-sm font-medium">
                Buscar
              </button>
            </form>
            {q.length >= 2 ? (
              candidatos.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay lugares con ese nombre: cargalo como nuevo abajo.</p>
              ) : (
                <ul className="flex flex-col gap-2" aria-label="Lugares que ya existen">
                  {candidatos.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm">
                      <span>
                        <strong>{c.name}</strong> · {c.address}
                      </span>
                      {c.tieneFicha ? (
                        <span className="text-muted-foreground">Ya tiene ficha</span>
                      ) : (
                        <Link href={`/admin/lugares-chicos?nuevo=1&venue=${c.id}`} className="inline-flex min-h-11 items-center rounded-md border border-border px-3 font-medium">
                          Usar este<span className="sr-only">: {c.name}</span>
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )
            ) : null}
            <FichaLugarChicosForm valores={{}} venueElegido={venueElegido} esAlta />
          </CardContent>
        </Card>
      ) : null}

      {editando ? (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">
              {editando.venue?.name ?? 'Lugar'} · {ETIQUETA_ESTADO[editando.estado] ?? editando.estado}
            </h2>
            <p className="text-sm text-muted-foreground">
              {editando.venue?.address}
              {editando.venue?.latitude === null ? ' · Sin ubicación: cargala en Lugares › Sin ubicación antes de publicar.' : ''}
            </p>
            {editando.osm_ref ? (
              <p className="text-xs text-muted-foreground">
                Importado de OpenStreetMap ({editando.osm_ref}). {ATRIBUCION_OSM.es}.
              </p>
            ) : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <AccionesLugarChicos id={editando.id} estadoActual={editando.estado} />
            <FichaLugarChicosForm
              esAlta={false}
              valores={{ ...editando, horarios: horariosSeguros(editando.horarios) }}
            />
          </CardContent>
        </Card>
      ) : null}

      <section id="pedidos" aria-labelledby="titulo-pedidos" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="titulo-pedidos" className="text-lg font-semibold">
            Pedidos del formulario «Sumá un lugar»
          </h2>
          <Link
            href={verPedidosRevisados ? '/admin/lugares-chicos#pedidos' : '/admin/lugares-chicos?pedidos=todos#pedidos'}
            className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-2"
          >
            {verPedidosRevisados ? 'Ver solo los nuevos' : 'Ver también los revisados'}
          </Link>
        </div>
        {pedidos.length === 0 ? (
          <p className="text-sm text-muted-foreground">{verPedidosRevisados ? 'No hay pedidos.' : 'No hay pedidos nuevos.'}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pedidos.map((p) => (
              <PedidoLugarChicos key={p.id} pedido={p} />
            ))}
          </ul>
        )}
      </section>

      <nav aria-label="Estados" className="flex flex-wrap gap-2">
        {PESTAÑAS_LUGARES_CHICOS.map((p) => (
          <Link
            key={p.ver}
            href={`/admin/lugares-chicos?ver=${p.ver}`}
            aria-current={p.ver === pestaña ? 'page' : undefined}
            className={
              p.ver === pestaña
                ? 'inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground'
                : 'inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium'
            }
          >
            {p.label} ({porPestaña.get(p.ver)?.length ?? 0})
          </Link>
        ))}
      </nav>

      {/* Q6-6: la lista de la pestaña tenía solo los botones de arriba como título: ahora tiene su <h2>. */}
      <h2 className="sr-only">
        {PESTAÑAS_LUGARES_CHICOS.find((p) => p.ver === pestaña)?.label}: {lista.length === 1 ? '1 lugar' : `${lista.length} lugares`}
      </h2>
      {lista.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay lugares en esta lista.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {lista.map((l) => {
            const revision = esTipoLugar(l.tipo) ? estadoDeRevision(l.tipo, l.verificado_at, ahora) : 'sin_verificar'
            return (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-4">
                <div className="flex min-w-0 flex-col gap-1 text-sm">
                  <span className="font-semibold">{l.venue?.name ?? 'Lugar sin nombre'}</span>
                  <span className="text-muted-foreground">
                    {esTipoLugar(l.tipo) ? ETIQUETA_TIPO.es[l.tipo] : l.tipo} · {ETIQUETA_FUENTE[l.fuente] ?? l.fuente}
                    {l.verificado_at ? ` · Verificado el ${fecha(l.verificado_at)}` : ''} · {TEXTO_REVISION[revision]}
                    {l.venue?.latitude === null ? ' · Sin ubicación' : ''}
                    {l.motivo_archivo ? ` · ${l.motivo_archivo}` : ''}
                  </span>
                </div>
                <Link href={`/admin/lugares-chicos?ver=${pestaña}&editar=${l.id}`} className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium">
                  Editar<span className="sr-only">: {l.venue?.name}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
