// Q5-1 · Importador desde OpenStreetMap: consulta, interpretación y deduplicación (sin red).
import { describe, expect, it } from 'vitest'
import {
  BBOX_SALTA_CAPITAL,
  candidatosDesdeOverpass,
  consultaOverpass,
  decidirCandidato,
  parecidoDeNombres,
  planDeImportacion,
  resumenDelPlan,
  tipoDesdeTags,
  USER_AGENT_OVERPASS,
  INTERVALO_MIN_MS,
  type CandidatoOsm,
} from '@/lib/lugares-chicos/osm'

describe('consulta', () => {
  it('Salta Capital y solo elementos con nombre', () => {
    const q = consultaOverpass()
    expect(q).toContain(`${BBOX_SALTA_CAPITAL.sur},${BBOX_SALTA_CAPITAL.oeste},${BBOX_SALTA_CAPITAL.norte},${BBOX_SALTA_CAPITAL.este}`)
    expect(q).toContain('"leisure"="playground"]["name"]')
    expect(q).toContain('out center tags;')
  })
  it('User-Agent propio y al menos 1 segundo entre pedidos', () => {
    expect(USER_AGENT_OVERPASS).toMatch(/^QuePintaSalta\//)
    expect(INTERVALO_MIN_MS).toBeGreaterThanOrEqual(1000)
  })
  it('mapa de tipos', () => {
    expect(tipoDesdeTags({ leisure: 'playground' })).toBe('plaza_juegos')
    expect(tipoDesdeTags({ leisure: 'indoor_play' })).toBe('pelotero')
    expect(tipoDesdeTags({ amenity: 'events_venue' })).toBe('salon_juegos')
    expect(tipoDesdeTags({ tourism: 'museum' })).toBe('espacio_cultural_infantil')
    expect(tipoDesdeTags({ amenity: 'kindergarten' })).toBeNull()
  })
})

const RESPUESTA = {
  elements: [
    { type: 'node', id: 1, lat: -24.79, lon: -65.41, tags: { leisure: 'playground', name: 'Plaza de Juegos Güemes', 'addr:street': 'Av. Belgrano', 'addr:housenumber': '100' } },
    { type: 'way', id: 2, center: { lat: -24.8, lon: -65.42 }, tags: { leisure: 'indoor_play', name: 'Pelotero Saltarín' } },
    { type: 'node', id: 3, lat: -24.79, lon: -65.41, tags: { leisure: 'playground' } }, // sin nombre
    { type: 'node', id: 4, lat: -24.2, lon: -65.41, tags: { leisure: 'playground', name: 'Lejos' } }, // fuera de Capital
    { type: 'node', id: 1, lat: -24.79, lon: -65.41, tags: { leisure: 'playground', name: 'Plaza de Juegos Güemes' } }, // repetido
  ],
}

describe('candidatosDesdeOverpass', () => {
  it('se queda con los que tienen nombre, tipo y coordenadas dentro de Capital', () => {
    const { candidatos, descartados } = candidatosDesdeOverpass(RESPUESTA)
    expect(candidatos.map((c) => c.osmRef)).toEqual(['node/1', 'way/2'])
    expect(descartados).toBe(3)
    expect(candidatos[0]).toMatchObject({ direccion: 'Av. Belgrano 100, Salta', tipo: 'plaza_juegos' })
    expect(candidatos[1]).toMatchObject({ lat: -24.8, lng: -65.42, direccion: 'Salta Capital (dirección a confirmar)' })
  })
  it('una respuesta rara no rompe', () => {
    expect(candidatosDesdeOverpass(null)).toEqual({ candidatos: [], descartados: 0 })
    expect(candidatosDesdeOverpass({ elements: 'x' })).toEqual({ candidatos: [], descartados: 0 })
  })
})

const C: CandidatoOsm = { osmRef: 'node/10', nombre: 'Plaza Alvarado', direccion: 'x', lat: -24.79, lng: -65.41, tipo: 'plaza_juegos' }

describe('deduplicación contra venues', () => {
  it('parecido de nombres sin palabras genéricas', () => {
    expect(parecidoDeNombres('Plaza Alvarado', 'Plazoleta Alvarado')).toBe(1)
    expect(parecidoDeNombres('Plaza Alvarado', 'Plaza Güemes')).toBe(0)
  })
  it('ya importado (mismo osm_ref)', () => {
    expect(decidirCandidato(C, [], new Set(['node/10'])).accion).toBe('ya_importado')
  })
  it('cerca (≤ 150 m) y con nombre parecido: usa el venue', () => {
    const d = decidirCandidato(C, [{ id: 'v1', name: 'Plazoleta Alvarado', latitude: -24.7905, longitude: -65.4105, tieneFicha: false }], new Set())
    expect(d).toMatchObject({ accion: 'usar_venue', venueId: 'v1' })
  })
  it('cerca pero con otro nombre: crea uno nuevo', () => {
    const d = decidirCandidato(C, [{ id: 'v1', name: 'Teatro Provincial', latitude: -24.7901, longitude: -65.4101, tieneFicha: false }], new Set())
    expect(d.accion).toBe('crear_venue')
  })
  it('mismo nombre aunque lejos o sin coordenadas: usa el venue (el índice único rechazaría el alta)', () => {
    const d = decidirCandidato(C, [{ id: 'v2', name: 'PLAZA ALVARADO', latitude: null, longitude: null, tieneFicha: false }], new Set())
    expect(d).toMatchObject({ accion: 'usar_venue', venueId: 'v2' })
  })
  it('si el venue ya tiene ficha, no se toca', () => {
    const d = decidirCandidato(C, [{ id: 'v2', name: 'Plaza Alvarado', latitude: null, longitude: null, tieneFicha: true }], new Set())
    expect(d.accion).toBe('ya_tiene_ficha')
  })
  it('el plan no crea dos venues con el mismo nombre ni usa dos veces el mismo venue', () => {
    const plan = planDeImportacion(
      [C, { ...C, osmRef: 'way/11' }, { ...C, osmRef: 'node/12', nombre: 'Pelotero Uno', tipo: 'pelotero' }],
      [],
      new Set(),
    )
    expect(resumenDelPlan(plan)).toEqual({ ya_importado: 0, ya_tiene_ficha: 0, usar_venue: 0, crear_venue: 2 })
  })
})
