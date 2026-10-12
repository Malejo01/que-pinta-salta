import { createBrowserClient } from '@supabase/ssr'

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
    
    if (pathname === '/auth/login' || pathname === '/auth/sign-up') {
      next = searchParams.get('next') ?? '/'
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
