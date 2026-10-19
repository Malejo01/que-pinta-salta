// Ficha mínima de un flyer de Instagram guardado en Favoritos (R29, 29-a:
// F13, decisión 1 del plan). Mismo patrón de estados que
// `app/pelicula/[id].tsx` (cargando, error con "Reintentar", "no
// encontrado"). Solo la imagen, el nombre de la cuenta, la fecha (si la
// tiene) y "Ver en Instagram" (solo si hay link y es https — la validación
// vive en `lib/datos/flyers.ts`, junto con la apertura real).
//
// 33-d (QPS-154): base visual de la ronda 29 — `Texto` en vez de `Text` de
// react-native, `useColoresQPS()` en vez de `useTheme()` crudo de
// expo-router (mismo patrón que `app/pelicula/[id].tsx`). No se agrega
// ningún ícono: la pantalla no tenía ninguno antes de esta tarea (lo que se
// ve y lo que hace no cambia, salvo tipografía y tokens de color).
import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { formatEventDateShort } from '@qps/core/date-format'
import { Afiche } from '@/components/Afiche'
import { Cargando, ErrorCarga, Vacio } from '@/components/EstadoCarga'
import { Texto } from '@/components/Texto'
import { useColoresQPS, type ColoresQPS } from '@/lib/colores'
import { abrirPostDeInstagram, obtenerFlyerPorId, urlInstagramSegura, type FlyerFicha } from '@/lib/datos/flyers'

type Estado = { tipo: 'cargando' } | { tipo: 'error'; error: string } | { tipo: 'no-encontrado' } | { tipo: 'ok'; flyer: FlyerFicha }

export default function FlyerPorId() {
  const { id } = useLocalSearchParams<{ id: string }>()
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
    <View style={[estilos.contenedor, { backgroundColor: colores.background }]}>
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

      {estado.tipo === 'ok' ? <Ficha flyer={estado.flyer} colores={colores} /> : null}
    </View>
  )
}

function Ficha({ flyer, colores }: { flyer: FlyerFicha; colores: ColoresQPS }) {
  const urlSegura = urlInstagramSegura(flyer.ig_post_url)

  return (
    <ScrollView contentContainerStyle={estilos.contenido}>
      <View style={estilos.contenedorAfiche}>
        <Afiche url={flyer.storage_image_url || flyer.original_image_url} llenar />
      </View>

      <Texto peso="bold" style={estilos.titulo}>
        {flyer.account.display_name}
      </Texto>

      {flyer.published_at ? <Texto tono="secundario">{formatEventDateShort(flyer.published_at)}</Texto> : null}

      {urlSegura ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => abrirPostDeInstagram(flyer.ig_post_url)}
          style={({ pressed }) => [estilos.boton, { borderColor: colores.primary, opacity: pressed ? 0.6 : 1 }]}
        >
          {/* Ronda 49 (QPS-241, grupo 2): `primary` da 3,83 sobre `background`
              como texto chico, abajo del mínimo de "texto" (4,5) — se deja de
              usar ahí. El borde del botón (`estilos.boton`, arriba) sigue en
              `colores.primary`: ahí es un componente (mínimo 3), no texto. */}
          <Texto peso="semibold">
            Ver en Instagram
          </Texto>
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
  titulo: { fontSize: 22 },
  boton: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start', marginTop: 4 },
})
