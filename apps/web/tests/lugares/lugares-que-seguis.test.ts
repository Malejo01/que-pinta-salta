// R-1 · «Lugares que seguís» en Mis eventos (/favoritos, Q5-6) renderizado de
// verdad, con Supabase de mentira: cuántos eventos próximos tiene cada lugar,
// el link a su ficha y qué pasa si algo falla. Antes, tests/lugares/seguir.test.ts
// solo leía el fuente y probaba el conteo puro.
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Consulta = { tabla: string; columnas: string; filtros: [string, string, unknown][] }
const estado = vi.hoisted(() => ({
  seguidos: { data: [] as unknown, error: null as unknown },
  eventos: [] as { venue_id: string | null }[],
  consultas: [] as Consulta[],
  tira: false,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    if (estado.tira) throw new Error('sin cookies')
    return {
      from(tabla: string) {
        const c: Consulta = { tabla, columnas: '', filtros: [] }
        estado.consultas.push(c)
        const b: Record<string, unknown> = {
          select: (col: string) => ((c.columnas = col), b),
          then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
            Promise.resolve(tabla === 'user_followed_venues' ? estado.seguidos : { data: estado.eventos, error: null }).then(res, rej),
        }
        for (const m of ['eq', 'in', 'gte', 'limit']) b[m] = (col: string, v: unknown) => (c.filtros.push([m, col, v]), b)
        return b
      },
    }
  },
}))

import { LugaresQueSeguis } from '@/components/lugares/lugares-que-seguis'

const TEATRO = '11111111-1111-4111-8111-111111111111'
const PLAZA = '22222222-2222-4222-8222-222222222222'
const SIN_SLUG = '33333333-3333-4333-8333-333333333333'
const AHORA = new Date('2026-11-03T18:00:00Z')

async function html(userId = 'u1') {
  const el = await LugaresQueSeguis({ userId })
  return el === null ? null : renderToStaticMarkup(el)
}

beforeEach(() => {
  estado.seguidos = {
    data: [
      { venue: { id: TEATRO, name: 'Teatro Provincial', slug: 'teatro-provincial' } },
      { venue: { id: PLAZA, name: 'Plaza Güemes', slug: 'plaza-guemes' } },
      { venue: { id: SIN_SLUG, name: 'Ágora', slug: null } },
      { venue: null },
    ],
    error: null,
  }
  estado.eventos = [{ venue_id: TEATRO }, { venue_id: TEATRO }, { venue_id: PLAZA }]
  estado.consultas = []
  estado.tira = false
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AHORA)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('LugaresQueSeguis (web)', () => {
  it('cada lugar con sus eventos próximos y el link a la ficha (por slug, o por id si no tiene), en orden alfabético', async () => {
    const h = (await html())!
    const links = [...h.matchAll(/<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span><span[^>]*>([^<]+)<\/span><\/a>/g)].map((m) => [m[1], m[2], m[3]])
    expect(links).toEqual([
      [`/lugar/${SIN_SLUG}`, 'Ágora', 'Sin eventos próximos'],
      ['/lugar/plaza-guemes', 'Plaza Güemes', '1 evento próximo'],
      ['/lugar/teatro-provincial', 'Teatro Provincial', '2 eventos próximos'],
    ])
  })

  it('los eventos que cuentan: publicados, de esos lugares, desde ahora; lo seguido, del usuario', async () => {
    await html('u1')
    const [seguidos, eventos] = estado.consultas
    expect(seguidos!.filtros).toEqual([['eq', 'user_id', 'u1']])
    expect(eventos!.tabla).toBe('events')
    expect(eventos!.filtros).toContainEqual(['eq', 'status', 'PUBLISHED'])
    expect(eventos!.filtros).toContainEqual(['in', 'venue_id', [SIN_SLUG, PLAZA, TEATRO]])
    expect(eventos!.filtros).toContainEqual(['gte', 'start_date', AHORA.toISOString()])
  })

  it('sin lugares seguidos: la línea que explica cómo seguir uno, y no se lee events', async () => {
    estado.seguidos = { data: [], error: null }
    expect(await html()).toContain('Todavía no seguís ningún lugar.')
    expect(estado.consultas.map((c) => c.tabla)).toEqual(['user_followed_venues'])
  })

  it('si falla la lectura (o el cliente), la sección no se dibuja: Mis eventos sigue', async () => {
    estado.seguidos = { data: null, error: { code: '42501' } }
    expect(await html()).toBeNull()
    estado.tira = true
    expect(await html()).toBeNull()
  })
})
