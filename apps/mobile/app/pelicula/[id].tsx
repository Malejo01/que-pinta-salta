// Ficha de una película en cartelera (28-g, F3): tocar una película en
// `app/cines.tsx` entra acá. Mismo patrón de estados que `app/cines.tsx`
// (cargando, error con "Reintentar"), más "no encontrada" (la película ya
// no está en cartelera o el id no es válido). Por cine (`funcionesPorCine`
// de `lib/datos/cines.ts`): nombre, formatos con sus horarios como chips y,
// si hay `booking_url`, "Comprar entradas" (se abre solo si es `https`,
// nunca un esquema distinto, y con `catch`). Sin sinopsis, duración ni
// clasificación: no están en `cinema_movies` (decisión 4 de "Feedback del
// teléfono" en plan.md) — no se inventan.
import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import * as Linking from 'expo-linking'
import { Stack, useLocalSearchParams, useRouter, useTheme } from 'expo-router'
import { Afiche } from '@/components/Afiche'
import { Cargando, ErrorCarga, Vacio } from '@/components/EstadoCarga'
import { useColoresQPS } from '@/lib/colores'
import {
  funcionesPorCine,
  obtenerPeliculaPorId,
  urlCompraCineSegura,
  type FuncionesDeCine,
  type Pelicula,
} from '@/lib/datos/cines'

type Estado = { tipo: 'cargando' } | { tipo: 'error'; error: string } | { tipo: 'no-encontrada' } | { tipo: 'ok'; pelicula: Pelicula }

export default function PeliculaPorId() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { colors } = useTheme()
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
    <View style={[estilos.contenedor, { backgroundColor: colors.background }]}>
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

      {estado.tipo === 'ok' ? <Ficha pelicula={estado.pelicula} colores={colors} coloresQPS={colores} /> : null}
    </View>
  )
}

function Ficha({
  pelicula,
  colores,
  coloresQPS,
}: {
  pelicula: Pelicula
  colores: ReturnType<typeof useTheme>['colors']
  coloresQPS: ReturnType<typeof useColoresQPS>
}) {
  const cines = funcionesPorCine(pelicula.showings)

  return (
    <ScrollView contentContainerStyle={estilos.contenido}>
      <View style={estilos.contenedorAfiche}>
        <Afiche url={pelicula.poster_url} llenar />
      </View>

      <Text style={[estilos.titulo, { color: colores.text }]}>{pelicula.title}</Text>

      <Text style={[estilos.subtitulo, { color: colores.text }]}>Horarios de hoy</Text>

      {cines.length === 0 ? (
        <Text style={{ color: coloresQPS.mutedForeground }}>No hay funciones para hoy.</Text>
      ) : (
        cines.map((cine) => <BloqueCine key={cine.cine} cine={cine} colores={colores} coloresQPS={coloresQPS} />)
      )}
    </ScrollView>
  )
}

function BloqueCine({
  cine,
  colores,
  coloresQPS,
}: {
  cine: FuncionesDeCine
  colores: ReturnType<typeof useTheme>['colors']
  coloresQPS: ReturnType<typeof useColoresQPS>
}) {
  // Único origen válido para abrir una URL de compra (R28, 28-g): el
  // `booking_url` crudo (`cine.urlCompra`) nunca llega a `Linking.openURL`
  // directo — siempre pasa por `urlCompraCineSegura`, que solo lo devuelve
  // si el esquema es `https` (ver `tests/aperturas-url.test.ts`).
  const urlCompra = urlCompraCineSegura(cine.urlCompra)

  return (
    <View style={[estilos.bloqueCine, { borderColor: colores.border }]}>
      <Text style={[estilos.nombreCine, { color: colores.text }]}>{cine.cine}</Text>

      {cine.formatos.map((formato, indice) => (
        <View key={`${formato.tipo}-${indice}`} style={estilos.bloqueFormato}>
          <Text style={{ color: coloresQPS.mutedForeground }}>{formato.tipo}</Text>
          <View style={estilos.filaChips}>
            {formato.horarios.map((horario, indiceHorario) => (
              <View key={`${horario}-${indiceHorario}`} style={[estilos.chip, { borderColor: colores.border }]}>
                <Text style={{ color: colores.text }}>{horario}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}

      {urlCompra ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => Linking.openURL(urlCompra).catch(() => {})}
          style={({ pressed }) => [
            estilos.botonComprar,
            { borderColor: colores.primary, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Text style={{ color: colores.primary, fontWeight: '600' }}>Comprar entradas</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1 },
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  contenido: { padding: 16, gap: 12 },
  contenedorAfiche: { width: '100%', aspectRatio: 2 / 3, borderRadius: 12, overflow: 'hidden' },
  titulo: { fontSize: 22, fontWeight: '700' },
  subtitulo: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  bloqueCine: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  nombreCine: { fontSize: 15, fontWeight: '700' },
  bloqueFormato: { gap: 6 },
  filaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4 },
  botonComprar: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start', marginTop: 4 },
})
