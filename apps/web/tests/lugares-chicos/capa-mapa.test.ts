// Q5-2 · La capa «Lugares para chicos» (core, sin red): filas → lugares,
// GeoJSON solo con ids, orden por distancia, `capa=chicos` en la URL y barrios.
import { describe, expect, it } from 'vitest'
import { BARRIOS_SALTA_CAPITAL, barrioPorId } from '@qps/core/datos/barrios'
import { coordenadasEnSalta } from '@qps/core/mapa/zona'
import { consultaDelMapa, hayFiltrosExtra, parsearFiltrosExtraMapa, SIN_FILTROS_EXTRA } from '@qps/core/mapa/filtros'
import {
  armarLugaresChicos,
  idBloqueLugarChicos,
  lugaresChicosAGeoJson,
  ordenarPorDistancia,
  type FilaLugarChicos,
} from '@qps/core/mapa/lugares-chicos'

function fila(n: number, cambios: Partial<FilaLugarChicos> = {}): FilaLugarChicos {
  return {
    id: `f${n}`,
    venue_id: `v${n}`,
    tipo: 'plaza_juegos',
    estado: 'publicado',
    descripcion_corta: null,
    edad_min: null,
    edad_max: null,
    horarios: { version: 1, siempre_abierto: true, semana: {} },
    acceso: 'gratis',
    nota_precio: null,
    techado: null,
    tiene_rampa: null,
    tiene_bano_adaptado: null,
    tiene_cambiador: null,
    contacto_telefono: null,
    contacto_web: null,
    contacto_instagram: null,
    osm_ref: null,
    verificado_at: '2026-11-01T12:00:00Z',
    venue: { name: `Plaza ${n}`, address: `Calle ${n}`, slug: `plaza-${n}`, latitude: '-24.79', longitude: '-65.41', canonical_venue_id: null },
    ...cambios,
  }
}

describe('armarLugaresChicos', () => {
  it('solo publicados, con ubicación en Salta, de un tipo conocido, sin repetir venue', () => {
    const lugares = armarLugaresChicos([
      fila(1),
      fila(2, { estado: 'borrador' }),
      fila(3, { venue: { name: 'Lejos', address: 'x', latitude: '-34.6', longitude: '-58.4' } }),
      fila(4, { tipo: 'cancha' }),
      fila(5, { venue: { name: 'Sin', address: 'x', latitude: null, longitude: null } }),
      fila(6, { venue: { name: 'Fusionado', address: 'x', latitude: '-24.79', longitude: '-65.41', canonical_venue_id: 'otro' } }),
      fila(1, { id: 'f1b' }),
    ])
    expect(lugares.map((l) => l.venueId)).toEqual(['v1'])
    expect(lugares[0]).toMatchObject({ lat: -24.79, lng: -65.41, nombre: 'Plaza 1', slug: 'plaza-1', deOsm: false })
  })
  it('con Gratis prendido, solo acceso gratis', () => {
    const lugares = armarLugaresChicos([fila(1), fila(2, { acceso: 'pago' })], { soloGratis: true })
    expect(lugares.map((l) => l.venueId)).toEqual(['v1'])
  })
  it('ordena por tipo (pelotero primero) y nombre; descarta links que no son http(s)', () => {
    const lugares = armarLugaresChicos([
      fila(1, { tipo: 'plaza_juegos' }),
      fila(2, { tipo: 'pelotero', contacto_web: 'javascript:alert(1)', osm_ref: 'node/1' }),
    ])
    expect(lugares.map((l) => l.tipo)).toEqual(['pelotero', 'plaza_juegos'])
    expect(lugares[0]!.web).toBeNull()
    expect(lugares[0]!.deOsm).toBe(true)
  })
  it('el GeoJSON lleva solo venueId y tipo (nada de texto ajeno)', () => {
    const geo = lugaresChicosAGeoJson(armarLugaresChicos([fila(1, { descripcion_corta: '<b>hola</b>' })]))
    expect(geo.features[0]!.properties).toEqual({ venueId: 'v1', tipo: 'plaza_juegos' })
    expect(geo.features[0]!.geometry.coordinates).toEqual([-65.41, -24.79])
    expect(JSON.stringify(geo)).not.toContain('hola')
  })
  it('el id del bloque no choca con el de los lugares con eventos', () => {
    expect(idBloqueLugarChicos('v1')).toBe('chicos-v1')
  })
})

describe('ordenarPorDistancia', () => {
  const a = { venueId: 'a', lat: -24.7883, lng: -65.4106 }
  const b = { venueId: 'b', lat: -24.75, lng: -65.4 }
  it('sin origen, deja el orden y sin metros', () => {
    expect(ordenarPorDistancia([b, a], null).map((l) => [l.venueId, l.metros])).toEqual([['b', null], ['a', null]])
  })
  it('con origen, el más cerca primero', () => {
    const r = ordenarPorDistancia([b, a], { lat: -24.789, lng: -65.411 })
    expect(r.map((l) => l.venueId)).toEqual(['a', 'b'])
    expect(r[0]!.metros).toBeLessThan(200)
  })
})

describe('capa=chicos en la URL de /mapa', () => {
  it('se lee y va al final del orden fijo', () => {
    const extra = parsearFiltrosExtraMapa({ chicos: '1', capa: 'chicos' }, new Set())
    expect(extra).toEqual({ gratis: false, chicos: true, categoria: null, capaChicos: true })
    expect(consultaDelMapa({ tipo: 'hoy' }, extra)).toBe('cuando=hoy&chicos=1&capa=chicos')
  })
  it('un link viejo con chicos=1 solo no prende la capa (el link dice lo que muestra)', () => {
    expect(parsearFiltrosExtraMapa({ chicos: '1' }, new Set())).toEqual({ gratis: false, chicos: true, categoria: null })
  })
  it('cualquier otro valor de capa se ignora', () => {
    expect(parsearFiltrosExtraMapa({ capa: 'otra' }, new Set())).toEqual(SIN_FILTROS_EXTRA)
  })
  it('la capa no es un filtro de eventos (no cuenta para «Quitar filtros»)', () => {
    expect(hayFiltrosExtra({ ...SIN_FILTROS_EXTRA, capaChicos: true })).toBe(false)
  })
})

describe('barrios (decisión 10)', () => {
  it('entre 15 y 25, ids únicos en minúsculas sin tildes, todos dentro de Capital', () => {
    expect(BARRIOS_SALTA_CAPITAL.length).toBeGreaterThanOrEqual(15)
    expect(BARRIOS_SALTA_CAPITAL.length).toBeLessThanOrEqual(25)
    expect(new Set(BARRIOS_SALTA_CAPITAL.map((b) => b.id)).size).toBe(BARRIOS_SALTA_CAPITAL.length)
    for (const b of BARRIOS_SALTA_CAPITAL) {
      expect(b.id).toMatch(/^[a-z0-9-]+$/)
      expect(coordenadasEnSalta(b.lat, b.lng)).toBe(true)
      expect(b.lat).toBeGreaterThan(-24.9)
      expect(b.lat).toBeLessThan(-24.68)
      expect(b.lng).toBeGreaterThan(-65.52)
      expect(b.lng).toBeLessThan(-65.32)
    }
  })
  it('barrioPorId', () => {
    expect(barrioPorId('centro')?.nombre).toBe('Centro')
    expect(barrioPorId('no-existe')).toBeNull()
    expect(barrioPorId(null)).toBeNull()
  })
})
