import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { ChangePasswordForm } from "@/components/change-password-form"

// F6 (QPS-145): exige sesión igual que apps/web/app/perfil/page.tsx. Se
// llega acá con la sesión que dejó /auth/callback al canjear el código del
// mail de recuperación — sin esa sesión, no hay nada para cambiar.
export const revalidate = 0 // Evitar caché estática para esta página privada

export default async function RestablecerPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth/login?next=/auth/restablecer")
  }

  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center bg-background p-6 md:p-10">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-center text-2xl font-bold tracking-tight text-foreground">
          Elegí tu contraseña nueva
        </h1>
        <ChangePasswordForm />
      </div>
    </div>
  )
}
