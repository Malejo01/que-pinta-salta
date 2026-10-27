// R56, tarea 56-q (QPS-195): paridad web/app del chequeo "¿se puede agregar
// una marca?" (`estadoPermiteAgregar`), con la MISMA tabla de tres eventos
// (DRAFT, CANCELLED, PUBLISHED) que
// `apps/web/tests/asistencia/estado-evento-paridad.test.ts`, contra el
// código REAL de la app (`lib/asistencia.ts`, `lib/favoritos.ts`).
//
// No se puede importar el código de la web desde acá (usa su propio alias
// "@" --apunta a `apps/web/`-- y módulos de `next/headers`/`next/cache`, que
// no corren bajo este entorno): la paridad es la MISMA tabla de casos en dos
// archivos, cada uno contra su implementación real.
//
// Qué agrega sobre `tests/estado-evento.test.ts` (56-b, que ya prueba la
// misma lógica con sus propios dobles): acá la fila "DRAFT" tiene un status
// LITERAL con el evento PRESENTE en el doble (no "sin fila", el caso real de
// la RLS ocultando un borrador ajeno, que 56-b sí cubre), y las tres filas se
// recorren con la MISMA estructura (`describe.each`) para los cuatro
// caminos: agregar y sacar, en `marcarAsistencia` y en `marcarFavorito`/
// `desmarcarFavorito`.
//
// Nunca el cliente real (ni red, ni .env, ni base).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const EVENT_ID = 'evento-estado-evento-paridad'
const USER_ID = 'usuario-estado-evento-paridad'

const estado = vi.hoisted(() => ({
  eventoStatus: 'PUBLISHED' as string,
  favoritoInsertResultado: { error: null as unknown } as { error: unknown },
  favoritoDeleteResultado: { error: null as unknown } as { error: unknown },
  asistenciaUpsertResultado: { error: null as unknown } as { error: unknown },
  // El delete de event_attendance en desmarcarFavorito trae `.select('kind')`.
  asistenciaDeleteResultado: { data: [] as unknown, error: null as unknown } as { data: unknown; error: unknown },
  llamadas: { eventoSelect: 0, favoritoInsert: 0, favoritoDelete: 0, asistenciaUpsert: 0, asistenciaDelete: 0 },
}))

// Mismo estilo de doble que tests/estado-evento.test.ts (56-b): acá el
// status de "events" sale de `estado.eventoStatus` (literal, parametrizable
// por caso), no de "sin fila".
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabla: string) => {
      if (tabla === 'events') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                estado.llamadas.eventoSelect++
                return { data: { status: estado.eventoStatus }, error: null }
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
      throw new Error(`tabla inesperada en el doble de estado-evento-paridad: ${tabla}`)
    },
  },
}))

import { MENSAJE_EVENTO_NO_DISPONIBLE, marcarAsistencia } from '../lib/asistencia'
import {
  MENSAJE_EVENTO_NO_DISPONIBLE as MENSAJE_EVENTO_NO_DISPONIBLE_FAVORITOS,
  desmarcarFavorito,
  marcarFavorito,
} from '../lib/favoritos'

beforeEach(() => {
  estado.eventoStatus = 'PUBLISHED'
  estado.favoritoInsertResultado = { error: null }
  estado.favoritoDeleteResultado = { error: null }
  estado.asistenciaUpsertResultado = { error: null }
  estado.asistenciaDeleteResultado = { data: [], error: null }
  estado.llamadas = { eventoSelect: 0, favoritoInsert: 0, favoritoDelete: 0, asistenciaUpsert: 0, asistenciaDelete: 0 }
})

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * La misma tabla del archivo compañero de la web: DRAFT y CANCELLED con la
 * fila PRESENTE (status literal), nunca "sin fila".
 */
const CASOS = [
  { etiqueta: 'DRAFT', status: 'DRAFT', permiteAgregar: false },
  { etiqueta: 'CANCELLED', status: 'CANCELLED', permiteAgregar: false },
  { etiqueta: 'PUBLISHED', status: 'PUBLISHED', permiteAgregar: true },
] as const

describe.each(CASOS)(
  'app, marcarAsistencia AGREGAR (marcar Voy desde cero, sin nada previo): evento $etiqueta',
  ({ status, permiteAgregar }) => {
    it(
      permiteAgregar
        ? 'PUBLISHED: escribe (favorito y después voy)'
        : `${status}: error con MENSAJE_EVENTO_NO_DISPONIBLE, cero escrituras`,
      async () => {
        estado.eventoStatus = status

        const resultado = await marcarAsistencia(EVENT_ID, USER_ID, 'voy', { guardado: false, voy: false })

        if (permiteAgregar) {
          expect(resultado).toEqual({ tipo: 'ok', guardado: true })
          expect(estado.llamadas.favoritoInsert).toBe(1)
          expect(estado.llamadas.asistenciaUpsert).toBe(1)
        } else {
          expect(resultado).toEqual({ tipo: 'error', error: MENSAJE_EVENTO_NO_DISPONIBLE, guardado: false })
          expect(estado.llamadas.favoritoInsert).toBe(0)
          expect(estado.llamadas.asistenciaUpsert).toBe(0)
        }
      },
    )
  },
)

describe.each(CASOS)(
  'app, marcarAsistencia SACAR (quitar voy, con Voy y Guardado ya marcados): evento $etiqueta',
  ({ status }) => {
    it('funciona SIEMPRE (sacar nunca chequea el estado), y la tabla "events" ni se consulta', async () => {
      estado.eventoStatus = status

      const resultado = await marcarAsistencia(EVENT_ID, USER_ID, 'voy', { guardado: true, voy: true })

      expect(resultado).toEqual({ tipo: 'ok', guardado: true })
      expect(estado.llamadas.eventoSelect).toBe(0)
      expect(estado.llamadas.asistenciaDelete).toBe(1)
    })
  },
)

describe.each(CASOS)(
  'app, marcarFavorito AGREGAR (guardar desde cero, sin favorito previo): evento $etiqueta',
  ({ status, permiteAgregar }) => {
    it(permiteAgregar ? 'PUBLISHED: inserta' : `${status}: error sin insert`, async () => {
      estado.eventoStatus = status

      const resultado = await marcarFavorito(EVENT_ID, USER_ID, 'event')

      if (permiteAgregar) {
        expect(resultado).toEqual({ ok: true })
        expect(estado.llamadas.favoritoInsert).toBe(1)
      } else {
        expect(resultado).toEqual({ ok: false, error: MENSAJE_EVENTO_NO_DISPONIBLE_FAVORITOS })
        expect(estado.llamadas.favoritoInsert).toBe(0)
      }
    })
  },
)

describe.each(CASOS)('app, desmarcarFavorito SACAR (con una fila "voy" previa): evento $etiqueta', ({ status }) => {
  it('funciona SIEMPRE, sin consultar el estado del evento ("events" nunca se toca)', async () => {
    estado.eventoStatus = status
    estado.asistenciaDeleteResultado = { data: [{ kind: 'voy' }], error: null }

    const resultado = await desmarcarFavorito(EVENT_ID, USER_ID, 'event')

    expect(resultado).toEqual({ ok: true, voyQuitado: true })
    expect(estado.llamadas.eventoSelect).toBe(0)
  })
})
