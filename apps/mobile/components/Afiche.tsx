// Afiche de un evento o de una película de cine (R25, punto 2 de 25-b).
// Decide con `urlDeImagenSegura` (pura, en lib/imagenes/) si la URL es de
// nuestro Storage: si lo es, se pide la variante WebP 400 con `Image` de
// React Native (nunca `expo-image`, que no está aprobada); si no, se
// muestra un espacio vacío con la marca (el mismo `logo-circular.png` de la
// Bienvenida), sin pedirle nada al host del tercero.
import { Image, StyleSheet, View } from 'react-native'
import { useTheme } from 'expo-router'
import { leerEnv } from '@/lib/env'
import { urlDeImagenSegura } from '@/lib/imagenes/url-segura'
import LOGO_MARCA from '@/assets/logo-circular.png'

// Solo el tamaño: así el mismo valor sirve para el `<View>` de la marca
// (espera ViewStyle) y para el `<Image>` (espera ImageStyle) sin pelearse
// con sus diferencias de tipos (por ejemplo `overflow`).
export interface AficheEstilo {
  width?: number
  height?: number
  borderRadius?: number
}

export interface AficheProps {
  url: string | null | undefined
  estilo?: AficheEstilo
}

export function Afiche({ url, estilo }: AficheProps) {
  const { colors } = useTheme()
  const supabaseUrl = leerEnv().supabase?.url ?? null
  const urlSegura = urlDeImagenSegura(url, supabaseUrl)

  if (!urlSegura) {
    return (
      <View style={[estilos.marca, { backgroundColor: colors.card, borderColor: colors.border }, estilo]}>
        <Image source={LOGO_MARCA} style={estilos.logo} resizeMode="contain" />
      </View>
    )
  }

  return <Image source={{ uri: urlSegura }} style={[estilos.imagen, estilo]} resizeMode="cover" />
}

const estilos = StyleSheet.create({
  imagen: { width: 64, height: 64, borderRadius: 8 },
  marca: {
    width: 64,
    height: 64,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { width: 32, height: 32, opacity: 0.6 },
})
