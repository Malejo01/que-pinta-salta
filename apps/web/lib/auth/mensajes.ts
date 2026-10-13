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
