// Ficha de una película en cartelera (28-g, F3; R29, 29-k: ops/paridad-web-app.md
// §3.8). Entran acá Favoritos y la fila de cine de la portada
// (`components/FilaCategoria.tsx`): a diferencia de la lista de
// `app/cines.tsx`, esas dos pantallas no tienen la tarjeta completa de la
// película a mano (solo el id), así que necesitan una ruta propia con "el
// mismo armado que la tarjeta abierta": el póster, el título y el acordeón
// por cine — igual que `MovieCard` de la web. Mismo patrón de estados que
// `app/cines.tsx` (cargando, error con "Reintentar"), más "no encontrada" (la
// película ya no está en cartelera o el id no es válido). Por cine
// (`funcionesPorCine` de `lib/datos/cines.ts`, reusada tal cual): nombre,
// formatos con sus horarios como chips y, si hay `booking_url`, "Comprar
// Entradas" (se abre solo si es `https`, nunca un esquema distinto, y con
// `catch`). Sin sinopsis, duración ni clasificación: no están en
// `cinema_movies` (decisión 4 de "Feedback del teléfono" en plan.md) — no se
// inventan.
//
// R67 (67-c): el acordeón de un cine es `components/BloqueCine.tsx`, el mismo
// que usa `components/TarjetaPelicula.tsx` (Cines y la portada con el chip
// "Cine"); esta `Ficha` no es una tarjeta y conserva su armado.
import { useCallback, useEffect, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { Afiche } from '@/components/Afiche'
import { BloqueCine } from '@/components/BloqueCine'
import { Cargando, ErrorCarga, Vacio } from '@/components/EstadoCarga'
import { Texto } from '@/components/Texto'
import { useColoresQPS } from '@/lib/colores'
import { funcionesPorCine, obtenerPeliculaPorId, type Pelicula } from '@/lib/datos/cines'

type Estado = { tipo: 'cargando' } | { tipo: 'error'; error: string } | { tipo: 'no-encontrada' } | { tipo: 'ok'; pelicula: Pelicula }

export default function PeliculaPorId() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const colores = useColoresQPS()
  const router = useRouter()

  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  // Bandera de "reintento" (28-l): no se puede llamar, desde el efecto, a una
  // función que hace `setState` de forma sincrónica (lint
  // react-hooks/set-state-in-effect). La carga inicial va dentro del propio
  // efecto, con el `setState` recién en el callback de la promesa; "Volver a
  // intentar" cambia esta bandera para que el efecto se repita.
  const [intento, setIntento] = useState(0)

  // Si la pantalla se reutiliza con otro `id` sin desmontarse (deep link a
  // otra película con la ficha ya montada), hay que volver a "cargando" antes
  // de que el efecto de abajo dispare el fetch nuevo; si no, se siguen viendo
  // los datos (o el error, o "no encontrada") de la película anterior hasta
  // que resuelve. El ajuste va durante el render, no dentro de un efecto
  // (comparar-y-ajustar con `useState`, no con `useRef`: leer o escribir
  // `ref.current` durante el render lo marca `react-hooks/refs`), así que no
  // reintroduce el lint `react-hooks/set-state-in-effect`.
  const [idAnterior, setIdAnterior] = useState(id)
  if (idAnterior !== id) {
    setIdAnterior(id)
    setEstado({ tipo: 'cargando' })
  }

  useEffect(() => {
    let cancelado = false

    obtenerPeliculaPorId(id).then((resultado) => {
      if (!cancelado) setEstado(resultado)
    })

    return () => {
      cancelado = true
    }
  }, [id, intento])

  const cargar = useCallback(() => {
    setEstado({ tipo: 'cargando' })
    setIntento((valor) => valor + 1)
  }, [])

  return (
    <View style={[estilos.contenedor, { backgroundColor: colores.background }]}>
      <Stack.Screen options={{ title: 'Película' }} />

      {estado.tipo === 'cargando' ? (
        <View style={estilos.centrado}>
          <Cargando />
        </View>
      ) : null}

      {estado.tipo === 'error' ? (
        <View style={estilos.centrado}>
          <ErrorCarga mensaje={estado.error} onReintentar={cargar} />
        </View>
      ) : null}

      {estado.tipo === 'no-encontrada' ? (
        <View style={estilos.centrado}>
          <Vacio mensaje="Esta película ya no está en cartelera." textoAccion="Volver" onAccion={() => router.back()} />
        </View>
      ) : null}

      {estado.tipo === 'ok' ? <Ficha pelicula={estado.pelicula} /> : null}
    </View>
  )
}

/** El mismo armado que la tarjeta abierta de `app/cines.tsx`: el póster, el
 * título y el acordeón por cine. */
function Ficha({ pelicula }: { pelicula: Pelicula }) {
  const cines = funcionesPorCine(pelicula.showings)
  const [abierto, setAbierto] = useState<string | null>(null)

  return (
    <ScrollView contentContainerStyle={estilos.contenido}>
      <View style={estilos.contenedorAfiche}>
        <Afiche url={pelicula.poster_url} llenar />
      </View>

      <Texto peso="bold" accessibilityRole="header" style={estilos.titulo}>
        {pelicula.title}
      </Texto>

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
    </ScrollView>
  )
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1 },
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  contenido: { padding: 16, gap: 4 },
  contenedorAfiche: { width: '100%', aspectRatio: 2 / 3, borderRadius: 16, overflow: 'hidden' },
  titulo: { fontSize: 22, marginTop: 16, marginBottom: 8 },
  sinFunciones: { textAlign: 'center', fontStyle: 'italic', paddingVertical: 8 },
})
