/**
 * Ancla del skip-link en castellano y en /en/* (R80). `SaltarAlContenido` se
 * monta una sola vez en app/layout.tsx y apunta a `#contenido`: vale para todas
 * las páginas solo si cada una termina en UN `<main id="contenido" tabIndex={-1}>`
 * con `focus:outline-none`. Mapa, buscar, anunciantes y radar comparten el
 * componente entre /x y /en/x; el detector comprueba (a) que las dos pages lo
 * importan y lo usan y (b) que el componente tiene exactamente un <main> con el
 * ancla. Estático (lee archivos), sin red ni base. Si alguien saca el id, el
 * mensaje dice qué archivo.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = resolve(__dirname, '../..')

function leer(rel: string): string {
  const abs = resolve(RAIZ, rel)
  if (!existsSync(abs)) throw new Error(`No existe ${rel}`)
  // Sin comentarios: un `<main id=...>` dentro de un comentario no cuenta.
  return readFileSync(abs, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

interface Grupo {
  nombre: string
  pages: string[]
  /** Nombre del componente exportado y su archivo (el que tiene el <main>). */
  componente: string
  importaDesde: string
  /** Archivo que contiene el único <main> (puede ser un hijo del componente). */
  archivoMain: string
  /** Si el main está en un hijo, el componente compartido debe usarlo. */
  hijo?: string
}

const GRUPOS: Grupo[] = [
  {
    nombre: 'mapa',
    pages: ['app/mapa/page.tsx', 'app/en/mapa/page.tsx'],
    componente: 'PaginaMapa',
    importaDesde: '@/components/mapa/pagina-mapa',
    archivoMain: 'components/mapa/pagina-mapa.tsx',
  },
  {
    nombre: 'buscar',
    pages: ['app/buscar/page.tsx', 'app/en/buscar/page.tsx'],
    componente: 'PaginaBuscar',
    importaDesde: '@/components/buscar/pagina-buscar',
    archivoMain: 'app/buscar/buscar-content.tsx',
    hijo: 'BuscarContent',
  },
  {
    nombre: 'anunciantes',
    pages: ['app/anunciantes/page.tsx', 'app/en/anunciantes/page.tsx'],
    componente: 'PaginaAnunciantes',
    importaDesde: '@/components/anunciantes/pagina-anunciantes',
    archivoMain: 'components/anunciantes/pagina-anunciantes.tsx',
  },
  {
    nombre: 'radar',
    pages: ['app/radar/page.tsx', 'app/en/radar/page.tsx'],
    componente: 'PaginaRadar',
    importaDesde: '@/components/radar/pagina-radar',
    archivoMain: 'components/radar/pagina-radar.tsx',
  },
]

/** Los <main ...> del archivo (cada apertura hasta su `>`). */
function mains(codigo: string): string[] {
  return codigo.match(/<main\b[^>]*>/g) ?? []
}

function verificarMain(archivo: string) {
  const abiertos = mains(leer(archivo))
  expect(abiertos, `${archivo}: tiene que haber exactamente un <main>`).toHaveLength(1)
  const main = abiertos[0]
  expect(main, `${archivo}: al <main> le falta id="contenido" (el skip-link no tiene a dónde ir)`).toMatch(/\bid=["']contenido["']/)
  expect(main, `${archivo}: al <main> le falta tabIndex={-1} (el foco no se mueve al saltar)`).toMatch(/\btabIndex=\{-1\}/)
  expect(main, `${archivo}: al <main> le falta focus:outline-none`).toMatch(/\bfocus:outline-none\b/)
}

describe('el skip-link está en el layout raíz y apunta a #contenido', () => {
  it('app/layout.tsx importa y monta <SaltarAlContenido />', () => {
    const layout = leer('app/layout.tsx')
    expect(layout).toMatch(/import \{ SaltarAlContenido \} from ['"]@\/components\/saltar-al-contenido['"]/)
    expect(layout).toMatch(/<SaltarAlContenido\s*\/>/)
  })

  it('el componente enlaza a #contenido', () => {
    expect(leer('components/saltar-al-contenido.tsx')).toMatch(/#contenido/)
  })
})

describe.each(GRUPOS)('$nombre: castellano y /en comparten un único <main id="contenido">', (g) => {
  it.each(g.pages)('%s importa y llama al componente compartido', (page) => {
    const codigo = leer(page)
    expect(codigo, `${page}: no importa ${g.componente} de ${g.importaDesde}`).toMatch(
      new RegExp(`import[^;]*\\b${g.componente}\\b[^;]*from ['"]${g.importaDesde}['"]`),
    )
    // Como función (`PaginaX({...})`) o como elemento (`<PaginaX ... />`).
    expect(codigo, `${page}: importa ${g.componente} pero no lo usa`).toMatch(
      new RegExp(`(\\b${g.componente}\\(|<${g.componente}\\b)`),
    )
    expect(mains(codigo), `${page}: no debería tener un <main> propio (duplicaría el ancla)`).toHaveLength(0)
  })

  it('las dos pages usan el mismo componente (no hay una copia en /en)', () => {
    for (const page of g.pages) {
      expect(leer(page), page).toContain(g.componente)
    }
  })

  if (g.hijo) {
    it(`${g.componente} monta ${g.hijo}, que es el dueño del <main>`, () => {
      const compartido = leer(`components/${g.nombre}/pagina-${g.nombre}.tsx`)
      expect(compartido, `${g.nombre}: el componente compartido no usa <${g.hijo}`).toMatch(new RegExp(`<${g.hijo}\\b`))
      expect(mains(compartido), 'el componente compartido no debería tener otro <main>').toHaveLength(0)
    })
  }

  it(`${g.archivoMain} tiene exactamente un <main id="contenido" tabIndex={-1} focus:outline-none>`, () => {
    verificarMain(g.archivoMain)
  })
})

describe('404 y error: PaginaDeError tiene el ancla en los dos idiomas', () => {
  it('components/pagina-de-error.tsx tiene un único <main id="contenido" tabIndex={-1} focus:outline-none>', () => {
    verificarMain('components/pagina-de-error.tsx')
  })

  it('app/not-found.tsx y app/error.tsx usan PaginaDeError y no tienen <main> propio', () => {
    for (const archivo of ['app/not-found.tsx', 'app/error.tsx']) {
      const codigo = leer(archivo)
      expect(codigo, `${archivo}: no usa <PaginaDeError`).toMatch(/<PaginaDeError\b/)
      expect(mains(codigo), `${archivo}: no debería tener un <main> propio`).toHaveLength(0)
    }
  })

  it('el <main> de PaginaDeError no depende del idioma (un solo <main>, sin ramas por idioma)', () => {
    const codigo = leer('components/pagina-de-error.tsx')
    expect(mains(codigo)).toHaveLength(1)
    // `idioma` solo cambia `lang`; el id es literal, igual en es y en en.
    expect(mains(codigo)[0]).toMatch(/id="contenido"/)
  })
})
