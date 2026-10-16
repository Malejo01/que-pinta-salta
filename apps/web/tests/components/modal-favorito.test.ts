// El corazón en los dos modales de evento (tarea 30-b):
//  - `lib/favoritos/es-favorito.ts` (`esEventoFavorito`): la misma consulta que
//    usaba la ficha (`app/evento/[id]/page.tsx`), compartida ahora con la ruta
//    interceptada (`app/@modal/(.)evento/[id]/page.tsx`). Tres casos: sin
//    sesión, favorito, no favorito. Nunca mezcla favoritos de otro usuario.
//  - Las dos páginas de evento llaman a la consulta compartida (detector
//    estático sobre el archivo real), no la reimplementan.
//  - Los dos modales (`event-modal-wrapper.tsx` de la ruta interceptada y
//    `event-modal.tsx` de `/buscar`) renderizan `FavoriteButton` junto al
//    título con el `isFavorite` que reciben; la ruta interceptada también
//    el `ShareButton` (30-a).
//  - `/buscar` le pasa al modal el favorito ya traído en la lista de ids
//    (sin una consulta por evento).
//
// Sin red ni base: todo mockeado o leído del archivo fuente, sin DOM (entorno
// `node` de vitest.config).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { esEventoFavorito } from '@/lib/favoritos/es-favorito'

// apps/web/tests/components -> apps/web/tests -> apps/web
const ROOT = join(__dirname, '..', '..')
const read = (relPath: string) => readFileSync(join(ROOT, relPath), 'utf8')

const USUARIO = '11111111-1111-4111-8111-111111111111'
const OTRO_USUARIO = '22222222-2222-4222-8222-222222222222'
const EVENTO_FAVORITO = '33333333-3333-4333-8333-333333333333'
const EVENTO_NO_FAVORITO = '44444444-4444-4444-8444-444444444444'

/**
 * Doble de Supabase para `user_favorites`: encadena `select().eq().eq().maybeSingle()`
 * y deja rastro de qué se consultó, para poder afirmar que la consulta es
 * exactamente la misma que usaba la ficha.
 */
function fakeSupabase(filas: Array<{ user_id: string; event_id: string }>) {
  const llamadas: Array<{ table: string; columns: string; filtros: Array<[string, unknown]> }> = []

  const client = {
    from: (table: string) => {
      const filtros: Array<[string, unknown]> = []
      const builder = {
        select: (columns: string) => {
          llamadas.push({ table, columns, filtros })
          return builder
        },
        eq: (col: string, v: unknown) => {
          filtros.push([col, v])
          return builder
        },
        maybeSingle: async () => {
          const userIdFiltro = filtros.find(([c]) => c === 'user_id')?.[1]
          const eventIdFiltro = filtros.find(([c]) => c === 'event_id')?.[1]
          const match = filas.find((f) => f.user_id === userIdFiltro && f.event_id === eventIdFiltro)
          return { data: match ? { id: 'fav-1' } : null, error: null }
        },
      }
      return builder
    },
  } as unknown as SupabaseClient

  return { client, llamadas }
}

describe('esEventoFavorito: la consulta compartida (ficha + los dos modales)', () => {
  it('sin sesión: false, sin consultar la base', async () => {
    const { client, llamadas } = fakeSupabase([{ user_id: USUARIO, event_id: EVENTO_FAVORITO }])

    expect(await esEventoFavorito(client, null, EVENTO_FAVORITO)).toBe(false)
    expect(await esEventoFavorito(client, undefined, EVENTO_FAVORITO)).toBe(false)
    expect(llamadas).toEqual([])
  })

  it('favorito: true', async () => {
    const { client } = fakeSupabase([{ user_id: USUARIO, event_id: EVENTO_FAVORITO }])

    expect(await esEventoFavorito(client, USUARIO, EVENTO_FAVORITO)).toBe(true)
  })

  it('no favorito (mismo usuario, otro evento): false', async () => {
    const { client } = fakeSupabase([{ user_id: USUARIO, event_id: EVENTO_FAVORITO }])

    expect(await esEventoFavorito(client, USUARIO, EVENTO_NO_FAVORITO)).toBe(false)
  })

  it('nunca mezcla favoritos de otro usuario: mismo evento, favorito de otro usuario -> false', async () => {
    const { client } = fakeSupabase([{ user_id: OTRO_USUARIO, event_id: EVENTO_FAVORITO }])

    expect(await esEventoFavorito(client, USUARIO, EVENTO_FAVORITO)).toBe(false)
  })

  it('consulta exactamente user_favorites: select(id), eq(user_id), eq(event_id)', async () => {
    const { client, llamadas } = fakeSupabase([{ user_id: USUARIO, event_id: EVENTO_FAVORITO }])

    await esEventoFavorito(client, USUARIO, EVENTO_FAVORITO)

    expect(llamadas).toHaveLength(1)
    expect(llamadas[0]).toEqual({
      table: 'user_favorites',
      columns: 'id',
      filtros: [
        ['user_id', USUARIO],
        ['event_id', EVENTO_FAVORITO],
      ],
    })
  })
})

describe('la ficha y la ruta interceptada usan la consulta compartida (no la reimplementan)', () => {
  it('app/evento/[id]/page.tsx (ficha) llama a esEventoFavorito', () => {
    const src = read('app/evento/[id]/page.tsx')

    expect(src).toContain('from "@/lib/favoritos/es-favorito"')
    expect(src).toContain('esEventoFavorito(supabase, user.id, id)')
    // Ya no arma la consulta a mano.
    expect(src).not.toContain(".from('user_favorites')")
  })

  it('app/@modal/(.)evento/[id]/page.tsx (ruta interceptada) llama a esEventoFavorito', () => {
    const src = read('app/@modal/(.)evento/[id]/page.tsx')

    expect(src).toContain('from "@/lib/favoritos/es-favorito"')
    expect(src).toContain('esEventoFavorito(supabase, user.id, id)')
  })
})

describe('los dos modales de evento renderizan el corazón (FavoriteButton)', () => {
  it('components/event-modal-wrapper.tsx (ruta interceptada): FavoriteButton junto al título, más ShareButton (30-a)', () => {
    const src = read('components/event-modal-wrapper.tsx')

    expect(src).toContain('import { FavoriteButton } from "@/components/favorite-button"')
    expect(src).toContain('import { ShareButton } from "@/components/share-button"')
    expect(src).toContain('isFavorite?: boolean')
    expect(src).toMatch(/<FavoriteButton[\s\S]*?itemId={event\.id}[\s\S]*?type="event"[\s\S]*?initialIsFavorite={isFavorite}/)
    expect(src).toMatch(/<ShareButton[\s\S]*?eventId={event\.id}/)
  })

  it('components/event-modal.tsx (/buscar): FavoriteButton junto al título', () => {
    const src = read('components/event-modal.tsx')

    expect(src).toContain('import { FavoriteButton } from "@/components/favorite-button"')
    expect(src).toContain('isFavorite?: boolean')
    expect(src).toMatch(/<FavoriteButton[\s\S]*?itemId={event\.id}[\s\S]*?type="event"[\s\S]*?initialIsFavorite={isFavorite}/)
  })

  it('favorite-button.tsx no se tocó (lo compara otra ronda)', () => {
    // No podemos diffear git desde el test; sólo nos aseguramos de no haberlo
    // tocado nosotros: el archivo sigue sin ninguna marca de esta tarea.
    const src = read('components/favorite-button.tsx')
    expect(src).not.toContain('esEventoFavorito')
  })
})

describe('/buscar: el modal usa los favoritos ya traídos, no una consulta por evento', () => {
  it('app/buscar/page.tsx trae los favoritos una sola vez con getUserFavorites()', () => {
    const src = read('app/buscar/page.tsx')
    expect(src).toContain('getUserFavorites()')
  })

  it('app/buscar/buscar-content.tsx le pasa al EventModal el favorito calculado de la lista ya traída', () => {
    const src = read('app/buscar/buscar-content.tsx')
    expect(src).toMatch(/<EventModal[\s\S]*?isFavorite={!!selectedEvent && favorites\.includes\(selectedEvent\.id\)}/)
  })
})
