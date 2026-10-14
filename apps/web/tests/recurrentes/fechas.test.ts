import { describe, expect, it } from 'vitest'
import {
  diaDeLaSemana,
  diaSalta,
  fechasPendientes,
  saltaAUtc,
  slugMuseos,
  slugPenas,
} from '@/lib/recurrentes/fechas'
import { HORIZONTE_MUSEOS_DIAS, HORIZONTE_PENAS_DIAS, MUSEOS, PENAS } from '@/lib/recurrentes/config'

// 2026-11-09 es lunes. 12:00Z = 09:00 en Salta.
const LUNES_MANANA = new Date('2026-11-09T12:00:00Z')

describe('diaSalta', () => {
  it('mediodía UTC es el mismo día', () => {
    expect(diaSalta(new Date('2026-11-09T12:00:00Z'))).toBe('2026-11-09')
  })
  it('lunes 01:30 UTC es domingo en Salta', () => {
    expect(diaSalta(new Date('2026-11-09T01:30:00Z'))).toBe('2026-11-08')
  })
  it('límite 02:59:59Z / 03:00:00Z', () => {
    expect(diaSalta(new Date('2026-11-09T02:59:59Z'))).toBe('2026-11-08')
    expect(diaSalta(new Date('2026-11-09T03:00:00Z'))).toBe('2026-11-09')
  })
  it('cruce de año', () => {
    expect(diaSalta(new Date('2027-01-01T02:00:00Z'))).toBe('2026-12-31')
  })
})

describe('diaDeLaSemana', () => {
  it('0 = domingo ... 6 = sábado', () => {
    expect(diaDeLaSemana('2026-11-08')).toBe(0)
    expect(diaDeLaSemana('2026-11-09')).toBe(1)
    expect(diaDeLaSemana('2026-11-10')).toBe(2)
    expect(diaDeLaSemana('2026-11-14')).toBe(6)
  })
})

describe('saltaAUtc', () => {
  it('hora de pared de Salta a UTC', () => {
    expect(saltaAUtc('2026-11-09', '21:00')).toBe('2026-11-10T00:00:00.000Z')
    expect(saltaAUtc('2026-11-09', '10:00')).toBe('2026-11-09T13:00:00.000Z')
  })
})

describe('fechasPendientes', () => {
  const dias = (xs: { dia: string }[]) => xs.map((x) => x.dia)

  it('museos: horizonte 7, martes a domingo, nunca lunes', () => {
    const museo = MUSEOS[0]
    const out = fechasPendientes({
      ahora: LUNES_MANANA,
      dias: museo.dias,
      hora: museo.hora,
      horizonteDias: HORIZONTE_MUSEOS_DIAS,
      yaCargadas: [],
    })
    expect(dias(out)).toEqual([
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ])
    for (const f of out) expect(diaDeLaSemana(f.dia)).not.toBe(1)
  })

  it('todos los museos excluyen el lunes en un mes entero', () => {
    for (const m of MUSEOS) {
      expect(m.dias).not.toContain(1)
      const out = fechasPendientes({
        ahora: LUNES_MANANA,
        dias: m.dias,
        hora: m.hora,
        horizonteDias: 30,
        yaCargadas: [],
      })
      for (const f of out) expect(diaDeLaSemana(f.dia)).not.toBe(1)
    }
  })

  it('peña de miércoles a domingo: horizonte 14', () => {
    const balderrama = PENAS[0]
    const out = fechasPendientes({
      ahora: LUNES_MANANA,
      dias: balderrama.dias,
      hora: balderrama.hora,
      horizonteDias: HORIZONTE_PENAS_DIAS,
      yaCargadas: [],
    })
    expect(dias(out)).toEqual([
      '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15',
      '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22',
    ])
    // 21:00 Salta = 00:00Z del día siguiente
    expect(out[0].startUtc).toBe('2026-11-12T00:00:00.000Z')
  })

  it('peña todos los días: 14 fechas', () => {
    const vieja = PENAS[1]
    const out = fechasPendientes({
      ahora: LUNES_MANANA,
      dias: vieja.dias,
      hora: vieja.hora,
      horizonteDias: HORIZONTE_PENAS_DIAS,
      yaCargadas: [],
    })
    expect(out).toHaveLength(14)
    expect(out[0].dia).toBe('2026-11-09')
    expect(out[13].dia).toBe('2026-11-22')
  })

  it('hoy se incluye si la hora todavía no pasó', () => {
    const out = fechasPendientes({ ahora: LUNES_MANANA, dias: [1], hora: '21:00', horizonteDias: 1, yaCargadas: [] })
    expect(dias(out)).toEqual(['2026-11-09'])
  })

  it('se saltea hoy si la hora ya pasó', () => {
    // sábado 23:00 Salta = domingo 02:00Z; la peña de las 21:00 ya empezó
    const ahora = new Date('2026-11-15T02:00:00Z')
    const out = fechasPendientes({ ahora, dias: [6], hora: '21:00', horizonteDias: 1, yaCargadas: [] })
    expect(out).toEqual([])
  })

  it('justo a la hora exacta cuenta como pasada', () => {
    const ahora = new Date(saltaAUtc('2026-11-09', '21:00'))
    const out = fechasPendientes({ ahora, dias: [1], hora: '21:00', horizonteDias: 1, yaCargadas: [] })
    expect(out).toEqual([])
  })

  it('saltea los días ya cargados', () => {
    const out = fechasPendientes({
      ahora: LUNES_MANANA,
      dias: [3, 4],
      hora: '21:00',
      horizonteDias: 7,
      yaCargadas: ['2026-11-11'],
    })
    expect(dias(out)).toEqual(['2026-11-12'])
  })

  it('yaCargadas acepta cualquier iterable (Set)', () => {
    const out = fechasPendientes({
      ahora: LUNES_MANANA,
      dias: [3],
      hora: '21:00',
      horizonteDias: 7,
      yaCargadas: new Set(['2026-11-11']),
    })
    expect(out).toEqual([])
  })

  it('día de Salta cerca de la medianoche UTC: lunes 01:30Z es domingo 22:30 en Salta', () => {
    const ahora = new Date('2026-11-09T01:30:00Z')
    // El primer día evaluado es el domingo 8 (no el lunes 9); a las 23:00 todavía no pasó.
    const out = fechasPendientes({ ahora, dias: [0], hora: '23:00', horizonteDias: 1, yaCargadas: [] })
    expect(dias(out)).toEqual(['2026-11-08'])
    expect(out[0].startUtc).toBe('2026-11-09T02:00:00.000Z')
    // Con hora ya pasada (22:00) no se genera nada.
    expect(fechasPendientes({ ahora, dias: [0], hora: '22:00', horizonteDias: 1, yaCargadas: [] })).toEqual([])
    // Y el lunes no entra para un museo (martes a domingo).
    expect(fechasPendientes({ ahora, dias: MUSEOS[0].dias, hora: '10:00', horizonteDias: 1, yaCargadas: [] })).toEqual([])
  })

  it('horizonte 0 y sin días dan vacío', () => {
    expect(fechasPendientes({ ahora: LUNES_MANANA, dias: [1], hora: '21:00', horizonteDias: 0, yaCargadas: [] })).toEqual([])
    expect(fechasPendientes({ ahora: LUNES_MANANA, dias: [], hora: '21:00', horizonteDias: 14, yaCargadas: [] })).toEqual([])
  })
})

describe('config', () => {
  it('horizontes: peñas 14, museos 7', () => {
    expect(HORIZONTE_PENAS_DIAS).toBe(14)
    expect(HORIZONTE_MUSEOS_DIAS).toBe(7)
  })
})

describe('slugs', () => {
  it('slugPenas', () => {
    expect(slugPenas('Peña folklórica en Balderrama')).toBe('pena-folklorica-en-balderrama')
    expect(slugPenas('')).toBe('')
    expect(slugPenas('a'.repeat(200))).toHaveLength(90)
  })
  it('slugMuseos', () => {
    expect(slugMuseos('Museo de Antropologia - MAS')).toBe('museo-de-antropologia-mas')
    expect(slugMuseos('Explora Salta')).toBe('explora-salta')
    expect(slugMuseos('a'.repeat(200))).toHaveLength(100)
  })
})
