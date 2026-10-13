// Cines (R25): la cartelera de hoy, fuera de las pestañas (se entra desde
// el atajo "Cines" de Inicio). Afiche (regla del punto 2 de 25-b: solo
// nuestro Storage, o el espacio vacío con la marca), título y la cantidad
// de cines donde se puede ver cada película.
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTheme } from 'expo-router'
import { Afiche } from '@/components/Afiche'
import { cantidadDeSalas, obtenerCines, type Pelicula } from '@/lib/datos/cines'

type Estado = { tipo: 'cargando' } | { tipo: 'error'; error: string } | { tipo: 'ok'; peliculas: Pelicula[] }

export default function Cines() {
  const { colors } = useTheme()
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })

  const cargar = useCallback(async () => {
    setEstado({ tipo: 'cargando' })
    const resultado = await obtenerCines()
    setEstado(resultado.ok ? { tipo: 'ok', peliculas: resultado.peliculas } : { tipo: 'error', error: resultado.error })
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  return (
    <View style={[estilos.contenedor, { backgroundColor: colors.background }]}>
      <Text style={[estilos.titulo, { color: colors.text }]}>Cines</Text>

      {estado.tipo === 'cargando' ? <ActivityIndicator style={estilos.espaciado} /> : null}

      {estado.tipo === 'error' ? (
        <View style={estilos.centrado}>
          <Text style={{ color: colors.text }}>{estado.error}</Text>
          <Pressable onPress={cargar} style={[estilos.boton, { borderColor: colors.border }]}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      {estado.tipo === 'ok' ? (
        <FlatList
          data={estado.peliculas}
          keyExtractor={(item) => item.id}
          contentContainerStyle={estilos.lista}
          ListEmptyComponent={
            <Text style={[estilos.vacio, { color: colors.text }]}>No hay películas en cartelera.</Text>
          }
          renderItem={({ item }) => {
            const salas = cantidadDeSalas(item)
            return (
              <View style={estilos.fila}>
                <Afiche url={item.poster_url} estilo={estilos.afiche} />
                <View style={estilos.filaTexto}>
                  <Text style={[estilos.tituloPelicula, { color: colors.text }]}>{item.title}</Text>
                  <Text style={{ color: colors.border }}>
                    {salas} {salas === 1 ? 'sala' : 'salas'}
                  </Text>
                </View>
              </View>
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
  espaciado: { marginTop: 24 },
  centrado: { alignItems: 'center', marginTop: 24, paddingHorizontal: 24, gap: 12 },
  boton: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  lista: { padding: 16, gap: 12 },
  vacio: { textAlign: 'center', marginTop: 24 },
  fila: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  filaTexto: { flex: 1, gap: 2 },
  tituloPelicula: { fontWeight: '600', fontSize: 15 },
  afiche: { width: 64, height: 64 },
})
