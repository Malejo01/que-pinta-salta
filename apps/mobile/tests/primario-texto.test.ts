// 49-b (QPS-241, grupo 2, decisión de Mauro — "no usar `primary` para texto
// chico"): detector estático que impide que ese uso vuelva. `primary` sigue
// valiendo para íconos, bordes, rellenos de componentes y el
// `RefreshControl` — lo prohibido es como COLOR DE TEXTO CHICO, porque da
// 3,83 sobre `background` y 3,65 sobre `card` (ver
// `tests/contraste.test.ts`, PARES: los dos pasaron a `'texto-grande'`,
// abajo del mínimo de 4,5 de `'texto'`).
//
// Tres formas de uso que recorre `app/**` y `components/**`:
//   1. `tono="primario"` / `tono={'primario'}` en cualquier componente.
//   2. `color: colores.primary` (o `colors.primary`, `c.primary`) dentro del
//      `style` de un `<Texto`/`<Text`, o en una clave de `StyleSheet.create`
//      (o un objeto de estilo suelto) cuyo nombre empieza con `texto` o
//      `etiqueta`.
//   3. `tabBarActiveTintColor: colores.primary`.
//
// Mismo criterio de saneado de comentarios que `sinComentarios` de
// `tests/hero.test.ts` y `quitarComentarios` de `tests/colores-texto.test.ts`
// — copiado acá (no importado: QPS-250, importar un `*.test.ts` desde otro
// duplica sus tests en silencio) porque este archivo no necesita nada más
// de esos dos.
//
// EXCEPCIONES (vacía hoy): la única que esta tarea permite es texto GRANDE
// (≥ 24 px, o ≥ 18,66 px en negrita — la letra "grande" de WCAG 2.x, donde
// el mínimo de contraste baja a 3, que `primary` sí cumple: 3,83 y 3,65).
// Si algún día aparece un texto así con `primary`, se agrega acá con su
// archivo, línea y el tamaño que lo justifica — nunca "porque sí".
//
// PENDIENTES (línea de base, mismo patrón que `tests/a11y/pendientes-*.ts`):
// hallazgos reales que este detector encuentra HOY fuera del alcance de
// 49-b (archivos que esta tarea no tiene permiso de tocar). Solo puede
// BAJAR — si alguien arregla el archivo sin bajar el número acá, el test
// falla a propósito, para que la lista no quede vieja.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const APP_DIR = join(MOBILE_ROOT, 'app')
const COMPONENTS_DIR = join(MOBILE_ROOT, 'components')

function listarTsxYTs(root: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(root)) {
    const full = join(root, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      out.push(...listarTsxYTs(full))
    } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

/** Mismo stripper línea por línea que `sinComentarios`/`quitarComentarios`
 * de `tests/hero.test.ts` y `tests/colores-texto.test.ts` (copiado, no
 * importado — ver el comentario de cabecera, QPS-250): conserva el número
 * de líneas (blanquea el contenido de los comentarios) para que los índices
 * de línea de los detectores de abajo sigan siendo los del archivo real. */
function quitarComentarios(content: string): string {
  const lineasDeTexto = content.split('\n')
  const resultado: string[] = []
  let dentroDeBloqueComentario = false

  for (let linea of lineasDeTexto) {
    if (dentroDeBloqueComentario) {
      const finBloque = linea.indexOf('*/')
      if (finBloque === -1) {
        resultado.push('')
        continue
      }
      linea = linea.slice(finBloque + 2)
      dentroDeBloqueComentario = false
    }

    const inicioBloque = linea.indexOf('/*')
    if (inicioBloque !== -1 && linea.indexOf('*/', inicioBloque + 2) === -1) {
      linea = linea.slice(0, inicioBloque)
      dentroDeBloqueComentario = true
    }

    const idxComentarioDeLinea = linea.search(/(^|\s)\/\//)
    resultado.push(idxComentarioDeLinea === -1 ? linea : linea.slice(0, idxComentarioDeLinea))
  }

  return resultado.join('\n')
}

/** Línea (1-based) del índice `index` en `content`. */
function lineaDe(content: string, index: number): number {
  let linea = 1
  for (let i = 0; i < index && i < content.length; i++) {
    if (content[i] === '\n') linea++
  }
  return linea
}

/**
 * Lee la etiqueta de apertura de un tocable JSX a partir de `inicio` (el
 * índice de su "<"): copia reducida de `leerEtiquetaApertura` de
 * `tests/accesibilidad-detector.test.ts` (no importada — mismo motivo que
 * `quitarComentarios`, QPS-250). Cuenta `{`/`}` para no cortar en el primer
 * ">" que viene de un `style={({ pressed }) => [...]}` o similar.
 */
function leerEtiquetaApertura(content: string, inicio: number): string {
  let profundidad = 0
  for (let i = inicio; i < content.length; i++) {
    const c = content[i]
    if (c === '{') profundidad++
    else if (c === '}') profundidad--
    else if (c === '>' && profundidad <= 0) return content.slice(inicio, i + 1)
  }
  return content.slice(inicio)
}

/**
 * El bloque `{ ... }` balanceado que arranca en `inicioLlave` (el índice del
 * "{" de apertura): cuenta profundidad, así que un objeto con otro objeto
 * adentro (anidado) se lee completo, no solo hasta el primer "}".
 */
function leerBloqueBalanceado(content: string, inicioLlave: number): string {
  let profundidad = 0
  for (let i = inicioLlave; i < content.length; i++) {
    const c = content[i]
    if (c === '{') profundidad++
    else if (c === '}') {
      profundidad--
      if (profundidad === 0) return content.slice(inicioLlave, i + 1)
    }
  }
  return content.slice(inicioLlave)
}

/**
 * El valor de `nombreAtributo={...}` dentro de `texto` (típicamente una
 * etiqueta de apertura ya extraída con `leerEtiquetaApertura`): el bloque
 * `{...}` balanceado, y el índice (relativo a `texto`) donde arranca ese
 * `{`. `null` si el atributo no está, o no usa `{` (p. ej. un string
 * literal `style="x"`, que no existe en RN pero se cubre igual).
 */
function extraerValorDeAtributo(texto: string, nombreAtributo: string): { valor: string; inicio: number } | null {
  const re = new RegExp(`\\b${nombreAtributo}\\s*=\\s*\\{`)
  const m = re.exec(texto)
  if (!m) return null
  const inicioLlave = m.index + m[0].length - 1
  return { valor: leerBloqueBalanceado(texto, inicioLlave), inicio: inicioLlave }
}

/** `color: colores.primary` / `color: colors.primary` / `color: c.primary`,
 * con límite de palabra en los dos lados (no confunde `backgroundColor:`,
 * `borderColor:`, ni `colores.primaryForeground`). */
const RE_COLOR_PRIMARY = /\bcolor:\s*(?:colores|colors|c)\.primary\b/

// ---------------------------------------------------------------------------
// 1. tono="primario" / tono={'primario'}
// ---------------------------------------------------------------------------
export function lineasConTonoPrimario(content: string): number[] {
  const limpio = quitarComentarios(content)
  const re = /\btono\s*=\s*(?:"primario"|'primario'|\{\s*(?:"primario"|'primario')\s*\})/g
  const resultado: number[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(limpio))) resultado.push(lineaDe(limpio, m.index))
  return resultado
}

// ---------------------------------------------------------------------------
// 2. tabBarActiveTintColor: colores.primary
// ---------------------------------------------------------------------------
export function lineasConTabBarActiveTintColorPrimary(content: string): number[] {
  const limpio = quitarComentarios(content)
  const re = /\btabBarActiveTintColor\s*:\s*(?:colores|colors|c)\.primary\b/g
  const resultado: number[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(limpio))) resultado.push(lineaDe(limpio, m.index))
  return resultado
}

// ---------------------------------------------------------------------------
// 3a. color: colores.primary dentro del style de un <Texto/<Text.
//
// LÍMITE CONOCIDO: solo mira el `style={...}` escrito LITERALMENTE dentro de
// la etiqueta de apertura. Un color armado en una variable intermedia
// (`const estiloMalo = { color: colores.primary }; <Texto style={estiloMalo}>`)
// o un `style` importado de otro archivo no se detecta: el texto
// "colores.primary" no aparece dentro de la etiqueta. Tampoco entra un
// `<Text` que venga de un alias de import (`import { Text as T }`) ni un
// componente envoltorio que renderice `<Text>` por dentro sin llamarse
// `Texto`/`Text` en el JSX de este archivo.
// ---------------------------------------------------------------------------
export function lineasConColorPrimarioEnEtiquetaDeTexto(content: string): number[] {
  const limpio = quitarComentarios(content)
  const resultado: number[] = []
  const reTag = /<(Texto|Text)\b/g
  let m: RegExpExecArray | null
  while ((m = reTag.exec(limpio))) {
    const apertura = leerEtiquetaApertura(limpio, m.index)
    const style = extraerValorDeAtributo(apertura, 'style')
    if (!style) continue
    const colorMatch = RE_COLOR_PRIMARY.exec(style.valor)
    if (colorMatch) resultado.push(lineaDe(limpio, m.index + style.inicio + colorMatch.index))
  }
  return resultado
}

// ---------------------------------------------------------------------------
// 3b. color: colores.primary en una clave de StyleSheet.create (u objeto de
// estilo suelto) cuyo nombre empieza con "texto" o "etiqueta".
//
// LÍMITE CONOCIDO: depende de la CONVENCIÓN de nombres de esta app (ver el
// comentario de cabecera), no de qué hace la clave de verdad. Una clave que
// en realidad estiliza texto pero no se llama "textoAlgo"/"etiquetaAlgo"
// (p. ej. "linkVerTodos: { color: colores.primary }") no se detecta — este
// caso no existe hoy en `app/`/`components/` (barrido manual, 49-b), pero
// nada impide que aparezca en una tarea futura.
// ---------------------------------------------------------------------------
export function lineasConColorPrimarioEnClaveDeEstilo(content: string): number[] {
  const limpio = quitarComentarios(content)
  const resultado: number[] = []
  const reClave = /\b((?:texto|etiqueta)\w*)\s*:\s*\{/g
  let m: RegExpExecArray | null
  while ((m = reClave.exec(limpio))) {
    const inicioLlave = m.index + m[0].length - 1
    const bloque = leerBloqueBalanceado(limpio, inicioLlave)
    const colorMatch = RE_COLOR_PRIMARY.exec(bloque)
    if (colorMatch) resultado.push(lineaDe(limpio, inicioLlave + colorMatch.index))
  }
  return resultado
}

/** Las dos formas de "2." juntas, ordenadas y sin repetidos (una misma
 * línea podría, en teoría, matchear las dos — no pasa hoy, pero el `Set`
 * evita contarla dos veces si algún día pasa). */
export function lineasConColorPrimarioComoTexto(content: string): number[] {
  const todas = new Set([...lineasConColorPrimarioEnEtiquetaDeTexto(content), ...lineasConColorPrimarioEnClaveDeEstilo(content)])
  return [...todas].sort((a, b) => a - b)
}

export type ReglaPrimarioTexto = 'tono-primario' | 'color-en-texto' | 'tab-bar-activo'

export interface HallazgoPrimarioTexto {
  linea: number
  regla: ReglaPrimarioTexto
}

/** Los hallazgos de las tres reglas, ordenados por línea. */
export function hallazgosPrimarioTexto(content: string): HallazgoPrimarioTexto[] {
  const resultado: HallazgoPrimarioTexto[] = []
  for (const linea of lineasConTonoPrimario(content)) resultado.push({ linea, regla: 'tono-primario' })
  for (const linea of lineasConColorPrimarioComoTexto(content)) resultado.push({ linea, regla: 'color-en-texto' })
  for (const linea of lineasConTabBarActiveTintColorPrimary(content)) resultado.push({ linea, regla: 'tab-bar-activo' })
  return resultado.sort((a, b) => a.linea - b.linea)
}

// ===========================================================================
// Fixtures en memoria: cada detector, probado a que falle de verdad, con un
// caso que PASA (primary en ícono/borde/RefreshControl: nunca se marca) y
// uno de cada forma que FALLA.
// ===========================================================================

describe('lineasConTonoPrimario (fixtures en memoria)', () => {
  it('detecta tono="primario"', () => {
    expect(lineasConTonoPrimario(`<Texto tono="primario">Ver todos</Texto>`)).toEqual([1])
  })

  it('detecta tono={\'primario\'}', () => {
    expect(lineasConTonoPrimario(`<Texto tono={'primario'}>Ver todos</Texto>`)).toEqual([1])
  })

  it('no confunde tono="secundario" ni tono="texto"', () => {
    expect(lineasConTonoPrimario(`<Texto tono="secundario">x</Texto>\n<Texto tono="texto">y</Texto>`)).toEqual([])
  })

  it('no confunde un comentario que menciona tono="primario"', () => {
    expect(lineasConTonoPrimario(`// antes era tono="primario", ahora foreground`)).toEqual([])
  })

  it('línea correcta cuando no está en la primera línea', () => {
    const fixture = `import { Texto } from '@/components/Texto'\n\nexport function X() {\n  return <Texto tono="primario">Ver todos</Texto>\n}`
    expect(lineasConTonoPrimario(fixture)).toEqual([4])
  })
})

describe('lineasConTabBarActiveTintColorPrimary (fixtures en memoria)', () => {
  it('detecta tabBarActiveTintColor: colores.primary', () => {
    expect(lineasConTabBarActiveTintColorPrimary(`tabBarActiveTintColor: colores.primary,`)).toEqual([1])
  })

  it('detecta la variante colors.primary', () => {
    expect(lineasConTabBarActiveTintColorPrimary(`tabBarActiveTintColor: colors.primary,`)).toEqual([1])
  })

  it('no confunde tabBarActiveTintColor: colores.foreground (el arreglo real de 49-c)', () => {
    expect(lineasConTabBarActiveTintColorPrimary(`tabBarActiveTintColor: colores.foreground,`)).toEqual([])
  })
})

describe('lineasConColorPrimarioEnEtiquetaDeTexto (fixtures en memoria)', () => {
  it('detecta color: colores.primary en el style de <Texto', () => {
    const fixture = `<Texto peso="semibold" style={{ color: colores.primary }}>\n  Abrir Ajustes\n</Texto>`
    expect(lineasConColorPrimarioEnEtiquetaDeTexto(fixture)).toEqual([1])
  })

  it('detecta la variante colors.primary en <Text (el crudo de react-native)', () => {
    const fixture = `<Text style={{ color: colors.primary }}>x</Text>`
    expect(lineasConColorPrimarioEnEtiquetaDeTexto(fixture)).toEqual([1])
  })

  it('detecta c.primary dentro de un style armado como arreglo, dentro de la MISMA etiqueta', () => {
    const fixture = `<Texto style={[estilos.base, { color: c.primary }]}>x</Texto>`
    expect(lineasConColorPrimarioEnEtiquetaDeTexto(fixture)).toEqual([1])
  })

  it('no confunde colores.primaryForeground (otro token, no "primary" solo)', () => {
    expect(lineasConColorPrimarioEnEtiquetaDeTexto(`<Texto style={{ color: colores.primaryForeground }}>x</Texto>`)).toEqual([])
  })

  it('no confunde primary en un ícono dentro del mismo archivo (no es <Texto/<Text)', () => {
    expect(lineasConColorPrimarioEnEtiquetaDeTexto(`<Icono nombre="Star" color={colores.primary} />`)).toEqual([])
  })

  it('no confunde primary como borde de un <Texto (no es "color:", es "borderColor:")', () => {
    expect(lineasConColorPrimarioEnEtiquetaDeTexto(`<Texto style={{ borderColor: colores.primary }}>x</Texto>`)).toEqual([])
  })

  it('no confunde <TextInput (no es <Text ni <Texto: el límite de palabra no corta ahí)', () => {
    expect(lineasConColorPrimarioEnEtiquetaDeTexto(`<TextInput style={{ color: colores.primary }} />`)).toEqual([])
  })

  it('no confunde un comentario que menciona el patrón', () => {
    expect(lineasConColorPrimarioEnEtiquetaDeTexto(`// <Texto style={{ color: colores.primary }}>`)).toEqual([])
  })

  it('LÍMITE CONOCIDO: un style armado en una variable intermedia no se detecta', () => {
    // El texto "colores.primary" no está dentro de la etiqueta de apertura
    // de <Texto (está en la declaración de `estiloMalo`, dos líneas antes):
    // este detector, que solo mira lo escrito LITERALMENTE en el JSX, no lo
    // ve. Documentado a propósito (no se tapa): ver el comentario de la
    // función.
    const fixture = `const estiloMalo = { color: colores.primary }\n<Texto style={estiloMalo}>x</Texto>`
    expect(lineasConColorPrimarioEnEtiquetaDeTexto(fixture)).toEqual([])
  })
})

describe('lineasConColorPrimarioEnClaveDeEstilo (fixtures en memoria)', () => {
  it('detecta color: colores.primary en una clave "textoXxx" de StyleSheet.create', () => {
    const fixture = `const estilos = StyleSheet.create({\n  textoVerTodos: { fontSize: 14, color: colores.primary },\n})`
    expect(lineasConColorPrimarioEnClaveDeEstilo(fixture)).toEqual([2])
  })

  it('detecta una clave "etiquetaXxx"', () => {
    const fixture = `const estilos = { etiquetaPronto: { color: colors.primary, fontSize: 11 } }`
    expect(lineasConColorPrimarioEnClaveDeEstilo(fixture)).toEqual([1])
  })

  it('no confunde una clave que no empieza con "texto"/"etiqueta" (p. ej. "titulo")', () => {
    const fixture = `const estilos = StyleSheet.create({ titulo: { fontSize: 20, color: colores.primary } })`
    expect(lineasConColorPrimarioEnClaveDeEstilo(fixture)).toEqual([])
  })

  it('no confunde una clave "textoXxx" sin primary (otro token)', () => {
    const fixture = `const estilos = StyleSheet.create({ textoChico: { fontSize: 11, color: colores.mutedForeground } })`
    expect(lineasConColorPrimarioEnClaveDeEstilo(fixture)).toEqual([])
  })

  it('bloque anidado: no corta en el primer "}" interno', () => {
    const fixture = `const estilos = StyleSheet.create({\n  textoRaro: { sombra: { color: '#000' }, color: colores.primary },\n})`
    expect(lineasConColorPrimarioEnClaveDeEstilo(fixture)).toEqual([2])
  })

  it('LÍMITE CONOCIDO: una clave de texto con otro nombre (sin "texto"/"etiqueta" al frente) no se detecta', () => {
    // Documentado a propósito (ver el comentario de la función): este caso
    // no existe hoy en app/ ni components/ (barrido manual, 49-b).
    const fixture = `const estilos = StyleSheet.create({ linkVerTodos: { color: colores.primary } })`
    expect(lineasConColorPrimarioEnClaveDeEstilo(fixture)).toEqual([])
  })
})

describe('hallazgosPrimarioTexto: primary en ícono, borde y RefreshControl NUNCA se marca (fixture real, el patrón de 29-h/27-b)', () => {
  it('ninguno de los tres', () => {
    const fixture = `
      <Icono nombre={iconoPorCategoria(categoria)} tamanio={20} color={colores.primary} />
      <View style={[estilos.pildoraSeccion, { backgroundColor: \`\${colores.primary}0D\`, borderColor: \`\${colores.primary}1A\` }]} />
      <RefreshControl refreshing={refrescando} onRefresh={refrescar} tintColor={colors.primary} colors={[colors.primary]} />
    `
    expect(hallazgosPrimarioTexto(fixture)).toEqual([])
  })
})

// ===========================================================================
// El barrido real: app/**, components/**.
// ===========================================================================

/** Vacía a propósito (49-b): la única excepción que admite esta regla es
 * texto GRANDE (≥ 24 px, o ≥ 18,66 px en negrita — mínimo WCAG 3:1, que
 * `primary` cumple: 3,83 sobre `background`, 3,65 sobre `card`). Si se suma
 * una, va acá con archivo, línea y el tamaño que la justifica. Clave:
 * `${archivoRelativo}:${linea}`. */
const EXCEPCIONES: Record<string, string> = {}

/**
 * Línea de base (mismo patrón que `tests/a11y/pendientes-componentes.ts`):
 * hallazgos reales de HOY en archivos fuera del alcance de 49-b. Solo puede
 * bajar — si se arregla uno sin bajar el número acá, el test de abajo falla
 * a propósito.
 *
 * `components/LoQueSeguis.tsx:206` ("Dejar de seguir", `tono="primario"`,
 * `peso="semibold"`, `estilos.textoBoton` en 13 px): no es texto grande
 * (13 px, ni siquiera con "semibold" llega a los 18,66 px que pedirían
 * "negrita"), así que es un hallazgo real, no una excepción. `LoQueSeguis.tsx`
 * no es un archivo permitido de esta tarea (está en la lista de "no tocar"
 * del encargo) — reportado para 49-r, no se arregla acá.
 */
const PENDIENTES: Record<string, number> = {
  'components/LoQueSeguis.tsx': 1,
}

describe('app/ y components/: ningún texto chico usa colores.primary (QPS-241, grupo 2)', () => {
  const archivos = [...listarTsxYTs(APP_DIR), ...listarTsxYTs(COMPONENTS_DIR)]

  it('encuentra al menos un archivo para analizar', () => {
    expect(archivos.length).toBeGreaterThan(0)
  })

  it.each(archivos.map((file) => [relative(MOBILE_ROOT, file).replace(/\\/g, '/'), file] as const))('%s', (label, file) => {
    const content = readFileSync(file, 'utf8')
    const hallazgos = hallazgosPrimarioTexto(content)
    const sinExcepciones = hallazgos.filter((h) => EXCEPCIONES[`${label}:${h.linea}`] === undefined)
    const base = PENDIENTES[label] ?? 0

    if (sinExcepciones.length > base) {
      throw new Error(
        `${label}: ${sinExcepciones.length} hallazgo(s) de "primary" como texto chico (línea de base ${base}): ` +
          sinExcepciones.map((h) => `línea ${h.linea} (${h.regla})`).join('; '),
      )
    }
    if (sinExcepciones.length < base) {
      throw new Error(
        `${label}: ${sinExcepciones.length} hallazgo(s), la línea de base (PENDIENTES) esperaba ${base} — bajá el número en tests/primario-texto.test.ts: se arregló algo`,
      )
    }
    expect(sinExcepciones.length).toBe(base)
  })
})

describe('PENDIENTES: ninguna entrada es de un archivo de esta tarea (49-b)', () => {
  // Los 5 archivos que esta tarea sí tocó no pueden aparecer en la línea de
  // base: si alguno quedó con un hallazgo, es un bug de esta tarea, no algo
  // para reportar "a futuro".
  const ARCHIVOS_DE_LA_TAREA = [
    'app/eliminar-cuenta.tsx',
    'app/flyer/[id].tsx',
    'app/(tabs)/favoritos.tsx',
    'components/FilaCategoria.tsx',
    'components/BotonCalendario.tsx',
  ]

  it.each(ARCHIVOS_DE_LA_TAREA)('%s no está en PENDIENTES', (archivo) => {
    expect(PENDIENTES[archivo]).toBeUndefined()
  })
})
