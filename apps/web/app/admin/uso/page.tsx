import { redirect } from 'next/navigation'
import { GraficoBarras } from '@/components/admin/grafico-barras'
import { esAdmin, leerDatosUso, DIAS_PANEL } from '@/lib/uso/datos'
import { activosPorDia, activosPorSemana, conCuentaPorDia, estadoProduccion, vistasPorDia, FECHA_OBJETIVO_PRODUCCION } from '@/lib/uso/panel'

export const dynamic = 'force-dynamic'

const ICONO_ESTADO: Record<string, string> = { cumple: '✅', 'no-cumple': '❌', 'en-curso': '⏳', manual: '👀' }
const TEXTO_ESTADO: Record<string, string> = { cumple: 'Cumple', 'no-cumple': 'No cumple', 'en-curso': 'En curso', manual: 'Ver en Play Console' }

function Tarjeta({ titulo, valor, detalle }: { titulo: string; valor: number | string; detalle?: string }) {
  return (
    <div className="rounded-md border border-border p-4">
      <p className="text-sm text-muted-foreground">{titulo}</p>
      <p className="text-3xl font-bold tabular-nums">{valor}</p>
      {detalle ? <p className="text-xs text-muted-foreground">{detalle}</p> : null}
    </div>
  )
}

/**
 * Q5-13 · /admin/uso: cuánto se usa la app y el sitio, para Mauro. Todo son
 * cantidades (aperturas anónimas, filas, sumas): ver docs/METRICAS.md.
 */
export default async function AdminUsoPage() {
  if (!(await esAdmin())) redirect('/?error=unauthorized')
  const datos = await leerDatosUso()
  const { dias, aperturas, vistas, totales, hoy } = datos

  const delPanel = aperturas.filter((f) => f.day >= dias[0]!)
  const porDia = activosPorDia(delPanel, dias)
  const porSemana = activosPorSemana(aperturas).slice(-8)
  const conCuenta = conCuentaPorDia(delPanel, dias)
  const vistasSeries = vistasPorDia(vistas, dias)
  const produccion = estadoProduccion(aperturas, hoy)
  const activosHoy = porDia.at(-1)?.valor ?? 0
  const semanaActual = porSemana.at(-1)?.valor ?? 0
  const vistasWeb = vistasSeries.web.reduce((s, p) => s + p.valor, 0)
  const vistasApp = vistasSeries.app.reduce((s, p) => s + p.valor, 0)

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Uso</h1>
          <p className="text-sm text-muted-foreground">
            Últimos {DIAS_PANEL} días (hora de Salta). Son cantidades, no personas identificadas: ver docs/METRICAS.md.
          </p>
        </div>
        <a href="/admin/uso/csv" className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium" download>
          Descargar CSV
        </a>
      </header>

      <section aria-labelledby="titulo-produccion" className="rounded-md border-2 border-primary p-4">
        <h2 id="titulo-produccion" className="text-lg font-semibold">
          ¿Llegamos al pedido de producción?
        </h2>
        <p className="text-sm text-muted-foreground">
          Fecha objetivo: {FECHA_OBJETIVO_PRODUCCION.split('-').reverse().join('/')} ·{' '}
          {produccion.diasQueFaltan === 0 ? 'es hoy o ya pasó' : `faltan ${produccion.diasQueFaltan} días`} · {produccion.diasCorridos} días de prueba
          cerrada. Criterios de docs/play/produccion.md.
        </p>
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {produccion.criterios.map((c) => (
            <li key={c.texto} className="flex gap-2">
              <span aria-hidden="true">{ICONO_ESTADO[c.estado]}</span>
              <span>
                <strong>{TEXTO_ESTADO[c.estado]}</strong>: {c.texto}
              </span>
            </li>
          ))}
        </ul>
        {produccion.semanas.length > 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Personas activas en la app por semana desde el 26/10: {produccion.semanas.map((s) => `${s.clave}: ${s.valor}`).join(' · ')}.
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">Todavía no hay aperturas registradas (llegan con el build que trae Q5-13).</p>
        )}
      </section>

      <section aria-labelledby="titulo-resumen" className="flex flex-col gap-3">
        <h2 id="titulo-resumen" className="text-lg font-semibold">
          Resumen
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Tarjeta titulo="Personas activas hoy (app)" valor={activosHoy} />
          <Tarjeta titulo="Personas activas esta semana (app)" valor={semanaActual} detalle="Testers activos (indicio)" />
          <Tarjeta titulo="Avisos activos" valor={totales.avisosConCuenta + totales.avisosSinCuenta} detalle={`${totales.avisosConCuenta} con cuenta · ${totales.avisosSinCuenta} sin cuenta`} />
          <Tarjeta titulo="Guardados" valor={totales.guardadosTotal} detalle={`${totales.guardados30d} en los últimos 30 días`} />
          <Tarjeta titulo="«Voy»" valor={totales.voyTotal} detalle={`${totales.voy30d} en los últimos 30 días`} />
          <Tarjeta titulo="Vistas de eventos (30 días)" valor={vistasWeb + vistasApp} detalle={`${vistasWeb} web · ${vistasApp} app`} />
        </div>
      </section>

      <section aria-labelledby="titulo-graficos" className="flex flex-col gap-6">
        <h2 id="titulo-graficos" className="text-lg font-semibold">
          Evolución
        </h2>
        <GraficoBarras titulo="Personas activas por día (app)" serie={porDia} />
        <GraficoBarras titulo="Personas activas por semana (app)" serie={porSemana} etiqueta={(c) => c.slice(5)} />
        <GraficoBarras titulo="Aperturas con sesión por día (app)" serie={conCuenta} />
        <GraficoBarras titulo="Vistas de eventos en la web por día" serie={vistasSeries.web} />
        <GraficoBarras titulo="Vistas de eventos en la app por día" serie={vistasSeries.app} />
      </section>
    </div>
  )
}
