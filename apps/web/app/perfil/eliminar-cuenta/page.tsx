import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle, ArrowLeft } from "lucide-react"
import { EliminarCuentaForm } from "./eliminar-cuenta-form"
import { CONTACTO_EMAIL, mailtoContacto } from "@qps/core/contacto"

const linkClass = "text-primary underline underline-offset-4 hover:text-primary/80"

export const revalidate = 0 // Evitar caché estática para esta página privada

export default async function EliminarCuentaPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth/login?next=/perfil/eliminar-cuenta")
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-2xl px-4 py-12">
        <Button asChild variant="ghost" size="sm" className="mb-6 -ml-2 text-muted-foreground">
          <Link href="/perfil">
            <ArrowLeft className="mr-2 size-4" />
            Volver a mi perfil
          </Link>
        </Button>

        <Card className="border border-destructive/30 bg-card/60 backdrop-blur-sm shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl text-destructive">
              <AlertTriangle className="size-5" />
              Eliminar mi cuenta
            </CardTitle>
            <CardDescription>
              Esta acción es para siempre y no se puede deshacer.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>Cuenta: {user.email}</p>

              <div className="space-y-1">
                <p className="font-semibold text-foreground">Qué se borra:</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>Tus favoritos.</li>
                  <li>Tus marcas de &quot;Voy&quot; y &quot;Me interesa&quot;.</li>
                  <li>Las preferencias de Mi Radar y de notificaciones.</li>
                  <li>Los avisos que tenés activados.</li>
                  <li>El historial de los avisos que te mandamos.</li>
                  <li>Los tokens de aviso de tu celular.</li>
                  <li>La cuenta misma, con tu email y tu contraseña.</li>
                </ul>
              </div>

              <div className="space-y-1">
                <p className="font-semibold text-foreground">Qué no se borra:</p>
                <p>
                  Los eventos que cargaste siguen publicados, pero quedan sin tu nombre: pasan a figurar sin autor.
                </p>
              </div>
            </div>

            <EliminarCuentaForm />

            <p className="text-sm text-muted-foreground">
              ¿Algo no anda? Escribinos a{" "}
              <a href={mailtoContacto()} className={linkClass}>
                {CONTACTO_EMAIL}
              </a>
              .
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
