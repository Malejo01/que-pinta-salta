'use client'

import { useState } from 'react'
import { CinemaMovie } from '@/lib/types'
import { MovieCard } from '@/components/movie-card'
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
        <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-400">
          <Search className="size-5" />
        </div>
        <Input
          type="text"
          placeholder="Buscar película por nombre..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-zinc-900/50 border-zinc-800/80 pl-10 pr-10 text-zinc-100 placeholder-zinc-500 rounded-xl h-11 focus-visible:ring-primary/40 focus-visible:border-primary/50 transition-all backdrop-blur-sm"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute inset-y-0 right-3 flex items-center text-zinc-400 hover:text-white transition-colors"
          >
            <X className="size-5" />
          </button>
        )}
      </div>

      {/* Grid de Películas */}
      {filteredMovies.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filteredMovies.map((movie) => (
            <MovieCard key={movie.id} movie={movie} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/10 p-12 text-center backdrop-blur-xs">
          <div className="flex size-14 items-center justify-center rounded-full bg-zinc-900 border border-zinc-800/80 mb-4 text-zinc-500">
            <Clapperboard className="size-6 stroke-[1.5]" />
          </div>
          <h3 className="text-lg font-bold text-zinc-300">No se encontraron películas</h3>
          <p className="mt-1 text-sm text-zinc-500 max-w-xs">
            {searchQuery 
              ? `No hay resultados para "${searchQuery}". Probá buscando con otro título.` 
              : 'No hay películas en cartelera actualmente.'}
          </p>
        </div>
      )}
    </div>
  )
}
