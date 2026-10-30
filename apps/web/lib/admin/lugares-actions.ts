'use server'

/**
 * Acciones del panel /admin/lugares (R53, tarea 53-c): guardar o quitar una
 * ubicación cargada a mano. Las dos corren con el cliente del usuario
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
