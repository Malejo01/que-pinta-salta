/**
 * B4 (accesibilidad): estructura de las páginas y nombres accesibles que
 * marcó axe en la auditoría B1 (docs/auditoria-web-27-10.md). Detectores
 * sobre el código fuente y renders con `renderToStaticMarkup`, sin DOM ni
 * red. Lo que necesita un DOM real (la Navbar con sesión, el click del
 * "Saltar al contenido") está en tests/dom/navbar-accesible.dom.test.ts, y
 * el contraste en b4-contraste.test.ts.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { textoBotonVoy } from '@qps/core/asistencia'
import { BotonVoy } from '@/components/botones-asistencia'
import { FilaAccionesEventoVista, type FilaAccionesEventoVistaProps } from '@/components/fila-acciones-evento'
import { Footer } from '@/components/footer'
import { FUNCIONES_EN_CAPA } from '@/components/event-card'

vi.mock('next/link', () => ({
  default: ({
    href,
    prefetch: _prefetch,
    children,
    ...resto
  }: { href: string; prefetch?: boolean; children?: React.ReactNode } & Record<string, unknown>) =>
    React.createElement('a', { href, ...resto }, children),
}))
vi.mock('next/image', () => ({
  default: ({ src, alt, priority: _p, ...resto }: Record<string, unknown>) =>
    React.createElement('img', { src: String(src), alt: String(alt ?? ''), ...resto }),
}))
vi.mock('@/components/donation-context', () => ({
  useDonation: () => ({ openDonationModal: () => {} }),
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  }),
}))

// apps/web/tests/accesibilidad -> apps/web
const ROOT = join(__dirname, '..', '..')
const leer = (ruta: string) => readFileSync(join(ROOT, ruta), 'utf8')

/**
 * Saca los comentarios (de JSX, de bloque y las líneas que empiezan con //)
 * para que un comentario que menciona `<main>` no cuente como código.
 */
const sinComentarios = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

// ---------------------------------------------------------------------------
// <main id="contenido">: el destino del "Saltar al contenido".
// ---------------------------------------------------------------------------
const PAGINAS_CON_MAIN = [
  'components/home-content.tsx',
  'components/event-detail-page.tsx',
  'app/cines/page.tsx',
  'app/radar/page.tsx',
  'app/favoritos/page.tsx',
  'app/flyer/[id]/page.tsx',
] as const

describe('las páginas auditadas tienen UN <main id="contenido" tabIndex={-1}>', () => {
  for (const ruta of PAGINAS_CON_MAIN) {
    it(ruta, () => {
      const src = sinComentarios(leer(ruta))
      expect(src.match(/<main\b/g)).toHaveLength(1)
      expect(src).toMatch(/<main id="contenido" tabIndex=\{-1\}/)
    })
  }
})

describe('/cines: las barras de navegación quedan fuera del <main>', () => {
  const src = sinComentarios(leer('app/cines/page.tsx'))
  const abre = src.indexOf('<main')
  const cierra = src.indexOf('</main>')

  it('la Navbar va antes del <main> y la MobileNav después del </main>', () => {
    expect(abre).toBeGreaterThan(0)
    expect(src.indexOf('<Navbar />')).toBeLessThan(abre)
    expect(src.indexOf('<MobileNav />')).toBeGreaterThan(cierra)
  })

  it('el contenido (encabezado y CinesView) sí está adentro', () => {
    const adentro = src.slice(abre, cierra)
    expect(adentro).toContain('<h1')
    expect(adentro).toContain('<CinesView')
  })

  it('un detector se pone en rojo con la estructura vieja (navs dentro del <main>)', () => {
    const vieja = '<main className="x"><Navbar /><div>…</div><MobileNav /></main>'
    expect(vieja.indexOf('<Navbar />')).toBeGreaterThan(vieja.indexOf('<main'))
  })
})

describe('ingreso, alta, recuperar y restablecer tienen <main>', () => {
  for (const ruta of ['app/auth/sign-up/page.tsx', 'app/auth/recuperar/page.tsx', 'app/auth/restablecer/page.tsx']) {
    it(ruta, () => {
      const src = sinComentarios(leer(ruta))
      expect(src.match(/<main\b/g)).toHaveLength(1)
      expect(src).toContain('</main>')
    })
  }

  it('recuperar tiene su <h1> dentro del CardTitle', () => {
    expect(leer('app/auth/recuperar/page.tsx')).toMatch(/<CardTitle className="text-2xl">\s*<h1>Recuperar contraseña<\/h1>\s*<\/CardTitle>/)
  })
})

// ---------------------------------------------------------------------------
// Orden de encabezados (heading-order).
// ---------------------------------------------------------------------------
describe('heading-order', () => {
  it('el pie usa <h2> para "Enlaces" y "Conectá conmigo" (en la ficha viene después del <h1>)', () => {
    const html = renderToStaticMarkup(React.createElement(Footer))
    expect(html).toMatch(/<h2[^>]*>Enlaces<\/h2>/)
    expect(html).toMatch(/<h2[^>]*>Conectá conmigo<\/h2>/)
    expect(html).not.toMatch(/<h3[^>]*>(Enlaces|Conectá conmigo)<\/h3>/)
  })

  it('el <nav> del pie tiene nombre (es la tercera región de navegación de la página)', () => {
    const html = renderToStaticMarkup(React.createElement(Footer))
    expect(html).toContain('<nav aria-label="Enlaces del pie"')
  })

  it('la tarjeta de evento no tiene <h4> (las capas de hover usan <p>)', () => {
    expect(sinComentarios(leer('components/event-card.tsx'))).not.toMatch(/<h4\b/)
  })

  it('MovieCard y el vacío de CinesView usan <h2> (van debajo del <h1> de /cines)', () => {
    const tarjeta = sinComentarios(leer('components/movie-card.tsx'))
    expect(tarjeta).toMatch(/<h2 className="text-lg font-bold[^"]*">\s*\{movie\.title\}\s*<\/h2>/)
    expect(tarjeta).not.toMatch(/<h3\b/)
    expect(sinComentarios(leer('components/cines-view.tsx'))).toMatch(/<h2[^>]*>No se encontraron películas<\/h2>/)
  })

  it('MovieCard solo se usa en CinesView (si aparece en otra página, revisar el nivel)', () => {
    const usos = ['components/home-content.tsx', 'app/favoritos/favoritos-list.tsx', 'components/event-detail-page.tsx']
    for (const ruta of usos) expect(leer(ruta)).not.toMatch(/<MovieCard\b/)
    expect(leer('components/cines-view.tsx')).toMatch(/<MovieCard\b/)
  })
})

// ---------------------------------------------------------------------------
// scrollable-region-focusable: la capa de hover de la tarjeta, sin scroll.
// ---------------------------------------------------------------------------
describe('tarjeta de evento: la capa de hover no es una región con scroll', () => {
  const src = sinComentarios(leer('components/event-card.tsx'))

  it('ninguna capa usa overflow-y-auto ni overflow-auto', () => {
    expect(src).not.toMatch(/overflow-(y-)?auto/)
  })

  it('las dos capas cortan con overflow-hidden', () => {
    const capas = src.match(/absolute inset-0 bg-black\/95[^"]*"/g) ?? []
    expect(capas).toHaveLength(2)
    for (const capa of capas) expect(capa).toContain('overflow-hidden')
  })

  it(`la lista de funciones muestra ${FUNCIONES_EN_CAPA} y resume el resto con "+N"`, () => {
    expect(FUNCIONES_EN_CAPA).toBe(4)
    expect(src).toContain('event.occurrences.slice(0, FUNCIONES_EN_CAPA)')
    expect(src).toMatch(/fechas más/)
  })
})

// ---------------------------------------------------------------------------
// label-content-name-mismatch: el nombre accesible empieza con lo que se ve.
// ---------------------------------------------------------------------------
describe('label-content-name-mismatch', () => {
  it('"Más info" del aviso de cookies: el aria-label empieza con el texto visible', () => {
    const src = leer('components/consent-banner.tsx')
    const bloque = /<Link\s+href="\/privacidad"[\s\S]*?<\/Link>/.exec(src)?.[0] ?? ''
    const etiqueta = /aria-label="([^"]+)"/.exec(bloque)?.[1] ?? ''
    const visible = bloque.replace(/<Link[\s\S]*?>/, '').replace('</Link>', '').trim()
    expect(visible).toBe('Más info')
    expect(etiqueta.startsWith(visible)).toBe(true)
  })

  const ariaLabel = (html: string) => /aria-label="([^"]+)"/.exec(html)?.[1] ?? ''
  const visible = (html: string) => html.replace(/<[^>]+>/g, '').trim()

  for (const voy of [false, true]) {
    for (const cantidad of [0, 12]) {
      it(`Voy (voy=${voy}, ${cantidad} van): el aria-label empieza con "${textoBotonVoy(cantidad)}" y conserva "marcar que…"`, () => {
        const html = renderToStaticMarkup(
          React.createElement(BotonVoy, { voy, cantidadVoy: cantidad, pendiente: false, onClick: () => {}, titulo: 'Peña de prueba' }),
        )
        const etiqueta = ariaLabel(html)
        expect(visible(html)).toBe(textoBotonVoy(cantidad))
        expect(etiqueta.startsWith(textoBotonVoy(cantidad))).toBe(true)
        // tests/dom/preparar-dom.ts busca el botón por este texto: no se toca.
        expect(etiqueta).toMatch(voy ? /marcar que no vas a Peña de prueba/i : /marcar que vas a Peña de prueba/i)
      })
    }
  }

  function propsFila(guardado: boolean): FilaAccionesEventoVistaProps {
    return {
      guardado,
      voy: false,
      cantidadVoy: 0,
      mostrarVoy: false,
      haySesion: true,
      pendiente: false,
      onClickGuardar: () => {},
      onClickVoy: () => {},
      compartir: null,
      titulo: 'Peña de prueba',
    }
  }

  for (const guardado of [false, true]) {
    it(`Guardar (guardado=${guardado}): el aria-label empieza con el texto visible`, () => {
      const html = renderToStaticMarkup(React.createElement(FilaAccionesEventoVista, propsFila(guardado)))
      const boton = /<button[\s\S]*?<\/button>/.exec(html)?.[0] ?? ''
      const texto = visible(boton)
      expect(texto).toBe(guardado ? 'Guardado' : 'Guardar')
      expect(ariaLabel(boton).startsWith(texto)).toBe(true)
    })
  }
})

// ---------------------------------------------------------------------------
// Carrusel de la portada: los puntos dicen cuál es el actual, y el avance
// automático se pausa con el foco adentro (si no, el foco se perdía con la
// diapositiva).
// ---------------------------------------------------------------------------
describe('carrusel de la portada', () => {
  const src = sinComentarios(leer('components/hero-carousel.tsx'))

  it('el punto activo lleva aria-current', () => {
    expect(src).toContain('aria-current={index === currentIndex ? "true" : undefined}')
  })

  it('el intervalo no corre en pausa, y la pausa sale del foco y del mouse', () => {
    expect(src).toMatch(/useEffect\(\(\) => \{\s*if \(enPausa\) return\s*const timer = setInterval/)
    expect(src).toMatch(/\}, \[events\.length, enPausa\]\)/)
    expect(src).toContain('onFocus={() => setEnPausa(true)}')
    expect(src).toContain('onMouseEnter={() => setEnPausa(true)}')
    expect(src).toMatch(/onBlur=\{\(e\) => \{[\s\S]*?contains\(e\.relatedTarget/)
  })
})

describe('ningún tabIndex positivo en las páginas tocadas', () => {
  const RUTAS = [
    ...PAGINAS_CON_MAIN,
    'components/navbar.tsx',
    'components/mobile-nav.tsx',
    'components/footer.tsx',
    'components/event-card.tsx',
    'components/hero-carousel.tsx',
    'app/auth/login/page.tsx',
    'app/auth/sign-up/page.tsx',
    'app/auth/recuperar/page.tsx',
  ]
  for (const ruta of RUTAS) {
    it(ruta, () => {
      expect(leer(ruta)).not.toMatch(/tabIndex=\{[1-9]/)
    })
  }
})
