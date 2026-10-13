import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router'
import { useColorScheme } from 'react-native'

// Esqueleto de la fase 0 (R24): el tema con los colores de la web, la sesión y
// Sentry los agregan las tareas 24-a y 24-b.
export default function RootLayout() {
  const scheme = useColorScheme()
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  )
}
