import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { listadoEnSeco, pedidosMaximos, planDeCorrida, type OpcionesDelPlan } from '@/lib/venues/geocodificacion/corrida'
import type { LecturaEnlaceMaps } from '@/lib/venues/geocodificacion/enlaces-maps'
import type { VenueParaGeocodificar } from '@/lib/venues/geocodificacion/plan'
import { ordenarLugaresAdmin } from '@/lib/admin/orden-lugares'

const AHORA = new Date('2026-11-15T09:30:00Z')

function venue(id: string, extra: Partial<VenueParaGeocodificar> = {}): VenueParaGeocodificar {
  return {
    id,
    name: `Lugar ${id}`,
    address: null,
    canonical_venue_id: null,
    merged_at: null,
    is_placeholder: false,
    latitude: null,
    longitude: null,
    geocode_source: null,
    geocode_intentado_at: null,
    geocode_sugerencia_lat: null,
    geocode_sugerencia_texto: null,
    ...extra,
  }
}

const PROGRAMADO: OpcionesDelPlan = { programado: true, prioridadEventos: true, todos: false, rehacerNominatim: false, limite: 20 }
const PIN: LecturaEnlaceMaps = {
  tipo: 'coordenadas',
  lat: -24.7889,
  lng: -65.4106,
  precision: 'pin',
  enlace: 'https://www.google.com/maps?q=-24.7889,-65.4106',
}

describe('planDeCorrida: el diagnóstico de la Q7-2', () => {
  it('antes: con solo los que tienen eventos, una vez intentados la cola se vacía y los demás nunca entran', () => {
    // 3 con eventos (ya intentados ayer) y 5 sin eventos (nunca intentados).
    const venues = [
      ...['a', 'b', 'c'].map((id) => venue(id, { geocode_intentado_at: '2026-11-14T09:30:00Z' })),
      ...['d', 'e', 'f', 'g', 'h'].map((id) => venue(id)),
    ]
    const conteo = new Map([['a', 3], ['b', 1], ['c', 1]])
    const comoAntes = planDeCorrida({
      venues,
      conteoEventos: conteo,
      lecturasPorLugar: new Map(),
      opciones: { ...PROGRAMADO, prioridadEventos: false, programado: false },
      ahora: AHORA,
    })
    // Sin prioridad-eventos (y sin la regla de 30 días del modo programado) solo entran los 3 con eventos.
    expect(comoAntes.aNominatim.map((v) => v.id)).toEqual(['a', 'b', 'c'])
    expect(comoAntes.afuera['sin-eventos']).toBe(5)

    const ahora = planDeCorrida({ venues, conteoEventos: conteo, lecturasPorLugar: new Map(), opciones: PROGRAMADO, ahora: AHORA })
    // Q7-2: los intentados ayer esperan 30 días, pero los nunca intentados sin eventos entran.
    expect(ahora.aNominatim.map((v) => v.id)).toEqual(['d', 'e', 'f', 'g', 'h'])
    expect(ahora.afuera['intento-reciente']).toBe(3)
    expect(ahora.afuera['sin-eventos']).toBe(0)
  })

  it('prioridad: primero los que tienen eventos (de más a menos), después el resto por nombre', () => {
    const venues = ['z', 'y', 'x', 'w'].map((id) => venue(id))
    const conteo = new Map([['x', 1], ['w', 4]])
    const plan = planDeCorrida({ venues, conteoEventos: conteo, lecturasPorLugar: new Map(), opciones: PROGRAMADO, ahora: AHORA })
    expect(plan.aNominatim.map((v) => v.id)).toEqual(['w', 'x', 'y', 'z'])
  })

  it('el tope recorta a Nominatim y cuenta los que quedan para otra corrida', () => {
    const venues = Array.from({ length: 25 }, (_, i) => venue(`v${String(i).padStart(2, '0')}`))
    const plan = planDeCorrida({ venues, conteoEventos: new Map(), lecturasPorLugar: new Map(), opciones: PROGRAMADO, ahora: AHORA })
    expect(plan.aNominatim).toHaveLength(20)
    expect(plan.afuera.tope).toBe(5)
  })

  it('una sugerencia pendiente deja el lugar afuera (y se cuenta aparte)', () => {
    const venues = [venue('a', { geocode_sugerencia_lat: -24.79, geocode_sugerencia_texto: 'Algo, Salta' }), venue('b')]
    const plan = planDeCorrida({ venues, conteoEventos: new Map(), lecturasPorLugar: new Map(), opciones: PROGRAMADO, ahora: AHORA })
    expect(plan.aNominatim.map((v) => v.id)).toEqual(['b'])
    expect(plan.afuera['sugerencia-pendiente']).toBe(1)
  })

  it('nunca entra uno cargado a mano, uno con coordenadas, un alias ni un placeholder', () => {
    const venues = [
      venue('manual', { geocode_source: 'manual', latitude: -24.78, longitude: -65.41 }),
      venue('con-coordenadas', { geocode_source: 'nominatim', latitude: -24.78, longitude: -65.41 }),
      venue('alias', { canonical_venue_id: 'otro' }),
      venue('placeholder', { is_placeholder: true }),
    ]
    const plan = planDeCorrida({
      venues,
      conteoEventos: new Map(),
      lecturasPorLugar: new Map(venues.map((v) => [v.id, [PIN]])),
      opciones: PROGRAMADO,
      ahora: AHORA,
    })
    expect(plan.aNominatim).toEqual([])
    expect(plan.porEnlace).toEqual([])
  })
})

describe('planDeCorrida: links de Google Maps', () => {
  it('un pin seguro resuelve el lugar sin Nominatim, aunque se haya intentado ayer o tenga una sugerencia de Nominatim', () => {
    const venues = [
      venue('ayer', { geocode_intentado_at: '2026-11-14T09:30:00Z' }),
      venue('con-sugerencia', { geocode_sugerencia_lat: -24.7, geocode_sugerencia_texto: 'Otra cosa, Salta' }),
      venue('sin-link'),
    ]
    const lecturas = new Map([
      ['ayer', [PIN]],
      ['con-sugerencia', [PIN]],
    ])
    const plan = planDeCorrida({ venues, conteoEventos: new Map(), lecturasPorLugar: lecturas, opciones: PROGRAMADO, ahora: AHORA })
    expect(plan.porEnlace.map((p) => p.lugar.id).sort()).toEqual(['ayer', 'con-sugerencia'])
    expect(plan.aNominatim.map((v) => v.id)).toEqual(['sin-link'])
  })

  it('una sugerencia por link ya pendiente no se vuelve a proponer ni va a Nominatim', () => {
    const venues = [venue('a', { geocode_sugerencia_lat: -24.7889, geocode_sugerencia_texto: 'Link de Google Maps de un evento (confianza alta)' })]
    const plan = planDeCorrida({
      venues,
      conteoEventos: new Map(),
      lecturasPorLugar: new Map([['a', [PIN]]]),
      opciones: { ...PROGRAMADO, programado: false },
      ahora: AHORA,
    })
    expect(plan.porEnlace).toEqual([])
    expect(plan.aNominatim).toEqual([])
  })

  it('un link dudoso no resuelve: el lugar sigue a Nominatim y el link queda para revisar; los cortos se cuentan', () => {
    const centro: LecturaEnlaceMaps = { ...PIN, precision: 'centro' }
    const venues = [venue('a')]
    const plan = planDeCorrida({
      venues,
      conteoEventos: new Map(),
      lecturasPorLugar: new Map([['a', [centro, { tipo: 'corto', enlace: 'https://maps.app.goo.gl/x' }]]]),
      opciones: PROGRAMADO,
      ahora: AHORA,
    })
    expect(plan.porEnlace).toEqual([])
    expect(plan.aNominatim.map((v) => v.id)).toEqual(['a'])
    expect(plan.enlacesParaRevisar.get('a')).toMatchObject({ confianza: 'revisar' })
    expect(plan.enlacesCortos.get('a')).toBe(1)
  })

  it('los que se resuelven por link no ocupan lugar en el tope', () => {
    const venues = Array.from({ length: 22 }, (_, i) => venue(`v${String(i).padStart(2, '0')}`))
    const lecturas = new Map([
      ['v00', [PIN]],
      ['v01', [PIN]],
    ])
    const plan = planDeCorrida({ venues, conteoEventos: new Map(), lecturasPorLugar: lecturas, opciones: PROGRAMADO, ahora: AHORA })
    expect(plan.porEnlace).toHaveLength(2)
    expect(plan.aNominatim).toHaveLength(20)
    expect(plan.afuera.tope).toBe(0)
  })
})

describe('listadoEnSeco y pedidosMaximos', () => {
  it('lista primero los de link y después los de Nominatim con sus consultas, sin pedir nada', () => {
    const venues = [venue('link', { name: 'Teatro de Prueba' }), venue('nom', { name: 'Bar Inventado', address: 'Balcarce 123' })]
    const conteo = new Map([['nom', 2]])
    const plan = planDeCorrida({
      venues,
      conteoEventos: conteo,
      lecturasPorLugar: new Map([['link', [PIN]]]),
      opciones: PROGRAMADO,
      ahora: AHORA,
    })
    const lineas = listadoEnSeco(plan, conteo)
    expect(lineas.map((l) => [l.orden, l.nombre, l.eventos])).toEqual([
      [1, 'Teatro de Prueba', 0],
      [2, 'Bar Inventado', 2],
    ])
    expect(lineas[0].accion).toMatch(/link de Maps/)
    expect(lineas[1].detalle).toContain('Balcarce 123, Salta (estructurada)')
    expect(pedidosMaximos(plan)).toBe(4)
  })
})

describe('ordenarLugaresAdmin (/admin/lugares)', () => {
  const lugares = [
    { id: '1', name: 'B', geocode_sugerencia_lat: null },
    { id: '2', name: 'A', geocode_sugerencia_lat: -24.7 },
    { id: '3', name: 'C', geocode_sugerencia_lat: null },
  ]
  const conteo = new Map([['3', 5]])

  it('en «Sin ubicación», las sugerencias primero; después por eventos y por nombre', () => {
    expect(ordenarLugaresAdmin(lugares, conteo, { sugerenciasPrimero: true }).map((l) => l.id)).toEqual(['2', '3', '1'])
  })

  it('en las otras pestañas, como antes: por eventos y por nombre', () => {
    expect(ordenarLugaresAdmin(lugares, conteo, { sugerenciasPrimero: false }).map((l) => l.id)).toEqual(['3', '2', '1'])
  })
})

describe('workflow de geocodificación (Q7-2)', () => {
  const yml = readFileSync(fileURLToPath(new URL('../../../../../.github/workflows/geocodificar-lugares.yml', import.meta.url)), 'utf8')

  it('pasa el tope por variable (no por --limite) y tiene tiempo para 30 lugares', () => {
    expect(yml).toMatch(/GEOCODIFICACION_TOPE:\s*\$\{\{\s*vars\.GEOCODIFICACION_TOPE\s*\}\}/)
    expect(yml).toMatch(/timeout-minutes:\s*45/)
  })
})
