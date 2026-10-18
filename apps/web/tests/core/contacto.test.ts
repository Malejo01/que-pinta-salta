import { describe, expect, it } from 'vitest'
import { CONTACTO_EMAIL, mailtoContacto } from '@qps/core/contacto'

describe('CONTACTO_EMAIL', () => {
  it('tiene forma de mail (una sola @, sin espacios)', () => {
    expect(CONTACTO_EMAIL).not.toContain(' ')
    expect(CONTACTO_EMAIL.split('@')).toHaveLength(2)
  })

  it('termina en @quepintasalta.com.ar', () => {
    expect(CONTACTO_EMAIL.endsWith('@quepintasalta.com.ar')).toBe(true)
  })

  it('fija el valor exacto de la decisión de Mauro del 17/10', () => {
    expect(CONTACTO_EMAIL).toBe('contacto@quepintasalta.com.ar')
  })
})

describe('mailtoContacto', () => {
  it('sin argumento: devuelve mailto:CONTACTO_EMAIL sin "?"', () => {
    const url = mailtoContacto()
    expect(url).toBe(`mailto:${CONTACTO_EMAIL}`)
    expect(url).not.toContain('?')
  })

  it('con asunto vacío: igual que sin argumento', () => {
    const url = mailtoContacto('')
    expect(url).toBe(`mailto:${CONTACTO_EMAIL}`)
    expect(url).not.toContain('?')
  })

  it('con asunto solo de espacios: igual que sin argumento', () => {
    const url = mailtoContacto('   ')
    expect(url).toBe(`mailto:${CONTACTO_EMAIL}`)
    expect(url).not.toContain('?')
  })

  it('codifica el asunto: espacios como %20 y la tilde de "é"', () => {
    const asunto = 'Eliminar mi cuenta de Qué Pinta Salta'
    const url = mailtoContacto(asunto)
    expect(url).toBe(`mailto:${CONTACTO_EMAIL}?subject=${encodeURIComponent(asunto)}`)
    expect(url).not.toContain(' ')
    expect(url).toContain('%20')
    expect(url).toContain('%C3%A9')
  })

  it('codifica "?", "&" y """ en el asunto, y deja un solo "?" como separador', () => {
    const asunto = 'Consulta "urgente"? info & más'
    const url = mailtoContacto(asunto)
    expect(url).toBe(`mailto:${CONTACTO_EMAIL}?subject=${encodeURIComponent(asunto)}`)
    expect(url).toContain('%3F')
    expect(url).toContain('%26')
    expect(url).toContain('%22')
    expect(url.split('?')).toHaveLength(2)
  })

  it('siempre arranca con "mailto:" y nunca con "http"', () => {
    expect(mailtoContacto()).toMatch(/^mailto:/)
    expect(mailtoContacto('algo')).toMatch(/^mailto:/)
    expect(mailtoContacto()).not.toMatch(/^http/)
    expect(mailtoContacto('algo')).not.toMatch(/^http/)
  })
})
