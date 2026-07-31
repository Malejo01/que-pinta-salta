import { createClient } from "@/lib/supabase/server"
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

  // Get user's events
  const { data: events, error } = await supabase
    .from("events")
    .select(`
      *,
      category:categories(name),
      venue:venues(name)
    `)
    .eq("created_by", user.id)
    .order("start_date", { ascending: false })

  if (error) {
    console.error("Error fetching user events:", error)
    return (
      <div className="min-h-screen bg-background pb-20 sm:pb-0">
        <Navbar />
        <div className="container mx-auto py-10 px-4">
          <h1 className="text-2xl font-bold mb-4">Mis Eventos</h1>
          <p className="text-destructive">Error al cargar tus eventos.</p>
        </div>
        <MobileNav />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      <Navbar />
      <div className="container mx-auto py-10 px-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Mis Eventos</h1>
        </div>
        <MisEventosClient initialEvents={events || []} />
      </div>
      <MobileNav />
    </div>
  )
}
