// Bienvenida (R25, decisión 2 de Mauro del 13/10): una sola pantalla, se
// muestra una vez. La redirige acá `app/(tabs)/index.tsx` mientras
// `useBienvenidaVista` diga que todavía no se vio. "Empezar" la marca como
// vista y vuelve a Inicio; "Entrar" la marca como vista y va a Cuenta.
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter, useTheme } from 'expo-router'
import LOGO_MARCA from '@/assets/logo-circular.png'
import { marcarBienvenidaVista } from '@/lib/bienvenida'

export default function Bienvenida() {
  const { colors } = useTheme()
  const router = useRouter()

  async function empezar() {
    await marcarBienvenidaVista()
    router.replace('/')
  }

  async function entrar() {
    await marcarBienvenidaVista()
    router.replace('/cuenta')
  }

  return (
    <View style={[estilos.contenedor, { backgroundColor: colors.background }]}>
      <Image source={LOGO_MARCA} style={estilos.logo} resizeMode="contain" />
      <Text style={[estilos.titulo, { color: colors.text }]}>Qué Pinta Salta</Text>
      <Text style={[estilos.linea, { color: colors.text }]}>
        Todo lo que pasa en Salta, en un solo lugar.
      </Text>
      <Pressable
        onPress={empezar}
        accessibilityRole="button"
        style={[estilos.boton, { backgroundColor: colors.primary }]}
      >
        <Text style={estilos.textoBoton}>Empezar</Text>
      </Pressable>
      <Pressable onPress={entrar} accessibilityRole="button" style={estilos.botonSecundario}>
        <Text style={[estilos.textoSecundario, { color: colors.text }]}>Entrar</Text>
      </Pressable>
    </View>
  )
}

const estilos = StyleSheet.create({
  contenedor: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  logo: { width: 120, height: 120, marginBottom: 8 },
  titulo: { fontFamily: 'Montserrat_700Bold', fontSize: 24, textAlign: 'center' },
  linea: { fontFamily: 'Montserrat_400Regular', fontSize: 15, textAlign: 'center', marginBottom: 16 },
  boton: {
    width: '100%',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  textoBoton: { fontFamily: 'Montserrat_600SemiBold', color: '#fff', fontSize: 16 },
  botonSecundario: { paddingVertical: 10 },
  textoSecundario: { fontFamily: 'Montserrat_600SemiBold', fontSize: 15 },
})
