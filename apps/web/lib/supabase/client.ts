import { createBrowserClient } from '@supabase/ssr'
import { rutaEn, separarIdioma } from '@/lib/i18n/rutas'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

export async function signInWithGoogle() {
  const supabase = createClient()
  
  // Determine next path for redirection
  let next = '/'
  if (typeof window !== 'undefined') {
    const pathname = window.location.pathname
    const searchParams = new URLSearchParams(window.location.search)
    
    // Q6-2: también desde /en/auth/login y /en/auth/sign-up (antes volvían a la
    // misma página de ingreso). En inglés, el destino va en inglés si existe.
    const { idioma, ruta } = separarIdioma(pathname)
    if (ruta === '/auth/login' || ruta === '/auth/sign-up') {
      const pedido = searchParams.get('next') ?? '/'
      next = rutaEn(idioma, pedido)
    } else {
      next = pathname + window.location.search
    }
  }

  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`

  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      queryParams: {
        access_type: 'offline',
        prompt: 'select_account',
      },
    },
  })
}
