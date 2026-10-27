import { createClient } from '@/lib/supabase/server'
import { CinesView } from '@/components/cines-view'
import { Navbar } from '@/components/navbar'
import { MobileNav } from '@/components/mobile-nav'
import { Film } from 'lucide-react'
import { textosDe } from '@/lib/i18n'
import { AvisoContenidoEs } from '@/components/aviso-contenido-es'
import type { Idioma } from '@/lib/i18n/idiomas'

/**
 * La página de cartelera entera, compartida por `/cines` y `/en/cines` (Q3).
 * Antes vivía en el cuerpo de `app/cines/page.tsx`; se movió acá sin cambios
 * salvo los textos, que salen del diccionario. Cada página pone su metadata.
 */
export async function PaginaCines({ idioma }: { idioma: Idioma }) {
  const t = textosDe(idioma).cines
  const supabase = await createClient()

  // Traer solo películas activas, ordenadas alfabéticamente
  const { data: movies, error } = await supabase
    .from('cinema_movies')
    .select('*')
    .eq('is_currently_showing', true)
    .order('title', { ascending: true })

  if (error) {
    console.error('[cines-page] Error obteniendo películas:', error)
  }

  const activeMovies = movies || []

  return (
    <main className="min-h-screen bg-background text-foreground pb-page relative overflow-hidden">
      {/* Luces de fondo decorativas (Aesthetics) */}
      <div className="absolute top-[-10%] left-[-20%] w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute top-[30%] right-[-25%] w-[500px] h-[500px] rounded-full bg-primary/5 blur-[100px] pointer-events-none" />

      <Navbar />

      <div className="container mx-auto px-4 pt-12 md:pt-16 max-w-7xl">
        {/* Header Seccion */}
        <div className="flex flex-col items-center text-center mb-12 space-y-4">
          <div className="flex items-center justify-center size-14 rounded-2xl bg-primary/10 border border-primary/20 text-primary shadow-inner shadow-primary/20 mb-2">
            <Film className="size-7" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl text-foreground dark:bg-gradient-to-r dark:from-zinc-100 dark:via-zinc-200 dark:to-zinc-400 dark:bg-clip-text dark:text-transparent">
            {t.titulo}
          </h1>
          <p className="text-sm font-medium text-muted-foreground max-w-xl md:text-base leading-relaxed">
            {t.bajadaInicio}<span className="text-foreground dark:text-zinc-200 font-semibold">Cinemark Alto NOA</span>{t.bajadaSeparador}<span className="text-foreground dark:text-zinc-200 font-semibold">Cinemark Paseo Salta</span>{t.bajadaY}<span className="text-foreground dark:text-zinc-200 font-semibold">Cine Ópera</span>{t.bajadaFin}
          </p>
          {idioma === 'en' && <AvisoContenidoEs className="justify-center text-center" />}
        </div>

        {/* Componente de búsqueda y grid */}
        <CinesView movies={activeMovies} />
      </div>

      <MobileNav />
    </main>
  )
}
