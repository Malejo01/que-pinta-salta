"use client"

import { createContext, useContext, useState, ReactNode } from "react"
import { createClient } from "@/lib/supabase/client"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"

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

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [mode, setMode] = useState<"login" | "signup">("login")
  
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
        if (error) throw error
        
        toast({
          title: "¡Bienvenido de nuevo!",
          description: "Sesión iniciada correctamente.",
        })
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          }
        })
        if (error) throw error
        
        toast({
          title: "Registro exitoso",
          description: "Revisa tu correo electrónico para confirmar tu cuenta.",
        })
      }
      close()
      router.refresh()
    } catch (error: any) {
      setError(error?.message || "Ocurrió un error inesperado")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthModalContext.Provider value={{ open, close }}>
      {children}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-center">
              {mode === "login" ? "Iniciar Sesión" : "Crear Cuenta"}
            </DialogTitle>
            <DialogDescription className="text-center">
              {mode === "login"
                ? "Guarda tus eventos favoritos para tenerlos siempre a mano."
                : "Únete para guardar favoritos y personalizar tu agenda."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAuth} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="modal-email">Email</Label>
              <Input
                id="modal-email"
                type="email"
                placeholder="tu@email.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="modal-password">Contraseña</Label>
              <Input
                id="modal-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive text-center">
                {error}
              </p>
            )}
            <Button 
              type="submit" 
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold" 
              disabled={isLoading}
            >
              {isLoading 
                ? (mode === "login" ? "Iniciando sesión..." : "Creando cuenta...") 
                : (mode === "login" ? "Iniciar Sesión" : "Registrarse")}
            </Button>
            
            <div className="text-center text-sm text-muted-foreground mt-4">
              {mode === "login" ? (
                <>
                  ¿No tienes cuenta?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setError(null)
                      setMode("signup")
                    }}
                    className="text-primary hover:underline font-semibold bg-transparent border-none cursor-pointer"
                  >
                    Regístrate
                  </button>
                </>
              ) : (
                <>
                  ¿Ya tienes cuenta?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setError(null)
                      setMode("login")
                    }}
                    className="text-primary hover:underline font-semibold bg-transparent border-none cursor-pointer"
                  >
                    Inicia Sesión
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
