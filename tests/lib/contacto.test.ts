import { describe, expect, it } from 'vitest'
import { CONTACT_WHATSAPP, TEXTO_ANUNCIAR, whatsappUrl } from '@/lib/contacto'

describe('whatsappUrl', () => {
  it('arma el link de wa.me con CONTACT_WHATSAPP y el texto codificado', () => {
    const texto = 'Hola! Me interesa …'
    expect(whatsappUrl(texto)).toBe(`https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent(texto)}`)
  })

  it('no depende del valor real del número: cambia si CONTACT_WHATSAPP cambia', () => {
    // No hardcodeamos el número real: comparamos contra la constante importada,
    // así el test no se rompe (ni esconde un bug) si el número cambia.
    const url = whatsappUrl('texto cualquiera')
    expect(url.startsWith(`https://wa.me/${CONTACT_WHATSAPP}?text=`)).toBe(true)
  })

  it('codifica caracteres especiales (espacios, signos, acentos, símbolos) en el texto', () => {
    const texto = 'Hola! ¿Cuánto sale el paquete "Destacado"? 100% & más info'
    const url = whatsappUrl(texto)
    expect(url).toBe(`https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent(texto)}`)
    // No debe quedar el texto crudo (sin codificar) en la URL.
    expect(url).not.toContain(' ')
    expect(url).not.toContain('"')
  })

  it('texto vacío: igual arma la URL (con text= vacío)', () => {
    expect(whatsappUrl('')).toBe(`https://wa.me/${CONTACT_WHATSAPP}?text=`)
  })
})

describe('TEXTO_ANUNCIAR', () => {
  it('existe y no está vacío', () => {
    expect(typeof TEXTO_ANUNCIAR).toBe('string')
    expect(TEXTO_ANUNCIAR.trim().length).toBeGreaterThan(0)
  })

  it('no es un placeholder sin completar', () => {
    expect(TEXTO_ANUNCIAR).not.toContain('[COMPLETAR')
  })

  it('whatsappUrl(TEXTO_ANUNCIAR) codifica ese texto exacto', () => {
    expect(whatsappUrl(TEXTO_ANUNCIAR)).toBe(
      `https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent(TEXTO_ANUNCIAR)}`,
    )
  })
})
