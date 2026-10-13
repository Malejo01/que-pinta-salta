import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router'
import { useColorScheme } from 'react-native'
import { COLORES_CLARO, COLORES_OSCURO, construirTema } from '@/lib/theme'

// Tema con los colores de la web (24-a): sigue al sistema (useColorScheme).
const TEMA_CLARO = construirTema(DefaultTheme, COLORES_CLARO)
const TEMA_OSCURO = construirTema(DarkTheme, COLORES_OSCURO)

export default function RootLayout() {
  const scheme = useColorScheme()
  // 24-b: proveedor de sesión y Sentry
  return (
    <ThemeProvider value={scheme === 'dark' ? TEMA_OSCURO : TEMA_CLARO}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  )
}
