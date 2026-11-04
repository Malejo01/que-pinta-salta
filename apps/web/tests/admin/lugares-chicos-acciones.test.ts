// R-1 · Las server actions de /admin/lugares-chicos (Q5-1 y Q5-3) de punta a
// punta, con Supabase de mentira: alta y edición de la ficha, «Verificado
// hoy», cambios de estado (publicar con lo que falta, archivar con motivo),
// y los pedidos del formulario público (pasar a borrador, descartar, borrar
// el contacto). Antes había solo un detector (reglas.test.ts: «usa la
// sesión») y el DOM con las acciones como dobles.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Op = 'select' | 'insert' | 'update' | 'delete'
type Consulta = {
  tabla: string
  op: Op
  columnas?: string
  valores?: Record<string, unknown>
  filtros: [string, string, unknown][]
  fin?: 'single' | 'maybeSingle' | 'then'
  selectDespues?: string
}
type Resultado = { data?: unknown; error?: unknown }

const estado = vi.hoisted(() => ({
  user: { id: 'admin-1' } as { id: string } | null,
  rol: 'ADMIN' as string | null,
  consultas: [] as Consulta[],
  responder: (() => ({ data: null, error: null })) as (c: Consulta) => Resultado,
  revalidados: [] as string[],
}))

function crearCliente() {
  return {
    auth: { getUser: async () => ({ data: { user: estado.user } }) },
    from(tabla: string) {
      const c: Consulta = { tabla, op: 'select', filtros: [] }
      const resolver = (fin: Consulta['fin']) => {
        c.fin = fin
        estado.consultas.push(c)
        if (tabla === 'profiles') return { data: estado.rol === null ? null : { role: estado.rol }, error: null }
        return estado.responder(c)
      }
      const b: Record<string, unknown> = {
        select(col: string) {
          if (c.op === 'select') c.columnas = col
          else c.selectDespues = col
          return b
        },
        insert(v: Record<string, unknown>) {
          c.op = 'insert'
          c.valores = v
          return b
        },
        update(v: Record<string, unknown>) {
          c.op = 'update'
          c.valores = v
          return b
        },
        single: async () => resolver('single'),
        maybeSingle: async () => resolver('maybeSingle'),
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(resolver('then')).then(res, rej),
      }
      for (const m of ['eq', 'is', 'ilike', 'limit']) {
        b[m] = (col: string, v: unknown) => {
          c.filtros.push([m, col, v])
          return b
        }
      }
      return b
    },
  }
}

const createClient = vi.fn(async () => crearCliente())
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => createClient(),
  createAdminClient: vi.fn(() => {
    throw new Error('el admin de lugares-chicos no usa la service key')
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: (r: string) => estado.revalidados.push(r) }))

import {
  borrarContactoPedido,
  cambiarEstadoLugarChicos,
  descartarPedido,
  guardarLugarChicos,
  pasarPedidoABorrador,
  verificarLugarChicos,
} from '@/lib/admin/lugares-chicos-actions'

const ID = '11111111-1111-4111-8111-111111111111'
const VENUE = '22222222-2222-4222-8222-222222222222'
const PEDIDO = '33333333-3333-4333-8333-333333333333'
const AHORA = new Date('2026-11-03T18:00:00Z')

function fd(campos: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(campos)) f.set(k, v)
  return f
}

const escrituras = () => estado.consultas.filter((c) => c.op !== 'select')
const deTabla = (t: string, op?: Op) => estado.consultas.filter((c) => c.tabla === t && (!op || c.op === op))

let errores: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  estado.user = { id: 'admin-1' }
  estado.rol = 'ADMIN'
  estado.consultas = []
  estado.responder = () => ({ data: null, error: null })
  estado.revalidados = []
  createClient.mockClear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AHORA)
  errores = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const FICHA = { tipo: 'pelotero', acceso: 'pago', fuente: 'visita' }

// ---------------------------------------------------------------------------
describe('solo un ADMIN escribe', () => {
  const acciones: [string, () => Promise<unknown>][] = [
    ['guardar', () => guardarLugarChicos(null, fd({ ...FICHA, venue_id: VENUE }))],
    ['verificar', () => verificarLugarChicos(null, fd({ id: ID, fuente: 'visita' }))],
    ['estado', () => cambiarEstadoLugarChicos(null, fd({ id: ID, accion: 'vencido' }))],
    ['pedido → borrador', () => pasarPedidoABorrador(null, fd({ id: PEDIDO, tipo: 'pelotero' }))],
    ['descartar pedido', () => descartarPedido(null, fd({ id: PEDIDO }))],
    ['borrar contacto', () => borrarContactoPedido(null, fd({ id: PEDIDO }))],
  ]
  it.each(acciones)('%s sin sesión: «No autenticado» y nada se escribe', async (_n, correr) => {
    estado.user = null
    expect(await correr()).toEqual({ ok: false, mensaje: 'No autenticado' })
    expect(escrituras()).toEqual([])
  })
  it.each(acciones)('%s con un USER: sin permisos y nada se escribe', async (_n, correr) => {
    estado.rol = 'USER'
    expect(await correr()).toEqual({ ok: false, mensaje: 'No tenés permisos de administrador' })
    expect(escrituras()).toEqual([])
    expect(estado.revalidados).toEqual([])
  })
  it('el rol se lee de profiles con el id de la sesión', async () => {
    estado.rol = 'USER'
    await descartarPedido(null, fd({ id: PEDIDO }))
    expect(deTabla('profiles')[0]!.filtros).toEqual([['eq', 'id', 'admin-1']])
  })
})

// ---------------------------------------------------------------------------
describe('guardarLugarChicos', () => {
  it('validación antes de abrir el cliente: tipo, id raro, sin lugar, sin fuente', async () => {
    expect(await guardarLugarChicos(null, fd({ acceso: 'pago', venue_id: VENUE, fuente: 'visita' }))).toEqual({ ok: false, mensaje: 'Elegí el tipo de lugar.' })
    expect(await guardarLugarChicos(null, fd({ ...FICHA, id: 'no-es-uuid' }))).toEqual({ ok: false, mensaje: 'La ficha no es válida.' })
    expect(await guardarLugarChicos(null, fd({ ...FICHA, venue_id: 'x' }))).toEqual({ ok: false, mensaje: 'El lugar elegido no es válido.' })
    expect((await guardarLugarChicos(null, fd({ ...FICHA, nuevo_nombre: 'ab', nueva_direccion: 'Calle 1' })))!.mensaje).toMatch(/Elegí un lugar existente/)
    expect((await guardarLugarChicos(null, fd({ tipo: 'pelotero', acceso: 'pago', venue_id: VENUE })))!.mensaje).toMatch(/Elegí de dónde salen los datos/)
    // «openstreetmap» no es una fuente que un admin pueda elegir.
    expect((await guardarLugarChicos(null, fd({ ...FICHA, fuente: 'openstreetmap', venue_id: VENUE })))!.mensaje).toMatch(/Elegí de dónde salen/)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('alta sobre un venue existente: ficha en BORRADOR con cargado_por de la sesión', async () => {
    estado.responder = (c) => (c.tabla === 'lugares_permanentes' && c.op === 'insert' ? { data: { id: ID }, error: null } : { data: null, error: null })
    const r = await guardarLugarChicos(null, fd({ ...FICHA, venue_id: VENUE, edad_min: '3', edad_max: '10', contacto_instagram: '@pelotero_salta', h_lun_modo: 'cerrado' }))
    expect(r).toEqual({ ok: true, mensaje: 'Ficha creada como borrador.', id: ID })
    const [alta] = deTabla('lugares_permanentes', 'insert')
    expect(alta!.valores).toMatchObject({
      venue_id: VENUE,
      tipo: 'pelotero',
      acceso: 'pago',
      fuente: 'visita',
      estado: 'borrador',
      cargado_por: 'admin-1',
      edad_min: 3,
      edad_max: 10,
      contacto_instagram: 'https://www.instagram.com/pelotero_salta/',
      horarios: { version: 1, semana: { lun: [] } },
    })
    expect(deTabla('venues', 'insert')).toEqual([])
    expect(estado.revalidados).toEqual(['/admin/lugares-chicos'])
  })

  it('alta con un lugar nuevo: crea el venue con su slug y después la ficha', async () => {
    estado.responder = (c) =>
      c.op === 'insert' ? { data: { id: c.tabla === 'venues' ? VENUE : ID }, error: null } : { data: null, error: null }
    const r = await guardarLugarChicos(null, fd({ ...FICHA, nuevo_nombre: 'Pelotero Güemes', nueva_direccion: 'Güemes 123' }))
    expect(r!.ok).toBe(true)
    expect(deTabla('venues', 'insert')[0]!.valores).toEqual({ name: 'Pelotero Güemes', address: 'Güemes 123', slug: 'pelotero-guemes' })
    expect(deTabla('lugares_permanentes', 'insert')[0]!.valores).toMatchObject({ venue_id: VENUE })
  })

  it('venue con nombre repetido (23505): avisa que lo busque, sin crear la ficha', async () => {
    estado.responder = (c) => (c.tabla === 'venues' ? { data: null, error: { code: '23505' } } : { data: { id: ID }, error: null })
    const r = await guardarLugarChicos(null, fd({ ...FICHA, nuevo_nombre: 'Pelotero Güemes', nueva_direccion: 'Güemes 123' }))
    expect(r).toEqual({ ok: false, mensaje: 'Ya hay un lugar con ese nombre: buscalo arriba y usalo.' })
    expect(deTabla('lugares_permanentes', 'insert')).toEqual([])
  })

  it('el venue ya tiene ficha (23505 en la ficha): «editala desde la lista»', async () => {
    estado.responder = (c) => (c.tabla === 'lugares_permanentes' ? { data: null, error: { code: '23505' } } : { data: null, error: null })
    expect(await guardarLugarChicos(null, fd({ ...FICHA, venue_id: VENUE }))).toEqual({ ok: false, mensaje: 'Ese lugar ya tiene ficha: editala desde la lista.' })
  })

  it('edición: update por id SIN tocar estado ni verificación; sin filas, «No encontramos esa ficha.»', async () => {
    estado.responder = (c) => (c.op === 'update' ? { data: [{ id: ID }], error: null } : { data: null, error: null })
    const r = await guardarLugarChicos(null, fd({ tipo: 'plaza_juegos', acceso: 'gratis', id: ID }))
    expect(r).toEqual({ ok: true, mensaje: 'Ficha guardada.', id: ID })
    const [upd] = deTabla('lugares_permanentes', 'update')
    expect(upd!.filtros).toEqual([['eq', 'id', ID]])
    for (const clave of ['estado', 'verificado_at', 'verificado_por', 'cargado_por', 'venue_id', 'fuente']) expect(upd!.valores).not.toHaveProperty(clave)
    estado.responder = () => ({ data: [], error: null })
    expect(await guardarLugarChicos(null, fd({ tipo: 'plaza_juegos', acceso: 'gratis', id: ID }))).toEqual({ ok: false, mensaje: 'No encontramos esa ficha.' })
  })

  it('error de la base: mensaje genérico y el log lleva solo la acción y el código', async () => {
    estado.responder = (c) => (c.op === 'update' ? { data: null, error: { code: '42501', message: 'detalle interno' } } : { data: null, error: null })
    expect(await guardarLugarChicos(null, fd({ ...FICHA, id: ID }))).toEqual({ ok: false, mensaje: 'No se pudo guardar la ficha. Probá de nuevo.' })
    expect(errores).toHaveBeenCalledWith('[lugares-chicos] editar: error de la base', '42501')
    expect(JSON.stringify(errores.mock.calls)).not.toContain('detalle interno')
  })
})

// ---------------------------------------------------------------------------
describe('verificarLugarChicos', () => {
  it('sin fuente verificada no abre el cliente', async () => {
    expect((await verificarLugarChicos(null, fd({ id: ID })))!.mensaje).toMatch(/Para verificar, elegí cómo lo confirmaste/)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('marca hoy, quién (la sesión) y de dónde', async () => {
    estado.responder = (c) => (c.op === 'update' ? { data: [{ id: ID }], error: null } : { data: null, error: null })
    const r = await verificarLugarChicos(null, fd({ id: ID, fuente: 'llamado', fuente_detalle: '  Llamé al 387 1234567 ' }))
    expect(r).toEqual({ ok: true, mensaje: 'Marcado como verificado hoy.', id: ID })
    expect(deTabla('lugares_permanentes', 'update')[0]!.valores).toEqual({
      verificado_at: AHORA.toISOString(),
      verificado_por: 'admin-1',
      fuente: 'llamado',
      fuente_detalle: 'Llamé al 387 1234567',
    })
  })
})

// ---------------------------------------------------------------------------
describe('cambiarEstadoLugarChicos', () => {
  const filaParaPublicar = (extra: Record<string, unknown> = {}) => ({
    tipo: 'pelotero',
    acceso: 'pago',
    fuente: 'visita',
    verificado_at: '2026-11-01T12:00:00Z',
    venue: { latitude: '-24.7883', longitude: '-65.4106', canonical_venue_id: null },
    ...extra,
  })

  it('acción desconocida o archivar sin motivo: no abre el cliente', async () => {
    expect(await cambiarEstadoLugarChicos(null, fd({ id: ID, accion: 'borrar' }))).toEqual({ ok: false, mensaje: 'Acción desconocida.' })
    expect(await cambiarEstadoLugarChicos(null, fd({ id: ID, accion: 'archivar', motivo_archivo: '   ' }))).toEqual({
      ok: false,
      mensaje: 'Para archivar, elegí o escribí el motivo.',
    })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('publicar con todo en regla: lee la ficha (con el venue), publica, limpia el motivo y refresca el mapa', async () => {
    estado.responder = (c) =>
      c.op === 'select' && c.tabla === 'lugares_permanentes'
        ? { data: filaParaPublicar(), error: null }
        : c.op === 'update'
          ? { data: [{ id: ID }], error: null }
          : { data: null, error: null }
    const r = await cambiarEstadoLugarChicos(null, fd({ id: ID, accion: 'publicar' }))
    expect(r).toEqual({ ok: true, mensaje: 'Publicado.', id: ID })
    expect(deTabla('lugares_permanentes', 'update')[0]!.valores).toEqual({ estado: 'publicado', motivo_archivo: null })
    expect(estado.revalidados).toEqual(['/admin/lugares-chicos', '/mapa'])
  })

  it('publicar sin verificar, fuera de Salta y fusionado: dice todo lo que falta y no escribe', async () => {
    estado.responder = (c) =>
      c.op === 'select' && c.tabla === 'lugares_permanentes'
        ? {
            data: filaParaPublicar({
              fuente: 'openstreetmap',
              verificado_at: null,
              venue: [{ latitude: null, longitude: null, canonical_venue_id: VENUE }],
            }),
            error: null,
          }
        : { data: [{ id: ID }], error: null }
    const r = await cambiarEstadoLugarChicos(null, fd({ id: ID, accion: 'publicar' }))
    expect(r!.ok).toBe(false)
    expect(r!.mensaje).toMatch(/^Para publicar falta: /)
    for (const falta of ['una fuente verificada', 'la fecha de verificación', 'que el lugar sea el canónico', 'la ubicación dentro de Salta']) {
      expect(r!.mensaje).toContain(falta)
    }
    expect(deTabla('lugares_permanentes', 'update')).toEqual([])
  })

  it('publicar con la verificación vencida: pide volver a verificar', async () => {
    estado.responder = (c) =>
      c.op === 'select' && c.tabla === 'lugares_permanentes'
        ? { data: filaParaPublicar({ verificado_at: '2025-01-01T12:00:00Z' }), error: null }
        : { data: [{ id: ID }], error: null }
    const r = await cambiarEstadoLugarChicos(null, fd({ id: ID, accion: 'publicar' }))
    expect(r!.mensaje).toContain('volver a verificarlo')
    expect(deTabla('lugares_permanentes', 'update')).toEqual([])
  })

  it('publicar una ficha que no existe: «No encontramos esa ficha.»', async () => {
    estado.responder = () => ({ data: null, error: null })
    expect(await cambiarEstadoLugarChicos(null, fd({ id: ID, accion: 'publicar' }))).toEqual({ ok: false, mensaje: 'No encontramos esa ficha.' })
  })

  it.each([
    ['vencido', {}, { estado: 'vencido' }, 'Marcado como vencido: ya no se ve en público.'],
    ['borrador', {}, { estado: 'borrador', motivo_archivo: null }, 'Volvió a borrador.'],
    ['archivar', { motivo_archivo: 'Cerró' }, { estado: 'archivado', motivo_archivo: 'Cerró' }, 'Archivado.'],
  ])('«%s»: el update justo y su mensaje', async (accion, extra, cambios, mensaje) => {
    estado.responder = (c) => (c.op === 'update' ? { data: [{ id: ID }], error: null } : { data: null, error: null })
    expect(await cambiarEstadoLugarChicos(null, fd({ id: ID, accion, ...extra }))).toEqual({ ok: true, mensaje, id: ID })
    expect(deTabla('lugares_permanentes', 'update')[0]!.valores).toEqual(cambios)
    // Solo publicar lee antes.
    expect(deTabla('lugares_permanentes', 'select')).toEqual([])
  })

  it('el check de la base (23514) se explica; otro error, genérico', async () => {
    estado.responder = (c) => (c.op === 'update' ? { data: null, error: { code: '23514' } } : { data: null, error: null })
    expect(await cambiarEstadoLugarChicos(null, fd({ id: ID, accion: 'vencido' }))).toEqual({ ok: false, mensaje: 'La base no lo dejó: revisá verificación y fuente.' })
    estado.responder = (c) => (c.op === 'update' ? { data: null, error: { code: 'XX000' } } : { data: null, error: null })
    expect(await cambiarEstadoLugarChicos(null, fd({ id: ID, accion: 'vencido' }))).toEqual({ ok: false, mensaje: 'No se pudo cambiar el estado.' })
    expect(estado.revalidados).toEqual([])
  })
})

// ---------------------------------------------------------------------------
describe('pasarPedidoABorrador', () => {
  const pedido = (extra: Record<string, unknown> = {}) => ({
    id: PEDIDO,
    nombre: 'Plaza 100%_Juegos',
    direccion: 'Caseros 1',
    tipo: null,
    link: 'https://instagram.com/plaza',
    estado: 'nuevo',
    ...extra,
  })

  function responderPedido(opciones: { pedido?: unknown; venueExistente?: string | null; fichaExistente?: string | null } = {}) {
    return (c: Consulta): Resultado => {
      if (c.tabla === 'lugares_chicos_pedidos' && c.op === 'select') return { data: opciones.pedido === undefined ? pedido() : opciones.pedido, error: null }
      if (c.tabla === 'venues' && c.op === 'select') return { data: opciones.venueExistente ? [{ id: opciones.venueExistente }] : [], error: null }
      if (c.tabla === 'venues' && c.op === 'insert') return { data: { id: VENUE }, error: null }
      if (c.tabla === 'lugares_permanentes' && c.op === 'select') return { data: opciones.fichaExistente ? { id: opciones.fichaExistente } : null, error: null }
      if (c.tabla === 'lugares_permanentes' && c.op === 'insert') return { data: { id: ID }, error: null }
      return { data: null, error: null }
    }
  }

  it('sin tipo (ni en el pedido ni elegido): lo pide y no escribe', async () => {
    estado.responder = responderPedido()
    expect(await pasarPedidoABorrador(null, fd({ id: PEDIDO }))).toEqual({ ok: false, mensaje: 'Elegí el tipo de lugar antes de pasarlo a borrador.' })
    expect(escrituras()).toEqual([])
  })

  it('un pedido ya revisado no se vuelve a convertir', async () => {
    estado.responder = responderPedido({ pedido: pedido({ estado: 'convertido' }) })
    expect(await pasarPedidoABorrador(null, fd({ id: PEDIDO, tipo: 'plaza_juegos' }))).toEqual({ ok: false, mensaje: 'Ese pedido ya se revisó.' })
    expect(escrituras()).toEqual([])
  })

  it('sin venue con ese nombre: crea venue y ficha (fuente pedido_publico, plaza siempre abierta) y marca el pedido convertido', async () => {
    estado.responder = responderPedido()
    const r = await pasarPedidoABorrador(null, fd({ id: PEDIDO, tipo: 'plaza_juegos' }))
    expect(r).toEqual({ ok: true, mensaje: 'Borrador creado: completalo y verificalo.', id: ID })
    // El nombre va escapado para ILIKE (% y _ son literales) y solo entre los canónicos.
    const [busqueda] = deTabla('venues', 'select')
    expect(busqueda!.filtros).toContainEqual(['is', 'canonical_venue_id', null])
    expect(busqueda!.filtros).toContainEqual(['ilike', 'name', 'Plaza 100\\%\\_Juegos'])
    expect(deTabla('venues', 'insert')[0]!.valores).toEqual({ name: 'Plaza 100%_Juegos', address: 'Caseros 1', slug: 'plaza-100-juegos' })
    expect(deTabla('lugares_permanentes', 'insert')[0]!.valores).toEqual({
      venue_id: VENUE,
      tipo: 'plaza_juegos',
      estado: 'borrador',
      fuente: 'pedido_publico',
      fuente_detalle: 'https://instagram.com/plaza',
      cargado_por: 'admin-1',
      horarios: { version: 1, siempre_abierto: true, semana: {} },
    })
    const [marca] = deTabla('lugares_chicos_pedidos', 'update')
    expect(marca!.valores).toEqual({ estado: 'convertido', lugar_id: ID, revisado_at: AHORA.toISOString() })
    expect(marca!.filtros).toEqual([['eq', 'id', PEDIDO]])
  })

  it('el venue ya existe y tiene ficha: solo enlaza el pedido a esa ficha', async () => {
    const OTRA = '44444444-4444-4444-8444-444444444444'
    estado.responder = responderPedido({ pedido: pedido({ tipo: 'pelotero' }), venueExistente: VENUE, fichaExistente: OTRA })
    const r = await pasarPedidoABorrador(null, fd({ id: PEDIDO }))
    expect(r).toEqual({ ok: true, mensaje: 'Ese lugar ya tenía ficha: el pedido quedó enlazado a ella.', id: OTRA })
    expect(deTabla('venues', 'insert')).toEqual([])
    expect(deTabla('lugares_permanentes', 'insert')).toEqual([])
    expect(deTabla('lugares_chicos_pedidos', 'update')[0]!.valores).toMatchObject({ estado: 'convertido', lugar_id: OTRA })
  })

  it('el tipo elegido por el admin gana al del pedido; un tipo que no es de la lista se ignora', async () => {
    estado.responder = responderPedido({ pedido: pedido({ tipo: 'pelotero' }) })
    await pasarPedidoABorrador(null, fd({ id: PEDIDO, tipo: 'salon_juegos' }))
    expect(deTabla('lugares_permanentes', 'insert')[0]!.valores).toMatchObject({ tipo: 'salon_juegos', horarios: { version: 1, semana: {} } })
    estado.consultas = []
    await pasarPedidoABorrador(null, fd({ id: PEDIDO, tipo: 'casa' }))
    expect(deTabla('lugares_permanentes', 'insert')[0]!.valores).toMatchObject({ tipo: 'pelotero' })
  })

  it('un pedido que no existe: lo dice, sin escribir', async () => {
    estado.responder = responderPedido({ pedido: null })
    expect(await pasarPedidoABorrador(null, fd({ id: PEDIDO, tipo: 'pelotero' }))).toEqual({ ok: false, mensaje: 'No encontramos ese pedido.' })
    expect(escrituras()).toEqual([])
  })
})

// ---------------------------------------------------------------------------
describe('descartarPedido y borrarContactoPedido', () => {
  it('descartar borra también el contacto y marca la revisión (solo si sigue «nuevo»)', async () => {
    estado.responder = (c) => (c.op === 'update' ? { data: [{ id: PEDIDO }], error: null } : { data: null, error: null })
    expect(await descartarPedido(null, fd({ id: PEDIDO }))).toEqual({ ok: true, mensaje: 'Pedido descartado.' })
    const [upd] = deTabla('lugares_chicos_pedidos', 'update')
    expect(upd!.valores).toEqual({ estado: 'descartado', contacto: null, revisado_at: AHORA.toISOString() })
    expect(upd!.filtros).toEqual([
      ['eq', 'id', PEDIDO],
      ['eq', 'estado', 'nuevo'],
    ])
    expect(estado.revalidados).toEqual(['/admin/lugares-chicos'])
  })

  it('bug R-1: un pedido ya convertido (pestaña vieja u otro admin) no se pisa a «descartado»', async () => {
    // La base no encuentra filas con estado «nuevo»: el update no cambió nada.
    estado.responder = (c) => (c.op === 'update' ? { data: [], error: null } : { data: null, error: null })
    expect(await descartarPedido(null, fd({ id: PEDIDO }))).toEqual({ ok: false, mensaje: 'Ese pedido ya se revisó.' })
    expect(estado.revalidados).toEqual([])
  })

  it('borrar el contacto toca solo esa columna', async () => {
    expect(await borrarContactoPedido(null, fd({ id: PEDIDO }))).toEqual({ ok: true, mensaje: 'Contacto borrado.' })
    expect(deTabla('lugares_chicos_pedidos', 'update')[0]!.valores).toEqual({ contacto: null })
  })

  it('un id que no es uuid no abre el cliente', async () => {
    expect(await descartarPedido(null, fd({ id: '1 or 1=1' }))).toEqual({ ok: false, mensaje: 'El pedido no es válido.' })
    expect(await borrarContactoPedido(null, fd({}))).toEqual({ ok: false, mensaje: 'El pedido no es válido.' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('error de la base: genérico, solo el código al log', async () => {
    estado.responder = (c) => (c.op === 'update' ? { data: null, error: { code: '42501', message: 'contacto: persona@example.com' } } : { data: null, error: null })
    expect(await borrarContactoPedido(null, fd({ id: PEDIDO }))).toEqual({ ok: false, mensaje: 'No se pudo borrar el contacto.' })
    expect(JSON.stringify(errores.mock.calls)).not.toContain('persona@example.com')
  })
})
