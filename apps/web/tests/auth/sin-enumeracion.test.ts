// Tarea 48-q (qa): sin enumeración, de punta a punta. Para un email NUEVO y
// uno que YA TIENE CUENTA, el texto que ve la persona tiene que ser el mismo
// (dentro de cada camino: no hay ninguna rama que distinga "ya existe" de
// "cuenta nueva"), en los cuatro caminos: el alta de la página
// (app/auth/sign-up/page.tsx), el alta del modal (components/auth-modal.tsx),
// el alta de la app (apps/mobile/app/(tabs)/cuenta.tsx) y "recuperar
// contraseña" (app/auth/recuperar/page.tsx).
//
// Las dos formas en que Supabase informa "ya existe" (con las que se ejercita
// la capa de comportamiento, abajo): sin error con `data.user.identities: []`
// (Confirm email prendido) y con error `user_already_exists` /
// `email_exists` / `identity_already_exists` (apagado).
//
// Este archivo prueba en DOS CAPAS, marcadas en cada describe:
//
//   CAPA DE COMPORTAMIENTO: se ejercita `resultadoAlta` (y, desde R71,
//   `resultadoAltaConSesion`, que la envuelve y es la que usan las pantallas
//   de alta), las funciones reales de
//   `packages/core/src/auth/mensajes.ts`, con los dobles de arriba. NO se
//   monta ninguna página ni componente de React (el vitest de la web es
//   `environment: 'node'`, sin DOM).
//
//   CAPA DE CABLEADO: se lee el TEXTO FUENTE de los cuatro archivos de
//   producción (fs.readFileSync) y se comprueba, con regex/substrings, que
//   cada uno de los tres caminos de alta usa `resultadoAltaConSesion` (que
//   envuelve a `resultadoAlta`) para decidir el camino (nunca una rama propia que distinga "ya existe"), que ninguno de
//   los cuatro muestra `error.message` (ni `err.message`, ni
//   `error?.message`, ni nada derivado), y que "recuperar" tampoco tiene una
//   rama de ese tipo. Esto NO prueba que la interfaz se vea así en el
//   navegador — solo que el código fuente tiene la forma esperada.
//
// No se duplica lo que ya fija tests/auth/recuperar.test.ts (los textos
// MENSAJE_ENVIADO / MENSAJE_GOOGLE / MENSAJE_LIMITE y el comportamiento de
// `esErrorDeEnvio`, ya leído antes de escribir este archivo): lo que agrega
// este archivo es la comparación ENTRE los cuatro caminos y el barrido de
// literales que delatarían una enumeración.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resultadoAlta } from '@qps/core/auth/mensajes'

const ROOT_WEB = join(__dirname, '..', '..')
const ROOT_MOBILE = join(ROOT_WEB, '..', 'mobile')

const RUTA_SIGNUP = join(ROOT_WEB, 'app', 'auth', 'sign-up', 'page.tsx')
const RUTA_MODAL = join(ROOT_WEB, 'components', 'auth-modal.tsx')
const RUTA_MOBILE_CUENTA = join(ROOT_MOBILE, 'app', '(tabs)', 'cuenta.tsx')
const RUTA_RECUPERAR = join(ROOT_WEB, 'app', 'auth', 'recuperar', 'page.tsx')

const SRC_SIGNUP = readFileSync(RUTA_SIGNUP, 'utf8')
const SRC_MODAL = readFileSync(RUTA_MODAL, 'utf8')
const SRC_MOBILE_CUENTA = readFileSync(RUTA_MOBILE_CUENTA, 'utf8')
const SRC_RECUPERAR = readFileSync(RUTA_RECUPERAR, 'utf8')

// Literales que delatarían una rama que distingue "ya existe" de "cuenta
// nueva" en el camino del ALTA. "identities" aparece legítimamente en el
// DOCSTRING de `resultadoAlta` (packages/core), no en estos cuatro archivos:
// por eso buscarlo acá sigue siendo una señal válida de enumeración si
// aparece.
const LITERALES_DE_ENUMERACION = [/ya existe/i, /ya ten[eé]s una cuenta/i, /already/i, /identities/i]

// `.message` derivado de un error: cubre `error.message`, `err.message`,
// `error?.message`, `excepcion.message`, `errorCrear.message`, etc. — pero
// no, por ejemplo, un comentario que diga "el mensaje de error" (sin punto
// seguido de "message").
const PATRON_MESSAGE_CRUDO = /\w+(\?)?\.message\b/

function sinRamaDeEnumeracion(texto: string, etiqueta: string): void {
  for (const patron of LITERALES_DE_ENUMERACION) {
    expect(patron.test(texto), `${etiqueta} contiene un literal de enumeración (${patron})`).toBe(false)
  }
}

// --- Dobles de supabase.auth.signUp -----------------------------------------
const DOBLE_ALTA_NUEVA = { data: { user: { identities: [{ provider: 'email' }] } }, error: null }
// Forma 1: "Confirm email" prendido, el email ya existía — sin error, con
// `identities: []`.
const DOBLE_IDENTITIES_VACIAS = { data: { user: { identities: [] } }, error: null }
// Forma 2: "Confirm email" apagado, el email ya existía — con error.
const DOBLE_USER_ALREADY_EXISTS = { data: null, error: { code: 'user_already_exists', message: 'User already registered' } }
const DOBLE_EMAIL_EXISTS = { data: null, error: { code: 'email_exists', message: 'already registered' } }
const DOBLE_IDENTITY_ALREADY_EXISTS = { data: null, error: { code: 'identity_already_exists', message: 'already registered' } }

describe('CAPA DE COMPORTAMIENTO: resultadoAlta da el mismo resultado para "nuevo" y para las dos formas de "ya existe"', () => {
  it('las cinco respuestas (alta nueva + las dos formas de "ya existe") son EXACTAMENTE el mismo resultado', () => {
    const esperado = resultadoAlta(DOBLE_ALTA_NUEVA)
    expect(esperado).toEqual({ tipo: 'enviado' })

    // Forma 1 (sin error, identities: [])
    expect(resultadoAlta(DOBLE_IDENTITIES_VACIAS)).toEqual(esperado)
    // Forma 2 (con error, los tres códigos documentados)
    expect(resultadoAlta(DOBLE_USER_ALREADY_EXISTS)).toEqual(esperado)
    expect(resultadoAlta(DOBLE_EMAIL_EXISTS)).toEqual(esperado)
    expect(resultadoAlta(DOBLE_IDENTITY_ALREADY_EXISTS)).toEqual(esperado)
  })

  it('un error real (no de "ya existe") da un resultado DISTINTO: la indistinguibilidad es a propósito solo para "ya existe", no para cualquier error', () => {
    const resultadoRealError = resultadoAlta({ data: null, error: { code: 'weak_password', message: 'x' } })
    const resultadoEnviado = resultadoAlta(DOBLE_ALTA_NUEVA)
    expect(resultadoRealError).not.toEqual(resultadoEnviado)
  })
})

describe('CAPA DE CABLEADO: app/auth/sign-up/page.tsx (alta de la página)', () => {
  it('decide el camino con resultadoAltaConSesion, no con una rama propia', () => {
    expect(SRC_SIGNUP).toMatch(/resultadoAltaConSesion\(respuesta\)/)
    expect(SRC_SIGNUP).toMatch(/resultado\.tipo\s*===\s*['"]enviado['"]/)
  })

  it('no tiene ninguna rama que distinga "ya existe" de "cuenta nueva"', () => {
    sinRamaDeEnumeracion(SRC_SIGNUP, 'app/auth/sign-up/page.tsx')
  })

  it('nunca muestra error.message ni derivados', () => {
    expect(PATRON_MESSAGE_CRUDO.test(SRC_SIGNUP)).toBe(false)
  })
})

describe('CAPA DE CABLEADO: components/auth-modal.tsx (alta del modal)', () => {
  it('decide el camino con resultadoAltaConSesion, no con una rama propia', () => {
    expect(SRC_MODAL).toMatch(/resultadoAltaConSesion\(respuesta\)/)
    expect(SRC_MODAL).toMatch(/resultado\.tipo\s*===\s*["']error["']/)
  })

  it('no tiene ninguna rama que distinga "ya existe" de "cuenta nueva"', () => {
    sinRamaDeEnumeracion(SRC_MODAL, 'components/auth-modal.tsx')
  })

  it('nunca muestra error.message ni derivados', () => {
    expect(PATRON_MESSAGE_CRUDO.test(SRC_MODAL)).toBe(false)
  })
})

describe('CAPA DE CABLEADO: apps/mobile/app/(tabs)/cuenta.tsx (alta de la app)', () => {
  // Ojo: el archivo completo SÍ tiene, en el mapa `MENSAJES_ERROR` (dead code
  // documentado, de `entrarConGoogle`/`salir()`), el literal "Ya existe una
  // cuenta con ese email." — por eso el chequeo de "sin rama de enumeración"
  // de este archivo se aplica solo al CUERPO de `crearCuenta` (la función del
  // alta), no al archivo completo. Esto es justo lo que tiene que pasar: el
  // alta no puede enumerar, pero ese mapa no es el camino del alta.
  function cuerpoDeCrearCuenta(): string {
    const inicio = SRC_MOBILE_CUENTA.indexOf('async function crearCuenta')
    expect(inicio, 'no se encontró crearCuenta en cuenta.tsx').toBeGreaterThan(-1)
    const fin = SRC_MOBILE_CUENTA.indexOf('async function entrarConGoogle', inicio)
    expect(fin, 'no se encontró entrarConGoogle después de crearCuenta').toBeGreaterThan(inicio)
    return SRC_MOBILE_CUENTA.slice(inicio, fin)
  }

  it('decide el camino con resultadoAltaConSesion (R67, 67-d; envuelve a resultadoAlta), no con una rama propia', () => {
    const cuerpo = cuerpoDeCrearCuenta()
    expect(cuerpo).toMatch(/resultadoAltaConSesion\(respuesta\)/)
    expect(cuerpo).toMatch(/resultado\.tipo\s*===\s*["']error["']/)
  })

  it('el cuerpo de crearCuenta no tiene ninguna rama que distinga "ya existe" de "cuenta nueva"', () => {
    sinRamaDeEnumeracion(cuerpoDeCrearCuenta(), 'crearCuenta (apps/mobile/app/(tabs)/cuenta.tsx)')
  })

  it('el cuerpo de crearCuenta nunca muestra error.message ni derivados', () => {
    expect(PATRON_MESSAGE_CRUDO.test(cuerpoDeCrearCuenta())).toBe(false)
  })
})

describe('CAPA DE CABLEADO: app/auth/recuperar/page.tsx ("recuperar contraseña")', () => {
  // Este camino no llama a `resultadoAlta` (no es un signUp, es un
  // resetPasswordForEmail: otra API, con su propia función `esErrorDeEnvio`,
  // ya fijada por tests/auth/recuperar.test.ts). Lo que le toca a ESTE
  // archivo es que tampoco tenga una rama que distinga "ya existe".
  it('no tiene ninguna rama que distinga "ya existe" de "cuenta nueva"', () => {
    sinRamaDeEnumeracion(SRC_RECUPERAR, 'app/auth/recuperar/page.tsx')
  })

  it('nunca muestra error.message ni derivados (recuperar.test.ts ya lo fija; se repite acá para que las cuatro guardas vivan juntas en un solo archivo)', () => {
    expect(PATRON_MESSAGE_CRUDO.test(SRC_RECUPERAR)).toBe(false)
  })

  it('no distingue por código "usuario no encontrado" (user_not_found): la única distinción permitida es la de red/límite de envíos (esErrorDeEnvio)', () => {
    expect(SRC_RECUPERAR).not.toMatch(/user_not_found/i)
  })
})
