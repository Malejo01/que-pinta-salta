// Favoritos (R27, tarea 27-b). Sin sesión, invita a entrar desde Cuenta; con
// sesión, la lista de eventos guardados (lib/favoritos.ts), con el mismo
// `Afiche` y la misma fila que Inicio/Buscar. El `userId` sale de
// `useSession()`, nunca de un parámetro de pantalla.
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter, useTheme } from 'expo-router'
import type { DisplayEvent } from '@qps/core/home/types'
import { Afiche } from '@/components/Afiche'
import { obtenerFavoritos } from '@/lib/favoritos'
import { useSession } from '@/lib/session'

type EstadoLista =
  | { tipo: 'cargando' }
  | { tipo: 'error'; error: string }
  | { tipo: 'ok'; eventos: DisplayEvent[] }

export default function Favoritos() {
  const { colors } = useTheme()
  const router = useRouter()
  const { session, cargando: cargandoSesion } = useSession()
  const userId = session?.user.id ?? null

  const [estado, setEstado] = useState<EstadoLista>({ tipo: 'cargando' })

  const cargar = useCallback(async () => {
    if (!userId) return
    setEstado({ tipo: 'cargando' })
    const resultado = await obtenerFavoritos(userId)
    setEstado(resultado.ok ? { tipo: 'ok', eventos: resultado.eventos } : { tipo: 'error', error: resultado.error })
  }, [userId])

  useEffect(() => {
    if (cargandoSesion) return
    cargar()
  }, [cargandoSesion, cargar])

  if (cargandoSesion) {
    return (
      <View style={[estilos.centrado, { backgroundColor: colors.background, flex: 1 }]}>
        <ActivityIndicator />
      </View>
    )
  }

  if (!userId) {
    return (
      <View style={[estilos.centrado, { backgroundColor: colors.background, flex: 1 }]}>
        <Text style={{ color: colors.text }}>Entrá para guardar tus favoritos</Text>
        <Pressable
          onPress={() => router.push('/cuenta')}
          style={[estilos.boton, { borderColor: colors.border, marginTop: 12 }]}
        >
          <Text style={[estilos.textoBoton, { color: colors.text }]}>Ir a Cuenta</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={[estilos.contenedor, { backgroundColor: colors.background }]}>
      {estado.tipo === 'cargando' ? <ActivityIndicator style={estilos.espaciado} /> : null}

      {estado.tipo === 'error' ? (
        <View style={estilos.centrado}>
          <Text style={{ color: colors.text }}>{estado.error}</Text>
          <Pressable onPress={cargar} style={[estilos.boton, { borderColor: colors.border, marginTop: 12 }]}>
            <Text style={[estilos.textoBoton, { color: colors.text }]}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      {estado.tipo === 'ok' ? (
        <FlatList
          data={estado.eventos}
          keyExtractor={(item) => item.id}
          contentContainerStyle={estilos.lista}
          ListEmptyComponent={
            <Text style={[estilos.vacio, { color: colors.text }]}>Todavía no guardaste ningún evento</Text>
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push(`/evento/${item.id}`)} style={estilos.fila}>
              <Afiche url={item.image} estilo={estilos.afiche} />
              <View style={estilos.filaTexto}>
                <Text style={[estilos.tituloEvento, { color: colors.text }]}>{item.title}</Text>
                <Text style={{ color: colors.border }}>{item.venue}</Text>
                {item.time ? <Text style={{ color: colors.border }}>{item.time}</Text> : null}
              </View>
            </Pressable>
          )}
        />
      ) : null}
    </View>
  )
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1 },
  centrado: { alignItems: 'center', justifyContent: 'center', marginTop: 24, paddingHorizontal: 24 },
  espaciado: { marginTop: 24 },
  boton: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  textoBoton: { fontWeight: '600' },
  lista: { padding: 16, gap: 12 },
  vacio: { textAlign: 'center', marginTop: 24 },
  fila: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  filaTexto: { flex: 1, gap: 2 },
  tituloEvento: { fontWeight: '600', fontSize: 15 },
  afiche: { width: 64, height: 64 },
})
