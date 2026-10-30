// @vitest-environment jsdom
//
// La ficha del evento (`EventDetailPage`) y su modal interceptado
// (`EventModalWrapper`) montados en un DOM real, en inglés (/en/evento/<id>)
// y en castellano (/evento/<id>), Q3: en inglés la interfaz se traduce y lo
// que viene de la fuente (título, descripción, lugar, dirección) queda en
// castellano con `lang="es"`, con el aviso arriba; en castellano todo dice
// lo mismo que siempre y no aparece ningún `lang` ni el aviso.
//
// Los `vi.mock` van en este archivo (ver el comentario de `preparar-dom.ts`).
// Lo que no hace al idioma (navbar, banner, beacon, imagen, server actions)
// se reemplaza por dobles sin red.
import * as React from 'react'
import { describe, expect, it, vi, afterAll, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'

import { EventDetailPage } from '@/components/event-detail-page'
import { EventModalWrapper } from '@/components/event-modal-wrapper'
import { es } from '@/lib/i18n/diccionarios/es'
import { en } from '@/lib/i18n/diccionarios/en'

const { navegacion } = vi.hoisted(() => ({ navegacion: { pathname: '/evento/x' } }))

vi.mock('next/navigation', () => ({
  usePathname: () => navegacion.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}))

vi.mock('next/link', () => ({
  // `prefetch` se descarta para que no llegue al DOM.
  default: ({ href, children, ...resto }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => {
    delete resto.prefetch
    return React.createElement('a', { href, ...resto }, children)
  },
}))

vi.mock('@/components/navbar', () => ({ Navbar: () => null }))
vi.mock('@/components/mobile-nav', () => ({ MobileNav: () => null }))
vi.mock('@/components/adsense-banner', () => ({ AdSenseBanner: () => null }))
vi.mock('@/components/view-beacon', () => ({ ViewBeacon: () => null }))
vi.mock('@/components/flyer-image', () => ({
  FlyerImage: ({ alt, lang }: { alt: string; lang?: string }) => React.createElement('img', { alt, lang }),
}))
vi.mock('@/components/admin/control-destacado', () => ({ ControlDestacado: () => null }))
vi.mock('@/lib/admin-actions', () => ({ createCategory: vi.fn(), updateEventCategory: vi.fn() }))
vi.mock('@/lib/asistencia', () => ({ marcarAsistencia: vi.fn() }))
vi.mock('@/lib/actions/favorites', () => ({ toggleFavorite: vi.fn() }))
vi.mock('@/lib/actions/radar', () => ({ cambiarSeguimiento: vi.fn() }))
vi.mock('@/components/auth-modal', () => ({ useAuthModal: () => ({ open: vi.fn(), close: vi.fn() }) }))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))

const advertencias: string[] = []
const consolaWarn = console.warn
console.warn = (...args: unknown[]) => {
  advertencias.push(args.map(String).join(' '))
}
/** Lo que Radix avisa por consola si el diálogo no tiene descripción ni `aria-describedby={undefined}`. */
const advertenciasDeRadix = () => advertencias.filter((a) => a.includes('Description') || a.includes('aria-describedby'))

afterEach(() => {
  cleanup()
  advertencias.length = 0
})

afterAll(() => {
  console.warn = consolaWarn
})

const ID = '12345678-1234-4234-8234-123456789012'

// Un evento inventado: sábado 7/11/2026 a las 21:30 de Salta (00:30 UTC del domingo).
const EVENTO = {
  id: ID,
  title: 'Peña de Prueba',
  description: 'Una descripción inventada, en castellano.',
  short_description: null,
  start_date: '2026-11-08T00:30:00Z',
  end_date: null,
  status: 'PUBLISHED',
  is_free: false,
  price_min: 5000,
  image_url: null,
  ticket_url: 'https://ejemplo.invalid/entradas',
  age_restriction: 18,
  featured_until: null,
  category_id: 'cat-1',
  category: { id: 'cat-1', name: 'Peñas', slug: 'penas' },
  venue: {
    id: 'lugar-1',
    name: 'Lugar de Prueba',
    address: 'Calle Inventada 123',
    latitude: -24.78,
    longitude: -65.41,
  },
} as unknown as React.ComponentProps<typeof EventDetailPage>['event']

const SEGUIMIENTO = {
  lugar: { id: 'lugar-1', nombre: 'Lugar de Prueba', siguiendo: false },
  cuenta: null,
} as unknown as React.ComponentProps<typeof EventDetailPage>['seguimiento']

function montarFicha(pathname: string) {
  navegacion.pathname = pathname
  return render(
    React.createElement(EventDetailPage, {
      event: EVENTO,
      cantidadesAsistencia: { voy: 12 },
      seguimiento: SEGUIMIENTO,
      haySesion: false,
    }),
  )
}

function montarModal(pathname: string) {
  navegacion.pathname = pathname
  return render(
    React.createElement(EventModalWrapper, {
      event: EVENTO,
      cantidadesAsistencia: { voy: 12 },
      seguimiento: SEGUIMIENTO,
      haySesion: false,
    }),
  )
}

/** El elemento más cercano (él mismo o un ancestro) que declara `lang`. */
function langDe(el: Element | null): string | null {
  return el?.closest('[lang]')?.getAttribute('lang') ?? null
}

function porTexto(texto: string): HTMLElement {
  return screen.getByText(texto)
}

describe('la ficha en inglés (/en/evento/<id>)', () => {
  it('interfaz en inglés: botones, precio, hora en 12 h, etiquetas y la fila Save / I’m going', () => {
    const { container } = montarFicha(`/en/evento/${ID}`)
    const texto = container.textContent ?? ''

    expect(texto).toContain(en.ficha.volverAEventos)
    expect(texto).toContain(en.ficha.comoLlegar)
    expect(texto).toContain(en.ficha.comprarTickets)
    expect(texto).toContain(en.ficha.verEnElMapa)
    expect(texto).toContain(en.ficha.precioDeEntrada)
    expect(texto).toContain('ARS 5,000')
    expect(texto).toContain('Saturday, November 7, 2026')
    expect(texto).toContain('9:30 PM')
    expect(texto).not.toContain(' hs')
    expect(texto).toContain(en.ficha.etiquetasVibe.adultos)
    expect(texto).toContain('Folk music (peñas)')
    expect(texto).toContain(en.asistencia.guardar)
    expect(texto).toContain("I'm going · 12")
    expect(texto).not.toContain('12 going')
    expect(texto).toContain(en.asistencia.entrarParaMarcar)
    expect(texto).toContain('+ Follow')

    // Ningún texto de interfaz en castellano.
    for (const textoEs of [
      es.ficha.volverAEventos,
      es.ficha.comoLlegar,
      es.ficha.comprarTickets,
      es.ficha.verEnElMapa,
      es.ficha.precioDeEntrada,
      es.asistencia.entrarParaMarcar,
      'Voy · 12 van',
    ]) {
      expect(texto).not.toContain(textoEs)
    }
  })

  it('el contenido del evento lleva lang="es"; la interfaz no', () => {
    montarFicha(`/en/evento/${ID}`)
    expect(langDe(screen.getByRole('heading', { level: 1 }))).toBe('es')
    // WCAG 3.1.2: el alt de la imagen es el título del evento.
    expect(screen.getByRole('img', { name: 'Peña de Prueba' }).getAttribute('lang')).toBe('es')
    expect(langDe(porTexto('Una descripción inventada, en castellano.'))).toBe('es')
    expect(langDe(screen.getByText('Lugar de Prueba', { selector: 'p' }))).toBe('es')
    expect(langDe(porTexto('Calle Inventada 123'))).toBe('es')
    expect(langDe(porTexto(en.ficha.comoLlegar))).toBeNull()
    expect(langDe(porTexto(en.ficha.precioDeEntrada))).toBeNull()
  })

  it('el aviso de contenido en castellano va arriba del título', () => {
    montarFicha(`/en/evento/${ID}`)
    const aviso = porTexto(en.comun.avisoContenidoEs)
    const titulo = screen.getByRole('heading', { level: 1 })
    expect(aviso.compareDocumentPosition(titulo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('los links: volver a /en, y el mapa va a /en/mapa (C4)', () => {
    montarFicha(`/en/evento/${ID}`)
    expect(screen.getByText(en.ficha.volverAEventos).closest('a')?.getAttribute('href')).toBe('/en')
    const mapa = screen.getByText(en.ficha.verEnElMapa).closest('a')
    expect(mapa?.getAttribute('href')).toMatch(/^\/en\/mapa\?/)
    // /en/mapa es una página en inglés: sin hreflang.
    expect(mapa?.hasAttribute('hreflang')).toBe(false)
  })

  it('lugar sin nombre: "Venue to be confirmed", sin lang="es"', () => {
    navegacion.pathname = `/en/evento/${ID}`
    render(
      React.createElement(EventDetailPage, {
        event: { ...EVENTO, venue: null } as unknown as typeof EVENTO,
      }),
    )
    expect(langDe(porTexto(en.portada.lugarPorConfirmar))).toBeNull()
  })
})

describe('la ficha en castellano (/evento/<id>) no cambió', () => {
  it('los textos de siempre, sin lang ni aviso', () => {
    const { container } = montarFicha(`/evento/${ID}`)
    const texto = container.textContent ?? ''

    for (const t of [
      'Volver a eventos',
      'Cómo llegar',
      'Comprar tickets',
      'Ver en el mapa',
      'Precio de entrada',
      '$5.000',
      'Sábado, 7 de noviembre de 2026',
      '21:30 hs',
      'Adultos',
      'Peñas',
      'Guardar',
      'Voy · 12 van',
      'Entrá para marcar si vas.',
      '+ Seguir',
    ]) {
      expect(texto).toContain(t)
    }
    expect(texto).not.toContain(es.comun.avisoContenidoEs)
    expect(container.querySelector('[lang]')).toBeNull()
    expect(screen.getByRole('img', { name: 'Peña de Prueba' }).hasAttribute('lang')).toBe(false)
    expect(screen.getByText('Volver a eventos').closest('a')?.getAttribute('href')).toBe('/')
    expect(screen.getByText('Ver en el mapa').closest('a')?.hasAttribute('hreflang')).toBe(false)
  })
})

describe('el modal interceptado', () => {
  it('en inglés (/en/evento/<id>): interfaz en inglés, contenido con lang="es" y el aviso', () => {
    montarModal(`/en/evento/${ID}`)
    const dialogo = screen.getByRole('dialog')
    const texto = dialogo.textContent ?? ''
    expect(texto).toContain(en.ficha.comoLlegar)
    expect(texto).toContain(en.ficha.comprarTickets)
    expect(texto).toContain('9:30 PM')
    expect(texto).toContain('ARS 5,000')
    expect(texto).toContain(en.comun.avisoContenidoEs)
    expect(texto).not.toContain('Comprar tickets')
    expect(langDe(screen.getByRole('heading', { name: 'Peña de Prueba' }))).toBe('es')
    expect(screen.getByRole('img', { name: 'Peña de Prueba' }).getAttribute('lang')).toBe('es')
    // El aviso es la descripción del diálogo: se anuncia junto con el nombre.
    const describedby = dialogo.getAttribute('aria-describedby')
    expect(describedby).toBeTruthy()
    expect(document.getElementById(describedby!)?.textContent).toBe(en.comun.avisoContenidoEs)
    expect(screen.getByRole('dialog', { description: en.comun.avisoContenidoEs })).toBe(dialogo)
    expect(advertenciasDeRadix()).toEqual([])
  })

  it('en castellano (/evento/<id>): igual que siempre', () => {
    montarModal(`/evento/${ID}`)
    const dialogo = screen.getByRole('dialog')
    const texto = dialogo.textContent ?? ''
    expect(texto).toContain('Cómo llegar')
    expect(texto).toContain('Comprar tickets')
    expect(texto).toContain('21:30 hs')
    expect(texto).toContain('$5.000')
    expect(texto).toContain('Voy · 12 van')
    expect(texto).not.toContain(es.comun.avisoContenidoEs)
    expect(dialogo.querySelector('[lang]')).toBeNull()
    // Sin descripción, y sin una referencia rota a un id que no existe.
    expect(dialogo.hasAttribute('aria-describedby')).toBe(false)
    expect(advertenciasDeRadix()).toEqual([])
  })
})
