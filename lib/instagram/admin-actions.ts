'use server'

import { createAdminClient, createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { looksLikeAddress } from '@/lib/venues/address-guard'
import { resolveVenueId } from '@/lib/venues/resolve'

async function ensureAdmin() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { supabase, user: null, error: 'No autenticado' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'ADMIN') {
    return { supabase, user: null, error: 'Sin permisos de administrador' }
  }

  return { supabase, user, error: null }
}

/**
 * Guarda del lado del servidor para QPS-069: el admin carga
 * `default_venue_name` a mano y a veces pega una dirección ("Balcarce 980")
 * en vez del nombre del lugar. Eso nunca resuelve contra un venue real y, si
 * alguna ruta de ingesta lo autocrea, deja un venue basura con la dirección
 * como nombre.
 *
 * `resolveVenueId` se llama siempre con `autocreate: false`: esta función
 * nunca crea un venue, solo sugiere el canónico si ya existe uno que matchee.
 * Si el admin insiste (`confirmAddressLike === true`), se deja pasar: puede
 * ser un falso positivo ("Sala 1" ya está cubierto por la heurística, pero
 * puede haber otros).
 *
 * `resolve_venue_id` tiene revocado el EXECUTE para `authenticated` (solo
 * `service_role` puede correrla, ver supabase/migrations/20261002190000 y
 * 20261006130000): con el cliente de sesión la RPC devuelve "permission
 * denied" y `resolveVenueId` lo atrapa devolviendo `null` siempre, así que la
 * sugerencia nunca aparecía. Por eso esta función (y el `select` de `venues`
 * que la sigue, también de solo lectura) usan el cliente de service role.
 * El alta/edición de `instagram_accounts` sigue con el cliente de sesión en
 * los llamadores, que es el que respeta RLS.
 */
async function checkAddressLikeVenue(
  venueName: string | null,
  confirmAddressLike: boolean | undefined
): Promise<{ error: string; suggestion: string | null } | null> {
  if (!venueName || confirmAddressLike === true) return null
  if (!looksLikeAddress(venueName)) return null

  const privileged = createAdminClient()
  const venueId = await resolveVenueId(privileged, venueName, { autocreate: false })
  let suggestion: string | null = null
  if (venueId) {
    const { data } = await privileged
      .from('venues')
      .select('name')
      .eq('id', venueId)
      .single()
    suggestion = data?.name ?? null
  }

  return {
    error: `"${venueName}" parece una dirección, no el nombre de un lugar.`,
    suggestion,
  }
}

export async function createInstagramAccount(
  username: string,
  displayName: string,
  notes?: string,
  defaultVenueName?: string,
  defaultMapsUrl?: string,
  defaultCategory?: string,
  confirmAddressLike?: boolean
) {
  const { supabase, error } = await ensureAdmin()
  if (error) return { error }

  // Limpiar username (quitar @ si lo puso)
  const cleanUsername = username.replace(/^@/, '').trim().toLowerCase()

  if (!cleanUsername || !displayName.trim()) {
    return { error: 'Username y nombre son requeridos' }
  }

  const cleanVenueName = defaultVenueName?.trim() || null
  const addressCheck = await checkAddressLikeVenue(cleanVenueName, confirmAddressLike)
  if (addressCheck) return addressCheck

  const { data, error: insertError } = await supabase
    .from('instagram_accounts')
    .insert({
      username: cleanUsername,
      display_name: displayName.trim(),
      notes: notes?.trim() || null,
      default_venue_name: cleanVenueName,
      default_maps_url: defaultMapsUrl?.trim() || null,
      default_category: defaultCategory?.trim() || 'boliches',
    })
    .select()
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      return { error: `La cuenta @${cleanUsername} ya existe` }
    }
    return { error: insertError.message }
  }

  revalidatePath('/admin/instagram')
  return { account: data, error: null }
}

export async function updateInstagramAccount(
  id: string,
  data: {
    display_name?: string
    notes?: string | null
    is_active?: boolean
    default_venue_name?: string | null
    default_maps_url?: string | null
    default_category?: string
  },
  confirmAddressLike?: boolean
) {
  const { supabase, error } = await ensureAdmin()
  if (error) return { error }

  if (data.default_venue_name !== undefined) {
    // QPS-075: si el nombre no cambió respecto al que ya está guardado en la
    // cuenta, no se repite la guarda de dirección (p. ej. al editar solo la
    // categoría de una cuenta con un nombre "tipo dirección" ya aceptado).
    const { data: existing, error: existingError } = await supabase
      .from('instagram_accounts')
      .select('default_venue_name')
      .eq('id', id)
      .maybeSingle()

    if (existingError) {
      // No bloquea: la guarda corre de más (lado seguro, ver abajo), pero
      // hay que poder notar que QPS-075 dejó de funcionar.
      console.error('[updateInstagramAccount] fallo leyendo default_venue_name actual:', existingError.message)
    }

    const newVenueName = data.default_venue_name?.trim() || null
    const currentVenueName = existing?.default_venue_name?.trim() || null
    // Guardamos el mismo valor normalizado que comparamos arriba, así lo que
    // se compara y lo que se persiste coinciden (si no, el próximo select
    // seguiría viendo el valor crudo sin trim y la comparación fallaría).
    data.default_venue_name = newVenueName

    if (newVenueName !== currentVenueName) {
      const addressCheck = await checkAddressLikeVenue(newVenueName, confirmAddressLike)
      if (addressCheck) return addressCheck
    }
  }

  const { error: updateError } = await supabase
    .from('instagram_accounts')
    .update(data)
    .eq('id', id)

  if (updateError) {
    return { error: updateError.message }
  }

  revalidatePath('/admin/instagram')
  revalidatePath('/')
  return { error: null }
}

export async function toggleInstagramAccount(id: string, isActive: boolean) {
  return updateInstagramAccount(id, { is_active: isActive })
}

export async function deleteInstagramAccount(id: string) {
  const { supabase, error } = await ensureAdmin()
  if (error) return { error }

  // Eliminar la cuenta (los flyers se borran en cascada por la FK)
  const { error: deleteError } = await supabase
    .from('instagram_accounts')
    .delete()
    .eq('id', id)

  if (deleteError) {
    return { error: deleteError.message }
  }

  revalidatePath('/admin/instagram')
  revalidatePath('/')
  return { error: null }
}
