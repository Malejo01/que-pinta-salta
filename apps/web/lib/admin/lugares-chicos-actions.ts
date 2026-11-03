'use server'

/**
 * Q5-1 · Acciones de /admin/lugares-chicos: alta, edición, verificación y
 * cambios de estado de las fichas de `lugares_permanentes`.
 *
 * Como lib/admin/lugares-actions.ts: corren con el cliente de la SESIÓN (no el
 * de service role), así la RLS (`is_admin()`) lo vuelve a verificar aunque el
 * código se equivoque. Los datos se validan antes de abrir el cliente. Nunca
 * se loguea el `message` de la base ni un id de persona: solo la acción y el
 * `code`.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/metricas'
import { coordenadasEnSalta } from '@qps/core/mapa/zona'
import { faltantesParaPublicar } from '@qps/core/lugares/permanentes'
import { slugDeLugar } from '@/lib/lugares-chicos/slug'
import {
  leerDeFormData,
  leerFicha,
  leerFuenteVerificada,
  leerMotivoArchivo,
} from '@/lib/lugares-chicos/formulario'

export type EstadoAccionLugar = { ok: boolean; mensaje: string; id?: string } | null

type SupabaseUserClient = Awaited<ReturnType<typeof createClient>>

const RUTA = '/admin/lugares-chicos'

async function requireAdmin(): Promise<{ supabase: SupabaseUserClient; userId: string } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') return { error: 'No tenés permisos de administrador' }
  return { supabase, userId: user.id }
}

function errorBase(accion: string, code: string | undefined, mensaje: string): EstadoAccionLugar {
  console.error(`[lugares-chicos] ${accion}: error de la base`, code ?? 'sin-codigo')
  return { ok: false, mensaje }
}

/**
 * Alta o edición de la ficha. Con `id`: edita (no toca estado ni
 * verificación). Sin `id`: crea la ficha en `borrador`, sobre un venue
 * existente (`venue_id`) o uno nuevo (`nuevo_nombre` + `nueva_direccion`).
 */
export async function guardarLugarChicos(_prev: EstadoAccionLugar, fd: FormData): Promise<EstadoAccionLugar> {
  const leer = leerDeFormData(fd)
  const ficha = leerFicha(leer)
  if (!ficha.ok) return { ok: false, mensaje: ficha.error }

  const id = leer('id')
  if (id !== null && !isUuid(id)) return { ok: false, mensaje: 'La ficha no es válida.' }

  const venueIdElegido = leer('venue_id')
  const nuevoNombre = leer('nuevo_nombre')?.trim().slice(0, 200) ?? ''
  const nuevaDireccion = leer('nueva_direccion')?.trim().slice(0, 300) ?? ''
  if (!id) {
    if (venueIdElegido && !isUuid(venueIdElegido)) return { ok: false, mensaje: 'El lugar elegido no es válido.' }
    if (!venueIdElegido && (nuevoNombre.length < 3 || nuevaDireccion.length < 3)) {
      return { ok: false, mensaje: 'Elegí un lugar existente o cargá nombre y dirección del nuevo.' }
    }
  }
  // La fuente de la carga: la que eligió el admin (verificada) o, si no, «visita» no se asume: hace falta elegirla.
  const fuente = leerFuenteVerificada(leer)
  if (!id && !fuente) return { ok: false, mensaje: 'Elegí de dónde salen los datos (visita, web, redes, llamado u organismo).' }

  const auth = await requireAdmin()
  if ('error' in auth) return { ok: false, mensaje: auth.error }
  const { supabase, userId } = auth

  if (id) {
    const cambios = fuente ? { ...ficha.datos, fuente } : ficha.datos
    const { data, error } = await supabase.from('lugares_permanentes').update(cambios).eq('id', id).select('id')
    if (error) return errorBase('editar', error.code, 'No se pudo guardar la ficha. Probá de nuevo.')
    if (!data || data.length === 0) return { ok: false, mensaje: 'No encontramos esa ficha.' }
    revalidatePath(RUTA)
    return { ok: true, mensaje: 'Ficha guardada.', id }
  }

  let venueId = venueIdElegido
  if (!venueId) {
    const { data: venue, error } = await supabase
      .from('venues')
      .insert({ name: nuevoNombre, address: nuevaDireccion, slug: slugDeLugar(nuevoNombre) })
      .select('id')
      .single()
    if (error?.code === '23505') {
      return { ok: false, mensaje: 'Ya hay un lugar con ese nombre: buscalo arriba y usalo.' }
    }
    if (error || !venue) return errorBase('crear venue', error?.code, 'No se pudo crear el lugar. Probá de nuevo.')
    venueId = venue.id
  }

  const { data: creada, error } = await supabase
    .from('lugares_permanentes')
    .insert({ ...ficha.datos, venue_id: venueId!, fuente: fuente!, estado: 'borrador', cargado_por: userId })
    .select('id')
    .single()
  if (error?.code === '23505') return { ok: false, mensaje: 'Ese lugar ya tiene ficha: editala desde la lista.' }
  if (error || !creada) return errorBase('crear', error?.code, 'No se pudo crear la ficha. Probá de nuevo.')
  revalidatePath(RUTA)
  return { ok: true, mensaje: 'Ficha creada como borrador.', id: creada.id }
}

/** «Verificado hoy»: fecha, quién y de dónde (fuente verificada obligatoria). */
export async function verificarLugarChicos(_prev: EstadoAccionLugar, fd: FormData): Promise<EstadoAccionLugar> {
  const leer = leerDeFormData(fd)
  const id = leer('id')
  if (!isUuid(id)) return { ok: false, mensaje: 'La ficha no es válida.' }
  const fuente = leerFuenteVerificada(leer)
  if (!fuente) return { ok: false, mensaje: 'Para verificar, elegí cómo lo confirmaste (visita, web, redes, llamado u organismo).' }
  const detalle = leer('fuente_detalle')?.trim().slice(0, 300) || null

  const auth = await requireAdmin()
  if ('error' in auth) return { ok: false, mensaje: auth.error }

  const { data, error } = await auth.supabase
    .from('lugares_permanentes')
    .update({ verificado_at: new Date().toISOString(), verificado_por: auth.userId, fuente, fuente_detalle: detalle })
    .eq('id', id)
    .select('id')
  if (error) return errorBase('verificar', error.code, 'No se pudo marcar como verificado.')
  if (!data || data.length === 0) return { ok: false, mensaje: 'No encontramos esa ficha.' }
  revalidatePath(RUTA)
  return { ok: true, mensaje: 'Marcado como verificado hoy.', id }
}

export type AccionEstado = 'publicar' | 'vencido' | 'borrador' | 'archivar'
const ACCIONES: readonly AccionEstado[] = ['publicar', 'vencido', 'borrador', 'archivar']

/** Publicar (si no falta nada), marcar vencido, volver a borrador o archivar con motivo. */
export async function cambiarEstadoLugarChicos(_prev: EstadoAccionLugar, fd: FormData): Promise<EstadoAccionLugar> {
  const leer = leerDeFormData(fd)
  const id = leer('id')
  const accion = leer('accion') as AccionEstado | null
  if (!isUuid(id)) return { ok: false, mensaje: 'La ficha no es válida.' }
  if (!accion || !ACCIONES.includes(accion)) return { ok: false, mensaje: 'Acción desconocida.' }
  const motivo = leerMotivoArchivo(leer)
  if (accion === 'archivar' && !motivo) return { ok: false, mensaje: 'Para archivar, elegí o escribí el motivo.' }

  const auth = await requireAdmin()
  if ('error' in auth) return { ok: false, mensaje: auth.error }
  const { supabase } = auth

  if (accion === 'publicar') {
    const { data: fila, error } = await supabase
      .from('lugares_permanentes')
      .select('tipo, acceso, fuente, verificado_at, venue:venues!inner(latitude, longitude, canonical_venue_id)')
      .eq('id', id)
      .maybeSingle()
    if (error) return errorBase('leer para publicar', error.code, 'No se pudo publicar. Probá de nuevo.')
    if (!fila) return { ok: false, mensaje: 'No encontramos esa ficha.' }
    const venue = Array.isArray(fila.venue) ? fila.venue[0] : fila.venue
    const faltan = faltantesParaPublicar(
      {
        tipo: fila.tipo,
        acceso: fila.acceso,
        fuente: fila.fuente,
        verificado_at: fila.verificado_at,
        venue: {
          latitude: venue?.latitude === null || venue?.latitude === undefined ? null : Number(venue.latitude),
          longitude: venue?.longitude === null || venue?.longitude === undefined ? null : Number(venue.longitude),
          canonical_venue_id: venue?.canonical_venue_id ?? null,
        },
      },
      coordenadasEnSalta,
    )
    if (faltan.length > 0) return { ok: false, mensaje: `Para publicar falta: ${faltan.join('; ')}.` }
  }

  const cambios =
    accion === 'publicar'
      ? { estado: 'publicado', motivo_archivo: null }
      : accion === 'vencido'
        ? { estado: 'vencido' }
        : accion === 'borrador'
          ? { estado: 'borrador', motivo_archivo: null }
          : { estado: 'archivado', motivo_archivo: motivo }

  const { data, error } = await supabase.from('lugares_permanentes').update(cambios).eq('id', id).select('id')
  if (error?.code === '23514') return { ok: false, mensaje: 'La base no lo dejó: revisá verificación y fuente.' }
  if (error) return errorBase(`estado ${accion}`, error.code, 'No se pudo cambiar el estado.')
  if (!data || data.length === 0) return { ok: false, mensaje: 'No encontramos esa ficha.' }
  revalidatePath(RUTA)
  revalidatePath('/mapa')
  const textos: Record<AccionEstado, string> = {
    publicar: 'Publicado.',
    vencido: 'Marcado como vencido: ya no se ve en público.',
    borrador: 'Volvió a borrador.',
    archivar: 'Archivado.',
  }
  return { ok: true, mensaje: textos[accion], id }
}
