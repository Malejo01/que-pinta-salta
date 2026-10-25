// Tarjeta de una película en cartelera (R67, 67-c). Salió de `app/cines.tsx`
// para compartirla con la portada: con el chip "Cine" elegido, Inicio dibuja
// estas mismas tarjetas (afiche 2:3, badge "N Cines", título y el acordeón por
// cine, igual que `MovieCard` de la web) en vez de tarjetas de evento. Cada
// tarjeta guarda su propio cine abierto: abrir una película no cierra ni
// mueve las demás.
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Afiche } from '@/components/Afiche'
import { BloqueCine } from '@/components/BloqueCine'
import { Texto } from '@/components/Texto'
import { useColoresQPS } from '@/lib/colores'
import { cantidadDeSalas, funcionesPorCine, type Pelicula } from '@/lib/datos/cines'

export function TarjetaPelicula({ pelicula }: { pelicula: Pelicula }) {
  const colores = useColoresQPS()
  const cines = funcionesPorCine(pelicula.showings)
  const cantidad = cantidadDeSalas(pelicula)
  // `Accordion type="single" collapsible` de la web: un solo cine abierto a
  // la vez dentro de la misma tarjeta.
  const [abierto, setAbierto] = useState<string | null>(null)

  return (
    <View style={[estilos.tarjeta, { backgroundColor: colores.card, borderColor: colores.border }]}>
      <View style={estilos.contenedorAfiche}>
        <Afiche url={pelicula.poster_url} llenar />
        <View style={estilos.badge}>
          <Texto peso="semibold" style={estilos.textoBadge}>
            {cantidad} {cantidad === 1 ? 'Cine' : 'Cines'}
          </Texto>
        </View>
      </View>

      <Texto peso="bold" style={estilos.tituloPelicula} numberOfLines={2}>
        {pelicula.title}
      </Texto>

      <View style={[estilos.divisor, { borderColor: colores.border }]} />

      {cines.length === 0 ? (
        <Texto tono="secundario" style={estilos.sinFunciones}>
          Sin funciones para hoy
        </Texto>
      ) : (
        cines.map((cine, indice) => (
          <BloqueCine
            key={`${cine.cine}-${indice}`}
            cine={cine}
            abierto={abierto === cine.cine}
            esUltimo={indice === cines.length - 1}
            onToggle={() => setAbierto((actual) => (actual === cine.cine ? null : cine.cine))}
          />
        ))
      )}
    </View>
  )
}

const estilos = StyleSheet.create({
  tarjeta: { borderWidth: 1, borderRadius: 16, padding: 16 },
  contenedorAfiche: { width: '100%', aspectRatio: 2 / 3, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  badge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  textoBadge: { color: '#fff', fontSize: 11 },
  tituloPelicula: { fontSize: 17, marginTop: 12 },
  divisor: { borderTopWidth: 1, marginTop: 10, marginBottom: 2 },
  sinFunciones: { textAlign: 'center', fontStyle: 'italic', paddingVertical: 8 },
})
