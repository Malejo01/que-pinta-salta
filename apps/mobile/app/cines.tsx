// Cines (R25): la cartelera de hoy, fuera de las pestañas (se entra desde
// el atajo "Cines" de Inicio). Afiche (regla del punto 2 de 25-b: solo
// nuestro Storage, o el espacio vacío con la marca), título y la cantidad
// de cines donde se puede ver cada película.
import { useCallback, useEffect, useState } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useRouter, useTheme } from 'expo-router'
import { Afiche } from '@/components/Afiche'
import { Cargando, ErrorCarga, Vacio } from '@/components/EstadoCarga'
import { cantidadDeSalas, obtenerCines, type Pelicula } from '@/lib/datos/cines'

type Estado = { tipo: 'cargando' } | { tipo: 'error'; error: string } | { tipo: 'ok'; peliculas: Pelicula[] }

export default function Cines() {
  const { colors } = useTheme()
  const router = useRouter()
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  // Estado de refresco aparte del de carga (28-c): mientras se refresca, la
  // lista sigue a la vista en vez de pasar a `Cargando`.
  const [refrescando, setRefrescando] = useState(false)

  const cargar = useCallback(async () => {
    setEstado({ tipo: 'cargando' })
    const resultado = await obtenerCines()
    setEstado(resultado.ok ? { tipo: 'ok', peliculas: resultado.peliculas } : { tipo: 'error', error: resultado.error })
  }, [])

  const refrescar = useCallback(async () => {
    setRefrescando(true)
    const resultado = await obtenerCines()
    setEstado(resultado.ok ? { tipo: 'ok', peliculas: resultado.peliculas } : { tipo: 'error', error: resultado.error })
    setRefrescando(false)
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  return (
    <View style={[estilos.contenedor, { backgroundColor: colors.background }]}>
      <Text style={[estilos.titulo, { color: colors.text }]}>Cines</Text>

      {estado.tipo === 'cargando' ? <Cargando /> : null}

      {estado.tipo === 'error' ? <ErrorCarga mensaje={estado.error} onReintentar={cargar} /> : null}

      {estado.tipo === 'ok' ? (
        <FlatList
          data={estado.peliculas}
          keyExtractor={(item) => item.id}
          contentContainerStyle={estilos.lista}
          refreshControl={
            <RefreshControl refreshing={refrescando} onRefresh={refrescar} tintColor={colors.primary} colors={[colors.primary]} />
          }
          ListEmptyComponent={<Vacio mensaje="No hay películas en cartelera." />}
          renderItem={({ item }) => {
            const salas = cantidadDeSalas(item)
            return (
              <Pressable
                onPress={() => router.push(`/pelicula/${item.id}`)}
                accessibilityRole="button"
                android_ripple={{ color: colors.border }}
                style={({ pressed }) => [estilos.fila, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Afiche url={item.poster_url} estilo={estilos.afiche} />
                <View style={estilos.filaTexto}>
                  <Text style={[estilos.tituloPelicula, { color: colors.text }]}>{item.title}</Text>
                  <Text style={{ color: colors.border }}>
                    {salas} {salas === 1 ? 'sala' : 'salas'}
                  </Text>
                </View>
              </Pressable>
            )
          }}
        />
      ) : null}
    </View>
  )
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1 },
  titulo: { fontSize: 20, fontWeight: '700', padding: 16, paddingBottom: 0 },
  lista: { padding: 16, gap: 12 },
  fila: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  filaTexto: { flex: 1, gap: 2 },
  tituloPelicula: { fontWeight: '600', fontSize: 15 },
  afiche: { width: 64, height: 64 },
})
