// De punta a punta (R47, tarea 47-q, QPS-197): un usuario sin nada marca
// ✓ Voy, queda ♥ Guardado y ✓ Voy, saca el ♥ y no le queda nada — y los
// caminos cuando algo falla a mitad de camino. Encadena `marcarAsistencia`
// (`lib/asistencia.ts`) y `desmarcarFavorito` (`lib/favoritos.ts`), con el
// MISMO doble de `@/lib/supabase` que ya usa `tests/guardar-voy.test.ts`
// (47-e): no se inventa un cuarto doble distinto, se reusa su forma
// (`estado.*`), cambiando la configuración entre pasos para simular el
// estado real que va quedando en la base.
//
// Nunca el cliente real (ni red, ni .env, ni base).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const EVENT_ID = 'evento-punta-a-punta'
const USER_ID = 'usuario-punta-a-punta'

const estado = vi.hoisted(() => ({
  // user_favorites
  favoritoInsertResultado: { error: null as unknown } as { error: unknown },
  favoritoDeleteResultado: { error: null as unknown } as { error: unknown },
  // event_attendance
  asistenciaUpsertResultado: { error: null as unknown } as { error: unknown },
  // El delete de event_attendance en desmarcarFavorito trae `.select('kind')`.
  asistenciaDeleteResultado: { data: [] as unknown, error: null as unknown } as { data: unknown; error: unknown },
  llamadas: { favoritoInsert: 0, favoritoDelete: 0, asistenciaUpsert: 0, asistenciaDelete: 0 },
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabla: string) => {
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
      throw new Error(`tabla inesperada en el doble de punta-a-punta: ${tabla}`)
    },
  },
}))

import { marcarAsistencia } from '../lib/asistencia'
import { desmarcarFavorito } from '../lib/favoritos'

beforeEach(() => {
  estado.favoritoInsertResultado = { error: null }
  estado.favoritoDeleteResultado = { error: null }
  estado.asistenciaUpsertResultado = { error: null }
  estado.asistenciaDeleteResultado = { data: [], error: null }
  estado.llamadas = { favoritoInsert: 0, favoritoDelete: 0, asistenciaUpsert: 0, asistenciaDelete: 0 }
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Camino feliz completo: sin nada → marca Voy → Guardado y Voy → saca el
// ♥ → no queda nada.
// ---------------------------------------------------------------------------
describe('de punta a punta: sin nada → marca Voy → Guardado y Voy → saca el ♥ → no queda nada', () => {
  it('la secuencia completa', async () => {
    // Paso 1: sin nada marcado ({ guardado: false, voy: false }).
    const resultadoVoy = await marcarAsistencia(EVENT_ID, USER_ID, 'voy', { guardado: false, voy: false })
    expect(resultadoVoy).toEqual({ tipo: 'ok', guardado: true })
    expect(estado.llamadas).toMatchObject({ favoritoInsert: 1, asistenciaUpsert: 1 })
    // Queda: Guardado y Voy.

    // Paso 2: sacar el ♥ — hay una fila de asistencia con kind "voy" para borrar.
    estado.asistenciaDeleteResultado = { data: [{ kind: 'voy' }], error: null }

    const resultadoDesmarcar = await desmarcarFavorito(EVENT_ID, USER_ID)
    expect(resultadoDesmarcar).toEqual({ ok: true, voyQuitado: true })
    // No queda nada: voyQuitado:true (el Voy se fue) y el favorito también
    // se borró (ok:true sin error).
    expect(estado.llamadas.asistenciaDelete).toBe(1)
    expect(estado.llamadas.favoritoDelete).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// La falla del SEGUNDO paso en cada camino: en los dos casos, el estado que
// queda cumple el invariante voy ⇒ guardado.
// ---------------------------------------------------------------------------
describe('de punta a punta: falla el segundo paso — el estado que queda cumple voy ⇒ guardado', () => {
  it('camino "marcar Voy": falla el upsert de event_attendance (2º paso) — guardado:true, voy:false (el invariante se cumple porque voy es false)', async () => {
    estado.asistenciaUpsertResultado = { error: { code: '42501', message: 'boom' } }

    const resultado = await marcarAsistencia(EVENT_ID, USER_ID, 'voy', { guardado: false, voy: false })

    expect(resultado.tipo).toBe('error')
    expect(resultado.guardado).toBe(true)
    expect(estado.llamadas.favoritoInsert).toBe(1)
    expect(estado.llamadas.asistenciaUpsert).toBe(1)
  })

  it('camino "sacar el ♥" (después de un Voy marcado con éxito): falla el delete del favorito (2º paso) — event_attendance SÍ se borró (voy:false), pero el favorito sigue (guardado:true): el invariante se cumple porque voy es false', async () => {
    // Paso previo: marcar Voy sale bien.
    const previo = await marcarAsistencia(EVENT_ID, USER_ID, 'voy', { guardado: false, voy: false })
    expect(previo).toEqual({ tipo: 'ok', guardado: true })

    // Ahora falla el 2º paso de sacar el ♥.
    estado.asistenciaDeleteResultado = { data: [{ kind: 'voy' }], error: null }
    estado.favoritoDeleteResultado = { error: { message: 'boom' } }

    const resultado = await desmarcarFavorito(EVENT_ID, USER_ID)

    expect(resultado.ok).toBe(false)
    // El 1º paso (borrar la asistencia) sí se intentó y "salió bien" del
    // lado de la base (se devolvió la fila voy): el 2º (borrar el
    // favorito) es el que falló.
    expect(estado.llamadas.asistenciaDelete).toBe(1)
    expect(estado.llamadas.favoritoDelete).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// La falla del PRIMER paso en cada camino: no se escribió nada, y el estado
// que informa la función es el de antes.
// ---------------------------------------------------------------------------
describe('de punta a punta: falla el primer paso — no se escribió nada, el estado informado es el de antes', () => {
  it('camino "marcar Voy": falla el insert del favorito (1º paso), sin nada previo — guardado:false (el de antes), nunca llega al upsert', async () => {
    estado.favoritoInsertResultado = { error: { code: '42501', message: 'boom' } }

    const resultado = await marcarAsistencia(EVENT_ID, USER_ID, 'voy', { guardado: false, voy: false })

    expect(resultado.tipo).toBe('error')
    expect(resultado.guardado).toBe(false)
    expect(estado.llamadas.asistenciaUpsert).toBe(0)
  })

  it('camino "sacar el ♥" (después de un Voy marcado con éxito): falla el delete de event_attendance (1º paso) — el favorito ni se toca', async () => {
    const previo = await marcarAsistencia(EVENT_ID, USER_ID, 'voy', { guardado: false, voy: false })
    expect(previo).toEqual({ tipo: 'ok', guardado: true })

    estado.asistenciaDeleteResultado = { data: null, error: { code: '42501', message: 'boom' } }

    const resultado = await desmarcarFavorito(EVENT_ID, USER_ID)

    expect(resultado.ok).toBe(false)
    // El favorito no se tocó: sigue existiendo, igual que después del paso
    // previo (Guardado y Voy).
    expect(estado.llamadas.favoritoDelete).toBe(0)
  })
})
