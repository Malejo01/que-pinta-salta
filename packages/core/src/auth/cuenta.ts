/**
 * Tipo de cuenta y textos de la contraseña (R48, tarea 48-a). Puro: sin
 * imports de Supabase, de Next ni de React — recibe objetos estructurales
 * (`unknown`) y solo los interpreta.
 */

export type TipoDeCuenta = 'email' | 'google' | 'mixta' | 'desconocida'

type Identidad = { provider?: unknown }

function proveedoresDeIdentidades(identidades: unknown): string[] | null {
  if (!Array.isArray(identidades)) return null
  const proveedores = identidades
    .map((identidad) => (identidad as Identidad)?.provider)
    .filter((provider): provider is string => typeof provider === 'string')
  return proveedores.length > 0 ? proveedores : null
}

/**
 * Cualquier proveedor que no sea `email` se informa como `'google'`, porque
 * Google es el único OAuth que tiene configurado el proyecto (ver
 * `signInWithGoogle` en `apps/web/lib/supabase/client.ts` y en la app). Si
 * algún día se suma otro (Apple, por ejemplo), hay que partir este caso:
 * `textosContrasena('google')` afirma "Entraste con Google" y pasaría a ser
 * falso para esa persona.
 */
function tipoDesdeProveedores(proveedores: string[]): TipoDeCuenta {
  const tieneEmail = proveedores.includes('email')
  const tieneOtro = proveedores.some((provider) => provider !== 'email')
  if (tieneEmail && tieneOtro) return 'mixta'
  if (tieneEmail) return 'email'
  if (tieneOtro) return 'google'
  return 'desconocida'
}

/**
 * Determina el tipo de cuenta a partir del `user` que devuelve
 * `@supabase/supabase-js` (o un objeto equivalente). En orden: `identities`,
 * de respaldo `app_metadata.providers`, de respaldo `app_metadata.provider`;
 * si nada de eso alcanza para decidir, `'desconocida'`.
 *
 * Importante: después de `updateUser({ password })` Supabase puede seguir
 * informando solo `google` en `identities` y en `provider` — no hay, en los
 * datos que trae el usuario, una señal confiable de "ya creó su
 * contraseña". Por eso los textos que dependen de `'google'`
 * (`textosContrasena`) tienen que ser verdaderos tanto si todavía no creó
 * una contraseña como si ya la creó: esta función no detecta eso, no puede.
 */
export function tipoDeCuenta(user: unknown): TipoDeCuenta {
  if (!user || typeof user !== 'object') return 'desconocida'
  const u = user as { identities?: unknown; app_metadata?: unknown }

  const porIdentidades = proveedoresDeIdentidades(u.identities)
  if (porIdentidades) return tipoDesdeProveedores(porIdentidades)

  const metadata = u.app_metadata && typeof u.app_metadata === 'object' ? (u.app_metadata as Record<string, unknown>) : null

  const providers = metadata?.providers
  if (Array.isArray(providers)) {
    const proveedores = providers.filter((provider): provider is string => typeof provider === 'string')
    if (proveedores.length > 0) return tipoDesdeProveedores(proveedores)
  }

  const provider = metadata?.provider
  if (typeof provider === 'string' && provider.length > 0) return tipoDesdeProveedores([provider])

  return 'desconocida'
}

export type ModoContrasena = TipoDeCuenta | 'restablecer'

/**
 * Textos de la pantalla de contraseña según de dónde viene la cuenta (o si
 * es un restablecimiento por email, sin sesión todavía).
 */
export function textosContrasena(modo: ModoContrasena): { titulo: string; descripcion: string; boton: string } {
  switch (modo) {
    case 'google':
      return {
        titulo: 'Contraseña',
        descripcion:
          'Entraste con Google. Podés crear una contraseña para entrar también con tu email. Si ya creaste una, esto la reemplaza.',
        boton: 'Guardar contraseña',
      }
    case 'email':
    case 'mixta':
      return {
        titulo: 'Cambiar contraseña',
        descripcion: 'Elegí una contraseña nueva.',
        boton: 'Guardar contraseña',
      }
    case 'desconocida':
      // Ni "Entraste con Google" (puede ser falso) ni "ya tenías una
      // contraseña" (también puede ser falso): este texto es verdadero en
      // los dos casos.
      return {
        titulo: 'Contraseña',
        descripcion:
          'Podés elegir una contraseña nueva para entrar con tu email. Si ya tenías una, esto la reemplaza.',
        boton: 'Guardar contraseña',
      }
    case 'restablecer':
      return {
        titulo: 'Elegí tu contraseña nueva',
        descripcion: 'Escribila dos veces para confirmar.',
        boton: 'Guardar contraseña',
      }
  }
}

// `minimum_password_length` de supabase/config.toml, que es solo la base
// local; el valor de producción no está en el repo y lo confirma Mauro.
export const LARGO_MINIMO_CONTRASENA = 6

/**
 * Valida una contraseña nueva contra su confirmación, con los mismos
 * textos que ya usa `change-password-form.tsx` en la web. El largo se
 * chequea antes que la coincidencia. Nunca devuelve ni registra la
 * contraseña: solo dice si está bien o cuál es el error.
 *
 * El número del mensaje sale interpolado de `LARGO_MINIMO_CONTRASENA`, no
 * escrito a mano: si Mauro confirma otro mínimo en producción y se cambia la
 * constante, el texto acompaña en vez de quedar mintiendo en silencio.
 * (`apps/web/app/auth/sign-up/page.tsx` usaba estos mismos dos textos sin el
 * punto final; desde la R48 los dos lados pasan por acá.)
 */
export function validarContrasenaNueva(a: string, b: string): { ok: true } | { ok: false; mensaje: string } {
  if (a.length < LARGO_MINIMO_CONTRASENA) {
    return { ok: false, mensaje: `La contraseña debe tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres.` }
  }
  if (a !== b) {
    return { ok: false, mensaje: 'Las contraseñas no coinciden.' }
  }
  return { ok: true }
}

const LARGO_MAXIMO_NEXT = 512

// Códigos de control ASCII: 0x00-0x1f y 0x7f (DEL). Se chequea por código
// numérico, sin regex con rango de control, para no depender de escapes
// de caracteres de control en el código fuente.
function tieneCaracterDeControl(valor: string): boolean {
  for (let i = 0; i < valor.length; i++) {
    const codigo = valor.charCodeAt(i)
    if (codigo <= 0x1f || codigo === 0x7f) return true
  }
  return false
}

/**
 * Versión más estricta del saneo de `next` que hace
 * `apps/web/app/auth/callback/route.ts` (que esta ronda no toca). Las tres
 * primeras reglas son las mismas que las de ese archivo (empieza con `/`,
 * no empieza con `//`, no empieza con `/\`); las otras tres son más
 * estrictas a propósito: nada de `\` en cualquier posición, nada de
 * caracteres de control y un largo máximo. No son equivalentes: el
 * callback hoy acepta un `\` que no esté al principio, los caracteres de
 * control y cualquier largo. Un test de la tarea 48-q compara las dos.
 */
export function rutaSiguienteSegura(next: unknown, porDefecto = '/'): string {
  if (typeof next !== 'string') return porDefecto
  if (!next.startsWith('/')) return porDefecto
  if (next.startsWith('//')) return porDefecto
  if (next.startsWith('/\\')) return porDefecto
  if (next.includes('\\')) return porDefecto
  if (tieneCaracterDeControl(next)) return porDefecto
  if (next.length > LARGO_MAXIMO_NEXT) return porDefecto
  return next
}
