// R56, tarea 56-b (QPS-195): `lib/estado-evento.ts` es nuevo. Antes de este
// cambio, marcar Voy o Guardar no verificaba el estado del evento: con el
// UUID de un borrador se podía escribir igual.
//
// Punto 1: `estadoPermiteAgregar` con un doble de `@/lib/supabase` (mismo
// patrón que `tests/asistencia.test.ts`/`tests/favoritos.test.ts`): `'si'`
// solo con `PUBLISHED`; `'no'` tanto sin fila (el caso real de un borrador,
// que la RLS oculta) como con cualquier otro `status`; `'error'` con un error
// de verdad de la consulta.
//
// Punto 2: `marcarAsistencia` (lib/asistencia.ts) y `marcarFavorito`
// (lib/favoritos.ts) usan ese chequeo antes de escribir — y `desmarcarFavorito`
// (sacar Voy pasa por acá) nunca lo consulta, para que sacar una marca ya
// escrita siga funcionando pase lo que pase con el evento.
//
// Nunca el cliente real (ni red, ni .env, ni base).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const EVENT_ID = 'evento-de-prueba-1'
const USER_ID = 'usuario-de-prueba-1'

const estado = vi.hoisted(() => ({
  eventoFila: { data: null as unknown, error: null as unknown } as { data: unknown; error: unknown },
  arrojarEvento: null as unknown,
  favoritoInsertResultado: { error: null as unknown } as { error: unknown },
  favoritoDeleteResultado: { error: null as unknown } as { error: unknown },
  asistenciaUpsertResultado: { error: null as unknown } as { error: unknown },
  // El delete de event_attendance en desmarcarFavorito trae `.select('kind')`.
  asistenciaDeleteResultado: { data: [] as unknown, error: null as unknown } as { data: unknown; error: unknown },
  llamadas: { eventoSelect: 0, favoritoInsert: 0, favoritoDelete: 0, asistenciaUpsert: 0, asistenciaDelete: 0 },
}))

// `vi.mock` se eleva por encima de los imports estáticos: tanto
// `lib/estado-evento.ts` (vía `lib/asistencia.ts` y `lib/favoritos.ts`) como
// las dos tablas que esos módulos ya usaban ven este mismo doble.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabla: string) => {
      if (tabla === 'events') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                estado.llamadas.eventoSelect++
                if (estado.arrojarEvento) throw estado.arrojarEvento
                return estado.eventoFila
              },
            }),
          }),
        }
      }
      if (tabla === 'user_favorites') {
        const builder: Record<string, unknown> = {}
        builder.insert = async (_valores: unknown) => {
          estado.llamadas.favoritoInsert++
          return estado.favoritoInsertResultado
        }
        builder.delete = () => builder
        builder.eq = () => builder
        builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
          estado.llamadas.favoritoDelete++
          return Promise.resolve(estado.favoritoDeleteResultado).then(resolve, reject)
        }
        return builder
      }
      if (tabla === 'event_attendance') {
        const builder: Record<string, unknown> = {}
        builder.upsert = async (_valores: unknown) => {
          estado.llamadas.asistenciaUpsert++
          return estado.asistenciaUpsertResultado
        }
        builder.delete = () => builder
        builder.eq = () => builder
        builder.select = () => builder
        builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
          estado.llamadas.asistenciaDelete++
          return Promise.resolve(estado.asistenciaDeleteResultado).then(resolve, reject)
        }
        return builder
      }
      throw new Error(`tabla inesperada en el doble de estado-evento: ${tabla}`)
    },
  },
}))

import { estadoPermiteAgregar } from '../lib/estado-evento'
import { MENSAJE_ERROR, MENSAJE_EVENTO_NO_DISPONIBLE, marcarAsistencia } from '../lib/asistencia'
import {
  MENSAJE_EVENTO_NO_DISPONIBLE as MENSAJE_EVENTO_NO_DISPONIBLE_FAVORITOS,
  desmarcarFavorito,
  marcarFavorito,
} from '../lib/favoritos'

beforeEach(() => {
  estado.eventoFila = { data: null, error: null }
  estado.arrojarEvento = null
  estado.favoritoInsertResultado = { error: null }
  estado.favoritoDeleteResultado = { error: null }
  estado.asistenciaUpsertResultado = { error: null }
  estado.asistenciaDeleteResultado = { data: [], error: null }
  estado.llamadas = { eventoSelect: 0, favoritoInsert: 0, favoritoDelete: 0, asistenciaUpsert: 0, asistenciaDelete: 0 }
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Punto 1: estadoPermiteAgregar.
// ---------------------------------------------------------------------------
describe('estadoPermiteAgregar', () => {
  it('PUBLISHED: si', async () => {
    estado.eventoFila = { data: { status: 'PUBLISHED' }, error: null }

    expect(await estadoPermiteAgregar(EVENT_ID)).toBe('si')
  })

  it('sin fila (el caso real de un borrador: la RLS lo oculta): no', async () => {
    estado.eventoFila = { data: null, error: null }

    expect(await estadoPermiteAgregar(EVENT_ID)).toBe('no')
  })

  it('CANCELLED: no', async () => {
    estado.eventoFila = { data: { status: 'CANCELLED' }, error: null }

    expect(await estadoPermiteAgregar(EVENT_ID)).toBe('no')
  })

  it('error de la consulta: error', async () => {
    estado.eventoFila = { data: null, error: { code: '42501', message: 'permission denied' } }

    expect(await estadoPermiteAgregar(EVENT_ID)).toBe('error')
  })

  it('excepción de red: error', async () => {
    estado.arrojarEvento = new Error('network request failed')

    expect(await estadoPermiteAgregar(EVENT_ID)).toBe('error')
  })
})

// ---------------------------------------------------------------------------
// Punto 2: marcarAsistencia respeta el chequeo (y quitar-voy no lo consulta).
// ---------------------------------------------------------------------------
describe('marcarAsistencia: evento que ya no admite agregar (56-b)', () => {
  it('sobre un borrador (sin fila): error con el mensaje nuevo, y cero escrituras', async () => {
    estado.eventoFila = { data: null, error: null }

    const resultado = await marcarAsistencia(EVENT_ID, USER_ID, 'voy', { guardado: false, voy: false })

    expect(resultado).toEqual({ tipo: 'error', error: MENSAJE_EVENTO_NO_DISPONIBLE, guardado: false })
    expect(estado.llamadas.favoritoInsert).toBe(0)
    expect(estado.llamadas.asistenciaUpsert).toBe(0)
    expect(estado.llamadas.asistenciaDelete).toBe(0)
  })

  it('sobre un evento con otro estado (CANCELLED): mismo error, mismo mensaje que un id inexistente', async () => {
    estado.eventoFila = { data: { status: 'CANCELLED' }, error: null }

    const resultado = await marcarAsistencia(EVENT_ID, USER_ID, 'voy', { guardado: false, voy: false })

    expect(resultado).toEqual({ tipo: 'error', error: MENSAJE_EVENTO_NO_DISPONIBLE, guardado: false })
  })

  it('si la consulta del evento falla: MENSAJE_ERROR, sin escrituras', async () => {
    estado.eventoFila = { data: null, error: { code: '42501', message: 'boom' } }

    const resultado = await marcarAsistencia(EVENT_ID, USER_ID, 'voy', { guardado: false, voy: false })

    expect(resultado).toEqual({ tipo: 'error', error: MENSAJE_ERROR, guardado: false })
    expect(estado.llamadas.favoritoInsert).toBe(0)
    expect(estado.llamadas.asistenciaUpsert).toBe(0)
  })

  it('sacar Voy (quitar-voy) de un evento que ya no está publicado: funciona igual, y events ni se consulta', async () => {
    estado.eventoFila = { data: { status: 'CANCELLED' }, error: null }

    const resultado = await marcarAsistencia(EVENT_ID, USER_ID, 'voy', { guardado: true, voy: true })

    expect(resultado).toEqual({ tipo: 'ok', guardado: true })
    expect(estado.llamadas.eventoSelect).toBe(0)
    expect(estado.llamadas.asistenciaDelete).toBe(1)
  })

  it('camino feliz con el evento PUBLISHED: sigue funcionando (el chequeo no estorba cuando el evento está bien)', async () => {
    estado.eventoFila = { data: { status: 'PUBLISHED' }, error: null }

    const resultado = await marcarAsistencia(EVENT_ID, USER_ID, 'voy', { guardado: false, voy: false })

    expect(resultado).toEqual({ tipo: 'ok', guardado: true })
    expect(estado.llamadas.favoritoInsert).toBe(1)
    expect(estado.llamadas.asistenciaUpsert).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Punto 2: marcarFavorito/desmarcarFavorito.
// ---------------------------------------------------------------------------
describe('marcarFavorito: evento que ya no admite agregar (56-b)', () => {
  it('de un borrador (sin fila): error sin insert', async () => {
    estado.eventoFila = { data: null, error: null }

    const resultado = await marcarFavorito(EVENT_ID, USER_ID)

    expect(resultado).toEqual({ ok: false, error: MENSAJE_EVENTO_NO_DISPONIBLE_FAVORITOS })
    expect(estado.llamadas.favoritoInsert).toBe(0)
  })

  it('camino feliz con el evento PUBLISHED: sigue haciendo el insert', async () => {
    estado.eventoFila = { data: { status: 'PUBLISHED' }, error: null }

    const resultado = await marcarFavorito(EVENT_ID, USER_ID)

    expect(resultado).toEqual({ ok: true })
    expect(estado.llamadas.favoritoInsert).toBe(1)
  })
})

describe('desmarcarFavorito: nunca consulta el estado del evento (sacar una marca siempre funciona)', () => {
  it('con cualquier estado del doble de events (ni siquiera se llega a consultar): ok', async () => {
    estado.eventoFila = { data: null, error: null }

    const resultado = await desmarcarFavorito(EVENT_ID, USER_ID)

    expect(resultado).toEqual({ ok: true, voyQuitado: false })
    expect(estado.llamadas.eventoSelect).toBe(0)
  })
})
