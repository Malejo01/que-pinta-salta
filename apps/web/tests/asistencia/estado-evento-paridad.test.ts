/**
 * QPS-195 (R56, tarea 56-q): paridad web/app del chequeo "¿se puede agregar
 * una marca?" (`estadoPermiteAgregar`), con la MISMA tabla de tres eventos
 * (DRAFT, CANCELLED, PUBLISHED) para los dos caminos de la web
 * (`marcarAsistencia` de `lib/asistencia.ts`, `toggleFavorite` de
 * `lib/actions/favorites.ts`).
 *
 * Qué agrega sobre `tests/asistencia/estado-evento.test.ts` (56-a, que ya
 * prueba la misma lógica con sus propios dobles): acá la fila "DRAFT" tiene
 * un `status` LITERAL `'DRAFT'` con el evento PRESENTE en el doble — no "sin
 * fila" (el caso real de un id inexistente o de la RLS ocultando un borrador
 * ajeno, que 56-a sí cubre). Las tres filas (DRAFT/CANCELLED/PUBLISHED) se
 * recorren con la MISMA estructura (`describe.each`) para los cuatro
 * caminos — agregar y sacar, en `marcarAsistencia` y en `toggleFavorite` —
 * así que un caso roto en cualquiera de los cuatro aparece con el mismo
 * formato de tabla.
 *
 * El equivalente de la app vive en
 * `apps/mobile/tests/estado-evento-paridad.test.ts`, con la MISMA tabla
 * (DRAFT/CANCELLED/PUBLISHED) contra `marcarAsistencia`/`marcarFavorito`/
 * `desmarcarFavorito` de la app. No se puede importar el código real de la
 * app desde este archivo: usa su propio alias `@` (apunta a `apps/mobile/`,
 * no a `apps/web/`) y módulos de React Native (`./supabase` arrastra
 * `react-native-url-polyfill/auto` y `AppState` de `react-native`), que no
 * corren bajo el entorno `node` de este paquete. La paridad, entonces, es la
 * MISMA tabla de casos en dos archivos, cada uno contra su implementación
 * real — no un archivo que importe los dos lados a la vez.
 *
 * Sin red ni base: `@/lib/supabase/server` y `next/cache` van mockeados.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createClient = vi.fn()
const revalidatePath = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...a: unknown[]) => createClient(...a),
}))
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))

import { marcarAsistencia } from '../../lib/asistencia'
import { toggleFavorite } from '../../lib/actions/favorites'

beforeEach(() => {
  createClient.mockReset()
  revalidatePath.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

const USUARIO = 'usuario-estado-evento-paridad'
const EVENTO = 'evento-estado-evento-paridad'

/**
 * La tabla del encargo: DRAFT y CANCELLED con la fila PRESENTE (status
 * literal), nunca "sin fila" — ver el porqué en la cabecera del archivo.
 */
const CASOS = [
  { etiqueta: 'DRAFT', status: 'DRAFT', permiteAgregar: false },
  { etiqueta: 'CANCELLED', status: 'CANCELLED', permiteAgregar: false },
  { etiqueta: 'PUBLISHED', status: 'PUBLISHED', permiteAgregar: true },
] as const

// ---------------------------------------------------------------------------
// Doble para marcarAsistencia (mismo estilo que tests/asistencia/
// estado-evento.test.ts, 56-a), parametrizado por el status del evento.
// ---------------------------------------------------------------------------
interface OpcionesMarcar {
  propiaData?: { kind: string } | null
  guardadoData?: { id: string } | null
}

function construirClienteMarcar(status: string, opciones: OpcionesMarcar = {}) {
  const orden: string[] = []
  const tablasConsultadas: string[] = []

  const from = vi.fn((tabla: string) => {
    tablasConsultadas.push(tabla)

    if (tabla === 'event_attendance') {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: opciones.propiaData ?? null, error: null }) }),
        }),
        upsert: async () => {
          orden.push('event_attendance.upsert')
          return { error: null }
        },
        delete: () => ({
          eq: async () => {
            orden.push('event_attendance.delete')
            return { error: null }
          },
        }),
      }
    }
    if (tabla === 'event_attendance_counts') {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { voy: 0 }, error: null }) }) }) }
    }
    if (tabla === 'user_favorites') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: opciones.guardadoData ?? null, error: null }) }),
          }),
        }),
        insert: async () => {
          orden.push('user_favorites.insert')
          return { error: null }
        },
      }
    }
    if (tabla === 'events') {
      return {
        select: (columnas: string) => {
          if (columnas !== 'status') throw new Error(`select inesperado sobre events: "${columnas}"`)
          return { eq: () => ({ maybeSingle: async () => ({ data: { status }, error: null }) }) }
        },
      }
    }
    throw new Error(`tabla inesperada en el doble de estado-evento-paridad (marcarAsistencia): ${tabla}`)
  })

  return {
    cliente: { auth: { getUser: async () => ({ data: { user: { id: USUARIO } }, error: null }) }, from },
    orden,
    tablasConsultadas,
  }
}

describe.each(CASOS)(
  'web, marcarAsistencia AGREGAR (marcar Voy desde cero, sin nada previo): evento $etiqueta',
  ({ status, permiteAgregar }) => {
    it(
      permiteAgregar
        ? 'PUBLISHED: escribe (guardar y después marcar voy, en ese orden)'
        : `${status}: INVALID, CERO escrituras (nunca escribe en un evento que no es PUBLISHED)`,
      async () => {
        const { cliente, orden } = construirClienteMarcar(status, { propiaData: null, guardadoData: null })
        createClient.mockResolvedValue(cliente)

        const resultado = await marcarAsistencia(EVENTO, 'voy')

        if (permiteAgregar) {
          expect(resultado.ok).toBe(true)
          expect(orden).toEqual(['user_favorites.insert', 'event_attendance.upsert'])
        } else {
          expect(resultado).toEqual({ ok: false, error: 'INVALID' })
          expect(orden).toEqual([])
        }
      },
    )
  },
)

describe.each(CASOS)(
  'web, marcarAsistencia SACAR (quitar voy, con Voy y Guardado ya marcados): evento $etiqueta',
  ({ status }) => {
    it('funciona SIEMPRE (sacar nunca chequea el estado), y la tabla "events" ni se consulta', async () => {
      const { cliente, orden, tablasConsultadas } = construirClienteMarcar(status, {
        propiaData: { kind: 'voy' },
        guardadoData: { id: 'fav-paridad' },
      })
      createClient.mockResolvedValue(cliente)

      const resultado = await marcarAsistencia(EVENTO, 'voy')

      expect(resultado.ok).toBe(true)
      expect(orden).toEqual(['event_attendance.delete'])
      expect(tablasConsultadas).not.toContain('events')
    })
  },
)

// ---------------------------------------------------------------------------
// Doble para toggleFavorite, con el mismo criterio (status literal).
// ---------------------------------------------------------------------------
interface OpcionesToggle {
  existingFavoritoId?: string | null
  deleteAttendanceFilas?: Array<{ kind: string }>
}

function construirClienteToggle(status: string, opciones: OpcionesToggle = {}) {
  const orden: string[] = []
  const tablasConsultadas: string[] = []

  const from = vi.fn((tabla: string) => {
    tablasConsultadas.push(tabla)

    if (tabla === 'user_favorites') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: opciones.existingFavoritoId ? { id: opciones.existingFavoritoId } : null,
                error: null,
              }),
            }),
          }),
        }),
        delete: () => ({
          eq: async () => {
            orden.push('user_favorites.delete')
            return { error: null }
          },
        }),
        insert: async () => {
          orden.push('user_favorites.insert')
          return { error: null }
        },
      }
    }
    if (tabla === 'event_attendance') {
      return {
        delete: () => ({
          eq: () => ({
            eq: () => ({
              select: async () => {
                orden.push('event_attendance.delete')
                return { data: opciones.deleteAttendanceFilas ?? [], error: null }
              },
            }),
          }),
        }),
      }
    }
    if (tabla === 'events') {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status }, error: null }) }) }) }
    }
    throw new Error(`tabla inesperada en el doble de estado-evento-paridad (toggleFavorite): ${tabla}`)
  })

  return {
    cliente: { auth: { getUser: async () => ({ data: { user: { id: USUARIO } }, error: null }) }, from },
    orden,
    tablasConsultadas,
  }
}

describe.each(CASOS)(
  'web, toggleFavorite AGREGAR (guardar desde cero, sin favorito previo): evento $etiqueta',
  ({ status, permiteAgregar }) => {
    it(permiteAgregar ? 'PUBLISHED: inserta' : `${status}: INVALID, sin insert`, async () => {
      const { cliente, orden } = construirClienteToggle(status, { existingFavoritoId: null })
      createClient.mockResolvedValue(cliente)

      const resultado = await toggleFavorite(EVENTO, 'event')

      if (permiteAgregar) {
        expect(resultado).toEqual({ success: true, favorited: true })
        expect(orden).toEqual(['user_favorites.insert'])
      } else {
        expect(resultado).toEqual({ success: false, error: 'INVALID', message: 'Ese evento ya no está disponible' })
        expect(orden).toEqual([])
      }
    })
  },
)

describe.each(CASOS)(
  'web, toggleFavorite SACAR (quitar el ♥, con Voy y Guardado ya marcados): evento $etiqueta',
  ({ status }) => {
    it('funciona SIEMPRE, y la tabla "events" ni se consulta (el chequeo es solo al agregar)', async () => {
      const { cliente, orden, tablasConsultadas } = construirClienteToggle(status, {
        existingFavoritoId: 'fav-paridad',
        deleteAttendanceFilas: [{ kind: 'voy' }],
      })
      createClient.mockResolvedValue(cliente)

      const resultado = await toggleFavorite(EVENTO, 'event')

      expect(resultado).toEqual({ success: true, favorited: false, voyQuitado: true })
      expect(orden).toEqual(['event_attendance.delete', 'user_favorites.delete'])
      expect(tablasConsultadas).not.toContain('events')
    })
  },
)
