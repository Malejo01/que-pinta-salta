// Q5-5 · Ficha de un lugar: parámetro de la URL, indexación, eventos,
// JSON-LD, lugares en Buscar y la ruta /en/place. Sin red ni base.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DIAS_PASADOS_RECIENTES,
  fichaLugarIndexable,
  leerParametroLugar,
  lugaresQueCoinciden,
  separarEventosDeLugar,
} from '@qps/core/lugares/ficha'
import { lugarJsonLd } from '@/lib/seo/json-ld-lugar'
import { rutaEn } from '@/lib/i18n/rutas'
import { idiomasAlternos } from '@/lib/i18n/seo'

describe('leerParametroLugar', () => {
  it('slug, uuid (se redirige) o nada', () => {
    expect(leerParametroLugar('teatro-provincial')).toEqual({ tipo: 'slug', slug: 'teatro-provincial' })
    expect(leerParametroLugar('Teatro-Provincial')).toEqual({ tipo: 'slug', slug: 'teatro-provincial' })
    expect(leerParametroLugar('12345678-1234-4234-8234-123456789012')).toEqual({ tipo: 'id', id: '12345678-1234-4234-8234-123456789012' })
    expect(leerParametroLugar('../etc')).toBeNull()
    expect(leerParametroLugar("x' or 1=1")).toBeNull()
    expect(leerParametroLugar('a'.repeat(101))).toBeNull()
  })
})

describe('fichaLugarIndexable', () => {
  it('noindex solo si no tiene eventos (próximos ni recientes) ni es permanente', () => {
    expect(fichaLugarIndexable({ proximos: 0, pasados: 0, permanente: false })).toBe(false)
    expect(fichaLugarIndexable({ proximos: 1, pasados: 0, permanente: false })).toBe(true)
    expect(fichaLugarIndexable({ proximos: 0, pasados: 2, permanente: false })).toBe(true)
    expect(fichaLugarIndexable({ proximos: 0, pasados: 0, permanente: true })).toBe(true)
  })
})

describe('separarEventosDeLugar', () => {
  const ahora = new Date('2026-11-03T15:00:00Z')
  const ev = (id: string, inicio: string, fin: string | null = null) => ({ id, title: id, start_date: inicio, end_date: fin, is_free: id === 'b' })
  it('próximos ascendentes; pasados recientes descendentes; lo muy viejo afuera; lo que sigue en curso es próximo', () => {
    const viejo = new Date(ahora.getTime() - (DIAS_PASADOS_RECIENTES + 1) * 86_400_000).toISOString()
    const r = separarEventosDeLugar(
      [ev('c', '2026-11-20T23:00:00Z'), ev('b', '2026-11-05T23:00:00Z'), ev('p1', '2026-10-01T23:00:00Z'), ev('p2', '2026-10-20T23:00:00Z'), ev('viejo', viejo), ev('encurso', '2026-11-03T12:00:00Z', '2026-11-03T20:00:00Z')],
      ahora,
    )
    expect(r.proximos.map((e) => e.id)).toEqual(['encurso', 'b', 'c'])
    expect(r.proximos[1]!.gratis).toBe(true)
    expect(r.pasados.map((e) => e.id)).toEqual(['p2', 'p1'])
  })
})

describe('lugarJsonLd', () => {
  const venue = { nombre: 'Teatro Provincial', direccion: 'Zuviría 70', slug: 'teatro-provincial', lat: -24.78, lng: -65.41 }
  it('EventVenue con dirección, geo y la lista de eventos con su @id', () => {
    const j = lugarJsonLd({
      venue,
      url: 'https://www.quepintasalta.com.ar/lugar/teatro-provincial',
      proximos: [{ id: 'e1', titulo: 'Obra', inicio: '2026-11-05T23:00:00Z', gratis: true }],
      permanente: null,
      idioma: 'es',
    })
    expect(j['@type']).toBe('EventVenue')
    expect(j['@id']).toBe('https://www.quepintasalta.com.ar/lugar/teatro-provincial')
    expect(j.geo).toEqual({ '@type': 'GeoCoordinates', latitude: -24.78, longitude: -65.41 })
    const eventos = j.event as Record<string, unknown>[]
    expect(eventos[0]).toMatchObject({
      '@type': 'Event',
      '@id': 'https://www.quepintasalta.com.ar/evento/e1',
      url: 'https://www.quepintasalta.com.ar/evento/e1',
      name: 'Obra',
      startDate: '2026-11-05T20:00:00-03:00',
      location: { '@id': 'https://www.quepintasalta.com.ar/lugar/teatro-provincial' },
      isAccessibleForFree: true,
    })
  })
  it('en inglés, los links de los eventos van a /en; sin coordenadas no hay geo; sin eventos no hay event', () => {
    const j = lugarJsonLd({ venue: { ...venue, lat: null, lng: null }, url: 'u', proximos: [{ id: 'e1', titulo: 'x', inicio: '2026-11-05T23:00:00Z', gratis: false }], permanente: null, idioma: 'en' })
    expect((j.event as Record<string, unknown>[])[0]!.url).toBe('https://www.quepintasalta.com.ar/en/evento/e1')
    expect(j.geo).toBeUndefined()
    expect(lugarJsonLd({ venue, url: 'u', proximos: [], permanente: null, idioma: 'es' }).event).toBeUndefined()
  })
})

describe('Buscar: lugares que coinciden', () => {
  const eventos = [
    { venue: { slug: 'teatro-provincial', name: 'Teatro Provincial', is_placeholder: false } },
    { venue: { slug: 'teatro-provincial', name: 'Teatro Provincial', is_placeholder: false } },
    { venue: { slug: 'teatrito', name: 'El Teatrito', is_placeholder: false } },
    { venue: { slug: 'lugar-no-especificado', name: 'Lugar no especificado (teatro)', is_placeholder: true } },
    { venue: null },
  ]
  it('desde 3 letras, sin tildes, sin placeholders, los de más eventos primero', () => {
    expect(lugaresQueCoinciden(eventos, 'te')).toEqual([])
    expect(lugaresQueCoinciden(eventos, 'TEÁTR')).toEqual([
      { slug: 'teatro-provincial', nombre: 'Teatro Provincial', eventos: 2 },
      { slug: 'teatrito', nombre: 'El Teatrito', eventos: 1 },
    ])
  })
})

describe('rutas y enlaces', () => {
  it('/lugar/<slug> ↔ /en/place/<slug>, con hreflang', () => {
    expect(rutaEn('en', '/lugar/teatro-provincial')).toBe('/en/place/teatro-provincial')
    expect(idiomasAlternos('/lugar/teatro-provincial')).toEqual({
      'es-AR': '/lugar/teatro-provincial',
      en: '/en/place/teatro-provincial',
      'x-default': '/lugar/teatro-provincial',
    })
  })
  it('se enlaza desde la ficha del evento, el mapa y Buscar', () => {
    const leer = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')
    expect(leer('components', 'event-detail-page.tsx')).toContain('`/lugar/${event.venue.slug}`')
    expect(leer('components', 'mapa', 'lista-lugares.tsx')).toContain('`/lugar/${pin.venueId}`')
    expect(leer('components', 'mapa', 'seccion-lugares-chicos.tsx')).toContain('`/lugar/${lugar.slug}`')
    expect(leer('app', 'buscar', 'buscar-content.tsx')).toContain('`/lugar/${lugar.slug}`')
  })
  it('la página: noindex si es flaca, redirección 308 al slug canónico, y JSON-LD', () => {
    const s = readFileSync(join(process.cwd(), 'components', 'lugares', 'pagina-lugar.tsx'), 'utf8')
    expect(s).toMatch(/indexable \? \{\} : \{ robots: \{ index: false, follow: true \} \}/)
    expect(s).toContain('permanentRedirect(rutaEn(idioma, `/lugar/${ficha.slug}`))')
    expect(s).toContain('<JsonLd data={lugarJsonLd(')
    expect(s).toContain('<BotonSeguir tipo="lugar"')
  })
})
