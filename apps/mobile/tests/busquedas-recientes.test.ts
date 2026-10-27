// A5 (nube Q1): búsquedas recientes de Buscar. Tres partes, mismo estilo que
// el resto de `tests/`:
//   1. La lógica pura de `lib/busquedas-recientes.ts` (normalizar, dedupe sin
//      distinguir mayúsculas/tildes, orden, tope, sobre roto).
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
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { reiniciar } from './dobles/async-storage'
import type { Almacen } from '@/lib/sin-conexion/almacen'
import {
  agregarBusqueda,
  armarSobreBusquedas,
  borrarHistorialDeBusquedas,
  CLAVE_BUSQUEDAS_RECIENTES,
  claveDeComparacion,
  guardarBusquedaReciente,
  LARGO_MAXIMO_BUSQUEDA,
  LARGO_MINIMO_BUSQUEDA,
  leerBusquedasRecientes,
  leerSobreBusquedas,
  normalizarBusqueda,
  PREFIJO_BUSQUEDAS,
  quitarBusqueda,
  quitarBusquedaReciente,
  TOPE_BUSQUEDAS_RECIENTES,
  VERSION_BUSQUEDAS,
} from '@/lib/busquedas-recientes'
import {
  borrarCacheFavoritos,
  borrarTodaLaCache,
  limpiarVersionesViejas,
  PREFIJO_CACHE,
} from '@/lib/sin-conexion/cache'
import { limpiarTrasEliminarCuenta } from '@/lib/cuenta'

// `lib/cuenta.ts` (para `limpiarTrasEliminarCuenta`) trae Supabase, Google y
// SecureStore: mismos dobles que `tests/eliminar-cuenta.test.ts` (`vi.mock`
// se iza arriba de los imports, así que el import de `@/lib/cuenta` ya los ve).
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { signOut: vi.fn(async () => {}) } } }))
vi.mock('@react-native-google-signin/google-signin', () => ({ GoogleSignin: { signOut: vi.fn(async () => {}) } }))
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
}))

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
})

describe('quitarBusqueda', () => {
  it('saca una sola, sin distinguir mayúsculas ni tildes', () => {
    expect(quitarBusqueda(['Peña', 'jazz'], 'pena')).toEqual(['jazz'])
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

  it('JSON corrupto en el almacén → lista vacía, sin tirar, y la clave rota se borra', async () => {
    const almacen = almacenEnMemoria({ [CLAVE_BUSQUEDAS_RECIENTES]: '{roto' })
    expect(await leerBusquedasRecientes(almacen)).toEqual([])
    expect(almacen.memoria.has(CLAVE_BUSQUEDAS_RECIENTES)).toBe(false)
    // Y se puede volver a guardar encima.
    expect(await guardarBusquedaReciente('jazz', almacen)).toEqual(['jazz'])
  })

  it('quitarBusquedaReciente saca una; si era la última, borra la clave', async () => {
    const almacen = almacenEnMemoria()
    await guardarBusquedaReciente('jazz', almacen)
    await guardarBusquedaReciente('teatro', almacen)
    expect(await quitarBusquedaReciente('TEATRO', almacen)).toEqual(['jazz'])
    expect(await quitarBusquedaReciente('jazz', almacen)).toEqual([])
    expect(almacen.memoria.has(CLAVE_BUSQUEDAS_RECIENTES)).toBe(false)
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

  it('quitar → no tira', async () => {
    await expect(quitarBusquedaReciente('jazz', almacenQueFalla)).resolves.toEqual([])
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

  it('borrarTodaLaCache sola no lo toca (no vive bajo qps:cache:)…', async () => {
    await guardarBusquedaReciente('jazz')
    await borrarTodaLaCache()
    expect(await leerBusquedasRecientes()).toEqual(['jazz'])
  })

  it('…pero eliminar la cuenta (limpiarTrasEliminarCuenta) sí lo borra', async () => {
    await guardarBusquedaReciente('jazz')
    await limpiarTrasEliminarCuenta(false)
    expect(await leerBusquedasRecientes()).toEqual([])
    expect(await AsyncStorage.getItem(CLAVE_BUSQUEDAS_RECIENTES)).toBeNull()
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
const SRC_CUENTA = leer('lib', 'cuenta.ts')

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

  it('pide confirmación sin dependencias (Alert de react-native) y anuncia el borrado', () => {
    expect(COMPONENTE).toMatch(/import \{[^}]*\bAlert\b[^}]*\} from 'react-native'/)
    expect(COMPONENTE).toMatch(/Alert\.alert\(/)
    expect(COMPONENTE).toMatch(/AccessibilityInfo\.announceForAccessibility\(ANUNCIO_HISTORIAL_BORRADO\)/)
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

  it('guarda al enviar con el teclado (returnKeyType="search" + onSubmitEditing)', () => {
    expect(BUSCAR).toMatch(/returnKeyType="search"/)
    expect(BUSCAR).toMatch(/onSubmitEditing=\{\(evento\) => recordarBusqueda\(evento\.nativeEvent\.text\)\}/)
  })

  it('guarda al salir de la pantalla solo con resultados a la vista (useFocusEffect)', () => {
    expect(BUSCAR).toMatch(/import \{[^}]*\buseFocusEffect\b[^}]*\} from 'expo-router'/)
    expect(BUSCAR).toMatch(/if \(cantidad > 0\) recordarBusqueda\(alSalir\)/)
  })

  it('la sección va en el ListHeaderComponent de «Explorar por categoria» (arriba de la grilla, nunca en un footer con el banner)', () => {
    expect(BUSCAR).toMatch(/ListHeaderComponent=\{\s*<>\s*<BusquedasRecientes\b[\s\S]*?Explorar por categoria/)
    expect(BUSCAR).not.toMatch(/ListFooterComponent=\{[^}]*BusquedasRecientes/)
    expect(BUSCAR.match(/<BusquedasRecientes\b/g) ?? []).toHaveLength(1)
  })

  it('el estado se carga en el callback de la promesa, no en el cuerpo del efecto', () => {
    expect(BUSCAR).toMatch(/leerBusquedasRecientes\(\)\.then\(\(guardadas\) => \{\s*if \(!cancelado\) setRecientes\(/)
  })
})

describe('detector: eliminar la cuenta borra el historial', () => {
  it('limpiarTrasEliminarCuenta llama a borrarHistorialDeBusquedas()', () => {
    const cuerpo = SRC_CUENTA.slice(SRC_CUENTA.indexOf('export async function limpiarTrasEliminarCuenta'))
    expect(cuerpo).toMatch(/await borrarHistorialDeBusquedas\(\)/)
  })
})
