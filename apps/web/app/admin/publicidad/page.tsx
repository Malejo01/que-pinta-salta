import { redirect } from 'next/navigation'
import { BadgeDollarSign } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import {
  obtenerPanelPublicidad,
  type CicloPanel,
  type OcupacionPanel,
  type PrecioPanel,
} from '@/lib/admin/publicidad-actions'
import { formatSaltaDayKey } from '@qps/core/date-format'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { AccionesCiclo, BotonCopiarLink, BotonReanudar, InterruptorAutomatico } from './controles-publicidad'

/**
 * /admin/publicidad (R58, tarea 58-c): el ciclo de precios propuesto con su
 * aprobación y la carga manual, el interruptor de aprobación automática, la
 * pausa del push patrocinado, la ocupación de 60 días y los reportes. El
 * middleware no cubre /admin: la página se protege sola (copiado de
 * destacados/page.tsx).
 */

export const dynamic = 'force-dynamic'

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

const NOMBRE_PRODUCTO: Record<string, string> = {
  'destacado-3': 'Destacado 3 días',
  'destacado-7': 'Destacado 7 días',
  'destacado-14': 'Destacado 14 días',
  'pack-lanzamiento': 'Pack de lanzamiento',
  'plan-mensual': 'Plan mensual',
  'plan-rrpp': 'Plan RRPP',
  push: 'Push patrocinado',
}

/** 'AAAA-MM-DD' -> "noviembre de 2026" (sobre el texto, sin zonas horarias). */
function nombreDelMes(dia: string): string {
  const [anio, mes] = dia.split('-')
  return `${MESES[Number(mes) - 1] ?? mes} de ${anio}`
}

const FUENTES: Record<string, string> = {
  manual: 'cargada a mano',
  vercel: 'Vercel Analytics',
  dolarapi: 'DolarAPI (BNA vendedor)',
  anterior: 'del mes anterior',
}

function textoFuente(fuente: string): string {
  return FUENTES[fuente] ?? fuente
}

function pesos(n: number): string {
  return `$ ${n.toLocaleString('es-AR')}`
}

function diaMes(fecha: string): string {
  const [, mes, dia] = formatSaltaDayKey(fecha).split('-')
  return `${dia}/${mes}`
}

function diferencia(nuevo: number, vigente: number | undefined): string {
  if (vigente === undefined) return 'sin precio vigente'
  const dif = nuevo - vigente
  if (dif === 0) return 'sin cambios'
  const pct = Math.round((dif / vigente) * 100)
  return `${dif > 0 ? '+' : '−'}${pesos(Math.abs(dif))} (${dif > 0 ? '+' : '−'}${Math.abs(pct)}%)`
}

function porcentaje(n: number): string {
  return `${Math.round(n * 100)}%`
}

export default async function AdminPublicidadPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/auth/login?redirect=/admin/publicidad')
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') {
    redirect('/?error=unauthorized')
  }

  // obtenerPanelPublicidad() vuelve a verificar sesión y rol: redundante a propósito.
  const panel = await obtenerPanelPublicidad()
  if (!panel) redirect('/?error=unauthorized')

  const { propuesto, vigente, ciclosAprobados, ajustes, ocupacion, reportes } = panel
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/+$/, '')
  const preciosVigentes = new Map(vigente?.precios.map((p) => [p.producto, p]) ?? [])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
          <BadgeDollarSign className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Publicidad</h1>
          <p className="text-sm text-muted-foreground">
            Los precios se recalculan una vez por mes. Revisá la propuesta y aprobala para que se vea en Publicitá tu evento.
          </p>
        </div>
      </div>

      {propuesto ? (
        <CicloPropuesto
          ciclo={propuesto.ciclo}
          precios={propuesto.precios}
          preciosVigentes={preciosVigentes}
          cicloVigente={vigente?.ciclo.ciclo ?? null}
          audienciaVigente={vigente?.ciclo.audiencia_web_28d ?? null}
        />
      ) : (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No hay un ciclo propuesto esperando aprobación.
            {vigente && <> El último ciclo aprobado es el de {nombreDelMes(vigente.ciclo.ciclo)}.</>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <h2 className="text-sm font-semibold text-foreground">Aprobación automática</h2>
        </CardHeader>
        <CardContent>
          <InterruptorAutomatico activa={ajustes?.aprobacion_automatica ?? false} ciclosAprobados={ciclosAprobados} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <h2 className="text-sm font-semibold text-foreground">Push patrocinado</h2>
        </CardHeader>
        <CardContent>
          {ajustes?.push_patrocinado_pausado_at ? (
            <div className="flex flex-col gap-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-3">
              <p className="text-sm font-medium text-foreground">
                Pausado desde el {diaMes(ajustes.push_patrocinado_pausado_at)}
              </p>
              <p className="text-sm text-muted-foreground">
                Motivo: {ajustes.push_patrocinado_pausa_motivo ?? 'sin motivo cargado'}
              </p>
              <BotonReanudar />
            </div>
          ) : (
            <p className="text-sm text-foreground">
              Activo.{' '}
              <span className="text-muted-foreground">
                Se pausa solo si las bajas en 48 h superan el {porcentaje(ajustes?.umbral_bajas_push ?? 0.02)} de los destinatarios.
              </span>
            </p>
          )}
        </CardContent>
      </Card>

      <Ocupacion filas={ocupacion} />

      <Card>
        <CardHeader className="pb-2">
          <h2 className="text-sm font-semibold text-foreground">Reportes de campañas</h2>
          <p className="text-xs text-muted-foreground">El link se manda a mano: esta pantalla no manda mails.</p>
        </CardHeader>
        <CardContent>
          {reportes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay reportes.</p>
          ) : (
            <ul className="divide-y divide-border">
              {reportes.map((r) => {
                const ruta = `/reporte/${r.token}`
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{r.titulo ?? 'Evento sin título'}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.tipo === 'push' ? 'Push patrocinado' : 'Destacado'} · del {diaMes(r.desde)} al {diaMes(r.hasta)} ·{' '}
                        <span className="font-mono">{ruta}</span>
                      </p>
                    </div>
                    <BotonCopiarLink ruta={ruta} base={base} />
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function CicloPropuesto({
  ciclo,
  precios,
  preciosVigentes,
  cicloVigente,
  audienciaVigente,
}: {
  ciclo: CicloPanel
  precios: PrecioPanel[]
  preciosVigentes: Map<string, PrecioPanel>
  cicloVigente: string | null
  audienciaVigente: number | null
}) {
  const tipoCambioAnterior = ciclo.fuente_tipo_cambio === 'anterior'
  // El cron copia la audiencia del ciclo anterior (o 0) con fuente 'manual': si no cambió, falta cargarla.
  const audienciaAnterior = ciclo.audiencia_web_28d === 0 || ciclo.audiencia_web_28d === audienciaVigente
  const faltan = [
    ...(audienciaAnterior ? ['la audiencia del mes anterior'] : []),
    ...(tipoCambioAnterior ? ['el dólar del mes anterior'] : []),
  ]
  return (
    <Card>
      <CardHeader className="pb-2">
        <h2 className="text-lg font-semibold text-foreground">Ciclo propuesto: {nombreDelMes(ciclo.ciclo)}</h2>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div className={audienciaAnterior ? 'rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-1' : undefined}>
            <dt className="inline text-muted-foreground">Audiencia: </dt>
            <dd className="inline text-foreground">
              {ciclo.audiencia.toLocaleString('es-AR')} (fuente: {textoFuente(ciclo.fuente_audiencia)})
              {audienciaAnterior && (
                <strong className="ml-1 text-amber-700 dark:text-amber-400">
                  Es la audiencia del mes anterior: cargala a mano antes de aprobar.
                </strong>
              )}
            </dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground">Tramo vigente: </dt>
            <dd className="inline text-foreground">
              {ciclo.tramo_vigente.toLocaleString('es-AR')} (calculado: {ciclo.tramo_calculado.toLocaleString('es-AR')})
            </dd>
          </div>
          <div className={tipoCambioAnterior ? 'rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-1' : undefined}>
            <dt className="inline text-muted-foreground">Tipo de cambio: </dt>
            <dd className="inline text-foreground">
              {pesos(ciclo.tipo_cambio)} (fuente: {textoFuente(ciclo.fuente_tipo_cambio)})
              {tipoCambioAnterior && (
                <strong className="ml-1 text-amber-700 dark:text-amber-400">
                  Es el del mes anterior: no se pudo traer el actual. Cargalo a mano.
                </strong>
              )}
            </dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground">Factores de demanda: </dt>
            <dd className="inline text-foreground">
              Hero ×{ciclo.factor_hero.toLocaleString('es-AR')} · Push ×{ciclo.factor_push.toLocaleString('es-AR')}
            </dd>
          </div>
        </dl>
        {ciclo.cambio_tramo_desde && (
          <p className="text-sm text-foreground">
            Cambio de tramo anunciado: desde {nombreDelMes(ciclo.cambio_tramo_desde)} el tramo pasa a{' '}
            {ciclo.tramo_calculado.toLocaleString('es-AR')}.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Hasta sm: un bloque por producto (sin scroll de costado en 360 px). Desde sm: la tabla. */}
        <ul className="flex flex-col gap-2 sm:hidden">
          {precios.map((p) => {
            const v = preciosVigentes.get(p.producto)
            return (
              <li key={p.producto} className="rounded-md border border-border p-3 text-sm">
                <p className="font-medium text-foreground">{NOMBRE_PRODUCTO[p.producto] ?? p.producto}</p>
                <p className="text-foreground">Lista: {pesos(p.precio_ars)}</p>
                <p className="text-foreground">
                  Fundador: {p.precio_fundador_ars !== null ? pesos(p.precio_fundador_ars) : '—'}
                </p>
                <div className="mt-1 text-muted-foreground">
                  <p className="text-xs">
                    Contra el vigente{cicloVigente ? ` (${nombreDelMes(cicloVigente)})` : ''}
                  </p>
                  <div>Lista: {diferencia(p.precio_ars, v?.precio_ars)}</div>
                  {p.precio_fundador_ars !== null && (
                    <div>Fundador: {diferencia(p.precio_fundador_ars, v?.precio_fundador_ars ?? undefined)}</div>
                  )}
                </div>
              </li>
            )
          })}
          {precios.length === 0 && (
            <li className="py-2 text-sm text-muted-foreground">Este ciclo todavía no tiene precios cargados.</li>
          )}
        </ul>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-medium">Producto</th>
                <th className="py-1 pr-3 font-medium">Lista</th>
                <th className="py-1 pr-3 font-medium">Fundador</th>
                <th className="py-1 font-medium">
                  Contra el vigente{cicloVigente ? ` (${nombreDelMes(cicloVigente)})` : ''}
                </th>
              </tr>
            </thead>
            <tbody>
              {precios.map((p) => {
                const v = preciosVigentes.get(p.producto)
                return (
                  <tr key={p.producto} className="border-t border-border align-top">
                    <td className="py-1.5 pr-3 text-foreground">{NOMBRE_PRODUCTO[p.producto] ?? p.producto}</td>
                    <td className="py-1.5 pr-3 text-foreground">{pesos(p.precio_ars)}</td>
                    <td className="py-1.5 pr-3 text-foreground">
                      {p.precio_fundador_ars !== null ? pesos(p.precio_fundador_ars) : '—'}
                    </td>
                    <td className="py-1.5 text-muted-foreground">
                      <div>Lista: {diferencia(p.precio_ars, v?.precio_ars)}</div>
                      {p.precio_fundador_ars !== null && (
                        <div>Fundador: {diferencia(p.precio_fundador_ars, v?.precio_fundador_ars ?? undefined)}</div>
                      )}
                    </td>
                  </tr>
                )
              })}
              {precios.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-2 text-muted-foreground">
                    Este ciclo todavía no tiene precios cargados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <AccionesCiclo
          ciclo={ciclo.ciclo}
          mes={nombreDelMes(ciclo.ciclo)}
          audienciaActual={ciclo.audiencia_web_28d}
          tipoCambioActual={ciclo.tipo_cambio}
          faltan={faltan}
        />
      </CardContent>
    </Card>
  )
}

function promedioDelMes(filas: OcupacionPanel[], mes: string, campo: 'hero' | 'push'): number | null {
  let ocupados = 0
  let cupos = 0
  for (const f of filas) {
    if (!f.day.startsWith(mes)) continue
    ocupados += campo === 'hero' ? f.hero_ocupados : f.push_cupos_usados
    cupos += campo === 'hero' ? f.hero_cupos : f.push_cupos
  }
  return cupos > 0 ? ocupados / cupos : null
}

function Ocupacion({ filas }: { filas: OcupacionPanel[] }) {
  const meses = [...new Set(filas.map((f) => f.day.slice(0, 7)))]
  return (
    <Card>
      <CardHeader className="pb-2">
        <h2 className="text-sm font-semibold text-foreground">Ocupación de los últimos 60 días</h2>
      </CardHeader>
      <CardContent className="space-y-3">
        {filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay datos de ocupación.</p>
        ) : (
          <>
            <div className="space-y-1">
              {meses.map((mes) => {
                const hero = promedioDelMes(filas, mes, 'hero')
                const push = promedioDelMes(filas, mes, 'push')
                return (
                  <p key={mes} className="text-sm text-foreground">
                    {nombreDelMes(`${mes}-01`)}: Hero {hero === null ? '—' : porcentaje(hero)} · Push {push === null ? '—' : porcentaje(push)}
                  </p>
                )
              })}
            </div>
            <BarrasPorDia titulo="Hero por día" filas={filas} campo="hero" />
            <BarrasPorDia titulo="Push por día" filas={filas} campo="push" />
          </>
        )}
      </CardContent>
    </Card>
  )
}

function BarrasPorDia({ titulo, filas, campo }: { titulo: string; filas: OcupacionPanel[]; campo: 'hero' | 'push' }) {
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{titulo}</p>
      <div className="flex h-16 items-end gap-px">
        {filas.map((f) => {
          const cupos = campo === 'hero' ? f.hero_cupos : f.push_cupos
          const usados = campo === 'hero' ? f.hero_ocupados : f.push_cupos_usados
          const fraccion = cupos > 0 ? Math.min(1, usados / cupos) : 0
          return (
            <div
              key={f.day}
              title={`${f.day}: ${usados}/${cupos}`}
              className="flex-1 rounded-t-sm bg-primary/70"
              style={{ height: `${Math.max(fraccion * 100, 2)}%` }}
            />
          )
        })}
      </div>
    </div>
  )
}
