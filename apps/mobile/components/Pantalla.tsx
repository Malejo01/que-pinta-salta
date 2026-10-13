import { useTheme } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'

/**
 * Pantalla de lugar del esqueleto: el contenido real llega en las noches 9 a
 * 11. Usa los colores del tema (24-a: claro/oscuro con los colores de la
 * web), para que el modo oscuro también se vea en estas pantallas de lugar.
 */
export function Pantalla({ titulo }: { titulo: string }) {
  const { colors } = useTheme()
  return (
    <View style={[styles.contenedor, { backgroundColor: colors.background }]}>
      <Text style={{ color: colors.text }}>{titulo}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
