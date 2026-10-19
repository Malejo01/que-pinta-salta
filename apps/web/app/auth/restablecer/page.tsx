import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { ChangePasswordForm } from "@/components/change-password-form"
import { textosContrasena } from "@qps/core/auth/cuenta"

// F6 (QPS-145): exige sesión igual que apps/web/app/perfil/page.tsx. Se
// llega acá con la sesión que dejó /auth/callback al canjear el código del
// mail de recuperación — sin esa sesión, no hay nada para cambiar.
export const revalidate = 0 // Evitar caché estática para esta página privada

// Título (R48, tarea 48-c): sale de `textosContrasena('restablecer')`
// ("Elegí tu contraseña nueva" hoy), no escrito a mano acá. El mismo texto
// ya lo dibuja ChangePasswordForm (CardTitle, con el mismo `modo`): un
// <h1> visible con el mismo texto se vería duplicado en la pantalla (dos
// títulos idénticos, uno encima del otro). Se deja un <h1> igual, pero
// oculto (`sr-only`, solo para lectores de pantalla) y derivado de la misma
// fuente: así no hay dos lugares con el texto escrito a mano que puedan
// divergir, ni un duplicado visual.
//
// Tensión con tests/auth/recuperar.test.ts (tarea 48-c, no se puede tocar
// ese archivo): una de sus aserciones espera que el componente se monte sin
// ningún prop y busca, además, el título como literal en este archivo. Acá
// se le agrega el prop `modo` (imprescindible para que el formulario sepa
// qué textos mostrar) y el título deja de estar escrito a mano, así que esa
// aserción puntual queda desactualizada — reportado al lead, decisión suya.

export default async function RestablecerPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth/login?next=/auth/restablecer")
  }

  const { titulo } = textosContrasena("restablecer")

  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center bg-background p-6 md:p-10">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="sr-only">{titulo}</h1>
        <ChangePasswordForm modo="restablecer" />
      </div>
    </div>
  )
}
