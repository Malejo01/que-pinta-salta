/**
 * Detectores de `/mapa` (R54, tarea 54-b): MapLibre vive en un solo archivo y
 * se carga diferido, la atribución no se apaga, el mapa no dibuja HTML y los
 * `"use client"` son los justos. Sin red ni base; entorno `node`.
 *
 * Los detectores leen el código SIN comentarios: un comentario que nombre la
 * clase o la palabra no hace pasar ni fallar un test.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { quitarComentarios as sinComentarios } from '@qps/core/tests/convencion-entorno'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))

const MAPLIBRE = 'components/mapa/mapa-maplibre.tsx'
const PIN_MAPLIBRE = 'components/mapa/mapa-pin-maplibre.tsx'
const TEXTOS = 'components/mapa/textos-maplibre.ts'
const DIFERIDO = 'components/mapa/mapa-diferido.tsx'
const LISTA = 'components/mapa/lista-lugares.tsx'
const FILTROS = 'components/mapa/filtros-mapa.tsx'
const CONTENIDO = 'app/mapa/mapa-contenido.tsx'
const PAGINA = 'app/mapa/page.tsx'
const LOADING = 'app/mapa/loading.tsx'
const NUEVOS = [MAPLIBRE, DIFERIDO, LISTA, FILTROS, CONTENIDO, PAGINA, LOADING]
const CLIENTE = [CONTENIDO, DIFERIDO, MAPLIBRE]

/** El código sin comentarios de bloque ni de línea completa. */


function leer(relativa: string): string {
  return sinComentarios(readFileSync(path.join(WEB_ROOT, relativa), 'utf8'))
}

function archivosDe(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = path.join(dir, nombre)
    return statSync(ruta).isDirectory() ? archivosDe(ruta) : [ruta]
  })
}

/** Todo el código de la web que llega al navegador o al servidor (sin tests ni node_modules). */
const CODIGO = ['app', 'components', 'lib']
  .flatMap((dir) => archivosDe(path.join(WEB_ROOT, dir)))
  .filter((ruta) => /\.(ts|tsx)$/.test(ruta))
  .map((ruta) => path.relative(WEB_ROOT, ruta).split(path.sep).join('/'))

/** Un texto que nombra el paquete: `from 'maplibre-gl'`, `import 'maplibre-gl/dist/…'`. */
const NOMBRA_MAPLIBRE = /['"]maplibre-gl(?:\/[^'"]*)?['"]/
const IMPORT_DINAMICO_MAPA = /import\(\s*['"][^'"]*mapa-maplibre['"]\s*\)/g
/** Fija la URL del worker de MapLibre (Q3): lo carga mapa-diferido con import(). */
const WORKER = 'components/mapa/maplibre-worker.ts'

describe('el barrido mira algo', () => {
  it('encuentra los archivos nuevos y bastante código de la web', () => {
    expect(CODIGO.length).toBeGreaterThan(100)
    for (const nuevo of NUEVOS) expect(CODIGO).toContain(nuevo)
  })
})

describe('maplibre-gl se importa en tres archivos (el mapa, el mapa del pin y el worker)', () => {
  it('solo mapa-maplibre.tsx, mapa-pin-maplibre.tsx y maplibre-worker.ts nombran el paquete (o su CSS) en app, components y lib', () => {
    const nombran = CODIGO.filter((ruta) => NOMBRA_MAPLIBRE.test(leer(ruta)))
    expect(nombran.sort()).toEqual([WORKER, MAPLIBRE, PIN_MAPLIBRE].sort())
  })

  // Q3: Turbopack reemplaza el `import.meta.url` de MapLibre por un file:///
  // del servidor y el worker no arranca (en `next build` también). La URL se
  // fija con setWorkerUrl en un módulo aparte, que mapa-diferido carga con
  // import() antes que el mapa: sigue sin haber MapLibre en la carga inicial.
  it('maplibre-worker fija la URL del worker con new URL(…, import.meta.url)', () => {
    const codigo = leer(WORKER)
    expect(codigo).toMatch(/import\s*\{\s*setWorkerUrl\s*\}\s*from\s*['"]maplibre-gl['"]/)
    expect(codigo).toMatch(/setWorkerUrl\(\s*new URL\(\s*['"]maplibre-gl\/dist\/maplibre-gl-worker\.mjs['"],\s*import\.meta\.url\s*\)\.href\s*\)/)
  })

  it('mapa-diferido carga maplibre-worker con import() y recién después el mapa; fuera de components/mapa nadie lo importa', () => {
    const codigo = leer(DIFERIDO)
    const worker = codigo.search(/import\(\s*['"]\.\/maplibre-worker['"]\s*\)/)
    const mapa = codigo.search(IMPORT_DINAMICO_MAPA)
    expect(worker).toBeGreaterThan(-1)
    expect(mapa).toBeGreaterThan(worker)
    // Solo los módulos del mapa lo cargan (el pin de /admin/lugares del PR #98
    // puede sumarlo); la carga inicial de una página nunca.
    const loNombran = CODIGO.filter((ruta) => ruta !== WORKER && leer(ruta).includes('maplibre-worker'))
    expect(loNombran).toContain(DIFERIDO)
    for (const ruta of loNombran) expect(ruta.startsWith('components/mapa/')).toBe(true)
    expect(codigo).not.toMatch(/from\s*['"][^'"]*maplibre-worker['"]/)
  })

  // R76: el pin de /admin/lugares (#98) tenía el mismo bug del worker. Lo
  // arregla un import sin `from` arriba de todo (propuesta del #123): el orden
  // de los módulos ES fija la URL antes de cualquier `new Map`.
  it('mapa-pin-maplibre importa maplibre-worker sin `from`, antes que maplibre-gl', () => {
    const codigo = leer(PIN_MAPLIBRE)
    const worker = codigo.search(/import\s*['"]\.\/maplibre-worker['"]/)
    expect(worker).toBeGreaterThan(-1)
    expect(codigo.search(/from\s*['"]maplibre-gl['"]/)).toBeGreaterThan(worker)
    expect(codigo).not.toMatch(/from\s*['"][^'"]*maplibre-worker['"]/)
  })

  it('mapa-maplibre importa el paquete y su CSS', () => {
    const codigo = leer(MAPLIBRE)
    expect(codigo).toMatch(/from\s*['"]maplibre-gl['"]/)
    expect(codigo).toMatch(/import\s*['"]maplibre-gl\/dist\/maplibre-gl\.css['"]/)
  })
})

describe('mapa-maplibre se carga solo con import() desde mapa-diferido', () => {
  it('mapa-diferido lo pide con un import() dinámico', () => {
    expect(leer(DIFERIDO).match(IMPORT_DINAMICO_MAPA)).toHaveLength(1)
  })

  it('ningún archivo lo nombra fuera de un import() (ni siquiera un import de tipo)', () => {
    const nombran = CODIGO.filter((ruta) => ruta !== MAPLIBRE)
      .filter((ruta) => leer(ruta).replace(IMPORT_DINAMICO_MAPA, '').includes('mapa-maplibre'))
    expect(nombran).toEqual([])
  })

  it('mapa-diferido espera a que el contenedor se vea y el navegador esté libre', () => {
    const codigo = leer(DIFERIDO)
    expect(codigo).toMatch(/new IntersectionObserver\(/)
    expect(codigo).toMatch(/rootMargin:\s*['"]200px['"]/)
    expect(codigo).toMatch(/requestIdleCallback/)
    expect(codigo).toMatch(/setTimeout\(\s*tarea\s*,\s*1\s*\)/)
  })

  it('mapa-diferido avisa si el mapa no carga', () => {
    expect(leer(DIFERIDO)).toContain('No pudimos cargar el mapa. La lista tiene los mismos lugares.')
  })
})

describe('la atribución y el HTML', () => {
  it.each(NUEVOS)('%s no apaga la atribución ni dibuja HTML', (ruta) => {
    const codigo = leer(ruta)
    expect(codigo).not.toMatch(/attributionControl\s*:\s*false/)
    expect(codigo).not.toMatch(/setHTML/)
    expect(codigo).not.toMatch(/dangerouslySetInnerHTML/)
    expect(codigo).not.toMatch(/innerHTML/)
    expect(codigo).not.toMatch(/\bPopup\b/)
  })

  it('mapa-maplibre deja la atribución prendida (compacta)', () => {
    expect(leer(MAPLIBRE)).toMatch(/attributionControl\s*:\s*\{\s*compact:\s*true\s*\}/)
  })
})

describe('mapa-maplibre usa core para el estilo y los pines', () => {
  const codigo = leer(MAPLIBRE)

  it('importa estiloSegunTema y pinesAGeoJson de core y los usa', () => {
    expect(codigo).toMatch(/import\s*\{[^}]*\bestiloSegunTema\b[^}]*\}\s*from\s*['"]@qps\/core\/mapa\/estilos['"]/)
    expect(codigo).toMatch(/import\s*\{[^}]*\bpinesAGeoJson\b[^}]*\}\s*from\s*['"]@qps\/core\/mapa\/pines['"]/)
    expect(codigo).toMatch(/estiloSegunTema\(/)
    expect(codigo).toMatch(/pinesAGeoJson\(/)
  })

  it('no escribe a mano la URL del estilo ni el GeoJSON', () => {
    expect(codigo).not.toMatch(/openfreemap/i)
    expect(codigo).not.toMatch(/https?:\/\//)
    expect(codigo).not.toMatch(/FeatureCollection/)
    expect(codigo).not.toMatch(/['"]Feature['"]/)
  })

  it('el color del pin sale de la variable --primary, no de un hex escrito a mano', () => {
    expect(codigo).toMatch(/getPropertyValue\(\s*['"]--primary['"]\s*\)/)
    expect(codigo).toMatch(/'circle-color'|"circle-color"/)
  })

  it('al cambiar el tema o los pines actualiza el mapa, y lo destruye al desmontar', () => {
    expect(codigo).toMatch(/\.setStyle\(/)
    expect(codigo).toMatch(/['"]style\.load['"]/)
    expect(codigo).toMatch(/\.setData\(/)
    expect(codigo).toMatch(/\.easeTo\(/)
    expect(codigo).toMatch(/\.remove\(\)/)
  })
})

/** El cuerpo (hasta la llave que cierra) de la primera función o manejador que empieza en `inicio`. */
function cuerpoDesde(codigo: string, inicio: RegExp): string {
  const coincidencia = inicio.exec(codigo)
  expect(coincidencia, `no se encontró ${inicio}`).not.toBeNull()
  const desde = codigo.indexOf('{', coincidencia!.index + coincidencia![0].length - 1)
  let nivel = 0
  for (let i = desde; i < codigo.length; i++) {
    if (codigo[i] === '{') nivel++
    if (codigo[i] === '}' && --nivel === 0) return codigo.slice(desde, i + 1)
  }
  throw new Error('llaves sin cerrar')
}

describe('el ciclo de vida del estilo del mapa', () => {
  const codigo = leer(MAPLIBRE)

  it('al cargar un estilo (style.load) se vuelven a poner la fuente y las capas', () => {
    const manejador = cuerpoDesde(codigo, /mapa\.on\(\s*["']style\.load["']\s*,\s*\(\)\s*=>\s*\{/)
    expect(manejador).toMatch(/agregarFuenteYCapas\(\s*mapa\b/)
    expect(manejador).toMatch(/estiloCargado\s*=\s*true/)
  })

  it('agregarFuenteYCapas agrega la fuente y las dos capas solo si faltan', () => {
    const funcion = cuerpoDesde(codigo, /function agregarFuenteYCapas\([^)]*\)\s*\{/)
    expect(funcion).toMatch(/!mapa\.getSource\(FUENTE\)[\s\S]*addSource\(/)
    expect(funcion).toMatch(/!mapa\.getLayer\(CAPA_PINES\)[\s\S]*addLayer\(/)
    expect(funcion).toMatch(/!mapa\.getLayer\(CAPA_SELECCION\)[\s\S]*addLayer\(/)
  })

  it('el error del mapa avisa solo mientras el estilo no cargó', () => {
    const manejador = cuerpoDesde(codigo, /mapa\.on\(\s*["']error["']\s*,\s*\(\)\s*=>\s*\{/)
    expect(manejador).toMatch(/if\s*\(\s*!estiloCargado\s*\)\s*ultimo\.current\.onError\(\)/)
  })
})

describe('"Ver en el mapa" vuelve a centrar aunque el lugar ya esté seleccionado', () => {
  const contenido = leer(CONTENIDO)

  it('alVerEnElMapa emite una orden de centrar que cambia en cada pedido', () => {
    const verEnElMapa = cuerpoDesde(contenido, /function alVerEnElMapa\([^)]*\)\s*\{/)
    expect(verEnElMapa).toMatch(/ordenarCentrar\(\s*venueId\s*\)/)
    const orden = cuerpoDesde(contenido, /function ordenarCentrar\([^)]*\)\s*\{/)
    expect(orden).toMatch(/setCentrar\(/)
    expect(orden).toMatch(/n:\s*\(?\s*anterior\??\.n\s*\?\?\s*0\s*\)?\s*\+\s*1/)
  })

  it('la orden llega al mapa y el mapa centra con un efecto que depende de ella', () => {
    expect(contenido).toMatch(/<MapaDiferido[\s\S]*?centrar=\{centrar\}/)
    expect(leer(DIFERIDO)).toMatch(/<Mapa\b[^>]*centrar=\{centrar\}/)
    const maplibre = leer(MAPLIBRE)
    expect(maplibre).toMatch(/useEffect\(\(\)\s*=>\s*\{[\s\S]*?\.easeTo\([\s\S]*?\},\s*\[centrar\]\s*\)/)
    // El efecto de la selección no mueve la cámara: no hay dos easeTo peleándose.
    expect(maplibre.match(/\.easeTo\(/g)).toHaveLength(1)
  })

  it('al cambiar de filtro se limpia la selección y la orden', () => {
    const irA = cuerpoDesde(contenido, /function irA\([^)]*\)\s*\{/)
    expect(irA).toMatch(/setSeleccionado\(\s*null\s*\)/)
    expect(irA).toMatch(/setCentrar\(\s*null\s*\)/)
  })

  it('el selector de fecha usa un estado local y no se vacía mientras carga', () => {
    expect(contenido).toMatch(/value=\{diaElegido\}/)
    expect(contenido).toMatch(/setDiaElegido\(\s*dia\s*\)/)
  })

  it('un detector que mira la orden se pone en rojo si solo se llama a setSeleccionado', () => {
    const roto = 'function alVerEnElMapa(venueId: string) {\n  setSeleccionado(venueId)\n}\n'
    const verEnElMapa = cuerpoDesde(roto, /function alVerEnElMapa\([^)]*\)\s*\{/)
    expect(verEnElMapa).not.toMatch(/ordenarCentrar\(\s*venueId\s*\)/)
  })
})

/** El `<button ...>` que contiene "Ver en el mapa" (WCAG 2.5.3: el nombre accesible contiene el texto visible). */
function botonVerEnElMapa(codigo: string): string {
  const coincidencia = /<button\b[^>]*>[\s\S]*?<\/button>/.exec(codigo)
  expect(coincidencia, 'no se encontró el botón').not.toBeNull()
  return coincidencia![0]
}

function cumpleEtiquetaEnNombre(boton: string): boolean {
  const sinAriaLabel = !/aria-label\s*=/.test(boton)
  const nombreSoloLector = /Ver en el mapa<span className="sr-only">\s*\{pin\.nombre\}<\/span>/.test(boton)
  return sinAriaLabel && nombreSoloLector
}

describe('"Ver en el mapa": el nombre accesible contiene el texto visible', () => {
  it('el botón no reemplaza el texto con aria-label y suma el nombre en un sr-only', () => {
    expect(cumpleEtiquetaEnNombre(botonVerEnElMapa(leer(LISTA)))).toBe(true)
  })

  it('un detector se pone en rojo con el aria-label viejo', () => {
    const roto = botonVerEnElMapa(leer(LISTA)).replace('<button', '<button aria-label={`Ver ${pin.nombre} en el mapa`}')
    expect(cumpleEtiquetaEnNombre(roto)).toBe(false)
  })
})

/** Las clases `lg:h-[…]` de un código (el alto del mapa o de su esqueleto en la compu). */
function altosLg(codigo: string): string[] {
  return codigo.match(/\blg:h-\[[^\]\s"'`]+\]/g) ?? []
}

describe('el alto del mapa en la compu entra en 1280×900 (C5)', () => {
  const contenido = leer(CONTENIDO)
  const loading = leer(LOADING)

  it('el mapa y su esqueleto de carga usan el mismo alto, que depende del alto de la pantalla', () => {
    const delMapa = altosLg(contenido)
    expect(delMapa).toHaveLength(1)
    expect(delMapa[0]).toMatch(/100dvh/)
    expect(altosLg(loading)).toEqual(delMapa)
  })

  it('la lista de al lado no pasa del alto del mapa', () => {
    const alto = altosLg(contenido)[0].replace(/^lg:h-/, '')
    expect(contenido).toContain(`lg:max-h-${alto}`)
  })

  it('no queda el 70vh viejo (en 1280×900 el mapa terminaba en y≈975)', () => {
    expect(contenido).not.toMatch(/70vh/)
    expect(loading).not.toMatch(/70vh/)
  })

  it('un detector se pone en rojo si el esqueleto se queda con otro alto', () => {
    expect(altosLg(loading.replace(altosLg(loading)[0], 'lg:h-[70vh]'))).not.toEqual(altosLg(contenido))
  })
})

describe('sin JavaScript /mapa no se queda en el esqueleto de carga (C5)', () => {
  it('loading.tsx trae un <noscript><style> que muestra la página marcada con data-pagina-mapa y esconde el esqueleto', () => {
    const loading = leer(LOADING)
    expect(loading).toMatch(/<noscript>\s*<style>\{SIN_JS_MOSTRAR_LA_PAGINA\}<\/style>\s*<\/noscript>/)
    // En @layer theme: si no, el `[hidden]{display:none!important}` del preflight (en @layer base) le gana.
    expect(loading).toContain('div[hidden]:has(> [data-pagina-mapa]){display:block!important;order:-1}')
    expect(loading).toMatch(/"@layer theme\{body\{display:flex!important;flex-direction:column\}/)
    expect(loading).toContain('[data-cargando-mapa]{display:none!important}')
    expect(loading).toMatch(/<div role="status"[^>]*data-cargando-mapa=""/)
  })

  it('la página lleva la marca en su contenedor de afuera', () => {
    expect(leer(PAGINA)).toMatch(/return \(\s*<div data-pagina-mapa=""/)
  })
})

describe('el área de toque y los gestos del mapa', () => {
  const codigo = leer(MAPLIBRE)

  it('hay una capa invisible más grande y los eventos del puntero van sobre ella', () => {
    const funcion = cuerpoDesde(codigo, /function agregarFuenteYCapas\([^)]*\)\s*\{/)
    expect(funcion).toMatch(/!mapa\.getLayer\(CAPA_TOQUE\)[\s\S]*addLayer\(/)
    expect(funcion).toMatch(/"circle-opacity":\s*0,\s*"circle-radius":\s*22/)
    for (const evento of ['click', 'mouseenter', 'mouseleave']) {
      expect(codigo).toMatch(new RegExp(`mapa\\.on\\(\\s*"${evento}"\\s*,\\s*CAPA_TOQUE`))
      expect(codigo).not.toMatch(new RegExp(`mapa\\.on\\(\\s*"${evento}"\\s*,\\s*CAPA_PINES`))
    }
  })

  it('los gestos son cooperativos y los textos van en español', () => {
    expect(codigo).toMatch(/cooperativeGestures:\s*true/)
    expect(codigo).toMatch(/locale:\s*TEXTOS_ES/)
    expect(codigo).toMatch(/import\s*\{\s*TEXTOS_ES\s*\}\s*from\s*['"]\.\/textos-maplibre['"]/)
    expect(leer(TEXTOS)).toContain('Usá dos dedos para mover el mapa')
  })

  it('el mapa del pin también: gestos cooperativos y los mismos textos en español', () => {
    const pin = leer(PIN_MAPLIBRE)
    expect(pin).toMatch(/cooperativeGestures:\s*true/)
    expect(pin).toMatch(/locale:\s*TEXTOS_ES/)
    expect(pin).toMatch(/import\s*\{\s*TEXTOS_ES\s*\}\s*from\s*['"]\.\/textos-maplibre['"]/)
  })
})

describe('"use client" solo donde hace falta', () => {
  it.each(NUEVOS)('%s', (ruta) => {
    const esCliente = /^\s*["']use client["']/.test(leer(ruta))
    expect(esCliente).toBe(CLIENTE.includes(ruta))
  })
})

describe('detectores propios', () => {
  it('un comentario que nombra la clase o el paquete no cuenta', () => {
    const fuente = "// from 'maplibre-gl' attributionControl: false\n/* setHTML */\nconst a = 1\n"
    expect(sinComentarios(fuente)).not.toMatch(/maplibre|attributionControl|setHTML/)
  })

  it('un import estático del mapa se ve; el dinámico se descuenta', () => {
    const estatico = "import MapaMaplibre from './mapa-maplibre'"
    const dinamico = "import('./mapa-maplibre')"
    expect(estatico.replace(IMPORT_DINAMICO_MAPA, '')).toContain('mapa-maplibre')
    expect(dinamico.replace(IMPORT_DINAMICO_MAPA, '')).not.toContain('mapa-maplibre')
  })
})
