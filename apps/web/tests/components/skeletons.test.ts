// Esqueletos de carga (tarea 30-f): detector estático sobre el código fuente,
// sin red ni base. Verifica que los `loading.tsx` existan, sean Server
// Components que usan `components/skeletons.tsx`, que la ruta del modal no
// tenga uno propio, y que las tarjetas del esqueleto reproduzcan la misma
// proporción que la tarjeta real (`components/event-card.tsx`), leída del
// archivo real y no de un literal suelto.
//
// Fase 2 de la R30 (revisión del #54): un `loading.tsx` hace que la ruta (y
// todas sus hijas) responda en streaming, y `notFound()`/`redirect()`/
// `permanentRedirect()` dejan de devolver 404/307/308: pasan a ser un 200 con
// el error adentro del stream (lo vio el supervisor en la preview con
// `/evento/<inexistente>`). La guarda de abajo lo impide.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// apps/web/tests/components -> apps/web/tests -> apps/web
const ROOT = join(__dirname, '..', '..')
const read = (relPath: string) => readFileSync(join(ROOT, relPath), 'utf8')

const LOADING_FILES = [
  'app/buscar/loading.tsx',
  'app/cines/loading.tsx',
]

// R54 (54-b): /mapa arma su esqueleto con `Skeleton` directo (el bloque del
// mapa tiene un alto fijo propio), no con `components/skeletons.tsx`.
const LOADING_PROPIOS = [
  'app/mapa/loading.tsx',
]

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre)
    return statSync(ruta).isDirectory() ? archivos(ruta) : [ruta]
  })
}

const APP = join(ROOT, 'app')
const todos = archivos(APP)
const rel = (ruta: string) => relative(ROOT, ruta).split(sep).join('/')
const CORTA_CON_ESTADO = /\b(?:notFound|redirect|permanentRedirect)\s*\(/

describe('ningún loading.tsx convierte un 404/307/308 en un 200', () => {
  it('no hay app/loading.tsx en la raíz (se aplicaría a todo el sitio: admin, auth, ficha…)', () => {
    expect(todos.map(rel)).not.toContain('app/loading.tsx')
  })

  it('ninguna página bajo un loading.tsx llama a notFound(), redirect() ni permanentRedirect()', () => {
    const loadings = todos.filter((r) => r.endsWith(`${sep}loading.tsx`))
    const choques = loadings.flatMap((loading) => {
      const dir = loading.slice(0, -'loading.tsx'.length)
      return todos
        .filter((r) => r.startsWith(dir) && /page\.tsx?$/.test(r))
        .filter((pagina) => CORTA_CON_ESTADO.test(readFileSync(pagina, 'utf8')))
        .map((pagina) => `${rel(loading)} cubre ${rel(pagina)}`)
    })
    expect(choques).toEqual([])
  })

  it('la lista de loading.tsx es exactamente la esperada (sumar uno nuevo obliga a pensar en esto)', () => {
    expect(todos.map(rel).filter((r) => r.endsWith('/loading.tsx')).sort()).toEqual([...LOADING_FILES, ...LOADING_PROPIOS].sort())
  })
})

describe('loading.tsx con esqueleto propio (/mapa)', () => {
  it.each(LOADING_PROPIOS)(
    '%s no es "use client", exporta un componente por defecto, usa Skeleton y es accesible',
    (relPath) => {
      const content = read(relPath)

      expect(content).not.toMatch(/['"]use client['"]/)
      expect(content).toMatch(/export default function/)
      expect(content).toMatch(/from ['"]@\/components\/ui\/skeleton['"]/)
      expect(content).toContain('aria-busy="true"')
      expect(content).toMatch(/sr-only[^>]*>\s*Cargando/)
      expect(content).not.toMatch(/\b(?:bg|text|border)-(?:zinc|black|white)(?:-\d+)?\b/)
    }
  )
})

describe('loading.tsx de /buscar y /cines', () => {
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

})
