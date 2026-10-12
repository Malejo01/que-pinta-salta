import { describe, expect, it } from 'vitest'
import {
  buildDedupKey,
  dedupKeyOf,
  hasRealTime,
  isAutoDescription,
  normalizeTicketUrl,
  normalizeTitleForKey,
  sameTicketEvent,
  saltaDayRangeUtc,
  ticketUrlsOf,
  venuesCompatible,
} from '@/lib/scraper/dedup-key'

describe('isAutoDescription', () => {
  it('detecta la descripción automática del scraper', () => {
    expect(isAutoDescription('Evento importado automáticamente desde X')).toBe(true)
  })
  it('tolera espacios iniciales, mayúsculas y sin tilde', () => {
    expect(isAutoDescription('  EVENTO IMPORTADO AUTOMATICAMENTE')).toBe(true)
  })
  it('no matchea si la frase está en el medio', () => {
    expect(isAutoDescription('Un evento importado automáticamente')).toBe(false)
  })
  it('null, undefined y vacío son false', () => {
    expect(isAutoDescription(null)).toBe(false)
    expect(isAutoDescription(undefined)).toBe(false)
    expect(isAutoDescription('')).toBe(false)
  })
  it('una descripción real es false', () => {
    expect(isAutoDescription('Show en vivo con banda de prueba')).toBe(false)
  })
})

describe('normalizeTitleForKey', () => {
  it('vacíos devuelven cadena vacía', () => {
    expect(normalizeTitleForKey(null)).toBe('')
    expect(normalizeTitleForKey(undefined)).toBe('')
    expect(normalizeTitleForKey('   ')).toBe('')
    expect(normalizeTitleForKey('¡¡!!')).toBe('')
  })
  it('minúsculas, sin tildes ni puntuación', () => {
    expect(normalizeTitleForKey('  ¡Bandá  de   Prueba! ')).toBe('banda de prueba')
  })
  it.each([
    ['Banda en Salta', 'banda'],
    ['Banda - Salta 2026', 'banda'],
    ['Banda | Salta Capital', 'banda'],
    ['Banda (Salta, Argentina)', 'banda'],
    ['Gira Federal Salta 2026', 'gira federal'],
    ['Banda en Salta Argentina 2026', 'banda'],
    ['Banda en la ciudad de Salta', 'banda'],
  ])('saca sufijo de ciudad: %s', (input, expected) => {
    expect(normalizeTitleForKey(input)).toBe(expected)
  })
  it('no saca "Salta" del medio ni vacía un título que es la ciudad', () => {
    expect(normalizeTitleForKey('Salta la Linda Fest')).toBe('salta la linda fest')
    expect(normalizeTitleForKey('Salta')).toBe('salta')
    expect(normalizeTitleForKey('Salta Capital')).toBe('salta capital')
  })
  it('conserva un año suelto', () => {
    expect(normalizeTitleForKey('Expo Ganadera 2026')).toBe('expo ganadera 2026')
  })
  it('no quita stop words', () => {
    expect(normalizeTitleForKey('Show de Rock')).not.toBe(normalizeTitleForKey('Rock'))
  })
})

describe('buildDedupKey', () => {
  it('arma título|día', () => {
    expect(buildDedupKey('Banda de Prueba', '2026-11-07T15:00:00Z')).toBe('banda de prueba|2026-11-07')
  })
  it('el día es de Salta, no UTC: 01:00Z del domingo es sábado', () => {
    expect(buildDedupKey('Banda', '2026-11-08T01:00:00Z')).toBe('banda|2026-11-07')
  })
  it('límite: 02:59Z es el día anterior, 03:00Z es el día nuevo', () => {
    expect(buildDedupKey('Banda', '2026-11-08T02:59:59Z')).toBe('banda|2026-11-07')
    expect(buildDedupKey('Banda', '2026-11-08T03:00:00Z')).toBe('banda|2026-11-08')
  })
  it('acepta Date', () => {
    expect(buildDedupKey('Banda', new Date('2026-11-07T15:00:00Z'))).toBe('banda|2026-11-07')
  })
  it('misma clave para variantes del título', () => {
    expect(buildDedupKey('Banda en Salta', '2026-11-07T23:00:00Z')).toBe(
      buildDedupKey('BANDA', '2026-11-07T23:00:00Z')
    )
  })
  it('devuelve vacío sin título o sin fecha', () => {
    expect(buildDedupKey('', '2026-11-07T15:00:00Z')).toBe('')
    expect(buildDedupKey(null, '2026-11-07T15:00:00Z')).toBe('')
    expect(buildDedupKey('Banda', null)).toBe('')
    expect(buildDedupKey('Banda', undefined)).toBe('')
    expect(buildDedupKey('Banda', '')).toBe('')
  })
  // QPS-033: arreglado, una fecha inválida devuelve vacío.
  it('fecha inválida: no tira excepción y devuelve vacío', () => {
    expect(() => buildDedupKey('Banda', 'no-es-fecha')).not.toThrow()
    expect(buildDedupKey('Banda', 'no-es-fecha')).toBe('')
  })
})

describe('dedupKeyOf', () => {
  it('usa title y start_date de la fila', () => {
    expect(dedupKeyOf({ title: 'Banda', start_date: '2026-11-07T15:00:00Z' })).toBe('banda|2026-11-07')
  })
  it('tolera fila vacía', () => {
    expect(dedupKeyOf({})).toBe('')
  })
})

describe('saltaDayRangeUtc', () => {
  it('cubre el día completo de Salta en UTC', () => {
    expect(saltaDayRangeUtc('2026-11-07T15:00:00Z')).toEqual({
      from: '2026-11-07T03:00:00.000Z',
      to: '2026-11-08T02:59:59.999Z',
    })
  })
  it('un evento de las 22:00 de Salta (01:00Z) cae en el rango de su día', () => {
    const { from, to } = saltaDayRangeUtc('2026-11-08T01:00:00Z')
    const t = new Date('2026-11-08T01:00:00Z').getTime()
    expect(t).toBeGreaterThanOrEqual(new Date(from).getTime())
    expect(t).toBeLessThanOrEqual(new Date(to).getTime())
  })
})

describe('venuesCompatible', () => {
  it('mismo venue', () => expect(venuesCompatible('v1', 'v1')).toBe(true))
  it('venues distintos', () => expect(venuesCompatible('v1', 'v2')).toBe(false))
  it('si falta uno o ambos es compatible', () => {
    expect(venuesCompatible(null, 'v2')).toBe(true)
    expect(venuesCompatible('v1', undefined)).toBe(true)
    expect(venuesCompatible(null, null)).toBe(true)
  })
})

describe('normalizeTicketUrl', () => {
  it('normaliza host, path y saca tracking', () => {
    expect(normalizeTicketUrl('https://NorteTicket.com/BERSUIT-EN-SALTA-2026/?utm_source=ig')).toBe(
      'norteticket.com/bersuit-en-salta-2026'
    )
  })
  it('saca www y barras finales', () => {
    expect(normalizeTicketUrl('https://www.tickets.test/evento///')).toBe('tickets.test/evento')
  })
  it('conserva parámetros que identifican, ordenados', () => {
    expect(normalizeTicketUrl('https://tickets.test/e?b=2&a=1&fbclid=x')).toBe('tickets.test/e?a=1&b=2')
  })
  it('descarta redes sociales y subdominios', () => {
    expect(normalizeTicketUrl('https://www.instagram.com/cuenta_prueba/')).toBe('')
    expect(normalizeTicketUrl('https://m.facebook.com/evento/1')).toBe('')
    expect(normalizeTicketUrl('https://linktr.ee/prueba')).toBe('')
    expect(normalizeTicketUrl('https://wa.me/5490000000000')).toBe('')
  })
  it('descarta la home (sin path)', () => {
    expect(normalizeTicketUrl('https://tickets.test/')).toBe('')
    expect(normalizeTicketUrl('https://tickets.test')).toBe('')
  })
  it('descarta inválidos y protocolos no http', () => {
    expect(normalizeTicketUrl('')).toBe('')
    expect(normalizeTicketUrl(null)).toBe('')
    expect(normalizeTicketUrl('no es url')).toBe('')
    expect(normalizeTicketUrl('javascript:alert(1)')).toBe('')
    expect(normalizeTicketUrl('ftp://tickets.test/e')).toBe('')
  })
})

describe('ticketUrlsOf', () => {
  it('junta ticket_url y ticket_sources sin duplicar', () => {
    const urls = ticketUrlsOf({
      ticket_url: 'https://tickets.test/e1?utm_x=1',
      ticket_sources: [{ url: 'https://tickets.test/e1' }, { url: 'https://otra.test/e1' }, { url: null }],
    })
    expect([...urls].sort()).toEqual(['otra.test/e1', 'tickets.test/e1'])
  })
  it('ticket_sources que no es array se ignora', () => {
    expect(ticketUrlsOf({ ticket_url: null, ticket_sources: 'basura' }).size).toBe(0)
  })
})

describe('hasRealTime', () => {
  it('00:00 de Salta (03:00Z) es sin hora', () => {
    expect(hasRealTime('2026-11-07T03:00:00Z')).toBe(false)
  })
  it('21:30 de Salta (00:30Z del día siguiente) tiene hora', () => {
    expect(hasRealTime('2026-11-08T00:30:00Z')).toBe(true)
  })
  it('00:00 UTC (21:00 en Salta) tiene hora', () => {
    expect(hasRealTime('2026-11-07T00:00:00Z')).toBe(true)
  })
  it('null, vacío e inválido son false', () => {
    expect(hasRealTime(null)).toBe(false)
    expect(hasRealTime('')).toBe(false)
    expect(hasRealTime('basura')).toBe(false)
  })
})

describe('sameTicketEvent', () => {
  const url = 'https://tickets.test/obra-de-prueba'
  const at = (iso: string) => ({ start_date: iso, ticket_url: url })

  it('mismo link, día y hora', () => {
    expect(sameTicketEvent(at('2026-11-07T00:00:00Z'), at('2026-11-07T00:00:00Z'))).toBe(true)
  })
  it('mismo link y día de Salta, función 16:00 vs 21:00: no se fusionan', () => {
    // 16:00 Salta = 19:00Z del 7; 21:00 Salta = 00:00Z del 8 (sigue siendo el 7 en Salta).
    expect(sameTicketEvent(at('2026-11-07T19:00:00Z'), at('2026-11-08T00:00:00Z'))).toBe(false)
  })
  it('mismo link, distinto día: no se fusionan', () => {
    expect(sameTicketEvent(at('2026-11-07T19:00:00Z'), at('2026-11-08T19:00:00Z'))).toBe(false)
  })
  it('una de las dos sin hora (00:00 Salta) sí se fusiona', () => {
    expect(sameTicketEvent(at('2026-11-07T03:00:00Z'), at('2026-11-07T19:00:00Z'))).toBe(true)
  })
  it('link distinto: no', () => {
    expect(
      sameTicketEvent(at('2026-11-07T19:00:00Z'), {
        start_date: '2026-11-07T19:00:00Z',
        ticket_url: 'https://otro.test/x',
      })
    ).toBe(false)
  })
  it('coincide por ticket_sources', () => {
    expect(
      sameTicketEvent(
        { start_date: '2026-11-07T19:00:00Z', ticket_sources: [{ url: url }] },
        { start_date: '2026-11-07T19:00:00Z', ticket_url: `${url}/?utm_source=x` }
      )
    ).toBe(true)
  })
  it('sin fecha o sin links: false', () => {
    expect(sameTicketEvent({ ticket_url: url }, at('2026-11-07T19:00:00Z'))).toBe(false)
    expect(
      sameTicketEvent({ start_date: '2026-11-07T19:00:00Z' }, { start_date: '2026-11-07T19:00:00Z' })
    ).toBe(false)
  })
  it('links de red social no identifican', () => {
    const ig = (d: string) => ({ start_date: d, ticket_url: 'https://instagram.com/cuenta_prueba/' })
    expect(sameTicketEvent(ig('2026-11-07T19:00:00Z'), ig('2026-11-07T19:00:00Z'))).toBe(false)
  })
})
