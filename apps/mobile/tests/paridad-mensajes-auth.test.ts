// Tarea 48-q (qa): paridad de mensajes de auth entre la web y la app. La web
// y la app tienen que IMPORTAR de core (`@qps/core/auth/mensajes` y
// `@qps/core/auth/cuenta`) los textos de `resultadoAlta`, `mensajeErrorIngreso`,
// `mensajeErrorContrasena` y `textosContrasena`, y ninguna de las dos los
// escribe a mano.
//
// La lista de frases se arma LLAMANDO a las funciones reales de core (nunca
// copiando los textos a mano) y se barren los archivos de PRODUCCIÓN de los
// dos lados (apps/web/{app,components,lib} y apps/mobile/{app,components,lib})
// buscando esas frases escritas a mano, fuera de core.
//
// Hay UNA excepción documentada y permitida (no un fallo silencioso, no un
// "se ignora sin avisar"): `apps/mobile/app/(tabs)/cuenta.tsx` conserva el
// mapa `MENSAJES_ERROR`, que todavía usa `entrarConGoogle`/`salir()` y tiene,
// sin uso real, el texto de `invalid_credentials` y de `email_not_confirmed`
// (quedaron sin uso en el camino de `entrar`, que ahora va por core — ver los
// comentarios de ese archivo, líneas 59-66). El describe de más abajo "LA
// EXCEPCIÓN DOCUMENTADA" fija que ese bloque existe, por qué, y sobre todo
// que el CUERPO de `entrar()` (la función real) no escribe ninguno de esos
// textos a mano.
//
// La web importa `mensajeErrorIngreso` por el shim `@/lib/auth/mensajes`
// (`apps/web/lib/auth/mensajes.ts`), que es un `export * from
// '@qps/core/auth/mensajes'` — eso CUENTA como importar de core, no como
// escribirlo a mano. Se verifica el contenido del shim antes de barrer, para
// no dar un falso rojo.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MENSAJE_ALTA_ENVIADA,
  MENSAJE_ALTA_GENERICO,
  mensajeErrorAlta,
  mensajeErrorContrasena,
  mensajeErrorIngreso,
} from '@qps/core/auth/mensajes'
import { textosContrasena, validarContrasenaNueva } from '@qps/core/auth/cuenta'

const ROOT_MOBILE = process.cwd() // apps/mobile cuando se corre `npm test` desde ahí
const ROOT_WEB = join(ROOT_MOBILE, '..', 'web')

const RUTA_CUENTA_APP = join(ROOT_MOBILE, 'app', '(tabs)', 'cuenta.tsx')
const SRC_CUENTA_APP = readFileSync(RUTA_CUENTA_APP, 'utf8')
const RUTA_SHIM_WEB = join(ROOT_WEB, 'lib', 'auth', 'mensajes.ts')

// --- La lista de frases, armada LLAMANDO a las funciones reales de core ----
// (no copiadas a mano). Solo frases "sustanciales" (más de 12 caracteres):
// una frase muy corta podría coincidir por casualidad con texto no
// relacionado y producir un falso rojo.
function frasesDeCore(): string[] {
  const candidatas = [
    MENSAJE_ALTA_GENERICO,
    MENSAJE_ALTA_ENVIADA,
    mensajeErrorAlta({ code: 'weak_password' }),
    mensajeErrorAlta({ code: 'email_address_invalid' }),
    mensajeErrorAlta({ code: 'over_email_send_rate_limit' }),
    mensajeErrorIngreso({ code: 'invalid_credentials' }),
    mensajeErrorIngreso({ code: 'email_not_confirmed' }),
    mensajeErrorIngreso({ code: 'algo_que_no_existe' }),
    mensajeErrorContrasena({ code: 'same_password' }),
    mensajeErrorContrasena({ code: 'reauthentication_needed' }),
    mensajeErrorContrasena({ code: 'algo_que_no_existe' }),
    textosContrasena('google').descripcion,
    textosContrasena('email').descripcion,
    textosContrasena('desconocida').descripcion,
    textosContrasena('restablecer').titulo,
    textosContrasena('restablecer').descripcion,
  ]

  const validacionCorta = validarContrasenaNueva('a', 'a')
  if (!validacionCorta.ok) candidatas.push(validacionCorta.mensaje)
  const validacionDistinta = validarContrasenaNueva('abcdefg', 'distinta')
  if (!validacionDistinta.ok) candidatas.push(validacionDistinta.mensaje)
  return [...new Set(candidatas.filter((f) => f.length > 12))]
}

const FRASES = frasesDeCore()

function listarArchivosRecursivo(carpeta: string): string[] {
  let entradas: string[]
  try {
    entradas = readdirSync(carpeta)
  } catch {
    return []
  }
  const resultado: string[] = []
  for (const entrada of entradas) {
    const rutaCompleta = join(carpeta, entrada)
    const info = statSync(rutaCompleta)
    if (info.isDirectory()) {
      resultado.push(...listarArchivosRecursivo(rutaCompleta))
    } else if (/\.(ts|tsx)$/.test(entrada)) {
      resultado.push(rutaCompleta)
    }
  }
  return resultado
}

const CARPETAS_WEB = ['app', 'components', 'lib'].map((d) => join(ROOT_WEB, d))
const CARPETAS_MOBILE = ['app', 'components', 'lib'].map((d) => join(ROOT_MOBILE, d))
const ARCHIVOS_PRODUCCION = [...CARPETAS_WEB, ...CARPETAS_MOBILE].flatMap(listarArchivosRecursivo)

/**
 * Para `apps/mobile/app/(tabs)/cuenta.tsx` (y SOLO para ese archivo), saca el
 * bloque del mapa `MENSAJES_ERROR` (la excepción documentada) antes de
 * buscar frases escritas a mano. Para cualquier otro archivo, devuelve el
 * contenido tal cual.
 */
function contenidoParaBarrer(archivo: string, contenido: string): string {
  if (archivo !== RUTA_CUENTA_APP) return contenido
  const inicio = contenido.indexOf('const MENSAJES_ERROR')
  const fin = contenido.indexOf('const MENSAJE_GENERICO')
  if (inicio < 0 || fin < 0 || fin <= inicio) {
    throw new Error(
      'No se pudo recortar el bloque MENSAJES_ERROR de cuenta.tsx con el patrón esperado: ¿cambió el código? ' +
        'Si el bloque se borró del todo, este test ya no necesita la excepción (hay que borrarla, no dejarla).',
    )
  }
  return contenido.slice(0, inicio) + contenido.slice(fin)
}

/**
 * Saca comentarios de línea y de bloque antes de buscar una frase. Un
 * comentario que MENCIONA el texto como documentación (ej. "sale de
 * textosContrasena('restablecer'), 'Elegí tu contraseña nueva' hoy") no es
 * "escribirlo a mano": es justo lo contrario, deja explícito que el texto
 * sale de una función. Mismo criterio (y mismo límite conocido: no es un
 * parser de JS, no distingue un `//` dentro de un string) que
 * `sanearComentarios` de tests/cuenta/eliminar-endpoint.test.ts en la web.
 */
function sanearComentarios(contenido: string): string {
  return contenido.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, '')
}

describe('el shim de la web (@/lib/auth/mensajes) reexporta de core: importarlo de ahí CUENTA como importar de core', () => {
  it('apps/web/lib/auth/mensajes.ts es exactamente un re-export de @qps/core/auth/mensajes (sin texto propio)', () => {
    const contenido = readFileSync(RUTA_SHIM_WEB, 'utf8')
    expect(contenido).toMatch(/export\s*\*\s*from\s*['"]@qps\/core\/auth\/mensajes['"]/)
    // Sanity check de que de verdad no hay ningún literal largo escrito ahí
    // (si lo hubiera, el barrido de abajo tendría sentido aplicarlo también
    // a este archivo; hoy no lo necesita).
    for (const frase of FRASES) {
      expect(contenido.includes(frase)).toBe(false)
    }
  })
})

describe('la lista de frases, armada desde core, no vino vacía', () => {
  it('se juntaron frases de resultadoAlta/mensajeErrorIngreso/mensajeErrorContrasena/textosContrasena/validarContrasenaNueva', () => {
    expect(FRASES.length).toBeGreaterThanOrEqual(10)
  })
})

describe('barrido: ningún archivo de producción (web o app) escribe a mano, fuera de un comentario, una frase que viene de core', () => {
  it('se encontraron archivos de producción para barrer, de los dos lados', () => {
    const archivosWeb = ARCHIVOS_PRODUCCION.filter((a) => a.startsWith(ROOT_WEB))
    const archivosMobile = ARCHIVOS_PRODUCCION.filter((a) => a.startsWith(ROOT_MOBILE))
    expect(archivosWeb.length).toBeGreaterThan(0)
    expect(archivosMobile.length).toBeGreaterThan(0)
  })

  // Un solo test (no uno por archivo): con ~190 archivos de producción entre
  // los dos lados, un `it` por archivo infla el conteo de tests de la ronda
  // sin agregar señal — y la lista de infractores en UN solo mensaje de
  // error es más fácil de leer que 190 resultados verdes sueltos. Los
  // comentarios se sacan antes de buscar (ver sanearComentarios): una
  // mención documental del texto (ej. "sale de textosContrasena(...), 'X'
  // hoy") no es escribirlo a mano.
  it('ningún archivo (fuera de comentarios, y fuera del bloque MENSAJES_ERROR ya documentado) contiene, como literal de código, una frase que core ya exporta', () => {
    const ofensores: string[] = []
    for (const archivo of ARCHIVOS_PRODUCCION) {
      const contenidoCrudo = readFileSync(archivo, 'utf8')
      const sinComentarios = sanearComentarios(contenidoParaBarrer(archivo, contenidoCrudo))
      const nombreCorto = relative(join(ROOT_MOBILE, '..'), archivo).split('\\').join('/')
      for (const frase of FRASES) {
        if (sinComentarios.includes(frase)) {
          ofensores.push(`${nombreCorto}: "${frase}"`)
        }
      }
    }
    expect(ofensores, `Frases de core escritas a mano:\n${ofensores.join('\n')}`).toEqual([])
  })
})

describe('LA EXCEPCIÓN DOCUMENTADA: MENSAJES_ERROR de apps/mobile/app/(tabs)/cuenta.tsx', () => {
  function bloqueMensajesError(): string {
    const inicio = SRC_CUENTA_APP.indexOf('const MENSAJES_ERROR')
    const fin = SRC_CUENTA_APP.indexOf('const MENSAJE_GENERICO')
    expect(inicio, 'no se encontró MENSAJES_ERROR').toBeGreaterThan(-1)
    expect(fin, 'no se encontró MENSAJE_GENERICO después de MENSAJES_ERROR').toBeGreaterThan(inicio)
    return SRC_CUENTA_APP.slice(inicio, fin)
  }

  it('el bloque existe hoy (si algún día se borra del todo, hay que borrar esta excepción, no dejarla fallando en silencio)', () => {
    expect(bloqueMensajesError().length).toBeGreaterThan(0)
  })

  it('las dos entradas sin uso real (invalid_credentials y email_not_confirmed) están, y cada una tiene su comentario de "Sin uso real" al lado', () => {
    const bloque = bloqueMensajesError()
    expect(bloque).toMatch(/invalid_credentials:/)
    expect(bloque).toMatch(/email_not_confirmed:/)
    // El comentario "Sin uso real" aparece dos veces en el bloque (una por
    // cada entrada muerta): si alguna de las dos pierde su comentario, esta
    // aserción se pone en rojo y hay que volver a anotar por qué sigue ahí.
    const ocurrenciasSinUso = bloque.match(/Sin uso real/g) ?? []
    expect(ocurrenciasSinUso.length).toBeGreaterThanOrEqual(2)
  })

  it('lo que de verdad importa: el CUERPO de entrar() no escribe a mano ninguna de las frases de core (usa mensajeErrorIngreso, no MENSAJES_ERROR)', () => {
    const inicio = SRC_CUENTA_APP.indexOf('async function entrar()')
    const fin = SRC_CUENTA_APP.indexOf('async function crearCuenta()')
    expect(inicio, 'no se encontró entrar()').toBeGreaterThan(-1)
    expect(fin, 'no se encontró crearCuenta() después de entrar()').toBeGreaterThan(inicio)
    const cuerpoEntrar = SRC_CUENTA_APP.slice(inicio, fin)
    // Sin comentarios: el cuerpo real SÍ tiene un comentario que MENCIONA
    // "MENSAJES_ERROR" como documentación (explicando que `entrar` dejó de
    // usarlo) — eso no es "escribirlo a mano", es la anotación que pide esta
    // misma tarea. Lo que importa es el CÓDIGO: que no haya ni un uso real
    // de `MENSAJES_ERROR[...]` ni una frase de core tipeada a mano.
    const cuerpoSinComentarios = sanearComentarios(cuerpoEntrar)

    expect(cuerpoEntrar).toMatch(/mensajeErrorIngreso\(/)
    expect(cuerpoSinComentarios).not.toMatch(/MENSAJES_ERROR/)
    for (const frase of FRASES) {
      expect(cuerpoSinComentarios.includes(frase), `entrar() escribe a mano: "${frase}"`).toBe(false)
    }
  })
})
