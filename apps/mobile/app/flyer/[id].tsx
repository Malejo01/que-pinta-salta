// Ficha mínima de un flyer de Instagram guardado en Favoritos (R29, 29-a:
// F13, decisión 1 del plan). Mismo patrón de estados que
// `app/pelicula/[id].tsx` (cargando, error con "Reintentar", "no
// encontrado"). Solo la imagen, el nombre de la cuenta, la fecha (si la
// tiene) y "Ver en Instagram" (solo si hay link y es https — la validación
// vive en `lib/datos/flyers.ts`, junto con la apertura real).
import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View, type ColorValue } from 'react-native'
import { Stack, useLocalSearchParams, useRouter, useTheme } from 'expo-router'
import { formatEventDateShort } from '@qps/core/date-format'
import { Afiche } from '@/components/Afiche'
import { Cargando, ErrorCarga, Vacio } from '@/components/EstadoCarga'
import { useColoresQPS } from '@/lib/colores'
import { abrirPostDeInstagram, obtenerFlyerPorId, urlInstagramSegura, type FlyerFicha } from '@/lib/datos/flyers'

type Estado = { tipo: 'cargando' } | { tipo: 'error'; error: string } | { tipo: 'no-encontrado' } | { tipo: 'ok'; flyer: FlyerFicha }

export default function FlyerPorId() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { colors } = useTheme()
  const colores = useColoresQPS()
  const router = useRouter()

  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  // Bandera de "reintento" (mismo patrón que app/pelicula/[id].tsx, 28-l): el
  // `setState` sincrónico de la carga inicial no puede ir en el cuerpo del
  // efecto (lint react-hooks/set-state-in-effect); "Reintentar" cambia esta
  // bandera para que el efecto se repita.
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let cancelado = false

    obtenerFlyerPorId(id).then((resultado) => {
      if (cancelado) return
      setEstado(resultado.tipo === 'ok' ? { tipo: 'ok', flyer: resultado.flyer } : resultado)
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
      <Stack.Screen options={{ title: 'Flyer' }} />

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

      {estado.tipo === 'no-encontrado' ? (
        <View style={estilos.centrado}>
          <Vacio mensaje="Este flyer ya no está disponible." textoAccion="Volver" onAccion={() => router.back()} />
        </View>
      ) : null}

      {estado.tipo === 'ok' ? <Ficha flyer={estado.flyer} colores={colores} textoColor={colors.text} /> : null}
    </View>
  )
}

function Ficha({
  flyer,
  colores,
  textoColor,
}: {
  flyer: FlyerFicha
  colores: ReturnType<typeof useColoresQPS>
  textoColor: ColorValue
}) {
  const urlSegura = urlInstagramSegura(flyer.ig_post_url)

  return (
    <ScrollView contentContainerStyle={estilos.contenido}>
      <View style={estilos.contenedorAfiche}>
        <Afiche url={flyer.storage_image_url || flyer.original_image_url} llenar />
      </View>

      <Text style={[estilos.titulo, { color: textoColor }]}>{flyer.account.display_name}</Text>

      {flyer.published_at ? (
        <Text style={{ color: colores.mutedForeground }}>{formatEventDateShort(flyer.published_at)}</Text>
      ) : null}

      {urlSegura ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => abrirPostDeInstagram(flyer.ig_post_url)}
          style={({ pressed }) => [estilos.boton, { borderColor: colores.primary, opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={{ color: colores.primary, fontWeight: '600' }}>Ver en Instagram</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  )
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1 },
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  contenido: { padding: 16, gap: 12 },
  contenedorAfiche: { width: '100%', aspectRatio: 3 / 4, borderRadius: 12, overflow: 'hidden' },
  titulo: { fontSize: 22, fontWeight: '700' },
  boton: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start', marginTop: 4 },
})
