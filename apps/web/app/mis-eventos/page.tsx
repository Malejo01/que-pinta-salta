import { createClient } from "@/lib/supabase/server"
import { PUBLIC_EVENT_ROW_SELECT } from "@/lib/events/public-select"
import { redirect } from "next/navigation"
import MisEventosClient from "./mis-eventos-client"
import { Navbar } from "@/components/navbar"
import { MobileNav } from "@/components/mobile-nav"

export default async function MisEventosPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Eventos del usuario, con columnas explícitas (QPS-107): van a un
  // componente cliente y no necesitan las columnas internas.
  const { data: events, error } = await supabase
    .from("events")
    .select(`${PUBLIC_EVENT_ROW_SELECT}, category:categories(name), venue:venues(name)`)
    .eq("created_by", user.id)
    .order("start_date", { ascending: false })

  if (error) {
    console.error("Error fetching user events:", error)
    return (
      <div className="min-h-screen bg-background pb-page sm:pb-0">
        <Navbar />
        <main id="contenido" tabIndex={-1} className="container mx-auto py-10 px-4 focus:outline-none">
          <h1 className="text-2xl font-bold mb-4">Eventos que cargaste</h1>
          <p className="text-destructive">Error al cargar tus eventos.</p>
        </main>
        <MobileNav />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-page sm:pb-0">
      <Navbar />
      <main id="contenido" tabIndex={-1} className="container mx-auto py-10 px-4 focus:outline-none">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Eventos que cargaste</h1>
        </div>
        <MisEventosClient initialEvents={events || []} />
      </main>
      <MobileNav />
    </div>
  )
}
