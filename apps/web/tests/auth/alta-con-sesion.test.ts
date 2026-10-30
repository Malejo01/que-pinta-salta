/**
 * R71 (71-q): el alta de la web con y sin sesión, y que el texto
 * anti-enumeración no cambie.
 *
 * El vitest de la web es `environment: 'node'`, sin DOM: no se monta ningún
 * componente. Dos capas, dichas en cada describe:
 *   - COMPORTAMIENTO: `resultadoAltaConSesion` real (packages/core) con dobles
 *     de `signUp`. Lo que ya fija `tests/core/auth-cuenta.test.ts` (los casos
 *     sueltos de `resultadoAltaConSesion`) no se repite; acá se agrega la
 *     IGUALDAD entre "ya existe" y "alta nueva sin sesión".
 *   - CABLEADO: lectura del fuente de `app/auth/sign-up/page.tsx` y de
 *     `components/auth-modal.tsx`. No prueba que la UI se vea así: solo que el
 *     código tiene la forma esperada.
 * Los textos `MENSAJE_ALTA_GENERICO` / `MENSAJE_ALTA_ENVIADA` los fija
 * `tests/auth/mensajes.test.ts`; acá se fija el literal nuevo
 * `MENSAJE_ALTA_CON_SESION`.
 * Fixtures inventados.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { es } from '@/lib/i18n/diccionarios/es'
import {
  MENSAJE_ALTA_CON_SESION,
  MENSAJE_ALTA_ENVIADA,
  resultadoAltaConSesion,
} from '@qps/core/auth/mensajes'

const ROOT = join(__dirname, '..', '..')
const SRC_PAGINA = readFileSync(join(ROOT, 'app', 'auth', 'sign-up', 'page.tsx'), 'utf8')
const SRC_MODAL = readFileSync(join(ROOT, 'components', 'auth-modal.tsx'), 'utf8')

// --- Dobles de supabase.auth.signUp ------------------------------------------
const SESION = { access_token: 'token-de-prueba' }
const ALTA_NUEVA_CON_SESION = { data: { user: { id: 'u-1', identities: [{ provider: 'email' }] }, session: SESION }, error: null }
const ALTA_NUEVA_SIN_SESION = { data: { user: { id: 'u-2', identities: [{ provider: 'email' }] }, session: null }, error: null }
const YA_EXISTE_IDENTITIES_VACIAS = { data: { user: { id: 'u-3', identities: [] }, session: null }, error: null }
const codigoYaExiste = (code: string) => ({ data: { user: null, session: null }, error: { code, message: 'ya registrado (fixture)' } })

describe('COMPORTAMIENTO: resultadoAltaConSesion, "sesion" solo para el alta nueva con sesión', () => {
  it.each(['user_already_exists', 'email_exists', 'identity_already_exists'])(
    'todas las formas de "ya existe" (%s) dan EXACTAMENTE lo mismo que el alta nueva sin sesión',
    (code) => {
      expect(resultadoAltaConSesion(codigoYaExiste(code))).toEqual(resultadoAltaConSesion(ALTA_NUEVA_SIN_SESION))
    },
  )

  it('"ya existe" como identities vacías (sin error, sin sesión) también es igual al alta nueva sin sesión', () => {
    expect(resultadoAltaConSesion(YA_EXISTE_IDENTITIES_VACIAS)).toEqual(resultadoAltaConSesion(ALTA_NUEVA_SIN_SESION))
  })

  it('"ya existe" con una sesión presente en data y con error: nunca "sesion", sigue igual a "enviado"', () => {
    for (const code of ['user_already_exists', 'email_exists', 'identity_already_exists']) {
      const respuesta = { data: { user: { id: 'u-4' }, session: SESION }, error: { code } }
      expect(resultadoAltaConSesion(respuesta)).toEqual({ tipo: 'enviado' })
    }
  })

  it('"sesion" no trae mensaje ni otros campos que la web pudiera mostrar distinto', () => {
    expect(Object.keys(resultadoAltaConSesion(ALTA_NUEVA_CON_SESION))).toEqual(['tipo'])
  })
})

describe('TEXTOS: literales fijados', () => {
  it('MENSAJE_ALTA_CON_SESION', () => {
    expect(MENSAJE_ALTA_CON_SESION).toBe('Listo, ya tenés tu cuenta.')
  })

  it('el texto con sesión no menciona correo ni "ya existe": no promete un mail que no sale', () => {
    expect(MENSAJE_ALTA_CON_SESION).not.toMatch(/correo|email|mail|ya existe|ya ten[eé]s una cuenta/i)
  })
})

/** Tramo del fuente entre `desde` (primer match de la regex) y `hasta` (primer match posterior). */
function tramo(src: string, desde: RegExp, hasta: RegExp): string {
  const d = src.search(desde)
  expect(d, `no se encontró ${desde}`).toBeGreaterThan(-1)
  const resto = src.slice(d + 1)
  const h = resto.search(hasta)
  expect(h, `no se encontró ${hasta} después de ${desde}`).toBeGreaterThan(-1)
  return src.slice(d, d + 1 + h)
}

describe('CABLEADO: app/auth/sign-up/page.tsx', () => {
  const bloqueSesion = tramo(SRC_PAGINA, /resultado\.tipo\s*===\s*['"]sesion['"]/, /resultado\.tipo\s*===\s*['"]enviado['"]/)
  const bloqueEnviado = tramo(SRC_PAGINA, /resultado\.tipo\s*===\s*['"]enviado['"]/, /setError\(resultado\.mensaje\)/)

  it('decide con resultadoAltaConSesion y distingue tipo === "sesion"', () => {
    expect(SRC_PAGINA).toMatch(/resultadoAltaConSesion\(respuesta\)/)
    expect(SRC_PAGINA).toMatch(/resultado\.tipo\s*===\s*['"]sesion['"]/)
  })

  it('importa MENSAJE_ALTA_CON_SESION de @/lib/auth/mensajes y lo usa en el toast', () => {
    expect(SRC_PAGINA).toMatch(/import\s*\{[^}]*MENSAJE_ALTA_CON_SESION[^}]*\}\s*from\s*['"]@\/lib\/auth\/mensajes['"]/)
    expect(bloqueSesion).toMatch(/toast\(/)
    expect(bloqueSesion).toMatch(/description:\s*MENSAJE_ALTA_CON_SESION/)
  })

  it('con "sesion": va a "/" y refresca; NO va a /auth/sign-up-success ni usa MENSAJE_ALTA_ENVIADA', () => {
    expect(bloqueSesion).toMatch(/router\.push\(['"]\/['"]\)/)
    expect(bloqueSesion).toMatch(/router\.refresh\(\)/)
    expect(bloqueSesion).not.toMatch(/sign-up-success/)
    expect(bloqueSesion).not.toMatch(/MENSAJE_ALTA_ENVIADA/)
  })

  it('con "enviado": sigue yendo a /auth/sign-up-success, sin toast de sesión', () => {
    expect(bloqueEnviado).toMatch(/router\.push\(['"]\/auth\/sign-up-success['"]\)/)
    expect(bloqueEnviado).not.toMatch(/MENSAJE_ALTA_CON_SESION/)
  })

  it('no arma un texto propio a partir de error.message (ni derivados)', () => {
    expect(SRC_PAGINA).not.toMatch(/\w+\??\.message\b/)
  })
})

describe('CABLEADO: components/auth-modal.tsx (alta)', () => {
  const bloqueSesion = tramo(SRC_MODAL, /resultado\.tipo\s*===\s*["']sesion["']/, /\}\s*else\s*\{/)
  const bloqueEnviado = tramo(SRC_MODAL, /\}\s*else\s*\{\s*\n\s*toast\(/, /\n\s*\}\s*\n\s*\}\s*\n\s*close\(\)/)

  it('decide con resultadoAltaConSesion y distingue tipo === "sesion"', () => {
    expect(SRC_MODAL).toMatch(/resultadoAltaConSesion\(respuesta\)/)
    expect(SRC_MODAL).toMatch(/resultado\.tipo\s*===\s*["']sesion["']/)
  })

  it('importa MENSAJE_ALTA_CON_SESION y lo usa en el toast de "sesion"', () => {
    expect(SRC_MODAL).toMatch(/import\s*\{[^}]*MENSAJE_ALTA_CON_SESION[^}]*\}\s*from\s*["']@\/lib\/auth\/mensajes["']/)
    expect(bloqueSesion).toMatch(/toast\(/)
    // Q3: pasa por `t.mensaje` (el diccionario), que en castellano lo deja igual.
    expect(bloqueSesion).toMatch(/description:\s*t\.mensaje\(MENSAJE_ALTA_CON_SESION\)/)
    expect(es.auth.mensaje(MENSAJE_ALTA_CON_SESION)).toBe(MENSAJE_ALTA_CON_SESION)
  })

  it('el bloque "sesion" no usa MENSAJE_ALTA_ENVIADA ni el título "Revisá tu email" ni navega a sign-up-success', () => {
    expect(bloqueSesion).not.toMatch(/MENSAJE_ALTA_ENVIADA/)
    expect(bloqueSesion).not.toMatch(/Revisá tu email|t\.revisaTuEmail/)
    expect(bloqueSesion).not.toMatch(/sign-up-success/)
  })

  it('con "enviado" el toast sigue siendo "Revisá tu email" con MENSAJE_ALTA_ENVIADA', () => {
    // Q3: título y texto salen del diccionario; en castellano dicen lo mismo.
    expect(bloqueEnviado).toMatch(/title:\s*t\.revisaTuEmail\b/)
    expect(es.auth.revisaTuEmail).toBe('Revisá tu email')
    expect(bloqueEnviado).toMatch(/description:\s*t\.mensaje\(MENSAJE_ALTA_ENVIADA\)/)
    expect(es.auth.mensaje(MENSAJE_ALTA_ENVIADA)).toBe(MENSAJE_ALTA_ENVIADA)
    expect(bloqueEnviado).not.toMatch(/MENSAJE_ALTA_CON_SESION/)
  })

  it('tras "sesion" y "enviado" el modal cierra y hace router.refresh() (los dos caminos comparten el cierre)', () => {
    const idx = SRC_MODAL.search(/resultado\.tipo\s*===\s*['"]error['"]/)
    expect(idx).toBeGreaterThan(-1)
    const cola = SRC_MODAL.slice(idx)
    expect(cola).toMatch(/close\(\)\s*\n\s*router\.refresh\(\)/)
  })

  it('"error" se muestra en el formulario con resultado.mensaje y corta antes de cerrar', () => {
    expect(SRC_MODAL).toMatch(/resultado\.tipo\s*===\s*["']error["']\)\s*\{\s*setError\(resultado\.mensaje\)\s*return/)
  })

  it('ningún camino arma un texto propio a partir de error.message', () => {
    expect(SRC_MODAL).not.toMatch(/\w+\??\.message\b/)
  })
})
