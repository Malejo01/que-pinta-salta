// Esqueletos de carga (tarea 30-f): detector estático sobre el código fuente,
// sin red ni base. Verifica que los 6 `loading.tsx` existan, sean Server
// Components que usan `components/skeletons.tsx`, que la ruta del modal no
// tenga uno propio, y que las tarjetas del esqueleto reproduzcan la misma
// proporción que la tarjeta real (`components/event-card.tsx`), leída del
// archivo real y no de un literal suelto.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// apps/web/tests/components -> apps/web/tests -> apps/web
const ROOT = join(__dirname, '..', '..')
const read = (relPath: string) => readFileSync(join(ROOT, relPath), 'utf8')

const LOADING_FILES = [
  'app/loading.tsx',
  'app/buscar/loading.tsx',
  'app/cines/loading.tsx',
  'app/radar/loading.tsx',
  'app/favoritos/loading.tsx',
  'app/evento/[id]/loading.tsx',
]

describe('loading.tsx de las 6 rutas', () => {
  it.each(LOADING_FILES)(
    '%s existe, no es "use client" y exporta un componente por defecto que usa components/skeletons',
    (relPath) => {
      const content = read(relPath)

      expect(content).not.toMatch(/['"]use client['"]/)
      expect(content).toMatch(/export default function/)
      expect(content).toMatch(/from ['"]@\/components\/skeletons['"]/)
    }
  )

  it('la ruta del modal (app/@modal) no tiene loading.tsx propio', () => {
    expect(() => read('app/@modal/loading.tsx')).toThrow()
  })
})

describe('components/skeletons.tsx: accesibilidad y tema', () => {
  const content = read('components/skeletons.tsx')

  it('marca las regiones de carga como aria-busy', () => {
    expect(content).toContain('aria-busy="true"')
  })

  it('tiene un texto "Cargando" solo para lectores de pantalla (sr-only)', () => {
    expect(content).toMatch(/sr-only/)
    expect(content).toMatch(/Cargando/)
  })

  it('usa Skeleton (components/ui/skeleton.tsx), no divs sueltos con animate-pulse', () => {
    expect(content).toMatch(/from ['"]@\/components\/ui\/skeleton['"]/)
  })

  it('no usa colores fijos (zinc/black/white): solo tokens del tema', () => {
    expect(content).not.toMatch(/\b(?:bg|text|border)-(?:zinc|black|white)(?:-\d+)?\b/)
  })
})

describe('components/skeletons.tsx: CinesPageSkeleton reserva la altura del navbar', () => {
  it('CinesPageSkeleton usa NavbarPlaceholder (30-d agregó <Navbar /> a app/cines/page.tsx; sin esto hay salto de layout al terminar de cargar)', () => {
    const content = read('components/skeletons.tsx')
    const inicio = content.indexOf('function CinesPageSkeleton')
    expect(inicio).toBeGreaterThan(-1)
    const siguiente = content.indexOf('function ', inicio + 'function CinesPageSkeleton'.length)
    const cuerpo = siguiente === -1 ? content.slice(inicio) : content.slice(inicio, siguiente)
    expect(cuerpo).toMatch(/<NavbarPlaceholder\s*\/>/)
  })
})

describe('components/skeletons.tsx: misma proporción de tarjeta que la real', () => {
  it('usa el mismo aspect-[...] que components/event-card.tsx', () => {
    const eventCard = read('components/event-card.tsx')
    const match = eventCard.match(/aspect-\[[^\]]+\]/)
    expect(match).not.toBeNull()
    const aspectClass = match![0]

    const skeletons = read('components/skeletons.tsx')
    expect(skeletons).toContain(aspectClass)
  })

  it('usa el mismo aspect-[...] del afiche en components/event-detail-page.tsx', () => {
    const eventDetailPage = read('components/event-detail-page.tsx')
    const match = eventDetailPage.match(/aspect-\[[^\]]+\]/)
    expect(match).not.toBeNull()
    const aspectClass = match![0]

    const skeletons = read('components/skeletons.tsx')
    expect(skeletons).toContain(aspectClass)
  })
})
