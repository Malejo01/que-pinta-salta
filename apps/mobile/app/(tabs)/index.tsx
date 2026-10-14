// Inicio (R25): los 4 atajos (Hoy · Esta noche · Finde · Semana) + el atajo
// "Cines", y la lista de eventos del atajo elegido. La Bienvenida se
// muestra antes de esto, una sola vez (lib/bienvenida.ts): mientras no se
// sepa si ya se vio, no se dibuja nada, y si no se vio, se redirige.
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { Redirect, useRouter, useTheme } from 'expo-router'
import type { DisplayEvent } from '@qps/core/home/types'
import type { Atajo } from '@qps/core/home/atajos'
import { Afiche } from '@/components/Afiche'
import { Icono } from '@/components/Icono'
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

  const cargar = useCallback(async () => {
    setEstado({ tipo: 'cargando' })
    const resultado = await obtenerEventosDeAtajo(atajo)
    setEstado(resultado.ok ? { tipo: 'ok', eventos: resultado.eventos } : { tipo: 'error', error: resultado.error })
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
            <Text style={[estilos.vacio, { color: colors.text }]}>No hay eventos para este momento.</Text>
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
  espaciado: { marginTop: 24 },
  centrado: { alignItems: 'center', marginTop: 24, paddingHorizontal: 24 },
  lista: { padding: 16, gap: 12 },
  vacio: { textAlign: 'center', marginTop: 24 },
  fila: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  filaTexto: { flex: 1, gap: 2 },
  tituloEvento: { fontWeight: '600', fontSize: 15 },
  afiche: { width: 64, height: 64 },
})
