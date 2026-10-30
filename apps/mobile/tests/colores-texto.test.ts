// 33-a (QPS-146, QPS-147): dos detectores estáticos, mismo estilo que
// `tests/base-visual.test.ts` y `tests/aperturas-url.test.ts` — fixtures en
// memoria primero (para que el detector "falle de verdad"), después
// aplicados a todos los archivos reales de `app/` y `components/` con
// `it.each`, sin montar nada de React Native ni tocar red/base.
//
// 1) `color: colors.border` / `color: colores.border` (el token de borde
//    usado como color de *texto*, casi invisible en tema claro — F4/QPS-147).
// 2) `placeholderTextColor={colors.border}` / `{colores.border}` (mismo
//    problema, pero en el placeholder de un `TextInput` suelto).
// 3) Un hex de rojo escrito a mano directo en un `color:` de estilo (en vez
//    de pasar por una constante con nombre, el patrón que ya usan
//    `CampoTexto.tsx` y `app/(tabs)/cuenta.tsx` desde F4 — QPS-146).
//
// Los tres quedan con alcance a `color:` (texto), no a `borderColor:` ni
// `backgroundColor:`: ese es justo el contraste que marca QPS-146/QPS-147
// (mensajes y textos secundarios que casi no se ven), no los bordes o
// fondos, que no tienen ese problema.
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { quitarComentarios } from '@qps/core/tests/convencion-entorno'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const APP_DIR = join(MOBILE_ROOT, 'app')
const COMPONENTS_DIR = join(MOBILE_ROOT, 'components')
const RUTA_BUSCAR = join(APP_DIR, '(tabs)', 'buscar.tsx')

export function listarTsxYTs(root: string): string[] {
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

// 33-q (pedido del plan: verificar de verdad qué recorre `listarTsxYTs` —
// ¿entra en subcarpetas anidadas?, ¿cuenta `.tsx` solamente?). Fixture
// sintética en un directorio temporal (no el repo real: así queda probado
// aunque hoy no haya ningún `.ts` suelto en `app/`/`components/`), limpiada
// al final con `rmSync`. Sin red ni base.
describe('listarTsxYTs: recursión y extensiones (fixture sintética, 33-q)', () => {
  const dirTemp = mkdtempSync(join(tmpdir(), 'colores-texto-detector-'))
  mkdirSync(join(dirTemp, 'sub', 'profundo'), { recursive: true })
  writeFileSync(join(dirTemp, 'raiz.tsx'), '')
  writeFileSync(join(dirTemp, 'logica.ts'), '')
  writeFileSync(join(dirTemp, 'sub', 'anidado.tsx'), '')
  writeFileSync(join(dirTemp, 'sub', 'profundo', 'bien-hondo.tsx'), '')
  writeFileSync(join(dirTemp, 'no-cuenta.js'), '')
  writeFileSync(join(dirTemp, 'tampoco.json'), '')

  afterAll(() => {
    rmSync(dirTemp, { recursive: true, force: true })
  })

  const encontrados = listarTsxYTs(dirTemp).map((f) => relative(dirTemp, f).replace(/\\/g, '/'))

  it('entra en subcarpetas anidadas (más de un nivel)', () => {
    expect(encontrados).toContain('sub/anidado.tsx')
    expect(encontrados).toContain('sub/profundo/bien-hondo.tsx')
  })

  it('cuenta .ts, no solo .tsx', () => {
    expect(encontrados).toContain('logica.ts')
  })

  it('no cuenta .js ni .json', () => {
    expect(encontrados).not.toContain('no-cuenta.js')
    expect(encontrados).not.toContain('tampoco.json')
  })

  it('son exactamente los 4 archivos de la fixture (ni más ni menos)', () => {
    expect(encontrados.length).toBe(4)
  })
})

/** Mismo stripper de comentarios que `tests/base-visual.test.ts` (línea por
 * línea, con comentarios de una línea y de bloque) — evitamos que un
 * comentario que menciona el patrón ("antes usaba colors.border...") cuente
 * como uso real. */


/** `true` si `content` usa `color: colors.border` o `color: colores.border`
 * (el token de borde, como color de *texto*), fuera de comentarios. No
 * confunde `borderColor:`/`backgroundColor:` (distinta clave de estilo). */
export function usaBorderComoColorDeTexto(content: string): boolean {
  const limpio = quitarComentarios(content)
  return /\bcolor:\s*colore?s\.border\b/.test(limpio)
}

/** `true` si `content` usa `placeholderTextColor={colors.border}` o
 * `{colores.border}` (mismo problema de contraste, pero en el placeholder de
 * un `TextInput` suelto). */
export function usaPlaceholderBorderComoColor(content: string): boolean {
  const limpio = quitarComentarios(content)
  return /placeholderTextColor\s*=\s*\{\s*colore?s\.border\s*\}/.test(limpio)
}

/** `#RRGGBB` -> `{r,g,b}` (0-255 cada uno). */
function hexARgb(hex: string): { r: number; g: number; b: number } {
  const limpio = hex.replace('#', '')
  return {
    r: parseInt(limpio.slice(0, 2), 16),
    g: parseInt(limpio.slice(2, 4), 16),
    b: parseInt(limpio.slice(4, 6), 16),
  }
}

/** `true` si el hex es "rojo" de verdad (matiz cercano a 0°/360°, no gris ni
 * demasiado oscuro): separa los rojos de error (`#dc2626`, `#f87171`,
 * `#ef4444`, `#ff0000`, ...) de colores con matiz distinto aunque tengan el
 * canal R alto (ámbar `#f59e0b`, verde `#4ade80`, azul, etc.). */
export function esHexRojo(hex: string): boolean {
  const { r, g, b } = hexARgb(hex)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  if (delta === 0 || max < 80) return false // gris o demasiado oscuro

  let hue: number
  if (max === r) hue = 60 * (((g - b) / delta) % 6)
  else if (max === g) hue = 60 * ((b - r) / delta + 2)
  else hue = 60 * ((r - g) / delta + 4)
  if (hue < 0) hue += 360

  return hue <= 20 || hue >= 340
}

/**
 * Hex de rojo escrito a mano, directo en el valor de un `color:` de estilo
 * (no en una constante con nombre aparte: `const COLOR_ERROR = '#f87171'`
 * seguido de `color: COLOR_ERROR` pasa limpio — es el patrón de F4 en
 * `CampoTexto.tsx` y `cuenta.tsx`). Devuelve los hex encontrados (vacío si
 * no hay ninguno).
 */
export function hexesRojosComoColorDeTexto(content: string): string[] {
  const limpio = quitarComentarios(content)
  const encontrados: string[] = []
  const reColor = /\bcolor:\s*([^,}]+)/g
  let m: RegExpExecArray | null
  while ((m = reColor.exec(limpio))) {
    const hexes = m[1].match(/#[0-9a-fA-F]{6}\b/g) ?? []
    for (const hex of hexes) {
      if (esHexRojo(hex)) encontrados.push(hex)
    }
  }
  return encontrados
}

describe('usaBorderComoColorDeTexto (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('detecta color: colors.border', () => {
    expect(usaBorderComoColorDeTexto('<Text style={{ color: colors.border }}>x</Text>')).toBe(true)
  })

  it('detecta color: colores.border (el hook de 8/9 tokens)', () => {
    expect(usaBorderComoColorDeTexto('{ color: colores.border }')).toBe(true)
  })

  it('no confunde borderColor: colors.border (es un borde, no texto)', () => {
    expect(usaBorderComoColorDeTexto('style={{ borderColor: colors.border }}')).toBe(false)
  })

  it('no confunde color: colors.mutedForeground (el token correcto)', () => {
    expect(usaBorderComoColorDeTexto('{ color: colores.mutedForeground }')).toBe(false)
  })

  it('no confunde un comentario que menciona "color: colors.border"', () => {
    expect(usaBorderComoColorDeTexto('// antes era color: colors.border, ahora mutedForeground')).toBe(false)
  })
})

describe('usaPlaceholderBorderComoColor (fixtures en memoria)', () => {
  it('detecta placeholderTextColor={colors.border}', () => {
    expect(usaPlaceholderBorderComoColor('<TextInput placeholderTextColor={colors.border} />')).toBe(true)
  })

  it('detecta placeholderTextColor={colores.border}', () => {
    expect(usaPlaceholderBorderComoColor('placeholderTextColor={colores.border}')).toBe(true)
  })

  it('no confunde placeholderTextColor={colores.mutedForeground}', () => {
    expect(usaPlaceholderBorderComoColor('placeholderTextColor={colores.mutedForeground}')).toBe(false)
  })

  it('no confunde placeholderTextColor={colores.muted} (CampoTexto, a propósito)', () => {
    expect(usaPlaceholderBorderComoColor('placeholderTextColor={colores.muted}')).toBe(false)
  })
})

describe('esHexRojo (fixtures en memoria)', () => {
  it('los rojos de error de la app: #dc2626, #f87171, #ef4444, #ff0000', () => {
    expect(esHexRojo('#dc2626')).toBe(true)
    expect(esHexRojo('#f87171')).toBe(true)
    expect(esHexRojo('#ef4444')).toBe(true)
    expect(esHexRojo('#ff0000')).toBe(true)
  })

  it('no confunde el ámbar del badge "Destacado" (#f59e0b)', () => {
    expect(esHexRojo('#f59e0b')).toBe(false)
  })

  it('no confunde el verde de "Gratis" (#4ade80) ni el de "Solo gratis" (#059669)', () => {
    expect(esHexRojo('#4ade80')).toBe(false)
    expect(esHexRojo('#059669')).toBe(false)
  })

  it('no confunde el azul/amarillo del logo de Google (#4285F4, #FBBC05)', () => {
    expect(esHexRojo('#4285F4')).toBe(false)
    expect(esHexRojo('#FBBC05')).toBe(false)
  })

  it('no confunde blanco/negro/gris', () => {
    expect(esHexRojo('#ffffff')).toBe(false)
    expect(esHexRojo('#000000')).toBe(false)
    expect(esHexRojo('#888888')).toBe(false)
  })
})

describe('hexesRojosComoColorDeTexto (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('detecta el bug real (antes de 33-a): color: mensaje.tipo === "error" ? \'#dc2626\' : colores.foreground', () => {
    const fixture = `<Texto style={{ color: mensaje.tipo === 'error' ? '#dc2626' : colores.foreground }}>{mensaje.texto}</Texto>`
    expect(hexesRojosComoColorDeTexto(fixture)).toEqual(['#dc2626'])
  })

  it('no confunde una constante con nombre (el patrón de F4): const COLOR_ERROR = \'#f87171\'', () => {
    const fixture = `const COLOR_ERROR = '#f87171'\n<Texto style={{ color: COLOR_ERROR }}>{texto}</Texto>`
    expect(hexesRojosComoColorDeTexto(fixture)).toEqual([])
  })

  it('no confunde borderColor con un hex rojo (no es texto)', () => {
    expect(hexesRojosComoColorDeTexto(`{ borderColor: ok ? '#f87171' : colores.primary }`)).toEqual([])
  })

  it('no confunde backgroundColor con un hex rojo (no es texto)', () => {
    expect(hexesRojosComoColorDeTexto(`{ backgroundColor: '#dc2626' }`)).toEqual([])
  })

  it('no confunde un color: con un hex que no es rojo (ámbar, verde)', () => {
    expect(hexesRojosComoColorDeTexto(`{ color: '#f59e0b' }`)).toEqual([])
    expect(hexesRojosComoColorDeTexto(`{ color: '#4ade80' }`)).toEqual([])
  })

  it('un archivo sin ningún color: rojo: []', () => {
    expect(hexesRojosComoColorDeTexto('export function Foo() { return null }')).toEqual([])
  })
})

/**
 * Lista de excepciones documentadas (archivo + motivo). Vacía a propósito
 * (33-a): los tres detectores, con el alcance de arriba (`color:`/
 * `placeholderTextColor=`, nunca `borderColor:`/`backgroundColor:`/props de
 * ícono como `fill=`), no encuentran violaciones reales en ningún archivo de
 * `app/` ni `components/` hoy. Si una tarea futura necesita un rojo fijo (o
 * `border` como texto) en un caso puntual, se suma acá con el archivo y el
 * motivo, no se amplía el detector para "dejarlo pasar" en silencio.
 */
const EXCEPCIONES: readonly string[] = []

describe('app/ y components/: ningún texto usa colors.border/colores.border, ni placeholderTextColor={colors.border}, ni un hex de rojo escrito a mano', () => {
  const archivos = [...listarTsxYTs(APP_DIR), ...listarTsxYTs(COMPONENTS_DIR)]

  it('encuentra al menos un archivo para analizar', () => {
    expect(archivos.length).toBeGreaterThan(0)
  })

  // 33-q (hueco de evasión, pedido del plan): "encuentra al menos un
  // archivo" es tan débil que alguien podría achicar `listarTsxYTs` (dejar
  // de recursar en subcarpetas, o filtrar solo `buscar.tsx`/lo que tocó esta
  // ronda) sin que ningún test se ponga en rojo — simplemente habría menos
  // casos en el `it.each` de abajo, todos en verde. Estas aserciones fijan
  // que la lista de verdad cubre pantallas y componentes que esta ronda NO
  // tocó (app/evento, app/flyer, app/pelicula, app/cines, las demás pestañas,
  // bienvenida, +not-found, _layout, y componentes como PantallaRadar,
  // TarjetaEvento, Hero) y que no es sospechosamente chica.
  describe('cobertura real: no se achica en silencio (33-q)', () => {
    const relativos = archivos.map((f) => relative(MOBILE_ROOT, f).replace(/\\/g, '/'))

    it.each([
      'app/evento/[id].tsx',
      'app/flyer/[id].tsx',
      'app/pelicula/[id].tsx',
      'app/cines.tsx',
      'app/bienvenida.tsx',
      'app/+not-found.tsx',
      'app/_layout.tsx',
      'app/(tabs)/radar.tsx',
      'app/(tabs)/favoritos.tsx',
      'app/(tabs)/index.tsx',
      'app/(tabs)/_layout.tsx',
      'components/PantallaRadar.tsx',
      'components/TarjetaEvento.tsx',
      'components/Hero.tsx',
      'components/Icono.tsx',
    ])('incluye %s (pantalla/componente que esta ronda NO tocó)', (esperado) => {
      expect(relativos).toContain(esperado)
    })

    it('son al menos 25 archivos (si alguien achica la recursión o el filtro, esto cae)', () => {
      expect(archivos.length).toBeGreaterThanOrEqual(25)
    })
  })

  it.each(archivos.map((file) => [relative(MOBILE_ROOT, file), file] as const))('%s', (label, file) => {
    if (EXCEPCIONES.includes(label)) return
    const content = readFileSync(file, 'utf8')
    const problemas: string[] = []
    if (usaBorderComoColorDeTexto(content)) problemas.push('usa colors.border/colores.border como color de texto')
    if (usaPlaceholderBorderComoColor(content)) problemas.push('usa placeholderTextColor={colors.border}/{colores.border}')
    const hexesRojos = hexesRojosComoColorDeTexto(content)
    if (hexesRojos.length > 0) problemas.push(`hex de rojo escrito a mano en color: (${hexesRojos.join(', ')})`)
    if (problemas.length > 0) {
      throw new Error(`${label}: ${problemas.join('; ')}`)
    }
    expect(problemas).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Las tres correcciones puntuales de 33-a, con el texto real de los
// archivos (no solo el detector genérico de arriba).
// ---------------------------------------------------------------------------
describe('33-a: las correcciones puntuales (QPS-146, QPS-147)', () => {
  const SRC_NOTIFICACIONES = readFileSync(join(COMPONENTS_DIR, 'SeccionNotificaciones.tsx'), 'utf8')
  const SRC_ASISTENCIA = readFileSync(join(COMPONENTS_DIR, 'BotonesAsistencia.tsx'), 'utf8')

  it('SeccionNotificaciones.tsx: ya no tiene #dc2626 escrito a mano fuera de comentarios', () => {
    expect(quitarComentarios(SRC_NOTIFICACIONES)).not.toContain('#dc2626')
  })

  it('BotonesAsistencia.tsx: los dos mensajes (no-disponible y "Entrá para marcar") usan colores.mutedForeground', () => {
    expect(SRC_ASISTENCIA).toMatch(/MENSAJE_NO_DISPONIBLE\}<\/Text>/)
    expect(SRC_ASISTENCIA).not.toMatch(/color:\s*colors\.border/)
    const ocurrencias = SRC_ASISTENCIA.match(/color:\s*colores\.mutedForeground/g) ?? []
    expect(ocurrencias.length).toBeGreaterThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------
// QPS-151: Buscar usa CampoTexto, no un TextInput suelto.
// ---------------------------------------------------------------------------
describe('app/(tabs)/buscar.tsx: usa CampoTexto (QPS-151)', () => {
  const SRC_BUSCAR = readFileSync(RUTA_BUSCAR, 'utf8')

  it('importa CampoTexto de @/components/CampoTexto', () => {
    expect(SRC_BUSCAR).toMatch(/import\s*\{\s*CampoTexto\s*\}\s*from\s*['"]@\/components\/CampoTexto['"]/)
  })

  it('usa <CampoTexto en el input de búsqueda', () => {
    expect(SRC_BUSCAR).toMatch(/<CampoTexto\b/)
  })
})

// ---------------------------------------------------------------------------
// 33-a, vuelta 1 (revisor, bloqueante): al migrar a CampoTexto se perdió el
// botón de limpiar la búsqueda ("X"). Vuelve con la prop `accionDerecha` de
// CampoTexto (aditiva), con el mismo Pressable/accessibilityLabel/hitSlop de
// antes, visible solo con texto.
// ---------------------------------------------------------------------------
describe('app/(tabs)/buscar.tsx: el botón de limpiar vuelve con accionDerecha (33-a, vuelta 1)', () => {
  const SRC_BUSCAR = readFileSync(RUTA_BUSCAR, 'utf8')

  it('le pasa accionDerecha a <CampoTexto', () => {
    expect(SRC_BUSCAR).toMatch(/<CampoTexto[\s\S]*?accionDerecha=/)
  })

  it('el botón de limpiar: mismo accessibilityLabel, hitSlop y onPress que el TextInput suelto de antes', () => {
    expect(SRC_BUSCAR).toContain('accessibilityLabel="Limpiar búsqueda"')
    expect(SRC_BUSCAR).toMatch(/hitSlop=\{8\}/)
    expect(SRC_BUSCAR).toMatch(/onPress=\{\(\)\s*=>\s*setTexto\(''\)\}/)
  })

  it('el botón solo aparece con texto (condicionado a "texto ?", igual que antes)', () => {
    const idxAccion = SRC_BUSCAR.indexOf('accionDerecha=')
    expect(idxAccion).toBeGreaterThan(-1)
    const tramo = SRC_BUSCAR.slice(idxAccion, idxAccion + 80)
    expect(tramo).toMatch(/texto\s*\?/)
  })
})

// ---------------------------------------------------------------------------
// 33-a, vuelta 1: CampoTexto.tsx gana `accionDerecha` (prop opcional,
// aditiva — sin ella se comporta exactamente igual que antes: Cuenta y
// Notificaciones no cambian en nada, y la rama de `conOjito` sigue intacta).
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 33-a, vuelta 2 (revisor, QPS-146): CampoTexto.tsx era la única de las tres
// copias del rojo de error que todavía dependía de `useColorScheme()` — el
// esquema del SISTEMA, no el de `useColoresQPS()` (D1: siempre oscuro). Con
// el teléfono en claro, elegía `#dc2626` (pensado para fondo claro) sobre
// `colores.card`, que sigue oscuro: 4,07:1, abajo del 4,5:1 de AA.
//
// Mismo criterio que `tests/layout.test.ts` después del paso de qa: no basta
// con `.toMatch` sobre el texto crudo (se evade comentando el import real y
// dejando, al lado, la línea buena comentada, o con un alias de import:
// `useColorScheme as useEsquemaSistema`) — hay que usar `quitarComentarios`
// y, para el alias, quedarse con el nombre de ANTES del `as` para saber a
// qué identificador local quedó ligado `useColorScheme`.
// ---------------------------------------------------------------------------

/** Nombre local al que queda ligado `useColorScheme` de `'react-native'`
 * (contempla `useColorScheme as otroNombre`), o `null` si el archivo no lo
 * importa de ahí. Fuera de comentarios. */
export function nombreLocalDeUseColorScheme(content: string): string | null {
  const limpio = quitarComentarios(content)
  const bloque = limpio.match(/import\s*\{([^}]*)\}\s*from\s*['"]react-native['"]/)
  if (!bloque) return null
  const m = bloque[1].match(/\buseColorScheme\b(?:\s+as\s+(\w+))?/)
  if (!m) return null
  return m[1] ?? 'useColorScheme'
}

/**
 * `true` si `content` usa el resultado de `useColorScheme()` (con cualquier
 * alias de import) para elegir, con una comparación contra `'dark'`, entre
 * dos valores que resuelven a un hex rojo (literal, o una constante
 * `const NOMBRE = '#hex'` declarada en el mismo archivo) — el patrón exacto
 * que causaba QPS-146 en `CampoTexto.tsx`. Fuera de comentarios.
 */
export function eligeColorDeErrorSegunEsquema(content: string): boolean {
  const limpio = quitarComentarios(content)
  const nombreLocal = nombreLocalDeUseColorScheme(limpio)
  if (!nombreLocal) return false
  if (!new RegExp(`\\b${nombreLocal}\\s*\\(\\s*\\)`).test(limpio)) return false

  const constantes = new Map<string, string>()
  const reConst = /\bconst\s+([A-Z_][A-Z0-9_]*)\s*=\s*['"](#[0-9a-fA-F]{3,8})['"]/g
  let mConst: RegExpExecArray | null
  while ((mConst = reConst.exec(limpio))) constantes.set(mConst[1], mConst[2])

  const resolver = (expresion: string): string | null => {
    const recortado = expresion.trim()
    const comoHex = recortado.match(/^['"](#[0-9a-fA-F]{3,8})['"]$/)
    if (comoHex) return comoHex[1]
    return constantes.get(recortado) ?? null
  }

  const reTernario = /===\s*['"]dark['"]\s*\?\s*([^:]+):\s*([^;\n,)}]+)/g
  let mTern: RegExpExecArray | null
  while ((mTern = reTernario.exec(limpio))) {
    const a = resolver(mTern[1])
    const b = resolver(mTern[2])
    if ((a && esHexRojo(a)) || (b && esHexRojo(b))) return true
  }
  return false
}

describe('nombreLocalDeUseColorScheme / eligeColorDeErrorSegunEsquema (fixtures en memoria: tienen que fallar de verdad)', () => {
  it('detecta el bug real (antes de la vuelta 2): ROJO_ERROR_CLARO/OSCURO según esquema === "dark"', () => {
    const fixture = `
      import { useColorScheme } from 'react-native'
      const ROJO_ERROR_CLARO = '#dc2626'
      const ROJO_ERROR_OSCURO = '#f87171'
      const esquema = useColorScheme()
      const colorError = esquema === 'dark' ? ROJO_ERROR_OSCURO : ROJO_ERROR_CLARO
    `
    expect(nombreLocalDeUseColorScheme(fixture)).toBe('useColorScheme')
    expect(eligeColorDeErrorSegunEsquema(fixture)).toBe(true)
  })

  it('no se deja engañar por un alias de import (useColorScheme as useEsquemaSistema)', () => {
    const fixture = `
      import { useColorScheme as useEsquemaSistema } from 'react-native'
      const ROJO_ERROR_CLARO = '#dc2626'
      const ROJO_ERROR_OSCURO = '#f87171'
      const esquema = useEsquemaSistema()
      const colorError = esquema === 'dark' ? ROJO_ERROR_OSCURO : ROJO_ERROR_CLARO
    `
    expect(nombreLocalDeUseColorScheme(fixture)).toBe('useEsquemaSistema')
    expect(eligeColorDeErrorSegunEsquema(fixture)).toBe(true)
  })

  it('no se deja engañar por el import real comentado y la línea buena (COLOR_ERROR fijo) comentada al lado de la rota', () => {
    const fixture = `
      // import { useColorScheme } from 'react-native'
      // const COLOR_ERROR = '#f87171'
      import { useColorScheme } from 'react-native'
      const ROJO_ERROR_CLARO = '#dc2626'
      const ROJO_ERROR_OSCURO = '#f87171'
      const esquema = useColorScheme()
      const colorError = esquema === 'dark' ? ROJO_ERROR_OSCURO : ROJO_ERROR_CLARO
    `
    // Sigue en true: el import y el ternario reales (sin comentar) siguen el
    // patrón viejo — lo único comentado es una copia extra, no alcanza con
    // comentar "al lado" para que el detector dé un falso negativo.
    expect(eligeColorDeErrorSegunEsquema(fixture)).toBe(true)
  })

  it('no detecta nada si todo el bloque viejo está comentado y el real ya es COLOR_ERROR fijo (el arreglo real)', () => {
    const fixture = `
      // const esquema = useColorScheme()
      // const colorError = esquema === 'dark' ? ROJO_ERROR_OSCURO : ROJO_ERROR_CLARO
      const COLOR_ERROR = '#f87171'
      const x = { color: COLOR_ERROR }
    `
    expect(nombreLocalDeUseColorScheme(fixture)).toBeNull()
    expect(eligeColorDeErrorSegunEsquema(fixture)).toBe(false)
  })

  it('no confunde un useColorScheme importado pero usado para otra cosa (sin ternario de rojo)', () => {
    const fixture = `
      import { useColorScheme } from 'react-native'
      const esquema = useColorScheme()
      console.log(esquema)
    `
    expect(eligeColorDeErrorSegunEsquema(fixture)).toBe(false)
  })

  it('sin ningún import de useColorScheme: null/false', () => {
    const fixture = `import { View } from 'react-native'\nexport function Foo() { return null }`
    expect(nombreLocalDeUseColorScheme(fixture)).toBeNull()
    expect(eligeColorDeErrorSegunEsquema(fixture)).toBe(false)
  })
})

describe('CampoTexto.tsx: ya no elige el color de error según useColorScheme() (33-a, vuelta 2, QPS-146)', () => {
  const SRC_CAMPO_TEXTO = readFileSync(join(COMPONENTS_DIR, 'CampoTexto.tsx'), 'utf8')

  it('no usa useColorScheme (de ningún alias) para elegir el color de error', () => {
    expect(eligeColorDeErrorSegunEsquema(SRC_CAMPO_TEXTO)).toBe(false)
  })

  it('fija COLOR_ERROR = \'#f87171\', mismo valor que cuenta.tsx y SeccionNotificaciones.tsx', () => {
    expect(quitarComentarios(SRC_CAMPO_TEXTO)).toMatch(/\bconst\s+COLOR_ERROR\s*=\s*'#f87171'/)
  })
})

describe('CampoTexto.tsx: accionDerecha (33-a, vuelta 1, QPS-151)', () => {
  const SRC_CAMPO_TEXTO = readFileSync(join(COMPONENTS_DIR, 'CampoTexto.tsx'), 'utf8')

  it('declara accionDerecha como prop opcional (ReactNode)', () => {
    expect(SRC_CAMPO_TEXTO).toMatch(/accionDerecha\?\s*:\s*ReactNode/)
  })

  it('la renderiza dentro de la caja (después del TextInput y del "ojito", antes del error, que está afuera de la caja)', () => {
    const idxTextInput = SRC_CAMPO_TEXTO.indexOf('<TextInput')
    const idxAccion = SRC_CAMPO_TEXTO.indexOf('{accionDerecha}')
    const idxError = SRC_CAMPO_TEXTO.indexOf('{error ?')
    expect(idxTextInput).toBeGreaterThan(-1)
    expect(idxError).toBeGreaterThan(-1)
    // Si CampoTexto deja de renderizar accionDerecha (o lo saca de la caja),
    // este test tiene que fallar: idxAccion pasa a -1, o queda fuera del
    // tramo [idxTextInput, idxError).
    expect(idxAccion).toBeGreaterThan(idxTextInput)
    expect(idxAccion).toBeLessThan(idxError)
  })

  it('no toca la rama de conOjito: sigue el "ojito" con los dos accessibilityLabel', () => {
    expect(SRC_CAMPO_TEXTO).toContain('Mostrar contraseña')
    expect(SRC_CAMPO_TEXTO).toContain('Ocultar contraseña')
  })
})
