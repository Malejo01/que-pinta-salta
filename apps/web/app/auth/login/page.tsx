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
import { ariaDelCampo, CLASES_TEXTO_ERROR } from '@/lib/accesibilidad/formularios'
import { mensajeErrorIngreso } from '@/lib/auth/mensajes'
import { rutaSiguienteSegura } from '@qps/core/auth/cuenta'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { ArrowLeft } from 'lucide-react'

const GoogleIcon = () => (
  <svg className="size-4 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
  </svg>
)

// `useSearchParams` en un client component necesita un `<Suspense>` alrededor
// (si no, `next build` falla al intentar generar la ruta de forma estática).
// Por eso el contenido vive en `LoginForm` y el default export de abajo solo
// la envuelve. No hay otra página en el repo que use `useSearchParams` para
// copiar el patrón (`components/home-content.tsx` lo usa pero no está
// envuelta en ningún `Suspense`); este es el patrón recomendado por Next.js.
function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  // B4: si el error es de los campos (email o contraseña) o de otra cosa
  // (Google): solo el primero marca los campos con aria-invalid.
  const [errorEnCampos, setErrorEnCampos] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = rutaSiguienteSegura(searchParams.get('next'))

  const handleGoogleLogin = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const { error } = await signInWithGoogle()
      if (error) throw error
    } catch {
      setErrorEnCampos(false)
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
      setErrorEnCampos(true)
      setError(mensajeErrorIngreso(error))
      setIsLoading(false)
      return
    }
    router.push(next)
    router.refresh()
  }

  return (
    <div className="relative flex min-h-svh w-full flex-col items-center justify-center p-6 md:p-10 bg-background overflow-hidden">
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
              priority
            />
          </div>
          <div className="text-center leading-none">
            {/* B4: en oscuro, #E8555A (el #C12026 de marca da 3,3:1). */}
            <p
              className="text-2xl leading-snug text-[#C12026] dark:text-[#E8555A]"
              style={{ fontFamily: 'var(--font-yellowtail)' }}
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
            <CardTitle className="text-2xl">Iniciar sesión</CardTitle>
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
                    placeholder="tu@email.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    {...ariaDelCampo('error-ingreso', error !== null, errorEnCampos)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <PasswordInput
                    id="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    {...ariaDelCampo('error-ingreso', error !== null, errorEnCampos)}
                  />
                  <Link
                    href="/auth/recuperar"
                    className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                  >
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>
                {/* B4: el error se anuncia al aparecer (role="alert") y los
                    campos lo referencian con aria-describedby (ver
                    lib/accesibilidad/formularios.ts). */}
                {error && (
                  <p id="error-ingreso" role="alert" className={`rounded-md bg-destructive/10 p-3 text-sm ${CLASES_TEXTO_ERROR}`}>
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
              {/* B4: los links rojos sobre la tarjeta, en oscuro con #E8555A
                  (el `--primary` da 4,3:1 sobre `--card`). */}
              <Link href="/terminos" className="text-primary dark:text-[#E8555A] underline underline-offset-4">
                Términos y condiciones
              </Link>{' '}
              y la{' '}
              <Link href="/privacidad" className="text-primary dark:text-[#E8555A] underline underline-offset-4">
                Política de Privacidad
              </Link>
              .
            </p>

            <div className="mt-4 text-center text-sm">
              ¿No tenés cuenta?{' '}
              <Link
                href="/auth/sign-up"
                className="text-primary dark:text-[#E8555A] underline underline-offset-4"
              >
                Registrate
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// El fallback repite el armazón visual (mismo fondo, mismo ancho) para que
// no haya un salto de layout mientras se resuelve `useSearchParams` (en la
// práctica, instantáneo en una navegación de cliente).
function LoginFallback() {
  return (
    <div className="relative flex min-h-svh w-full flex-col items-center justify-center p-6 md:p-10 bg-background overflow-hidden">
      <div className="relative w-full max-w-sm" />
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  )
}
