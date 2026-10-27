// Sin red ni base. Las acciones de lib/admin/publicidad-actions.ts (R58, 58-c)
// corren SIEMPRE con el cliente de la sesión: forma de la entrada ANTES de
// abrir el cliente, sesión, rol ADMIN y recién después la escritura. El doble
// de Supabase es un constructor encadenable que registra cada llamada
// (tabla, operación, valores, filtros) y contesta lo que diga el test.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))

const createClient = vi.fn()
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- la firma variádica permite el spread de más abajo
const createAdminClient = vi.fn((..._args: unknown[]) => {
  throw new Error('publicidad-actions.ts no debería usar el cliente admin')
})
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...a: unknown[]) => createClient(...a),
  createAdminClient: (...a: unknown[]) => createAdminClient(...a),
}))

import {
  aprobarCiclo,
  cambiarAprobacionAutomatica,
  cargarAudienciaYTipoCambio,
  obtenerPanelPublicidad,
  reanudarPushPatrocinado,
} from '@/lib/admin/publicidad-actions'

type Resultado = { data: unknown; error: { code?: string; message: string } | null }
type Llamada = {
  tabla: string
  op: 'select' | 'update' | 'insert'
  valores: Record<string, unknown> | null
  columnas: string | null
  filtros: Array<[string, string, unknown]>
}

const ADMIN_ID = '99999999-9999-4999-8999-999999999999'
const CICLO = '2026-11-01'

const OK_VACIO: Resultado = { data: [], error: null }

function construirCliente(config: {
  user?: { id: string } | null
  role?: string | null
  responder?: (llamada: Llamada) => Resultado | undefined
}) {
  const llamadas: Llamada[] = []

  const client = {
    auth: { getUser: async () => ({ data: { user: config.user === undefined ? { id: ADMIN_ID } : config.user } }) },
    from(tabla: string) {
      if (tabla === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: config.role === null ? null : { role: config.role ?? 'ADMIN' },
              }),
            }),
          }),
        }
      }
      const llamada: Llamada = { tabla, op: 'select', valores: null, columnas: null, filtros: [] }
      const builder: Record<string, unknown> = {}
      const encadenar = (nombre: string) => (...args: unknown[]) => {
        if (nombre === 'select') {
          if (llamada.op === 'select') llamada.columnas = String(args[0])
        } else if (nombre === 'update') {
          llamada.op = 'update'
          llamada.valores = args[0] as Record<string, unknown>
        } else if (nombre === 'insert') {
          llamada.op = 'insert'
          llamada.valores = args[0] as Record<string, unknown>
        } else if (['eq', 'in', 'lt', 'gte'].includes(nombre)) {
          llamada.filtros.push([nombre, String(args[0]), args[1]])
        }
        return builder
      }
      for (const n of ['select', 'update', 'insert', 'eq', 'in', 'lt', 'gte', 'order', 'limit']) builder[n] = encadenar(n)
      builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
        llamadas.push(llamada)
        return Promise.resolve(config.responder?.(llamada) ?? OK_VACIO).then(resolve, reject)
      }
      return builder
    },
  }
  return { client, llamadas }
}

function setup(config: Parameters<typeof construirCliente>[0] = {}) {
  const db = construirCliente(config)
  createClient.mockResolvedValue(db.client)
  return db
}

const escrituras = (llamadas: Llamada[]) => llamadas.filter((l) => l.op !== 'select')

beforeEach(() => {
  createClient.mockReset()
  createAdminClient.mockClear()
  revalidatePath.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('entrada inválida: error SIN abrir el cliente', () => {
  it.each([
    ['ciclo que no es día 1', () => aprobarCiclo({ ciclo: '2026-11-15' })],
    ['ciclo con mes 13', () => aprobarCiclo({ ciclo: '2026-13-01' })],
    ['entrada que no es objeto', () => aprobarCiclo('2026-11-01')],
    ['carga: audiencia negativa', () => cargarAudienciaYTipoCambio({ ciclo: CICLO, audienciaWeb28d: -1 })],
    ['carga: audiencia decimal', () => cargarAudienciaYTipoCambio({ ciclo: CICLO, audienciaWeb28d: 10.5 })],
    ['carga: audiencia pasada de 10.000.000', () => cargarAudienciaYTipoCambio({ ciclo: CICLO, audienciaWeb28d: 10_000_001 })],
    ['carga: tipo de cambio 100', () => cargarAudienciaYTipoCambio({ ciclo: CICLO, tipoCambio: 100 })],
    ['carga: tipo de cambio 5001', () => cargarAudienciaYTipoCambio({ ciclo: CICLO, tipoCambio: 5001 })],
    ['carga: tipo de cambio como texto', () => cargarAudienciaYTipoCambio({ ciclo: CICLO, tipoCambio: '1530' })],
    ['carga: ni audiencia ni tipo de cambio', () => cargarAudienciaYTipoCambio({ ciclo: CICLO })],
    ['interruptor: activar como texto', () => cambiarAprobacionAutomatica({ activar: 'true' })],
    ['interruptor: sin entrada', () => cambiarAprobacionAutomatica(undefined)],
  ])('%s', async (_nombre, correr) => {
    const res = await correr()
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('INVALID')
    expect(createClient).not.toHaveBeenCalled()
  })
})

describe('sin sesión o sin admin: no se escribe', () => {
  const acciones: Array<[string, () => Promise<{ ok: boolean }>]> = [
    ['aprobarCiclo', () => aprobarCiclo({ ciclo: CICLO })],
    ['cargarAudienciaYTipoCambio', () => cargarAudienciaYTipoCambio({ ciclo: CICLO, audienciaWeb28d: 490 })],
    ['cambiarAprobacionAutomatica', () => cambiarAprobacionAutomatica({ activar: true })],
    ['reanudarPushPatrocinado', () => reanudarPushPatrocinado()],
  ]

  it.each(acciones)('%s sin sesión: AUTH_REQUIRED', async (_n, correr) => {
    const db = setup({ user: null })
    const res = (await correr()) as { ok: boolean; error?: string }
    expect(res).toMatchObject({ ok: false, error: 'AUTH_REQUIRED' })
    expect(db.llamadas).toHaveLength(0)
  })

  it.each(acciones)('%s con rol USER: FORBIDDEN', async (_n, correr) => {
    const db = setup({ role: 'USER' })
    const res = (await correr()) as { ok: boolean; error?: string }
    expect(res).toMatchObject({ ok: false, error: 'FORBIDDEN' })
    expect(db.llamadas).toHaveLength(0)
  })

  it('obtenerPanelPublicidad: null sin admin', async () => {
    const db = setup({ role: 'USER' })
    expect(await obtenerPanelPublicidad()).toBeNull()
    expect(db.llamadas).toHaveLength(0)
  })
})

describe('aprobarCiclo', () => {
  const FILA_PRECIO: Resultado = { data: [{ id: 'p1' }], error: null }

  it('un ciclo sin ninguna fila en ad_prices no se aprueba y no escribe nada', async () => {
    const db = setup({
      responder: (l) => (l.tabla === 'ad_prices' && l.op === 'select' ? { data: [], error: null } : undefined),
    })
    const res = await aprobarCiclo({ ciclo: CICLO })
    expect(res).toEqual({ ok: false, error: 'ESTADO', mensaje: 'El ciclo no tiene precios: no se puede aprobar.' })
    expect(escrituras(db.llamadas)).toHaveLength(0)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('aprueba el ciclo con approved_by de getUser() y después los precios', async () => {
    const db = setup({
      responder: (l) => {
        if (l.tabla === 'ad_prices' && l.op === 'select') return FILA_PRECIO
        return l.tabla === 'ad_price_cycles' && l.op === 'update' ? { data: [{ ciclo: CICLO }], error: null } : undefined
      },
    })
    const res = await aprobarCiclo({ ciclo: CICLO, approved_by: 'otro-usuario', approvedBy: 'otro-usuario' })
    expect(res).toEqual({ ok: true })

    const w = escrituras(db.llamadas)
    expect(w.map((l) => l.tabla)).toEqual(['ad_price_cycles', 'ad_prices'])
    expect(w[0].valores).toMatchObject({ estado: 'aprobado', approved_by: ADMIN_ID })
    expect(typeof w[0].valores?.approved_at).toBe('string')
    expect(w[0].filtros).toContainEqual(['eq', 'estado', 'propuesto'])
    expect(w[1].valores).toEqual({ estado: 'aprobado' })
    expect(w[1].filtros).toContainEqual(['eq', 'ciclo', CICLO])
    expect(revalidatePath).toHaveBeenCalledWith('/admin/publicidad')
    expect(revalidatePath).toHaveBeenCalledWith('/anunciantes')
  })

  it('un ciclo ya aprobado con precios propuestos: solo completa los precios', async () => {
    const db = setup({
      responder: (l) => {
        if (l.tabla === 'ad_prices' && l.op === 'select') return FILA_PRECIO
        if (l.tabla === 'ad_price_cycles' && l.op === 'update') return { data: [], error: null }
        if (l.tabla === 'ad_price_cycles' && l.op === 'select') return { data: [{ estado: 'aprobado' }], error: null }
        return undefined
      },
    })
    const res = await aprobarCiclo({ ciclo: CICLO })
    expect(res).toEqual({ ok: true })
    const precios = escrituras(db.llamadas).filter((l) => l.tabla === 'ad_prices')
    expect(precios).toHaveLength(1)
    expect(precios[0].valores).toEqual({ estado: 'aprobado' })
  })

  it('un ciclo descartado: ESTADO y no toca los precios', async () => {
    const db = setup({
      responder: (l) => {
        if (l.tabla === 'ad_prices' && l.op === 'select') return FILA_PRECIO
        if (l.tabla === 'ad_price_cycles' && l.op === 'update') return { data: [], error: null }
        if (l.tabla === 'ad_price_cycles' && l.op === 'select') return { data: [{ estado: 'descartado' }], error: null }
        return undefined
      },
    })
    const res = await aprobarCiclo({ ciclo: CICLO })
    expect(res).toMatchObject({ ok: false, error: 'ESTADO' })
    expect(escrituras(db.llamadas).some((l) => l.tabla === 'ad_prices')).toBe(false)
  })

  it('si fallan los precios, el error lo dice y no filtra ids al log', async () => {
    setup({
      responder: (l) => {
        if (l.tabla === 'ad_prices' && l.op === 'select') return FILA_PRECIO
        if (l.tabla === 'ad_price_cycles') return { data: [{ ciclo: CICLO }], error: null }
        if (l.tabla === 'ad_prices') return { data: null, error: { code: '42501', message: 'boom ' + ADMIN_ID } }
        return undefined
      },
    })
    const res = await aprobarCiclo({ ciclo: CICLO })
    expect(res).toMatchObject({ ok: false, error: 'DB_ERROR' })
    if (!res.ok) expect(res.mensaje).toMatch(/Volvé a tocar "Aprobar"/)
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(ADMIN_ID)
  })
})

describe('cargarAudienciaYTipoCambio', () => {
  const CICLO_ACTUAL = {
    ciclo: CICLO,
    estado: 'propuesto',
    audiencia_web_28d: 300,
    mau_app_28d: null,
    dispositivos_push: null,
    fuente_audiencia: 'vercel',
    tipo_cambio: 1400,
    fuente_tipo_cambio: 'anterior',
  }

  function responder(opts: { estado?: string; filasPrecio?: string[] } = {}) {
    const conFila = new Set(opts.filasPrecio ?? ['destacado-3', 'destacado-7', 'destacado-14', 'pack-lanzamiento', 'plan-mensual', 'plan-rrpp'])
    return (l: Llamada): Resultado | undefined => {
      if (l.tabla === 'ad_price_cycles' && l.op === 'select') {
        if (l.filtros.some(([op, col]) => op === 'lt' && col === 'ciclo')) return { data: [], error: null } // sin anterior
        return { data: [{ ...CICLO_ACTUAL, estado: opts.estado ?? 'propuesto' }], error: null }
      }
      if (l.tabla === 'ad_price_cycles' && l.op === 'update') return { data: [{ ciclo: CICLO }], error: null }
      if (l.tabla === 'ad_prices' && l.op === 'update') {
        const producto = l.filtros.find(([, col]) => col === 'producto')?.[2] as string
        return { data: conFila.has(producto) ? [{ id: 'x' }] : [], error: null }
      }
      return undefined
    }
  }

  it('recalcula con audiencia 490 y dólar 1.530 (los precios de la prueba de aceptación) y solo hace update', async () => {
    const db = setup({ responder: responder() })
    const res = await cargarAudienciaYTipoCambio({ ciclo: CICLO, audienciaWeb28d: 490, tipoCambio: 1530 })
    expect(res).toEqual({ ok: true, sinFila: [] })

    expect(db.llamadas.some((l) => l.op === 'insert')).toBe(false)

    const cicloUpdate = db.llamadas.find((l) => l.tabla === 'ad_price_cycles' && l.op === 'update')
    expect(cicloUpdate?.valores).toMatchObject({
      audiencia_web_28d: 490,
      audiencia: 490,
      fuente_audiencia: 'manual',
      tramo_calculado: 500,
      tramo_vigente: 500,
      cambio_tramo_desde: null,
      tipo_cambio: 1530,
      fuente_tipo_cambio: 'manual',
    })

    const esperado: Record<string, [number, number]> = {
      'destacado-3': [8500, 6000],
      'destacado-7': [14000, 10000],
      'destacado-14': [24000, 17000],
      'pack-lanzamiento': [20000, 14000],
      'plan-mensual': [42000, 29500],
      'plan-rrpp': [14500, 10000],
    }
    const precios = db.llamadas.filter((l) => l.tabla === 'ad_prices' && l.op === 'update')
    expect(precios).toHaveLength(6)
    for (const p of precios) {
      const producto = p.filtros.find(([, col]) => col === 'producto')?.[2] as string
      expect(p.valores?.precio_ars, producto).toBe(esperado[producto][0])
      expect(p.valores?.precio_fundador_ars, producto).toBe(esperado[producto][1])
    }
    expect(revalidatePath).toHaveBeenCalledWith('/admin/publicidad')
  })

  it('solo audiencia: no pisa el tipo de cambio ni su fuente', async () => {
    const db = setup({ responder: responder() })
    await cargarAudienciaYTipoCambio({ ciclo: CICLO, audienciaWeb28d: 490 })
    const cicloUpdate = db.llamadas.find((l) => l.tabla === 'ad_price_cycles' && l.op === 'update')
    expect(cicloUpdate?.valores).not.toHaveProperty('tipo_cambio')
    expect(cicloUpdate?.valores).not.toHaveProperty('fuente_tipo_cambio')
  })

  it('un producto sin fila en ad_prices no se crea: el resultado lo avisa', async () => {
    const db = setup({ responder: responder({ filasPrecio: ['destacado-3', 'destacado-7'] }) })
    const res = await cargarAudienciaYTipoCambio({ ciclo: CICLO, audienciaWeb28d: 490, tipoCambio: 1530 })
    expect(res).toMatchObject({ ok: true })
    if (res.ok) expect(res.sinFila).toEqual(['destacado-14', 'pack-lanzamiento', 'plan-mensual', 'plan-rrpp'])
    expect(db.llamadas.some((l) => l.op === 'insert')).toBe(false)
  })

  it('un ciclo que ya no está propuesto: ESTADO y no escribe nada', async () => {
    const db = setup({ responder: responder({ estado: 'aprobado' }) })
    const res = await cargarAudienciaYTipoCambio({ ciclo: CICLO, audienciaWeb28d: 490 })
    expect(res).toMatchObject({ ok: false, error: 'ESTADO' })
    expect(escrituras(db.llamadas)).toHaveLength(0)
  })

  it('los precios del ciclo anterior se leen solo en estado aprobado (igual que el cron)', async () => {
    const db = setup({
      responder: (l) => {
        if (l.tabla === 'ad_price_cycles' && l.op === 'select') {
          if (l.filtros.some(([op, col]) => op === 'lt' && col === 'ciclo')) {
            return {
              data: [
                { ciclo: '2026-10-01', audiencia: 490, tramo_vigente: 500, tramo_calculado: 500, cambio_tramo_desde: null, factor_hero: 1, factor_push: 1 },
              ],
              error: null,
            }
          }
          return { data: [CICLO_ACTUAL], error: null }
        }
        if (l.tabla === 'ad_prices' && l.op === 'select') return { data: [], error: null }
        if (l.op === 'update') return { data: [{ ciclo: CICLO, id: 'x' }], error: null }
        return undefined
      },
    })
    await cargarAudienciaYTipoCambio({ ciclo: CICLO, audienciaWeb28d: 490 })
    const lecturaPrecios = db.llamadas.find((l) => l.tabla === 'ad_prices' && l.op === 'select')
    expect(lecturaPrecios?.filtros).toContainEqual(['eq', 'ciclo', '2026-10-01'])
    expect(lecturaPrecios?.filtros).toContainEqual(['eq', 'estado', 'aprobado'])
  })

  it('calcula la ocupación de los dos meses con Σ ocupados / Σ cupos', async () => {
    // Hero ocupado > 0,8 en septiembre y octubre: el factor sube 15% (con anterior de factor 1).
    const db = setup({
      responder: (l) => {
        if (l.tabla === 'ad_price_cycles' && l.op === 'select') {
          if (l.filtros.some(([op, col]) => op === 'lt' && col === 'ciclo')) {
            return {
              data: [
                {
                  ciclo: '2026-10-01',
                  audiencia: 490,
                  tramo_vigente: 500,
                  tramo_calculado: 500,
                  cambio_tramo_desde: null,
                  factor_hero: 1,
                  factor_push: 1,
                },
              ],
              error: null,
            }
          }
          return { data: [CICLO_ACTUAL], error: null }
        }
        if (l.tabla === 'ad_prices' && l.op === 'select') return { data: [], error: null }
        if (l.tabla === 'ad_occupancy_daily') {
          return {
            data: [
              { day: '2026-09-10', hero_ocupados: 9, hero_cupos: 10, push_cupos_usados: 0, push_cupos: 1 },
              { day: '2026-10-10', hero_ocupados: 9, hero_cupos: 10, push_cupos_usados: 0, push_cupos: 1 },
            ],
            error: null,
          }
        }
        if (l.op === 'update') return { data: [{ ciclo: CICLO, id: 'x' }], error: null }
        return undefined
      },
    })
    await cargarAudienciaYTipoCambio({ ciclo: CICLO, audienciaWeb28d: 490 })
    const cicloUpdate = db.llamadas.find((l) => l.tabla === 'ad_price_cycles' && l.op === 'update')
    expect(cicloUpdate?.valores?.factor_hero).toBe(1.15)
    expect(cicloUpdate?.valores?.factor_push).toBe(0.9)
  })
})

describe('cambiarAprobacionAutomatica', () => {
  it('éxito: update de ad_settings (id = true) con updated_by de getUser()', async () => {
    const db = setup()
    const res = await cambiarAprobacionAutomatica({ activar: true, updated_by: 'otro' })
    expect(res).toEqual({ ok: true })
    const w = escrituras(db.llamadas)
    expect(w).toHaveLength(1)
    expect(w[0].tabla).toBe('ad_settings')
    expect(w[0].valores).toEqual({ aprobacion_automatica: true, updated_by: ADMIN_ID })
    expect(w[0].filtros).toContainEqual(['eq', 'id', true])
  })

  it('el error 23514 del trigger se traduce a castellano', async () => {
    setup({ responder: () => ({ data: null, error: { code: '23514', message: 'La aprobación automática necesita 3 ciclos aprobados a mano' } }) })
    const res = await cambiarAprobacionAutomatica({ activar: true })
    expect(res).toEqual({
      ok: false,
      error: 'TRIGGER',
      mensaje: 'La aprobación automática necesita 3 ciclos aprobados a mano.',
    })
  })

  it('otro error de la base: mensaje genérico, log solo con el código', async () => {
    setup({ responder: () => ({ data: null, error: { code: '57014', message: 'timeout' } }) })
    const res = await cambiarAprobacionAutomatica({ activar: false })
    expect(res).toMatchObject({ ok: false, error: 'DB_ERROR' })
    expect(console.error).toHaveBeenCalledWith('cambiarAprobacionAutomatica: error de la base', '57014')
  })
})

describe('reanudarPushPatrocinado', () => {
  it('pone en null la fecha y el motivo de la pausa, juntos, con updated_by', async () => {
    const db = setup()
    const res = await reanudarPushPatrocinado()
    expect(res).toEqual({ ok: true })
    const w = escrituras(db.llamadas)
    expect(w).toHaveLength(1)
    expect(w[0].valores).toEqual({
      push_patrocinado_pausado_at: null,
      push_patrocinado_pausa_motivo: null,
      updated_by: ADMIN_ID,
    })
  })
})

describe('obtenerPanelPublicidad', () => {
  it('lee con columnas explícitas (nunca select("*"))', async () => {
    const db = setup()
    const panel = await obtenerPanelPublicidad()
    expect(panel).toMatchObject({ propuesto: null, vigente: null, ciclosAprobados: 0, ajustes: null, ocupacion: [], reportes: [] })
    const lecturas = db.llamadas.filter((l) => l.op === 'select')
    expect(lecturas.length).toBeGreaterThanOrEqual(6)
    for (const l of lecturas) {
      expect(l.columnas, l.tabla).not.toBeNull()
      expect(l.columnas).not.toContain('*')
    }
  })

  it('arma los reportes con el título del evento', async () => {
    setup({
      responder: (l) =>
        l.tabla === 'ad_campaign_reports'
          ? {
              data: [{ id: 'r1', tipo: 'push', desde: '2026-10-01T00:00:00Z', hasta: '2026-10-08T00:00:00Z', token: 'a'.repeat(32), events: { title: 'Fiesta' } }],
              error: null,
            }
          : undefined,
    })
    const panel = await obtenerPanelPublicidad()
    expect(panel?.reportes).toEqual([
      { id: 'r1', tipo: 'push', desde: '2026-10-01T00:00:00Z', hasta: '2026-10-08T00:00:00Z', token: 'a'.repeat(32), titulo: 'Fiesta' },
    ])
  })
})

describe('el archivo de acciones no usa credenciales de servicio', () => {
  const ruta = fileURLToPath(new URL('../../lib/admin/publicidad-actions.ts', import.meta.url))
  // Sin comentarios: el docstring puede hablar de la regla sin dispararla.
  const codigo = readFileSync(ruta, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'])\/\/.*$/gm, '$1')

  it('no importa ni llama al cliente admin ni al privilegiado', () => {
    expect(codigo).not.toMatch(/createAdminClient/)
    expect(codigo).not.toMatch(/getPrivilegedClient/)
  })

  it('no lee la clave de servicio', () => {
    expect(codigo).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/)
    expect(codigo).not.toMatch(/service_role/i)
  })

  it('nunca inserta en ad_prices', () => {
    expect(codigo).not.toMatch(/\.insert\(/)
    expect(codigo).not.toMatch(/\.upsert\(/)
  })
})
