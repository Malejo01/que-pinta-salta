// Q6-8: `GET /api/app/aviso-equipo?dia=` (¿el equipo mandó un aviso ese día de
// Salta?) y su regla pura de core. Sin red ni base: se mockea
// '@/lib/supabase/server'. Cada test importa la ruta de nuevo
// (vi.resetModules) para empezar con el limitador en memoria vacío.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RUTA_AVISO_EQUIPO_DEL_DIA, rangoDiaAvisoEquipo } from '@qps/core/notificaciones/equipo'
import { saltaWallClockToDate } from '@qps/core/date-format'

const createAdminClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: (...a: unknown[]) => createAdminClient(...a),
  createClient: vi.fn(),
}))

// Jueves 5/11/2026, 12:00 de Salta.
const JUEVES = saltaWallClockToDate('2026-11-05T12:00:00')

type Filtro = [string, string, unknown]

function crearAdmin(resultado: { data: unknown; error: unknown } | 'tira' = { data: [], error: null }) {
  const filtros: Filtro[] = []
  const tablas: string[] = []
  const columnas: string[] = []
  const cliente = {
    from: vi.fn((tabla: string) => {
      tablas.push(tabla)
      const q = {
        select: (c: string) => {
          columnas.push(c)
          return q
        },
        eq: (c: string, v: unknown) => (filtros.push(['eq', c, v]), q),
        in: (c: string, v: unknown) => (filtros.push(['in', c, v]), q),
        gte: (c: string, v: unknown) => (filtros.push(['gte', c, v]), q),
        lt: (c: string, v: unknown) => (filtros.push(['lt', c, v]), q),
        limit: async (n: number) => {
          filtros.push(['limit', 'n', n])
          if (resultado === 'tira') throw new Error('se cayó la base')
          return resultado
        },
      }
      return q
    }),
  }
  createAdminClient.mockReturnValue(cliente)
  return { cliente, filtros, tablas, columnas }
}

function pedido(query: string, ip = '200.1.1.1') {
  return new Request(`http://localhost:3000${RUTA_AVISO_EQUIPO_DEL_DIA}${query}`, { headers: { 'x-forwarded-for': ip } })
}

async function ruta() {
  vi.resetModules()
  return (await import('@/app/api/app/aviso-equipo/route')).GET
}

let errores: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  createAdminClient.mockReset()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(JUEVES)
  errores = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('rangoDiaAvisoEquipo (core, puro)', () => {
  it('ayer, hoy y mañana de Salta: el rango UTC del día de Salta (UTC-3)', () => {
    expect(rangoDiaAvisoEquipo('2026-11-05', JUEVES)).toEqual({ desde: '2026-11-05T03:00:00.000Z', hasta: '2026-11-06T03:00:00.000Z' })
    expect(rangoDiaAvisoEquipo('2026-11-04', JUEVES)).not.toBeNull()
    expect(rangoDiaAvisoEquipo('2026-11-06', JUEVES)).not.toBeNull()
  })

  it('el día de Salta, no el de UTC: el jueves a las 22 de Salta (ya viernes en UTC) «hoy» sigue siendo jueves', () => {
    const jueves22 = saltaWallClockToDate('2026-11-05T22:00:00')
    expect(rangoDiaAvisoEquipo('2026-11-04', jueves22)).not.toBeNull()
    expect(rangoDiaAvisoEquipo('2026-11-07', jueves22)).toBeNull()
  })

  it.each([
    ['otro día (no sirve para recorrer el historial)', '2026-10-01'],
    ['pasado mañana', '2026-11-07'],
    ['fecha que no existe', '2026-02-30'],
    ['mes 13', '2026-13-01'],
    ['otro formato', '05/11/2026'],
    ['con hora', '2026-11-05T00:00'],
    ['vacío', ''],
    ['no texto', 20261105],
    ['null', null],
  ] as const)('rechaza: %s', (_caso, dia) => {
    expect(rangoDiaAvisoEquipo(dia, JUEVES)).toBeNull()
  })
})

describe('GET /api/app/aviso-equipo', () => {
  it('sin aviso ese día: { hubo: false }, caché corta en la CDN y ninguna en el teléfono', async () => {
    const { filtros, tablas, columnas } = crearAdmin({ data: [], error: null })
    const res = await (await ruta())(pedido('?dia=2026-11-05'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, dia: '2026-11-05', hubo: false })
    expect(res.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=60')
    expect(tablas).toEqual(['notification_sends'])
    // Solo existencia: ni ids de usuario ni tokens.
    expect(columnas).toEqual(['id'])
    expect(filtros).toEqual([
      ['eq', 'kind', 'anuncio'],
      ['in', 'status', ['SUCCESS', 'PENDIENTE']],
      ['gte', 'sent_at', '2026-11-05T03:00:00.000Z'],
      ['lt', 'sent_at', '2026-11-06T03:00:00.000Z'],
      ['limit', 'n', 1],
    ])
  })

  it('con aviso ese día: { hubo: true } y caché más larga (un aviso que salió no se deshace)', async () => {
    crearAdmin({ data: [{ id: 'x' }], error: null })
    const res = await (await ruta())(pedido('?dia=2026-11-05'))
    expect(await res.json()).toEqual({ ok: true, dia: '2026-11-05', hubo: true })
    expect(res.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=3600')
  })

  it.each([['sin dia', ''], ['dia raro', '?dia=hoy'], ['dia lejano', '?dia=2026-10-01'], ['dia repetido raro', '?dia=2026-11-05%20']])(
    '400 sin tocar la base: %s',
    async (_caso, query) => {
      crearAdmin()
      const res = await (await ruta())(pedido(query))
      expect(res.status).toBe(400)
      expect(res.headers.get('cache-control')).toBe('no-store')
      expect(createAdminClient).not.toHaveBeenCalled()
    },
  )

  it('si la base falla o tira: 500 sin caché (la app programa como siempre) y el log solo lleva el code', async () => {
    crearAdmin({ data: null, error: { code: '42P01', message: 'detalle interno' } })
    const r1 = await (await ruta())(pedido('?dia=2026-11-05'))
    expect(r1.status).toBe(500)
    expect(r1.headers.get('cache-control')).toBe('no-store')
    expect(JSON.stringify(errores.mock.calls)).not.toContain('detalle interno')

    crearAdmin('tira')
    const r2 = await (await ruta())(pedido('?dia=2026-11-05'))
    expect(r2.status).toBe(500)
  })

  it('límite por IP (en memoria): 429 con Retry-After', async () => {
    crearAdmin()
    const GET = await ruta()
    let ultimo: Response | null = null
    for (let i = 0; i < 601; i++) ultimo = await GET(pedido('?dia=2026-11-05', '9.9.9.9'))
    expect(ultimo!.status).toBe(429)
    expect(ultimo!.headers.get('retry-after')).toBeTruthy()
    // Otra IP sigue pasando.
    expect((await GET(pedido('?dia=2026-11-05', '8.8.8.8'))).status).toBe(200)
  })

  it('route.ts solo exporta nombres estándar de Next (GET y dynamic)', () => {
    const src = readFileSync(resolve(__dirname, '../../app/api/app/aviso-equipo/route.ts'), 'utf8')
    const exportados = [...src.matchAll(/^export\s+(?:async\s+)?(?:const|function)\s+(\w+)/gm)].map((m) => m[1]).sort()
    expect(exportados).toEqual(['GET', 'dynamic'])
  })
})
