// Inicio (R25): los 4 atajos (Hoy · Esta noche · Finde · Semana) + el atajo
// "Cines", y la lista de eventos del atajo elegido. La Bienvenida se
// muestra antes de esto, una sola vez (lib/bienvenida.ts): mientras no se
// sepa si ya se vio, no se dibuja nada, y si no se vio, se redirige.
import { useCallback, useEffect, useState } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { Redirect, useRouter, useTheme } from 'expo-router'
import type { DisplayEvent } from '@qps/core/home/types'
import type { Atajo } from '@qps/core/home/atajos'
import { Cargando, ErrorCarga } from '@/components/EstadoCarga'
import { Icono } from '@/components/Icono'
import { TarjetaEvento } from '@/components/TarjetaEvento'
import { useBienvenidaVista } from '@/lib/bienvenida'
import { obtenerEventosDeAtajo } from '@/lib/datos/eventos'

const ATAJOS: Array<{ id: Atajo; etiqueta: string }> = [
  { id: 'hoy', etiqueta: 'Hoy' },
  { id: 'esta-noche', etiqueta: 'Esta noche' },
  { id: 'finde', etiqueta: 'Finde' },
  { id: 'semana', etiqueta: 'Semana' },
]

type EstadoLista =
  | { tipo: 'cargando' }
  | { tipo: 'error'; error: string }
  | { tipo: 'ok'; eventos: DisplayEvent[] }

export default function Inicio() {
  const { cargando: cargandoBienvenida, vista } = useBienvenidaVista()
  const { colors } = useTheme()
  const router = useRouter()
  const [atajo, setAtajo] = useState<Atajo>('hoy')
  const [estado, setEstado] = useState<EstadoLista>({ tipo: 'cargando' })
  // Estado de refresco aparte del de carga (28-c): mientras se refresca, la
  // grilla sigue a la vista en vez de pasar a `Cargando`.
  const [refrescando, setRefrescando] = useState(false)

  const cargar = useCallback(async () => {
    setEstado({ tipo: 'cargando' })
    const resultado = await obtenerEventosDeAtajo(atajo)
    setEstado(resultado.ok ? { tipo: 'ok', eventos: resultado.eventos } : { tipo: 'error', error: resultado.error })
  }, [atajo])

  const refrescar = useCallback(async () => {
    setRefrescando(true)
    const resultado = await obtenerEventosDeAtajo(atajo)
    setEstado(resultado.ok ? { tipo: 'ok', eventos: resultado.eventos } : { tipo: 'error', error: resultado.error })
    setRefrescando(false)
  }, [atajo])

  useEffect(() => {
    cargar()
  }, [cargar])

  if (cargandoBienvenida) return null
  if (!vista) return <Redirect href="/bienvenida" />

  return (
    <View style={[estilos.contenedor, { backgroundColor: colors.background }]}>
      <View style={estilos.filaAtajos}>
        {ATAJOS.map((item) => {
          const seleccionado = item.id === atajo
          return (
            <Pressable
              key={item.id}
              onPress={() => setAtajo(item.id)}
              style={[estilos.boton, { borderColor: colors.border }, seleccionado && { backgroundColor: colors.primary }]}
            >
              <Text style={[estilos.textoBoton, { color: seleccionado ? '#fff' : colors.text }]}>{item.etiqueta}</Text>
            </Pressable>
          )
        })}
        <Pressable
          onPress={() => router.push('/cines')}
          style={[estilos.boton, { borderColor: colors.border }]}
        >
          <Icono nombre={{ ios: 'film.fill', android: 'theaters' }} tamanio={16} color={colors.text} />
          <Text style={[estilos.textoBoton, { color: colors.text }]}>Cines</Text>
        </Pressable>
      </View>

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
          ListEmptyComponent={
            <Text style={[estilos.vacio, { color: colors.text }]}>No hay eventos para este momento.</Text>
          }
          renderItem={({ item }) => (
            <View style={estilos.celda}>
              <TarjetaEvento evento={item} />
            </View>
          )}
        />
      ) : null}
    </View>
  )
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1 },
  filaAtajos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 16 },
  boton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  textoBoton: { fontWeight: '600' },
  lista: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  vacio: { textAlign: 'center', marginTop: 24 },
  filaGrilla: { gap: 12 },
  // Con un número impar de eventos, la última celda queda sola en su fila:
  // sin `maxWidth`, al ser la única hija `flex: 1` de la fila, se estiraría
  // al ancho completo en vez de ocupar la mitad.
  celda: { flex: 1, maxWidth: '50%' },
})
