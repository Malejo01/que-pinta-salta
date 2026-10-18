// Radar en Cuenta (R27, tarea 27-b): frecuencia del email + las tres listas
// de seguidos (categorías, lugares y cuentas de Instagram). Mismo esquema y
// mismo criterio que la web (`apps/web/lib/actions/radar.ts`): la validación
// la hace `normalizarPreferenciasRadar` de `@qps/core/radar/preferencias`, y
// el guardado hace upsert de `{ user_id, email_frequency }` en
// `user_radar_settings` (sin `email_target`: lo pone la base) y, por cada
// tabla de seguidos, borra lo propio y vuelve a insertar lo nuevo. El
// `user_id` que recibe cada función es siempre el que la pantalla leyó de
// `useSession()`.
import { SITIO } from '@qps/core/metricas/links'
import {
  FRECUENCIAS_RADAR,
  normalizarPreferenciasRadar,
  type EmailFrequency,
  type PreferenciasRadarEntrada,
} from '@qps/core/radar/preferencias'
import {
  cuentaParaSeguir,
  TABLA_SEGUIMIENTO,
  validarSeguimiento,
  type FilaFlyerConCuenta,
} from '@qps/core/radar/seguimiento'
import type { Database } from '@qps/db'
import { MENSAJE_SIN_CONFIGURACION } from '@/lib/mensajes'
import { fetchConTimeout, TIMEOUT_RED_MS } from '@/lib/red'
import { supabase } from '@/lib/supabase'

/**
 * `TABLA_SEGUIMIENTO` (de `@qps/core/radar/seguimiento`) tipa `tabla` como
 * `string`: core no depende de los tipos generados de la base (los
 * comparten web y app). Esta función solo re-angosta ese `string` al tipo
 * que pide `supabase.from(...)`, sin repetir el mapeo de tabla/columna.
 * Mismo helper que `tablaDeSeguimiento` de `apps/web/lib/actions/radar.ts`.
 */
function tablaDeSeguimiento(tabla: string): keyof Database['public']['Tables'] {
  return tabla as keyof Database['public']['Tables']
}

export { MENSAJE_SIN_CONFIGURACION }
export const MENSAJE_ERROR = 'No pudimos cargar tu Radar. Probá de nuevo.'
export const MENSAJE_ERROR_GUARDAR = 'No pudimos guardar tu Radar. Probá de nuevo.'
// Mismo texto que usaría la web para un error de red en esta misma prueba
// (no hay uno literal todavía: es el patrón de `MENSAJE_ERROR_RED` de
// `lib/favoritos.ts`/`lib/datos/*.ts`, adaptado al envío de prueba).
export const MENSAJE_ERROR_RED_PRUEBA = 'No pudimos enviar la prueba. Revisá tu conexión.'

/** Etiquetas en español de `FRECUENCIAS_RADAR`, en el mismo orden. */
export const ETIQUETAS_FRECUENCIA: Record<EmailFrequency, string> = {
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
  disabled: 'Desactivado',
}

const FRECUENCIA_POR_DEFECTO: EmailFrequency = 'weekly'

export interface CategoriaRadar {
  id: string
  name: string
  slug: string
}

export interface LugarRadar {
  id: string
  name: string
}

export interface CuentaInstagramRadar {
  id: string
  display_name: string
  username: string
}

export interface PreferenciasRadar {
  email_frequency: EmailFrequency
  categoryIds: string[]
  venueIds: string[]
  instagramAccountIds: string[]
}

export interface OpcionesRadar {
  categorias: CategoriaRadar[]
  lugares: LugarRadar[]
  cuentasInstagram: CuentaInstagramRadar[]
}

export type ResultadoRadar =
  | { ok: true; preferencias: PreferenciasRadar; opciones: OpcionesRadar }
  | { ok: false; error: string }

export type ResultadoGuardarRadar = { ok: true } | { ok: false; error: string }

/**
 * Preferencias actuales del Radar de `userId` (frecuencia + las tres listas
 * de seguidos) y las opciones para elegir: categorías, lugares canónicos
 * (`canonical_venue_id is null` y `is_placeholder = false`, como la web) y
 * cuentas de Instagram activas. Sin fila en `user_radar_settings`, la
 * frecuencia por defecto es `'weekly'` (igual que la web).
 */
export async function obtenerRadar(userId: string): Promise<ResultadoRadar> {
  if (!supabase) return { ok: false, error: MENSAJE_SIN_CONFIGURACION }

  try {
    const [settings, categoriasSeguidas, lugaresSeguidos, cuentasSeguidas, categorias, lugares, cuentasInstagram] =
      await Promise.all([
        supabase.from('user_radar_settings').select('email_frequency').eq('user_id', userId).maybeSingle(),
        supabase.from('user_followed_categories').select('category_id').eq('user_id', userId),
        supabase.from('user_followed_venues').select('venue_id').eq('user_id', userId),
        supabase.from('user_followed_instagram_accounts').select('instagram_account_id').eq('user_id', userId),
        supabase.from('categories').select('id, name, slug').order('name', { ascending: true }),
        supabase
          .from('venues')
          .select('id, name')
          .is('canonical_venue_id', null)
          .eq('is_placeholder', false)
          .order('name', { ascending: true }),
        supabase
          .from('instagram_accounts')
          .select('id, display_name, username')
          .eq('is_active', true)
          .order('display_name', { ascending: true }),
      ])

    for (const resultado of [settings, categoriasSeguidas, lugaresSeguidos, cuentasSeguidas, categorias, lugares, cuentasInstagram]) {
      if (resultado.error) return { ok: false, error: MENSAJE_ERROR }
    }

    const frecuenciaGuardada = settings.data?.email_frequency ?? ''
    const email_frequency: EmailFrequency = (FRECUENCIAS_RADAR as readonly string[]).includes(frecuenciaGuardada)
      ? (frecuenciaGuardada as EmailFrequency)
      : FRECUENCIA_POR_DEFECTO

    return {
      ok: true,
      preferencias: {
        email_frequency,
        categoryIds: (categoriasSeguidas.data ?? []).map((fila) => fila.category_id),
        venueIds: (lugaresSeguidos.data ?? []).map((fila) => fila.venue_id),
        instagramAccountIds: (cuentasSeguidas.data ?? []).map((fila) => fila.instagram_account_id),
      },
      opciones: {
        categorias: (categorias.data ?? []) as unknown as CategoriaRadar[],
        lugares: (lugares.data ?? []) as unknown as LugarRadar[],
        cuentasInstagram: (cuentasInstagram.data ?? []) as unknown as CuentaInstagramRadar[],
      },
    }
  } catch {
    return { ok: false, error: MENSAJE_ERROR }
  }
}

/**
 * Guarda las preferencias del Radar de `userId`: valida con
 * `normalizarPreferenciasRadar` de core y, si es válido, hace upsert de
 * `{ user_id, email_frequency }` en `user_radar_settings` (sin
 * `email_target`: lo pone la base) y, por cada tabla de seguidos, borra lo
 * propio e inserta la lista nueva (mismo patrón que `updateRadarSettings` de
 * la web).
 */
export async function guardarRadar(userId: string, datos: PreferenciasRadarEntrada): Promise<ResultadoGuardarRadar> {
  if (!supabase) return { ok: false, error: MENSAJE_SIN_CONFIGURACION }

  const normalizado = normalizarPreferenciasRadar(datos)
  if (!normalizado.ok) return { ok: false, error: normalizado.error }
  const { email_frequency, categoryIds, venueIds, instagramAccountIds } = normalizado.datos

  try {
    const { error: errorSettings } = await supabase
      .from('user_radar_settings')
      .upsert({ user_id: userId, email_frequency })
    if (errorSettings) return { ok: false, error: MENSAJE_ERROR_GUARDAR }

    const { error: errorBorrarCategorias } = await supabase
      .from('user_followed_categories')
      .delete()
      .eq('user_id', userId)
    if (errorBorrarCategorias) return { ok: false, error: MENSAJE_ERROR_GUARDAR }
    if (categoryIds.length > 0) {
      const { error: errorCategorias } = await supabase
        .from('user_followed_categories')
        .insert(categoryIds.map((category_id) => ({ user_id: userId, category_id })))
      if (errorCategorias) return { ok: false, error: MENSAJE_ERROR_GUARDAR }
    }

    const { error: errorBorrarLugares } = await supabase.from('user_followed_venues').delete().eq('user_id', userId)
    if (errorBorrarLugares) return { ok: false, error: MENSAJE_ERROR_GUARDAR }
    if (venueIds.length > 0) {
      const { error: errorLugares } = await supabase
        .from('user_followed_venues')
        .insert(venueIds.map((venue_id) => ({ user_id: userId, venue_id })))
      if (errorLugares) return { ok: false, error: MENSAJE_ERROR_GUARDAR }
    }

    const { error: errorBorrarCuentas } = await supabase
      .from('user_followed_instagram_accounts')
      .delete()
      .eq('user_id', userId)
    if (errorBorrarCuentas) return { ok: false, error: MENSAJE_ERROR_GUARDAR }
    if (instagramAccountIds.length > 0) {
      const { error: errorCuentas } = await supabase
        .from('user_followed_instagram_accounts')
        .insert(instagramAccountIds.map((instagram_account_id) => ({ user_id: userId, instagram_account_id })))
      if (errorCuentas) return { ok: false, error: MENSAJE_ERROR_GUARDAR }
    }

    return { ok: true }
  } catch {
    return { ok: false, error: MENSAJE_ERROR_GUARDAR }
  }
}

export type ResultadoCambiarSeguimiento = { ok: true; siguiendo: boolean } | { ok: false; error: string }

/**
 * "+ Seguir" (R47, tarea 47-e, QPS-197): seguir o dejar de seguir un lugar,
 * una cuenta de Instagram o una categoría. Las escrituras sobre
 * `user_followed_*` viven solo acá, en `apps/web/lib/actions/radar.ts` y en
 * `apps/web/lib/cuenta/tablas-personales.ts` (lo exige un test de "una sola
 * copia", 47-q): no se repite este mapeo ni esta lógica en otro archivo.
 *
 * `entrada` se valida con `validarSeguimiento` (de core) ANTES de tocar la
 * base: un tipo desconocido, un id que no es uuid o un `seguir` que no sea
 * un booleano de verdad no llegan a Supabase. `userId` es siempre el que la
 * pantalla leyó de `useSession()`.
 */
export async function cambiarSeguimiento(userId: string, entrada: unknown): Promise<ResultadoCambiarSeguimiento> {
  const validado = validarSeguimiento(entrada)
  if (!validado.ok) return { ok: false, error: validado.error }

  if (!supabase) return { ok: false, error: MENSAJE_SIN_CONFIGURACION }

  const { tipo, id, seguir } = validado
  const { tabla, columna } = TABLA_SEGUIMIENTO[tipo]

  try {
    if (seguir) {
      // La PK es (user_id, <columna>): un 23505 significa que ya lo seguía, éxito.
      // `[columna]: id` es una clave calculada (no un literal): Supabase
      // tipa `insert` rechazando cualquier objeto con firma de índice, así
      // que no hay forma de que esto tipe sin un `as never` — es el mismo
      // costo que paga `apps/web/lib/actions/radar.ts` por generalizar con
      // `TABLA_SEGUIMIENTO` en vez de repetir un `insert` literal por tipo.
      const fila: Record<string, string> = { user_id: userId, [columna]: id }
      const { error } = await supabase.from(tablaDeSeguimiento(tabla)).insert(fila as never)
      if (error && error.code !== '23505') return { ok: false, error: MENSAJE_ERROR_GUARDAR }
    } else {
      // Mismo motivo que el `insert` de arriba: con `tabla` angosta a
      // `keyof Database['public']['Tables']` (todas las tablas, no solo las
      // 3 de seguimiento), el tipo de fila de `.delete()` se vuelve tan
      // amplio que ni siquiera "user_id" tipa como columna sin `as never`.
      const { error } = await supabase
        .from(tablaDeSeguimiento(tabla))
        .delete()
        .eq('user_id' as never, userId)
        .eq(columna as never, id)
      if (error) return { ok: false, error: MENSAJE_ERROR_GUARDAR }
    }
    return { ok: true, siguiendo: seguir }
  } catch {
    return { ok: false, error: MENSAJE_ERROR_GUARDAR }
  }
}

export interface SeguimientoDeEvento {
  lugar: { id: string; nombre: string; siguiendo: boolean } | null
  cuenta: { id: string; username: string; siguiendo: boolean } | null
}

/**
 * El lugar y la cuenta de Instagram que la ficha de `eventId` puede ofrecer
 * seguir (mismas consultas que `obtenerSeguimientoDeEvento` de
 * `apps/web/lib/actions/radar.ts`).
 *
 * El lugar sale de `events.venue_id` (join a `venues`).
 *
 * La cuenta sale de `instagram_flyers` filtrando por
 * `ai_metadata->>event_id` (no por `events.ai_metadata.flyer_id`): ese
 * vínculo lo escribe el procesamiento de flyers con el id que devolvió la
 * deduplicación, así que vale también cuando el flyer se fusionó con un
 * evento de ticketera; `events.ai_metadata.flyer_id` solo existe en los
 * eventos *creados* desde un flyer. `cuentaParaSeguir` (de core) elige la
 * cuenta activa del flyer más reciente.
 *
 * Limitación aceptada: `instagram_flyers` es pública solo con `status =
 * 'ACTIVE'`, así que un flyer archivado no va a aparecer acá (no se intenta
 * rodear).
 *
 * `siguiendo` solo se calcula con `userId`: sin sesión es siempre `false` y
 * no se consulta ninguna tabla `user_followed_*`. Si algo falla:
 * `{ lugar: null, cuenta: null }` — la ficha sigue andando, solo sin el botón.
 */
export async function obtenerSeguimientoDeEvento(
  eventId: string,
  userId: string | null
): Promise<SeguimientoDeEvento> {
  if (!supabase) return { lugar: null, cuenta: null }

  try {
    const [{ data: filaEvento, error: errorEvento }, { data: filasFlyers, error: errorFlyers }] = await Promise.all([
      supabase.from('events').select('venue_id, venue:venues(id, name)').eq('id', eventId).maybeSingle(),
      supabase
        .from('instagram_flyers')
        .select('published_at, account:instagram_accounts(id, username, is_active)')
        .eq('ai_metadata->>event_id', eventId),
    ])

    if (errorEvento || errorFlyers) return { lugar: null, cuenta: null }

    const venue = (filaEvento?.venue ?? null) as { id: string; name: string } | null
    const cuentaCandidata = cuentaParaSeguir((filasFlyers ?? []) as FilaFlyerConCuenta[])

    if (!userId) {
      return {
        lugar: venue ? { id: venue.id, nombre: venue.name, siguiendo: false } : null,
        cuenta: cuentaCandidata
          ? { id: cuentaCandidata.id, username: cuentaCandidata.username, siguiendo: false }
          : null,
      }
    }

    const [respuestaLugar, respuestaCuenta] = await Promise.all([
      venue
        ? supabase
            .from('user_followed_venues')
            .select('venue_id')
            .eq('user_id', userId)
            .eq('venue_id', venue.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      cuentaCandidata
        ? supabase
            .from('user_followed_instagram_accounts')
            .select('instagram_account_id')
            .eq('user_id', userId)
            .eq('instagram_account_id', cuentaCandidata.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])

    return {
      lugar: venue ? { id: venue.id, nombre: venue.name, siguiendo: respuestaLugar.data !== null } : null,
      cuenta: cuentaCandidata
        ? { id: cuentaCandidata.id, username: cuentaCandidata.username, siguiendo: respuestaCuenta.data !== null }
        : null,
    }
  } catch {
    return { lugar: null, cuenta: null }
  }
}

export interface LoQueSeguis {
  lugares: { id: string; nombre: string }[]
  cuentas: { id: string; username: string }[]
  categorias: { id: string; nombre: string }[]
}

/**
 * Todo lo que sigue `userId`: lugares, cuentas de Instagram y categorías,
 * con su nombre (mismas consultas que `obtenerLoQueSeguis` de
 * `apps/web/lib/actions/radar.ts`). Si una de las tres falla, esa lista
 * queda vacía; las otras dos se devuelven igual.
 */
export async function obtenerLoQueSeguis(userId: string): Promise<LoQueSeguis> {
  if (!supabase) return { lugares: [], cuentas: [], categorias: [] }

  const [respuestaLugares, respuestaCuentas, respuestaCategorias] = await Promise.all([
    supabase.from('user_followed_venues').select('venue:venues(id, name)').eq('user_id', userId),
    supabase
      .from('user_followed_instagram_accounts')
      .select('account:instagram_accounts(id, username)')
      .eq('user_id', userId),
    supabase.from('user_followed_categories').select('category:categories(id, name)').eq('user_id', userId),
  ])

  const lugares = respuestaLugares.error
    ? []
    : ((respuestaLugares.data ?? []) as Array<{ venue: { id: string; name: string } | null }>)
        .map((fila) => fila.venue)
        .filter((venue): venue is { id: string; name: string } => venue !== null)
        .map((venue) => ({ id: venue.id, nombre: venue.name }))

  const cuentas = respuestaCuentas.error
    ? []
    : ((respuestaCuentas.data ?? []) as Array<{ account: { id: string; username: string } | null }>)
        .map((fila) => fila.account)
        .filter((account): account is { id: string; username: string } => account !== null)
        .map((account) => ({ id: account.id, username: account.username }))

  const categorias = respuestaCategorias.error
    ? []
    : ((respuestaCategorias.data ?? []) as Array<{ category: { id: string; name: string } | null }>)
        .map((fila) => fila.category)
        .filter((category): category is { id: string; name: string } => category !== null)
        .map((category) => ({ id: category.id, nombre: category.name }))

  return { lugares, cuentas, categorias }
}

/**
 * `true` si `profiles.role` de `userId` es `'ADMIN'`. Es solo para decidir
 * si se arma el botón "Enviar un email de prueba" (comodidad de UI): el que
 * decide de verdad es el servidor, en `POST /api/radar/prueba`. Cualquier
 * problema (sin cliente, sin fila, error de red) da `false`, nunca explota.
 */
export async function esAdminRadar(userId: string): Promise<boolean> {
  if (!supabase) return false
  try {
    const { data, error } = await supabase.from('profiles').select('role').eq('id', userId).single()
    if (error || !data) return false
    return data.role === 'ADMIN'
  } catch {
    return false
  }
}

export type ResultadoPruebaRadar = { ok: true; mensaje: string } | { ok: false; mensaje: string }

/**
 * Pide al sitio (`${SITIO}/api/radar/prueba`, R36 36-c) que mande un correo
 * de prueba del Radar al email de la sesión. `accessToken` va en
 * `Authorization: Bearer …`: el servidor es quien decide si es admin (RLS +
 * `profiles.role`), este `fetch` nunca manda el email ni ningún otro dato
 * del destinatario. Mismo timeout que el cliente de Supabase
 * (`fetchConTimeout`/`TIMEOUT_RED_MS` de `lib/red.ts`), para no quedar
 * esperando para siempre con la red caída a mitad de camino.
 */
export async function probarEnvioRadar(accessToken: string): Promise<ResultadoPruebaRadar> {
  try {
    const respuesta = await fetchConTimeout(fetch, TIMEOUT_RED_MS)(`${SITIO}/api/radar/prueba`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const datos = (await respuesta.json().catch(() => null)) as { success?: boolean; message?: string } | null
    if (!datos || typeof datos.message !== 'string') {
      return { ok: false, mensaje: MENSAJE_ERROR_RED_PRUEBA }
    }
    return datos.success ? { ok: true, mensaje: datos.message } : { ok: false, mensaje: datos.message }
  } catch {
    return { ok: false, mensaje: MENSAJE_ERROR_RED_PRUEBA }
  }
}
