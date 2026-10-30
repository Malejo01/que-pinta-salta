"use client"

import { createContext, useContext, useState, ReactNode } from "react"
import { createClient, signInWithGoogle } from "@/lib/supabase/client"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import { mensajeErrorAlta, mensajeErrorIngreso, resultadoAltaConSesion, MENSAJE_ALTA_ENVIADA, MENSAJE_ALTA_CON_SESION } from "@/lib/auth/mensajes"
import { validarContrasenaNueva } from "@qps/core/auth/cuenta"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { hrefLangDestino } from "@/lib/i18n/rutas"
import { useIdioma, useTextos } from "@/lib/i18n/use-idioma"

interface AuthModalContextType {
  open: () => void
  close: () => void
}

const AuthModalContext = createContext<AuthModalContextType | undefined>(undefined)

export function useAuthModal() {
  const context = useContext(AuthModalContext)
  if (!context) {
    throw new Error("useAuthModal must be used within an AuthModalProvider")
  }
  return context
}

const GoogleIcon = () => (
  <svg className="size-4 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
  </svg>
)

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [mode, setMode] = useState<"login" | "signup">("login")
  // El provider vive en el layout raíz: el idioma sale de la URL de la página
  // donde se abre (/en/... en inglés).
  const idioma = useIdioma()
  const t = useTextos().auth

  const handleGoogleLogin = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const { error } = await signInWithGoogle()
      if (error) throw error
    } catch {
      setError(t.errorGoogle)
      setIsLoading(false)
    }
  }
  
  const router = useRouter()
  const { toast } = useToast()

  const open = () => {
    setError(null)
    setEmail("")
    setPassword("")
    setMode("login")
    setIsOpen(true)
  }
  const close = () => setIsOpen(false)

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) {
          setError(mensajeErrorIngreso(error))
          return
        }

        toast({
          title: t.bienvenidoDeNuevo,
          description: t.sesionIniciada,
        })
      } else {
        // El modal no pide confirmación de contraseña (un solo campo): se
        // valida igual contra sí misma para reusar el chequeo de largo
        // mínimo de `validarContrasenaNueva` (la comparación de coincidencia
        // nunca falla al comparar un valor contra sí mismo).
        const validacion = validarContrasenaNueva(password, password)
        if (!validacion.ok) {
          setError(validacion.mensaje)
          return
        }

        const respuesta = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          }
        })
        const resultado = resultadoAltaConSesion(respuesta)
        if (resultado.tipo === "error") {
          setError(resultado.mensaje)
          return
        }

        if (resultado.tipo === "sesion") {
          // Supabase confirmó el alta solo: no sale ningún correo.
          toast({
            title: t.bienvenido,
            description: t.mensaje(MENSAJE_ALTA_CON_SESION),
          })
        } else {
          toast({
            title: t.revisaTuEmail,
            description: t.mensaje(MENSAJE_ALTA_ENVIADA),
          })
        }
      }
      close()
      router.refresh()
    } catch (error: unknown) {
      setError(mode === "signup" ? mensajeErrorAlta(error) : mensajeErrorIngreso(error))
    } finally {
      setIsLoading(false)
    }
  }

  // El error se guarda como lo da core (en castellano) y se traduce al
  // mostrarlo; si no tiene traducción, queda en castellano con `lang="es"`.
  const errorVisible = error === null ? null : t.mensaje(error)
  const langError = idioma !== "es" && errorVisible === error ? "es" : undefined
  // Las páginas a las que lleva el modal existen solo en castellano.
  const langLegales = idioma === "es" ? {} : { hrefLang: "es-AR" }

  return (
    <AuthModalContext.Provider value={{ open, close }}>
      {children}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-center">
              {mode === "login" ? t.tituloIngresar : t.tituloCrear}
            </DialogTitle>
            <DialogDescription className="text-center">
              {mode === "login" ? t.descripcionIngresar : t.descripcionCrear}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAuth} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="modal-email">{t.email}</Label>
              <Input
                id="modal-email"
                type="email"
                autoComplete="email"
                aria-invalid={errorVisible ? true : undefined}
                aria-describedby={errorVisible ? "modal-auth-error" : undefined}
                placeholder={t.emailPlaceholder}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="modal-password">{t.contrasena}</Label>
              <PasswordInput
                id="modal-password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                aria-invalid={errorVisible ? true : undefined}
                aria-describedby={errorVisible ? "modal-auth-error" : undefined}
                etiquetaMostrar={t.mostrarContrasena}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {mode === "login" && (
                <Link
                  href="/auth/recuperar"
                  hrefLang={hrefLangDestino(idioma, "/auth/recuperar")}
                  onClick={close}
                  className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                  {t.olvidasteContrasena}
                </Link>
              )}
            </div>
            {errorVisible && (
              <p id="modal-auth-error" role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive text-center" lang={langError}>
                {errorVisible}
              </p>
            )}
            <Button 
              type="submit" 
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold" 
              disabled={isLoading}
            >
              {isLoading 
                ? (mode === "login" ? t.iniciandoSesion : t.creandoCuenta) 
                : (mode === "login" ? t.botonIngresar : t.botonRegistrarse)}
            </Button>

            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">{t.oContinuarCon}</span>
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

            <p className="text-xs text-muted-foreground text-center">
              {mode === "login" ? (
                <>
                  {t.aceptasConGoogle}{" "}
                  <Link href="/terminos" onClick={close} {...langLegales} className="text-primary underline underline-offset-4">
                    {t.terminos}
                  </Link>{" "}
                  {t.yLa}{" "}
                  <Link href="/privacidad" onClick={close} {...langLegales} className="text-primary underline underline-offset-4">
                    {t.privacidad}
                  </Link>
                  {t.cierreLegales}
                </>
              ) : (
                <>
                  {t.aceptasAlCrear}{" "}
                  <Link href="/terminos" onClick={close} {...langLegales} className="text-primary underline underline-offset-4">
                    {t.terminos}
                  </Link>{" "}
                  {t.yLa}{" "}
                  <Link href="/privacidad" onClick={close} {...langLegales} className="text-primary underline underline-offset-4">
                    {t.privacidad}
                  </Link>
                  {t.cierreLegales}
                </>
              )}
            </p>

            <div className="text-center text-sm text-muted-foreground mt-4">
              {mode === "login" ? (
                <>
                  {t.noTenesCuenta}{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setError(null)
                      setMode("signup")
                    }}
                    className="text-primary hover:underline font-semibold bg-transparent border-none cursor-pointer"
                  >
                    {t.registrate}
                  </button>
                </>
              ) : (
                <>
                  {t.yaTenesCuenta}{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setError(null)
                      setMode("login")
                    }}
                    className="text-primary hover:underline font-semibold bg-transparent border-none cursor-pointer"
                  >
                    {t.iniciaSesion}
                  </button>
                </>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AuthModalContext.Provider>
  )
}
