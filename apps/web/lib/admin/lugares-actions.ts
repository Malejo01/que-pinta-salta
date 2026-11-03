'use server'

/**
 * Acciones del panel /admin/lugares (R53, tarea 53-c): guardar o quitar una
 * ubicación cargada a mano, y (Q5-16, decisión nº7) confirmar o descartar la
 * ubicación que sugirió Nominatim sin un match seguro. Todas corren con el cliente del usuario
 * (`createClient()` de lib/supabase/server.ts), no con el de service role:
 * las policies de `update` sobre `venues` dependen de `is_admin()` evaluado
 * sobre `auth.uid()` de la sesión real (RLS lo verifica aunque el código se
 * equivoque). Mismo patrón de `requireAdminSupabase()` que
 * lib/admin/duplicate-actions.ts (que no lo exporta: se copia).
 *
 * `venueId` y `texto` se validan ANTES de crear el cliente de Supabase: es
 * un endpoint público, una llamada con basura no tiene que llegar a abrir
 * una conexión.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/metricas'
import { parsearCoordenadas } from '@/lib/venues/coordenadas-manuales'
import { crearClienteNominatim, type ClienteNominatim } from '@/lib/venues/geocodificacion/nominatim'
import {
  consultaDeBusquedaAdmin,
  normalizarTextoBusqueda,
  resultadosParaAdmin,
} from '@/lib/venues/geocodificacion/busqueda-admin'
import { FILTRO_NO_MANUAL, sugerenciaVacia } from '@/lib/venues/geocodificacion/sugerencia'

export type UbicacionManualResult = { ok: true } | { ok: false; error: string }

type SupabaseUserClient = Awaited<ReturnType<typeof createClient>>

/** Sesión + rol ADMIN, con el cliente del usuario (para que RLS evalúe a esa persona). */
async function requireAdminSupabase(): Promise<{ supabase: SupabaseUserClient } | { error: string }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()

  if (profile?.role !== 'ADMIN') return { error: 'No tienes permisos de administrador' }

  return { supabase }
}

const MENSAJE_ERROR_GUARDAR = 'No se pudo guardar la ubicación. Intentá de nuevo'
const MENSAJE_ERROR_QUITAR = 'No se pudo quitar la ubicación. Intentá de nuevo'
const MENSAJE_ERROR_CONFIRMAR = 'No se pudo confirmar la ubicación. Intentá de nuevo'
const MENSAJE_ERROR_DESCARTAR = 'No se pudo descartar la sugerencia. Intentá de nuevo'
const MENSAJE_SIN_SUGERENCIA = 'Este lugar ya no tiene una ubicación sugerida'
const MENSAJE_YA_A_MANO = 'Este lugar ya tiene una ubicación cargada a mano: no se pisa'

/**
 * Guarda `texto` (coordenadas o link de OpenStreetMap, ver
 * lib/venues/coordenadas-manuales.ts) como la ubicación a mano del lugar
 * `venueId`.
 */
export async function guardarUbicacionManual(venueId: unknown, texto: unknown): Promise<UbicacionManualResult> {
  if (!isUuid(venueId)) return { ok: false, error: 'El lugar no es válido' }

  const coords = parsearCoordenadas(texto)
  if ('error' in coords) return { ok: false, error: coords.error }

  const auth = await requireAdminSupabase()
  if ('error' in auth) return { ok: false, error: auth.error }

  const { data, error } = await auth.supabase
    .from('venues')
    .update({
      latitude: coords.lat,
      longitude: coords.lng,
      geocode_source: 'manual',
      geocoded_at: new Date().toISOString(),
      // Q5-16: con la ubicación a mano, la sugerencia de Nominatim ya no hace falta.
      ...sugerenciaVacia(),
    })
    .eq('id', venueId)
    .select('id')

  if (error) {
    // Nunca el message crudo de la base; nunca un id de persona (solo la
    // acción y el código de error).
    console.error('guardarUbicacionManual: error de la base', error.code)
    return { ok: false, error: MENSAJE_ERROR_GUARDAR }
  }

  if (!data || data.length === 0) {
    return { ok: false, error: 'No se encontró el lugar' }
  }

  revalidatePath('/admin/lugares')
  return { ok: true }
}

/** Un solo cliente por proceso (perezoso): serializa los pedidos y respeta 1 por segundo. */
let clienteNominatim: ClienteNominatim | null = null

function obtenerClienteNominatim(): ClienteNominatim {
  clienteNominatim ??= crearClienteNominatim({
    fetch: (url, init) => fetch(url, init),
    ahora: Date.now,
    esperar: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    intervaloMinMs: 1100,
    maxReintentos: 0,
    timeoutMs: 8000,
  })
  return clienteNominatim
}

export type BuscarDireccionResult =
  | { ok: true; resultados: Array<{ lat: number; lng: number; etiqueta: string }> }
  | { ok: false; error: string }

/**
 * Busca una dirección en Nominatim (una consulta por llamada, solo admin) y
 * devuelve hasta 3 puntos dentro de Salta. El texto se valida antes de crear
 * el cliente de Supabase; sin sesión de admin nunca se llama a la red.
 */
export async function buscarDireccionLugar(texto: unknown): Promise<BuscarDireccionResult> {
  const q = normalizarTextoBusqueda(texto)
  if (q === null) return { ok: false, error: 'Escribí una dirección de al menos 3 letras' }

  const auth = await requireAdminSupabase()
  if ('error' in auth) return { ok: false, error: auth.error }

  let resultado
  try {
    resultado = await obtenerClienteNominatim().buscar(consultaDeBusquedaAdmin(q))
  } catch {
    console.error('buscarDireccionLugar: fallo inesperado')
    return { ok: false, error: 'OpenStreetMap no respondió. Probá en un rato.' }
  }

  if (resultado.tipo === 'bloqueado') {
    console.error('buscarDireccionLugar: bloqueado')
    return { ok: false, error: 'OpenStreetMap no está disponible ahora. Ubicá el pin a mano.' }
  }
  if (resultado.tipo === 'error') {
    console.error('buscarDireccionLugar: error')
    return { ok: false, error: 'OpenStreetMap no respondió. Probá en un rato.' }
  }

  return { ok: true, resultados: resultadosParaAdmin(resultado.resultados) }
}

/** Quita la ubicación a mano (o la que hubiera) de `venueId`. */
export async function quitarUbicacion(venueId: unknown): Promise<UbicacionManualResult> {
  if (!isUuid(venueId)) return { ok: false, error: 'El lugar no es válido' }

  const auth = await requireAdminSupabase()
  if ('error' in auth) return { ok: false, error: auth.error }

  const { data, error } = await auth.supabase
    .from('venues')
    .update({
      latitude: null,
      longitude: null,
      geocode_source: null,
      geocoded_at: null,
    })
    .eq('id', venueId)
    .select('id')

  if (error) {
    console.error('quitarUbicacion: error de la base', error.code)
    return { ok: false, error: MENSAJE_ERROR_QUITAR }
  }

  if (!data || data.length === 0) {
    return { ok: false, error: 'No se encontró el lugar' }
  }

  revalidatePath('/admin/lugares')
  return { ok: true }
}

/**
 * Q5-16 (decisión nº7): confirma la ubicación que sugirió Nominatim para
 * `venueId` (`geocode_sugerencia_*`, la guarda el script cuando no hubo un
 * match seguro). La copia a `latitude`/`longitude` con `geocode_source:
 * 'nominatim'` y limpia la sugerencia. Nunca pisa una ubicación cargada a
 * mano: lo chequea antes de escribir y, por si cambió en el medio, también el
 * filtro del propio update.
 */
export async function confirmarSugerenciaUbicacion(venueId: unknown): Promise<UbicacionManualResult> {
  if (!isUuid(venueId)) return { ok: false, error: 'El lugar no es válido' }

  const auth = await requireAdminSupabase()
  if ('error' in auth) return { ok: false, error: auth.error }

  const { data: venue, error: errorLectura } = await auth.supabase
    .from('venues')
    .select('id, geocode_source, geocode_sugerencia_lat, geocode_sugerencia_lng')
    .eq('id', venueId)
    .maybeSingle()

  if (errorLectura) {
    console.error('confirmarSugerenciaUbicacion: error de la base', errorLectura.code)
    return { ok: false, error: MENSAJE_ERROR_CONFIRMAR }
  }
  if (!venue) return { ok: false, error: 'No se encontró el lugar' }
  if (venue.geocode_source === 'manual') return { ok: false, error: MENSAJE_YA_A_MANO }
  const lat = venue.geocode_sugerencia_lat
  const lng = venue.geocode_sugerencia_lng
  if (lat === null || lng === null) return { ok: false, error: MENSAJE_SIN_SUGERENCIA }

  const { data, error } = await auth.supabase
    .from('venues')
    .update({
      latitude: lat,
      longitude: lng,
      geocode_source: 'nominatim',
      geocoded_at: new Date().toISOString(),
      ...sugerenciaVacia(),
    })
    .eq('id', venueId)
    // Si alguien la cargó a mano o la descartó mientras tanto, no se toca.
    .or(FILTRO_NO_MANUAL)
    .not('geocode_sugerencia_lat', 'is', null)
    .select('id')

  if (error) {
    console.error('confirmarSugerenciaUbicacion: error de la base', error.code)
    return { ok: false, error: MENSAJE_ERROR_CONFIRMAR }
  }

  if (!data || data.length === 0) {
    return { ok: false, error: 'El lugar cambió mientras tanto. Recargá la página' }
  }

  revalidatePath('/admin/lugares')
  return { ok: true }
}

/**
 * Q5-16: descarta la ubicación sugerida de `venueId` (las cuatro columnas
 * `geocode_sugerencia_*` en null). No toca `latitude`/`longitude` ni
 * `geocode_intentado_at`: el lugar vuelve a la regla de los 30 días de la
 * corrida programada.
 */
export async function descartarSugerenciaUbicacion(venueId: unknown): Promise<UbicacionManualResult> {
  if (!isUuid(venueId)) return { ok: false, error: 'El lugar no es válido' }

  const auth = await requireAdminSupabase()
  if ('error' in auth) return { ok: false, error: auth.error }

  const { data, error } = await auth.supabase
    .from('venues')
    .update(sugerenciaVacia())
    .eq('id', venueId)
    .select('id')

  if (error) {
    console.error('descartarSugerenciaUbicacion: error de la base', error.code)
    return { ok: false, error: MENSAJE_ERROR_DESCARTAR }
  }

  if (!data || data.length === 0) {
    return { ok: false, error: 'No se encontró el lugar' }
  }

  revalidatePath('/admin/lugares')
  return { ok: true }
}
