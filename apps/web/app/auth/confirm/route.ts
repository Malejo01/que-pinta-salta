import { createClient } from '@/lib/supabase/server'
import { rutaSiguienteSegura } from '@qps/core/auth/cuenta'
import { NextRequest, NextResponse } from 'next/server'

// R48 (tarea 48-b): esta ruta todavía NO la llama nadie. Empieza a usarse
// cuando Mauro cambie la plantilla de mail "Reset password" en el dashboard
// de Supabase para que apunte a
// `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/restablecer`.
// Hasta entonces sigue andando `/auth/callback` (PKCE).
//
// Por qué existe: el link PKCE de `/auth/callback` solo funciona en el
// mismo navegador que pidió el correo (el verificador queda guardado ahí).
// Desde la app, el correo lo abre la app de mail del teléfono, que a veces
// abre el link en otro navegador — ahí el PKCE falla. Un link de un solo
// uso por `token_hash` (`verifyOtp`) no depende de qué navegador lo abra.

const TIPOS_VALIDOS = ['recovery', 'signup', 'email', 'email_change', 'invite'] as const
type TipoValido = (typeof TIPOS_VALIDOS)[number]

// Largo máximo del `token_hash`: un valor razonable para el hash que manda
// Supabase, sin dejar pasar cualquier largo en la URL.
const LARGO_MAXIMO_TOKEN_HASH = 512

function esTipoValido(valor: string | null): valor is TipoValido {
  return valor !== null && (TIPOS_VALIDOS as readonly string[]).includes(valor)
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const tipo = searchParams.get('type')
  const tokenHash = searchParams.get('token_hash')
  const next = searchParams.get('next')

  // `type` fuera de la lista cerrada, o `token_hash` vacío o demasiado
  // largo: a error sin llamar a `verifyOtp`.
  if (!esTipoValido(tipo) || !tokenHash || tokenHash.length === 0 || tokenHash.length > LARGO_MAXIMO_TOKEN_HASH) {
    return NextResponse.redirect(`${origin}/auth/error`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash })

  if (error) {
    // QPS-155: nunca el `token_hash` ni el `type` junto con el error crudo
    // (y nunca el propio `token_hash`, ni siquiera solo): un texto fijo.
    console.error('auth/confirm: verifyOtp falló')
    return NextResponse.redirect(`${origin}/auth/error`)
  }

  const destino = rutaSiguienteSegura(next, tipo === 'recovery' ? '/auth/restablecer' : '/')
  return NextResponse.redirect(`${origin}${destino}`)
}
