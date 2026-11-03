// Q5-9 · Duplicados entre fuentes (Instagram contra ticketeras y webs), con
// casos reales ANONIMIZADOS: los títulos y lugares tienen la misma forma que
// los que pasaron en la base (mayúsculas, «GIRA 2026», emojis, «en Salta»,
// el lugar con nombre largo o corto), con nombres inventados.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  compararEntreFuentes,
  lugaresParecidos,
  similitudDeTitulos,
  type EventoComparable,
} from '@qps/core/events/duplicados-entre-fuentes'
import { findDuplicateCandidates, type DuplicateCandidateEvent } from '@/lib/events/duplicate-candidates'

// 21:00 del sábado 7/11/2026 en Salta = 00:00 UTC del 8/11.
const SAB_21 = '2026-11-08T00:00:00.000Z'
const SAB_2130 = '2026-11-08T00:30:00.000Z'
const SAB_00 = '2026-11-07T03:00:00.000Z' // 00:00 en Salta: «sin hora»
const SAB_17 = '2026-11-07T20:00:00.000Z'
const DOM_21 = '2026-11-09T00:00:00.000Z'

function ev(id: string, title: string, start: string, venue_id: string | null, venueNombre: string | null, fuente: string | null): EventoComparable {
  return { id, title, start_date: start, venue_id, venueNombre, fuente }
}

describe('similitud de títulos (sin el ruido de flyers y ticketeras)', () => {
  it.each([
    ['LOS EJEMPLARES - GIRA 2026', 'Los Ejemplares en Salta 🔥', 1],
    ['Banda Inventada presenta «Disco Nuevo»', 'BANDA INVENTADA – Disco Nuevo Tour', 1],
    ['Peña de los Inventados', 'Gran peña Los Inventados con invitados', 0.66],
  ])('«%s» ~ «%s» ≥ %s', (a, b, minimo) => {
    expect(similitudDeTitulos(a, b)).toBeGreaterThanOrEqual(minimo)
  })
  it('una sola palabra en común no alcanza («Fiesta» genérica)', () => {
    expect(similitudDeTitulos('Fiesta Retro', 'Fiesta Neón')).toBeLessThan(0.6) // el umbral de «media»
  })
})

describe('lugares parecidos', () => {
  it('nombre corto contra nombre largo del mismo lugar', () => {
    expect(lugaresParecidos('Teatro Provincial', 'Teatro Provincial Juan Carlos Saravia')).toBe(true)
    expect(lugaresParecidos('Casa Inventada', 'La Casa Inventada')).toBe(true)
  })
  it('lugares distintos', () => {
    expect(lugaresParecidos('Teatro Provincial', 'Teatro del Huerto')).toBe(false)
    expect(lugaresParecidos(null, 'Teatro Provincial')).toBe(false)
  })
})

describe('compararEntreFuentes (casos anonimizados)', () => {
  it('caso 1 · ticketera vs flyer, lugar con nombre largo/corto en dos venues distintos: ALTA (igual va a la cola, no se fusiona)', () => {
    const r = compararEntreFuentes(
      ev('a', 'LOS EJEMPLARES - GIRA 2026', SAB_21, 'v-largo', 'Teatro Provincial Juan Carlos Saravia', 'entradauno'),
      ev('b', 'Los Ejemplares en Salta 🔥', SAB_21, 'v-corto', 'Teatro Provincial', 'instagram-ai'),
    )
    expect(r.confianza).toBe('alta')
    expect(r.motivos).toContain('nombres de lugar compatibles')
  })
  it('caso 2 · flyer sin lugar y media hora de diferencia: MEDIA', () => {
    const r = compararEntreFuentes(
      ev('a', 'Banda Inventada presenta Disco Nuevo', SAB_21, 'v1', 'Usina Inventada', 'norteticket'),
      ev('b', 'BANDA INVENTADA · Disco Nuevo', SAB_2130, null, null, 'instagram-ai'),
    )
    expect(r.confianza).toBe('media')
    expect(r.motivos).toContain('a uno le falta el lugar')
  })
  it('caso 3 · el flyer sin hora (00:00) el mismo día: cuenta como compatible', () => {
    const r = compararEntreFuentes(
      ev('a', 'Peña de los Inventados', SAB_21, 'v1', 'Peña Inventada', 'entradauno'),
      ev('b', 'Gran peña Los Inventados', SAB_00, 'v1', 'Peña Inventada', 'instagram-ai'),
    )
    expect(r.confianza).not.toBe('baja')
  })
  it.each([
    ['misma fuente', ev('a', 'X Ejemplo Uno', SAB_21, null, null, 'instagram-ai'), ev('b', 'X Ejemplo Uno', SAB_21, null, null, 'instagram-ai')],
    ['otro día', ev('a', 'Banda Inventada', SAB_21, null, null, 'entradauno'), ev('b', 'Banda Inventada', DOM_21, null, null, 'instagram-ai')],
    ['otro horario (vermú y noche)', ev('a', 'Banda Inventada en vivo', SAB_17, 'v1', 'Bar X', 'entradauno'), ev('b', 'Banda Inventada', SAB_21, 'v1', 'Bar X', 'instagram-ai')],
    ['lugares distintos', ev('a', 'Fiesta Inventada', SAB_21, 'v1', 'Boliche Uno', 'alpogo'), ev('b', 'Fiesta Inventada', SAB_21, 'v2', 'Boliche Dos', 'instagram-ai')],
    ['títulos distintos', ev('a', 'Ballet Ejemplo', SAB_21, null, null, 'entradauno'), ev('b', 'Recital de Otro Grupo', SAB_21, null, null, 'instagram-ai')],
  ])('BAJA: %s', (_n, a, b) => {
    expect(compararEntreFuentes(a, b).confianza).toBe('baja')
  })
})

function candidato(id: string, title: string, start: string, venue_id: string | null, venue: string | null, fuente: string): DuplicateCandidateEvent {
  return { id, title, start_date: start, status: 'PUBLISHED', venue_id, scrape_source_key: fuente, venue: venue ? { name: venue } : null }
}

describe('cola de revisión (/admin/duplicados): segunda pasada entre fuentes', () => {
  const eventos = [
    candidato('a', 'LOS EJEMPLARES - GIRA 2026', SAB_21, 'v-largo', 'Teatro Provincial Juan Carlos Saravia', 'entradauno'),
    candidato('b', 'Los Ejemplares en Salta 🔥', SAB_21, 'v-corto', 'Teatro Provincial', 'instagram-ai'),
    candidato('c', 'Fiesta Inventada', SAB_21, 'v-x', 'Boliche Uno', 'instagram-ai'),
  ]
  it('suma el par entre fuentes con su confianza, sin tocar la primera pasada', () => {
    const pares = findDuplicateCandidates(eventos)
    expect(pares).toHaveLength(1)
    expect(pares[0]).toMatchObject({ a: { id: 'a' }, b: { id: 'b' }, entreFuentes: { confianza: 'alta' } })
  })
  it('un par descartado por un admin no vuelve', () => {
    expect(findDuplicateCandidates(eventos, { dismissed: new Set(['a|b']) })).toEqual([])
  })
  it('el mismo venue sigue en la primera pasada (sin entreFuentes) y no se duplica', () => {
    const mismo = [candidato('a', 'Uno', SAB_21, 'v1', 'L', 'entradauno'), candidato('b', 'Uno', SAB_2130, 'v1', 'L', 'instagram-ai')]
    const pares = findDuplicateCandidates(mismo)
    expect(pares).toHaveLength(1)
    expect(pares[0]!.entreFuentes).toBeUndefined()
  })
  it('nunca fusiona: duplicate-candidates no escribe ni llama a merge_events', () => {
    const s = readFileSync(join(process.cwd(), 'lib', 'events', 'duplicate-candidates.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(s).not.toMatch(/merge_events|\.update\(|\.insert\(|\.delete\(|mergeDuplicatePair/)
  })
})
