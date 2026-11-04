// R-1 · `obtenerLugaresChicos` (Q5-4, la lista de «Lugares para chicos» en la
// app) con Supabase de mentira: qué pide (solo publicados y columnas
// públicas), qué devuelve (el mismo armado que la capa del mapa de la web) y
// cómo avisa un error o la falta de red. Antes, lugares-chicos.test.ts solo
// leía el fuente de esta función.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({
  respuesta: { data: [] as unknown, error: null as unknown } as { data: unknown; error: unknown } | Error,
  consulta: null as null | { tabla: string; columnas: string; filtros: [string, unknown][]; limite: number | null },
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from(tabla: string) {
      const c = { tabla, columnas: '', filtros: [] as [string, unknown][], limite: null as number | null }
      estado.consulta = c
      const b = {
        select: (col: string) => ((c.columnas = col), b),
        eq: (col: string, v: unknown) => (c.filtros.push([col, v]), b),
        limit: async (n: number) => {
          c.limite = n
          if (estado.respuesta instanceof Error) throw estado.respuesta
          return estado.respuesta
        },
      }
      return b
    },
  },
}))

import { MENSAJE_ERROR_LUGARES, obtenerLugaresChicos } from '@/lib/datos/lugares-chicos'

const fila = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  venue_id: `v-${id}`,
  tipo: 'plaza_juegos',
  estado: 'publicado',
  descripcion_corta: null,
  edad_min: 3,
  edad_max: 12,
  horarios: { version: 1, siempre_abierto: true, semana: {} },
  acceso: 'gratis',
  nota_precio: null,
  techado: 'aire_libre',
  tiene_rampa: true,
  tiene_bano_adaptado: null,
  tiene_cambiador: null,
  contacto_telefono: null,
  contacto_web: null,
  contacto_instagram: null,
  fuente: 'visita',
  osm_ref: null,
  verificado_at: '2026-10-20T12:00:00Z',
  venue: { name: `Plaza ${id}`, address: 'Calle 1', slug: `plaza-${id}`, latitude: '-24.7883', longitude: '-65.4106', canonical_venue_id: null },
  ...extra,
})

beforeEach(() => {
  estado.respuesta = { data: [], error: null }
  estado.consulta = null
})

describe('obtenerLugaresChicos', () => {
  it('pide solo los publicados, con columnas públicas (nunca quién cargó o verificó) y un tope', async () => {
    await obtenerLugaresChicos()
    expect(estado.consulta!.tabla).toBe('lugares_permanentes')
    expect(estado.consulta!.filtros).toEqual([['estado', 'publicado']])
    expect(estado.consulta!.limite).toBe(500)
    expect(estado.consulta!.columnas).not.toMatch(/cargado_por|verificado_por/)
    expect(estado.consulta!.columnas).toContain('venue:venues!inner(')
  })

  it('arma los lugares como la capa del mapa: coordenadas numéricas y afuera los fusionados o sin ubicación en Salta', async () => {
    estado.respuesta = {
      data: [
        fila('a'),
        fila('fusionada', { venue: { name: 'X', address: 'Y', slug: 'x', latitude: '-24.78', longitude: '-65.41', canonical_venue_id: 'otro' } }),
        fila('sin-ubicacion', { venue: { name: 'X', address: 'Y', slug: 'x', latitude: null, longitude: null, canonical_venue_id: null } }),
        fila('en-cordoba', { venue: { name: 'X', address: 'Y', slug: 'x', latitude: '-31.4', longitude: '-64.18', canonical_venue_id: null } }),
        fila('borrador', { estado: 'borrador' }),
      ],
      error: null,
    }
    const r = await obtenerLugaresChicos()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.lugares.map((l) => l.id)).toEqual(['a'])
    expect(r.lugares[0]).toMatchObject({ nombre: 'Plaza a', slug: 'plaza-a', lat: -24.7883, lng: -65.4106, tipo: 'plaza_juegos', acceso: 'gratis' })
  })

  it('error de la base: el mensaje de la pantalla, sin marcar «sin conexión»', async () => {
    estado.respuesta = { data: null, error: { code: '42501', message: 'permiso' } }
    expect(await obtenerLugaresChicos()).toEqual({ ok: false, error: MENSAJE_ERROR_LUGARES, sinConexion: undefined })
  })

  it('sin red (TypeError «Network request failed»): el mismo mensaje y «sin conexión», sin tirar', async () => {
    estado.respuesta = new TypeError('Network request failed')
    expect(await obtenerLugaresChicos()).toEqual({ ok: false, error: MENSAJE_ERROR_LUGARES, sinConexion: true })
  })
})
