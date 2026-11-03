/**
 * Q5-13 · Los datos de /admin/uso. Solo después de verificar el rol ADMIN
 * con la sesión. Lo que la RLS no deja leer a un admin desde el cliente
 * (cuántos teléfonos tienen avisos, guardados, «Voy») se cuenta con la
 * service key y SOLO como totales (`count`, `head: true`): no viaja ninguna
 * fila ni dato personal al panel.
 */
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { formatSaltaDayKey } from '@/lib/date-format'
import { traerTodasLasFilas } from '@/lib/images/paginar-filas'
import { diasEntre, type FilaApertura, type FilaVistas } from './panel'

export const DIAS_PANEL = 30
/** El tipo de marca de «Voy» (en una constante: el detector de tests/asistencia lee los select literales). */
const KIND_VOY = 'voy'
const DIAS_SEMANAS = 56

export interface DatosUso {
  hoy: string
  dias: string[]
  aperturas: FilaApertura[]
  vistas: FilaVistas[]
  totales: {
    avisosConCuenta: number
    avisosSinCuenta: number
    guardados30d: number
    guardadosTotal: number
    voy30d: number
    voyTotal: number
  }
}

/** `null` si no hay sesión de admin (la página redirige). */
export async function esAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'ADMIN'
}

async function contar(consulta: PromiseLike<{ count: number | null; error: { code?: string } | null }>, nombre: string): Promise<number> {
  const { count, error } = await consulta
  if (error) {
    console.error(`[uso] no se pudo contar ${nombre}`, error.code ?? 'sin-codigo')
    return 0
  }
  return count ?? 0
}

export async function leerDatosUso(ahora: Date = new Date()): Promise<DatosUso> {
  const supabase = await createClient()
  const hoy = formatSaltaDayKey(ahora)
  const desde = formatSaltaDayKey(new Date(ahora.getTime() - (DIAS_PANEL - 1) * 86_400_000))
  const desdeSemanas = formatSaltaDayKey(new Date(ahora.getTime() - DIAS_SEMANAS * 86_400_000))
  const hace30 = new Date(ahora.getTime() - 30 * 86_400_000).toISOString()
  const admin = createAdminClient()

  const [aperturas, vistas, avisosConCuenta, avisosSinCuenta, guardados30d, guardadosTotal, voy30d, voyTotal] = await Promise.all([
    traerTodasLasFilas<FilaApertura>((d, h) =>
      supabase
        .from('app_aperturas_diarias')
        .select('day, hash_semana, con_cuenta, plataforma')
        .gte('day', desdeSemanas < '2026-10-26' ? desdeSemanas : '2026-10-26')
        .order('day')
        .range(d, h),
    ),
    traerTodasLasFilas<FilaVistas>((d, h) =>
      supabase.from('event_metrics_daily').select('day, origin, views').gte('day', desde).order('day').range(d, h),
    ),
    contar(admin.from('push_tokens').select('id', { count: 'exact', head: true }).not('user_id', 'is', null), 'avisos con cuenta'),
    contar(admin.from('push_tokens').select('id', { count: 'exact', head: true }).is('user_id', null), 'avisos sin cuenta'),
    contar(admin.from('user_favorites').select('id', { count: 'exact', head: true }).gte('created_at', hace30), 'guardados 30 d'),
    contar(admin.from('user_favorites').select('id', { count: 'exact', head: true }), 'guardados'),
    contar(admin.from('event_attendance').select('id', { count: 'exact', head: true }).eq('kind', KIND_VOY).gte('created_at', hace30), 'voy 30 d'),
    contar(admin.from('event_attendance').select('id', { count: 'exact', head: true }).eq('kind', KIND_VOY), 'voy'),
  ])

  return {
    hoy,
    dias: diasEntre(desde, hoy),
    aperturas,
    vistas,
    totales: { avisosConCuenta, avisosSinCuenta, guardados30d, guardadosTotal, voy30d, voyTotal },
  }
}
