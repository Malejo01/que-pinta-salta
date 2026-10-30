'use server'

/**
 * Acciones del panel /admin/publicidad (R58, tarea 58-c): aprobar el ciclo de
 * precios propuesto, cargar a mano la audiencia y el tipo de cambio (el
 * recálculo usa la misma `armarPropuesta` de core que el cron), prender o
 * apagar la aprobación automática, reanudar el push patrocinado y leer todo
 * lo que muestra la pantalla.
 *
 * Todas corren con el cliente de la sesión (`createClient()`), nunca con una
 * credencial de servicio: las políticas de las tablas `ad_*` son `is_admin()`,
 * y con otra credencial esa regla no se estaría probando. Por la misma razón,
 * el admin no puede insertar en `ad_prices` (solo el cron): si el recálculo
 * trae un producto sin fila, no se crea y el resultado lo avisa.
 *
 * Orden fijo en cada acción: 1. la forma de la entrada, ANTES de abrir ningún
 * cliente; 2. sesión y rol ADMIN; 3. la escritura. `approved_by` y
 * `updated_by` salen siempre de `auth.getUser()`, nunca de la entrada.
 */
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { cargarCicloAnterior } from '@/lib/publicidad/ciclo'
import { cargarOcupacion2Meses, type Ocupacion2Meses } from '@/lib/publicidad/ocupacion'
import { armarPropuesta, type CicloAnterior } from '@qps/core/publicidad/formula'

type SupabaseUserClient = Awaited<ReturnType<typeof createClient>>

type AuthOk = { ok: true; supabase: SupabaseUserClient; userId: string }
type AuthError = { ok: false; error: 'AUTH_REQUIRED' | 'FORBIDDEN'; mensaje: string }

/** Sesión + rol ADMIN con el cliente del usuario (copiado de destacados-actions.ts). */
async function requireAdminSupabase(): Promise<AuthOk | AuthError> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'AUTH_REQUIRED', mensaje: 'Necesitás iniciar sesión para hacer esto.' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()

  if (profile?.role !== 'ADMIN') {
    return { ok: false, error: 'FORBIDDEN', mensaje: 'No tenés permisos de administrador para hacer esto.' }
  }

  return { ok: true, supabase, userId: user.id }
}

export type ErrorPublicidad =
  | 'INVALID'
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'ESTADO'
  | 'TRIGGER'
  | 'DB_ERROR'

export type ResultadoPublicidad<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: ErrorPublicidad; mensaje: string }

const CICLO_RE = /^(\d{4})-(\d{2})-01$/
const AUDIENCIA_MAX = 10_000_000
const TIPO_CAMBIO_MIN = 500
const TIPO_CAMBIO_MAX = 5000

function leerCiclo(entrada: unknown): string | null {
  if (typeof entrada !== 'object' || entrada === null) return null
  const ciclo = (entrada as Record<string, unknown>).ciclo
  if (typeof ciclo !== 'string') return null
  const m = CICLO_RE.exec(ciclo)
  if (!m) return null
  const mes = Number(m[2])
  return mes >= 1 && mes <= 12 ? ciclo : null
}

function invalida(mensaje: string): { ok: false; error: 'INVALID'; mensaje: string } {
  return { ok: false, error: 'INVALID', mensaje }
}

function errorDeBase(accion: string, code: string | undefined, mensaje: string) {
  // Solo la acción y el código de Postgres: nunca ids ni emails.
  console.error(`${accion}: error de la base`, code)
  return { ok: false as const, error: 'DB_ERROR' as const, mensaje }
}

function revalidar() {
  revalidatePath('/admin/publicidad')
  revalidatePath('/anunciantes')
}

// ---------------------------------------------------------------------------
// aprobarCiclo
// ---------------------------------------------------------------------------

/**
 * Aprueba el ciclo `{ ciclo }`: pasa de 'propuesto' a 'aprobado' (con
 * `approved_at` y `approved_by` = el admin de la sesión) y después sus precios
 * de `ad_prices` pasan a 'aprobado'.
 *
 * No hay transacción (son dos `update` por PostgREST). Si falla el segundo, el
 * error lo dice; volver a aprobar es seguro: con el ciclo ya 'aprobado' y los
 * precios todavía 'propuesto', solo completa los precios.
 */
export async function aprobarCiclo(entrada: unknown): Promise<ResultadoPublicidad> {
  const ciclo = leerCiclo(entrada)
  if (!ciclo) return invalida('El ciclo no es válido.')

  const auth = await requireAdminSupabase()
  if (!auth.ok) return { ok: false, error: auth.error, mensaje: auth.mensaje }

  // Un ciclo sin ninguna fila en ad_prices no se aprueba: quedaría "aprobado" sin precios que publicar.
  const { data: filasPrecio, error: errorConteo } = await auth.supabase
    .from('ad_prices')
    .select('id')
    .eq('ciclo', ciclo)
    .limit(1)
  if (errorConteo) return errorDeBase('aprobarCiclo', errorConteo.code, 'No se pudo aprobar el ciclo. Intentá de nuevo.')
  if (!filasPrecio || filasPrecio.length === 0) {
    return { ok: false, error: 'ESTADO', mensaje: 'El ciclo no tiene precios: no se puede aprobar.' }
  }

  const { data: aprobados, error: errorCiclo } = await auth.supabase
    .from('ad_price_cycles')
    .update({ estado: 'aprobado', approved_at: new Date().toISOString(), approved_by: auth.userId })
    .eq('ciclo', ciclo)
    .eq('estado', 'propuesto')
    .select('ciclo')

  if (errorCiclo) return errorDeBase('aprobarCiclo', errorCiclo.code, 'No se pudo aprobar el ciclo. Intentá de nuevo.')

  if (!aprobados || aprobados.length === 0) {
    // ¿Ya estaba aprobado (un reintento tras un fallo de los precios)?
    const { data: actual, error: errorLectura } = await auth.supabase
      .from('ad_price_cycles')
      .select('estado')
      .eq('ciclo', ciclo)
      .limit(1)
    if (errorLectura) return errorDeBase('aprobarCiclo', errorLectura.code, 'No se pudo aprobar el ciclo. Intentá de nuevo.')
    const estado = actual?.[0]?.estado
    if (!estado) return { ok: false, error: 'NOT_FOUND', mensaje: 'No se encontró el ciclo.' }
    if (estado !== 'aprobado') {
      return { ok: false, error: 'ESTADO', mensaje: 'El ciclo ya no está propuesto: no se puede aprobar.' }
    }
  }

  const { error: errorPrecios } = await auth.supabase
    .from('ad_prices')
    .update({ estado: 'aprobado' })
    .eq('ciclo', ciclo)
    .eq('estado', 'propuesto')

  if (errorPrecios) {
    console.error('aprobarCiclo: error de la base (precios)', errorPrecios.code)
    return {
      ok: false,
      error: 'DB_ERROR',
      mensaje: 'El ciclo quedó aprobado pero no se pudieron aprobar los precios. Volvé a tocar "Aprobar": es seguro.',
    }
  }

  revalidar()
  return { ok: true }
}

// ---------------------------------------------------------------------------
// cargarAudienciaYTipoCambio
// ---------------------------------------------------------------------------

export type DatosCargaManual = {
  /** Productos que el recálculo trajo pero no tienen fila en `ad_prices` (el admin no puede crearlas). */
  sinFila: string[]
}

/**
 * Carga a mano la audiencia web de 28 días (número de Vercel Analytics) y/o el
 * tipo de cambio de un ciclo 'propuesto', y recalcula todo con `armarPropuesta`
 * (la misma cuenta que el cron): el ciclo y cada fila de `ad_prices` que ya
 * existe se actualizan con `update`. Nunca inserta.
 */
export async function cargarAudienciaYTipoCambio(entrada: unknown): Promise<ResultadoPublicidad<DatosCargaManual>> {
  const ciclo = leerCiclo(entrada)
  if (!ciclo) return invalida('El ciclo no es válido.')
  const crudo = entrada as Record<string, unknown>

  let audienciaWeb28d: number | undefined
  if (crudo.audienciaWeb28d !== undefined) {
    const a = crudo.audienciaWeb28d
    if (typeof a !== 'number' || !Number.isInteger(a) || a < 0 || a > AUDIENCIA_MAX) {
      return invalida('La audiencia tiene que ser un número entero entre 0 y 10.000.000.')
    }
    audienciaWeb28d = a
  }

  let tipoCambio: number | undefined
  if (crudo.tipoCambio !== undefined) {
    const t = crudo.tipoCambio
    if (typeof t !== 'number' || !Number.isFinite(t) || t < TIPO_CAMBIO_MIN || t > TIPO_CAMBIO_MAX) {
      return invalida('El tipo de cambio tiene que ser un número entre 500 y 5.000.')
    }
    tipoCambio = Math.round(t * 100) / 100
  }

  if (audienciaWeb28d === undefined && tipoCambio === undefined) {
    return invalida('Cargá la audiencia, el tipo de cambio o los dos.')
  }

  const auth = await requireAdminSupabase()
  if (!auth.ok) return { ok: false, error: auth.error, mensaje: auth.mensaje }
  const { supabase } = auth

  const MSG_LECTURA = 'No se pudo leer el ciclo. Intentá de nuevo.'

  // 1. El ciclo, que tiene que seguir 'propuesto'.
  const { data: ciclos, error: errorCiclo } = await supabase
    .from('ad_price_cycles')
    .select('ciclo, estado, audiencia_web_28d, mau_app_28d, dispositivos_push, fuente_audiencia, tipo_cambio, fuente_tipo_cambio')
    .eq('ciclo', ciclo)
    .limit(1)
  if (errorCiclo) return errorDeBase('cargarAudienciaYTipoCambio', errorCiclo.code, MSG_LECTURA)
  const actual = ciclos?.[0]
  if (!actual) return { ok: false, error: 'NOT_FOUND', mensaje: 'No se encontró el ciclo.' }
  if (actual.estado !== 'propuesto') {
    return { ok: false, error: 'ESTADO', mensaje: 'El ciclo ya no está propuesto: no se puede recalcular.' }
  }

  // 2 y 3. El ciclo anterior (con sus precios aprobados) y la ocupación de los dos
  // meses previos, con las funciones compartidas y el cliente de la sesión. Tiran
  // Error: se traduce al mismo DB_ERROR, sin loguear el mensaje crudo.
  let anterior: CicloAnterior | null
  let ocupacion: Ocupacion2Meses
  try {
    // El cliente de la sesión es un SupabaseClient con otro esquema tipado: conversión acotada.
    const cliente = supabase as unknown as SupabaseClient
    anterior = await cargarCicloAnterior(cliente, ciclo)
    ocupacion = await cargarOcupacion2Meses(cliente, ciclo)
  } catch {
    return errorDeBase('cargarAudienciaYTipoCambio', undefined, MSG_LECTURA)
  }

  // 4. El recálculo (la misma cuenta que el cron).
  const propuesta = armarPropuesta({
    ciclo,
    audienciaWeb28d: audienciaWeb28d ?? actual.audiencia_web_28d,
    mauApp28d: actual.mau_app_28d,
    dispositivosPush: actual.dispositivos_push,
    fuenteAudiencia: audienciaWeb28d !== undefined ? 'manual' : actual.fuente_audiencia === 'manual' ? 'manual' : 'vercel',
    tipoCambio: tipoCambio ?? actual.tipo_cambio,
    fuenteTipoCambio: tipoCambio !== undefined ? 'manual' : actual.fuente_tipo_cambio,
    ocupacionHero: ocupacion.hero,
    ocupacionPush: ocupacion.push,
    anterior,
  })

  // 5. update del ciclo (sigue 'propuesto' en el filtro: si lo aprobaron en el medio, no pisa nada).
  const c = propuesta.ciclo
  const { data: ciclosActualizados, error: errorUpdate } = await supabase
    .from('ad_price_cycles')
    .update({
      audiencia_web_28d: c.audiencia_web_28d,
      audiencia: c.audiencia,
      fuente_audiencia: c.fuente_audiencia,
      tramo_calculado: c.tramo_calculado,
      tramo_vigente: c.tramo_vigente,
      cambio_tramo_desde: c.cambio_tramo_desde,
      factor_hero: c.factor_hero,
      factor_push: c.factor_push,
      ...(tipoCambio !== undefined ? { tipo_cambio: c.tipo_cambio, fuente_tipo_cambio: 'manual' } : {}),
    })
    .eq('ciclo', ciclo)
    .eq('estado', 'propuesto')
    .select('ciclo')
  if (errorUpdate) {
    return errorDeBase('cargarAudienciaYTipoCambio', errorUpdate.code, 'No se pudo guardar el ciclo. Intentá de nuevo.')
  }
  if (!ciclosActualizados || ciclosActualizados.length === 0) {
    return { ok: false, error: 'ESTADO', mensaje: 'El ciclo ya no está propuesto: no se guardó nada.' }
  }

  // 6. update de cada precio que ya existe (el admin no puede insertar).
  const sinFila: string[] = []
  for (const p of propuesta.precios) {
    const { data: actualizados, error: errorPrecio } = await supabase
      .from('ad_prices')
      .update({
        tramo_ref: p.tramo_ref,
        precio_usd: p.precio_usd,
        precio_ars: p.precio_ars,
        precio_fundador_ars: p.precio_fundador_ars,
        tipo_cambio: p.tipo_cambio,
        vigente_desde: p.vigente_desde,
      })
      .eq('ciclo', ciclo)
      .eq('producto', p.producto)
      .eq('estado', 'propuesto')
      .select('id')
    if (errorPrecio) {
      console.error('cargarAudienciaYTipoCambio: error de la base (precios)', errorPrecio.code)
      return {
        ok: false,
        error: 'DB_ERROR',
        mensaje: 'El ciclo se recalculó pero no se pudieron guardar todos los precios. Volvé a cargar el dato.',
      }
    }
    if (!actualizados || actualizados.length === 0) sinFila.push(p.producto)
  }

  revalidar()
  return { ok: true, sinFila }
}

// ---------------------------------------------------------------------------
// cambiarAprobacionAutomatica
// ---------------------------------------------------------------------------

/**
 * Prende o apaga la aprobación automática (`{ activar: boolean }`). El trigger
 * de la base exige 3 ciclos aprobados a mano para prenderla (error 23514): se
 * traduce a un mensaje en castellano.
 */
export async function cambiarAprobacionAutomatica(entrada: unknown): Promise<ResultadoPublicidad> {
  const activar = typeof entrada === 'object' && entrada !== null ? (entrada as Record<string, unknown>).activar : undefined
  if (typeof activar !== 'boolean') return invalida('Indicá si se activa o se desactiva.')

  const auth = await requireAdminSupabase()
  if (!auth.ok) return { ok: false, error: auth.error, mensaje: auth.mensaje }

  const { error } = await auth.supabase
    .from('ad_settings')
    .update({ aprobacion_automatica: activar, updated_by: auth.userId })
    .eq('id', true)

  if (error) {
    if (error.code === '23514') {
      return { ok: false, error: 'TRIGGER', mensaje: 'La aprobación automática necesita 3 ciclos aprobados a mano.' }
    }
    return errorDeBase('cambiarAprobacionAutomatica', error.code, 'No se pudo cambiar la aprobación automática. Intentá de nuevo.')
  }

  revalidar()
  return { ok: true }
}

// ---------------------------------------------------------------------------
// reanudarPushPatrocinado
// ---------------------------------------------------------------------------

/**
 * Reanuda el push patrocinado: borra la fecha y el motivo de la pausa (la base
 * exige los dos juntos).
 */
export async function reanudarPushPatrocinado(): Promise<ResultadoPublicidad> {
  const auth = await requireAdminSupabase()
  if (!auth.ok) return { ok: false, error: auth.error, mensaje: auth.mensaje }

  const { error } = await auth.supabase
    .from('ad_settings')
    .update({ push_patrocinado_pausado_at: null, push_patrocinado_pausa_motivo: null, updated_by: auth.userId })
    .eq('id', true)

  if (error) return errorDeBase('reanudarPushPatrocinado', error.code, 'No se pudo reanudar el push. Intentá de nuevo.')

  revalidar()
  return { ok: true }
}

// ---------------------------------------------------------------------------
// obtenerPanelPublicidad
// ---------------------------------------------------------------------------

export type CicloPanel = {
  ciclo: string
  estado: string
  audiencia: number
  audiencia_web_28d: number
  fuente_audiencia: string
  tramo_calculado: number
  tramo_vigente: number
  cambio_tramo_desde: string | null
  tipo_cambio: number
  fuente_tipo_cambio: string
  factor_hero: number
  factor_push: number
  approved_at: string | null
}

export type PrecioPanel = {
  producto: string
  precio_usd: number
  precio_ars: number
  precio_fundador_ars: number | null
  estado: string
}

export type AjustesPanel = {
  aprobacion_automatica: boolean
  push_patrocinado_pausado_at: string | null
  push_patrocinado_pausa_motivo: string | null
  umbral_bajas_push: number
}

export type OcupacionPanel = {
  day: string
  hero_ocupados: number
  hero_cupos: number
  push_cupos_usados: number
  push_cupos: number
}

export type ReportePanel = {
  id: string
  tipo: string
  desde: string
  hasta: string
  token: string
  titulo: string | null
}

export type PanelPublicidad = {
  propuesto: { ciclo: CicloPanel; precios: PrecioPanel[] } | null
  vigente: { ciclo: CicloPanel; precios: PrecioPanel[] } | null
  ciclosAprobados: number
  ajustes: AjustesPanel | null
  ocupacion: OcupacionPanel[]
  reportes: ReportePanel[]
}

const COLUMNAS_CICLO =
  'ciclo, estado, audiencia, audiencia_web_28d, fuente_audiencia, tramo_calculado, tramo_vigente, cambio_tramo_desde, tipo_cambio, fuente_tipo_cambio, factor_hero, factor_push, approved_at'
const COLUMNAS_PRECIO = 'producto, precio_usd, precio_ars, precio_fundador_ars, estado'
const DIAS_OCUPACION = 60
const UN_DIA_MS = 24 * 60 * 60 * 1000

/** Todo lo que muestra /admin/publicidad. `null` si quien pide no es admin. */
export async function obtenerPanelPublicidad(): Promise<PanelPublicidad | null> {
  const auth = await requireAdminSupabase()
  if (!auth.ok) return null
  const { supabase } = auth

  const desdeOcupacion = new Date(Date.now() - DIAS_OCUPACION * UN_DIA_MS).toISOString().slice(0, 10)

  const [propuestos, vigentes, aprobados, ajustes, ocupacion, reportes] = await Promise.all([
    supabase
      .from('ad_price_cycles')
      .select(COLUMNAS_CICLO)
      .eq('estado', 'propuesto')
      .order('ciclo', { ascending: false })
      .limit(1),
    supabase
      .from('ad_price_cycles')
      .select(COLUMNAS_CICLO)
      .in('estado', ['aprobado', 'automatico'])
      .order('ciclo', { ascending: false })
      .limit(1),
    supabase.from('ad_price_cycles').select('ciclo').eq('estado', 'aprobado').limit(1000),
    supabase
      .from('ad_settings')
      .select('aprobacion_automatica, push_patrocinado_pausado_at, push_patrocinado_pausa_motivo, umbral_bajas_push')
      .eq('id', true)
      .limit(1),
    supabase
      .from('ad_occupancy_daily')
      .select('day, hero_ocupados, hero_cupos, push_cupos_usados, push_cupos')
      .gte('day', desdeOcupacion)
      .order('day', { ascending: true })
      .limit(120),
    supabase
      .from('ad_campaign_reports')
      .select('id, tipo, desde, hasta, token, events(title)')
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  for (const [nombre, r] of [
    ['propuestos', propuestos],
    ['vigentes', vigentes],
    ['aprobados', aprobados],
    ['ajustes', ajustes],
    ['ocupacion', ocupacion],
    ['reportes', reportes],
  ] as const) {
    if (r.error) console.error(`obtenerPanelPublicidad: error de la base (${nombre})`, r.error.code)
  }

  const preciosDe = async (ciclo: string): Promise<PrecioPanel[]> => {
    const { data, error } = await supabase.from('ad_prices').select(COLUMNAS_PRECIO).eq('ciclo', ciclo)
    if (error) {
      console.error('obtenerPanelPublicidad: error de la base (precios)', error.code)
      return []
    }
    return data ?? []
  }

  const cicloPropuesto = propuestos.data?.[0] ?? null
  const cicloVigente = vigentes.data?.[0] ?? null
  const [preciosPropuesto, preciosVigente] = await Promise.all([
    cicloPropuesto ? preciosDe(cicloPropuesto.ciclo) : Promise.resolve([]),
    cicloVigente ? preciosDe(cicloVigente.ciclo) : Promise.resolve([]),
  ])

  return {
    propuesto: cicloPropuesto ? { ciclo: cicloPropuesto, precios: preciosPropuesto } : null,
    vigente: cicloVigente ? { ciclo: cicloVigente, precios: preciosVigente } : null,
    ciclosAprobados: aprobados.data?.length ?? 0,
    ajustes: ajustes.data?.[0] ?? null,
    ocupacion: ocupacion.data ?? [],
    reportes: (reportes.data ?? []).map((r) => {
      const evento = r.events as { title: string } | { title: string }[] | null
      const titulo = Array.isArray(evento) ? (evento[0]?.title ?? null) : (evento?.title ?? null)
      return { id: r.id, tipo: r.tipo, desde: r.desde, hasta: r.hasta, token: r.token, titulo }
    }),
  }
}
