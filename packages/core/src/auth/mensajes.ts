/**
 * Mensajes del alta (QPS-124). Nunca se devuelve `error.message`: para un email
 * ya registrado confirmaría que la cuenta existe.
 */
export const MENSAJE_ALTA_GENERICO = 'No se pudo crear la cuenta. Si ya tenés una, iniciá sesión.'

export function mensajeErrorAlta(error: unknown): string {
  const e = (error && typeof error === 'object' ? error : {}) as { code?: unknown; status?: unknown }
  const code = typeof e.code === 'string' ? e.code : ''
  const status = typeof e.status === 'number' ? e.status : null

  if (code === 'weak_password') return 'La contraseña es muy débil: usá al menos 6 caracteres.'
  if (code === 'email_address_invalid') return 'Revisá el email: no parece válido.'
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || (!code && status === 429)) {
    return 'Demasiados intentos. Probá de nuevo en unos minutos.'
  }
  return MENSAJE_ALTA_GENERICO
}

/**
 * Texto que ve quien se da de alta cuando `resultadoAlta` informa `'enviado'`
 * (incluido el caso en que el email ya tenía cuenta: ver el docstring de
 * `resultadoAlta`). Es condicional a propósito ("Si ese email no tenía
 * cuenta...") porque no puede afirmar que se mandó un correo sin filtrar si
 * la cuenta ya existía.
 */
export const MENSAJE_ALTA_ENVIADA =
  'Si ese email no tenía cuenta, te mandamos un correo para confirmarla. Si ya tenías una, iniciá sesión o recuperá tu contraseña.'

type ResultadoAlta = { tipo: 'enviado' } | { tipo: 'error'; mensaje: string }

/**
 * Clasifica la respuesta de `supabase.auth.signUp` en "enviado" o "error"
 * (QPS-124). Un alta con un email que ya tiene cuenta se informa igual que
 * un alta nueva (sin error, o con un código de "ya existe"): si se
 * distinguiera, cualquiera podría usar el formulario de alta para averiguar
 * si un email está registrado.
 *
 * Costo aceptado: quien se equivoca de email y en realidad ya tenía cuenta
 * no recibe ningún correo (ni de confirmación ni de aviso). Por eso
 * `MENSAJE_ALTA_ENVIADA` es condicional ("Si ese email no tenía cuenta...")
 * y ofrece las dos salidas (iniciar sesión o recuperar la contraseña) en
 * vez de prometer un correo que puede no haber salido.
 *
 * `data` no se inspecciona: con "Confirm email" prendido, un alta con un
 * email ya existente tampoco trae `error` (Supabase devuelve
 * `data.user.identities: []`), así que alcanza con "sin error" para
 * informar "enviado" en los dos casos.
 */
export function resultadoAlta(respuesta: { data: unknown; error: unknown }): ResultadoAlta {
  const { error } = respuesta

  if (!error) return { tipo: 'enviado' }

  const e = (error && typeof error === 'object' ? error : {}) as { code?: unknown; name?: unknown }
  const code = typeof e.code === 'string' ? e.code : typeof e.name === 'string' ? e.name : ''
  if (code === 'user_already_exists' || code === 'email_exists' || code === 'identity_already_exists') {
    return { tipo: 'enviado' }
  }

  return { tipo: 'error', mensaje: mensajeErrorAlta(error) }
}

export function mensajeErrorIngreso(error: unknown): string {
  const e = (error && typeof error === 'object' ? error : {}) as { code?: unknown; status?: unknown }
  const code = typeof e.code === 'string' ? e.code : ''
  const status = typeof e.status === 'number' ? e.status : null

  if (code === 'invalid_credentials') {
    return 'El email o la contraseña no son correctos. Si entraste con Google, usá el botón de Google.'
  }
  if (code === 'email_not_confirmed') return 'Todavía no confirmaste el email: revisá tu casilla.'
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || (!code && status === 429)) {
    return mensajeErrorAlta(error)
  }
  return 'No pudimos iniciar sesión. Probá de nuevo en unos minutos.'
}

export function mensajeErrorContrasena(error: unknown): string {
  const e = (error && typeof error === 'object' ? error : {}) as { code?: unknown; status?: unknown }
  const code = typeof e.code === 'string' ? e.code : ''
  const status = typeof e.status === 'number' ? e.status : null

  if (code === 'weak_password') return mensajeErrorAlta(error)
  if (code === 'same_password') return 'Esa ya es tu contraseña. Elegí otra.'
  if (code === 'reauthentication_needed' || (!code && (status === 401 || status === 403))) {
    return 'Por seguridad, cerrá sesión, volvé a entrar y probá de nuevo.'
  }
  return 'No pudimos guardar la contraseña. Probá de nuevo en unos minutos.'
}
