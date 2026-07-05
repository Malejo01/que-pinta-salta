import { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { CinesView } from '@/components/cines-view'
import { Film } from 'lucide-react'

// Metadata para SEO
export const metadata: Metadata = {
  title: 'Cartelera de Cines en Salta | Qué Pinta Salta',
  description: 'Consultá los horarios, formatos y películas en cartelera para Cinemark Alto NOA, Cinemark Paseo Salta y Cine Ópera. Comprá tus entradas al instante.',
  openGraph: {
    title: 'Cartelera de Cines en Salta | Qué Pinta Salta',
    description: 'Toda la cartelera de cines de Salta unificada de forma inteligente.',
    type: 'website',
  }
}

export const revalidate = 0 // Evita cache estático para reflejar cambios diarios del scraper

export default async function CinesPage() {
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
    <main className="min-h-screen bg-background text-foreground pb-20 relative overflow-hidden">
      {/* Luces de fondo decorativas (Aesthetics) */}
      <div className="absolute top-[-10%] left-[-20%] w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute top-[30%] right-[-25%] w-[500px] h-[500px] rounded-full bg-primary/5 blur-[100px] pointer-events-none" />

      <div className="container mx-auto px-4 pt-12 md:pt-16 max-w-7xl">
        {/* Header Seccion */}
        <div className="flex flex-col items-center text-center mb-12 space-y-4">
          <div className="flex items-center justify-center size-14 rounded-2xl bg-primary/10 border border-primary/20 text-primary shadow-inner shadow-primary/20 mb-2">
            <Film className="size-7" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl bg-gradient-to-r from-zinc-100 via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
            Cartelera de Cines
          </h1>
          <p className="text-sm font-medium text-muted-foreground max-w-xl md:text-base leading-relaxed">
            Explorá todas las películas en cartelera hoy en <span className="text-zinc-200 font-semibold">Cinemark Alto NOA</span>, <span className="text-zinc-200 font-semibold">Cinemark Paseo Salta</span> y <span className="text-zinc-200 font-semibold">Cine Ópera</span> de forma unificada.
          </p>
        </div>

        {/* Componente de búsqueda y grid */}
        <CinesView movies={activeMovies} />
      </div>
    </main>
  )
}
