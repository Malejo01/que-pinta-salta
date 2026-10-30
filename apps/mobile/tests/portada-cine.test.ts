// R67, 67-q: tests de la tarea 67-c (el chip "Cine" de la portada dibuja las
// películas con `components/TarjetaPelicula.tsx`, no como tarjetas de evento).
// Sin red ni base. La app no monta componentes en los tests (entorno `node`, sin
// DOM) y `app/(tabs)/index.tsx` arrastra expo-router y react-native, así que no
// se importa: como `tests/portada.test.ts`, lo que es lógica pura se prueba con
// el texto de la función sacado del fuente (acá se evalúa la función REAL, sin
// copia) y lo estructural, con detectores por texto sobre el fuente sin
// comentarios. Cada detector tiene su fixture falso que lo pone en rojo.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transformMovie } from '@qps/core/home/transform'
import type { DisplayEvent } from '@qps/core/home/types'

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

/** Texto entre dos marcadores, o null si falta alguno (los detectores lo marcan como violación). */
function entreONull(texto: string, inicio: string, fin: string): string | null {
  const desde = texto.indexOf(inicio)
  if (desde < 0) return null
  const hasta = texto.indexOf(fin, desde + inicio.length)
  if (hasta < 0) return null
  return texto.slice(desde, hasta)
}

const INICIO_MEMO = 'const datosPortada = useMemo('
// A2 (nube Q1): el useMemo suma la dependencia `gratis` (el chip "Gratis").
// A3 (nube Q1): suma la dependencia `paraChicos`.
const FIN_MEMO = '}, [estado, atajo, categoria, gratis, paraChicos])'

// ---------------------------------------------------------------------------
// 0. Guarda del scanner
// ---------------------------------------------------------------------------
describe('el scanner de comentarios (guarda de este archivo)', () => {
  it('un comentario que nombra <TarjetaPelicula no cuenta, pero el código sí', () => {
    const limpio = sinComentarios('// <TarjetaPelicula key={i} />\nconst a = <TarjetaPelicula key={x} /> /* function BloqueCine */')
    expect(limpio).not.toContain('key={i}')
    expect(limpio).not.toContain('function BloqueCine')
    expect(limpio).toContain('<TarjetaPelicula key={x}')
  })
})

// ---------------------------------------------------------------------------
// 1. conteoCategoria: la función REAL de index.tsx, evaluada desde su texto
// ---------------------------------------------------------------------------
type ConteoFn = (peliculas: number, eventos: number) => string

/**
 * Saca `export function conteoCategoria(...)` del fuente sin comentarios, le
 * quita los tipos (`: number`, `: string`) y el `export`, y la evalúa. La
 * función es pura (solo plantillas), así que no necesita nada del módulo.
 */
function cargarConteo(fuenteSinComentarios: string): ConteoFn {
  const inicio = fuenteSinComentarios.indexOf('export function conteoCategoria(')
  expect(inicio, 'conteoCategoria no está exportada en index.tsx').toBeGreaterThan(-1)
  const cierre = fuenteSinComentarios.indexOf('\n}\n', inicio)
  expect(cierre).toBeGreaterThan(inicio)
  const js = fuenteSinComentarios
    .slice(inicio, cierre + 2)
    .replace(/^export /, '')
    .replace(/\(peliculas: number, eventos: number\): string/, '(peliculas, eventos)')
  expect(js, 'quedaron tipos de TypeScript sin quitar').not.toMatch(/:\s*(number|string)\b/)
  return new Function(`${js}\nreturn conteoCategoria`)() as ConteoFn
}

describe('conteoCategoria (la función real de app/(tabs)/index.tsx)', () => {
  const conteo = cargarConteo(sinComentarios(leer('app', '(tabs)', 'index.tsx')))

  it.each([
    [0, 0, '0 eventos'],
    [1, 0, '1 película'],
    [3, 0, '3 películas'],
    [0, 1, '1 evento'],
    [0, 5, '5 eventos'],
    [2, 1, '2 películas · 1 evento'],
    [1, 2, '1 película · 2 eventos'],
  ])('%i películas y %i eventos -> "%s"', (peliculas, eventos, esperado) => {
    expect(conteo(peliculas, eventos)).toBe(esperado)
  })

  it('con películas y 0 eventos no agrega "0 eventos"', () => {
    expect(conteo(4, 0)).not.toContain('evento')
  })
})

// ---------------------------------------------------------------------------
// 2. index.tsx: la separación de películas y el dibujo
// ---------------------------------------------------------------------------
/** Violaciones de la separación de películas en el `useMemo` de `datosPortada`. */
function violacionesSeparacion(codigo: string): string[] {
  const v: string[] = []
  const memo = entreONull(codigo, INICIO_MEMO, FIN_MEMO)
  if (memo === null) return ['no se encuentra el useMemo de datosPortada con sus dependencias [estado, atajo, categoria, gratis, paraChicos]']
  const bloqueCine = entreONull(memo, "if (categoria === 'cine') {", '} else {')
  if (bloqueCine === null) return ["dentro del useMemo no hay un bloque `if (categoria === 'cine') { ... } else {`"]
  if (!/evento\.isCinemaMovie\s*\?\s*porId\.get\(evento\.id\)/.test(bloqueCine)) v.push('el bloque no separa por evento.isCinemaMovie con porId.get(evento.id)')
  if (!/`movie-\$\{pelicula\.id\}`/.test(bloqueCine)) v.push('el mapa porId no usa la clave `movie-${pelicula.id}`')
  if (!/peliculasCategoria\.push\(pelicula\)/.test(bloqueCine)) v.push('las películas no se acumulan en peliculasCategoria')
  if (!/eventosSinPelicula\.push\(evento\)/.test(bloqueCine)) v.push('lo que no es película no va a eventosSinPelicula')
  if (!/return \{[^}]*peliculasCategoria[^}]*eventosSinPelicula[^}]*\}\s*$/.test(memo.trimEnd())) v.push('el useMemo no devuelve peliculasCategoria y eventosSinPelicula')
  // El cálculo vive en el useMemo y no en el render: afuera no se vuelve a separar.
  const afuera = codigo.replace(memo, '')
  if (/isCinemaMovie/.test(afuera)) v.push('hay lógica de isCinemaMovie fuera del useMemo (se recalcularía en cada render)')
  if (/peliculasCategoria\.push/.test(afuera)) v.push('se arma peliculasCategoria fuera del useMemo')
  return v
}

/** Violaciones del dibujo de las tarjetas de película y de la grilla de eventos. */
function violacionesDibujo(codigo: string): string[] {
  const v: string[] = []
  if (!/import\s*\{\s*TarjetaPelicula\s*\}\s*from\s*'@\/components\/TarjetaPelicula'/.test(codigo)) v.push('index.tsx no importa TarjetaPelicula de @/components/TarjetaPelicula')
  const usos = codigo.match(/<TarjetaPelicula\b[^>]*>/g) ?? []
  if (usos.length !== 1) return [...v, `se esperaba 1 <TarjetaPelicula, hay ${usos.length}`]
  if (!/key=\{pelicula\.id\}/.test(usos[0])) v.push('<TarjetaPelicula no usa key={pelicula.id}')
  if (!/\bpelicula=\{pelicula\}/.test(usos[0])) v.push('<TarjetaPelicula no recibe pelicula={pelicula}')
  const mapa = entreONull(codigo, 'datosPortada.peliculasCategoria.map(', '<TarjetaPelicula')
  if (mapa === null) v.push('las tarjetas no salen de datosPortada.peliculasCategoria.map(')
  const grilla = entreONull(codigo, 'enFilasDeDos(datosPortada.', '<TarjetaEvento')
  if (grilla === null) v.push('la grilla de TarjetaEvento no pasa por enFilasDeDos(datosPortada.…)')
  else if (!grilla.startsWith('enFilasDeDos(datosPortada.eventosSinPelicula)')) v.push('la grilla de TarjetaEvento no usa la lista sin películas (eventosSinPelicula)')
  if (/<TarjetaEvento\b[^>]*isCinemaMovie/.test(codigo)) v.push('se dibuja una TarjetaEvento para una película')
  return v
}

describe('app/(tabs)/index.tsx con el chip "Cine"', () => {
  const codigo = sinComentarios(leer('app', '(tabs)', 'index.tsx'))

  it('las películas se separan dentro del useMemo de datosPortada (isCinemaMovie + movie-<id>)', () => {
    expect(violacionesSeparacion(codigo)).toEqual([])
  })

  it('se dibuja <TarjetaPelicula key={pelicula.id}> y la grilla de TarjetaEvento usa la lista sin películas', () => {
    expect(violacionesDibujo(codigo)).toEqual([])
  })

  it('el conteo del live region usa las dos listas separadas', () => {
    expect(codigo).toMatch(/conteoCategoria\(datosPortada\.peliculasCategoria\.length,\s*datosPortada\.eventosSinPelicula\.length\)/)
  })

  it('con otra categoría (no cine) todo cae en eventosSinPelicula y peliculasCategoria queda vacío', () => {
    expect(codigo).toMatch(/\}\s*else\s*\{\s*eventosSinPelicula = eventosCategoria\s*\}/)
    expect(codigo).toMatch(/const peliculasCategoria: Pelicula\[\] = \[\]/)
  })

  // Fixtures falsos: cada uno rompe UNA cosa y el detector lo tiene que ver.
  describe('fixtures falsos (el detector se pone en rojo)', () => {
    it('la separación calculada fuera del useMemo', () => {
      const memo = entreONull(codigo, INICIO_MEMO, FIN_MEMO)!
      const bloque = entreONull(memo, "if (categoria === 'cine') {", '} else {')!
      // Se saca el bloque del memo y se lo pone en el render.
      const roto = codigo.replace(bloque, '').replace('return (\n    <View', `${bloque}\n  return (\n    <View`)
      const v = violacionesSeparacion(roto)
      expect(v.length).toBeGreaterThan(0)
    })

    it('un useMemo sin la dependencia categoria', () => {
      const roto = codigo.replace(FIN_MEMO, '}, [estado, atajo, gratis, paraChicos])')
      expect(violacionesSeparacion(roto)).toHaveLength(1)
    })

    it('la clave del mapa sin el prefijo movie-', () => {
      const roto = codigo.replace('`movie-${pelicula.id}`', 'pelicula.id')
      expect(violacionesSeparacion(roto).join('|')).toContain('movie-')
    })

    it('separar por otra cosa que isCinemaMovie', () => {
      const roto = codigo.replace('evento.isCinemaMovie ? porId.get(evento.id)', 'evento.category === "cine" ? porId.get(evento.id)')
      expect(violacionesSeparacion(roto).join('|')).toContain('isCinemaMovie')
    })

    it('key={indice} en la tarjeta', () => {
      const roto = codigo.replace('<TarjetaPelicula key={pelicula.id}', '<TarjetaPelicula key={indice}')
      expect(violacionesDibujo(roto)).toEqual(['<TarjetaPelicula no usa key={pelicula.id}'])
    })

    it('la grilla de TarjetaEvento con la lista que sigue teniendo las películas', () => {
      const roto = codigo.replace('enFilasDeDos(datosPortada.eventosSinPelicula)', 'enFilasDeDos(datosPortada.eventosCategoria)')
      expect(violacionesDibujo(roto)).toEqual(['la grilla de TarjetaEvento no usa la lista sin películas (eventosSinPelicula)'])
    })

    it('un import de otro lado o sin la tarjeta', () => {
      const roto = codigo.replace("from '@/components/TarjetaPelicula'", "from '@/components/Otra'")
      expect(violacionesDibujo(roto).length).toBeGreaterThan(0)
    })

    it('un comentario con la forma correcta no tapa una rotura', () => {
      const roto = sinComentarios(
        leer('app', '(tabs)', 'index.tsx').replace('<TarjetaPelicula key={pelicula.id}', '// key={pelicula.id}\n<TarjetaPelicula key={indice}'),
      )
      expect(violacionesDibujo(roto)).toContain('<TarjetaPelicula no usa key={pelicula.id}')
    })
  })
})

// ---------------------------------------------------------------------------
// 3. components/TarjetaPelicula.tsx: el cine abierto es estado propio
// ---------------------------------------------------------------------------
// R67, 67-r1: con `compacta` el primer cine arranca abierto; sin ella, `null`.
const ESTADO_ABIERTO = 'const [abierto, setAbierto] = useState<string | null>(compacta ? (cines[0]?.cine ?? null) : null)'

function violacionesTarjeta(codigo: string): string[] {
  const v: string[] = []
  const inicio = codigo.indexOf('export function TarjetaPelicula(')
  if (inicio < 0) return ['no se exporta function TarjetaPelicula']
  const firma = codigo.slice(inicio, codigo.indexOf('{', codigo.indexOf(')', inicio)) + 1)
  const cuerpo = codigo.slice(inicio)
  if (/\babierto\b|\bsetAbierto\b|\bonToggle\b/.test(firma)) v.push('el cine abierto llega por props (firma de TarjetaPelicula)')
  if (!/const \[abierto, setAbierto\] = useState<string \| null>\(/.test(cuerpo)) v.push('el cine abierto no es un useState dentro de TarjetaPelicula')
  if (!/<BloqueCine\b/.test(cuerpo)) v.push('la tarjeta no usa <BloqueCine')
  if (!/import\s*\{\s*BloqueCine\s*\}\s*from\s*'@\/components\/BloqueCine'/.test(codigo)) v.push('no importa BloqueCine de @/components/BloqueCine')
  if (!/abierto=\{abierto === cine\.cine\}/.test(cuerpo)) v.push('el acordeón no se abre comparando abierto con el cine')
  if (!/onToggle=\{\(\) => setAbierto\(/.test(cuerpo)) v.push('onToggle no cambia el estado propio con setAbierto')
  return v
}

describe('components/TarjetaPelicula.tsx', () => {
  const codigo = sinComentarios(leer('components', 'TarjetaPelicula.tsx'))

  it('el cine abierto es un useState propio y la tarjeta usa <BloqueCine', () => {
    expect(violacionesTarjeta(codigo)).toEqual([])
  })

  it('el estado vive dentro del componente, antes del return', () => {
    expect(codigo.indexOf('useState<string | null>(')).toBeGreaterThan(codigo.indexOf('export function TarjetaPelicula('))
    expect(codigo.indexOf('useState<string | null>(')).toBeLessThan(codigo.indexOf('return ('))
  })

  describe('fixtures falsos', () => {
    it('una tarjeta que recibe `abierto` por props', () => {
      const roto = codigo
        .replace('({ pelicula, compacta = false }: { pelicula: Pelicula; compacta?: boolean })', '({ pelicula, abierto, onToggle }: { pelicula: Pelicula; abierto: string | null; onToggle: () => void })')
        .replace(ESTADO_ABIERTO, '')
      const v = violacionesTarjeta(roto)
      expect(v).toContain('el cine abierto llega por props (firma de TarjetaPelicula)')
      expect(v).toContain('el cine abierto no es un useState dentro de TarjetaPelicula')
    })

    it('un useState arriba del componente (compartido por todas las tarjetas)', () => {
      const roto = codigo
        .replace(`  ${ESTADO_ABIERTO}\n`, '')
        .replace('export function TarjetaPelicula(', `${ESTADO_ABIERTO}\nexport function TarjetaPelicula(`)
      expect(violacionesTarjeta(roto)).toContain('el cine abierto no es un useState dentro de TarjetaPelicula')
    })

    it('una tarjeta que dibuja el cine a mano en vez de <BloqueCine', () => {
      const roto = codigo.replace(/<BloqueCine\b/g, '<View')
      expect(violacionesTarjeta(roto)).toContain('la tarjeta no usa <BloqueCine')
    })
  })
})

// ---------------------------------------------------------------------------
// 3 bis. R67, 67-r1: tarjeta compacta, título "En cartel"
// ---------------------------------------------------------------------------
/** La portada pasa `compacta` a su <TarjetaPelicula; Cines no. */
function violacionesCompacta(portada: string, cines: string): string[] {
  const v: string[] = []
  const usoPortada = portada.match(/<TarjetaPelicula\b[^>]*>/g) ?? []
  if (usoPortada.length !== 1 || !/\bcompacta\b/.test(usoPortada[0])) v.push('la portada no pasa compacta a <TarjetaPelicula')
  const usoCines = cines.match(/<TarjetaPelicula\b[^>]*>/g) ?? []
  if (usoCines.length === 0) v.push('app/cines.tsx no dibuja <TarjetaPelicula')
  if (usoCines.some((uso) => /\bcompacta\b/.test(uso))) v.push('app/cines.tsx pasa compacta (tiene que quedar a ancho completo)')
  return v
}

/** Con `compacta` el cine abierto arranca en el primer cine; sin ella, en null. */
function violacionesCineAbiertoInicial(tarjeta: string): string[] {
  const v: string[] = []
  if (!/compacta\??:\s*boolean/.test(tarjeta)) v.push('la tarjeta no declara la prop compacta?: boolean')
  if (!/compacta\s*=\s*false/.test(tarjeta)) v.push('compacta no vale false por defecto')
  if (!/useState<string \| null>\(compacta \? \(cines\[0\]\?\.cine \?\? null\) : null\)/.test(tarjeta)) {
    v.push('el useState del cine abierto no arranca con el primer cine con compacta (y con null sin ella)')
  }
  if (/useEffect/.test(tarjeta)) v.push('la tarjeta usa useEffect (el cine inicial va en el useState)')
  return v
}

/** Con "Cine" el título dice "En cartel" (las películas no se filtran por fecha). */
function violacionesTituloCartel(portada: string): string[] {
  const v: string[] = []
  if (!/categoria === 'cine' \? 'En cartel' : ETIQUETA_ATAJO\[atajo\]/.test(portada)) v.push("el título con categoria === 'cine' no dice 'En cartel'")
  // A8 (nube Q1, QPS-339): el título pasó del JSX a un template literal
  // (`tituloGrilla`, que usan el encabezado y el anuncio).
  if (!/`\$\{nombreCategoria\} · \$\{/.test(portada)) v.push('el título no arranca con el nombre de la categoría')
  return v
}

describe('R67, 67-r1: tarjeta compacta en la portada', () => {
  const portada = sinComentarios(leer('app', '(tabs)', 'index.tsx'))
  const cines = sinComentarios(leer('app', 'cines.tsx'))
  const tarjeta = sinComentarios(leer('components', 'TarjetaPelicula.tsx'))

  it('la portada pasa compacta y app/cines.tsx no', () => {
    expect(violacionesCompacta(portada, cines)).toEqual([])
  })

  it('con compacta el primer cine arranca abierto; sin ella, null', () => {
    expect(violacionesCineAbiertoInicial(tarjeta)).toEqual([])
  })

  it("con el chip Cine el título dice 'En cartel'; el resto, el atajo", () => {
    expect(violacionesTituloCartel(portada)).toEqual([])
  })

  describe('fixtures falsos', () => {
    it('la portada sin compacta', () => {
      const roto = portada.replace('pelicula={pelicula} compacta />', 'pelicula={pelicula} />')
      expect(violacionesCompacta(roto, cines)).toEqual(['la portada no pasa compacta a <TarjetaPelicula'])
    })

    it('app/cines.tsx con compacta', () => {
      const roto = cines.replace('<TarjetaPelicula pelicula={item}', '<TarjetaPelicula compacta pelicula={item}')
      expect(violacionesCompacta(portada, roto)).toEqual(['app/cines.tsx pasa compacta (tiene que quedar a ancho completo)'])
    })

    it('el cine abierto que arranca siempre en null', () => {
      const roto = tarjeta.replace('useState<string | null>(compacta ? (cines[0]?.cine ?? null) : null)', 'useState<string | null>(null)')
      expect(violacionesCineAbiertoInicial(roto)).toHaveLength(1)
    })

    it('el cine abierto que arranca siempre con el primero (también sin compacta)', () => {
      const roto = tarjeta.replace('compacta ? (cines[0]?.cine ?? null) : null', '(cines[0]?.cine ?? null)')
      expect(violacionesCineAbiertoInicial(roto)).toHaveLength(1)
    })

    it('un useEffect que abre el primer cine', () => {
      const roto = `${tarjeta}\nuseEffect(() => { setAbierto(cines[0]?.cine ?? null) }, [])`
      expect(violacionesCineAbiertoInicial(roto)).toEqual(['la tarjeta usa useEffect (el cine inicial va en el useState)'])
    })

    it('el título con el atajo también para Cine', () => {
      const roto = portada.replace("categoria === 'cine' ? 'En cartel' : ETIQUETA_ATAJO[atajo]", 'ETIQUETA_ATAJO[atajo]')
      expect(violacionesTituloCartel(roto)).toEqual(["el título con categoria === 'cine' no dice 'En cartel'"])
    })
  })
})

// ---------------------------------------------------------------------------
// 4. Sin duplicación en cines.tsx y pelicula/[id].tsx
// ---------------------------------------------------------------------------
function violacionesDuplicacion(codigo: string, importa: 'TarjetaPelicula' | 'BloqueCine'): string[] {
  const v: string[] = []
  if (/\bfunction\s+BloqueCine\b/.test(codigo)) v.push('vuelve a definir function BloqueCine')
  if (/\bfunction\s+TarjetaPelicula\b/.test(codigo)) v.push('vuelve a definir function TarjetaPelicula')
  if (/\b(?:const|let)\s+(?:BloqueCine|TarjetaPelicula)\s*=/.test(codigo)) v.push('define BloqueCine/TarjetaPelicula como const')
  const re = new RegExp(`import\\s*\\{[^}]*\\b${importa}\\b[^}]*\\}\\s*from\\s*'@/components/${importa}'`)
  if (!re.test(codigo)) v.push(`no importa ${importa} de @/components/${importa}`)
  return v
}

describe('no volvió la duplicación de BloqueCine / TarjetaPelicula', () => {
  const cines = sinComentarios(leer('app', 'cines.tsx'))
  const ficha = sinComentarios(leer('app', 'pelicula', '[id].tsx'))

  it('app/cines.tsx importa TarjetaPelicula de @/components y no define ninguna de las dos', () => {
    expect(violacionesDuplicacion(cines, 'TarjetaPelicula')).toEqual([])
    expect(cines).toMatch(/<TarjetaPelicula\b/)
  })

  it('app/pelicula/[id].tsx importa BloqueCine de @/components y no define ninguna de las dos', () => {
    expect(violacionesDuplicacion(ficha, 'BloqueCine')).toEqual([])
    expect(ficha).toMatch(/<BloqueCine\b/)
  })

  it('los componentes compartidos existen y se definen una sola vez', () => {
    expect(sinComentarios(leer('components', 'BloqueCine.tsx')).match(/export function BloqueCine\b/g)).toHaveLength(1)
    expect(sinComentarios(leer('components', 'TarjetaPelicula.tsx')).match(/export function TarjetaPelicula\b/g)).toHaveLength(1)
  })

  describe('fixtures falsos', () => {
    it('cines.tsx con su function TarjetaPelicula propia otra vez', () => {
      const roto = `${cines}\nfunction TarjetaPelicula({ pelicula }: { pelicula: unknown }) { return null }`
      expect(violacionesDuplicacion(roto, 'TarjetaPelicula')).toEqual(['vuelve a definir function TarjetaPelicula'])
    })

    it('la ficha con su function BloqueCine propia otra vez', () => {
      const roto = `${ficha}\nfunction BloqueCine() { return null }`
      expect(violacionesDuplicacion(roto, 'BloqueCine')).toEqual(['vuelve a definir function BloqueCine'])
    })

    it('un import desde una ruta relativa en vez de @/components', () => {
      const roto = cines.replace("from '@/components/TarjetaPelicula'", "from '../components/TarjetaPelicula'")
      expect(violacionesDuplicacion(roto, 'TarjetaPelicula')).toEqual(['no importa TarjetaPelicula de @/components/TarjetaPelicula'])
    })
  })
})

// ---------------------------------------------------------------------------
// 5. El bug F6 por dato: cada tarjeta es de SU película
// ---------------------------------------------------------------------------
interface PeliculaFicticia {
  id: string
  slug: string
  title: string
  poster_url: string | null
  showings: Record<string, never>
}

/**
 * Copia de la regla de `datosPortada` en index.tsx (con "Cine" elegido): cada
 * evento `isCinemaMovie` se vuelve a unir con su `Pelicula` por
 * `movie-${pelicula.id}` ↔ `evento.id`. Un detector del bloque 2 fija que el
 * fuente sigue usando esta misma regla (isCinemaMovie + porId.get(evento.id) +
 * la clave `movie-${pelicula.id}`).
 */
function separar(peliculas: PeliculaFicticia[], eventosCategoria: DisplayEvent[]) {
  const porId = new Map(peliculas.map((pelicula) => [`movie-${pelicula.id}`, pelicula]))
  const peliculasCategoria: PeliculaFicticia[] = []
  const eventosSinPelicula: DisplayEvent[] = []
  for (const evento of eventosCategoria) {
    const pelicula = evento.isCinemaMovie ? porId.get(evento.id) : undefined
    if (pelicula) peliculasCategoria.push(pelicula)
    else eventosSinPelicula.push(evento)
  }
  return { peliculasCategoria, eventosSinPelicula }
}

describe('F6: la tarjeta 2 y la 3 son de su película (separación por id)', () => {
  const HOY = '2026-10-24'
  const peliculas: PeliculaFicticia[] = [
    { id: 'p-uno', slug: 'pelicula-de-prueba-1', title: 'Película de Prueba Uno', poster_url: null, showings: {} },
    { id: 'p-dos', slug: 'pelicula-de-prueba-2', title: 'Película de Prueba Dos', poster_url: null, showings: {} },
    { id: 'p-tres', slug: 'pelicula-de-prueba-3', title: 'Película de Prueba Tres', poster_url: null, showings: {} },
    { id: 'p-cuatro', slug: 'pelicula-de-prueba-4', title: 'Película de Prueba Cuatro', poster_url: null, showings: {} },
  ]
  const comoEventos = peliculas.map((p) => transformMovie(p, HOY))

  it('transformMovie deja id = movie-<id> e isCinemaMovie (la regla que usa la portada)', () => {
    expect(comoEventos.map((e) => e.id)).toEqual(['movie-p-uno', 'movie-p-dos', 'movie-p-tres', 'movie-p-cuatro'])
    expect(comoEventos.every((e) => e.isCinemaMovie === true)).toBe(true)
  })

  it('devuelve las 4 Pelicula en orden, cada una con su id', () => {
    const { peliculasCategoria, eventosSinPelicula } = separar(peliculas, comoEventos)
    expect(peliculasCategoria.map((p) => p.id)).toEqual(['p-uno', 'p-dos', 'p-tres', 'p-cuatro'])
    expect(peliculasCategoria.map((p) => p.title)).toEqual(peliculas.map((p) => p.title))
    expect(eventosSinPelicula).toEqual([])
  })

  it('con el orden de los eventos cambiado, cada tarjeta sigue siendo de su película (no del índice)', () => {
    const invertidos = [...comoEventos].reverse()
    const { peliculasCategoria } = separar(peliculas, invertidos)
    expect(peliculasCategoria.map((p) => p.id)).toEqual(['p-cuatro', 'p-tres', 'p-dos', 'p-uno'])
    // La película 2 y la 3 de la lista siguen siendo las de sus eventos.
    invertidos.forEach((evento, i) => expect(evento.id).toBe(`movie-${peliculasCategoria[i].id}`))
  })

  it('un evento real de cine (sin isCinemaMovie) queda en la grilla, y un movie-<id> desconocido también', () => {
    const real = { ...comoEventos[0], id: 'evento-real-1', title: 'Ciclo de Prueba', isCinemaMovie: false } as DisplayEvent
    const huerfano = { ...comoEventos[0], id: 'movie-no-existe' } as DisplayEvent
    const { peliculasCategoria, eventosSinPelicula } = separar(peliculas, [comoEventos[1], real, huerfano, comoEventos[2]])
    expect(peliculasCategoria.map((p) => p.id)).toEqual(['p-dos', 'p-tres'])
    expect(eventosSinPelicula.map((e) => e.id)).toEqual(['evento-real-1', 'movie-no-existe'])
  })

  it('los ids de las tarjetas son únicos (sirven de key estable)', () => {
    const { peliculasCategoria } = separar(peliculas, comoEventos)
    expect(new Set(peliculasCategoria.map((p) => p.id)).size).toBe(peliculasCategoria.length)
  })

  it('la regla del test es la del fuente (la clave movie-<id> y el isCinemaMovie)', () => {
    const codigo = sinComentarios(leer('app', '(tabs)', 'index.tsx'))
    expect(violacionesSeparacion(codigo)).toEqual([])
  })
})
