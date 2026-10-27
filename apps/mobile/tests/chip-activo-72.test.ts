// R72, 72-q (QPS-362): el chip activo se distingue por algo que no es color, el
// borde inactivo llega a 3:1 y el ancho del chip no salta al activarse.
// Detectores sobre el fuente (sin comentarios) de ChipsCategorias, PillsAtajos y
// el chip "Solo gratis" / tiles / botón del vacío de Buscar. No fijan espacios,
// saltos de línea ni el orden de las props: extraen números y comparan.
//
// Cómo se pone en rojo:
//   - ChipsCategorias: activo con `paddingHorizontal: 16` (sin compensar el borde de 2) -> "el ancho salta"
//   - ChipsCategorias/PillsAtajos: `peso={activo ? 'semibold' : 'semibold'}`            -> "peso"
//   - PillsAtajos: `!activo && { borderWidth: 1, ... }` (borde solo en el inactivo)     -> "borde en un solo estado"
//   - Buscar: `borderColor: ... : colores.border` en el chip, los tiles o el vacío      -> "colores.border"
//   - lib/colores.ts: bajar BORDE_CONTROL_* hacia el fondo (p. ej. '#222222')           -> contraste < 3
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { quitarComentarios } from '@qps/core/tests/convencion-entorno'
import { contraste, cumpleContraste } from '../lib/accesibilidad'
import { bordeChipInactivo } from '../lib/colores'
import { COLORES_CLARO, COLORES_OSCURO } from '../lib/theme'

function leer(ruta: string): string {
  return readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), 'utf8')
}

const PESOS: Record<string, number> = { normal: 0, semibold: 1, bold: 2 }

/** Desde el `{` en `desde`, el bloque hasta su `}` par (con las llaves). */
function bloque(texto: string, desde: number): string {
  let nivel = 0
  for (let i = desde; i < texto.length; i++) {
    if (texto[i] === '{') nivel++
    else if (texto[i] === '}') {
      nivel--
      if (nivel === 0) return texto.slice(desde, i + 1)
    }
  }
  throw new Error('Llave sin cerrar')
}

function numero(obj: string, clave: string): number | null {
  const m = new RegExp(`\\b${clave}\\s*:\\s*(\\d+)`).exec(obj)
  return m ? Number(m[1]) : null
}

/** Pesos (activo, inactivo) de `peso={VAR ? 'a' : 'b'}`, o null si no hay esa forma. */
function pesosDe(texto: string, variable: string): [string, string] | null {
  const m = new RegExp(`\\bpeso\\s*=\\s*\\{\\s*${variable}\\s*\\?\\s*['"](\\w+)['"]\\s*:\\s*['"](\\w+)['"]\\s*\\}`).exec(texto)
  return m ? [m[1], m[2]] : null
}

function problemasPeso(texto: string, variable: string): string[] {
  const p = pesosDe(texto, variable)
  if (!p) return [`peso: no hay peso={${variable} ? … : …}`]
  const [a, i] = p
  if (!(a in PESOS) || !(i in PESOS)) return [`peso: valores desconocidos ${a}/${i}`]
  return PESOS[a] > PESOS[i] ? [] : [`peso: el activo (${a}) no pesa más que el inactivo (${i})`]
}

const BORDE_GENERICO = /borderColor\s*:[^,}]*\bcolores\.border\b/

// ---------------------------------------------------------------------------
// ChipsCategorias
// ---------------------------------------------------------------------------
function problemasChips(fuenteCruda: string): string[] {
  const texto = quitarComentarios(fuenteCruda)
  const out: string[] = []

  const base = /\bchip\s*:\s*\{/.exec(texto)
  if (!base) return ['no hay estilos.chip']
  const baseObj = bloque(texto, base.index + base[0].length - 1)

  const ternario = /\bactivo\s*\?\s*\{/.exec(texto)
  if (!ternario) return ['no hay estilo condicional activo ? {…} : {…}']
  const activoIni = ternario.index + ternario[0].length - 1
  const activoObj = bloque(texto, activoIni)
  const resto = /^\s*:\s*\{/.exec(texto.slice(activoIni + activoObj.length))
  if (!resto) return ['el estilo activo no tiene rama inactiva { … }']
  const inactivoObj = bloque(texto, activoIni + activoObj.length + resto[0].length - 1)

  const bordeA = numero(activoObj, 'borderWidth')
  const bordeI = numero(inactivoObj, 'borderWidth')
  if (bordeA === null || bordeI === null) {
    out.push('borde: falta borderWidth en un estado')
  } else {
    if (bordeA <= bordeI) out.push(`borde: el activo (${bordeA}) no es más grueso que el inactivo (${bordeI})`)
    const padA = numero(activoObj, 'paddingHorizontal') ?? numero(baseObj, 'paddingHorizontal')
    const padI = numero(inactivoObj, 'paddingHorizontal') ?? numero(baseObj, 'paddingHorizontal')
    if (padA === null || padI === null) out.push('ancho: no se pudo leer paddingHorizontal')
    else if (bordeA + padA !== bordeI + padI) {
      out.push(`ancho: el chip salta (activo ${bordeA}+${padA}, inactivo ${bordeI}+${padI})`)
    }
    const padVA = numero(activoObj, 'paddingVertical') ?? numero(baseObj, 'paddingVertical')
    const padVI = numero(inactivoObj, 'paddingVertical') ?? numero(baseObj, 'paddingVertical')
    if (padVA !== null && padVI !== null && bordeA + padVA !== bordeI + padVI) out.push('alto: el chip salta de alto')
  }

  if (BORDE_GENERICO.test(texto)) out.push('colores.border como borde')
  if (!/borderColor\s*:\s*bordeInactivo\b/.test(inactivoObj)) out.push('el borde inactivo no usa bordeInactivo')
  out.push(...problemasPeso(texto, 'activo'))
  return out
}

const CHIPS_VALIDO = `
  style={[
    estilos.chip,
    // comentario: borderWidth: 9
    activo
      ? { backgroundColor: 'x', borderWidth: 2, borderColor: colores.primary, paddingHorizontal: 15, paddingVertical: 9 }
      : { borderWidth: 1, borderColor: bordeInactivo },
  ]}
  <Texto peso={activo ? 'bold' : 'semibold'}>{chip.nombre}</Texto>
  const estilos = StyleSheet.create({
    chip: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, minHeight: 48 },
  })
`

describe('components/ChipsCategorias.tsx (real)', () => {
  const fuente = leer('../components/ChipsCategorias.tsx')

  it('sin problemas: activo más grueso, ancho estable, peso mayor, borde de 3:1', () => {
    expect(problemasChips(fuente)).toEqual([])
  })

  it('borde + padding horizontal iguales en los dos estados (el ancho no salta)', () => {
    const texto = quitarComentarios(fuente)
    const base = /\bchip\s*:\s*\{/.exec(texto)!
    const padBase = numero(bloque(texto, base.index + base[0].length - 1), 'paddingHorizontal')!
    const t = /\bactivo\s*\?\s*\{/.exec(texto)!
    const a = bloque(texto, t.index + t[0].length - 1)
    const iniI = texto.indexOf('{', t.index + t[0].length - 1 + a.length)
    const i = bloque(texto, iniI)
    const anchoActivo = numero(a, 'borderWidth')! + (numero(a, 'paddingHorizontal') ?? padBase)
    const anchoInactivo = numero(i, 'borderWidth')! + (numero(i, 'paddingHorizontal') ?? padBase)
    expect(anchoActivo).toBe(anchoInactivo)
    expect(numero(a, 'borderWidth')!).toBeGreaterThan(numero(i, 'borderWidth')!)
  })
})

describe('detector de ChipsCategorias (fixtures inventados)', () => {
  it('acepta el válido (y no lee los comentarios)', () => {
    expect(problemasChips(CHIPS_VALIDO)).toEqual([])
  })

  it('marca el padding sin compensar (el ancho salta)', () => {
    const p = problemasChips(CHIPS_VALIDO.replace('paddingHorizontal: 15', 'paddingHorizontal: 16'))
    expect(p.some((x) => x.startsWith('ancho'))).toBe(true)
  })

  it('marca el activo sin borde más grueso', () => {
    const p = problemasChips(CHIPS_VALIDO.replace('borderWidth: 2', 'borderWidth: 1').replace('paddingHorizontal: 15', 'paddingHorizontal: 16'))
    expect(p.some((x) => x.startsWith('borde'))).toBe(true)
  })

  it('marca el mismo peso en los dos estados', () => {
    const p = problemasChips(CHIPS_VALIDO.replace("'bold' : 'semibold'", "'semibold' : 'semibold'"))
    expect(p.some((x) => x.startsWith('peso'))).toBe(true)
  })

  it('marca colores.border como borde inactivo', () => {
    const p = problemasChips(CHIPS_VALIDO.replace('borderColor: bordeInactivo', 'borderColor: colores.border'))
    expect(p.some((x) => x.includes('colores.border'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// PillsAtajos
// ---------------------------------------------------------------------------
function problemasPills(fuenteCruda: string): string[] {
  const texto = quitarComentarios(fuenteCruda)
  const out: string[] = []

  if (/!?\s*activo\s*&&\s*\{[^}]*\bborderWidth/.test(texto)) out.push('borde en un solo estado (activo && { borderWidth })')
  const dos = /\bactivo\s*\?\s*\{[^}]*\bborderWidth\s*:\s*(\d+)[^}]*\}\s*:\s*\{[^}]*\bborderWidth\s*:\s*(\d+)/.exec(texto)
  if (dos && dos[1] !== dos[2]) out.push(`borde distinto entre estados (${dos[1]} vs ${dos[2]})`)
  if (!/\bborderWidth\s*:\s*\d+/.test(texto)) out.push('no hay borderWidth')

  if (BORDE_GENERICO.test(texto)) out.push('colores.border como borde')
  if (!/borderColor\s*:\s*activo\s*\?\s*colores\.primary\s*:\s*bordeInactivo\b/.test(texto)) {
    out.push('borderColor: activo => primary, inactivo => bordeInactivo')
  }
  out.push(...problemasPeso(texto, 'activo'))
  return out
}

const PILLS_VALIDO = `
  style={[estilos.pill, { borderWidth: 1, borderColor: activo ? colores.primary : bordeInactivo }]}
  <Texto peso={activo ? 'bold' : 'semibold'}>{item.etiqueta}</Texto>
`

describe('components/PillsAtajos.tsx (real)', () => {
  const fuente = leer('../components/PillsAtajos.tsx')

  it('sin problemas', () => {
    expect(problemasPills(fuente)).toEqual([])
  })

  it('usa bordeChipInactivo de lib/colores', () => {
    expect(quitarComentarios(fuente)).toMatch(/import\s*\{[^}]*\bbordeChipInactivo\b[^}]*\}\s*from\s*['"]@\/lib\/colores['"]/)
  })
})

describe('detector de PillsAtajos (fixtures inventados)', () => {
  it('acepta el válido', () => {
    expect(problemasPills(PILLS_VALIDO)).toEqual([])
  })

  it('marca borde solo en el inactivo (la pill activa se achica)', () => {
    const viejo = `
      style={[estilos.pill, !activo && { borderWidth: 1, borderColor: colores.border }]}
      <Texto peso={activo ? 'bold' : 'semibold'}>x</Texto>
    `
    const p = problemasPills(viejo)
    expect(p.some((x) => x.includes('un solo estado'))).toBe(true)
    expect(p.some((x) => x.includes('colores.border'))).toBe(true)
  })

  it('marca borderWidth distinto entre estados', () => {
    const f = PILLS_VALIDO.replace(
      '{ borderWidth: 1, borderColor: activo ? colores.primary : bordeInactivo }',
      '{ borderColor: activo ? colores.primary : bordeInactivo }, activo ? { borderWidth: 2 } : { borderWidth: 1 }',
    )
    expect(problemasPills(f).some((x) => x.includes('distinto'))).toBe(true)
  })

  it('marca el mismo peso en los dos estados', () => {
    expect(problemasPills(PILLS_VALIDO.replace("'bold'", "'semibold'")).some((x) => x.startsWith('peso'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Buscar: chip "Solo gratis", tiles y botón del vacío
// ---------------------------------------------------------------------------
function problemasBuscar(fuenteCruda: string): string[] {
  const texto = quitarComentarios(fuenteCruda)
  const out: string[] = []
  if (BORDE_GENERICO.test(texto)) out.push('colores.border como borde')
  if (!/\bbordeInactivo\s*=\s*bordeChipInactivo\(\s*colores\s*\)/.test(texto)) out.push('bordeInactivo no sale de bordeChipInactivo(colores)')
  // chip Gratis, tiles de categoría y botón secundario del vacío.
  const usos = texto.match(/borderColor\s*:[^,}]*\bbordeInactivo\b/g) ?? []
  if (usos.length < 3) out.push(`bordeInactivo se usa ${usos.length} veces como borde (se esperan 3: chip, tiles, vacío)`)
  if (!/borderColor\s*:\s*soloGratisActivo\s*\?\s*colores\.primary\s*:\s*bordeInactivo\b/.test(texto)) {
    out.push('chip Gratis: borderColor activo => primary, inactivo => bordeInactivo')
  }
  const chip = /\bchipGratis\s*:\s*\{/.exec(texto)
  if (chip) {
    const estilo = bloque(texto, chip.index + chip[0].length - 1)
    if (numero(estilo, 'borderWidth') === null) out.push('chipGratis sin borderWidth fijo')
  } else out.push('no hay estilos.chipGratis')
  out.push(...problemasPeso(texto, 'soloGratisActivo'))
  return out
}

const BUSCAR_VALIDO = `
  const bordeInactivo = bordeChipInactivo(colores)
  <Pressable style={[estilos.chipGratis, { borderColor: soloGratisActivo ? colores.primary : bordeInactivo }]}>
    <Texto peso={soloGratisActivo ? 'bold' : 'semibold'}>Solo gratis</Texto>
  </Pressable>
  <Pressable style={[estilos.tileCategoria, { backgroundColor: colores.card, borderColor: bordeInactivo }]} />
  <Pressable style={[estilos.botonVacio, indice === 0 ? { borderColor: colores.primary } : { borderColor: bordeInactivo }]} />
  const estilos = StyleSheet.create({ chipGratis: { borderWidth: 1, minHeight: 48 } })
`

describe('app/(tabs)/buscar.tsx (real)', () => {
  it('sin problemas', () => {
    expect(problemasBuscar(leer('../app/(tabs)/buscar.tsx'))).toEqual([])
  })
})

describe('detector de Buscar (fixtures inventados)', () => {
  it('acepta el válido', () => {
    expect(problemasBuscar(BUSCAR_VALIDO)).toEqual([])
  })

  it('marca el chip Gratis con colores.border', () => {
    const p = problemasBuscar(BUSCAR_VALIDO.replace('soloGratisActivo ? colores.primary : bordeInactivo', 'soloGratisActivo ? colores.primary : colores.border'))
    expect(p.some((x) => x.includes('colores.border'))).toBe(true)
  })

  it('marca los tiles o el botón del vacío con colores.border (queda un uso de menos)', () => {
    const p = problemasBuscar(BUSCAR_VALIDO.replace('{ borderColor: bordeInactivo }]} />', '{ borderColor: colores.border }]} />'))
    expect(p.some((x) => x.includes('colores.border'))).toBe(true)
    expect(p.some((x) => x.includes('se usa 2 veces'))).toBe(true)
  })

  it('marca el chip Gratis sin negrita al activarse', () => {
    expect(problemasBuscar(BUSCAR_VALIDO.replace("'bold'", "'semibold'")).some((x) => x.startsWith('peso'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Contraste del borde inactivo (función pura, sin detector de texto)
// ---------------------------------------------------------------------------
describe('bordeChipInactivo: >= 3:1 contra background y card de los dos esquemas', () => {
  const esquemas = [
    ['oscuro', COLORES_OSCURO],
    ['claro', COLORES_CLARO],
  ] as const

  it.each(esquemas)('%s: contra background', (_n, colores) => {
    const r = contraste(bordeChipInactivo(colores), colores.background)
    expect(cumpleContraste(r, 'componente')).toBe(true)
    expect(r).toBeGreaterThanOrEqual(3)
  })

  it.each(esquemas)('%s: contra card', (_n, colores) => {
    const r = contraste(bordeChipInactivo(colores), colores.card)
    expect(cumpleContraste(r, 'componente')).toBe(true)
    expect(r).toBeGreaterThanOrEqual(3)
  })

  it('es mejor que el token border (que no llega a 3:1) y devuelve #rrggbb', () => {
    for (const [, colores] of esquemas) {
      expect(bordeChipInactivo(colores)).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(contraste(colores.border, colores.background)).toBeLessThan(3)
    }
  })

  it('un borde inventado muy cerca del fondo se detecta (la verificación puede fallar)', () => {
    expect(cumpleContraste(contraste('#222222', COLORES_OSCURO.background), 'componente')).toBe(false)
  })
})
