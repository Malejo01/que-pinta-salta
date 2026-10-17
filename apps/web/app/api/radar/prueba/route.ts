import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { sendTestRadarEmail } from '@/lib/actions/radar'

export const dynamic = 'force-dynamic'

/**
 * `POST /api/radar/prueba` (QPS, R36 G3): la versión para la app del botón
 * "Enviar Correo de Prueba" de `apps/web/components/radar-form.tsx`. La app
 * no tiene la sesión por cookies que usa la server action
 * `triggerTestRadarEmail`, así que manda el `access_token` de su sesión de
 * Supabase en `Authorization: Bearer <token>` y este endpoint lo valida.
 *
 * El cliente que arma este endpoint usa siempre la anon key, nunca la
 * clave de administrador: el Bearer del usuario va en los headers globales,
 * así que tanto `auth.getUser()` como la lectura de `profiles` corren con
 * las políticas RLS del usuario, no con permisos de administrador.
 *
 * Respuestas con la misma forma que la server action (`success`, `message`,
 * `count`), sin filtrar detalles internos (mensajes de Supabase, de Resend
 * ni stacks) en el cuerpo.
 */

function bearerToken(request: NextRequest): string | null {
  const header = request.headers.get('authorization') ?? ''
  if (!header.startsWith('Bearer ')) return null
  const token = header.slice('Bearer '.length).trim()
  return token.length > 0 ? token : null
}

function noAutenticado() {
  return NextResponse.json({ success: false, message: 'Tenés que iniciar sesión para realizar la prueba.' }, { status: 401 })
}

export async function POST(request: NextRequest) {
  const token = bearerToken(request)
  if (!token) return noAutenticado()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    console.error('[api/radar/prueba] Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.')
    return NextResponse.json({ success: false, message: 'Error de configuración del servidor.' }, { status: 500 })
  }

  // Cliente con la anon key, con el Bearer del usuario en los headers: así
  // las consultas (incluida la de `profiles`) corren con RLS como ese
  // usuario, no como anon ni como service role.
  const supabase = createSupabaseClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (!user || authError) return noAutenticado()

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'ADMIN') {
    return NextResponse.json({ success: false, message: 'Solo administradores.' }, { status: 403 })
  }

  // `sendTestRadarEmail` nunca lanza: el resultado (éxito o no) viaja en el
  // cuerpo con `success`, igual que la server action. 200 en los dos casos.
  const result = await sendTestRadarEmail(supabase, user)
  return NextResponse.json(result, { status: 200 })
}

/** Solo POST: los demás métodos, 405 (misma forma de respuesta que arriba). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- firma de route handler de Next, el argumento no se usa
function metodoNoPermitido(_request: NextRequest) {
  return NextResponse.json({ success: false, message: 'Método no permitido.' }, { status: 405 })
}

export const GET = metodoNoPermitido
export const PUT = metodoNoPermitido
export const PATCH = metodoNoPermitido
export const DELETE = metodoNoPermitido
