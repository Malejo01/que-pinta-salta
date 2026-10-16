// Favoritos (R27, tarea 27-b; grilla R28, 28-f; paridad R29, 29-a: F13). Sin
// sesión, invita a entrar desde Cuenta; con sesión, la grilla de eventos,
// películas y flyers guardados (lib/favoritos.ts), con la misma
// `TarjetaEvento` que Inicio/Buscar. El `userId` sale de `useSession()`,
// nunca de un parámetro de pantalla.
//
// Recarga: `useFocusEffect` (en vez de `useEffect`) vuelve a leer cada vez
// que la pestaña toma foco (ya no se queda con la lectura vieja al volver de
// marcar/desmarcar un favorito en otra pantalla — causa de F13, "Sushi
// Libre" no aparecía hasta recargar la app entera). Como `useFocusEffect` ya
// corre también al montar (la pestaña está en foco desde el principio), no
// hace falta un `useEffect` aparte: así no se dispara la carga dos veces.
import { useCallback, useState } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native'
import { useFocusEffect, useRouter, useTheme } from 'expo-router'
import type { DisplayEvent } from '@qps/core/home/types'
import { Cargando, ErrorCarga, Vacio } from '@/components/EstadoCarga'
import { TarjetaEvento } from '@/components/TarjetaEvento'
import { obtenerFavoritos, rutaDeFavorito } from '@/lib/favoritos'
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
  // Estado de refresco aparte del de carga (28-c): mientras se refresca, la
  // grilla sigue a la vista en vez de pasar a `Cargando`.
  const [refrescando, setRefrescando] = useState(false)

  const cargar = useCallback(async () => {
    if (!userId) return
    setEstado({ tipo: 'cargando' })
    const resultado = await obtenerFavoritos(userId)
    setEstado(resultado.ok ? { tipo: 'ok', eventos: resultado.eventos } : { tipo: 'error', error: resultado.error })
  }, [userId])

  const refrescar = useCallback(async () => {
    if (!userId) return
    setRefrescando(true)
    const resultado = await obtenerFavoritos(userId)
    setEstado(resultado.ok ? { tipo: 'ok', eventos: resultado.eventos } : { tipo: 'error', error: resultado.error })
    setRefrescando(false)
  }, [userId])

  useFocusEffect(
    useCallback(() => {
      if (cargandoSesion) return
      cargar()
    }, [cargandoSesion, cargar]),
  )

  if (cargandoSesion) {
    return (
      <View style={[estilos.centrado, { backgroundColor: colors.background, flex: 1 }]}>
        <Cargando />
      </View>
    )
  }

  if (!userId) {
    // Sin sesión no hay nada propio que refrescar (28-c): esta pantalla no
    // lleva RefreshControl.
    return (
      <View style={[estilos.centrado, { backgroundColor: colors.background, flex: 1 }]}>
        <Vacio mensaje="Entrá para guardar tus favoritos" textoAccion="Ir a Cuenta" onAccion={() => router.push('/cuenta')} />
      </View>
    )
  }

  return (
    <View style={[estilos.contenedor, { backgroundColor: colors.background }]}>
      {estado.tipo === 'cargando' ? <Cargando /> : null}

      {estado.tipo === 'error' ? <ErrorCarga mensaje={estado.error} onReintentar={cargar} /> : null}

      {estado.tipo === 'ok' ? (
        <FlatList
          data={estado.eventos}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={estilos.filaGrilla}
          contentContainerStyle={estilos.lista}
          refreshControl={
            <RefreshControl refreshing={refrescando} onRefresh={refrescar} tintColor={colors.primary} colors={[colors.primary]} />
          }
          ListEmptyComponent={<Vacio mensaje="Todavía no guardaste ningún evento" />}
          renderItem={({ item }) => (
            <View style={estilos.celda}>
              {item.isCinemaMovie || item.isInstagramFlyer ? (
                // `TarjetaEvento` siempre navega a `/evento/<id>` (es la
                // tarjeta de Inicio/Buscar, donde todo es un evento real):
                // para una película o un flyer, un `Pressable` transparente
                // por encima intercepta el toque y lleva a la ruta correcta
                // (`/pelicula/<id>` o `/flyer/<id>`), sin tocar
                // components/TarjetaEvento.tsx (R29-b, en paralelo).
                <View style={estilos.celdaConToqueDistinto}>
                  <TarjetaEvento evento={item} />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={item.title}
                    onPress={() => router.push(rutaDeFavorito(item))}
                    style={StyleSheet.absoluteFill}
                  />
                </View>
              ) : (
                <TarjetaEvento evento={item} />
              )}
            </View>
          )}
        />
      ) : null}
    </View>
  )
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1 },
  centrado: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  lista: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  filaGrilla: { gap: 12 },
  // Ver el comentario del mismo nombre en app/(tabs)/index.tsx: evita que la
  // última celda de un número impar de eventos se estire a todo el ancho.
  celda: { flex: 1, maxWidth: '50%' },
  celdaConToqueDistinto: { flex: 1, position: 'relative' },
})
