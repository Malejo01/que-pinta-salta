'use server'

/**
 * Acciones del panel /admin/avisos (D2/Ronda 51, tarea 51-c): cargar, editar
 * y cancelar una campaña patrocinada. Mismo patrón de las otras acciones de
 * `lib/admin/` (ver `duplicate-actions.ts` y `lugares-actions.ts`):
 * `createClient()` de `lib/supabase/server.ts` (el cliente DE LA SESIÓN, no
 * el de service role), `auth.getUser()` y después el rol `ADMIN` en
 * `profiles` — las cuatro policies de `sponsored_campaigns`
 * (`supabase/migrations/20261018130200_etapa2_campanias_patrocinadas.sql`)
 * evalúan `is_admin()` sobre `auth.uid()` de esa sesión.
 *
 * La validación de la forma de la campaña (títulos, largos, palabras que
 * imitan al sistema, la ventana de fechas y sus cruces) vive en
 * `@qps/core/notificaciones/patrocinados` (tarea 51-a, ya cerrada): este
 * archivo solo arma los datos que esa validación necesita (las ventanas de
 * las otras campañas), decide si una campaña se puede editar o solo
 * cancelar, y hace las lecturas/escrituras sobre la base.
 *
 * El envío real de los avisos (51-b/51-d) no corre todavía: esto solo
 * guarda la campaña.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isUuid } from '@/lib/metricas'
import { enviarPushATokens, tokensDelUsuario } from '@/lib/notificaciones/envio-admin'
import {
  contenidoAvisoPatrocinado,
  validarTextosCampania,
  validarCampania,
  type ErrorCampania,
  type VentanaCampania,
} from '@qps/core/notificaciones/patrocinados'

type SupabaseUserClient = Awaited<ReturnType<typeof createClient>>

type AdminAuth = { supabase: SupabaseUserClient; userId: string }
type AdminAuthResult = AdminAuth | { error: string }

/** Sesión + rol ADMIN, con el cliente del usuario (para que RLS evalúe a esa persona). */
async function requireAdminSupabase(): Promise<AdminAuthResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()

  if (profile?.role !== 'ADMIN') return { error: 'No tenés permisos de administrador' }

  return { supabase, userId: user.id }
}

const MENSAJE_ERROR_GENERICO = 'No se pudo guardar la campaña. Intentá de nuevo'
const MENSAJE_ERROR_PRUEBA = 'No se pudo enviar la prueba. Intentá de nuevo'
const MENSAJE_ERROR_CANCELAR = 'No se pudo cancelar la campaña. Intentá de nuevo'

function errorGeneral(mensaje: string): { ok: false; errores: ErrorCampania[] } {
  return { ok: false, errores: [{ campo: 'general', mensaje }] }
}

function formaValida(entrada: unknown): entrada is Record<string, unknown> {
  return typeof entrada === 'object' && entrada !== null
}

// ---------------------------------------------------------------------------
// guardarCampania
// ---------------------------------------------------------------------------

export type GuardarCampaniaResult = { ok: true } | { ok: false; errores: ErrorCampania[] }

interface FilaVentana {
  id: string
  starts_at: string
  ends_at: string
}

/**
 * Crea una campaña, o la edita si `entrada.id` viene cargado. Una campaña
 * que ya empezó (`starts_at <= ahora`) no se edita más: solo se cancela con
 * `cancelarCampania`.
 */
export async function guardarCampania(entrada: unknown): Promise<GuardarCampaniaResult> {
  // 1. La forma de la entrada, ANTES de crear ningún cliente.
  if (!formaValida(entrada)) {
    return errorGeneral('La campaña no tiene un formato válido.')
  }

  const idCrudo = entrada.id
  const esEdicion = idCrudo !== undefined && idCrudo !== null
  if (esEdicion && !isUuid(idCrudo)) {
    return errorGeneral('El id de la campaña no es válido.')
  }

  // 2. Sesión + rol admin, con el cliente de la sesión.
  const auth = await requireAdminSupabase()
  if ('error' in auth) return errorGeneral(auth.error)
  const { supabase, userId } = auth

  // 3. Las ventanas de TODAS las campañas (sin filtrar por id: hace falta
  // tanto la propia, para el chequeo de "ya empezó", como las otras, para
  // el cruce que valida `validarCampania`).
  const { data: filas, error: filasError } = await supabase
    .from('sponsored_campaigns')
    .select('id, starts_at, ends_at')

  if (filasError) {
    console.error('guardarCampania: error leyendo las campañas existentes', filasError.code)
    return errorGeneral(MENSAJE_ERROR_GENERICO)
  }

  const todas = (filas ?? []) as FilaVentana[]

  if (esEdicion) {
    const propia = todas.find((fila) => fila.id === idCrudo)
    if (!propia) {
      return errorGeneral('No se encontró la campaña a editar.')
    }
    if (new Date(propia.starts_at).getTime() <= Date.now()) {
      return errorGeneral('Una campaña que ya empezó no se puede editar: cancelala en vez de editarla.')
    }
  }

  const otras: VentanaCampania[] = todas
    .filter((fila) => fila.id !== idCrudo)
    .map((fila) => ({ id: fila.id, startsAt: new Date(fila.starts_at), endsAt: new Date(fila.ends_at) }))

  // 4. Validación de la campaña (títulos, fechas, cruces).
  const resultado = validarCampania(entrada, new Date(), otras)
  if (!resultado.ok) return { ok: false, errores: resultado.errores }

  const { titulo, cuerpo, eventId, url, startsAt, endsAt } = resultado.datos

  // 5. El evento tiene que existir y estar publicado.
  const { data: evento, error: eventoError } = await supabase
    .from('events')
    .select('status')
    .eq('id', eventId)
    .maybeSingle()

  if (eventoError) {
    console.error('guardarCampania: error leyendo el evento', eventoError.code)
    return errorGeneral(MENSAJE_ERROR_GENERICO)
  }
  if (!evento || evento.status !== 'PUBLISHED') {
    return { ok: false, errores: [{ campo: 'eventId', mensaje: 'El evento tiene que estar publicado.' }] }
  }

  // 6. Insert o update. `created_by` SIEMPRE sale de `user.id` de la sesión,
  // nunca de lo que venga en `entrada` (aunque la entrada traiga otro id).
  const payload = {
    title: titulo,
    body: cuerpo,
    event_id: eventId,
    url,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
  }

  if (esEdicion) {
    const { error } = await supabase.from('sponsored_campaigns').update(payload).eq('id', idCrudo as string)
    if (error) {
      console.error('guardarCampania: error al actualizar', error.code)
      return errorGeneral(MENSAJE_ERROR_GENERICO)
    }
  } else {
    const { error } = await supabase.from('sponsored_campaigns').insert({ ...payload, created_by: userId })
    if (error) {
      console.error('guardarCampania: error al crear', error.code)
      return errorGeneral(MENSAJE_ERROR_GENERICO)
    }
  }

  revalidatePath('/admin/avisos')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// enviarmePruebaCampania
// ---------------------------------------------------------------------------

export type PruebaCampaniaResult =
  | { ok: true; simulado: boolean; telefonos: number }
  | { ok: false; errores: ErrorCampania[] }

/**
 * Manda el aviso patrocinado SOLO a los teléfonos del admin logueado (`user.id`
 * de la sesión, nunca un id de la entrada), con el mismo contenido que el
 * envío real (`contenidoAvisoPatrocinado`). No escribe nada: ni
 * `notification_sends`, ni `sponsored_campaigns.sent_at`; no cuenta para el
 * tope semanal. Sin fechas: valida solo textos y evento.
 */
export async function enviarmePruebaCampania(entrada: unknown): Promise<PruebaCampaniaResult> {
  if (!formaValida(entrada) || Array.isArray(entrada)) {
    return errorGeneral('La campaña no tiene un formato válido.')
  }

  const auth = await requireAdminSupabase()
  if ('error' in auth) return errorGeneral(auth.error)
  const { supabase, userId } = auth

  const textos = validarTextosCampania(entrada)
  const errores: ErrorCampania[] = textos.ok ? [] : [...textos.errores]
  const eventId = isUuid(entrada.eventId) ? entrada.eventId : null
  if (!eventId) {
    errores.push({ campo: 'eventId', mensaje: 'El evento es obligatorio y tiene que ser un id válido.' })
  }
  if (!textos.ok || !eventId || errores.length > 0) return { ok: false, errores }

  const { data: evento, error: eventoError } = await supabase
    .from('events')
    .select('status')
    .eq('id', eventId)
    .maybeSingle()
  if (eventoError) {
    console.error('enviarmePruebaCampania: error leyendo el evento', eventoError.code)
    return errorGeneral(MENSAJE_ERROR_PRUEBA)
  }
  if (!evento || evento.status !== 'PUBLISHED') {
    return { ok: false, errores: [{ campo: 'eventId', mensaje: 'El evento tiene que estar publicado.' }] }
  }

  const contenido = contenidoAvisoPatrocinado({ titulo: textos.titulo, cuerpo: textos.cuerpo, eventId })
  if (!contenido) {
    return { ok: false, errores: [{ campo: 'eventId', mensaje: 'El evento no tiene un link válido.' }] }
  }

  const tokens = await tokensDelUsuario(supabase as unknown as SupabaseClient, userId)
  if (tokens === null) return errorGeneral(MENSAJE_ERROR_PRUEBA)
  if (tokens.length === 0) return errorGeneral('No tenés la app con avisos activos en tu teléfono.')

  const resumen = await enviarPushATokens(
    tokens.map((to) => ({
      to,
      title: contenido.title,
      body: contenido.body,
      categoryId: contenido.categoryId,
      data: contenido.data,
    })),
  )
  if (resumen.simulado) return { ok: true, simulado: true, telefonos: tokens.length }
  if (resumen.enviados === 0) return errorGeneral('No se pudo entregar la prueba a tu teléfono.')
  return { ok: true, simulado: false, telefonos: resumen.enviados }
}

// ---------------------------------------------------------------------------
// cancelarCampania
// ---------------------------------------------------------------------------

export type CancelarCampaniaResult = { ok: true } | { ok: false; error: string }

/**
 * Cancela una campaña: si nunca empezó, se borra; si ya empezó y está
 * vigente, se le mueve `ends_at` a este instante (no se puede borrar: eso
 * perdería el registro de lo que ya se mandó, y el CHECK de la tabla no deja
 * dejarla con `ends_at <= starts_at`).
 */
export async function cancelarCampania(id: unknown): Promise<CancelarCampaniaResult> {
  if (!isUuid(id)) return { ok: false, error: 'La campaña no es válida.' }

  const auth = await requireAdminSupabase()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase } = auth

  const { data: campania, error: fetchError } = await supabase
    .from('sponsored_campaigns')
    .select('starts_at, ends_at')
    .eq('id', id)
    .maybeSingle()

  if (fetchError) {
    console.error('cancelarCampania: error leyendo la campaña', fetchError.code)
    return { ok: false, error: MENSAJE_ERROR_CANCELAR }
  }
  if (!campania) {
    return { ok: false, error: 'No se encontró la campaña.' }
  }

  const ahora = new Date()
  const yaEmpezo = new Date(campania.starts_at).getTime() <= ahora.getTime()
  const yaTermino = new Date(campania.ends_at).getTime() <= ahora.getTime()

  if (yaTermino) {
    return { ok: false, error: 'Esa campaña ya terminó: no hay nada para cancelar.' }
  }

  if (yaEmpezo) {
    const { error } = await supabase
      .from('sponsored_campaigns')
      .update({ ends_at: ahora.toISOString() })
      .eq('id', id)
    if (error) {
      console.error('cancelarCampania: error al actualizar', error.code)
      return { ok: false, error: MENSAJE_ERROR_CANCELAR }
    }
  } else {
    const { error } = await supabase.from('sponsored_campaigns').delete().eq('id', id)
    if (error) {
      console.error('cancelarCampania: error al borrar', error.code)
      return { ok: false, error: MENSAJE_ERROR_CANCELAR }
    }
  }

  revalidatePath('/admin/avisos')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// obtenerCampanias
// ---------------------------------------------------------------------------

export type EstadoCampania = 'por-venir' | 'en-envio' | 'terminada' | 'cancelada'

export interface CampaniaParaAdmin {
  id: string
  titulo: string
  cuerpo: string
  eventoId: string | null
  eventoTitulo: string | null
  url: string | null
  startsAt: string
  endsAt: string
  sentAt: string | null
  cargadoPor: string | null
  estado: EstadoCampania
}

interface FilaCampania {
  id: string
  title: string
  body: string
  url: string | null
  event_id: string | null
  starts_at: string
  ends_at: string
  sent_at: string | null
  created_by: string | null
  // `event_id` SÍ tiene FK a `public.events`, así que PostgREST puede
  // embeberlo. `created_by` NO (apunta a `auth.users`): por eso no se
  // embebe acá, y se resuelve con una segunda consulta a `profiles` más
  // abajo (mismo problema que ya apareció en la R50).
  event: { title: string } | null
}

/**
 * Sin una columna de "cancelada" en el esquema
 * (`supabase/migrations/20261018130200_etapa2_campanias_patrocinadas.sql`):
 * cancelar una campaña que ya empezó solo le mueve `ends_at` a un instante
 * pasado (ver `cancelarCampania`), igual que a una que agotó su ventana
 * sola. La única diferencia observable con las columnas que hay es
 * `sent_at`, que el envío real (51-b/51-d, todavía no corre) completa
 * cuando manda al menos un push de esa campaña. Criterio elegido: entre las
 * que ya terminaron (`ends_at <= ahora`), `sent_at` nulo = "Cancelada";
 * `sent_at` con valor = "Terminada". Es un heurístico, no una certeza (una
 * campaña cancelada justo después de haber mandado un envío real se vería
 * como "Terminada"), documentado acá a falta de una columna dedicada.
 */
function clasificar(fila: { starts_at: string; ends_at: string; sent_at: string | null }, ahora: Date): EstadoCampania {
  const inicio = new Date(fila.starts_at).getTime()
  const fin = new Date(fila.ends_at).getTime()
  const momento = ahora.getTime()
  if (momento < inicio) return 'por-venir'
  if (momento < fin) return 'en-envio'
  return fila.sent_at ? 'terminada' : 'cancelada'
}

/** Las campañas por venir, la vigente y las últimas 10 terminadas/canceladas. `null` sin admin. */
export async function obtenerCampanias(): Promise<CampaniaParaAdmin[] | null> {
  const auth = await requireAdminSupabase()
  if ('error' in auth) return null
  const { supabase } = auth

  const { data, error } = await supabase
    .from('sponsored_campaigns')
    .select('id, title, body, url, event_id, starts_at, ends_at, sent_at, created_by, event:events(title)')
    .order('starts_at', { ascending: false })

  if (error || !data) {
    console.error('obtenerCampanias: error de la base', error?.code)
    return []
  }

  const filas = data as unknown as FilaCampania[]

  const idsCreadores = Array.from(
    new Set(filas.map((fila) => fila.created_by).filter((id): id is string => typeof id === 'string')),
  )

  const nombrePorId = new Map<string, string>()
  if (idsCreadores.length > 0) {
    const { data: perfiles } = await supabase.from('profiles').select('id, full_name, email').in('id', idsCreadores)
    for (const perfil of (perfiles ?? []) as Array<{ id: string; full_name: string | null; email: string }>) {
      nombrePorId.set(perfil.id, perfil.full_name || perfil.email)
    }
  }

  const ahora = new Date()
  const conEstado: CampaniaParaAdmin[] = filas.map((fila) => ({
    id: fila.id,
    titulo: fila.title,
    cuerpo: fila.body,
    eventoId: fila.event_id,
    eventoTitulo: fila.event?.title ?? null,
    url: fila.url,
    startsAt: fila.starts_at,
    endsAt: fila.ends_at,
    sentAt: fila.sent_at,
    cargadoPor: fila.created_by ? nombrePorId.get(fila.created_by) ?? null : null,
    estado: clasificar(fila, ahora),
  }))

  const porVenir = conEstado.filter((f) => f.estado === 'por-venir')
  const enEnvio = conEstado.filter((f) => f.estado === 'en-envio')
  const terminadas = conEstado
    .filter((f) => f.estado === 'terminada' || f.estado === 'cancelada')
    .sort((a, b) => new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime())
    .slice(0, 10)

  return [...porVenir, ...enEnvio, ...terminadas]
}
