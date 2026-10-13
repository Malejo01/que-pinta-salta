import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router'
import { useColorScheme } from 'react-native'
import * as Sentry from '@sentry/react-native'
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
  return (
    <SessionProvider>
      <ThemeProvider value={scheme === 'dark' ? TEMA_OSCURO : TEMA_CLARO}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </ThemeProvider>
    </SessionProvider>
  )
}

export default sentryActivo ? Sentry.wrap(RootLayout) : RootLayout
