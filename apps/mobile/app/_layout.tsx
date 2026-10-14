import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router'
import { useColorScheme } from 'react-native'
import * as Sentry from '@sentry/react-native'
import { useFonts } from 'expo-font'
// Por subpath, no por el barrel (`@expo-google-fonts/montserrat`): el barrel
// hace require() de las 18 variantes (9 pesos × normal/itálica) aunque solo
// se usen 3, y eso infla el export de Android (~6 MB vs. ~1 MB). Cada
// subpath existe en la 0.4.2 instalada (confirmado en node_modules) y trae
// solo su propio .ttf.
import { Montserrat_400Regular } from '@expo-google-fonts/montserrat/400Regular'
import { Montserrat_600SemiBold } from '@expo-google-fonts/montserrat/600SemiBold'
import { Montserrat_700Bold } from '@expo-google-fonts/montserrat/700Bold'
import { COLORES_CLARO, COLORES_OSCURO, construirTema } from '@/lib/theme'
import { leerEnv } from '@/lib/env'
import { inicializarSentry } from '@/lib/sentry'
import { SessionProvider } from '@/lib/session'

// Tema con los colores de la web (24-a): sigue al sistema (useColorScheme).
const TEMA_CLARO = construirTema(DefaultTheme, COLORES_CLARO)
const TEMA_OSCURO = construirTema(DarkTheme, COLORES_OSCURO)

// Sentry detrás de EXPO_PUBLIC_SENTRY_DSN (R24): se inicializa una sola vez,
// al cargar el módulo. Sin DSN, `sentryActivo` queda en `false` y no se
// envuelve la app con Sentry.wrap.
const sentryActivo = inicializarSentry(leerEnv().sentryDsn)

function RootLayout() {
  const scheme = useColorScheme()
  // Montserrat (R25, decisión 3 de Mauro): nada de Yellowtail ni Poppins, el
  // logo va como imagen (assets/logo-circular.png). Mientras carga (o si
  // falla), el layout no se rompe: se devuelve `null` y la splash nativa
  // queda como está hasta que termine.
  const [fontsLoaded, fontError] = useFonts({
    Montserrat_400Regular,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
  })

  if (!fontsLoaded && !fontError) {
    return null
  }

  return (
    <SessionProvider>
      <ThemeProvider value={scheme === 'dark' ? TEMA_OSCURO : TEMA_CLARO}>
        <Stack>
          <Stack.Screen name="bienvenida" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </ThemeProvider>
    </SessionProvider>
  )
}

export default sentryActivo ? Sentry.wrap(RootLayout) : RootLayout
