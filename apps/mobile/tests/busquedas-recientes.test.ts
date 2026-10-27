// A5 (nube Q1): búsquedas recientes de Buscar. Tres partes, mismo estilo que
// el resto de `tests/`:
//   1. La lógica pura de `lib/busquedas-recientes.ts` (normalizar, dedupe sin
//      distinguir mayúsculas/tildes, orden, tope, sobre roto).
//      Más la decisión de guardar (`busquedaParaGuardar`).
//   2. Lectura/escritura con un `Almacen` doble en memoria (y uno que falla),
//      más el `almacenPorDefecto` real sobre el doble de
//      `tests/dobles/async-storage.ts` (alias de `vitest.config.ts`), y las
//      limpiezas por prefijo del repo: qué borra el historial y qué no.
//   3. Detectores sobre el código en disco (no hay runner de React Native):
//      solo `lib/sin-conexion/almacen.ts` importa AsyncStorage, nada del
//      historial va a métricas/Sentry/Supabase, y la sección de la pantalla
//      tiene sus roles, etiquetas y áreas táctiles.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { reiniciar } from './dobles/async-storage'
import type { Almacen } from '@/lib/sin-conexion/almacen'
import {
  agregarBusqueda,
  armarSobreBusquedas,
  borrarHistorialDeBusquedas,
  busquedaParaGuardar,
  CLAVE_BUSQUEDAS_RECIENTES,
  claveDeComparacion,
  guardarBusquedaReciente,
  LARGO_MAXIMO_BUSQUEDA,
  LARGO_MINIMO_BUSQUEDA,
  leerBusquedasRecientes,
  leerSobreBusquedas,
  normalizarBusqueda,
  PREFIJO_BUSQUEDAS,
  TOPE_BUSQUEDAS_RECIENTES,
  VERSION_BUSQUEDAS,
} from '@/lib/busquedas-recientes'
import {
  borrarCacheFavoritos,
  borrarTodaLaCache,
  limpiarVersionesViejas,
  PREFIJO_CACHE,
} from '@/lib/sin-conexion/cache'

// ---------------------------------------------------------------------------
// Dobles de `Almacen`.
// ---------------------------------------------------------------------------

function almacenEnMemoria(inicial: Record<string, string> = {}): Almacen & { memoria: Map<string, string> } {
  const memoria = new Map(Object.entries(inicial))
  return {
    memoria,
    leer: async (clave) => memoria.get(clave) ?? null,
    escribir: async (clave, valor) => {
      memoria.set(clave, valor)
    },
    borrar: async (clave) => {
      memoria.delete(clave)
    },
    claves: async () => [...memoria.keys()],
    borrarVarias: async (claves) => {
      for (const clave of claves) memoria.delete(clave)
    },
  }
}

const falla = async (): Promise<never> => {
  throw new Error('almacén roto')
}

const almacenQueFalla: Almacen = { leer: falla, escribir: falla, borrar: falla, claves: falla, borrarVarias: falla }

beforeEach(() => {
  reiniciar()
})

// ---------------------------------------------------------------------------
// 1. Lógica pura.
// ---------------------------------------------------------------------------

describe('normalizarBusqueda', () => {
  it('saca los espacios de las puntas y colapsa los de adentro, respetando mayúsculas y tildes', () => {
    expect(normalizarBusqueda('  Peña   Folclórica  ')).toBe('Peña Folclórica')
  })

  it('vacía, solo espacios o más corta que el mínimo: null', () => {
    expect(normalizarBusqueda('')).toBeNull()
    expect(normalizarBusqueda('    ')).toBeNull()
    expect(normalizarBusqueda('\n\t ')).toBeNull()
    expect(normalizarBusqueda(' a ')).toBeNull()
    expect(LARGO_MINIMO_BUSQUEDA).toBe(2)
    expect(normalizarBusqueda('DJ')).toBe('DJ')
  })

  it('recorta a LARGO_MAXIMO_BUSQUEDA (y sin dejar un espacio colgando)', () => {
    const larga = 'jazz '.repeat(40)
    const resultado = normalizarBusqueda(larga)
    expect(resultado).not.toBeNull()
    expect(resultado!.length).toBeLessThanOrEqual(LARGO_MAXIMO_BUSQUEDA)
    expect(resultado).toBe(resultado!.trim())
  })
})

describe('claveDeComparacion', () => {
  it('sin mayúsculas ni tildes (la misma normalización que la búsqueda)', () => {
    expect(claveDeComparacion('Peña')).toBe(claveDeComparacion('pena'))
    expect(claveDeComparacion('SALTEÑO')).toBe(claveDeComparacion('salteno'))
    expect(claveDeComparacion('rock  nacional')).toBe(claveDeComparacion('Rock nacional'))
  })
})

describe('agregarBusqueda', () => {
  it('la más reciente va primero', () => {
    let lista: string[] = []
    lista = agregarBusqueda(lista, 'jazz')
    lista = agregarBusqueda(lista, 'teatro')
    lista = agregarBusqueda(lista, 'peña')
    expect(lista).toEqual(['peña', 'teatro', 'jazz'])
  })

  it('una repetida (sin distinguir mayúsculas ni tildes) sube al primer lugar con la forma nueva, sin duplicarse', () => {
    const lista = agregarBusqueda(['teatro', 'pena', 'jazz'], 'Peña')
    expect(lista).toEqual(['Peña', 'teatro', 'jazz'])
  })

  it(`tope de ${TOPE_BUSQUEDAS_RECIENTES}: la más vieja se cae`, () => {
    expect(TOPE_BUSQUEDAS_RECIENTES).toBe(5)
    let lista: string[] = []
    for (const texto of ['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis']) lista = agregarBusqueda(lista, texto)
    expect(lista).toEqual(['seis', 'cinco', 'cuatro', 'tres', 'dos'])
  })

  it('vacías, espacios o muy cortas no entran (y la lista queda igual)', () => {
    const lista = ['jazz']
    expect(agregarBusqueda(lista, '')).toEqual(['jazz'])
    expect(agregarBusqueda(lista, '   ')).toEqual(['jazz'])
    expect(agregarBusqueda(lista, 'j')).toEqual(['jazz'])
  })

  it('no muta la lista que recibe', () => {
    const lista = ['jazz']
    agregarBusqueda(lista, 'teatro')
    expect(lista).toEqual(['jazz'])
  })

  it('guarda el texto normalizado (sin espacios de más)', () => {
    expect(agregarBusqueda([], '  rock   nacional ')).toEqual(['rock nacional'])
  })

  it('«jaz» se va cuando llega «jazz» (prefijo, sin distinguir mayúsculas ni tildes)', () => {
    expect(agregarBusqueda(['jaz', 'teatro'], 'jazz')).toEqual(['jazz', 'teatro'])
    expect(agregarBusqueda(['Pe', 'teatro', 'peñ'], 'Peña')).toEqual(['Peña', 'teatro'])
  })

  it('al revés no: «jazz» se queda si después llega «jaz»', () => {
    expect(agregarBusqueda(['jazz'], 'jaz')).toEqual(['jaz', 'jazz'])
  })

  it('solo cuenta el prefijo del comienzo: «nacional» no se va cuando llega «rock nacional»', () => {
    expect(agregarBusqueda(['nacional'], 'rock nacional')).toEqual(['rock nacional', 'nacional'])
  })
})

describe('busquedaParaGuardar: la decisión de guardar', () => {
  it.each(['enviar', 'repetir', 'abrir-resultado'] as const)('%s: guarda el texto normalizado', (motivo) => {
    expect(busquedaParaGuardar('  jazz   en vivo ', motivo)).toBe('jazz en vivo')
  })

  it.each(['enviar', 'repetir', 'abrir-resultado'] as const)('%s: campo vacío, solo espacios o muy corto → no guarda', (motivo) => {
    expect(busquedaParaGuardar('', motivo)).toBeNull()
    expect(busquedaParaGuardar('   ', motivo)).toBeNull()
    expect(busquedaParaGuardar('j', motivo)).toBeNull()
  })

  it('abrir un resultado al que se llegó solo por categoría o fecha (campo vacío) no guarda nada', () => {
    expect(busquedaParaGuardar('', 'abrir-resultado')).toBeNull()
  })
})

describe('leerSobreBusquedas: lo guardado → la lista, sin tirar nunca', () => {
  it('ida y vuelta con armarSobreBusquedas', () => {
    expect(leerSobreBusquedas(armarSobreBusquedas(['jazz', 'teatro']))).toEqual(['jazz', 'teatro'])
  })

  it.each([
    ['nada guardado', null],
    ['JSON roto', '{"v":1,"busquedas":["ja'],
    ['texto que no es JSON', 'jazz'],
    ['null', 'null'],
    ['un número', '42'],
    ['otra versión', JSON.stringify({ v: VERSION_BUSQUEDAS + 1, busquedas: ['jazz'] })],
    ['sin versión', JSON.stringify({ busquedas: ['jazz'] })],
    ['busquedas no es un array', JSON.stringify({ v: VERSION_BUSQUEDAS, busquedas: 'jazz' })],
    ['un array suelto, sin sobre', JSON.stringify(['jazz'])],
  ])('%s → []', (_caso, crudo) => {
    expect(leerSobreBusquedas(crudo)).toEqual([])
  })

  it('descarta lo que no es texto, las vacías y las repetidas, y corta en el tope (conservando el orden)', () => {
    const crudo = JSON.stringify({
      v: VERSION_BUSQUEDAS,
      busquedas: ['Peña', 7, null, '  ', 'jazz', 'pena', 'a', 'uno', 'dos', 'tres', 'cuatro'],
    })
    expect(leerSobreBusquedas(crudo)).toEqual(['Peña', 'jazz', 'uno', 'dos', 'tres'])
  })
})

// ---------------------------------------------------------------------------
// 2. Con el almacén.
// ---------------------------------------------------------------------------

describe('guardar y leer con un almacén doble', () => {
  it('guarda bajo CLAVE_BUSQUEDAS_RECIENTES y se lee igual (la más reciente primero)', async () => {
    const almacen = almacenEnMemoria()
    await guardarBusquedaReciente('jazz', almacen)
    await guardarBusquedaReciente('teatro', almacen)
    expect(almacen.memoria.has(CLAVE_BUSQUEDAS_RECIENTES)).toBe(true)
    expect(await leerBusquedasRecientes(almacen)).toEqual(['teatro', 'jazz'])
  })

  it('guardarBusquedaReciente devuelve cómo quedó la lista', async () => {
    const almacen = almacenEnMemoria()
    await guardarBusquedaReciente('jazz', almacen)
    expect(await guardarBusquedaReciente('JAZZ', almacen)).toEqual(['JAZZ'])
  })

  it('dedupe y tope también en el disco', async () => {
    const almacen = almacenEnMemoria()
    for (const texto of ['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'Dos']) await guardarBusquedaReciente(texto, almacen)
    expect(await leerBusquedasRecientes(almacen)).toEqual(['Dos', 'seis', 'cinco', 'cuatro', 'tres'])
  })

  it('una vacía o muy corta no escribe nada', async () => {
    const almacen = almacenEnMemoria()
    await guardarBusquedaReciente('   ', almacen)
    await guardarBusquedaReciente('x', almacen)
    expect(almacen.memoria.size).toBe(0)
  })

  it('dos guardados sin esperar el primero no se pisan (van en fila)', async () => {
    const almacen = almacenEnMemoria()
    await Promise.all([guardarBusquedaReciente('jazz', almacen), guardarBusquedaReciente('teatro', almacen)])
    expect(await leerBusquedasRecientes(almacen)).toEqual(['teatro', 'jazz'])
  })

  it('«jaz» y después «jazz» deja solo «jazz» en el disco', async () => {
    const almacen = almacenEnMemoria()
    await guardarBusquedaReciente('jaz', almacen)
    await guardarBusquedaReciente('jazz', almacen)
    expect(await leerBusquedasRecientes(almacen)).toEqual(['jazz'])
  })

  it('JSON corrupto en el almacén → lista vacía, sin tirar, y la clave rota se borra', async () => {
    const almacen = almacenEnMemoria({ [CLAVE_BUSQUEDAS_RECIENTES]: '{roto' })
    expect(await leerBusquedasRecientes(almacen)).toEqual([])
    expect(almacen.memoria.has(CLAVE_BUSQUEDAS_RECIENTES)).toBe(false)
    // Y se puede volver a guardar encima.
    expect(await guardarBusquedaReciente('jazz', almacen)).toEqual(['jazz'])
  })
})

// Lo que hace buscar.tsx: cada respuesta de la fila REEMPLAZA el estado
// (`.then(setRecientes)`), en el orden en que llegan. Acá se simula con un
// `estado` que se pisa en cada `.then`, y se prueba que el último valor es
// siempre el correcto aunque la lectura del foco se pida antes de que termine
// un guardado o un borrado (o al revés).
describe('la fila: la lectura del foco no pisa un guardado ni un borrado en curso', () => {
  function pantalla() {
    let estado: string[] = []
    const reemplazar = (lista: string[]) => {
      estado = lista
    }
    return { reemplazar, actual: () => estado }
  }

  it('lectura pedida ANTES de un guardado: resuelve primero (lista vieja) y el guardado la reemplaza después', async () => {
    const almacen = almacenEnMemoria({ [CLAVE_BUSQUEDAS_RECIENTES]: armarSobreBusquedas(['teatro']) })
    const vista = pantalla()
    const orden: string[] = []
    const lectura = leerBusquedasRecientes(almacen).then((lista) => {
      orden.push('lectura')
      vista.reemplazar(lista)
    })
    const guardado = guardarBusquedaReciente('jazz', almacen).then((lista) => {
      orden.push('guardado')
      vista.reemplazar(lista)
    })
    await Promise.all([lectura, guardado])
    expect(orden).toEqual(['lectura', 'guardado'])
    expect(vista.actual()).toEqual(['jazz', 'teatro'])
  })

  it('lectura pedida DESPUÉS de un guardado que no terminó: ya ve el guardado', async () => {
    const almacen = almacenEnMemoria()
    const guardado = guardarBusquedaReciente('jazz', almacen)
    const lectura = leerBusquedasRecientes(almacen)
    expect(await lectura).toEqual(['jazz'])
    await guardado
  })

  it('lectura pedida después de un borrado que no terminó: da [] (no resucita lo borrado)', async () => {
    const almacen = almacenEnMemoria({ [CLAVE_BUSQUEDAS_RECIENTES]: armarSobreBusquedas(['jazz']) })
    const vista = pantalla()
    vista.reemplazar(['jazz'])
    const borrado = borrarHistorialDeBusquedas(almacen)
    vista.reemplazar([]) // buscar.tsx vacía en el momento
    await leerBusquedasRecientes(almacen).then(vista.reemplazar)
    await borrado
    expect(vista.actual()).toEqual([])
  })
})

describe('borrar historial', () => {
  it('borra las claves qps:busquedas:* de cualquier versión y nada más', async () => {
    const almacen = almacenEnMemoria({
      [CLAVE_BUSQUEDAS_RECIENTES]: armarSobreBusquedas(['jazz']),
      'qps:busquedas:v0:recientes': '["viejo"]',
      'qps:cache:v1:agenda': '{}',
      'otra-cosa': 'x',
    })
    expect(await borrarHistorialDeBusquedas(almacen)).toBe(true)
    expect([...almacen.memoria.keys()].sort()).toEqual(['otra-cosa', 'qps:cache:v1:agenda'])
    expect(await leerBusquedasRecientes(almacen)).toEqual([])
  })

  it('sin nada guardado, no tira y devuelve true', async () => {
    expect(await borrarHistorialDeBusquedas(almacenEnMemoria())).toBe(true)
  })
})

describe('un almacén que falla no rompe Buscar (nunca tira)', () => {
  it('leer → []', async () => {
    await expect(leerBusquedasRecientes(almacenQueFalla)).resolves.toEqual([])
  })

  it('guardar → la lista en memoria igual (la pantalla la muestra en esta sesión)', async () => {
    await expect(guardarBusquedaReciente('jazz', almacenQueFalla)).resolves.toEqual(['jazz'])
  })

  it('borrar historial → false, sin tirar', async () => {
    await expect(borrarHistorialDeBusquedas(almacenQueFalla)).resolves.toBe(false)
  })

  it('después de un fallo, la fila sigue andando con un almacén sano', async () => {
    await guardarBusquedaReciente('jazz', almacenQueFalla)
    const sano = almacenEnMemoria()
    expect(await guardarBusquedaReciente('teatro', sano)).toEqual(['teatro'])
  })
})

describe('con almacenPorDefecto (sobre el doble de tests/dobles/async-storage.ts)', () => {
  it('guarda, lee y borra por el adaptador real', async () => {
    await guardarBusquedaReciente('jazz')
    expect(await AsyncStorage.getItem(CLAVE_BUSQUEDAS_RECIENTES)).toBe(armarSobreBusquedas(['jazz']))
    expect(await leerBusquedasRecientes()).toEqual(['jazz'])
    await borrarHistorialDeBusquedas()
    expect(await AsyncStorage.getAllKeys()).toEqual([])
  })
})

describe('la clave y las limpiezas por prefijo del repo', () => {
  it('clave versionada con prefijo propio, fuera de qps:cache:', () => {
    expect(CLAVE_BUSQUEDAS_RECIENTES).toBe('qps:busquedas:v1:recientes')
    expect(CLAVE_BUSQUEDAS_RECIENTES.startsWith(PREFIJO_BUSQUEDAS)).toBe(true)
    expect(CLAVE_BUSQUEDAS_RECIENTES.startsWith(PREFIJO_CACHE)).toBe(false)
  })

  it('sobrevive a cerrar sesión / cambiar de cuenta (borrarCacheFavoritos)', async () => {
    await guardarBusquedaReciente('jazz')
    await borrarCacheFavoritos()
    expect(await leerBusquedasRecientes()).toEqual(['jazz'])
  })

  it('sobrevive a un cambio de versión de la caché (limpiarVersionesViejas)', async () => {
    await guardarBusquedaReciente('jazz')
    await AsyncStorage.setItem('qps:cache:v0:agenda', '{}')
    await limpiarVersionesViejas()
    expect(await AsyncStorage.getItem('qps:cache:v0:agenda')).toBeNull()
    expect(await leerBusquedasRecientes()).toEqual(['jazz'])
  })

  it('sobrevive a borrarTodaLaCache (el borrado de la caché al eliminar la cuenta: no vive bajo qps:cache:)', async () => {
    await guardarBusquedaReciente('jazz')
    await borrarTodaLaCache()
    expect(await leerBusquedasRecientes()).toEqual(['jazz'])
  })
})

// ---------------------------------------------------------------------------
// 3. Detectores sobre el código en disco.
// ---------------------------------------------------------------------------

const RAIZ = fileURLToPath(new URL('..', import.meta.url)) // apps/mobile/
const leer = (...partes: string[]) => readFileSync(join(RAIZ, ...partes), 'utf8')

/** Saca comentarios de línea y de bloque (aproximado, alcanza para estos detectores: ninguno de estos archivos tiene `//` adentro de un string). */
function sinComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function listarCodigo(dir: string): string[] {
  const resultado: string[] = []
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre.startsWith('.')) continue
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) resultado.push(...listarCodigo(ruta))
    else if (/\.(ts|tsx)$/.test(nombre)) resultado.push(ruta)
  }
  return resultado
}

const SRC_MODULO = leer('lib', 'busquedas-recientes.ts')
const SRC_COMPONENTE = leer('components', 'BusquedasRecientes.tsx')
const SRC_BUSCAR = leer('app', '(tabs)', 'buscar.tsx')

describe('detector: solo lib/sin-conexion/almacen.ts importa AsyncStorage', () => {
  it('ningún archivo de lib/, components/ o app/ fuera de almacen.ts lo nombra (ni el módulo ni la sección nuevos)', () => {
    const permitido = join(RAIZ, 'lib', 'sin-conexion', 'almacen.ts')
    const ofensores = ['lib', 'components', 'app']
      .flatMap((carpeta) => listarCodigo(join(RAIZ, carpeta)))
      .filter((archivo) => archivo !== permitido)
      .filter((archivo) => readFileSync(archivo, 'utf8').includes('@react-native-async-storage/async-storage'))
      .map((archivo) => relative(RAIZ, archivo))
    expect(ofensores).toEqual([])
  })

  it('el módulo usa el adaptador Almacen/almacenPorDefecto', () => {
    expect(SRC_MODULO).toMatch(/import type \{ Almacen \} from '\.\/sin-conexion\/almacen'/)
    expect(SRC_MODULO).toMatch(/import \{ almacenPorDefecto \} from '\.\/sin-conexion\/almacen'/)
  })
})

describe('detector: el historial nunca sale del teléfono', () => {
  const PROHIBIDOS = /metricas|sentry|supabase|fetch\s*\(|console\.|registrar[A-Z]/i

  it('el módulo y la sección no importan métricas, Sentry ni Supabase, no hacen fetch ni loguean', () => {
    expect(sinComentarios(SRC_MODULO)).not.toMatch(PROHIBIDOS)
    expect(sinComentarios(SRC_COMPONENTE)).not.toMatch(PROHIBIDOS)
  })

  it('buscar.tsx no importa métricas, Sentry ni Supabase, ni loguea', () => {
    const codigo = sinComentarios(SRC_BUSCAR)
    expect(codigo).not.toMatch(/from ['"][^'"]*(metricas|sentry|supabase)[^'"]*['"]/i)
    expect(codigo).not.toMatch(/console\./)
  })

  it('lib/metricas*.ts y lib/sentry.ts no saben nada del historial', () => {
    const archivos = readdirSync(join(RAIZ, 'lib')).filter((nombre) => /^(metricas.*|sentry)\.ts$/.test(nombre))
    expect(archivos.length).toBeGreaterThanOrEqual(2)
    for (const nombre of archivos) {
      expect(leer('lib', nombre), nombre).not.toMatch(/busquedas|recientes|historial/i)
    }
  })

  it('ningún botón del historial lleva sentry-label (lo único que leen las migas de toque de Sentry.wrap)', () => {
    expect(SRC_COMPONENTE).not.toMatch(/sentry-label/)
    expect(SRC_BUSCAR).not.toMatch(/sentry-label/)
  })
})

describe('detector: la sección de búsquedas recientes', () => {
  const COMPONENTE = sinComentarios(SRC_COMPONENTE)

  it('título de sección con accessibilityRole="header"', () => {
    expect(COMPONENTE).toMatch(/<Texto[^>]*accessibilityRole="header"[^>]*>\s*Búsquedas recientes\s*</)
  })

  it('«Borrar historial» es un Pressable con rol de botón y etiqueta', () => {
    expect(COMPONENTE).toMatch(
      /<Pressable[^>]*accessibilityRole="button"[^>]*accessibilityLabel="Borrar historial de búsquedas"[^>]*>[\s\S]*?Borrar historial[\s\S]*?<\/Pressable>/,
    )
  })

  it('pide confirmación sin dependencias (Alert de react-native), que se puede cerrar con atrás', () => {
    expect(COMPONENTE).toMatch(/import \{[^}]*\bAlert\b[^}]*\} from 'react-native'/)
    expect(COMPONENTE).toMatch(/Alert\.alert\([\s\S]*?\{ cancelable: true \},?\s*\)/)
  })

  it('anuncia el borrado postergado DEMORA_ANUNCIO_BORRADO_MS (~400 ms), no en el mismo instante', () => {
    expect(COMPONENTE).toMatch(/DEMORA_ANUNCIO_BORRADO_MS = 400\b/)
    expect(COMPONENTE).toMatch(
      /setTimeout\(\(\) => AccessibilityInfo\.announceForAccessibility\(ANUNCIO_HISTORIAL_BORRADO\), DEMORA_ANUNCIO_BORRADO_MS\)/,
    )
  })

  it('una sola fila con scroll horizontal (no flexWrap) y chips de una línea con ancho máximo', () => {
    expect(COMPONENTE).toMatch(/<ScrollView\s+horizontal\b/)
    expect(COMPONENTE).not.toMatch(/flexWrap/)
    expect(COMPONENTE).toMatch(/ANCHO_MAXIMO_CHIP = 240\b/)
    expect(COMPONENTE).toMatch(/chip: \{[^}]*maxWidth: ANCHO_MAXIMO_CHIP/)
    expect(COMPONENTE).toMatch(/<Texto numberOfLines=\{1\}[^>]*>\s*\{busqueda\}/)
  })

  it('«Borrar historial» va DESPUÉS de los chips en el árbol (orden de foco), a la derecha', () => {
    const finChips = COMPONENTE.indexOf('</ScrollView>')
    const borrar = COMPONENTE.indexOf('accessibilityLabel="Borrar historial de búsquedas"')
    expect(finChips).toBeGreaterThan(0)
    expect(borrar).toBeGreaterThan(finChips)
    expect(COMPONENTE).toMatch(/botonBorrar: \{[^}]*alignSelf: 'flex-end'/)
    expect(COMPONENTE).toMatch(/seccion: \{ marginBottom: 24 \}/)
  })

  it('cada búsqueda es un botón con la etiqueta «Buscar de nuevo: <texto>»', () => {
    expect(COMPONENTE).toMatch(/return `Buscar de nuevo: \$\{busqueda\}`/)
    expect(COMPONENTE).toMatch(/accessibilityRole="button"\s+accessibilityLabel=\{etiquetaBusquedaReciente\(busqueda\)\}/)
  })

  it('área táctil: el chip y el botón de borrar miden AREA_TACTIL_MINIMA de alto como mínimo', () => {
    expect(COMPONENTE).toMatch(/import \{ AREA_TACTIL_MINIMA \} from '@\/lib\/accesibilidad'/)
    expect(COMPONENTE).toMatch(/chip: \{[^}]*minHeight: AREA_TACTIL_MINIMA/)
    expect(COMPONENTE).toMatch(/botonBorrar: \{[^}]*minHeight: AREA_TACTIL_MINIMA/)
  })

  it('colores del tema (claro/oscuro): useColoresQPS y bordeChipInactivo, sin hex sueltos', () => {
    expect(COMPONENTE).toMatch(/useColoresQPS\(\)/)
    expect(COMPONENTE).toMatch(/bordeChipInactivo\(colores\)/)
    expect(COMPONENTE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})

describe('detector: cómo lo usa buscar.tsx', () => {
  const BUSCAR = sinComentarios(SRC_BUSCAR)

  it('no guarda en cada tecla: onChangeText sigue siendo setTexto a secas', () => {
    expect(BUSCAR).toMatch(/onChangeText=\{setTexto\}/)
  })

  it('guarda al enviar con el teclado (returnKeyType="search" + onSubmitEditing, motivo «enviar»)', () => {
    expect(BUSCAR).toMatch(/returnKeyType="search"/)
    expect(BUSCAR).toMatch(/onSubmitEditing=\{\(evento\) => recordarBusqueda\(evento\.nativeEvent\.text, 'enviar'\)\}/)
  })

  it('guarda al abrir un resultado (onAbrir de TarjetaEvento, motivo «abrir-resultado»)', () => {
    expect(BUSCAR).toMatch(/<TarjetaEvento evento=\{item\} onAbrir=\{\(\) => recordarBusqueda\(texto, 'abrir-resultado'\)\} \/>/)
  })

  it('guarda al tocar una reciente (motivo «repetir») y anuncia los resultados sin mover el foco', () => {
    const repetir = BUSCAR.slice(BUSCAR.indexOf('function repetirBusqueda'), BUSCAR.indexOf('function textoSinResultados'))
    expect(repetir).toMatch(/setTexto\(busqueda\)/)
    expect(repetir).toMatch(/recordarBusqueda\(busqueda, 'repetir'\)/)
    expect(repetir).toMatch(/AccessibilityInfo\.announceForAccessibility\(textoResultados\(cantidad, busqueda\)\)/)
    expect(repetir).not.toMatch(/findNodeHandle|setAccessibilityFocus|\.focus\(/)
  })

  it('la decisión de guardar pasa por busquedaParaGuardar (no una regla propia de la pantalla)', () => {
    expect(BUSCAR).toMatch(/const aGuardar = busquedaParaGuardar\(valor, motivo\)/)
  })

  it('NO guarda al salir de la pestaña: useFocusEffect solo relee, sin función de limpieza', () => {
    expect(BUSCAR).toMatch(/import \{[^}]*\buseFocusEffect\b[^}]*\} from 'expo-router'/)
    const foco = BUSCAR.slice(BUSCAR.indexOf('useFocusEffect('), BUSCAR.indexOf('const recordarBusqueda'))
    expect(foco).toMatch(/useCallback\(\(\) => \{\s*leerBusquedasRecientes\(\)\.then\(setRecientes\)\s*\}, \[\]\)/)
    expect(foco).not.toMatch(/return\s*\(\)\s*=>|=> \(\) =>/)
    expect(BUSCAR).not.toMatch(/useRef/)
  })

  it('la sección va en el ListHeaderComponent de «Explorar por categoría» (arriba de la grilla, nunca en un footer con el banner)', () => {
    expect(BUSCAR).toMatch(/ListHeaderComponent=\{\s*<>\s*<BusquedasRecientes\b[\s\S]*?Explorar por categoría/)
    expect(BUSCAR).not.toMatch(/ListFooterComponent=\{[^}]*BusquedasRecientes/)
    expect(BUSCAR.match(/<BusquedasRecientes\b/g) ?? []).toHaveLength(1)
  })

  it('el estado sale de las promesas de la fila (setState en el .then, nunca sincrónico en un efecto)', () => {
    expect(BUSCAR).toMatch(/guardarBusquedaReciente\(aGuardar\)\.then\(setRecientes\)/)
  })
})

describe('detector: TarjetaEvento.onAbrir (aditiva)', () => {
  const TARJETA = sinComentarios(leer('components', 'TarjetaEvento.tsx'))

  it('es opcional y se llama justo antes de navegar', () => {
    expect(TARJETA).toMatch(/onAbrir\?: \(\) => void/)
    expect(TARJETA).toMatch(/onPress=\{\(\) => \{\s*onAbrir\?\.\(\)\s*router\.push\(rutaDeEvento\(evento\)\)\s*\}\}/)
  })

  it('el resto de las pantallas la usan sin onAbrir (no cambia nada para ellas)', () => {
    const usos = ['app', 'components']
      .flatMap((carpeta) => listarCodigo(join(RAIZ, carpeta)))
      .filter((archivo) => /onAbrir=/.test(readFileSync(archivo, 'utf8')))
      .map((archivo) => relative(RAIZ, archivo))
    expect(usos).toEqual([join('app', '(tabs)', 'buscar.tsx')])
  })
})
