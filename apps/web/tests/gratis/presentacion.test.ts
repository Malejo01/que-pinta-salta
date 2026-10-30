/**
 * R68, 68-q: contrato de PRESENTACION de "gratis".
 *
 * Regla: solo `is_free = true` se muestra como "Gratis". `is_free = false` con
 * `price_min = 0` es "precio sin confirmar" (la UI muestra "Consultar"/nada),
 * NUNCA "gratis". Y el filtro "Solo gratis" deja pasar unicamente `'gratis'`.
 *
 * Sin red ni base. Fixtures inventados.
 *
 * Roturas razonadas a mano (no se edita produccion):
 *  - Si `transformEvent`/`transformFlyer` devolvieran `'gratis'` para `price_min === 0`
 *    (por ejemplo `event.is_free || event.price_min === 0 ? 'gratis' : ...`), los casos
 *    "is_free=false, price_min=0 -> confirmar" fallan.
 *  - Si `soloGratis` pasara a `evento.price === 'gratis' || evento.price === 0` o a
 *    `typeof price !== 'number'`, fallan los casos de `0` y `'confirmar'`.
 *  - Si alguna pantalla inline (event-detail-page, modal-wrapper, buscar-content, app
 *    movil, armar) mapeara `price_min === 0` a `'gratis'`, falla el barrido de fuentes.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transformEvent, transformFlyer } from '@qps/core/home/transform'
import { soloGratis } from '@qps/core/home/filtros-extra'
import { filtrarCombinado, type ItemFiltrable } from '@qps/core/home/filtros-combinados'
import { formatPriceDisplay } from '@qps/core/event-display'
import type { DisplayEvent, EventWithRelations } from '@qps/core/home/types'
import type { FlyerWithAccount } from '@qps/core/instagram-config'
import { textoPrecio } from '../../../mobile/lib/formato'

const RAIZ = new URL('../../../../', import.meta.url)

function eventoDb(overrides: { is_free: boolean; price_min: number | null }): EventWithRelations {
  return {
    id: 'evento-de-prueba',
    title: 'Evento de Prueba',
    slug: 'evento-de-prueba',
    description: null,
    short_description: null,
    image_url: null,
    start_date: '2030-10-31T21:00:00-03:00',
    end_date: null,
    age_restriction: 0,
    featured_until: null,
    status: 'PUBLISHED',
    ticket_url: null,
    category: { id: 'cat-boliches', slug: 'boliches', name: 'Boliches' },
    venue: { id: 'venue-de-prueba', name: 'Venue de Prueba', address: 'Avenida de Prueba 123' },
    ...overrides,
  } as unknown as EventWithRelations
}

function flyerDb(overrides: { is_free: boolean; price_min: number | null }): FlyerWithAccount {
  return {
    id: 'flyer-de-prueba',
    caption: 'Caption de prueba',
    published_at: '2030-10-01T21:00:00-03:00',
    original_image_url: null,
    storage_image_url: null,
    venue_name: null,
    category: 'boliches',
    ig_post_url: 'https://instagram.ejemplo.test/p/prueba',
    account: { username: 'cuenta_de_prueba', display_name: 'Cuenta de Prueba', default_venue_name: null, default_category: 'boliches' },
    ...overrides,
  } as unknown as FlyerWithAccount
}

function display(price: DisplayEvent['price'], id = 'evento-de-prueba'): DisplayEvent {
  return {
    id,
    slug: id,
    title: `Titulo ${id}`,
    venue: 'Venue de Prueba',
    date: '2030-10-31',
    time: '21:00',
    category: 'boliches',
    categoryName: 'Boliches',
    price,
    image: '/placeholder.svg',
    description: '',
    address: '',
    startDateTime: '2030-10-31T21:00:00-03:00',
    isFeatured: false,
  }
}

describe('transformEvent: is_free / price_min -> price', () => {
  it('is_free=false, price_min=0 -> "confirmar" (la UI dice Consultar), nunca "gratis"', () => {
    const price = transformEvent(eventoDb({ is_free: false, price_min: 0 })).price
    expect(price).toBe('confirmar')
    expect(price).not.toBe('gratis')
  })

  it('is_free=true -> "gratis" (con price_min 0 o null)', () => {
    expect(transformEvent(eventoDb({ is_free: true, price_min: 0 })).price).toBe('gratis')
    expect(transformEvent(eventoDb({ is_free: true, price_min: null })).price).toBe('gratis')
  })

  it('is_free=false, price_min=5000 -> 5000', () => {
    expect(transformEvent(eventoDb({ is_free: false, price_min: 5000 })).price).toBe(5000)
  })
})

describe('transformFlyer: is_free / price_min -> price', () => {
  it('is_free=false, price_min=0 -> "confirmar", nunca "gratis"', () => {
    const price = transformFlyer(flyerDb({ is_free: false, price_min: 0 }), new Map()).price
    expect(price).toBe('confirmar')
    expect(price).not.toBe('gratis')
  })

  it('is_free=true -> "gratis"', () => {
    expect(transformFlyer(flyerDb({ is_free: true, price_min: 0 }), new Map()).price).toBe('gratis')
  })

  it('is_free=false, price_min=5000 -> 5000', () => {
    expect(transformFlyer(flyerDb({ is_free: false, price_min: 5000 }), new Map()).price).toBe(5000)
  })
})

describe('texto que muestra la UI', () => {
  it('core formatPriceDisplay: is_free -> "Gratis"; 0 sin is_free -> "A confirmar"; monto -> "$..."', () => {
    expect(formatPriceDisplay({ is_free: true, price_min: 0 })).toBe('Gratis')
    expect(formatPriceDisplay({ is_free: false, price_min: 0 })).toBe('A confirmar')
    expect(formatPriceDisplay({ is_free: false, price_min: null })).toBe('A confirmar')
    expect(formatPriceDisplay({ is_free: false, price_min: 35000 })).toBe('$35.000')
  })

  it('app movil textoPrecio: "gratis" -> "Gratis"; "confirmar" -> sin texto (nada de "Gratis")', () => {
    expect(textoPrecio('gratis')).toBe('Gratis')
    expect(textoPrecio('confirmar')).toBeNull()
    expect(textoPrecio(null)).toBeNull()
    expect(textoPrecio(12500)).toBe('$12.500')
  })

  it('web event-card.tsx: "confirmar" no imprime "Gratis" (formattedPrice = null)', () => {
    const src = readFileSync(new URL('apps/web/components/event-card.tsx', RAIZ), 'utf8')
    expect(src).toMatch(/event\.price === "gratis"\s*\?\s*t\.gratis\s*:\s*event\.price === "confirmar"\s*\?\s*null/)
  })
})

describe('"Solo gratis": solo pasa price === "gratis"', () => {
  it('soloGratis: "gratis" pasa; "confirmar", 0 y numeros no', () => {
    const g = display('gratis', 'g')
    const todos = [g, display('confirmar', 'c'), display(0, 'cero'), display(5000, 'pago')]
    expect(soloGratis(todos)).toEqual([g])
  })

  it('el resultado de transformEvent con is_free=false, price_min=0 NO pasa soloGratis (integracion)', () => {
    const sinEvidencia = transformEvent(eventoDb({ is_free: false, price_min: 0 }))
    const conEvidencia = transformEvent(eventoDb({ is_free: true, price_min: 0 }))
    expect(soloGratis([sinEvidencia])).toEqual([])
    expect(soloGratis([conEvidencia])).toEqual([conEvidencia])
  })

  it('filtrarCombinado con soloGratis: mismo contrato, tambien combinado con categoria', () => {
    const items: ItemFiltrable[] = [
      { evento: display('gratis', 'g'), paraAtajo: null },
      { evento: display('confirmar', 'c'), paraAtajo: null },
      { evento: display(0, 'cero'), paraAtajo: null },
      { evento: display(1500, 'pago'), paraAtajo: null },
    ]
    const ahora = new Date('2030-10-31T12:00:00-03:00')
    const r = filtrarCombinado(items, { atajo: null, categoria: null, soloGratis: true }, ahora)
    expect(r.map((e) => e.id)).toEqual(['g'])
    const r2 = filtrarCombinado(items, { atajo: null, categoria: 'boliches', soloGratis: true }, ahora)
    expect(r2.map((e) => e.id)).toEqual(['g'])
    // Apagado (o ausente): no filtra.
    expect(filtrarCombinado(items, { atajo: null, categoria: null }, ahora)).toHaveLength(4)
    expect(filtrarCombinado(items, { atajo: null, categoria: null, soloGratis: false }, ahora)).toHaveLength(4)
  })
})

// --- Barrido de fuentes: ninguna pantalla mapea price_min === 0 a "gratis" ---------------------------------

function archivos(dir: string, salida: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === '.next' || nombre === 'tests' || nombre.startsWith('.')) continue
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) archivos(ruta, salida)
    else if (/\.(ts|tsx)$/.test(nombre) && !/\.d\.ts$/.test(nombre)) salida.push(ruta)
  }
  return salida
}

describe('ninguna fuente de produccion mapea price_min === 0 a "gratis"', () => {
  const base = fileURLToPath(RAIZ)
  const carpetas = ['apps/web/app', 'apps/web/components', 'apps/web/lib', 'packages/core/src', 'apps/mobile/app', 'apps/mobile/components', 'apps/mobile/lib']
  const todos = carpetas.flatMap((c) => archivos(join(base, c)))
  // Mapeos de precio hacia 'gratis' con la condicion "== 0" (en cualquier orden de la ternaria).
  const MALO_1 = /price(?:_min)?\s*===?\s*0\s*\?\s*\(?\s*["']gratis["']/
  const MALO_2 = /\?\s*\(?\s*["']confirmar["'](?:\s+as\s+const)?\s*\)?\s*:\s*\(?\s*["']gratis["']/

  it('hay archivos que barrer (el barrido no esta vacio)', () => {
    expect(todos.length).toBeGreaterThan(50)
  })

  it('sin "price_min === 0 ? gratis" ni la ternaria invertida', () => {
    const malos = todos
      .filter((f) => {
        const t = readFileSync(f, 'utf8')
        return MALO_1.test(t) || MALO_2.test(t)
      })
      .map((f) => relative(base, f))
    expect(malos).toEqual([])
  })

  it('los mapeos conocidos son "is_free ? gratis : (price_min === 0 ? confirmar : price_min)"', () => {
    const conocidos = [
      'packages/core/src/home/transform.ts',
      'packages/core/src/favoritos/armar.ts',
      'apps/web/components/event-detail-page.tsx',
      'apps/web/components/event-modal-wrapper.tsx',
      'apps/web/app/buscar/buscar-content.tsx',
      'apps/mobile/app/evento/[id].tsx',
    ]
    for (const rel of conocidos) {
      const t = readFileSync(new URL(rel, RAIZ), 'utf8')
      expect(t, rel).toMatch(/is_free\s*\?\s*\(?\s*["']gratis["'](?:\s+as\s+const)?\s*\)?\s*:\s*\(?\s*(?:\w+\.)?price_min\s*===\s*0\s*\?\s*\(?\s*["']confirmar["']/)
    }
  })
})
