'use client'

// F6 (QPS-145, decisión 6 del plan de la R29): recuperar la contraseña vive
// en la web. El link del mail es PKCE: el verificador queda en el navegador
// que pidió la recuperación, así que pedirla desde la app y terminarla en la
// web no funciona — todo el flujo pasa por acá.
//
// El mensaje de éxito es SIEMPRE el mismo, exista o no la cuenta, y también
// si Supabase devuelve "usuario no encontrado": si cambiara según el caso,
// la página diría quién tiene cuenta. Solo un error de red o el límite de
// envíos (429) se muestra distinto. Nunca se muestra el texto crudo del
// error ni se loguea el email.
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { isAuthRetryableFetchError } from '@supabase/supabase-js'

export const MENSAJE_ENVIADO =
  'Si hay una cuenta con ese email, te mandamos un link para elegir una contraseña nueva. Revisá tu correo (y el spam).'
export const MENSAJE_GOOGLE = 'Si entraste con Google, no tenés contraseña: usá el botón de Google.'
export const MENSAJE_LIMITE = 'No pudimos mandar el correo. Probá de nuevo en unos minutos.'

/**
 * `true` solo para un error de red (`AuthRetryableFetchError`) o el límite
 * de envíos de Supabase (código `over_email_send_rate_limit` /
 * `over_request_rate_limit`, o status 429). Cualquier otro error —
 * incluido "usuario no encontrado" — no es de este tipo: se trata igual que
 * un envío exitoso, para no revelar si la cuenta existe.
 */
export function esErrorDeEnvio(error: unknown): boolean {
  if (isAuthRetryableFetchError(error)) return true
  const e = (error && typeof error === 'object' ? error : {}) as { code?: unknown; status?: unknown }
  const code = typeof e.code === 'string' ? e.code : ''
  const status = typeof e.status === 'number' ? e.status : null
  return code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || status === 429
}

export default function RecuperarPage() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [errorLimite, setErrorLimite] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setErrorLimite(false)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/auth/restablecer`,
      })
      if (error && esErrorDeEnvio(error)) {
        setErrorLimite(true)
      } else {
        // Éxito, o cualquier otro error (incluido "usuario no encontrado"):
        // el mismo resultado siempre.
        setEnviado(true)
      }
    } catch (error: unknown) {
      if (esErrorDeEnvio(error)) {
        setErrorLimite(true)
      } else {
        setEnviado(true)
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main id="contenido" tabIndex={-1} className="relative flex min-h-svh w-full flex-col items-center justify-center p-6 md:p-10 bg-background overflow-hidden focus:outline-none">
      {/* Patrón de fondo de marca */}
      <div
        className="pointer-events-none absolute inset-0 bg-repeat opacity-[0.06] dark:opacity-[0.035] dark:invert dark:hue-rotate-180"
        style={{ backgroundImage: "url('/brand/patron-claro.png')", backgroundSize: '280px' }}
      />

      <div className="relative w-full max-w-sm">
        <Link
          href="/auth/login"
          className="mb-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Volver a iniciar sesión
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
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">
              <h1>Recuperar contraseña</h1>
            </CardTitle>
            <CardDescription>
              Ingresá tu email y te mandamos un link para elegir una contraseña nueva
            </CardDescription>
          </CardHeader>
          <CardContent>
            {enviado ? (
              <div className="space-y-2">
                <p className="rounded-md bg-muted p-3 text-sm text-foreground">{MENSAJE_ENVIADO}</p>
                <p className="text-sm text-muted-foreground">{MENSAJE_GOOGLE}</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="flex flex-col gap-6">
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      aria-invalid={errorLimite ? true : undefined}
                      aria-describedby={errorLimite ? 'recuperar-error' : undefined}
                      placeholder="tu@email.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  {errorLimite && (
                    <p id="recuperar-error" role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                      {MENSAJE_LIMITE}
                    </p>
                  )}
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Enviando...' : 'Mandar link'}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
