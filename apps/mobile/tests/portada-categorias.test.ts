// R66, 66-q (parte 2): la UI nueva de categorías y fechas de la app. Sin red ni
// base. La app no monta componentes en los tests (no hay jsdom ni
// `@testing-library/react-native`), así que, como `tests/portada.test.ts` y
// `tests/buscar.test.ts`, esto son lecturas estáticas del código fuente. Para
// que un comentario que nombra algo (por ejemplo "sin BannerAnuncio") no tape
// una rotura, todo se lee SIN comentarios, con un scanner de caracteres (no un
// recorte por `/*` o `//` suelto, que blanquea el resto del archivo si un
// comentario tiene un glob).
//
// "La rotura de siempre": sobre varios `it` va la mutación del código de
// producción que lo pone en rojo (la corre el lead).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
// Saltos de línea normalizados: en Windows el checkout puede traer CRLF.
const leer = (...partes: string[]) => readFileSync(join(MOBILE_ROOT, ...partes), 'utf8').replace(/\r\n/g, '\n')

/**
 * Reemplaza los comentarios `//` y `/* *\/` por espacios (conserva los saltos de
 * línea), respetando strings ('..', "..") y template literals (`..`), de modo
 * que un `//` o un `/*` DENTRO de un comentario o de un string no corrompe nada.
 * Los strings de comilla simple/doble terminan en el salto de línea (así un
 * apóstrofo suelto en texto JSX no se come el resto del archivo).
 */
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

/** Texto entre dos marcadores (el primero que aparezca después del inicio). */
function entre(texto: string, inicio: string, fin: string): string {
  const desde = texto.indexOf(inicio)
  expect(desde, `no está el marcador de inicio: ${inicio}`).toBeGreaterThan(-1)
  const hasta = texto.indexOf(fin, desde + inicio.length)
  expect(hasta, `no está el marcador de fin: ${fin}`).toBeGreaterThan(desde)
  return texto.slice(desde, hasta)
}

/** Bloque `nombre: { ... }` de un StyleSheet.create (sin llaves anidadas). */
function claveDeEstilo(codigo: string, nombre: string): string {
  const m = codigo.match(new RegExp(`\\b${nombre}:\\s*\\{([^}]*)\\}`))
  expect(m, `no hay una clave de estilo "${nombre}"`).not.toBeNull()
  return m![1]
}

describe('el scanner de comentarios (guarda de este archivo)', () => {
  it('un glob dentro de un comentario // no blanquea lo que viene después', () => {
    const limpio = sinComentarios("// toca lib/** y tests/**\nconst a = 1 // fin\nconst b = '//x'")
    expect(limpio).toContain('const a = 1')
    expect(limpio).toContain("const b = '//x'")
    expect(limpio).not.toContain('toca lib')
  })

  it('un comentario de bloque se va y conserva el resto', () => {
    const limpio = sinComentarios('const a = 1 /* <Pressable> */ const b = 2')
    expect(limpio).not.toContain('Pressable')
    expect(limpio).toContain('const b = 2')
  })
})

// ---------------------------------------------------------------------------
// 1. components/ChipsCategorias.tsx
// ---------------------------------------------------------------------------
describe('components/ChipsCategorias.tsx', () => {
  const codigo = sinComentarios(leer('components', 'ChipsCategorias.tsx'))
  const pressable = entre(codigo, '<Pressable', '</Pressable>')

  // Mutación: sacar `accessibilityRole="button"` del Pressable.
  it('cada chip es un botón (accessibilityRole="button")', () => {
    expect(pressable).toMatch(/accessibilityRole="button"/)
  })

  // Mutación: cambiar `selected: activo` por `selected: false`.
  it('el estado seleccionado sale de comparar el slug con la categoría elegida', () => {
    expect(pressable).toMatch(/accessibilityState=\{\{\s*selected:\s*activo\s*\}\}/)
    expect(codigo).toMatch(/const activo = chip\.slug === seleccionada/)
  })

  // Mutación: cambiar la etiqueta de "Todas" por 'Todas'.
  it('el primer chip es "Todas" (slug null) y su label dice "Todas las categorías"', () => {
    expect(codigo).toMatch(/slug:\s*null,\s*nombre:\s*'Todas',\s*etiqueta:\s*'Todas las categorías'/)
    expect(pressable).toMatch(/accessibilityLabel=\{chip\.etiqueta\}/)
    // "Todas" va antes que el resto de las categorías.
    expect(codigo.indexOf("slug: null")).toBeLessThan(codigo.indexOf('...categorias.map'))
  })

  // Mutación: bajar `minHeight: 48` a 40 en `chip`, o apuntar el style a otra clave.
  it('el área táctil: la clave que usa el style del Pressable tiene minHeight >= 44', () => {
    const style = pressable.match(/style=\{\[\s*estilos\.(\w+)/)
    expect(style, 'el style del Pressable no arranca con una clave de estilos.*').not.toBeNull()
    const minimo = claveDeEstilo(codigo, style![1]).match(/minHeight:\s*(\d+)/)
    expect(minimo, `la clave "${style![1]}" no tiene minHeight`).not.toBeNull()
    expect(Number(minimo![1])).toBeGreaterThanOrEqual(44)
  })

  // Mutación: poner `backgroundColor: '#F59E0B'` en el chip activo.
  it('los colores salen de useColoresQPS(): ningún color literal (hex, rgb, hsl)', () => {
    expect(codigo).toMatch(/import\s*\{\s*useColoresQPS\s*\}\s*from\s*'@\/lib\/colores'/)
    expect(codigo).toMatch(/const colores = useColoresQPS\(\)/)
    expect(codigo).toMatch(/colores\.primary\b/)
    // 66-r1 (N1): el chip activo ya no es relleno (tinte + contorno de
    // `primary` con texto `foreground`), así que no usa `primaryForeground`.
    expect(codigo).toMatch(/colores\.foreground\b/)
    expect(codigo).toMatch(/`\$\{colores\.primary\}26`/)
    expect(codigo).toMatch(/colores\.border\b/)
    expect(codigo).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(codigo).not.toMatch(/\b(?:rgba?|hsla?)\(/)
  })

  // Mutación: pasar un nombre de ícono fijo (`nombre="Star"`) en vez de iconoPorCategoria.
  it('el ícono de cada categoría sale de iconoPorCategoria(slug), de @/components/Icono', () => {
    expect(codigo).toMatch(/import\s*\{[^}]*\biconoPorCategoria\b[^}]*\}\s*from\s*'@\/components\/Icono'/)
    expect(codigo).toMatch(/<Icono\s+nombre=\{iconoPorCategoria\(chip\.slug\)\}/)
  })

  it('el chip "Todas" no lleva ícono (solo las categorías con slug)', () => {
    // 66-r1: el JSX del ícono pasó a varias líneas (con paréntesis).
    expect(codigo).toMatch(/chip\.slug !== null \? \(?\s*<Icono/)
  })
})

// ---------------------------------------------------------------------------
// 2. app/(tabs)/index.tsx (portada)
// ---------------------------------------------------------------------------
describe('portada (app/(tabs)/index.tsx) en modo categoría', () => {
  const codigo = sinComentarios(leer('app', '(tabs)', 'index.tsx'))
  const jsx = codigo.slice(codigo.indexOf('return (\n    <View style={[estilos.contenedor'))
  const bloqueCategoria = entre(jsx, 'estilos.bloqueCategoria}>', 'secciones.map(')

  // Mutación: mover <ChipsCategorias> arriba de <PillsAtajos>.
  it('los chips van después de PillsAtajos en el JSX', () => {
    const pills = jsx.indexOf('<PillsAtajos')
    const chips = jsx.indexOf('<ChipsCategorias')
    expect(pills).toBeGreaterThan(-1)
    expect(chips).toBeGreaterThan(pills)
  })

  // Mutación: sacar `categoria === null &&` del useMemo de `secciones`.
  it('con una categoría elegida, `secciones` queda vacío (el useMemo corta con categoria === null)', () => {
    const memo = entre(codigo, 'const secciones = useMemo(', '[datosPortada, categoria]')
    expect(memo).toMatch(/datosPortada\s*&&\s*categoria === null\s*\?\s*seccionesPortada\(/)
    expect(memo).toMatch(/:\s*\[\]/)
    // y la categoría está entre las dependencias: si no, no se recalcula al elegirla.
    expect(codigo).toMatch(/\[datosPortada, categoria\]/)
  })

  // Mutación: agregar <BannerAnuncio .../> o <BannerRadar /> dentro de la grilla.
  it('el bloque de la grilla por categoría no dibuja BannerAnuncio ni BannerRadar (regla del pliegue)', () => {
    expect(bloqueCategoria).not.toMatch(/BannerAnuncio/)
    expect(bloqueCategoria).not.toMatch(/BannerRadar/)
    expect(bloqueCategoria).not.toMatch(/seccionesPortada/)
  })

  it('y los banners solo se dibujan desde `secciones` (un único lugar para cada uno)', () => {
    expect(jsx.match(/<BannerAnuncio\b/g)).toHaveLength(1)
    expect(jsx.match(/<BannerRadar\b/g)).toHaveLength(1)
    expect(jsx.indexOf('<BannerAnuncio')).toBeGreaterThan(jsx.indexOf('secciones.map('))
    expect(jsx.indexOf('<BannerRadar')).toBeGreaterThan(jsx.indexOf('secciones.map('))
  })

  // Mutación: sacar el atajo del router.push de las filas.
  it('"Ver todos" de una fila lleva categoría y atajo a Buscar', () => {
    const alVerTodos = entre(jsx, 'alVerTodos={() => {', "seccion.tipo === 'banner-radar'")
    expect(alVerTodos).toMatch(/`\/buscar\?categoria=\$\{encodeURIComponent\(catSlug\)\}&atajo=\$\{encodeURIComponent\(atajo\)\}&v=\$\{Date\.now\(\)\}`/)
  })

  // Mutación: sacar uno de los dos Pressable del vacío, o cambiar su destino.
  it('el vacío tiene "Ver todas las fechas" (a Buscar sin atajo; el cine, a /cines) y "Todas las categorías"', () => {
    const vacio = entre(bloqueCategoria, 'eventosCategoria.length === 0', ') : (')
    // 66-r1 (N3): el texto dice a dónde va ("Ver <Nombre> en todas las fechas";
    // el cine, "Ver cartelera").
    expect(vacio).toContain('en todas las fechas')
    expect(vacio).toContain('Ver cartelera')
    expect(vacio).toContain('Todas las categorías')
    expect(vacio).toMatch(/if \(categoria === 'cine'\) router\.push\('\/cines'\)/)
    // `v`: nonce en el onPress (nunca en el render) para que Buscar reaplique.
    expect(vacio).toMatch(/router\.push\(`\/buscar\?categoria=\$\{encodeURIComponent\(categoria\)\}&v=\$\{Date\.now\(\)\}`\)/)
    // "sin atajo": el destino de "Ver todas las fechas" no arrastra la fecha.
    expect(vacio).not.toMatch(/atajo=/)
    // "Todas las categorías" vuelve al modo de siempre.
    expect(vacio).toMatch(/onPress=\{\(\) => setCategoria\(null\)\}/)
  })

  it('cada botón del vacío es un botón accesible', () => {
    const vacio = entre(bloqueCategoria, 'eventosCategoria.length === 0', ') : (')
    expect(vacio.match(/<Pressable\b/g)).toHaveLength(2)
    expect(vacio.match(/accessibilityRole="button"/g)).toHaveLength(2)
  })

  // Mutación: agregar `await obtenerAlgo()` / `fetch(` en el modo categoría, o
  // importar una función nueva de @/lib/datos/.
  it('el modo categoría no pide red: las únicas funciones de @/lib/datos/ son las de la carga original', () => {
    const importaciones = [...codigo.matchAll(/import\s*\{([^}]*)\}\s*from\s*'@\/lib\/datos\/(\w+)'/g)]
    const importado = importaciones
      .flatMap((m) => m[1].split(',').map((s) => `${m[2]}:${s.trim().replace(/^type\s+/, '')}`))
      .filter((s) => !s.endsWith(':'))
      .sort()
    expect(importado).toEqual(
      [
        'cines:obtenerCines',
        'cines:Pelicula',
        'eventos:obtenerCategorias',
        'eventos:obtenerEventosVigentesParaInicio',
        'eventos:CategoriaBasica',
        'eventos:EventoVigenteParaInicio',
      ].sort(),
    )
    expect(codigo).not.toMatch(/\bfetch\s*\(/)
    expect(codigo).not.toMatch(/from\s*'@\/lib\/supabase/)
  })

  it('las llamadas a obtener*() viven solo dentro de cargarDatos (no en el useMemo ni en el JSX)', () => {
    const cargarDatos = entre(codigo, 'const cargarDatos = useCallback', 'const cargar = useCallback')
    const fueraDeCargar = codigo.replace(cargarDatos, '')
    expect(cargarDatos.match(/\bobtener\w+\(/g)).toHaveLength(3)
    expect(fueraDeCargar).not.toMatch(/\bobtener\w+\(/)
  })

  it('el cálculo del modo categoría (el useMemo de datosPortada) es síncrono: sin await ni promesas', () => {
    const memo = entre(codigo, 'const datosPortada = useMemo(', '[estado, atajo, categoria]')
    expect(memo).not.toMatch(/\bawait\b|\.then\(|\bfetch\b|\bPromise\b/)
    expect(memo).toMatch(/filtrarCombinado\(/)
  })

  // Mutación: sacar `accessibilityLiveRegion="polite"` del conteo.
  it('el conteo "N eventos" es una live region polite', () => {
    const conteo = entre(bloqueCategoria, 'accessibilityLiveRegion', '</Texto>')
    expect(conteo).toMatch(/accessibilityLiveRegion="polite"/)
    // R67, 67-c: el texto lo arma `conteoCategoria(películas, eventos)`.
    expect(conteo).toMatch(/conteoCategoria\(datosPortada\.peliculasCategoria\.length,\s*datosPortada\.eventosSinPelicula\.length\)/)
    expect(codigo).toMatch(/'evento'\s*:\s*'eventos'/)
    expect(codigo).toMatch(/'película'\s*:\s*'películas'/)
  })

  it('la grilla usa el resultado de filtrarCombinado (atajo + categoría), no la lista sin filtrar', () => {
    expect(codigo).toMatch(/eventosCategoria = filtrarCombinado\(items,\s*\{\s*atajo,\s*categoria\s*\},\s*ahora\)/)
    // R67, 67-c: la grilla de 2 columnas toma `eventosSinPelicula` (con otra
    // categoría, es todo `eventosCategoria`; con "Cine", lo que no es película).
    expect(bloqueCategoria).toMatch(/enFilasDeDos\(datosPortada\.eventosSinPelicula\)/)
    expect(codigo).toMatch(/eventosSinPelicula = eventosCategoria/)
  })

  // 66-r1 (B1 de ux-ui): el Hero mide ~60 % de la ventana y con una categoría
  // elegida empujaba la grilla fuera de pantalla. Mutación: volver a
  // `{datosPortada.carrusel.length > 0 ? <Hero` sin mirar `categoria`.
  it('el Hero solo se dibuja con "Todas" (categoria === null)', () => {
    const usos = jsx.match(/<Hero\b/g) ?? []
    expect(usos).toHaveLength(1)
    const antesDelHero = jsx.slice(0, jsx.indexOf('<Hero'))
    const condicion = antesDelHero.slice(antesDelHero.lastIndexOf('{'))
    expect(condicion).toMatch(/categoria === null\s*&&/)
  })
})

// ---------------------------------------------------------------------------
// 3. app/(tabs)/buscar.tsx
// ---------------------------------------------------------------------------
describe('Buscar (app/(tabs)/buscar.tsx) con fecha y categoría', () => {
  const codigo = sinComentarios(leer('app', '(tabs)', 'buscar.tsx'))

  // Mutación: `const atajoParam = params.atajo as Atajo | undefined`.
  it('lee `atajo` solo a través de atajoDesdeParametro (sin castear params.atajo a Atajo a mano)', () => {
    expect(codigo).toMatch(/import\s*\{[^}]*\batajoDesdeParametro\b[^}]*\}\s*from\s*'@qps\/core\/home\/filtros-combinados'/)
    const usos = codigo.match(/params\.atajo\b/g) ?? []
    expect(usos).toHaveLength(1)
    expect(codigo).toMatch(/atajoDesdeParametro\(params\.atajo\)/)
    expect(codigo).not.toMatch(/\bas\s+Atajo\b/)
    expect(codigo).not.toMatch(/<Atajo>\s*params/)
  })

  // Mutación: sacar `etiquetaTodas="Cualquier fecha"` de las pills.
  it('las pills de fecha llevan etiquetaTodas="Cualquier fecha" (atajo null = todas las fechas)', () => {
    expect(codigo).toMatch(/<PillsAtajos\b[^>]*\betiquetaTodas="Cualquier fecha"/)
    expect(codigo).toMatch(/const \[atajo, setAtajo\] = useState<Atajo \| null>\(atajoParam\)/)
  })

  // Mutación: sacar <ChipsCategorias> de Buscar.
  it('los chips de categoría están y solo se dibujan en modo resultados', () => {
    expect(codigo).toMatch(/import\s*\{\s*ChipsCategorias\s*\}\s*from\s*'@\/components\/ChipsCategorias'/)
    // 66-r1 (B2): ya no van en la cabecera fija sino en el `ListHeaderComponent`
    // de la lista de resultados (scrollean con ella), arriba del conteo.
    const cabeceraLista = codigo.slice(codigo.indexOf('data={resultadosMostrados}'), codigo.indexOf('ListEmptyComponent={\n            <View style={estilos.vacio}>'))
    expect(cabeceraLista).toMatch(/ListHeaderComponent=\{[\s\S]*<ChipsCategorias\b[^>]*seleccionada=\{categoriaFiltro\}[^>]*onCambiar=\{setCategoriaFiltro\}[\s\S]*accessibilityLiveRegion="polite"/)
    // Y no quedan chips en la parte fija: una sola aparición del JSX.
    expect(codigo.match(/<ChipsCategorias\b/g) ?? []).toHaveLength(1)
  })

  // Mutación: sacar las props de teclado de alguna de las dos FlatList.
  it('las dos listas cierran el teclado al arrastrar y no se tragan el primer toque', () => {
    expect(codigo.match(/keyboardShouldPersistTaps="handled"/g) ?? []).toHaveLength(2)
    expect(codigo.match(/keyboardDismissMode="on-drag"/g) ?? []).toHaveLength(2)
  })

  it('elegir una fecha cuenta como filtro: mostrarResultados incluye atajo !== null', () => {
    expect(codigo).toMatch(/const mostrarResultados = [^\n]*\batajo !== null/)
  })

  // Mutación: sacar uno de los dos botones, o dejarlos sin condición.
  it('el vacío ofrece "Ver todas las fechas" (si hay fecha) y "Todas las categorías" (si hay categoría)', () => {
    expect(codigo).toMatch(/if \(atajo !== null\) accionesVacio\.push\(\{\s*texto:\s*'Ver todas las fechas',\s*alTocar:\s*\(\) => setAtajo\(null\)\s*\}\)/)
    expect(codigo).toMatch(
      /if \(categoriaFiltro !== null\) accionesVacio\.push\(\{\s*texto:\s*'Todas las categorías',\s*alTocar:\s*\(\) => setCategoriaFiltro\(null\)\s*\}\)/,
    )
    const lista = entre(codigo, 'ListEmptyComponent={\n            <View style={estilos.vacio}>', 'ListFooterComponent')
    expect(lista).toMatch(/accionesVacio\.map\(/)
    expect(lista).toMatch(/accessibilityRole="button"/)
  })

  it('el botón del vacío mide al menos 44 de alto (clave botonVacio)', () => {
    const minimo = claveDeEstilo(codigo, 'botonVacio').match(/minHeight:\s*(\d+)/)
    expect(minimo).not.toBeNull()
    expect(Number(minimo![1])).toBeGreaterThanOrEqual(44)
  })

  it('los chips salen de filtrar SIN la categoría (para poder cambiarla), no de los resultados ya filtrados', () => {
    const bloque = entre(codigo, 'const categoriasParaChips = useMemo(', '[estado, texto, atajo, categoriaFiltro, soloGratisActivo]')
    expect(bloque).toMatch(/categoria:\s*null/)
    expect(bloque).toMatch(/categoriasDisponibles\(sinCategoria,/)
  })
})

// ---------------------------------------------------------------------------
// 4. components/PillsAtajos.tsx
// ---------------------------------------------------------------------------
describe('components/PillsAtajos.tsx: la pill "sin fecha" (etiquetaTodas)', () => {
  const codigo = sinComentarios(leer('components', 'PillsAtajos.tsx'))

  // Mutación: poner la pill `null` siempre, sin mirar `etiquetaTodas`.
  it('sin etiquetaTodas no hay pill extra: quedan solo los 4 atajos (la portada no cambia)', () => {
    expect(codigo).toMatch(/etiquetaTodas\s*\?\s*\[\{\s*id:\s*null,\s*etiqueta:\s*etiquetaTodas\s*\},\s*\.\.\.ATAJOS\]\s*:\s*ATAJOS/)
    const lista = entre(codigo, 'const ATAJOS', ']\n')
    expect(lista.match(/\bid:\s*'/g)).toHaveLength(4)
    expect(lista).not.toMatch(/id:\s*null/)
  })

  it('la unión discriminada: sin etiquetaTodas el atajo es un Atajo; con ella admite null', () => {
    const tipo = entre(codigo, 'export type PillsAtajosProps', 'const CLAVE_TODAS')
    expect(tipo).toMatch(/atajo:\s*Atajo;\s*onCambiar:\s*\(atajo:\s*Atajo\)\s*=>\s*void;\s*etiquetaTodas\?:\s*undefined/)
    expect(tipo).toMatch(/atajo:\s*Atajo \| null;\s*onCambiar:\s*\(atajo:\s*Atajo \| null\)\s*=>\s*void;\s*etiquetaTodas:\s*string/)
  })

  // Mutación: `medidas[atajo]` en el efecto, o `key={item.id}` sin `?? CLAVE_TODAS`.
  it('el resaltado usa una clave propia para null (en el efecto, en el onLayout y en la key)', () => {
    expect(codigo).toMatch(/const CLAVE_TODAS = 'todas'/)
    expect(codigo).toMatch(/medidas\[atajo \?\? CLAVE_TODAS\]/)
    expect(codigo).toMatch(/onLayout=\{\(e\) => registrarMedida\(item\.id \?\? CLAVE_TODAS, e\)\}/)
    expect(codigo).toMatch(/key=\{item\.id \?\? CLAVE_TODAS\}/)
  })

  it('la pill activa se decide por igualdad con `atajo` (también para null)', () => {
    expect(codigo).toMatch(/const activo = item\.id === atajo/)
  })

  it('la clave de CLAVE_TODAS no choca con el id de ningún atajo real', () => {
    const ids = [...codigo.matchAll(/\{\s*id:\s*'([\w-]+)'/g)].map((m) => m[1])
    expect(ids).toEqual(['hoy', 'esta-noche', 'finde', 'semana'])
    expect(ids).not.toContain('todas')
  })
})
