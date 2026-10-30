// R67, 67-q: tests de la tarea 67-b (cabecera fija de la portada: chips de
// categoría arriba y pills de fecha debajo, primer hijo del ScrollView con
// `stickyHeaderIndices={[0]}`; el Hero va debajo; cambiar de chip o de pill
// vuelve el scroll arriba desde el handler). Sin red ni base. La app no monta
// componentes en los tests (entorno `node`, sin DOM) y `app/(tabs)/index.tsx`
// arrastra expo-router y react-native, así que no se importa: detectores por
// texto sobre el fuente sin comentarios, como `tests/portada-cine.test.ts`.
// Cada detector tiene su fixture falso que lo pone en rojo.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const leer = (...partes: string[]) => readFileSync(join(MOBILE_ROOT, ...partes), 'utf8').replace(/\r\n/g, '\n')

/** Comentarios `//` y `/* *\/` a espacios, respetando strings y templates. */
function sinComentarios(fuente: string): string {
  let salida = ''
  let i = 0
  while (i < fuente.length) {
    const c = fuente[i]
    const siguiente = fuente[i + 1]
    if (c === '/' && siguiente === '/') {
      while (i < fuente.length && fuente[i] !== '\n') {
        salida += ' '
        i++
      }
    } else if (c === '/' && siguiente === '*') {
      salida += '  '
      i += 2
      while (i < fuente.length && !(fuente[i] === '*' && fuente[i + 1] === '/')) {
        salida += fuente[i] === '\n' ? '\n' : ' '
        i++
      }
      salida += '  '
      i += 2
    } else if (c === "'" || c === '"') {
      salida += c
      i++
      while (i < fuente.length && fuente[i] !== c && fuente[i] !== '\n') {
        if (fuente[i] === '\\') {
          salida += fuente[i]
          i++
        }
        salida += fuente[i] ?? ''
        i++
      }
      if (i < fuente.length && fuente[i] === c) {
        salida += c
        i++
      }
    } else if (c === '`') {
      salida += c
      i++
      while (i < fuente.length && fuente[i] !== '`') {
        if (fuente[i] === '\\') {
          salida += fuente[i]
          i++
        }
        salida += fuente[i] ?? ''
        i++
      }
      salida += '`'
      i++
    } else {
      salida += c
      i++
    }
  }
  return salida
}

/**
 * Índice del `>` que cierra la etiqueta JSX que arranca en `desde` (un `<`),
 * ignorando los `>` de dentro de llaves (`=>`, `a > 0`) y de strings.
 */
function finDeEtiqueta(texto: string, desde: number): number {
  let llaves = 0
  for (let i = desde + 1; i < texto.length; i++) {
    const c = texto[i]
    if (c === "'" || c === '"' || c === '`') {
      i++
      while (i < texto.length && texto[i] !== c) {
        if (texto[i] === '\\') i++
        i++
      }
    } else if (c === '{') llaves++
    else if (c === '}') llaves--
    else if (c === '>' && llaves === 0) return i
  }
  return -1
}

/** Etiqueta de apertura completa (`<Nombre ... >` o `... />`) o null. */
function etiqueta(texto: string, nombre: string): string | null {
  const re = new RegExp(`<${nombre}\\s`)
  const m = re.exec(texto)
  if (!m) return null
  const fin = finDeEtiqueta(texto, m.index)
  return fin < 0 ? null : texto.slice(m.index, fin + 1)
}

/** Cuerpo de una llamada `nombre(` hasta su paréntesis de cierre (sin incluirlo). */
function llamada(texto: string, inicio: number): string {
  let prof = 0
  for (let i = texto.indexOf('(', inicio); i < texto.length; i++) {
    const c = texto[i]
    if (c === "'" || c === '"' || c === '`') {
      i++
      while (i < texto.length && texto[i] !== c) {
        if (texto[i] === '\\') i++
        i++
      }
    } else if (c === '(') prof++
    else if (c === ')') {
      prof--
      if (prof === 0) return texto.slice(inicio, i)
    }
  }
  return texto.slice(inicio)
}

interface Cabecera {
  apertura: string
  /** Texto completo de la cabecera, de `<View` a `</View>`. */
  texto: string
  /** Índice (en el fuente) donde termina la cabecera. */
  fin: number
}

/**
 * Primer hijo JSX del `<ScrollView` de la portada: salta el `>` de la apertura
 * (el `refreshControl` es una prop, queda dentro de la etiqueta) y las
 * expresiones vacías `{ }` que deja un comentario JSX al quitarlo. Si ese
 * primer hijo no es una `<View`, devuelve el motivo.
 */
function primerHijo(codigo: string): { cabecera: Cabecera } | { motivo: string } {
  // `\s` después del nombre: `useRef<ScrollView>(null)` no es la etiqueta.
  const ini = codigo.search(/<ScrollView\s/)
  if (ini < 0) return { motivo: 'no hay <ScrollView' }
  const finApertura = finDeEtiqueta(codigo, ini)
  if (finApertura < 0) return { motivo: 'no se cierra la etiqueta de apertura del ScrollView' }
  let pos = finApertura + 1
  for (;;) {
    const resto = codigo.slice(pos)
    const vacio = /^\s*(?:\{\s*\}\s*)?/.exec(resto)![0]
    if (vacio.length === 0) break
    pos += vacio.length
    if (!/^\{\s*\}/.test(codigo.slice(pos))) break
  }
  const desdeHijo = codigo.slice(pos)
  if (!/^<View(?![A-Za-z0-9])/.test(desdeHijo)) {
    return { motivo: `el primer hijo del ScrollView no es una <View (empieza con "${desdeHijo.slice(0, 24).replace(/\s+/g, ' ')}")` }
  }
  // Cierre de esa View: cuenta aperturas y cierres de <View, brace-aware.
  const apertura = codigo.slice(pos, finDeEtiqueta(codigo, pos) + 1)
  let prof = 0
  let i = pos
  const re = /<View(?![A-Za-z0-9])|<\/View>/g
  re.lastIndex = pos
  for (let m = re.exec(codigo); m; m = re.exec(codigo)) {
    i = m.index
    if (m[0] === '</View>') {
      prof--
      if (prof === 0) return { cabecera: { apertura, texto: codigo.slice(pos, i + 7), fin: i + 7 } }
    } else {
      const fin = finDeEtiqueta(codigo, i)
      if (codigo[fin - 1] !== '/') prof++
      re.lastIndex = fin + 1
    }
  }
  return { motivo: 'la View de la cabecera no se cierra' }
}

/** Violaciones de `stickyHeaderIndices` en el ScrollView de la portada. */
function violacionesSticky(codigo: string): string[] {
  const tag = etiqueta(codigo, 'ScrollView')
  if (tag === null) return ['no hay <ScrollView']
  return /\bstickyHeaderIndices=\{\[0\]\}/.test(tag) ? [] : ['el ScrollView no lleva stickyHeaderIndices={[0]}']
}

/**
 * Violaciones de la cabecera: no condicional, fondo opaco, el botón «Filtros»
 * antes que las pills (R81, 81-a: una sola fila; antes, chips y pills). Que sea
 * UNA fila lo mira `tests/portada-filtros.test.ts`.
 */
function violacionesCabecera(codigo: string): string[] {
  const r = primerHijo(codigo)
  if ('motivo' in r) return [r.motivo]
  const { apertura, texto } = r.cabecera
  const v: string[] = []
  if (!/\bbackgroundColor:\s*colores\.background\b/.test(apertura)) v.push('la cabecera no tiene backgroundColor: colores.background')
  const boton = texto.indexOf('<BotonFiltros')
  const pills = texto.indexOf('<PillsAtajos')
  if (boton < 0) v.push('la cabecera no tiene <BotonFiltros')
  if (pills < 0) v.push('la cabecera no tiene <PillsAtajos')
  if (boton >= 0 && pills >= 0 && boton > pills) v.push('las pills van antes que el botón Filtros (tiene que ir primero)')
  return v
}

/** Violaciones del lugar del Hero: solo después de la cabecera. */
function violacionesHero(codigo: string): string[] {
  const r = primerHijo(codigo)
  if ('motivo' in r) return [r.motivo]
  const v: string[] = []
  const { fin } = r.cabecera
  const heros = [...codigo.matchAll(/<Hero(?![A-Za-z0-9])/g)].map((m) => m.index!)
  if (heros.length === 0) return ['no hay <Hero']
  if (heros.some((i) => i < fin)) v.push('hay un <Hero antes del cierre de la cabecera')
  if (!heros.some((i) => i > fin)) v.push('no hay un <Hero después de la cabecera')
  const pills = codigo.indexOf('<PillsAtajos')
  if (pills >= 0 && heros.some((i) => i < pills)) v.push('el <Hero aparece antes de <PillsAtajos')
  return v
}

/** Cuerpo de `const <nombre> = useCallback(` o null. */
function handler(codigo: string, nombre: string): string | null {
  const m = new RegExp(`const ${nombre} = useCallback\\(`).exec(codigo)
  return m ? llamada(codigo, m.index) : null
}

/** Violaciones de los handlers, su conexión y la ausencia de scrollTo en efectos. */
function violacionesHandlers(codigo: string): string[] {
  const v: string[] = []
  for (const [nombre, setter] of [
    ['cambiarAtajo', 'setAtajo'],
    ['cambiarCategoria', 'setCategoria'],
  ] as const) {
    const cuerpo = handler(codigo, nombre)
    if (cuerpo === null) {
      v.push(`no existe el handler ${nombre}`)
      continue
    }
    if (!new RegExp(`\\b${setter}\\(`).test(cuerpo)) v.push(`${nombre} no llama ${setter}(`)
    if (!/\.scrollTo\(\s*\{[^}]*\by:\s*0\b/.test(cuerpo)) v.push(`${nombre} no llama scrollTo({ y: 0 })`)
  }
  // R81, 81-a: las categorías se eligen en la hoja de filtros.
  const hoja = etiqueta(codigo, 'HojaFiltros')
  if (hoja === null) v.push('no hay <HojaFiltros')
  else if (!/\bonCambiarCategoria=\{cambiarCategoria\}/.test(hoja)) v.push('onCambiarCategoria de HojaFiltros no es cambiarCategoria')
  const pills = etiqueta(codigo, 'PillsAtajos')
  if (pills === null) v.push('no hay <PillsAtajos')
  else if (!/\bonCambiar=\{cambiarAtajo\}/.test(pills)) v.push('onCambiar de PillsAtajos no es cambiarAtajo')
  for (const m of codigo.matchAll(/\buseEffect\(/g)) {
    if (/\bscrollTo\b/.test(llamada(codigo, m.index!))) v.push('hay un useEffect que llama scrollTo')
  }
  return v
}

const ruta = ['app', '(tabs)', 'index.tsx']
const codigo = sinComentarios(leer(...ruta))

// ---------------------------------------------------------------------------
// 0. Guarda del scanner y de los auxiliares
// ---------------------------------------------------------------------------
describe('los auxiliares de este archivo (guarda)', () => {
  it('un comentario que nombra stickyHeaderIndices o scrollTo no cuenta', () => {
    const limpio = sinComentarios('// stickyHeaderIndices={[0]}\n{/* x.scrollTo({ y: 0 }) */}<ScrollView>')
    expect(limpio).not.toContain('stickyHeaderIndices')
    expect(limpio).not.toContain('scrollTo')
  })

  it('finDeEtiqueta ignora el > de => y de comparaciones dentro de llaves', () => {
    const t = '<A x={() => 1} y={a > 0 ? 1 : 2} z="a>b">hijo</A>'
    expect(t.slice(0, finDeEtiqueta(t, 0) + 1)).toBe('<A x={() => 1} y={a > 0 ? 1 : 2} z="a>b">')
  })

  it('el comentario JSX que antecede a la cabecera (queda como `{ }`) se salta', () => {
    const r = primerHijo(sinComentarios('<ScrollView a={1}>\n{/* nota */}\n<View style={{ backgroundColor: colores.background }}><ChipsCategorias/></View></ScrollView>'))
    expect('cabecera' in r).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 1. stickyHeaderIndices
// ---------------------------------------------------------------------------
describe('1. el ScrollView de la portada lleva stickyHeaderIndices={[0]}', () => {
  it('el fuente real lo tiene', () => {
    expect(violacionesSticky(codigo)).toEqual([])
  })

  describe('fixtures falsos', () => {
    it('sin la prop', () => {
      const roto = codigo.replace('stickyHeaderIndices={[0]}', '')
      expect(violacionesSticky(roto)).toEqual(['el ScrollView no lleva stickyHeaderIndices={[0]}'])
    })
    it('con otro índice', () => {
      const roto = codigo.replace('stickyHeaderIndices={[0]}', 'stickyHeaderIndices={[1]}')
      expect(violacionesSticky(roto)).toHaveLength(1)
    })
    it('la prop solo en un comentario', () => {
      const roto = sinComentarios(leer(...ruta).replace('\n          stickyHeaderIndices={[0]}\n', '\n          /* stickyHeaderIndices={[0]} */\n'))
      expect(roto).not.toContain('stickyHeaderIndices')
      expect(violacionesSticky(roto)).toHaveLength(1)
    })
  })
})

// ---------------------------------------------------------------------------
// 2. La cabecera
// ---------------------------------------------------------------------------
describe('2. el primer hijo del ScrollView es la cabecera (botón Filtros y pills, en una fila)', () => {
  it('el fuente real: View no condicional, con fondo opaco, botón Filtros y luego pills', () => {
    expect(violacionesCabecera(codigo)).toEqual([])
  })

  const APERTURA = '<View style={[estilos.cabecera, { backgroundColor: colores.background, borderBottomColor: colores.border }]}>'

  describe('fixtures falsos', () => {
    it('la fuente tiene la apertura que los fixtures reemplazan', () => {
      expect(codigo).toContain(APERTURA)
    })
    it('la cabecera detrás de un {estado.desdeCache ? …}', () => {
      const roto = codigo.replace(APERTURA, `{estado.desdeCache ? ${APERTURA}`)
      expect(violacionesCabecera(roto)[0]).toContain('no es una <View')
    })
    it('la cabecera detrás de un && ', () => {
      const roto = codigo.replace(APERTURA, `{categoria === null && ${APERTURA}`)
      expect(violacionesCabecera(roto)[0]).toContain('no es una <View')
    })
    it('el primer hijo es otra cosa (el Hero) y la cabecera va segunda', () => {
      const roto = codigo.replace(APERTURA, `<Hero eventos={[]} />\n${APERTURA}`)
      expect(violacionesCabecera(roto)[0]).toContain('no es una <View')
      expect(violacionesHero(roto)[0]).toContain('no es una <View')
    })
    it('sin fondo', () => {
      const roto = codigo.replace(APERTURA, '<View style={estilos.cabecera}>')
      expect(violacionesCabecera(roto)).toEqual(['la cabecera no tiene backgroundColor: colores.background'])
    })
    it('con un fondo que no es colores.background', () => {
      const roto = codigo.replace(APERTURA, '<View style={[estilos.cabecera, { backgroundColor: "transparent" }]}>')
      expect(violacionesCabecera(roto)).toEqual(['la cabecera no tiene backgroundColor: colores.background'])
    })
    it('las pills antes que el botón Filtros', () => {
      const roto = codigo
        .replace('<BotonFiltros', '<__X')
        .replace('<PillsAtajos', '<BotonFiltros')
        .replace('<__X', '<PillsAtajos')
      expect(violacionesCabecera(roto)).toEqual(['las pills van antes que el botón Filtros (tiene que ir primero)'])
    })
    it('sin el botón Filtros en la cabecera', () => {
      const roto = codigo.replace('<BotonFiltros', '<OtraCosa')
      expect(violacionesCabecera(roto)).toEqual(['la cabecera no tiene <BotonFiltros'])
    })
    it('sin pills en la cabecera', () => {
      const roto = codigo.replace('<PillsAtajos', '<OtraCosa')
      expect(violacionesCabecera(roto)).toEqual(['la cabecera no tiene <PillsAtajos'])
    })
  })
})

// ---------------------------------------------------------------------------
// 3. El Hero va debajo
// ---------------------------------------------------------------------------
describe('3. <Hero aparece después del cierre de la cabecera', () => {
  it('el fuente real', () => {
    expect(violacionesHero(codigo)).toEqual([])
  })

  describe('fixtures falsos', () => {
    it('el Hero dentro de la cabecera, antes de las pills', () => {
      const roto = codigo.replace('<PillsAtajos', '<Hero eventos={[]} />\n<PillsAtajos')
      expect(violacionesHero(roto)).toContain('hay un <Hero antes del cierre de la cabecera')
    })
    it('el Hero antes de la cabecera', () => {
      const roto = codigo.replace('<View style={[estilos.cabecera,', '<Hero eventos={[]} />\n<View style={[estilos.cabecera,')
      expect(violacionesHero(roto).length).toBeGreaterThan(0)
    })
    it('sin Hero', () => {
      const roto = codigo.replace(/<Hero(?![A-Za-z0-9])/g, '<Otro')
      expect(violacionesHero(roto)).toEqual(['no hay <Hero'])
    })
  })
})

// ---------------------------------------------------------------------------
// 4. Handlers: setState + scrollTo({ y: 0 }), conectados, sin efecto
// ---------------------------------------------------------------------------
describe('4. cambiarAtajo y cambiarCategoria hacen setState y vuelven arriba', () => {
  it('el fuente real', () => {
    expect(violacionesHandlers(codigo)).toEqual([])
  })

  describe('fixtures falsos', () => {
    it('onCambiarCategoria de la hoja con el setter directo', () => {
      const roto = codigo.replace('onCambiarCategoria={cambiarCategoria}', 'onCambiarCategoria={setCategoria}')
      expect(violacionesHandlers(roto)).toEqual(['onCambiarCategoria de HojaFiltros no es cambiarCategoria'])
    })
    it('onCambiar de las pills con el setter directo', () => {
      const roto = codigo.replace('onCambiar={cambiarAtajo}', 'onCambiar={setAtajo}')
      expect(violacionesHandlers(roto)).toEqual(['onCambiar de PillsAtajos no es cambiarAtajo'])
    })
    it('onCambiar cruzado', () => {
      const roto = codigo.replace('onCambiar={cambiarAtajo}', 'onCambiar={cambiarCategoria}')
      expect(violacionesHandlers(roto)).toEqual(['onCambiar de PillsAtajos no es cambiarAtajo'])
    })
    it('cambiarAtajo sin scrollTo', () => {
      const roto = codigo.replace(/(const cambiarAtajo = useCallback\(\(nuevo: Atajo\) => \{\s*setAtajo\(nuevo\)\s*)scrollRef\.current\?\.scrollTo\(\{ y: 0, animated: false \}\)/, '$1')
      expect(violacionesHandlers(roto)).toEqual(['cambiarAtajo no llama scrollTo({ y: 0 })'])
    })
    it('cambiarCategoria con scrollTo a otro y', () => {
      const roto = codigo.replace(/(setCategoria\(nueva\)\s*scrollRef\.current\?\.scrollTo\(\{ y: )0/, '$1120')
      expect(violacionesHandlers(roto)).toEqual(['cambiarCategoria no llama scrollTo({ y: 0 })'])
    })
    it('cambiarCategoria sin el setState', () => {
      const roto = codigo.replace('setCategoria(nueva)', '')
      expect(violacionesHandlers(roto)).toEqual(['cambiarCategoria no llama setCategoria('])
    })
    it('un handler que desaparece', () => {
      const roto = codigo.replace('const cambiarAtajo = useCallback(', 'const otroNombre = useCallback(')
      expect(violacionesHandlers(roto)).toContain('no existe el handler cambiarAtajo')
    })
    it('el scrollTo en un useEffect', () => {
      const roto = codigo.replace(
        'const cargar = useCallback(',
        'useEffect(() => {\n    scrollRef.current?.scrollTo({ y: 0, animated: false })\n  }, [atajo, categoria])\n  const cargar = useCallback(',
      )
      expect(violacionesHandlers(roto)).toEqual(['hay un useEffect que llama scrollTo'])
    })
  })
})

// ---------------------------------------------------------------------------
// 5. Abrir una película no vuelve arriba
// ---------------------------------------------------------------------------
describe('5. TarjetaPelicula y BloqueCine no llaman scrollTo', () => {
  const tarjeta = sinComentarios(leer('components', 'TarjetaPelicula.tsx'))
  const bloque = sinComentarios(leer('components', 'BloqueCine.tsx'))

  it('ninguno de los dos nombra scrollTo', () => {
    expect(tarjeta).not.toMatch(/\bscrollTo\b/)
    expect(bloque).not.toMatch(/\bscrollTo\b/)
  })

  it('fixture falso: un scrollTo en la tarjeta se ve', () => {
    const roto = `${tarjeta}\nscrollRef.current?.scrollTo({ y: 0 })`
    expect(roto).toMatch(/\bscrollTo\b/)
  })

  it('un scrollTo solo en un comentario no cuenta', () => {
    expect(sinComentarios('// scrollTo({ y: 0 })\nconst a = 1')).not.toMatch(/\bscrollTo\b/)
  })
})
