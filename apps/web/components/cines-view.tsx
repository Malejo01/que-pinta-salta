'use client'

import { useState } from 'react'
import { CinemaMovie } from '@/lib/types'
import { MovieCard } from '@/components/movie-card'
import { cargaPorIndice } from '@/lib/images/carga'
import { Input } from '@/components/ui/input'
import { Search, Film, X, Clapperboard } from 'lucide-react'

interface CinesViewProps {
  movies: CinemaMovie[]
}

export function CinesView({ movies }: CinesViewProps) {
  const [searchQuery, setSearchQuery] = useState('')

  // Filtrar películas por título
  const filteredMovies = movies.filter(movie =>
    movie.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-8">
      {/* Barra de búsqueda interactiva */}
      <div className="relative mx-auto max-w-md w-full">
        <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
          <Search className="size-5" />
        </div>
        <Input
          type="text"
          placeholder="Buscar película por nombre..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-10 rounded-xl h-11 bg-card/50 focus-visible:ring-primary/40 focus-visible:border-primary/50 transition-all backdrop-blur-sm"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-5" />
          </button>
        )}
      </div>

      {/* Grid de Películas */}
      {filteredMovies.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {/* B3: los dos primeros pósters (la primera fila en celular y lo
              que entra arriba en pantallas anchas) cargan sin esperar al
              lazy-load; el primero, con prioridad alta porque es el LCP. */}
          {filteredMovies.map((movie, index) => (
            <MovieCard key={movie.id} movie={movie} carga={cargaPorIndice(index)} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/10 p-12 text-center backdrop-blur-xs">
          <div className="flex size-14 items-center justify-center rounded-full bg-muted border border-border mb-4 text-muted-foreground">
            <Clapperboard className="size-6 stroke-[1.5]" />
          </div>
          <h3 className="text-lg font-bold text-foreground">No se encontraron películas</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-xs">
            {searchQuery
              ? `No hay resultados para "${searchQuery}". Probá buscando con otro título.`
              : 'No hay películas en cartelera actualmente.'}
          </p>
        </div>
      )}
    </div>
  )
}
