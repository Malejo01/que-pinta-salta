import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getUsers } from "@/lib/user-actions"
import { UsersTable } from "@/components/users-table"
import { ShieldAlert } from "lucide-react"

export default async function AdminUsersPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login?redirect=/admin/users")

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "ADMIN") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <ShieldAlert className="size-12 text-destructive" />
        <h1 className="text-2xl font-bold">403 — Acceso denegado</h1>
        <p className="text-muted-foreground">No tenés permisos para ver esta sección.</p>
      </div>
    )
  }

  const { data: users, error } = await getUsers()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Gestión de Usuarios</h1>
        <p className="mt-1 text-muted-foreground">
          Administrá los roles de los usuarios registrados en la plataforma.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-destructive">Error al cargar usuarios: {error}</p>
      ) : (
        <UsersTable initialUsers={users as any} />
      )}
    </div>
  )
}
