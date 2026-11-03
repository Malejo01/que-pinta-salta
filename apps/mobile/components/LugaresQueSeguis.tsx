// Q5-6 · «Lugares que seguís» en Mis eventos: los lugares seguidos (los
// mismos de Cuenta › Lo que seguís), cada uno abre su ficha en la web
// (`urlFichaLugarWeb`, la ficha /lugar de Q5-5). Se recarga al volver a la
// pestaña. Sin lugares, una línea que explica cómo seguir uno. Con error, no
// se dibuja (Mis eventos sigue con los guardados).
import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import * as Linking from 'expo-linking'
import { Icono } from '@/components/Icono'
import { Texto } from '@/components/Texto'
import { useColoresQPS } from '@/lib/colores'
import { urlFichaLugarWeb } from '@/lib/links'
import { obtenerLoQueSeguis } from '@/lib/radar'

export const TITULO_LUGARES_QUE_SEGUIS = 'Lugares que seguís'
export const TEXTO_SIN_LUGARES_SEGUIDOS = 'Todavía no seguís ningún lugar. Tocá «Seguir» en la ficha de un evento y te avisamos cuando anuncie algo nuevo.'

export function LugaresQueSeguis({ userId }: { userId: string }) {
  const colores = useColoresQPS()
  const [lugares, setLugares] = useState<{ id: string; nombre: string }[] | null>(null)

  useFocusEffect(
    useCallback(() => {
      let vigente = true
      obtenerLoQueSeguis(userId).then((r) => {
        if (vigente) setLugares([...r.lugares].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
      })
      return () => {
        vigente = false
      }
    }, [userId]),
  )

  if (lugares === null) return null

  return (
    <View style={estilos.seccion}>
      <Texto peso="bold" accessibilityRole="header" style={estilos.titulo}>
        {TITULO_LUGARES_QUE_SEGUIS}
      </Texto>
      {lugares.length === 0 ? (
        <Texto tono="secundario">{TEXTO_SIN_LUGARES_SEGUIDOS}</Texto>
      ) : (
        lugares.map((lugar) => {
          const url = urlFichaLugarWeb(lugar.id)
          const abrir = () => {
            if (url) void Linking.openURL(url).catch(() => {})
          }
          return (
            <Pressable
              key={lugar.id}
              onPress={abrir}
              accessibilityRole="link"
              accessibilityLabel={`${lugar.nombre}: ver la ficha del lugar`}
              style={[estilos.filaLugar, { borderColor: colores.border, backgroundColor: colores.card }]}
            >
              <Icono nombre="MapPin" tamanio={16} color={colores.primary} />
              <Texto peso="semibold" style={estilos.nombre}>
                {lugar.nombre}
              </Texto>
              <Icono nombre="ExternalLink" tamanio={14} color={colores.mutedForeground} />
            </Pressable>
          )
        })
      )}
    </View>
  )
}

const estilos = StyleSheet.create({
  seccion: { gap: 8, paddingVertical: 16 },
  titulo: { fontSize: 18 },
  filaLugar: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  nombre: { flex: 1 },
})
