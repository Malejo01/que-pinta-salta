import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { COLUMNAS_EVENTO_DE_LUGAR, separarEventosDeLugar, type EventoDeLugar } from '@qps/core/lugares/ficha'
import { imagenJsonLdEvento, ofertaJsonLdEvento } from '@/lib/seo/json-ld-evento'
import { eventoDeLugarJsonLd, lugarJsonLd, MAX_DESCRIPCION_EVENTO_DE_LUGAR } from '@/lib/seo/json-ld-lugar'

const VENUE = { nombre: 'Teatro de Prueba', direccion: 'Calle Inventada 123', slug: 'teatro-de-prueba', lat: -24.7889, lng: -65.4106 }
const URL_LUGAR = 'https://www.quepintasalta.com.ar/lugar/teatro-de-prueba'

// Eventos inventados: uno con todo, uno gratis sin imagen, uno pago sin precio y sin descripción.
const PROXIMOS: EventoDeLugar[] = [
  {
    id: 'e-completo',
    titulo: 'Obra de prueba',
    inicio: '2026-11-20T23:00:00Z',
    fin: '2026-11-21T01:00:00Z',
    gratis: false,
    descripcion: 'Una obra inventada para el test. 🎭 Con funciones el fin de semana.',
    descripcionCorta: null,
    tituloEn: 'Test play',
    descripcionEn: 'A made-up play for the test.',
    imagen: 'https://cdn.example.com/obra.jpg',
    precioMin: 8000,
    enlaceEntradas: 'https://ticketera.example/obra',
    creado: '2026-11-01T12:00:00Z',
  },
  {
    id: 'e-gratis',
    titulo: 'Peña de prueba',
    inicio: '2026-11-22T00:30:00Z',
    gratis: true,
    descripcion: null,
    descripcionCorta: 'Peña con entrada libre.',
    imagen: null,
    precioMin: null,
    enlaceEntradas: null,
    creado: '2026-11-02T12:00:00Z',
  },
  {
    id: 'e-sin-precio',
    titulo: 'Recital de prueba',
    inicio: '2026-11-25T23:30:00Z',
    gratis: false,
    descripcion: null,
    descripcionCorta: null,
    imagen: '/flyers/recital.jpg',
    precioMin: 0,
    enlaceEntradas: null,
    creado: null,
  },
]

function eventos(idioma: 'es' | 'en', proximos: readonly EventoDeLugar[] = PROXIMOS) {
  return lugarJsonLd({ venue: VENUE, url: URL_LUGAR, proximos, permanente: null, idioma }).event as Record<string, unknown>[]
}

describe('Q7-3 · JSON-LD de /lugar/<slug>: ningún Event sin description, image ni offers', () => {
  it.each(['es', 'en'] as const)('%s: los tres campos en cada Event, con valores usables', (idioma) => {
    for (const e of eventos(idioma)) {
      expect(typeof e.description, String(e['@id'])).toBe('string')
      expect((e.description as string).length).toBeGreaterThan(0)
      expect((e.description as string).length).toBeLessThanOrEqual(MAX_DESCRIPCION_EVENTO_DE_LUGAR)
      expect(e.image).toEqual([expect.stringMatching(/^https:\/\//)])
      expect(e.offers).toMatchObject({ '@type': 'Offer', url: expect.stringMatching(/^https:\/\//) })
    }
  })

  it('con los datos mínimos que podía traer la consulta vieja también salen los tres', () => {
    const [e] = eventos('es', [{ id: 'e1', titulo: 'Solo título', inicio: '2026-11-20T23:00:00Z', gratis: false }])
    expect(e.description).toBe('Solo título en Salta Capital.')
    expect(e.image).toEqual(['https://www.quepintasalta.com.ar/og-image.png'])
    expect(e.offers).toEqual({
      '@type': 'Offer',
      name: 'Entrada',
      url: 'https://www.quepintasalta.com.ar/evento/e1',
      availability: 'https://schema.org/InStock',
    })
  })

  it('el criterio de precio es el de la ficha: gratis = 0, con precio = ese, pago sin precio = sin price', () => {
    const [completo, gratis, sinPrecio] = eventos('es')
    expect(completo.offers).toMatchObject({ price: 8000, priceCurrency: 'ARS', url: 'https://ticketera.example/obra' })
    expect(gratis.offers).toMatchObject({ price: 0, priceCurrency: 'ARS', name: 'Entrada libre y gratuita' })
    expect(sinPrecio.offers).not.toHaveProperty('price')
    expect(sinPrecio.offers).not.toHaveProperty('priceCurrency')
  })

  it('snapshot del JSON-LD de la ficha del lugar (castellano)', () => {
    expect(lugarJsonLd({ venue: VENUE, url: URL_LUGAR, proximos: PROXIMOS, permanente: null, idioma: 'es' })).toMatchSnapshot()
  })

  it('snapshot del primer Event en inglés (título y descripción traducidos)', () => {
    expect(eventos('en')[0]).toMatchSnapshot()
  })
})

describe('Q7-3 · funciones compartidas', () => {
  it('imagenJsonLdEvento: absoluta, o la imagen por defecto del sitio', () => {
    expect(imagenJsonLdEvento('https://cdn.example.com/a.jpg')).toEqual(['https://cdn.example.com/a.jpg'])
    expect(imagenJsonLdEvento('/flyers/a.jpg')).toEqual(['https://www.quepintasalta.com.ar/flyers/a.jpg'])
    expect(imagenJsonLdEvento('  ')).toEqual(['https://www.quepintasalta.com.ar/og-image.png'])
    expect(imagenJsonLdEvento(null)).toEqual(['https://www.quepintasalta.com.ar/og-image.png'])
  })

  it('ofertaJsonLdEvento: un cancelado va como agotado', () => {
    expect(ofertaJsonLdEvento({ is_free: false, price_min: 100 }, { urlFicha: 'https://x', cancelado: true }).availability).toBe(
      'https://schema.org/SoldOut'
    )
  })

  it('eventoDeLugarJsonLd: location con el @id del lugar, su nombre y su dirección', () => {
    const e = eventoDeLugarJsonLd(PROXIMOS[0], { idLugar: URL_LUGAR, venue: VENUE, idioma: 'es' })
    expect(e.location).toMatchObject({ '@id': URL_LUGAR, name: 'Teatro de Prueba', address: { streetAddress: 'Calle Inventada 123' } })
    expect(e.endDate).toBe('2026-11-20T22:00:00-03:00')
  })

  it('la ficha del evento usa las mismas funciones (no duplica la lógica)', () => {
    const pagina = readFileSync(fileURLToPath(new URL('../../app/evento/[id]/page.tsx', import.meta.url)), 'utf8')
    expect(pagina).toContain("'image': imagenJsonLdEvento(event.image_url)")
    expect(pagina).toContain("'offers': ofertaJsonLdEvento(event, { urlFicha: eventUrl, cancelado: isCancelled })")
    expect(pagina).not.toMatch(/'price':\s*0/)
  })
})

describe('Q7-3 · la consulta de la ficha del lugar trae lo que pide el JSON-LD', () => {
  it('COLUMNAS_EVENTO_DE_LUGAR incluye descripción, imagen, precio, entradas y fecha de alta', () => {
    for (const columna of ['description', 'short_description', 'title_en', 'description_en', 'image_url', 'price_min', 'ticket_url', 'created_at', 'end_date']) {
      expect(COLUMNAS_EVENTO_DE_LUGAR.split(',').map((c) => c.trim())).toContain(columna)
    }
    const ficha = readFileSync(fileURLToPath(new URL('../../lib/lugares/ficha.ts', import.meta.url)), 'utf8')
    expect(ficha).toContain('.select(COLUMNAS_EVENTO_DE_LUGAR)')
  })

  it('separarEventosDeLugar pasa esos campos a EventoDeLugar', () => {
    const { proximos } = separarEventosDeLugar(
      [
        {
          id: 'e1',
          title: 'Obra',
          start_date: '2026-11-20T23:00:00Z',
          is_free: false,
          description: 'Desc',
          image_url: 'https://cdn.example.com/a.jpg',
          price_min: 500,
          ticket_url: 'https://t.example',
          created_at: '2026-11-01T00:00:00Z',
        },
      ],
      new Date('2026-11-15T00:00:00Z')
    )
    expect(proximos[0]).toMatchObject({ descripcion: 'Desc', imagen: 'https://cdn.example.com/a.jpg', precioMin: 500, enlaceEntradas: 'https://t.example' })
  })
})
