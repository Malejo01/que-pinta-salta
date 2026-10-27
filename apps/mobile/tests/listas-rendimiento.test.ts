// Detectores de rendimiento de las listas de eventos (A7, nube Q1): Inicio
// (las filas horizontales de `components/FilaCategoria.tsx`), Buscar y
// Favoritos. Estáticos sobre el texto (no hay runner de React Native; la
// medición de renders con las pantallas montadas es
// `tests/renders-listas.test.ts`). Cada detector se prueba antes con
// fixtures en memoria que tienen que fallar de verdad.
//
// Qué fijan:
//  1. `keyExtractor` estable: sin índice (ni segundo parámetro), sin unir ids
//     con `join`, sin `Math.random`/`Date.now`. La función puede ser de módulo:
//     se busca su definición en el mismo archivo.
//  2. Ventana: cada `FlatList`/`SectionList` de esas pantallas lleva
//     `initialNumToRender`, `maxToRenderPerBatch` y `windowSize`, con valores
//     razonables (abajo de los de omisión: 10, 10 y 21). Y
//     `removeClippedSubviews`: `FlatList` lo PRENDE por omisión en Android
//     (`removeClippedSubviewsOrDefault` en `FlatList.js`) y TalkBack pierde las
//     celdas que saca de la jerarquía, así que cada `FlatList` tiene que traer
//     `removeClippedSubviews={false}` explícito; ninguna lista lo prende
//     (`={true}` o la prop sola). `SectionList` no tiene ese valor por
//     omisión: puede no traerlo.
//  3. `getItemLayout` solo donde la medida es fija: la fila horizontal de
//     `FilaCategoria` (180 de ancho, siempre), y sus cuentas salen de las
//     mismas constantes que los estilos. Buscar y Favoritos NO lo llevan (el
//     alto depende del ancho de pantalla, de la escala de fuente y de
//     encabezados de alto variable).
//  4. `TarjetaEvento` es `memo`, los que la usan le pasan solo `evento={x}`, y
//     su comparación cubre todos los campos de `evento` que lee el componente.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { quitarComentarios } from '@qps/core/tests/convencion-entorno'

const MOBILE_ROOT = fileURLToPath(new URL('../', import.meta.url))
const leer = (...partes: string[]) => quitarComentarios(readFileSync(join(MOBILE_ROOT, ...partes), 'utf8').replace(/\r\n/g, '\n'))

const ARCHIVOS_CON_LISTAS = [
  ['components/FilaCategoria.tsx', ['components', 'FilaCategoria.tsx']],
  ['app/(tabs)/buscar.tsx', ['app', '(tabs)', 'buscar.tsx']],
  ['app/(tabs)/favoritos.tsx', ['app', '(tabs)', 'favoritos.tsx']],
] as const

// ---------------------------------------------------------------------------
// Utilidades de lectura
// ---------------------------------------------------------------------------

/** Desde `inicio` (que apunta a una llave de apertura), el texto hasta la que la cierra (sin las llaves). */
function entreLlaves(fuente: string, inicio: number): string {
  let profundidad = 0
  for (let i = inicio; i < fuente.length; i++) {
    if (fuente[i] === '{') profundidad++
    else if (fuente[i] === '}') {
      profundidad--
      if (profundidad === 0) return fuente.slice(inicio + 1, i)
    }
  }
  return fuente.slice(inicio + 1)
}

/** El texto de las props de cada `<FlatList …>`/`<SectionList …>` (hasta el `>`/`/>` de la etiqueta, contando llaves). */
export function listasDe(fuente: string): { tipo: string; props: string }[] {
  const listas: { tipo: string; props: string }[] = []
  const apertura = /<(FlatList|SectionList)\b/g
  let m: RegExpExecArray | null
  while ((m = apertura.exec(fuente))) {
    let profundidad = 0
    let fin = fuente.length
    for (let i = m.index + m[0].length; i < fuente.length; i++) {
      const c = fuente[i]
      if (c === '{') profundidad++
      else if (c === '}') profundidad--
      else if (c === '>' && profundidad === 0 && fuente[i - 1] !== '=') {
        fin = i
        break
      }
    }
    listas.push({ tipo: m[1], props: fuente.slice(m.index + m[0].length, fin) })
  }
  return listas
}

/** El valor (sin llaves) de `prop={…}` dentro de `props`, o `null` si no está. */
export function valorDeProp(props: string, prop: string): string | null {
  const m = new RegExp(`(?:^|\\s)${prop}=\\{`).exec(props)
  if (!m) return null
  return entreLlaves(props, m.index + m[0].length - 1).trim()
}

/** La definición de `nombre` en el archivo: la línea de `const nombre =` o el cuerpo de `function nombre(…) {…}`. */
function definicionDe(fuente: string, nombre: string): string | null {
  const funcion = new RegExp(`function\\s+${nombre}\\s*\\(`).exec(fuente)
  if (funcion) {
    const llave = fuente.indexOf('{', fuente.indexOf(')', funcion.index))
    return fuente.slice(funcion.index, llave) + entreLlaves(fuente, llave)
  }
  const constante = new RegExp(`const\\s+${nombre}\\b[^=]*=`).exec(fuente)
  if (constante) {
    const finDeLinea = fuente.indexOf('\n', constante.index)
    return fuente.slice(constante.index, finDeLinea === -1 ? undefined : finDeLinea)
  }
  return null
}

/** Los números de `const NOMBRE = { clave: n, … }` (los `VENTANA_*`). */
function numerosDeConstante(fuente: string, nombre: string): Record<string, number> | null {
  const m = new RegExp(`const\\s+${nombre}\\s*=\\s*\\{`).exec(fuente)
  if (!m) return null
  const cuerpo = entreLlaves(fuente, m.index + m[0].length - 1)
  const numeros: Record<string, number> = {}
  for (const par of cuerpo.matchAll(/(\w+)\s*:\s*(\d+)/g)) numeros[par[1]] = Number(par[2])
  return numeros
}

// ---------------------------------------------------------------------------
// 1. keyExtractor estable
// ---------------------------------------------------------------------------

/** Problemas de una función de clave (el texto inline o el de su definición). */
function problemasDeClave(texto: string): string[] {
  const problemas: string[] = []
  const parametros = /^\s*(?:(?:export\s+)?function\s+\w+\s*|const\s+\w+[^=]*=\s*)?\(([^)]*)\)/.exec(texto)?.[1] ?? ''
  if (parametros.split(',').filter((p) => p.trim()).length > 1) problemas.push('usa el índice (segundo parámetro)')
  if (/\.join\(/.test(texto)) problemas.push('une ids con join (la clave cambia con la composición de la fila)')
  if (/\b(index|indice|idx)\b/.test(texto)) problemas.push('usa un índice')
  if (/Math\.random|Date\.now/.test(texto)) problemas.push('no es determinística')
  return problemas
}

export function violacionesDeClaves(fuente: string): string[] {
  const violaciones: string[] = []
  for (const { tipo, props } of listasDe(fuente)) {
    const valor = valorDeProp(props, 'keyExtractor')
    if (valor === null) {
      violaciones.push(`${tipo} sin keyExtractor`)
      continue
    }
    let texto = valor
    if (/^[A-Za-z_$][\w$]*$/.test(valor)) {
      const definicion = definicionDe(fuente, valor)
      if (definicion === null) {
        violaciones.push(`${tipo}: no se encontró la definición de ${valor}`)
        continue
      }
      texto = definicion
    }
    for (const problema of problemasDeClave(texto)) violaciones.push(`${tipo}: keyExtractor ${problema}`)
  }
  return violaciones
}

describe('violacionesDeClaves (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('acepta una clave por id, inline o de módulo', () => {
    expect(violacionesDeClaves('<FlatList data={a} keyExtractor={(e) => e.id} renderItem={r} />')).toEqual([])
    expect(violacionesDeClaves('const clave = (e: X) => e.id\n<FlatList keyExtractor={clave} />')).toEqual([])
    expect(violacionesDeClaves('export function claveDeFila(fila: X[]): string {\n  return fila[0].id\n}\n<SectionList keyExtractor={claveDeFila} />')).toEqual([])
  })

  it('detecta la clave de Favoritos de main (join de los ids, con índice de respaldo)', () => {
    const v = violacionesDeClaves(
      "<SectionList keyExtractor={(fila, index) => (fila.length > 0 ? fila.map((item) => item.id).join('-') : `fila-${index}`)} />",
    )
    expect(v).toContain('SectionList: keyExtractor usa el índice (segundo parámetro)')
    expect(v).toContain('SectionList: keyExtractor une ids con join (la clave cambia con la composición de la fila)')
  })

  it('detecta un índice escondido en una función de módulo, y una lista sin keyExtractor', () => {
    expect(violacionesDeClaves('const clave = (_e: X, i: number) => String(i)\n<FlatList keyExtractor={clave} />')).toEqual([
      'FlatList: keyExtractor usa el índice (segundo parámetro)',
    ])
    expect(violacionesDeClaves('<FlatList data={a} renderItem={r} />')).toEqual(['FlatList sin keyExtractor'])
  })
})

describe.each(ARCHIVOS_CON_LISTAS)('%s: keyExtractor estable (sin índices ni joins)', (_ruta, partes) => {
  const fuente = leer(...partes)
  it('tiene al menos una lista (si no, el detector no está mirando nada)', () => {
    expect(listasDe(fuente).length).toBeGreaterThan(0)
  })
  it('todas sus listas tienen una clave estable', () => {
    expect(violacionesDeClaves(fuente)).toEqual([])
  })
})

describe('app/(tabs)/index.tsx: sin listas virtualizadas propias, y la grilla del modo categoría con claves por id', () => {
  // A7 (nube Q1): la grilla de 2 del modo categoría sigue siendo un `.map`
  // dentro del `ScrollView` de la portada (una `FlatList` vertical adentro de
  // un `ScrollView` vertical no virtualiza y RN lo advierte; las tarjetas de
  // película del acordeón dependen de ese `ScrollView`, R67-c). Con
  // `TarjetaEvento` en `memo` y claves por id, no remonta ni redibuja de más.
  const fuente = leer('app', '(tabs)', 'index.tsx')
  it('no tiene FlatList/SectionList (las filas son FilaCategoria)', () => {
    expect(listasDe(fuente)).toEqual([])
  })
  it('la grilla usa key={fila[0].id} y key={evento.id}', () => {
    expect(fuente).toMatch(/enFilasDeDos\(datosPortada\.eventosSinPelicula\)\.map\(\(fila\) => \(\s*<View key=\{fila\[0\]\.id\}/)
    expect(fuente).toMatch(/fila\.map\(\(evento\) => \(\s*<View key=\{evento\.id\}/)
  })
})

// ---------------------------------------------------------------------------
// 2. Ventana
// ---------------------------------------------------------------------------

const RANGOS_VENTANA = {
  initialNumToRender: [1, 8],
  maxToRenderPerBatch: [1, 8],
  windowSize: [3, 11],
} as const

export function violacionesDeVentana(fuente: string): string[] {
  const violaciones: string[] = []
  for (const { tipo, props } of listasDe(fuente)) {
    const recorte = valorDeProp(props, 'removeClippedSubviews')
    if (/(?:^|\s)removeClippedSubviews(?!\s*=)/.test(props) || (recorte !== null && recorte !== 'false')) {
      violaciones.push(`${tipo}: prende removeClippedSubviews (en Android TalkBack pierde las celdas fuera de pantalla)`)
    } else if (tipo === 'FlatList' && recorte === null) {
      violaciones.push('FlatList sin removeClippedSubviews={false} (FlatList lo prende por omisión en Android)')
    }
    for (const [prop, [minimo, maximo]] of Object.entries(RANGOS_VENTANA)) {
      const valor = valorDeProp(props, prop)
      if (valor === null) {
        violaciones.push(`${tipo} sin ${prop}`)
        continue
      }
      let numero = Number(valor)
      const referencia = /^(\w+)\.(\w+)$/.exec(valor)
      if (referencia) numero = numerosDeConstante(fuente, referencia[1])?.[referencia[2]] ?? Number.NaN
      if (!(numero >= minimo && numero <= maximo)) violaciones.push(`${tipo}: ${prop}=${valor} fuera de [${minimo}, ${maximo}]`)
    }
  }
  return violaciones
}

describe('violacionesDeVentana (fixtures en memoria: tiene que fallar de verdad)', () => {
  const completa = 'initialNumToRender={4} maxToRenderPerBatch={3} windowSize={7} removeClippedSubviews={false}'
  it('acepta números literales y constantes VENTANA_*', () => {
    expect(violacionesDeVentana(`<FlatList ${completa} />`)).toEqual([])
    expect(
      violacionesDeVentana(
        'const VENTANA = { initialNumToRender: 3, maxToRenderPerBatch: 3, windowSize: 5 } as const\n' +
          '<FlatList initialNumToRender={VENTANA.initialNumToRender} maxToRenderPerBatch={VENTANA.maxToRenderPerBatch} windowSize={VENTANA.windowSize} removeClippedSubviews={false} />',
      ),
    ).toEqual([])
  })
  it('detecta una lista con los valores por omisión (sin las props)', () => {
    expect(violacionesDeVentana('<FlatList data={a} />')).toEqual([
      'FlatList sin removeClippedSubviews={false} (FlatList lo prende por omisión en Android)',
      'FlatList sin initialNumToRender',
      'FlatList sin maxToRenderPerBatch',
      'FlatList sin windowSize',
    ])
  })
  it('detecta valores fuera de rango (una SectionList sin removeClippedSubviews está bien: no lo prende por omisión)', () => {
    expect(violacionesDeVentana('<SectionList initialNumToRender={30} maxToRenderPerBatch={3} windowSize={21} />')).toEqual([
      'SectionList: initialNumToRender=30 fuera de [1, 8]',
      'SectionList: windowSize=21 fuera de [3, 11]',
    ])
  })
  it('detecta removeClippedSubviews prendido: la prop sola, ={true} o una expresión', () => {
    const sinRecorte = 'initialNumToRender={4} maxToRenderPerBatch={3} windowSize={7}'
    const prendido = 'FlatList: prende removeClippedSubviews (en Android TalkBack pierde las celdas fuera de pantalla)'
    expect(violacionesDeVentana(`<FlatList ${sinRecorte} removeClippedSubviews />`)).toEqual([prendido])
    expect(violacionesDeVentana(`<FlatList ${sinRecorte} removeClippedSubviews={true} />`)).toEqual([prendido])
    expect(violacionesDeVentana(`<FlatList ${sinRecorte} removeClippedSubviews={esAndroid} />`)).toEqual([prendido])
    expect(violacionesDeVentana(`<SectionList ${sinRecorte} removeClippedSubviews />`)).toEqual([
      'SectionList: prende removeClippedSubviews (en Android TalkBack pierde las celdas fuera de pantalla)',
    ])
  })
})

describe.each(ARCHIVOS_CON_LISTAS)('%s: valores de ventana', (_ruta, partes) => {
  it('cada lista trae initialNumToRender, maxToRenderPerBatch y windowSize razonables, y ninguna prende removeClippedSubviews', () => {
    expect(violacionesDeVentana(leer(...partes))).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 3. getItemLayout solo donde la medida es fija
// ---------------------------------------------------------------------------

describe('getItemLayout: solo en la fila horizontal de FilaCategoria', () => {
  it('Buscar y Favoritos no lo usan (alto variable: ancho de pantalla, escala de fuente, encabezados)', () => {
    expect(leer('app', '(tabs)', 'buscar.tsx')).not.toMatch(/getItemLayout/)
    expect(leer('app', '(tabs)', 'favoritos.tsx')).not.toMatch(/getItemLayout/)
    expect(leer('app', '(tabs)', 'index.tsx')).not.toMatch(/getItemLayout/)
  })

  const fila = leer('components', 'FilaCategoria.tsx')
  const [lista] = listasDe(fila)

  it('la FlatList de FilaCategoria es horizontal y usa layoutDeTarjetaEnFila', () => {
    expect(lista.props).toMatch(/\bhorizontal\b/)
    expect(valorDeProp(lista.props, 'getItemLayout')).toBe('layoutDeTarjetaEnFila')
  })

  it('las cuentas salen de las mismas constantes que los estilos (ancho fijo, gap y margen)', () => {
    const definicion = definicionDe(fila, 'layoutDeTarjetaEnFila') ?? ''
    // `length` es solo el ancho (sin el gap): ver el test del hueco en tests/renders-listas.test.ts.
    expect(definicion).toMatch(/length: ANCHO_TARJETA,/)
    expect(definicion).toMatch(/offset: MARGEN_LATERAL \+ \(ANCHO_TARJETA \+ SEPARACION\) \* index/)
    expect(fila).toMatch(/lista: \{ paddingHorizontal: MARGEN_LATERAL, gap: SEPARACION \}/)
    expect(fila).toMatch(/celda: \{ width: ANCHO_TARJETA, height: ALTO_TARJETA \}/)
  })
})

// ---------------------------------------------------------------------------
// 4. TarjetaEvento memo
// ---------------------------------------------------------------------------

const RUTAS_CON_EVENTO = ['rutaDeEvento', 'objetivoDeFavorito', 'esEventoReal'] as const

/** Los campos de `CAMPOS_QUE_USA_LA_TARJETA` en el fuente de la tarjeta. */
function camposComparados(tarjeta: string): Set<string> {
  const m = /CAMPOS_QUE_USA_LA_TARJETA\s*=\s*\[([^\]]*)\]/.exec(tarjeta)
  return new Set([...(m?.[1] ?? '').matchAll(/'(\w+)'/g)].map((x) => x[1]))
}

export function violacionesDeMemo(tarjeta: string, rutas: string): string[] {
  const violaciones: string[] = []
  if (!/export const TarjetaEvento = memo\(\w+, sonPropsDeTarjetaIguales\)/.test(tarjeta)) violaciones.push('TarjetaEvento no es memo(…, sonPropsDeTarjetaIguales)')
  if (/export function TarjetaEvento\b/.test(tarjeta)) violaciones.push('TarjetaEvento se exporta sin memo')
  const campos = camposComparados(tarjeta)
  if (campos.size === 0) violaciones.push('no se encontró CAMPOS_QUE_USA_LA_TARJETA')
  // `evento.x` y `evento?.x` se pueden seguir; lo demás (`evento[x]`, copiarlo
  // a otra variable, desestructurarlo o esparcirlo) se prohíbe: el detector no
  // podría saber qué campos se leen.
  for (const [, campo] of tarjeta.matchAll(/\bevento\??\.(\w+)/g)) {
    if (!campos.has(campo)) violaciones.push(`lee evento.${campo} y la comparación del memo no lo mira`)
  }
  if (/\bevento\s*(?:\?\.)?\[/.test(tarjeta)) violaciones.push('lee evento[…] (prohibido: no se puede saber qué campo)')
  if (/(?<![=!<>])=\s*evento\b(?!\s*(?:\?\.|\.|\[))/.test(tarjeta)) violaciones.push('copia o desestructura evento (prohibido: no se puede saber qué campos lee)')
  if (/\.\.\.\s*evento\b/.test(tarjeta)) violaciones.push('esparce evento (prohibido: no se puede saber qué campos lee)')
  for (const [, llamada] of tarjeta.matchAll(/(\w+)\(evento\)/g)) {
    if (!(RUTAS_CON_EVENTO as readonly string[]).includes(llamada)) violaciones.push(`le pasa el evento entero a ${llamada}`)
  }
  if (/=\{evento\}/.test(tarjeta)) violaciones.push('le pasa el evento entero a un hijo')
  for (const funcion of RUTAS_CON_EVENTO) {
    const firma = new RegExp(`export function ${funcion}\\(\\s*item: Pick<DisplayEvent, ([^>]*)>`).exec(rutas)
    if (!firma) {
      violaciones.push(`no se encontró la firma de ${funcion} en lib/rutas.ts`)
      continue
    }
    for (const [, campo] of firma[1].matchAll(/'(\w+)'/g)) {
      if (!campos.has(campo)) violaciones.push(`${funcion} mira ${campo} y la comparación del memo no`)
    }
  }
  return violaciones
}

describe('violacionesDeMemo (fixtures en memoria: tiene que fallar de verdad)', () => {
  const rutas =
    "export function rutaDeEvento(item: Pick<DisplayEvent, 'id' | 'isCinemaMovie'>): string {}\n" +
    "export function objetivoDeFavorito(\n  item: Pick<DisplayEvent, 'id'>,\n) {}\n" +
    "export function esEventoReal(item: Pick<DisplayEvent, 'isCinemaMovie'>): boolean {}"
  const buena =
    "export const CAMPOS_QUE_USA_LA_TARJETA = ['id', 'title', 'isCinemaMovie'] as const\n" +
    'function Base({ evento }) { return evento.title + rutaDeEvento(evento) }\n' +
    'export const TarjetaEvento = memo(Base, sonPropsDeTarjetaIguales)'

  it('acepta una tarjeta memo que compara todo lo que lee', () => {
    expect(violacionesDeMemo(buena, rutas)).toEqual([])
  })
  it('detecta la tarjeta sin memo (la de main)', () => {
    expect(violacionesDeMemo('export const CAMPOS_QUE_USA_LA_TARJETA = [\'id\']\nexport function TarjetaEvento({ evento }) {}', rutas)).toContain(
      'TarjetaEvento se exporta sin memo',
    )
  })
  it('detecta un campo leído que la comparación no mira, y el evento entero pasado a otro lado', () => {
    expect(violacionesDeMemo(buena.replace('evento.title', 'evento.venue'), rutas)).toEqual([
      'lee evento.venue y la comparación del memo no lo mira',
    ])
    expect(violacionesDeMemo(buena.replace('rutaDeEvento(evento)', 'otraCosa(evento)'), rutas)).toEqual(['le pasa el evento entero a otraCosa'])
    expect(violacionesDeMemo(buena.replace('evento.title', 'evento?.venue'), rutas)).toEqual([
      'lee evento.venue y la comparación del memo no lo mira',
    ])
    expect(violacionesDeMemo(buena.replace("'isCinemaMovie'", "'image'"), rutas)).toEqual([
      'rutaDeEvento mira isCinemaMovie y la comparación del memo no',
      'esEventoReal mira isCinemaMovie y la comparación del memo no',
    ])
  })
})

describe('violacionesDeMemo: accesos a evento que el detector no puede seguir', () => {
  const rutas =
    "export function rutaDeEvento(item: Pick<DisplayEvent, 'id'>): string {}\n" +
    "export function objetivoDeFavorito(item: Pick<DisplayEvent, 'id'>) {}\n" +
    "export function esEventoReal(item: Pick<DisplayEvent, 'id'>): boolean {}"
  const con = (cuerpo: string) =>
    "export const CAMPOS_QUE_USA_LA_TARJETA = ['id', 'title'] as const\n" +
    `function Base({ evento }) { ${cuerpo} }\n` +
    'export const TarjetaEvento = memo(Base, sonPropsDeTarjetaIguales)'

  it('la base (evento.title) pasa', () => {
    expect(violacionesDeMemo(con('return evento.title'), rutas)).toEqual([])
  })
  it('desestructurar evento falla', () => {
    expect(violacionesDeMemo(con('const { venue } = evento; return venue'), rutas)).toEqual([
      'copia o desestructura evento (prohibido: no se puede saber qué campos lee)',
    ])
  })
  it('copiarlo a otra variable falla', () => {
    expect(violacionesDeMemo(con('const e = evento; return e.venue'), rutas)).toEqual([
      'copia o desestructura evento (prohibido: no se puede saber qué campos lee)',
    ])
  })
  it('evento[campo] y evento?.[campo] fallan', () => {
    expect(violacionesDeMemo(con("return evento['venue']"), rutas)).toEqual(['lee evento[…] (prohibido: no se puede saber qué campo)'])
    expect(violacionesDeMemo(con('return evento?.[campo]'), rutas)).toEqual(['lee evento[…] (prohibido: no se puede saber qué campo)'])
  })
  it('esparcir evento falla', () => {
    expect(violacionesDeMemo(con('return mostrar({ ...evento })'), rutas)).toEqual([
      'esparce evento (prohibido: no se puede saber qué campos lee)',
    ])
  })
  it('comparar con === no cuenta como copiarlo', () => {
    expect(violacionesDeMemo(con('return evento.title === otro ? evento.id : null'), rutas)).toEqual([])
  })
})

describe('components/TarjetaEvento.tsx: memo con una comparación que cubre lo que dibuja', () => {
  it('es memo y la comparación mira todos los campos que lee (directo o por lib/rutas.ts)', () => {
    expect(violacionesDeMemo(leer('components', 'TarjetaEvento.tsx'), leer('lib', 'rutas.ts'))).toEqual([])
  })
})

describe.each([
  ['components/FilaCategoria.tsx', ['components', 'FilaCategoria.tsx']],
  ['app/(tabs)/buscar.tsx', ['app', '(tabs)', 'buscar.tsx']],
  ['app/(tabs)/favoritos.tsx', ['app', '(tabs)', 'favoritos.tsx']],
  ['app/(tabs)/index.tsx', ['app', '(tabs)', 'index.tsx']],
] as const)('%s: a TarjetaEvento solo le pasa evento={x} (nada que rompa el memo)', (_ruta, partes) => {
  it('cada <TarjetaEvento> es exactamente <TarjetaEvento evento={nombre} />', () => {
    const usos = [...leer(...partes).matchAll(/<TarjetaEvento\b[^>]*>/g)].map((m) => m[0])
    expect(usos.length).toBeGreaterThan(0)
    for (const uso of usos) expect(uso).toMatch(/^<TarjetaEvento evento=\{\w+\} \/>$/)
  })
})
