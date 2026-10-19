/**
 * 48-b: el alta (`/auth/sign-up` y la parte de alta de `auth-modal.tsx`)
 * usa `resultadoAlta` para decidir el camino, y nunca distingue "ya existe"
 * de "cuenta nueva" (alta neutra, QPS-124). `/auth/sign-up-success` queda en
 * voseo y con tildes.
 *
 * El vitest de la web es `environment: 'node'`, sin Testing Library: no se
 * monta ningún componente de React. Dos cosas se prueban por separado, cada
 * una dicha en el nombre del describe:
 *   1. `resultadoAlta` en sí, con los dos dobles de `signUp` (identities
 *      vacías / `user_already_exists`): los dos dan 'enviado'. Esto ya lo
 *      cubre `packages/core` y `tests/core`, pero se repite acá con los
 *      dos dobles concretos que menciona la tarea, para que quede
 *      documentado en el mismo lugar que el resto de 48-b.
 *   2. Lectura estática del código fuente (`fs`) de `sign-up/page.tsx` y de
 *      `auth-modal.tsx`: que el resultado de `resultadoAlta` sea lo que
 *      decide el camino (no `if (error) throw error` suelto), y que el
 *      texto de `sign-up-success/page.tsx` esté en voseo y con tildes.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resultadoAlta } from '@qps/core/auth/mensajes'

const ROOT = join(__dirname, '..', '..')
const read = (relPath: string) => readFileSync(join(ROOT, relPath), 'utf8')

describe('resultadoAlta: con los dos dobles de signUp que no distinguen "ya existe", los dos dan "enviado"', () => {
  it('identities vacías (Confirm email prendido, el email ya existía): enviado', () => {
    const respuesta = { data: { user: { identities: [] } }, error: null }
    expect(resultadoAlta(respuesta)).toEqual({ tipo: 'enviado' })
  })

  it('error user_already_exists: enviado también (nunca revela que ya existía)', () => {
    const respuesta = { data: null, error: { code: 'user_already_exists', message: 'User already registered' } }
    expect(resultadoAlta(respuesta)).toEqual({ tipo: 'enviado' })
  })

  it('alta nueva, sin error: enviado', () => {
    const respuesta = { data: { user: { identities: [{ provider: 'email' }] } }, error: null }
    expect(resultadoAlta(respuesta)).toEqual({ tipo: 'enviado' })
  })

  it('un error real (no de "ya existe"): error, con mensaje, nunca el message crudo', () => {
    const respuesta = { data: null, error: { code: 'weak_password', message: 'Password should be at least 6 characters' } }
    const resultado = resultadoAlta(respuesta)
    expect(resultado.tipo).toBe('error')
    if (resultado.tipo === 'error') {
      expect(resultado.mensaje).not.toContain('Password should be at least 6 characters')
    }
  })
})

describe('app/auth/sign-up/page.tsx: usa resultadoAlta para decidir el camino', () => {
  const src = read('app/auth/sign-up/page.tsx')

  it('importa resultadoAlta de @/lib/auth/mensajes', () => {
    expect(src).toMatch(/import\s*\{[^}]*resultadoAlta[^}]*\}\s*from\s*['"]@\/lib\/auth\/mensajes['"]/)
  })

  it('llama a resultadoAlta con la respuesta de signUp y decide con resultado.tipo', () => {
    expect(src).toMatch(/resultadoAlta\(respuesta\)/)
    expect(src).toMatch(/resultado\.tipo\s*===\s*['"]enviado['"]/)
  })

  it('con "enviado", redirige a /auth/sign-up-success', () => {
    const bloque = src.slice(src.indexOf('resultadoAlta('))
    expect(bloque).toMatch(/router\.push\(['"]\/auth\/sign-up-success['"]\)/)
  })

  it('usa validarContrasenaNueva para la validación previa, no el chequeo manual de antes', () => {
    expect(src).toMatch(/import\s*\{[^}]*validarContrasenaNueva[^}]*\}\s*from\s*['"]@qps\/core\/auth\/cuenta['"]/)
    expect(src).toMatch(/validarContrasenaNueva\(password,\s*repeatPassword\)/)
  })
})

describe('components/auth-modal.tsx: el alta también usa resultadoAlta', () => {
  const src = read('components/auth-modal.tsx')

  it('importa resultadoAlta y MENSAJE_ALTA_ENVIADA de @/lib/auth/mensajes', () => {
    expect(src).toMatch(/import\s*\{[^}]*resultadoAlta[^}]*\}\s*from\s*['"]@\/lib\/auth\/mensajes['"]/)
    expect(src).toMatch(/MENSAJE_ALTA_ENVIADA/)
  })

  it('con "enviado", avisa con MENSAJE_ALTA_ENVIADA (toast), no un texto fijo distinto', () => {
    expect(src).toMatch(/description:\s*MENSAJE_ALTA_ENVIADA/)
  })

  it('el login del modal pasa por mensajeErrorIngreso, no error.message', () => {
    expect(src).toMatch(/import\s*\{[^}]*mensajeErrorIngreso[^}]*\}\s*from\s*['"]@\/lib\/auth\/mensajes['"]/)
    expect(src).toMatch(/setError\(mensajeErrorIngreso\(error\)\)/)
  })

  it('ningún camino muestra error.message', () => {
    expect(src).not.toMatch(/error\?\.message|error\.message/)
  })
})

describe('app/auth/sign-up-success/page.tsx: voseo y con tildes', () => {
  const src = read('app/auth/sign-up-success/page.tsx')

  it('el título es "Revisá tu email para confirmar"', () => {
    expect(src).toContain('Revisá tu email para confirmar')
  })

  it('el cuerpo tiene el texto condicional que no promete un correo que puede no haber salido', () => {
    expect(src).toContain('Te mandamos un correo de confirmación.')
    expect(src).toContain('Si ese email ya tenía cuenta, iniciá sesión o recuperá tu contraseña.')
  })

  it('no quedan las formas de tuteo/sin tilde de la versión anterior', () => {
    expect(src).not.toContain('Revisa tu email para confirmar')
    expect(src).not.toContain('confirmacion')
    expect(src).not.toContain('haz click')
  })
})
