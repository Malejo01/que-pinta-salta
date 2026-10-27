// B2: la meta descripción de la ficha y del flyer, sin emojis ni saltos de
// línea y cortada en palabra (auditoría B1: era el caption crudo de
// Instagram cortado a 160). Puro, sin red ni base.
import { describe, expect, it } from 'vitest'
import { descripcionParaMeta } from '@/lib/seo/descripcion'

describe('descripcionParaMeta', () => {
  it('saca emojis, banderas, tonos de piel, ZWJ y selectores de variación', () => {
    expect(descripcionParaMeta('🎶🔥 ¡UNA NOCHE EN CASA GRANDE! 🔥🎶')).toBe('¡UNA NOCHE EN CASA GRANDE!')
    expect(descripcionParaMeta('Peña 🇦🇷 con 👍🏽 y ❤️ y 👨‍👩‍👧 familia')).toBe('Peña con y y familia')
    expect(descripcionParaMeta('Mesa 1️⃣ libre')).toBe('Mesa 1 libre')
    expect(descripcionParaMeta('fiesta🔥hoy')).toBe('fiesta hoy')
  })

  it('no deja un espacio suelto antes de un signo donde había un emoji', () => {
    expect(descripcionParaMeta('¡VENÍ 🔥! Entrada libre 🎉, cupos limitados')).toBe(
      '¡VENÍ! Entrada libre, cupos limitados'
    )
  })

  it('junta saltos de línea, tabs y espacios repetidos en un solo espacio', () => {
    expect(descripcionParaMeta('  Línea uno\n\nLínea   dos\r\n\tLínea tres  ')).toBe('Línea uno Línea dos Línea tres')
  })

  it('respeta acentos, eñes y signos de apertura', () => {
    expect(descripcionParaMeta('¿Qué pinta? Peña en Güemes, año ñandú')).toBe('¿Qué pinta? Peña en Güemes, año ñandú')
  })

  it('un texto corto queda igual (sin «…»)', () => {
    const texto = 'Recital en el Teatro Provincial.'
    expect(descripcionParaMeta(texto)).toBe(texto)
    expect(descripcionParaMeta('x'.repeat(160))).toBe('x'.repeat(160))
  })

  it('un texto largo se corta en el último espacio, con «…» y sin pasarse de max', () => {
    const texto = 'palabra '.repeat(40).trim() // 319 caracteres
    const r = descripcionParaMeta(texto)!
    expect(r.length).toBeLessThanOrEqual(160)
    expect(r.endsWith('…')).toBe(true)
    // Cortó entre palabras: todo lo de antes del «…» son palabras enteras.
    expect(r.slice(0, -1).split(' ').every((p) => p === 'palabra')).toBe(true)
  })

  it('con max chico también corta en palabra y no se pasa', () => {
    const r = descripcionParaMeta('Gran peña folclórica en la Balderrama', 20)!
    expect(r).toBe('Gran peña…')
    expect(r.length).toBeLessThanOrEqual(20)
  })

  it('no deja una coma colgando antes del «…»', () => {
    const r = descripcionParaMeta('Uno, dos, tres, cuatro, cinco, seis', 17)!
    expect(r).toBe('Uno, dos, tres…')
  })

  it('una sola palabra más larga que max se corta a max - 1 más el «…»', () => {
    const r = descripcionParaMeta('a'.repeat(300))!
    expect(r).toBe(`${'a'.repeat(159)}…`)
    expect(r.length).toBe(160)
  })

  it('el corte cuenta el texto ya limpio, no el original con emojis', () => {
    const r = descripcionParaMeta(`${'🔥'.repeat(100)} Peña hoy`)
    expect(r).toBe('Peña hoy')
  })

  it('null si no hay texto o si queda vacío (solo emojis o espacios)', () => {
    expect(descripcionParaMeta(null)).toBeNull()
    expect(descripcionParaMeta(undefined)).toBeNull()
    expect(descripcionParaMeta('')).toBeNull()
    expect(descripcionParaMeta('   \n\t ')).toBeNull()
    expect(descripcionParaMeta('🔥🎶 🇦🇷\n❤️')).toBeNull()
  })
})
