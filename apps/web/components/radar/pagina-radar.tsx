import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getCategories, getVenues, getInstagramAccounts } from "@/lib/data"
import { getRadarSettings } from "@/lib/actions/radar"
import { Navbar } from "@/components/navbar"
import { MobileNav } from "@/components/mobile-nav"
import { RadarForm } from "@/components/radar-form"
import { textosDe } from "@/lib/i18n"
import type { Idioma } from "@/lib/i18n/idiomas"
import { rutaEn } from "@/lib/i18n/rutas"
import { Radio } from "lucide-react"

/**
 * La página de `/radar` y `/en/radar` (compartida; cada una pone su metadata,
 * con `noindex, follow`). Es privada: sin sesión redirige al ingreso (que
 * queda en castellano) y vuelve a la misma página en el mismo idioma.
 *
 * Se llama como función desde `app/radar/page.tsx` y `app/en/radar/page.tsx`.
 */
export async function PaginaRadar({ idioma }: { idioma: Idioma }) {
  const textos = textosDe(idioma).radar
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  // Redirigir al login si no tiene sesión activa
  if (!user || authError) {
    redirect(`/auth/login?next=${rutaEn(idioma, "/radar")}`)
  }

  // Carga paralela de configuraciones, locales, categorías, Instagram accounts y rol
  // (mismo mecanismo que el resto del sitio: profiles.role === 'ADMIN', leído en el servidor)
  const [initialSettings, categories, venues, instagramAccounts, profileRes] = await Promise.all([
    getRadarSettings(),
    getCategories(),
    getVenues(),
    getInstagramAccounts(),
    supabase.from("profiles").select("role").eq("id", user.id).single(),
  ])
  const isAdmin = profileRes.data?.role === "ADMIN"

  return (
    <div className="min-h-screen bg-background pb-page sm:pb-0 relative overflow-hidden">
      {/* Elementos estéticos de fondo (Luces decorativas) */}
      <div className="absolute top-[-5%] left-[-15%] w-[500px] h-[500px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[10%] right-[-15%] w-[450px] h-[450px] rounded-full bg-primary/5 blur-[100px] pointer-events-none" />

      <Navbar />

      <main id="contenido" tabIndex={-1} className="container mx-auto px-4 py-12 max-w-4xl relative z-10 focus:outline-none">
        {/* Encabezado Principal */}
        <div className="flex flex-col items-center text-center mb-10 space-y-3">
          <div className="flex items-center justify-center size-14 rounded-2xl bg-primary/10 border border-primary/20 text-primary shadow-inner shadow-primary/20 mb-1">
            <Radio className="size-7 animate-pulse text-primary" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground dark:bg-gradient-to-r dark:from-zinc-100 dark:via-zinc-200 dark:to-zinc-400 dark:bg-clip-text dark:text-transparent">
            {textos.titulo}
          </h1>
          <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
            {textos.bajada}
          </p>
        </div>

        {/* Formulario Cliente */}
        <RadarForm
          initialSettings={initialSettings}
          categories={categories}
          venues={venues}
          instagramAccounts={instagramAccounts}
          isAdmin={isAdmin}
          idioma={idioma}
        />
      </main>

      <MobileNav />
    </div>
  )
}
