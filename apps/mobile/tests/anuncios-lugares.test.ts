// R60, 52-d: detector de LUGARES — `BannerAnuncio` (AdMob) solo se importa
// en `app/(tabs)/index.tsx` y `app/(tabs)/buscar.tsx`. Nunca en la ficha de
// un evento, en Cuenta, en el borrado/cambio de contraseña, en el Radar, ni
// en ningún otro archivo de `app/` o `components/` — regla (a) de Mauro del
// 19/10 (ningún anuncio arriba del pliegue, y en la app nunca en la ficha ni
// en el Hero de Inicio): este detector cubre la parte "nunca en la ficha" de
// forma barredora, no solo con un caso puntual por archivo.
//
// Precedente de detectores que "vigilaban" algo y no se podían poner en rojo
// (R54, R56): este NO usa `content.includes('BannerAnuncio')` sobre texto
// crudo. Mira el import/require de verdad (una vez quitados los
// comentarios, char por char, respetando strings) y, como contraprueba de
// que el detector sirve, exige que los dos archivos permitidos SÍ lo
// importen (si alguien borra los dos imports reales, este archivo tiene que
// fallar, no quedarse en verde "porque no encontró nada raro").
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { quitarComentarios as limpiarComentarios } from '@qps/core/tests/convencion-entorno'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))

const ARCHIVOS_PERMITIDOS = new Set(['app/(tabs)/index.tsx', 'app/(tabs)/buscar.tsx'])

// Explícitamente nombrados por la tarea (además de quedar cubiertos por el
// barrido general de abajo, que mira TODO app/ y components/).
const ARCHIVOS_PROHIBIDOS_EXPLICITOS = [
  'app/evento/[id].tsx',
  'app/(tabs)/cuenta.tsx',
  'app/eliminar-cuenta.tsx',
  'app/contrasena.tsx',
  'app/(tabs)/radar.tsx',
  'components/PantallaRadar.tsx',
]



// ---------------------------------------------------------------------------
// lineasConImportDeBannerAnuncio: línea (1-indexada) de cada import/require
// REAL de `BannerAnuncio`, sobre el código ya limpio de comentarios.
// ---------------------------------------------------------------------------
const REGEX_IMPORT_NOMBRADO = /import\s*\{[^}]*\bBannerAnuncio\b[^}]*\}\s*from\s*['"][^'"]+['"]/g
const REGEX_REQUIRE_DESESTRUCTURADO = /const\s*\{[^}]*\bBannerAnuncio\b[^}]*\}\s*=\s*(?:require\(|await\s+import\()/g

function lineasConImportDeBannerAnuncio(contenidoOriginal: string): number[] {
  const limpio = limpiarComentarios(contenidoOriginal)
  const lineas: number[] = []

  for (const regex of [REGEX_IMPORT_NOMBRADO, REGEX_REQUIRE_DESESTRUCTURADO]) {
    regex.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = regex.exec(limpio))) {
      const numeroLinea = limpio.slice(0, m.index).split('\n').length
      lineas.push(numeroLinea)
    }
  }

  return [...new Set(lineas)].sort((a, b) => a - b)
}

describe('limpiarComentarios (fixtures en memoria)', () => {
  it('quita un comentario de línea, sin tocar el código de la misma línea antes de él', () => {
    const limpio = limpiarComentarios('const x = 1 // esto es un comentario\nconst y = 2')
    expect(limpio).toContain('const x = 1')
    expect(limpio).not.toContain('esto es un comentario')
    expect(limpio).toContain('const y = 2')
  })

  it('quita un comentario de bloque de una sola línea', () => {
    const limpio = limpiarComentarios('const x = /* comentario */ 1')
    expect(limpio).not.toContain('comentario')
    expect(limpio).toContain('const x =')
    expect(limpio).toContain('1')
  })

  it('un comentario de bloque que cruza varias líneas no borra las líneas siguientes fuera del bloque', () => {
    const codigo = '/* inicio\nmedio\nfin */\nconst z = 3'
    const limpio = limpiarComentarios(codigo)
    expect(limpio).not.toContain('inicio')
    expect(limpio).not.toContain('medio')
    expect(limpio).toContain('const z = 3')
    // El número de líneas no cambia (los saltos de línea se preservan).
    expect(limpio.split('\n').length).toBe(codigo.split('\n').length)
  })

  it('no toca lo que está dentro de una cadena de texto (ni // ni /* dentro de comillas)', () => {
    const limpio = limpiarComentarios(`const url = "http://algo.com/*raro*/" // esto sí es comentario`)
    expect(limpio).toContain('"http://algo.com/*raro*/"')
    expect(limpio).not.toContain('esto sí es comentario')
  })

  // El caso que prueba la tarea explícitamente: un comentario de línea (`//`)
  // que, más adelante en la MISMA línea, contiene la secuencia `/*` (acá, en
  // una ruta con glob). Una implementación que busque el índice de `//` y el
  // de `/*` por separado y decida solo por "cuál aparece primero en el
  // archivo completo" (en vez de cuál abre primero EN LA LÍNEA, respetando
  // que `//` ya estaba activo) confundiría esa `/*` con la apertura de un
  // comentario de bloque y blanquearía todo el resto del archivo — incluido
  // el import real de más abajo.
  it('un comentario // que contiene /* más adelante en la misma línea no abre un comentario de bloque', () => {
    const codigo = [
      "// ver app/(tabs)/* para la lista de pantallas",
      "import { BannerAnuncio } from '@/components/BannerAnuncio'",
      'export const x = 1',
    ].join('\n')
    const limpio = limpiarComentarios(codigo)
    expect(limpio).not.toContain('ver app/(tabs)/* para la lista de pantallas')
    expect(limpio).toContain("import { BannerAnuncio } from '@/components/BannerAnuncio'")
    expect(limpio).toContain('export const x = 1')
  })
})

describe('lineasConImportDeBannerAnuncio (fixtures en memoria, tiene que poder dar positivo y negativo)', () => {
  it('un import real: una línea', () => {
    const codigo = "import { View } from 'react-native'\nimport { BannerAnuncio } from '@/components/BannerAnuncio'\n"
    expect(lineasConImportDeBannerAnuncio(codigo)).toEqual([2])
  })

  it('un comentario que solo MENCIONA BannerAnuncio: no cuenta', () => {
    const codigo = "// acá no se importa BannerAnuncio, a propósito\nexport const x = 1\n"
    expect(lineasConImportDeBannerAnuncio(codigo)).toEqual([])
  })

  it('el caso con // que contiene /* más adelante en la misma línea: SÍ detecta el import real de abajo', () => {
    const codigo = [
      "// ver app/(tabs)/* para la lista de pantallas",
      "import { BannerAnuncio } from '@/components/BannerAnuncio'",
    ].join('\n')
    expect(lineasConImportDeBannerAnuncio(codigo)).toEqual([2])
  })

  it('un identificador parecido (BannerAnuncioHelper) no cuenta (límite de palabra)', () => {
    const codigo = "import { BannerAnuncioHelper } from '@/components/BannerAnuncioHelper'\n"
    expect(lineasConImportDeBannerAnuncio(codigo)).toEqual([])
  })

  it('require desestructurado también cuenta', () => {
    const codigo = "const { BannerAnuncio } = require('@/components/BannerAnuncio')\n"
    expect(lineasConImportDeBannerAnuncio(codigo)).toEqual([1])
  })

  it('sin ningún import: []', () => {
    expect(lineasConImportDeBannerAnuncio('export const x = 1\n')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Barrido real sobre app/ y components/.
// ---------------------------------------------------------------------------
function archivosDe(dir: string): string[] {
  const resultado: string[] = []
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre)
    const info = statSync(ruta)
    if (info.isDirectory()) {
      resultado.push(...archivosDe(ruta))
    } else if (/\.tsx?$/.test(nombre)) {
      resultado.push(ruta)
    }
  }
  return resultado
}

function rutaRelativa(ruta: string): string {
  return relative(MOBILE_ROOT, ruta).split('\\').join('/')
}

const ARCHIVOS_A_REVISAR = [...archivosDe(join(MOBILE_ROOT, 'app')), ...archivosDe(join(MOBILE_ROOT, 'components'))]

const HALLAZGOS: { archivo: string; lineas: number[] }[] = ARCHIVOS_A_REVISAR.map((ruta) => ({
  archivo: rutaRelativa(ruta),
  lineas: lineasConImportDeBannerAnuncio(readFileSync(ruta, 'utf8')),
})).filter((h) => h.lineas.length > 0)

const HALLAZGOS_POR_ARCHIVO = new Map(HALLAZGOS.map((h) => [h.archivo, h.lineas]))

describe('BannerAnuncio: solo se importa en los dos lugares permitidos', () => {
  it('los dos archivos permitidos SÍ importan BannerAnuncio (si esto falla, el detector de abajo no sirve de nada)', () => {
    for (const archivo of ARCHIVOS_PERMITIDOS) {
      expect(HALLAZGOS_POR_ARCHIVO.get(archivo), `${archivo} debería importar BannerAnuncio`).toBeDefined()
      expect(HALLAZGOS_POR_ARCHIVO.get(archivo)!.length).toBeGreaterThan(0)
    }
  })

  it('ningún otro archivo de app/ o components/ importa BannerAnuncio', () => {
    const noPermitidos = HALLAZGOS.filter((h) => !ARCHIVOS_PERMITIDOS.has(h.archivo))
    const detalle = noPermitidos.map((h) => h.lineas.map((linea) => `${h.archivo}:${linea}`).join(', ')).join(' | ')
    expect(noPermitidos, `BannerAnuncio importado fuera de lugar: ${detalle}`).toEqual([])
  })

  it.each(ARCHIVOS_PROHIBIDOS_EXPLICITOS)('explícitamente: %s no importa BannerAnuncio', (archivo) => {
    expect(HALLAZGOS_POR_ARCHIVO.get(archivo)).toBeUndefined()
  })
})
