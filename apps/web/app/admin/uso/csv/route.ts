import { esAdmin, leerDatosUso } from '@/lib/uso/datos'
import { activosPorDia, conCuentaPorDia, csvDiario, vistasPorDia } from '@/lib/uso/panel'

export const dynamic = 'force-dynamic'

/**
 * Q5-13 · `GET /admin/uso/csv`: las series diarias de /admin/uso en CSV, solo
 * para admins (con la sesión). Cantidades por día, sin ningún dato de personas.
 */
export async function GET() {
  if (!(await esAdmin())) return new Response('No autorizado', { status: 403 })
  const { dias, aperturas, vistas } = await leerDatosUso()
  const delPanel = aperturas.filter((f) => f.day >= dias[0]!)
  const v = vistasPorDia(vistas, dias)
  const csv = csvDiario(dias, {
    activos_app: activosPorDia(delPanel, dias),
    aperturas_con_sesion: conCuentaPorDia(delPanel, dias),
    vistas_web: v.web,
    vistas_app: v.app,
  })
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="uso-${dias.at(-1) ?? 'qps'}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
