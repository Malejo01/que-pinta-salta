// Q5-16 (decisión nº13): el JSON-LD de la ficha en /en usa la traducción con
// inLanguage "en"; sin traducción, el original con "es-AR".
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { textosJsonLdEvento } from '@/lib/seo/json-ld-evento-idioma'

const base = { title: 'Peña de los viernes', short_description: 'Folclore en vivo', description: 'Folclore en vivo con empanadas' }

describe('textosJsonLdEvento', () => {
  it('en inglés con traducción: name y description traducidos, inLanguage "en"', () => {
    expect(textosJsonLdEvento({ ...base, title_en: 'Friday folk night', description_en: 'Live folk music' }, 'en')).toEqual({
      name: 'Friday folk night',
      description: 'Live folk music',
      inLanguage: 'en',
    })
  })

  it('en inglés sin traducción: el original con inLanguage "es-AR"', () => {
    expect(textosJsonLdEvento({ ...base, title_en: null, description_en: null }, 'en')).toEqual({
      name: 'Peña de los viernes',
      description: 'Folclore en vivo',
      inLanguage: 'es-AR',
    })
    expect(textosJsonLdEvento({ ...base, title_en: '   ' }, 'en').inLanguage).toBe('es-AR')
  })

  it('con el título traducido y sin descripción traducida, la descripción original', () => {
    expect(textosJsonLdEvento({ ...base, title_en: 'Friday folk night' }, 'en')).toMatchObject({ name: 'Friday folk night', description: 'Folclore en vivo', inLanguage: 'en' })
  })

  it('en castellano, siempre el original con "es-AR" (aunque haya traducción)', () => {
    expect(textosJsonLdEvento({ ...base, title_en: 'Friday folk night', description_en: 'Live folk music' }, 'es')).toEqual({
      name: 'Peña de los viernes',
      description: 'Folclore en vivo',
      inLanguage: 'es-AR',
    })
  })

  it('sin descripciones, el texto de siempre', () => {
    expect(textosJsonLdEvento({ title: 'X' }, 'es').description).toBe('X en Salta Capital.')
  })

  it('la ficha lo usa para name, description e inLanguage', () => {
    const pagina = readFileSync(join(process.cwd(), 'app', 'evento', '[id]', 'page.tsx'), 'utf8')
    expect(pagina).toContain('textosJsonLdEvento(event, idioma)')
    expect(pagina).toContain("'name': textosJsonLd.name,")
    expect(pagina).toContain("'description': textosJsonLd.description,")
    expect(pagina).toContain("'inLanguage': textosJsonLd.inLanguage,")
  })
})
