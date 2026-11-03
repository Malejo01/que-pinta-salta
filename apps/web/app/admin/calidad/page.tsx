import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { traerTodasLasFilas } from '@/lib/images/paginar-filas'
import { formatSaltaClock, formatSaltaDayKey } from '@/lib/date-format'
import { ETIQUETA_REGLA, REGLAS_CALIDAD, type ReglaCalidad } from '@qps/core/events/calidad'
import { COLUMNAS_CALIDAD, desdeAyerISO, mapaDeAliases, revisarEventos, type FilaEventoCalidad } from '@/lib/calidad/revision'

export const dynamic = 'force-dynamic'

const MAX_POR_REGLA = 50

const TEXTO_PROPUESTA: Record<string, string> = {
  marcar_gratis: 'Automático: marcar gratis',
  vincular_lugar: 'Automático: vincular lugar por alias',
  categoria_por_palabras: 'Automático: categoría por palabras clave',
  categoria_por_ia: 'Con --ia: categoría por IA',
  revisar_a_mano: 'A mano',
}

/**
 * Q5-8 · /admin/calidad: los conteos de cada regla de calidad sobre los
 * eventos publicados vigentes y los casos para revisar a mano (hasta 50 por
 * regla), con link a la ficha. Solo lectura: las correcciones automáticas las
 * escribe `scripts/revisar-calidad.ts --aplicar`, a mano.
 */
export default async function AdminCalidadPage({ searchParams }: { searchParams: Promise<{ regla?: string }> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?redirect=/admin/calidad')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') redirect('/?error=unauthorized')

  const params = await searchParams
  const regla: ReglaCalidad = (REGLAS_CALIDAD as readonly string[]).includes(params.regla ?? '') ? (params.regla as ReglaCalidad) : 'precio'
  const desde = desdeAyerISO()

  const [filas, aliases] = await Promise.all([
    traerTodasLasFilas<FilaEventoCalidad>((d, h) =>
      supabase.from('events').select(COLUMNAS_CALIDAD).eq('status', 'PUBLISHED').gte('start_date', desde).order('id').range(d, h).returns<FilaEventoCalidad[]>(),
    ),
    traerTodasLasFilas<{ alias: string; alias_normalized: string | null; venue_id: string }>((d, h) =>
      supabase.from('venue_aliases').select('alias, alias_normalized, venue_id').order('id').range(d, h),
    ),
  ])
  const resultado = revisarEventos(filas, mapaDeAliases(aliases))
  const porId = new Map(filas.map((f) => [f.id, f]))
  const casos = resultado.hallazgos.filter((h) => h.regla === regla).slice(0, MAX_POR_REGLA)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Calidad de los eventos</h1>
        <p className="text-sm text-muted-foreground">
          {resultado.revisados} eventos publicados desde ayer en adelante. Las correcciones automáticas las aplica{' '}
          <code>npx tsx scripts/revisar-calidad.ts --aplicar</code> (en seco por defecto); el resto va a mano desde la ficha.
        </p>
      </header>

      <nav aria-label="Reglas" className="grid gap-2 sm:grid-cols-5">
        {REGLAS_CALIDAD.map((r) => (
          <Link
            key={r}
            href={`/admin/calidad?regla=${r}`}
            aria-current={r === regla ? 'page' : undefined}
            className={`flex min-h-11 flex-col rounded-md border p-3 text-sm ${r === regla ? 'border-primary bg-primary/10' : 'border-border'}`}
          >
            <span className="font-semibold">{ETIQUETA_REGLA[r]}</span>
            <span className="text-2xl font-bold tabular-nums">{resultado.conteo[r].total}</span>
            <span className="text-xs text-muted-foreground">{resultado.conteo[r].automaticos} automáticos</span>
          </Link>
        ))}
      </nav>

      <section aria-labelledby="titulo-casos">
        <h2 id="titulo-casos" className="text-lg font-semibold">
          {ETIQUETA_REGLA[regla]}: {casos.length === MAX_POR_REGLA ? `los primeros ${MAX_POR_REGLA}` : `${casos.length} casos`}
        </h2>
        {casos.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nada para revisar en esta regla.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {casos.map((h, i) => {
              const e = porId.get(h.eventoId)
              const fecha = e ? `${formatSaltaDayKey(e.start_date)} ${formatSaltaClock(e.start_date)}` : ''
              return (
                <li key={`${h.eventoId}-${i}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm">
                  <div className="min-w-0">
                    <Link href={`/evento/${h.eventoId}`} className="font-medium underline-offset-2 hover:underline">
                      {e?.title ?? h.eventoId}
                    </Link>
                    <p className="text-muted-foreground">
                      {fecha} · {e?.scrape_source_key ?? 'sin fuente'} · {TEXTO_PROPUESTA[h.propuesta.tipo]}
                      {'motivo' in h.propuesta ? ` · ${h.propuesta.motivo}` : ''}
                      {'frase' in h.propuesta ? ` · «${h.propuesta.frase}»` : ''}
                      {'slug' in h.propuesta ? ` · ${h.propuesta.slug}` : ''}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
