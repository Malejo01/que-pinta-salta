// Radar en Cuenta (R27, tarea 27-b): frecuencia del email + las tres listas
// de seguidos (categorías, lugares y cuentas de Instagram). Mismo esquema y
// mismo criterio que la web (`apps/web/lib/actions/radar.ts`): la validación
// la hace `normalizarPreferenciasRadar` de `@qps/core/radar/preferencias`, y
// el guardado hace upsert de `{ user_id, email_frequency }` en
// `user_radar_settings` (sin `email_target`: lo pone la base) y, por cada
// tabla de seguidos, borra lo propio y vuelve a insertar lo nuevo. El
// `user_id` que recibe cada función es siempre el que la pantalla leyó de
// `useSession()`.
import {
  FRECUENCIAS_RADAR,
  normalizarPreferenciasRadar,
  type EmailFrequency,
  type PreferenciasRadarEntrada,
} from '@qps/core/radar/preferencias'
import { MENSAJE_SIN_CONFIGURACION } from '@/lib/mensajes'
import { supabase } from '@/lib/supabase'

export { MENSAJE_SIN_CONFIGURACION }
export const MENSAJE_ERROR = 'No pudimos cargar tu Radar. Probá de nuevo.'
export const MENSAJE_ERROR_GUARDAR = 'No pudimos guardar tu Radar. Probá de nuevo.'

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
