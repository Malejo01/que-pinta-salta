// R47, tarea 47-e (QPS-197): el modelo "Guardar, Voy y Seguir". Este archivo
// prueba la tabla de consistencia SIN transacción que es la regla del
// encargo — el orden exacto de las escrituras, y qué queda (`guardado`,
// `voyQuitado`) cuando un paso falla a mitad de camino — para
// `marcarAsistencia` (`lib/asistencia.ts`) y `desmarcarFavorito`
// (`lib/favoritos.ts`), con un único doble de `@/lib/supabase` que además
// registra el ORDEN en que se llama a cada tabla/acción (`estado.orden`).
//
// Nunca el cliente real (ni red, ni .env, ni base).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const EVENT_ID = 'evento-de-prueba-guardar-voy'
const USER_ID = 'usuario-de-prueba-guardar-voy'

const estado = vi.hoisted(() => ({
  orden: [] as string[],
  // user_favorites
  favoritoInsertResultado: { error: null as unknown } as { error: unknown },
  arrojarFavoritoInsert: null as unknown,
  favoritoDeleteResultado: { error: null as unknown } as { error: unknown },
  // event_attendance
  asistenciaUpsertResultado: { error: null as unknown } as { error: unknown },
  arrojarAsistenciaUpsert: null as unknown,
  // El delete de event_attendance en desmarcarFavorito trae `.select('kind')`:
  // data = las filas borradas (normalmente 0 o 1).
  asistenciaDeleteResultado: { data: [] as unknown, error: null as unknown } as { data: unknown; error: unknown },
  // El delete de event_attendance en marcarAsistencia (paso "quitar-voy") NO
  // trae `.select()`: solo importa `error`, se reusa el mismo campo `error`
  // de `asistenciaDeleteResultado`.
  llamadas: { favoritoInsert: 0, favoritoDelete: 0, asistenciaUpsert: 0, asistenciaDelete: 0 },
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabla: string) => {
      if (tabla === 'user_favorites') {
        const builder: Record<string, unknown> = {}
        builder.insert = async (_valores: unknown) => {
          estado.orden.push('user_favorites:insert')
          estado.llamadas.favoritoInsert++
          if (estado.arrojarFavoritoInsert) throw estado.arrojarFavoritoInsert
          return estado.favoritoInsertResultado
        }
        builder.delete = () => builder
        builder.eq = () => builder
        builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
          estado.orden.push('user_favorites:delete')
          estado.llamadas.favoritoDelete++
          return Promise.resolve(estado.favoritoDeleteResultado).then(resolve, reject)
        }
        return builder
      }
      if (tabla === 'event_attendance') {
        const builder: Record<string, unknown> = {}
        builder.upsert = async (_valores: unknown) => {
          estado.orden.push('event_attendance:upsert')
          estado.llamadas.asistenciaUpsert++
          if (estado.arrojarAsistenciaUpsert) throw estado.arrojarAsistenciaUpsert
          return estado.asistenciaUpsertResultado
        }
        builder.delete = () => builder
        builder.eq = () => builder
        builder.select = () => builder
        builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
          estado.orden.push('event_attendance:delete')
          estado.llamadas.asistenciaDelete++
          return Promise.resolve(estado.asistenciaDeleteResultado).then(resolve, reject)
        }
        return builder
      }
      throw new Error(`tabla inesperada en el doble de guardar-voy: ${tabla}`)
    },
  },
}))

import { marcarAsistencia } from '../lib/asistencia'
import { desmarcarFavorito } from '../lib/favoritos'

beforeEach(() => {
  estado.orden = []
  estado.favoritoInsertResultado = { error: null }
  estado.arrojarFavoritoInsert = null
  estado.favoritoDeleteResultado = { error: null }
  estado.asistenciaUpsertResultado = { error: null }
  estado.arrojarAsistenciaUpsert = null
  estado.asistenciaDeleteResultado = { data: [], error: null }
  estado.llamadas = { favoritoInsert: 0, favoritoDelete: 0, asistenciaUpsert: 0, asistenciaDelete: 0 }
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// El orden de las escrituras (la regla sin transacción).
// ---------------------------------------------------------------------------
describe('orden de las escrituras', () => {
  it('marcar Voy: primero favorito (guardar), después asistencia (marcar-voy)', async () => {
    const resultado = await marcarAsistencia(EVENT_ID, USER_ID, 'voy', { guardado: false, voy: false })

    expect(resultado).toEqual({ tipo: 'ok', guardado: true })
    expect(estado.orden).toEqual(['user_favorites:insert', 'event_attendance:upsert'])
  })

  it('sacar el ♥ (desmarcarFavorito): primero asistencia (delete + select kind), después el favorito', async () => {
    const resultado = await desmarcarFavorito(EVENT_ID, USER_ID)

    expect(resultado).toEqual({ ok: true, voyQuitado: false })
    expect(estado.orden).toEqual(['event_attendance:delete', 'user_favorites:delete'])
  })
})

// ---------------------------------------------------------------------------
// Qué queda cuando un paso falla a mitad de camino.
// ---------------------------------------------------------------------------
describe('marcarAsistencia: qué queda cuando falla un paso', () => {
  it('falla el paso "marcar-voy" (el upsert): error, pero guardado=true (el favorito ya se había escrito)', async () => {
    estado.asistenciaUpsertResultado = { error: { code: '42501', message: 'boom' } }

    const resultado = await marcarAsistencia(EVENT_ID, USER_ID, 'voy', { guardado: false, voy: false })

    expect(resultado.tipo).toBe('error')
    expect(resultado.guardado).toBe(true)
    expect(estado.llamadas.favoritoInsert).toBe(1)
    expect(estado.llamadas.asistenciaUpsert).toBe(1)
  })

  it('falla el paso "guardar" (el insert del favorito): error, nunca llega a hacer upsert, y guardado es el de "actual"', async () => {
    estado.favoritoInsertResultado = { error: { code: '42501', message: 'boom' } }

    const resultado = await marcarAsistencia(EVENT_ID, USER_ID, 'voy', { guardado: false, voy: false })

    expect(resultado.tipo).toBe('error')
    expect(resultado.guardado).toBe(false)
    expect(estado.llamadas.asistenciaUpsert).toBe(0)
  })

  it('guardado también viene en el resultado "no-disponible" (la tabla/vista todavía no existe)', async () => {
    estado.asistenciaUpsertResultado = { error: { code: 'PGRST205', message: 'no existe todavía' } }

    const resultado = await marcarAsistencia(EVENT_ID, USER_ID, 'voy', { guardado: false, voy: false })

    expect(resultado).toEqual({ tipo: 'no-disponible', guardado: true })
  })

  it('guardado también viene en el resultado "error" genérico', async () => {
    estado.asistenciaUpsertResultado = { error: { code: '42501', message: 'boom' } }

    const resultado = await marcarAsistencia(EVENT_ID, USER_ID, 'voy', { guardado: false, voy: false })

    expect(resultado).toMatchObject({ tipo: 'error', guardado: true })
  })
})

// ---------------------------------------------------------------------------
// desmarcarFavorito: voyQuitado, y que el segundo delete no se intente si
// falla el primero.
// ---------------------------------------------------------------------------
describe('desmarcarFavorito: voyQuitado', () => {
  it('voyQuitado = true cuando la fila borrada tenía kind "voy"', async () => {
    estado.asistenciaDeleteResultado = { data: [{ kind: 'voy' }], error: null }

    const resultado = await desmarcarFavorito(EVENT_ID, USER_ID)

    expect(resultado).toEqual({ ok: true, voyQuitado: true })
  })

  it('voyQuitado = false cuando la fila borrada era un "me_interesa" viejo (se borra igual, pero no es Voy)', async () => {
    estado.asistenciaDeleteResultado = { data: [{ kind: 'me_interesa' }], error: null }

    const resultado = await desmarcarFavorito(EVENT_ID, USER_ID)

    expect(resultado).toEqual({ ok: true, voyQuitado: false })
  })

  it('voyQuitado = false cuando no había ninguna fila propia en event_attendance', async () => {
    estado.asistenciaDeleteResultado = { data: [], error: null }

    const resultado = await desmarcarFavorito(EVENT_ID, USER_ID)

    expect(resultado).toEqual({ ok: true, voyQuitado: false })
  })
})

describe('desmarcarFavorito: si falla el primer delete, no hay segundo', () => {
  it('error en el delete de event_attendance: ok=false, y el delete de user_favorites nunca se intenta', async () => {
    estado.asistenciaDeleteResultado = { data: null, error: { code: '42501', message: 'boom' } }

    const resultado = await desmarcarFavorito(EVENT_ID, USER_ID)

    expect(resultado.ok).toBe(false)
    expect(estado.llamadas.favoritoDelete).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// "me_interesa" no llega a Supabase: el único tipo válido es "voy".
// ---------------------------------------------------------------------------
describe('marcarAsistencia: "me_interesa" (y cualquier otro valor) no llega a Supabase', () => {
  it('tipo "me_interesa": error, y el doble no recibe ninguna llamada', async () => {
    const resultado = await marcarAsistencia(EVENT_ID, USER_ID, 'me_interesa', { guardado: false, voy: false })

    expect(resultado.tipo).toBe('error')
    expect(estado.llamadas.favoritoInsert).toBe(0)
    expect(estado.llamadas.asistenciaUpsert).toBe(0)
    expect(estado.llamadas.asistenciaDelete).toBe(0)
    expect(estado.orden).toEqual([])
  })

  it('tipo arbitrario (ni string): error, y el doble no recibe ninguna llamada', async () => {
    const resultado = await marcarAsistencia(EVENT_ID, USER_ID, 42, { guardado: true, voy: false })

    expect(resultado.tipo).toBe('error')
    expect(estado.orden).toEqual([])
  })
})
