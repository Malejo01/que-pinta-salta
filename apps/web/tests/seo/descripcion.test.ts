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
    // La ventana (23) termina justo al final de «en»: entra entera.
    expect(descripcionParaMeta('Gran peña folclórica en la Balderrama', 24)).toBe('Gran peña folclórica en…')
    // La ventana (21) termina en «folclórica »: se corta en ese espacio.
    const r = descripcionParaMeta('Gran peña folclórica en la Balderrama', 22)!
    expect(r).toBe('Gran peña folclórica…')
    expect(r.length).toBeLessThanOrEqual(22)
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

  it('keycaps: queda el dígito, sin espacios en el medio de un número', () => {
    expect(descripcionParaMeta('📅 2️⃣5️⃣/1️⃣0️⃣ desde las 2️⃣2️⃣hs')).toBe('25/10 desde las 22hs')
    expect(descripcionParaMeta('Sala 1️⃣0️⃣')).toBe('Sala 10')
  })

  it('sin espacio suelto antes de comillas de cierre, pero sí antes de las de apertura', () => {
    expect(descripcionParaMeta('«Noche 🔥» y "Peña 🎶"')).toBe('«Noche» y "Peña"')
    expect(descripcionParaMeta('Show “Gran Final 🎤” hoy')).toBe('Show “Gran Final” hoy')
    expect(descripcionParaMeta("Ciclo 'Rock 🎸' en vivo")).toBe("Ciclo 'Rock' en vivo")
  })

  it('no parte un par sustituto: el último carácter queda entero', () => {
    const r = descripcionParaMeta('𝐆𝐑𝐀𝐍𝐃𝐄'.repeat(30))!
    expect(r.length).toBeLessThanOrEqual(160)
    expect(r.endsWith('…')).toBe(true)
    // Ningún sustituto suelto (alto sin bajo atrás, o bajo sin alto adelante).
    expect(r).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/)
    expect(r.slice(0, -1)).toBe('𝐆𝐑𝐀𝐍𝐃𝐄'.repeat(30).slice(0, r.length - 1))
  })

  it('no deja una tilde combinada (NFD) separada de su letra', () => {
    const e = 'e\u0301' // «é» en NFD: dos code points
    const r = descripcionParaMeta(e.repeat(200))!
    expect(r.length).toBeLessThanOrEqual(160)
    const cuerpo = r.slice(0, -1)
    expect(cuerpo.endsWith(e)).toBe(true)
    expect(cuerpo).toBe(e.repeat(cuerpo.length / 2))
  })

  it('si el último espacio queda muy al principio, corte duro en vez de casi nada', () => {
    const r = descripcionParaMeta(`¡ ${'a'.repeat(300)}`)!
    expect(r).not.toBe('¡…')
    expect(r).toBe(`¡ ${'a'.repeat(157)}…`)
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
