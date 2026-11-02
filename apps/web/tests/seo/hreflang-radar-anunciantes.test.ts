/**
 * Metadata, ISR y redirect de /radar ↔ /en/radar y /anunciantes ↔ /en/anunciantes
 * (78-b). Las páginas en inglés tienen metadata propia (título absoluto en
 * inglés); las de castellano conservan su título y descripción de antes del
 * commit e2240cb. /anunciantes sigue siendo estática (ISR): `revalidate = 3600`
 * literal en las dos páginas y ni componentes cliente ni APIs dinámicas en el
 * cuerpo compartido. Sin red ni base.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error('redirect: ' + url)
  },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  authError: null as { message: string } | null,
  role: 'USER' as string,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user }, error: state.authError }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: state.role } }) }) }) }),
  }),
  createAdminClient: () => ({}),
}))
vi.mock('@/lib/data', () => ({
  getCategories: async () => [],
  getVenues: async () => [],
  getInstagramAccounts: async () => [],
}))
vi.mock('@/lib/actions/radar', () => ({ getRadarSettings: async () => null }))
vi.mock('@/components/navbar', () => ({ Navbar: () => null }))
vi.mock('@/components/mobile-nav', () => ({ MobileNav: () => null }))
vi.mock('@/components/radar-form', () => ({ RadarForm: function RadarFormStub() { return null } }))

// Las páginas de /en y /es son las reales; solo se corta el cuerpo pesado de /anunciantes.
vi.mock('@/components/anunciantes/pagina-anunciantes', () => ({ PaginaAnunciantes: () => null }))

import { metadata as radarEn } from '@/app/en/radar/page'
import { metadata as radarEs } from '@/app/radar/page'
import { metadata as anunciantesEn, revalidate as revalidateEn } from '@/app/en/anunciantes/page'
import { metadata as anunciantesEs, revalidate as revalidateEs } from '@/app/anunciantes/page'
import { RadarForm } from '@/components/radar-form'
import { ANUNCIANTES } from '@/lib/config/anunciantes'
import { idiomasAlternos } from '@/lib/i18n/seo'

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

describe('/en/anunciantes', () => {
  it('canónica /en/anunciantes y languages hacia las dos versiones', () => {
    expect(anunciantesEn.alternates?.canonical).toBe('/en/anunciantes')
    expect(anunciantesEn.alternates?.languages).toEqual(idiomasAlternos('/anunciantes'))
    expect(anunciantesEn.alternates?.languages).toEqual({
      'es-AR': '/anunciantes',
      en: '/en/anunciantes',
      'x-default': '/anunciantes',
    })
  })

  it('título absoluto en inglés (sin el template del layout) y descripción en inglés', () => {
    expect(anunciantesEn.title).toEqual({ absolute: expect.stringMatching(/Salta/) })
    const titulo = String((anunciantesEn.title as { absolute: string }).absolute)
    expect(titulo).toMatch(/Advertise/)
    expect(titulo).not.toMatch(/Publicitá/)
    expect(anunciantesEn.description).toMatch(/\b(the|and|for)\b/)
    expect(anunciantesEn.description).not.toMatch(/Llegá|Publicitá|público/)
  })

  it('openGraph en_US con su url y la imagen; twitter con la misma imagen', () => {
    const og = anunciantesEn.openGraph as Record<string, unknown>
    expect(og.locale).toBe('en_US')
    expect(og.url).toBe('/en/anunciantes')
    expect(og.images).toEqual([expect.objectContaining({ url: '/og-image.png', width: 1200, height: 630 })])
    expect(String(og.description)).not.toMatch(/Llegá|Publicitá/)
    const tw = anunciantesEn.twitter as Record<string, unknown>
    expect(tw.title).toBe((anunciantesEn.title as { absolute: string }).absolute)
    expect(tw.images).toEqual(['/og-image.png'])
  })

  it('robots igual al de castellano, según ANUNCIANTES.publicada', () => {
    expect(anunciantesEn.robots).toEqual(anunciantesEs.robots)
    if (ANUNCIANTES.publicada) {
      expect(anunciantesEn.robots).toBeUndefined()
    } else {
      expect(anunciantesEn.robots).toEqual({ index: false, follow: false })
    }
  })

  it('el archivo condiciona robots a ANUNCIANTES.publicada (si se despublica, no se indexa en ningún idioma)', () => {
    for (const archivo of ['app/anunciantes/page.tsx', 'app/en/anunciantes/page.tsx']) {
      expect(read(archivo), archivo).toMatch(/ANUNCIANTES\.publicada \? \{\} : \{ robots: \{ index: false, follow: false \} \}/)
    }
  })
})

describe('/anunciantes en castellano conserva su metadata de antes', () => {
  it('título y descripción idénticos a los de e2240cb^; canónica propia y languages', () => {
    expect(anunciantesEs.title).toBe('Publicitá tu evento | Qué Pinta Salta')
    expect(anunciantesEs.description).toBe(
      'Llegá al público que ya está buscando salidas en Salta Capital: destacados en la portada, packs para organizadores y RRPP, con precios publicados y reporte de clics.',
    )
    expect(anunciantesEs.alternates?.canonical).toBe('/anunciantes')
    expect(anunciantesEs.alternates?.languages).toEqual(idiomasAlternos('/anunciantes'))
    expect(anunciantesEs.openGraph).toBeUndefined()
  })
})

describe('ISR de /anunciantes: sigue estática', () => {
  it('revalidate === 3600 exportado en las dos páginas', () => {
    expect(revalidateEs).toBe(3600)
    expect(revalidateEn).toBe(3600)
  })

  it.each(['app/anunciantes/page.tsx', 'app/en/anunciantes/page.tsx'])('%s declara el revalidate literal (Next no toma uno reexportado)', (archivo) => {
    expect(read(archivo)).toMatch(/^export const revalidate = 3600$/m)
  })

  it.each(['app/anunciantes/page.tsx', 'app/en/anunciantes/page.tsx', 'components/anunciantes/pagina-anunciantes.tsx'])(
    '%s: sin "use client", cookies() ni headers()',
    (archivo) => {
      // Se sacan los comentarios, que mencionan estas APIs para explicar que no se usan.
      const codigo = read(archivo).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      expect(codigo).not.toMatch(/["']use client["']/)
      expect(codigo).not.toMatch(/\bcookies\(/)
      expect(codigo).not.toMatch(/\bheaders\(/)
      expect(codigo).not.toMatch(/next\/headers/)
    },
  )

  it('las páginas llaman al cuerpo compartido como función con su idioma', () => {
    expect(read('app/anunciantes/page.tsx')).toMatch(/PaginaAnunciantes\(\{ idioma: "es" \}\)/)
    expect(read('app/en/anunciantes/page.tsx')).toMatch(/PaginaAnunciantes\(\{ idioma: "en" \}\)/)
  })
})

describe('/radar y /en/radar: privadas, noindex y follow', () => {
  it('las dos con robots noindex/follow', () => {
    expect(radarEs.robots).toEqual({ index: false, follow: true })
    expect(radarEn.robots).toEqual({ index: false, follow: true })
  })

  it('/radar conserva su título y descripción de antes (castellano, voseo)', () => {
    expect(radarEs.title).toBe('Mi Radar Salteño')
    expect(radarEs.description).toBe(
      'Personalizá tu suscripción de novedades para recibir la agenda cultural de Salta en tu email.',
    )
  })

  it('/en/radar: título absoluto y descripción en inglés', () => {
    expect(radarEn.title).toEqual({ absolute: 'My Salta Radar | Qué Pinta Salta' })
    expect(radarEn.description).toMatch(/\b(your|the|to)\b/)
    expect(radarEn.description).not.toMatch(/Personalizá|suscripción/)
  })

  it('privada: sin canonical ni hreflang (no se indexa, no hay par que anunciar)', () => {
    expect(radarEs.alternates).toBeUndefined()
    expect(radarEn.alternates).toBeUndefined()
  })
})

describe('PaginaRadar: sesión y redirect en el mismo idioma', () => {
  beforeEach(() => {
    state.user = null
    state.authError = null
    state.role = 'USER'
  })

  async function cargar() {
    return (await vi.importActual('@/components/radar/pagina-radar')) as typeof import('@/components/radar/pagina-radar')
  }

  it('sin sesión en castellano: /auth/login?next=/radar', async () => {
    const { PaginaRadar } = await cargar()
    await expect(PaginaRadar({ idioma: 'es' })).rejects.toThrow('redirect: /auth/login?next=/radar')
  })

  it('sin sesión en inglés: /auth/login?next=/en/radar (el login queda en castellano, vuelve al inglés)', async () => {
    const { PaginaRadar } = await cargar()
    await expect(PaginaRadar({ idioma: 'en' })).rejects.toThrow('redirect: /auth/login?next=/en/radar')
  })

  it('con error de autenticación aunque venga usuario: también redirige, en el mismo idioma', async () => {
    state.user = { id: 'usuario-de-prueba' }
    state.authError = { message: 'jwt expired' }
    const { PaginaRadar } = await cargar()
    await expect(PaginaRadar({ idioma: 'en' })).rejects.toThrow('redirect: /auth/login?next=/en/radar')
    await expect(PaginaRadar({ idioma: 'es' })).rejects.toThrow('redirect: /auth/login?next=/radar')
  })

  it('con sesión: renderiza el título del idioma y le pasa el idioma al formulario', async () => {
    state.user = { id: 'usuario-de-prueba' }
    const { PaginaRadar } = await cargar()
    for (const [idioma, titulo] of [
      ['es', 'Mi Radar Salteño'],
      ['en', 'My Salta Radar'],
    ] as const) {
      const arbol = await PaginaRadar({ idioma })
      const textos: string[] = []
      let idiomaForm: unknown = 'sin-formulario'
      const recorrer = (nodo: React.ReactNode): void => {
        if (typeof nodo === 'string') textos.push(nodo)
        if (Array.isArray(nodo)) return nodo.forEach(recorrer)
        if (!React.isValidElement(nodo)) return
        const props = nodo.props as { children?: React.ReactNode; idioma?: unknown }
        if (nodo.type === RadarForm) idiomaForm = props.idioma
        recorrer(props.children)
      }
      recorrer(arbol)
      expect(textos, idioma).toContain(titulo)
      expect(idiomaForm, idioma).toBe(idioma)
    }
  })

  it('el archivo arma el redirect con rutaEn (no hay ruta fija)', () => {
    expect(read('components/radar/pagina-radar.tsx')).toContain('redirect(`/auth/login?next=${rutaEn(idioma, "/radar")}`)')
  })
})

describe('las páginas de Radar pasan el idioma al cuerpo compartido', () => {
  it('castellano e inglés usan el mismo componente con su idioma', () => {
    expect(read('app/radar/page.tsx')).toMatch(/PaginaRadar\(\{ idioma: "es" \}\)/)
    expect(read('app/en/radar/page.tsx')).toMatch(/PaginaRadar\(\{ idioma: "en" \}\)/)
  })
})
