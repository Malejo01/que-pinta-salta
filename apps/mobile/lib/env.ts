// Configuración pública de la app (R24). Todo lo que la app necesita en
// tiempo de ejecución entra por variables EXPO_PUBLIC_*: ninguna clave va
// escrita en el código ni en app.config.ts.
//
// Puro: no importa nada de React Native, Supabase, Google ni Sentry, para
// que 24-c lo prueba con Vitest en entorno node (mutando process.env antes de
// llamar a leerEnv()).
//
// Nunca una variable sin el prefijo EXPO_PUBLIC_, y nunca
// SUPABASE_SERVICE_ROLE_KEY (esa clave no debe llegar a la app).

export type EnvSupabase = {
  url: string
  anonKey: string
}

export type Env = {
  supabase: EnvSupabase | null
  googleWebClientId: string | null
  sentryDsn: string | null
}

/** Vacío, `undefined` o solo espacios cuenta como "falta". */
function limpiar(valor: string | undefined): string | null {
  if (typeof valor !== 'string') return null
  const recortado = valor.trim()
  return recortado.length > 0 ? recortado : null
}

/**
 * Lee la config pública del entorno. Devuelve qué está disponible: si falta
 * la URL o la anon key de Supabase, `supabase` es `null` y la app sigue
 * andando sin login. Google y Sentry son independientes entre sí y de
 * Supabase.
 */
export function leerEnv(): Env {
  const url = limpiar(process.env.EXPO_PUBLIC_SUPABASE_URL)
  const anonKey = limpiar(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY)

  return {
    supabase: url && anonKey ? { url, anonKey } : null,
    googleWebClientId: limpiar(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
    sentryDsn: limpiar(process.env.EXPO_PUBLIC_SENTRY_DSN),
  }
}
