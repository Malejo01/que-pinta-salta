/**
 * `metricas/links.ts` movido a `packages/core/src` (R26, tarea 26-a):
 *  - lo movido tal cual (`METRIC_ORIGINS`, `parseOrigin`, `eventHref`,
 *    `goHref`) da lo mismo que antes del movimiento (ver también
 *    `apps/web/tests/metricas/links.test.ts`, que cubre lo mismo desde la
 *    web; acá se cubre desde `@qps/core` para que el módulo nuevo tenga sus
 *    propios casos, sin depender del puente).
 *  - lo nuevo de la tarea 26-a (`urlEvento`, `urlGo`, `urlTarjeta`,
 *    `urlComoLlegar`): URLs absolutas del sitio, para usar fuera de la web
 *    (p. ej. la app), con `null` cuando el id no es un uuid.
 *
 * Sin red: `SITIO` es la constante del módulo, no se pega a nada.
 */
import { describe, expect, it } from 'vitest'
import {
  eventHref,
  goHref,
  METRIC_ORIGINS,
  parseOrigin,
  SITIO,
  urlComoLlegar,
  urlEvento,
  urlGo,
  urlTarjeta,
} from '@qps/core/metricas/links'

const ID = '11111111-1111-4111-8111-111111111111'

describe('SITIO', () => {
  it('es la URL absoluta del sitio en producción', () => {
    expect(SITIO).toBe('https://www.quepintasalta.com.ar')
  })
})

describe('urlEvento / urlGo / urlTarjeta con un uuid válido', () => {
  it('urlEvento: URL absoluta exacta', () => {
    expect(urlEvento(ID)).toBe(`https://www.quepintasalta.com.ar/evento/${ID}`)
  })

  it('urlEvento con origen: URL absoluta exacta, con ?o=', () => {
    expect(urlEvento(ID, 'ficha')).toBe(`https://www.quepintasalta.com.ar/evento/${ID}?o=ficha`)
  })

  it('urlGo con o=app: URL absoluta exacta', () => {
    expect(urlGo(ID, 'app')).toBe(`https://www.quepintasalta.com.ar/go/${ID}?o=app`)
  })

  it('urlTarjeta: URL absoluta exacta', () => {
    expect(urlTarjeta(ID)).toBe(`https://www.quepintasalta.com.ar/api/tarjeta/${ID}`)
  })
})

describe('urlEvento / urlGo / urlTarjeta con algo que no es uuid: null', () => {
  const NO_UUIDS = [
    ['path traversal', '../x'],
    ['vacío', ''],
    ['no parece uuid', '123'],
    ['uuid con un carácter de más', `${ID}a`],
    ['uuid con un / pegado', `${ID}/`],
    ['uuid con espacios alrededor', ` ${ID} `],
  ] as const

  it.each(NO_UUIDS)('urlEvento: %s -> null', (_n, v) => {
    expect(urlEvento(v)).toBeNull()
  })

  it.each(NO_UUIDS)('urlGo: %s -> null', (_n, v) => {
    expect(urlGo(v, 'app')).toBeNull()
  })

  it.each(NO_UUIDS)('urlTarjeta: %s -> null', (_n, v) => {
    expect(urlTarjeta(v)).toBeNull()
  })
})

describe('urlComoLlegar', () => {
  it('con dirección: usa la dirección (misma URL que armaba la web)', () => {
    const address = 'Av. de Prueba 123, Salta'
    expect(urlComoLlegar({ address, venue: 'Venue de Prueba' })).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
    )
  })

  it('sin dirección: usa el venue', () => {
    const venue = 'Venue de Prueba'
    expect(urlComoLlegar({ address: null, venue })).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`,
    )
  })

  it('sin dirección y sin venue: null', () => {
    expect(urlComoLlegar({})).toBeNull()
    expect(urlComoLlegar({ address: null, venue: null })).toBeNull()
    expect(urlComoLlegar({ address: undefined, venue: undefined })).toBeNull()
  })

  it('dirección y venue solo con espacios: cuenta como vacío -> null', () => {
    expect(urlComoLlegar({ address: '   ', venue: '   ' })).toBeNull()
  })

  it('dirección vacía pero venue presente: usa el venue', () => {
    const venue = 'Venue de Prueba'
    expect(urlComoLlegar({ address: '', venue })).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`,
    )
  })

  it('caracteres raros (&, #, ?, tildes, espacios) quedan bien codificados', () => {
    const address = 'Calle Güemes & 9 de Julio #123, ¿cerca de la plaza?'
    expect(urlComoLlegar({ address, venue: null })).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
    )
  })
})

describe('METRIC_ORIGINS / parseOrigin / eventHref / goHref: igual que antes del movimiento', () => {
  it('METRIC_ORIGINS: los 9 orígenes, en el mismo orden', () => {
    expect(METRIC_ORIGINS).toEqual([
      'hero',
      'hoy',
      'fila',
      'busqueda',
      'favoritos',
      'ficha',
      'radar',
      'directo',
      'app',
    ])
  })

  it('parseOrigin acepta cada uno de los 9 orígenes', () => {
    for (const o of METRIC_ORIGINS) {
      expect(parseOrigin(o)).toBe(o)
    }
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['vacío', ''],
    ['raro', 'xyz'],
    ['mayúsculas', 'HERO'],
    ['con espacios', ' hero '],
    ['inyección &', 'hero&x=1'],
    ['path traversal', '../'],
    ['número', 5],
    ['array', ['hero']],
    ['objeto', { toString: () => 'hero' }],
    ['booleano', true],
  ])('parseOrigin: %s cae a directo', (_n, v) => {
    expect(parseOrigin(v)).toBe('directo')
  })

  it('eventHref con origen', () => {
    expect(eventHref(ID, 'hoy')).toBe(`/evento/${ID}?o=hoy`)
  })

  it('eventHref sin origen queda limpio', () => {
    expect(eventHref(ID)).toBe(`/evento/${ID}`)
  })

  it('goHref arma /go con origen', () => {
    expect(goHref(ID, 'ficha')).toBe(`/go/${ID}?o=ficha`)
  })
})
