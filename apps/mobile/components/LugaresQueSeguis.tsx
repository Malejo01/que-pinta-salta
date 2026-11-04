// Q5-6 · «Lugares que seguís» en Mis eventos: los lugares seguidos (los
// mismos de Cuenta › Lo que seguís), cada uno abre su ficha en la web
// (`urlFichaLugarWeb`, la ficha /lugar de Q5-5). Se recarga al volver a la
// pestaña. Sin lugares, una línea que explica cómo seguir uno. Con error, no
// se dibuja (Mis eventos sigue con los guardados). R-1: antes, con error, se
// leía con `obtenerLoQueSeguis` (que da `[]` si falla) y decía «Todavía no
// seguís ningún lugar»; ahora `obtenerLugaresQueSeguis` devuelve `null`.
import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import * as Linking from 'expo-linking'
import { Icono } from '@/components/Icono'
import { Texto } from '@/components/Texto'
import { useColoresQPS } from '@/lib/colores'
import { urlFichaLugarWeb } from '@/lib/links'
import { obtenerLugaresQueSeguis } from '@/lib/radar'
import { useTextos } from '@/lib/i18n'
import { es } from '@/lib/i18n/diccionarios/es'

// Q6-1: los textos viven en el diccionario (`misEventos`); estas constantes son el castellano.
export const TITULO_LUGARES_QUE_SEGUIS = es.misEventos.lugaresQueSeguis
export const TEXTO_SIN_LUGARES_SEGUIDOS = es.misEventos.sinLugares

export function LugaresQueSeguis({ userId }: { userId: string }) {
  const colores = useColoresQPS()
  const t = useTextos().misEventos
  const [lugares, setLugares] = useState<{ id: string; nombre: string }[] | null>(null)

  useFocusEffect(
    useCallback(() => {
      let vigente = true
      void obtenerLugaresQueSeguis(userId).then((r) => {
        if (vigente) setLugares(r === null ? null : [...r].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
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
        {t.lugaresQueSeguis}
      </Texto>
      {lugares.length === 0 ? (
        <Texto tono="secundario">{t.sinLugares}</Texto>
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
              accessibilityLabel={t.verFichaDelLugar(lugar.nombre)}
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
