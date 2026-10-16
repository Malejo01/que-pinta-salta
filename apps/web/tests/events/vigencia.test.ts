import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  DURACION_ESTIMADA_HORAS,
  applyVigenciaPrefilter,
  estimatedEnd,
  isVigente,
} from '@/lib/events/vigencia'
import { createFakeSupabase, type Row } from '../radar/fake-supabase'

// Salta es UTC-3 todo el año. Día de referencia: 2030-10-10 (jueves).
const H = 3_600_000
const salta = (iso: string) => new Date(`${iso}-03:00`) // '2030-10-10T10:00' -> instante real

describe('estimatedEnd', () => {
  it('constante de 4 horas', () => {
    expect(DURACION_ESTIMADA_HORAS).toBe(4)
  })

  it('con end_date: usa end_date', () => {
    const e = { start_date: '2030-10-10T13:00:00.000Z', end_date: '2030-10-20T02:00:00.000Z' }
    expect(estimatedEnd(e).toISOString()).toBe('2030-10-20T02:00:00.000Z')
  })

  it('con hora explícita y sin end_date: inicio + 4 h', () => {
    const e = { start_date: salta('2030-10-10T10:00').toISOString(), end_date: null }
    expect(estimatedEnd(e).toISOString()).toBe(salta('2030-10-10T14:00').toISOString())
  })

  it('end_date ausente (undefined) se trata como null', () => {
    const e = { start_date: salta('2030-10-10T10:00').toISOString() }
    expect(estimatedEnd(e).getTime()).toBe(salta('2030-10-10T10:00').getTime() + 4 * H)
  })

  it('sin hora (00:00 de Salta): fin del día en Salta, 23:59:59.999', () => {
    const e = { start_date: salta('2030-10-10T00:00').toISOString(), end_date: null }
    expect(estimatedEnd(e).toISOString()).toBe('2030-10-11T02:59:59.999Z')
  })

  it('con hora tarde (23:00) el fin pasa de día (inicio + 4 h)', () => {
    const e = { start_date: salta('2030-10-10T23:00').toISOString() }
    expect(estimatedEnd(e).toISOString()).toBe(salta('2030-10-11T03:00').toISOString())
  })
})

describe('isVigente: casos de Mauro', () => {
  it('evento de las 10:00 consultado a las 15:00: NO (fin 14:00)', () => {
    const e = { start_date: salta('2030-10-10T10:00').toISOString(), end_date: null }
    expect(isVigente(e, salta('2030-10-10T15:00'))).toBe(false)
  })

  it('evento sin hora consultado a las 23:00 del mismo día: SÍ', () => {
    const e = { start_date: salta('2030-10-10T00:00').toISOString(), end_date: null }
    expect(isVigente(e, salta('2030-10-10T23:00'))).toBe(true)
  })

  it('muestra con end_date futuro: SÍ, aunque haya empezado hace semanas', () => {
    const e = { start_date: salta('2030-09-01T19:00').toISOString(), end_date: salta('2030-10-25T23:00').toISOString() }
    expect(isVigente(e, salta('2030-10-10T15:00'))).toBe(true)
  })

  it('muestra con end_date pasado: NO', () => {
    const e = { start_date: salta('2030-09-01T19:00').toISOString(), end_date: salta('2030-10-09T23:00').toISOString() }
    expect(isVigente(e, salta('2030-10-10T15:00'))).toBe(false)
  })
})

describe('isVigente: bordes', () => {
  const e10 = { start_date: salta('2030-10-10T10:00').toISOString(), end_date: null }
  const sinHora = { start_date: salta('2030-10-10T00:00').toISOString(), end_date: null }

  it('10:00 consultado a las 13:59: SÍ', () => {
    expect(isVigente(e10, salta('2030-10-10T13:59'))).toBe(true)
  })
  it('10:00 consultado justo a las 14:00 (fin >= now): SÍ', () => {
    expect(isVigente(e10, salta('2030-10-10T14:00'))).toBe(true)
  })
  it('10:00 consultado a las 14:00:00.001: NO', () => {
    expect(isVigente(e10, new Date(salta('2030-10-10T14:00').getTime() + 1))).toBe(false)
  })
  it('sin hora consultado al día siguiente a las 00:01: NO', () => {
    expect(isVigente(sinHora, salta('2030-10-11T00:01'))).toBe(false)
  })
  it('sin hora consultado a las 23:59:59.999: SÍ', () => {
    expect(isVigente(sinHora, new Date(salta('2030-10-10T23:59').getTime() + 59_999))).toBe(true)
  })
  it('evento futuro: SÍ', () => {
    expect(isVigente(e10, salta('2030-10-09T12:00'))).toBe(true)
  })
  it('end_date exactamente igual a now: SÍ', () => {
    const e = { start_date: salta('2030-10-01T10:00').toISOString(), end_date: salta('2030-10-10T15:00').toISOString() }
    expect(isVigente(e, salta('2030-10-10T15:00'))).toBe(true)
  })
  it('sin now explícito usa la hora actual', () => {
    expect(isVigente({ start_date: '2099-01-01T20:00:00.000Z' })).toBe(true)
    expect(isVigente({ start_date: '2001-01-01T20:00:00.000Z' })).toBe(false)
  })
})

describe('applyVigenciaPrefilter', () => {
  const NOW = salta('2030-10-10T15:00')

  it('devuelve la misma consulta encadenada y manda un único .or', () => {
    const fake = createFakeSupabase({ events: { rows: [] } })
    const q = fake.client.from('events')
    const out = applyVigenciaPrefilter(q, NOW)
    expect(out).toBe(q)
    expect(fake.args(fake.queries[0], 'or')).toHaveLength(1)
  })

  it('el .or usa end_date.gte.<now> y and(end_date.is.null,start_date.gte.<desde>)', () => {
    const fake = createFakeSupabase({ events: { rows: [] } })
    applyVigenciaPrefilter(fake.client.from('events'), NOW)
    const expr = fake.args(fake.queries[0], 'or')[0][0] as string
    expect(expr).toContain(`end_date.gte.${NOW.toISOString()}`)
    expect(expr).toContain('and(end_date.is.null,start_date.gte.')
  })

  it('modo por defecto: end_date >= now, o sin end_date y start >= now - 4 h, o sin end_date y start = inicio del día', () => {
    const fake = createFakeSupabase({ events: { rows: [] } })
    applyVigenciaPrefilter(fake.client.from('events'), NOW)
    expect(fake.args(fake.queries[0], 'or')).toEqual([[
      `end_date.gte.${NOW.toISOString()},` +
        `and(end_date.is.null,start_date.gte.${salta('2030-10-10T11:00').toISOString()}),` +
        `and(end_date.is.null,start_date.eq.${salta('2030-10-10T00:00').toISOString()})`,
    ]])
  })

  it('con includeToday: sin end_date, start >= min(now - 4 h, inicio del día)', () => {
    const desdeDe = (now: Date) => {
      const fake = createFakeSupabase({ events: { rows: [] } })
      applyVigenciaPrefilter(fake.client.from('events'), now, { includeToday: true })
      const expr = fake.args(fake.queries[0], 'or')[0][0] as string
      expect(expr).toContain(`end_date.gte.${now.toISOString()}`)
      expect(expr).not.toContain('start_date.eq.')
      return /start_date\.gte\.([^)]+)\)/.exec(expr)![1]
    }
    // A las 15:00 manda el inicio del día; a la 01:00, now - 4 h (día anterior).
    expect(desdeDe(salta('2030-10-10T15:00'))).toBe(salta('2030-10-10T00:00').toISOString())
    expect(desdeDe(salta('2030-10-10T01:00'))).toBe(salta('2030-10-09T21:00').toISOString())
  })

  describe('museo de las 10:00 (sin end_date) y evento sin hora de hoy, consultado a las 18:00', () => {
    const NOW18 = salta('2030-10-10T18:00')
    const museo: Row = { id: 'museo-de-prueba', start_date: salta('2030-10-10T10:00').toISOString(), end_date: null }
    const sinHora: Row = { id: 'sin-hora-de-prueba', start_date: salta('2030-10-10T00:00').toISOString(), end_date: null }
    const pasan = async (opts?: { includeToday?: boolean }) => {
      const fake = createFakeSupabase({ events: { rows: [museo, sinHora] } })
      const { data } = (await applyVigenciaPrefilter(fake.client.from('events'), NOW18, opts)) as unknown as { data: Row[] }
      return data.map((r) => r.id)
    }

    it('por defecto: el museo NO pasa el prefiltro; el sin hora de hoy sí', async () => {
      expect(await pasan()).toEqual(['sin-hora-de-prueba'])
    })
    it('con includeToday: pasan los dos (la home filtra en el cliente)', async () => {
      expect((await pasan({ includeToday: true })).sort()).toEqual(['museo-de-prueba', 'sin-hora-de-prueba'])
    })
    it('isVigente: el museo no es vigente a las 18:00, el sin hora sí', () => {
      expect(isVigente(museo as { start_date: string }, NOW18)).toBe(false)
      expect(isVigente(sinHora as { start_date: string }, NOW18)).toBe(true)
    })
  })

  // Propiedad: todo lo vigente está dentro del prefiltro, en los dos modos.
  it.each([
    ['por defecto', undefined],
    ['includeToday', { includeToday: true }],
  ])('isVigente está contenido en el prefiltro (%s) en un barrido determinista', async (_n, opts) => {
    let seed = 12345
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }
    const base = salta('2030-10-01T00:00').getTime()
    const rows: Row[] = []
    for (let i = 0; i < 400; i++) {
      const dia = Math.floor(rnd() * 20)
      const sinHora = rnd() < 0.3
      const minutos = sinHora ? 0 : Math.floor(rnd() * 24 * 4) * 15
      const start = base + dia * 24 * H + minutos * 60_000
      const end = rnd() < 0.25 ? start + Math.floor(rnd() * 30 * 24) * H : null
      rows.push({
        id: `evento-de-prueba-${i}`,
        start_date: new Date(start).toISOString(),
        end_date: end === null ? null : new Date(end).toISOString(),
      })
    }
    const nows = [
      '2030-10-05T00:00', '2030-10-05T00:01', '2030-10-05T01:00', '2030-10-05T03:59',
      '2030-10-05T04:00', '2030-10-05T12:00', '2030-10-05T15:00', '2030-10-05T23:00',
      '2030-10-05T23:59', '2030-10-12T02:30', '2030-10-12T13:59', '2030-10-15T20:00',
      '2030-10-20T23:59',
    ].map(salta)
    let vigentes = 0
    for (const now of nows) {
      const fake = createFakeSupabase({ events: { rows } })
      const { data } = (await applyVigenciaPrefilter(fake.client.from('events'), now, opts)) as unknown as {
        data: Row[]
      }
      const dentro = new Set(data.map((r) => r.id as string))
      for (const r of rows) {
        const vigente = isVigente({ start_date: r.start_date as string, end_date: r.end_date as string | null }, now)
        if (vigente) {
          vigentes++
          expect(dentro.has(r.id as string), `${now.toISOString()} ${JSON.stringify(r)}`).toBe(true)
        }
      }
    }
    expect(vigentes).toBeGreaterThan(500)
  })
})

describe('misma función en la agenda, la home, favoritos y el Radar', () => {
  const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

  it.each(['lib/data.ts', 'lib/radar/events.ts'])(
    '%s importa y usa el prefiltro y isVigente de lib/events/vigencia',
    (file) => {
      const src = read(file)
      expect(src).toMatch(/from ['"]@\/lib\/events\/vigencia['"]/)
      expect(src).toContain('applyVigenciaPrefilter')
      expect(src).toContain('isVigente')
    },
  )

  // 29-a: el filtro de vigencia de /favoritos se movió de app/favoritos/page.tsx
  // a `armarFavoritos` (packages/core/src/favoritos/armar.ts), así que
  // page.tsx ya no importa `isVigente` directamente. El invariante
  // ("favoritos nunca muestra algo no vigente") sigue protegido en dos
  // pasos, y este test cubre los dos: 1) page.tsx sigue aplicando el
  // prefiltro de la base (`applyVigenciaPrefilter`) y delega el armado en
  // `armarFavoritos`; 2) `armarFavoritos` aplica `isVigente`. Si cualquiera
  // de los dos pasos desaparece, el test de abajo correspondiente falla.
  it('app/favoritos/page.tsx sigue aplicando el prefiltro y delega el armado en armarFavoritos', () => {
    const src = read('app/favoritos/page.tsx')
    expect(src).toMatch(/from ['"]@\/lib\/events\/vigencia['"]/)
    expect(src).toContain('applyVigenciaPrefilter')
    expect(src).toMatch(/from ['"]@qps\/core\/favoritos\/armar['"]/)
    expect(src).toContain('armarFavoritos')
  })

  it('armarFavoritos (packages/core/src/favoritos/armar.ts) aplica isVigente', () => {
    const src = readFileSync(
      new URL('../../../../packages/core/src/favoritos/armar.ts', import.meta.url),
      'utf8',
    )
    expect(src).toMatch(/from ['"]\.\.\/events\/vigencia['"]/)
    expect(src).toContain('isVigente')
  })

  it('la home filtra la agenda con isVigente', () => {
    // Movido por 16-b: la lógica de `buildDisplayData` (antes en
    // components/home-content.tsx) vive en home/transform.ts. Desde la tarea
    // 22-a (R22, monorepo) ese módulo vive en packages/core/src/home/transform.ts
    // y lib/home/transform.ts es sólo un reexport, así que el test lee la fuente
    // real en core con un import relativo a events/vigencia.
    const src = readFileSync(
      new URL('../../../../packages/core/src/home/transform.ts', import.meta.url),
      'utf8',
    )
    expect(src).toMatch(/from ['"]\.\.\/events\/vigencia['"]/)
    expect(src).toContain('isVigente')
  })

  it('no quedan filtros viejos de inicio del día', () => {
    // includeStartedToday sigue a propósito (decisión del lead, Ronda 9): la
    // home recibe el prefiltro sin el filtro exacto porque filtra en el
    // cliente con dos criterios: la agenda con isVigente (test de arriba) y la
    // fila "Hoy" con isRelevantToday (museos todo el día, QPS-011).
    expect(read('lib/data.ts')).not.toContain("gte('start_date'")
    expect(read('app/favoritos/page.tsx')).not.toContain("gte('start_date'")
    expect(read('lib/radar/events.ts')).not.toContain('saltaStartOfDayISO')
  })
})
