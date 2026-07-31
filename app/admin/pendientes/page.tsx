import { Metadata } from "next"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getPendingEvents } from "@/lib/admin-actions"
import { PendingEventsList } from "@/components/pending-events-list"

export const metadata: Metadata = {
  title: "Eventos Pendientes - Admin | Que Pinta Salta",
}

export default async function PendingEventsPage() {
  const supabase = await createClient()

  // Verify admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect("/login")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "ADMIN") {
    redirect("/")
  }

  const pendingEvents = await getPendingEvents()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Eventos Pendientes</h1>
        <p className="text-muted-foreground">
          Revisa y aprueba los eventos subidos por los colaboradores.
        </p>
      </div>

      <PendingEventsList initialEvents={pendingEvents} />
    </div>
  )
}
