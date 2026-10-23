// Paridad web/app de "destacados" (R50, QPS-239/-240, tarea 50-q, cruza las
// tareas 50-a/50-c/50-e): con el mismo evento inventado, la web y la app
// calculan el MISMO `isFeatured`, porque las dos pasan por `transformEvent`
// de `@qps/core/home/transform` — no hay una copia paralela de la regla en
// ninguna de las dos plataformas.
//
// LÍMITE HONESTO DE ESTE ARCHIVO (pedido explícito del encargo): no hay
// react-dom ni @testing-library/react-native en este paquete, y no se puede
// "correr la web real" desde los tests de la app (otro proyecto de Vitest,
// otro tsconfig, otros alias `@/...`). Así que:
//
//   (a) NO se monta ningún componente de React/React Native en este
//       archivo. Es una combinación de (1) ejecución real de
//       `transformEvent` (el módulo puro, sin React) con un fixture
//       compartido, y (2) lectura de código fuente (igual que el resto de
//       los detectores de este repo) para comprobar que la capa de datos de
//       cada plataforma importa la MISMA función de core, en vez de
//       reimplementarla.
//   (b) La comprobación de (1) por sí sola NO alcanza para probar que "la
//       web y la app no se desvían": como las dos literalmente llaman a la
//       MISMA función (`transformEvent`), invocarla una vez y comparar el
//       resultado contra otra llamada a ELLA MISMA sería la trampa que
//       advierte el encargo ("no un test que solo llame dos veces a la
//       misma función y compare consigo misma"). Por eso la aserción fuerte
//       de este archivo es la (2), estática: si algún día la web o la app
//       dejaran de importar `transformEvent` de `@qps/core/home/transform`
//       (por ejemplo, si alguien agregara un cálculo de `isFeatured` propio
//       en `apps/mobile/lib/datos/eventos.ts` o en
///      `apps/web/components/home-content.tsx`), este archivo se rompe.
//       La ejecución de (1) cumple un rol más chico: confirma que
//       `transformEvent` sigue siendo fiel a la regla de core
//       (`estaDestacado`), calculada de forma independiente con el mismo
//       `ahora` — no que las plataformas coincidan entre sí.
//
// Sin red ni base. No importa nada de otro `*.test.ts` (QPS-250): los
// helpers de abajo son copias locales.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { transformEvent } from '@qps/core/home/transform'
import { estaDestacado } from '@qps/core/events/destacados'
import type { EventWithRelations } from '@qps/core/home/types'
import type { Category, Venue } from '@qps/core/types'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const WEB_ROOT = join(MOBILE_ROOT, '..', 'web')

/** Comentarios de línea y de bloque vaciados (copia local, QPS-250). */
function quitarComentarios(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1')
}

function makeCategory(slug: string, name: string): Category {
  return { id: `cat-${slug}`, slug, name, color: null, icon: null, created_at: null }
}

function makeVenue(): Venue {
  return {
    id: 'venue-de-prueba',
    name: 'Venue de Prueba',
    address: 'Avenida de Prueba 123',
    canonical_venue_id: null,
    capacity: null,
    created_at: null,
    geocode_source: null,
    geocoded_at: null,
    google_maps_url: null,
    is_placeholder: false,
    latitude: null,
    longitude: null,
    merged_at: null,
    phone: null,
    slug: null,
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function makeEvent(overrides: Partial<EventWithRelations> & { start_date: string }): EventWithRelations {
  const category = overrides.category ?? makeCategory('boliches', 'Boliches')
  const venue = overrides.venue !== undefined ? overrides.venue : makeVenue()
  return {
    id: overrides.id ?? 'evento-compartido-de-prueba',
    title: overrides.title ?? 'Evento Compartido de Prueba',
    slug: overrides.slug ?? 'evento-compartido-de-prueba',
    description: overrides.description ?? null,
    short_description: overrides.short_description ?? null,
    category_id: category.id,
    venue_id: venue?.id ?? null,
    image_url: overrides.image_url ?? null,
    gallery_urls: overrides.gallery_urls ?? [],
    start_date: overrides.start_date,
    end_date: overrides.end_date ?? null,
    is_recurring: overrides.is_recurring ?? false,
    recurrence_rule: overrides.recurrence_rule ?? null,
    price_min: overrides.price_min ?? 0,
    price_max: overrides.price_max ?? null,
    is_free: overrides.is_free ?? false,
    ticket_url: overrides.ticket_url ?? null,
    age_restriction: overrides.age_restriction ?? 0,
    tags: overrides.tags ?? [],
    status: overrides.status ?? 'PUBLISHED',
    is_featured: overrides.is_featured ?? false,
    featured_until: overrides.featured_until ?? null,
    view_count: overrides.view_count ?? 0,
    created_by: overrides.created_by ?? null,
    created_at: overrides.created_at ?? '2026-01-01T00:00:00Z',
    updated_at: overrides.updated_at ?? '2026-01-01T00:00:00Z',
    category,
    venue,
  }
}

// ---------------------------------------------------------------------------
// 1) Ejecución: con el mismo evento inventado, transformEvent coincide con
//    estaDestacado calculado de forma independiente (mismo "ahora").
// ---------------------------------------------------------------------------
describe('transformEvent (la función que usan las dos plataformas) es fiel a estaDestacado, con tres casos distintos', () => {
  // `transformEvent` compara contra el RELOJ DEL SISTEMA (su único
  // `new Date()` sin argumento, no inyectable: ver el comentario de esa
  // función y el dato de la tarea 50-a en
  // `ops/rondas/50-destacados/progreso.md`). Con fake timers se congela ese
  // reloj en el mismo valor que usa `ahora` acá abajo: sin esto, "vencido"
  // (una fecha de 2030) sería "futuro todavía" para el reloj real de hoy, y
  // este archivo se habría caído con el mismo error que advierte el encargo.
  const ahora = new Date('2030-10-10T12:00:00-03:00')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(ahora)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('featured_until vigente: isFeatured true', () => {
    const vigente = new Date(ahora.getTime() + 60_000).toISOString()
    const evento = makeEvent({ start_date: '2030-11-01T21:00:00-03:00', featured_until: vigente })
    expect(transformEvent(evento).isFeatured).toBe(estaDestacado(vigente, ahora))
    expect(transformEvent(evento).isFeatured).toBe(true)
  })

  it('featured_until vencido: isFeatured false', () => {
    const vencido = new Date(ahora.getTime() - 60_000).toISOString()
    const evento = makeEvent({ start_date: '2030-11-01T21:00:00-03:00', featured_until: vencido })
    expect(transformEvent(evento).isFeatured).toBe(estaDestacado(vencido, ahora))
    expect(transformEvent(evento).isFeatured).toBe(false)
  })

  it('is_featured: true legado, featured_until: null: isFeatured false', () => {
    const evento = makeEvent({ start_date: '2030-11-01T21:00:00-03:00', is_featured: true, featured_until: null })
    expect(transformEvent(evento).isFeatured).toBe(estaDestacado(null, ahora))
    expect(transformEvent(evento).isFeatured).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 2) Estático: la capa de datos de la app y la portada de la web importan
//    transformEvent del MISMO módulo de core (no hay una copia paralela).
// ---------------------------------------------------------------------------
describe('la app y la web no reimplementan transformEvent: las dos lo importan de @qps/core/home/transform', () => {
  it('apps/mobile/lib/datos/eventos.ts importa transformEvent de @qps/core/home/transform y lo aplica', () => {
    const src = quitarComentarios(readFileSync(join(MOBILE_ROOT, 'lib', 'datos', 'eventos.ts'), 'utf8'))
    expect(src).toMatch(/import\s*\{[^}]*\btransformEvent\b[^}]*\}\s*from\s*['"]@qps\/core\/home\/transform['"]/)
    // Se aplica de verdad (no solo se importa y queda sin usar).
    expect(src).toMatch(/transformEvent/g)
  })

  it('apps/web/lib/home/transform.ts (la portada web) es un re-export de @qps/core/home/transform, no una copia', () => {
    const src = readFileSync(join(WEB_ROOT, 'lib', 'home', 'transform.ts'), 'utf8')
    expect(src).toMatch(/export\s*\*\s*from\s*['"]@qps\/core\/home\/transform['"]/)
  })

  it('apps/web/components/home-content.tsx (la portada web) importa de @/lib/home/transform (que a su vez re-exporta de core), sin una función transformEvent propia', () => {
    const src = quitarComentarios(readFileSync(join(WEB_ROOT, 'components', 'home-content.tsx'), 'utf8'))
    expect(src).toMatch(/from\s*['"]@\/lib\/home\/transform['"]/)
    // No hay una declaración local "function transformEvent" en este archivo
    // (la única función con ese nombre vive en packages/core).
    expect(src).not.toMatch(/function\s+transformEvent\s*\(/)
  })

  it('packages/core/src/home/transform.ts es la ÚNICA declaración de "function transformEvent" del monorepo (ni la web ni la app tienen una copia propia)', () => {
    const coreSrc = readFileSync(join(WEB_ROOT, '..', '..', 'packages', 'core', 'src', 'home', 'transform.ts'), 'utf8')
    expect(coreSrc).toMatch(/export function transformEvent\(/)

    for (const archivo of [
      join(MOBILE_ROOT, 'lib', 'datos', 'eventos.ts'),
      join(WEB_ROOT, 'components', 'home-content.tsx'),
      join(WEB_ROOT, 'lib', 'home', 'transform.ts'),
      join(WEB_ROOT, 'app', 'buscar', 'buscar-content.tsx'),
    ]) {
      const src = quitarComentarios(readFileSync(archivo, 'utf8'))
      expect(src).not.toMatch(/function\s+transformEvent\s*\(/)
    }
  })
})

// ---------------------------------------------------------------------------
// 3) Insignia: mismo texto, y las dos devuelven null cuando no está
//    destacado. Lectura de código (sin render: no hay react-dom/
//    @testing-library/react-native en este paquete).
// ---------------------------------------------------------------------------
describe('InsigniaDestacado (web) e InsigniaDestacado (app): mismo texto, mismo "si no, null"', () => {
  const srcMobile = readFileSync(join(MOBILE_ROOT, 'components', 'InsigniaDestacado.tsx'), 'utf8')
  const srcWeb = readFileSync(join(WEB_ROOT, 'components', 'insignia-destacado.tsx'), 'utf8')

  it('las dos escriben literalmente "★ Destacado"', () => {
    expect(srcMobile).toContain('★ Destacado')
    expect(srcWeb).toContain('★ Destacado')
  })

  it('las dos devuelven null si no está destacado (if (!visible) return null)', () => {
    expect(quitarComentarios(srcMobile)).toMatch(/if\s*\(\s*!visible\s*\)\s*return\s*null/)
    expect(quitarComentarios(srcWeb)).toMatch(/if\s*\(\s*!visible\s*\)\s*return\s*null/)
  })

  it('las dos reciben "visible: boolean" como prop (mismo contrato)', () => {
    expect(srcMobile).toMatch(/visible\s*:\s*boolean/)
    expect(srcWeb).toMatch(/visible\s*:\s*boolean/)
  })
})
