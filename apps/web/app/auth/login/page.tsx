'use client'

import { createClient, signInWithGoogle } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { mensajeErrorIngreso } from '@/lib/auth/mensajes'
import { rutaSiguienteSegura } from '@qps/core/auth/cuenta'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'

const GoogleIcon = () => (
  <svg className="size-4 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
  </svg>
)

// B3: el `next` se lee recién al enviar el formulario, de la URL del
// navegador, y no con `useSearchParams`. Con `useSearchParams` todo el
// formulario tenía que ir dentro de un `<Suspense>` y el prerender estático
// mandaba el fallback vacío (sin <main>, sin <h1>, sin formulario): el LCP
// esperaba al JS (7,6 s en la auditoría B1). Así la ruta sigue estática y el
// HTML ya trae la pantalla completa. El único que necesita `next` es el
// `router.push` del ingreso con contraseña (el de Google lo lee por su cuenta
// en `signInWithGoogle`, también de `window.location`).
export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleGoogleLogin = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const { error } = await signInWithGoogle()
      if (error) throw error
    } catch {
      setError('Ocurrió un error al iniciar sesión con Google. Probá de nuevo.')
      setIsLoading(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) {
      setError(mensajeErrorIngreso(error))
      setIsLoading(false)
      return
    }
    const next = rutaSiguienteSegura(new URLSearchParams(window.location.search).get('next'))
    router.push(next)
    router.refresh()
  }

  return (
    // B3/B4: `<main>` en vez de `<div>` (mismas clases, mismo aspecto) para
    // que la pantalla de ingreso tenga su región principal.
    <main id="contenido" className="relative flex min-h-svh w-full flex-col items-center justify-center p-6 md:p-10 bg-background overflow-hidden">
      {/* Patrón de fondo de marca */}
      <div
        className="pointer-events-none absolute inset-0 bg-repeat opacity-[0.06] dark:opacity-[0.035] dark:invert dark:hue-rotate-180"
        style={{ backgroundImage: "url('/brand/patron-claro.png')", backgroundSize: '280px' }}
      />

      <div className="relative w-full max-w-sm">
        <Link
          href="/"
          className="mb-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Volver a inicio
        </Link>

        {/* Logo y nombre de marca */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="rounded-full dark:ring-2 dark:ring-[#C12026]/70 dark:ring-offset-2 dark:ring-offset-background drop-shadow-md">
            <Image
              src="/brand/logo-circular.png"
              alt="Que pinta Salta"
              width={72}
              height={72}
              className="rounded-full block"
              preload
            />
          </div>
          <div className="text-center leading-none">
            <p
              className="text-2xl leading-snug"
              style={{ fontFamily: 'var(--font-yellowtail)', color: '#C12026' }}
            >
              Que pinta?
            </p>
            <p
              className="text-lg tracking-normal text-center text-[#232F42] dark:text-zinc-100 uppercase"
              style={{ fontFamily: 'var(--font-poppins)', fontWeight: 800 }}
            >
              Salta
            </p>
          </div>
          <p className="text-sm text-muted-foreground">Eventos en Salta Capital</p>
        </div>

        <Card>
          <CardHeader>
            {/* B3/B4: `CardTitle` pinta un <div>; el <h1> adentro hereda
                tamaño y peso (el reset de Tailwind no les pone estilo
                propio a los encabezados), así que se ve igual. */}
            <CardTitle className="text-2xl">
              <h1>Iniciar sesión</h1>
            </CardTitle>
            <CardDescription>
              Ingresá tu email y contraseña para entrar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin}>
              <div className="flex flex-col gap-6">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? 'login-error' : undefined}
                    placeholder="tu@email.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <PasswordInput
                    id="password"
                    autoComplete="current-password"
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? 'login-error' : undefined}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <Link
                    href="/auth/recuperar"
                    className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                  >
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>
                {error && (
                  <p id="login-error" role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Iniciando sesión...' : 'Iniciar sesión'}
                </Button>
              </div>
            </form>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">O continuar con</span>
              </div>
            </div>

            <Button
              variant="outline"
              type="button"
              className="w-full flex items-center justify-center gap-2 bg-background hover:bg-muted/30 border-input hover:border-muted-foreground/30 transition-all duration-200 shadow-xs hover:shadow-sm hover:-translate-y-[1px] active:translate-y-0"
              onClick={handleGoogleLogin}
              disabled={isLoading}
            >
              <GoogleIcon />
              <span>Google</span>
            </Button>

            <p className="mt-4 text-xs text-muted-foreground text-center">
              Al continuar con Google aceptás los{' '}
              <Link href="/terminos" className="text-primary dark:text-red-400 underline underline-offset-4">
                Términos y condiciones
              </Link>{' '}
              y la{' '}
              <Link href="/privacidad" className="text-primary dark:text-red-400 underline underline-offset-4">
                Política de Privacidad
              </Link>
              .
            </p>

            <div className="mt-4 text-center text-sm">
              ¿No tenés cuenta?{' '}
              <Link
                href="/auth/sign-up"
                className="text-primary dark:text-red-400 underline underline-offset-4"
              >
                Registrate
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
