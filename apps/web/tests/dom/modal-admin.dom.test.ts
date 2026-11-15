// @vitest-environment jsdom
//
// Q7-4 · El modal del evento (`EventModalWrapper`, el que abren la portada y
// /buscar con la ruta interceptada `@modal/(.)evento/[id]`) para un ADMIN:
// el estado del destacado y «Abrir ficha completa». Para el público no cambia
// nada. `isAdmin` lo calcula el servidor (`app/@modal/(.)evento/[id]/page.tsx`,
// con `profiles.role`); acá se prueba qué dibuja con cada valor.
//
// Los `vi.mock` van en este archivo (ver el comentario de `preparar-dom.ts`).
import * as React from 'react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, cleanup, screen, within } from '@testing-library/react'

import { EventModalWrapper } from '@/components/event-modal-wrapper'
import { AdminModalEvento } from '@/components/admin/admin-modal-evento'

vi.mock('next/navigation', () => ({
  usePathname: () => '/evento/x',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...resto }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => {
    delete resto.prefetch
    return React.createElement('a', { href, ...resto }, children)
  },
}))
vi.mock('@/components/view-beacon', () => ({ ViewBeacon: () => null }))
vi.mock('@/components/flyer-image', () => ({
  FlyerImage: ({ alt }: { alt: string }) => React.createElement('img', { alt }),
}))
vi.mock('@/components/admin/control-destacado', () => ({ ControlDestacado: () => null }))
vi.mock('@/lib/admin-actions', () => ({ createCategory: vi.fn(), updateEventCategory: vi.fn() }))
vi.mock('@/lib/asistencia', () => ({ marcarAsistencia: vi.fn() }))
vi.mock('@/lib/actions/favorites', () => ({ toggleFavorite: vi.fn() }))
vi.mock('@/lib/actions/radar', () => ({ cambiarSeguimiento: vi.fn() }))
vi.mock('@/components/auth-modal', () => ({ useAuthModal: () => ({ open: vi.fn(), close: vi.fn() }) }))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const ID = '12345678-1234-4234-8234-123456789012'

function evento(featuredUntil: string | null) {
  return {
    id: ID,
    title: 'Peña de Prueba',
    description: 'Una descripción inventada.',
    short_description: null,
    start_date: '2026-11-21T00:30:00Z',
    end_date: null,
    status: 'PUBLISHED',
    is_free: false,
    price_min: 5000,
    image_url: null,
    ticket_url: null,
    age_restriction: null,
    featured_until: featuredUntil,
    category_id: 'cat-1',
    category: { id: 'cat-1', name: 'Peñas', slug: 'penas' },
    venue: { id: 'lugar-1', name: 'Lugar de Prueba', address: 'Calle Inventada 123', latitude: -24.78, longitude: -65.41 },
  } as unknown as React.ComponentProps<typeof EventModalWrapper>['event']
}

function montar({ isAdmin, featuredUntil }: { isAdmin: boolean; featuredUntil: string | null }) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-15T15:00:00Z'))
  return render(
    React.createElement(EventModalWrapper, {
      event: evento(featuredUntil),
      isAdmin,
      categories: [],
      haySesion: true,
    })
  )
}

describe('Q7-4 · modal del evento para un ADMIN', () => {
  it('destacado vigente: «Destacado hasta el DD/MM» y «Abrir ficha completa» a /evento/<id>', () => {
    montar({ isAdmin: true, featuredUntil: '2026-11-22T02:59:59Z' })
    const bloque = screen.getByRole('region', { name: 'Herramientas de admin' })
    expect(within(bloque).getByText(/^Destacado hasta el 21\/11$/)).toBeTruthy()
    const link = within(bloque).getByRole('link', { name: 'Abrir ficha completa' })
    expect(link.getAttribute('href')).toBe(`/evento/${ID}`)
  })

  it('sin destacado: «Sin destacado»', () => {
    montar({ isAdmin: true, featuredUntil: null })
    expect(within(screen.getByRole('region', { name: 'Herramientas de admin' })).getByText('Sin destacado')).toBeTruthy()
  })

})

describe('Q7-4 · para el público no cambia nada', () => {
  it('sin isAdmin no aparece el bloque, ni el estado del destacado ni el link', () => {
    const { container } = montar({ isAdmin: false, featuredUntil: '2026-11-22T02:59:59Z' })
    expect(screen.queryByRole('region', { name: 'Herramientas de admin' })).toBeNull()
    expect(screen.queryByText('Abrir ficha completa')).toBeNull()
    expect(container.textContent).not.toContain('Destacado hasta el')
    expect(container.textContent).not.toContain('Categoría (Admin)')
  })
})

describe('Q7-4 · AdminModalEvento', () => {
  it('con una fecha vencida: «Venció el DD/MM»', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-15T15:00:00Z'))
    render(React.createElement(AdminModalEvento, { eventId: ID, featuredUntil: '2026-11-10T02:59:59Z' }))
    expect(screen.getByText(/^Venció el 0?9\/11$/)).toBeTruthy()
  })
})
