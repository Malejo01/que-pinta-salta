/**
 * La atribución de OpenFreeMap / OpenStreetMap (ODbL) no se apaga nunca, y el
 * mapa no mete HTML de terceros (R54, tarea 54-q). Detectores sobre el código
 * SIN comentarios: un comentario que nombra `attributionControl: false` o
 * `setHTML` ni hace fallar ni hace pasar un test.
 *
 * Sin red ni base; entorno `node`.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const WEB_ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)))

function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[^\S\n]*\/\/.*$/gm, '')
}

// ---------------------------------------------------------------------------
// Detectores (puros: reciben el texto)
// ---------------------------------------------------------------------------

/** Cada apagado de la atribución que encuentra en un archivo de código (ts/tsx/js/mjs). */
function apagadosEnCodigo(fuente: string): string[] {
  const codigo = sinComentarios(fuente)
  const hallazgos: string[] = []
  const patrones: [string, RegExp][] = [
    ['attributionControl: false', /\battributionControl\s*:\s*false\b/g],
    ['attributionControl={false}', /\battributionControl\s*=\s*\{\s*false\s*\}/g],
    ['attributionControl: !1', /\battributionControl\s*:\s*!\s*[01]\b/g],
  ]
  for (const [nombre, patron] of patrones) {
    if (patron.test(codigo)) hallazgos.push(nombre)
  }
  // Clases de Tailwind que esconden el control (`[&_.maplibregl-ctrl-attrib]:hidden`, `…:invisible`, …).
  for (const ficha of codigo.match(/\S*maplibregl-ctrl-attrib\S*/g) ?? []) {
    if (/hidden|invisible|opacity-0|sr-only|display|none|collapse/.test(ficha)) hallazgos.push(`clase que esconde ${ficha}`)
  }
  // Estilos en línea o en una cadena de CSS dentro de código.
  hallazgos.push(...cssQueEscondeLaAtribucion(codigo))
  return hallazgos
}

/** Las reglas CSS cuyo selector nombra el control de atribución y cuyo cuerpo lo esconde. */
function cssQueEscondeLaAtribucion(texto: string): string[] {
  const hallazgos: string[] = []
  for (const regla of sinComentarios(texto).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = regla[1]
    const cuerpo = regla[2]
    if (!/maplibregl-ctrl-attrib/.test(selector)) continue
    if (
      /display\s*:\s*none/i.test(cuerpo) ||
      /visibility\s*:\s*(?:hidden|collapse)/i.test(cuerpo) ||
      /opacity\s*:\s*0(?:\.0+)?\s*(?:!important)?\s*(?:;|$)/i.test(cuerpo) ||
      /(?:font-size|height|width)\s*:\s*0(?:px)?\s*(?:!important)?\s*(?:;|$)/i.test(cuerpo)
    ) {
      hallazgos.push(`${selector.trim()} { ${cuerpo.trim()} }`)
    }
  }
  return hallazgos
}

const HTML_DE_TERCEROS = ['setHTML', 'innerHTML', 'outerHTML', 'insertAdjacentHTML', 'dangerouslySetInnerHTML', 'document.write']

function htmlDeTerceros(fuente: string): string[] {
  const codigo = sinComentarios(fuente)
  return HTML_DE_TERCEROS.filter((nombre) => codigo.includes(nombre))
}

// ---------------------------------------------------------------------------
// Barrido
// ---------------------------------------------------------------------------

function archivos(dir: string, extensiones: RegExp): string[] {
  const salida: string[] = []
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name === 'node_modules' || entrada.name === '.next') continue
    const completa = path.join(dir, entrada.name)
    if (entrada.isDirectory()) salida.push(...archivos(completa, extensiones))
    else if (extensiones.test(entrada.name)) salida.push(completa)
  }
  return salida
}

const relativo = (archivo: string) => path.relative(WEB_ROOT, archivo).split(path.sep).join('/')

describe('los detectores (fixtures inventados)', () => {
  it('encuentran attributionControl apagado en sus formas', () => {
    expect(apagadosEnCodigo('new Map({ attributionControl: false })')).toEqual(['attributionControl: false'])
    expect(apagadosEnCodigo('new Map({attributionControl:false})')).toEqual(['attributionControl: false'])
    expect(apagadosEnCodigo('new Map({ attributionControl : false, style })')).toEqual(['attributionControl: false'])
    expect(apagadosEnCodigo('<Map attributionControl={false} />')).toEqual(['attributionControl={false}'])
    expect(apagadosEnCodigo('<Map attributionControl={ false } />')).toEqual(['attributionControl={false}'])
  })

  it('no marcan la atribución prendida, ni compacta, ni la palabra en otro contexto', () => {
    expect(apagadosEnCodigo('new Map({ attributionControl: { compact: true } })')).toEqual([])
    expect(apagadosEnCodigo('new Map({ attributionControl: true })')).toEqual([])
    expect(apagadosEnCodigo('<Map attributionControl={true} />')).toEqual([])
    expect(apagadosEnCodigo('const attributionControlFalse = 1')).toEqual([])
  })

  it('no hacen caso a los comentarios', () => {
    expect(apagadosEnCodigo('// attributionControl: false\nconst a = 1')).toEqual([])
    expect(apagadosEnCodigo('/* attributionControl={false} */')).toEqual([])
    expect(apagadosEnCodigo('/**\n * nunca attributionControl: false\n */\nconst a = 1')).toEqual([])
    expect(cssQueEscondeLaAtribucion('/* .maplibregl-ctrl-attrib { display: none } */')).toEqual([])
  })

  it('encuentran el CSS que esconde el control (display none, visibility hidden, opacity 0, tamaño 0), con !important y en @media', () => {
    expect(cssQueEscondeLaAtribucion('.maplibregl-ctrl-attrib { display: none }')).toHaveLength(1)
    expect(cssQueEscondeLaAtribucion('.maplibregl-ctrl-attrib{display:none!important;}')).toHaveLength(1)
    expect(cssQueEscondeLaAtribucion('.maplibregl-ctrl-attrib { visibility: hidden; }')).toHaveLength(1)
    expect(cssQueEscondeLaAtribucion('.maplibregl-ctrl-attrib { opacity: 0; }')).toHaveLength(1)
    expect(cssQueEscondeLaAtribucion('.maplibregl-ctrl-attrib { font-size: 0 }')).toHaveLength(1)
    expect(cssQueEscondeLaAtribucion('.maplibregl-ctrl-attrib-inner { display: none }')).toHaveLength(1)
    expect(cssQueEscondeLaAtribucion('.maplibregl-ctrl-attrib.maplibregl-compact { visibility: hidden }')).toHaveLength(1)
    expect(cssQueEscondeLaAtribucion('.mapa .a, .maplibregl-ctrl-attrib { display: none }')).toHaveLength(1)
    expect(cssQueEscondeLaAtribucion('@media (min-width: 640px) { .maplibregl-ctrl-attrib { display: none } }')).toHaveLength(1)
    expect(cssQueEscondeLaAtribucion('.maplibregl-ctrl-attrib {\n  color: red;\n  display: none;\n}')).toHaveLength(1)
  })

  it('no marcan CSS que solo estiliza la atribución, ni esconde otra cosa', () => {
    expect(cssQueEscondeLaAtribucion('.maplibregl-ctrl-attrib { color: red; background: white }')).toEqual([])
    expect(cssQueEscondeLaAtribucion('.maplibregl-ctrl-attrib { opacity: 0.9 }')).toEqual([])
    expect(cssQueEscondeLaAtribucion('.maplibregl-ctrl-scale { display: none }')).toEqual([])
    expect(cssQueEscondeLaAtribucion('.otra-cosa { display: none }\n.maplibregl-ctrl-attrib { color: red }')).toEqual([])
  })

  it('encuentran clases de Tailwind que esconden el control', () => {
    expect(apagadosEnCodigo('<div className="[&_.maplibregl-ctrl-attrib]:hidden" />')).toHaveLength(1)
    expect(apagadosEnCodigo('<div className="[&_.maplibregl-ctrl-attrib]:invisible" />')).toHaveLength(1)
    expect(apagadosEnCodigo('<div className="[&_.maplibregl-ctrl-attrib]:text-xs" />')).toEqual([])
  })

  it('el detector de HTML de terceros encuentra cada API y respeta los comentarios', () => {
    expect(htmlDeTerceros('popup.setHTML(`<b>${titulo}</b>`)')).toEqual(['setHTML'])
    expect(htmlDeTerceros('el.innerHTML = titulo')).toEqual(['innerHTML'])
    expect(htmlDeTerceros('<div dangerouslySetInnerHTML={{ __html: x }} />')).toEqual(['dangerouslySetInnerHTML'])
    expect(htmlDeTerceros('el.insertAdjacentHTML("beforeend", x)')).toContain('insertAdjacentHTML')
    expect(htmlDeTerceros('el.outerHTML = x')).toEqual(['outerHTML'])
    expect(htmlDeTerceros('// nunca setHTML\n/* innerHTML */\nconst a = 1')).toEqual([])
    expect(htmlDeTerceros('el.textContent = titulo')).toEqual([])
  })
})

describe('la atribución no se apaga en ningún lado de apps/web/{app,components,lib}', () => {
  const codigo = ['app', 'components', 'lib'].flatMap((carpeta) => archivos(path.join(WEB_ROOT, carpeta), /\.(?:tsx?|jsx?|mjs)$/))
  const estilos = ['app', 'components', 'lib'].flatMap((carpeta) => archivos(path.join(WEB_ROOT, carpeta), /\.(?:css|scss)$/))

  it('el barrido ve los archivos esperados (no está vacío)', () => {
    expect(codigo.length).toBeGreaterThan(100)
    expect(estilos.map(relativo)).toContain('app/globals.css')
    expect(codigo.map(relativo)).toContain('components/mapa/mapa-maplibre.tsx')
  })

  it('ningún archivo de código tiene attributionControl apagado ni una clase que esconda el control', () => {
    const malos = codigo.map((archivo) => [relativo(archivo), apagadosEnCodigo(readFileSync(archivo, 'utf8'))] as const).filter(([, h]) => h.length > 0)
    expect(malos).toEqual([])
  })

  it('ningún CSS esconde .maplibregl-ctrl-attrib', () => {
    const malos = estilos.map((archivo) => [relativo(archivo), cssQueEscondeLaAtribucion(readFileSync(archivo, 'utf8'))] as const).filter(([, h]) => h.length > 0)
    expect(malos).toEqual([])
  })

  it('mapa-maplibre.tsx deja el control prendido (compacto): lo declara explícitamente', () => {
    const fuente = sinComentarios(readFileSync(path.join(WEB_ROOT, 'components/mapa/mapa-maplibre.tsx'), 'utf8'))
    expect(fuente).toMatch(/attributionControl\s*:\s*\{\s*compact\s*:\s*true\s*\}/)
  })
})

describe('sin HTML de terceros en el mapa', () => {
  const dirs = [path.join(WEB_ROOT, 'components/mapa'), path.join(WEB_ROOT, 'app/mapa')]
  const del_mapa = dirs.flatMap((dir) => archivos(dir, /\.(?:tsx?|jsx?|mjs)$/))

  it('el barrido ve los archivos del mapa', () => {
    const nombres = del_mapa.map(relativo)
    expect(nombres).toEqual(
      expect.arrayContaining([
        'components/mapa/mapa-maplibre.tsx',
        'components/mapa/mapa-diferido.tsx',
        'components/mapa/lista-lugares.tsx',
        'app/mapa/page.tsx',
        'app/mapa/mapa-contenido.tsx',
      ])
    )
  })

  it.each(HTML_DE_TERCEROS)('%s no aparece en components/mapa/** ni en app/mapa/**', (api) => {
    const con = del_mapa.filter((archivo) => htmlDeTerceros(readFileSync(archivo, 'utf8')).includes(api)).map(relativo)
    expect(con).toEqual([])
  })

  it('el título de un evento scrapeado viaja como texto: en las propiedades del pin va solo venueId y cantidad', () => {
    const fuente = sinComentarios(readFileSync(path.join(WEB_ROOT, 'components/mapa/mapa-maplibre.tsx'), 'utf8'))
    expect(fuente).toContain('pinesAGeoJson')
    expect(fuente).not.toMatch(/\bPopup\b/)
    expect(fuente).not.toMatch(/\bMarker\b/)
  })
})
