import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getCategories, getVenues, getInstagramAccounts } from "@/lib/data"
import { getRadarSettings } from "@/lib/actions/radar"
import { Navbar } from "@/components/navbar"
import { MobileNav } from "@/components/mobile-nav"
import { RadarForm } from "@/components/radar-form"
import { Radio } from "lucide-react"

export const metadata = {
  title: "Mi Radar Salteño 📡 | Qué Pinta Salta",
  description: "Personaliza tu suscripción de novedades para recibir la agenda cultural de Salta en tu email.",
}

export default async function RadarPage() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  // Redirigir al login si no tiene sesión activa
  if (!user || authError) {
    redirect("/auth/login?next=/radar")
  }

  // Carga paralela de configuraciones, locales, categorías e Instagram accounts
  const [initialSettings, categories, venues, instagramAccounts] = await Promise.all([
    getRadarSettings(),
    getCategories(),
    getVenues(),
    getInstagramAccounts()
  ])

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0 relative overflow-hidden">
      {/* Elementos estéticos de fondo (Luces decorativas) */}
      <div className="absolute top-[-5%] left-[-15%] w-[500px] h-[500px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[10%] right-[-15%] w-[450px] h-[450px] rounded-full bg-primary/5 blur-[100px] pointer-events-none" />

      <Navbar />

      <main className="container mx-auto px-4 py-12 max-w-4xl relative z-10">
        {/* Encabezado Principal */}
        <div className="flex flex-col items-center text-center mb-10 space-y-3">
          <div className="flex items-center justify-center size-14 rounded-2xl bg-primary/10 border border-primary/20 text-primary shadow-inner shadow-primary/20 mb-1">
            <Radio className="size-7 animate-pulse text-primary" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl bg-gradient-to-r from-zinc-100 via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
            Mi Radar Salteño
          </h1>
          <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
            Tú decides qué eventos ver y recibir. Suscríbete a tus categorías, locales u organizadores favoritos de Instagram y recibe alertas a tu correo sin spam.
          </p>
        </div>

        {/* Formulario Cliente */}
        <RadarForm 
          initialSettings={initialSettings} 
          categories={categories} 
          venues={venues} 
          instagramAccounts={instagramAccounts}
        />
      </main>

      <MobileNav />
    </div>
  )
}
