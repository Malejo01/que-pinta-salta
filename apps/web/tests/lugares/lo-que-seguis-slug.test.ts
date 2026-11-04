// R-1 · Q5-5/Q5-6: `obtenerLoQueSeguis` (Perfil › Lo que seguís) trae el slug
// de cada lugar para enlazar su ficha. tests/radar/seguimiento.test.ts es de
// antes y sus fixtures no tienen slug; tests/lugares/seguir.test.ts solo
// buscaba el texto del select en el fuente. Acá, con el cliente de mentira.
import { describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({ columnas: [] as string[], lugares: [] as unknown[] }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: (tabla: string) => ({
      select: (col: string) => {
        estado.columnas.push(`${tabla}: ${col}`)
        return { eq: async () => ({ data: tabla === 'user_followed_venues' ? estado.lugares : [], error: null }) }
      },
    }),
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { obtenerLoQueSeguis } from '@/lib/actions/radar'

describe('obtenerLoQueSeguis: el slug del lugar', () => {
  it('pide el slug y lo devuelve solo si existe (sin slug, el link de Perfil va por id y redirige)', async () => {
    estado.lugares = [
      { venue: { id: 'v1', name: 'Teatro Provincial', slug: 'teatro-provincial' } },
      { venue: { id: 'v2', name: 'Sin Slug', slug: null } },
      { venue: null },
    ]
    const r = await obtenerLoQueSeguis()
    expect(estado.columnas).toContain('user_followed_venues: venue:venues(id, name, slug)')
    expect(r?.lugares).toEqual([
      { id: 'v1', nombre: 'Teatro Provincial', slug: 'teatro-provincial' },
      { id: 'v2', nombre: 'Sin Slug' },
    ])
  })
})
