"use client"

import { useId, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, KeyRound, CheckCircle2, AlertCircle } from "lucide-react"
import { notify } from '@/hooks/notify'
import {
  LARGO_MINIMO_CONTRASENA,
  textosContrasena,
  validarContrasenaNueva,
  type ModoContrasena,
} from "@qps/core/auth/cuenta"
import { mensajeErrorContrasena } from "@qps/core/auth/mensajes"
import { textosDe } from "@/lib/i18n"
import type { Idioma } from "@/lib/i18n/idiomas"
import { rutaEn } from "@/lib/i18n/rutas"

interface ChangePasswordFormProps {
  /**
   * De dónde viene la cuenta (R48, tarea 48-c): decide los textos
   * (`textosContrasena`) que ve la persona. Por defecto `'email'`, el caso
   * de siempre (cambiar una contraseña que ya existía).
   */
  modo?: ModoContrasena
  /**
   * Q6-2: el idioma de la página (/perfil o /en/perfil). Por defecto,
   * castellano (también en /auth/restablecer, que queda en castellano).
   */
  idioma?: Idioma
}

export function ChangePasswordForm({ modo = "email", idioma = "es" }: ChangePasswordFormProps) {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const errorId = useId()

  const textos = textosDe(idioma)
  const t = textos.cambioContrasena
  // En castellano, los textos de core tal cual; en inglés, su traducción.
  const { titulo, descripcion, boton } = idioma === "es" ? textosContrasena(modo) : t.modos[modo]
  // Los mensajes de core (validación y errores) pasan por el diccionario en inglés.
  const mensaje = (texto: string) => (idioma === "es" ? texto : textos.auth.mensaje(texto))

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    const validacion = validarContrasenaNueva(password, confirmPassword)
    if (!validacion.ok) {
      setError(mensaje(validacion.mensaje))
      return
    }

    setIsSubmitting(true)
    const supabase = createClient()

    try {
      // No se pide la contraseña actual (decisión del plan de la R48): una
      // cuenta creada con Google no tiene una contraseña previa que pedir
      // (ver `textosContrasena('google')`). Riesgo aceptado: alcanza con la
      // sesión vigente para fijar una contraseña nueva, así que una sesión
      // robada (p. ej. un token filtrado) también podría hacerlo. Si en el
      // dashboard de Supabase está prendido "Secure password change",
      // `updateUser` devuelve `reauthentication_needed` y
      // `mensajeErrorContrasena` ya traduce eso a pedir volver a entrar.
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      })

      if (updateError) {
        throw updateError
      }

      setSuccess(true)
      setPassword("")
      setConfirmPassword("")
      notify.success(t.avisoGuardada)
    } catch (err) {
      // QPS-155: nunca el objeto de error crudo (ni su .message) a la
      // consola ni a la pantalla — puede traer datos de la cuenta. Un texto
      // fijo al log (sin el error ni nada derivado de él) y, a la pantalla,
      // el texto que traduce `mensajeErrorContrasena` según el código.
      console.error("Error al guardar la contraseña")
      setError(mensaje(mensajeErrorContrasena(err)))
      notify.error(t.avisoError)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="border border-border/40 bg-card/60 backdrop-blur-sm shadow-md transition-all hover:shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <KeyRound className="size-5 text-primary" />
          {titulo}
        </CardTitle>
        <CardDescription>{descripcion}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div
              id={errorId}
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
            >
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div role="status" className="flex items-start gap-2 rounded-lg border border-green-500/20 bg-green-500/10 p-3 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
              <span>
                {modo === "restablecer" ? (
                  <>
                    {t.listoRestablecer}{" "}
                    <Link href={rutaEn(idioma, "/")} className="font-medium underline">
                      {t.irALaPortada}
                    </Link>
                  </>
                ) : (
                  t.guardada
                )}
              </span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="new-password">{t.nueva}</Label>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={LARGO_MINIMO_CONTRASENA}
              disabled={isSubmitting}
              className="bg-background/50 focus-visible:ring-primary/50"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">{t.confirmar}</Label>
            <PasswordInput
              id="confirm-password"
              autoComplete="new-password"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={LARGO_MINIMO_CONTRASENA}
              disabled={isSubmitting}
              className="bg-background/50 focus-visible:ring-primary/50"
            />
          </div>

          <Button type="submit" className="w-full font-medium" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                {t.guardando}
              </>
            ) : (
              boton
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
