import { DarkTheme, Stack, ThemeProvider, type ErrorBoundaryProps } from 'expo-router'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import * as Sentry from '@sentry/react-native'
import { useFonts } from 'expo-font'
import LOGO_MARCA from '@/assets/logo-circular.png'
// Por subpath, no por el barrel (`@expo-google-fonts/montserrat`): el barrel
// hace require() de las 18 variantes (9 pesos × normal/itálica) aunque solo
// se usen 3, y eso infla el export de Android (~6 MB vs. ~1 MB). Cada
// subpath existe en la 0.4.2 instalada (confirmado en node_modules) y trae
// solo su propio .ttf.
import { Montserrat_400Regular } from '@expo-google-fonts/montserrat/400Regular'
import { Montserrat_600SemiBold } from '@expo-google-fonts/montserrat/600SemiBold'
import { Montserrat_700Bold } from '@expo-google-fonts/montserrat/700Bold'
import { COLORES_OSCURO, construirTema } from '@/lib/theme'
import { leerEnv } from '@/lib/env'
import { inicializarSentry } from '@/lib/sentry'
import { SessionProvider } from '@/lib/session'
import { PushProvider } from '@/lib/push'
import { ManejadorTapPush } from '@/components/ManejadorTapPush'

// Tema con los colores de la web (24-a) y, desde 29-g, con `fonts` en
// Montserrat (ver `construirTema`). D1 (29-g, decisión de Mauro): la app
// arranca siempre en oscuro, como la web; no hay tema claro acá ni nada que
// lea el esquema de color del sistema en este archivo (ni acá ni en el
// `ErrorBoundary`, de abajo, que antes de 29-g sí lo leía). El selector de
// tema va después.
const TEMA_OSCURO = construirTema(DarkTheme, COLORES_OSCURO)

// Sentry detrás de EXPO_PUBLIC_SENTRY_DSN (R24): se inicializa una sola vez,
// al cargar el módulo. Sin DSN, `sentryActivo` queda en `false` y no se
// envuelve la app con Sentry.wrap.
const sentryActivo = inicializarSentry(leerEnv().sentryDsn)

/**
 * Pantalla de error de todo el árbol de rutas (expo-router la usa en vez de
 * la pantalla en blanco cuando algo debajo del Stack tira). Nunca muestra
 * `error.message` (puede traer datos); si Sentry está activo, `Sentry.wrap`
 * ya capturó el error, así que acá no se llama a `captureException` a mano.
 * Puede renderizarse fuera del `ThemeProvider` (por eso usa los tokens de
 * color directamente, no `useTheme`); D1 (29-g): siempre oscuro, como el
 * resto de la app, así que usa `COLORES_OSCURO` fijo, sin leer el esquema
 * de color del sistema.
 */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  const colores = COLORES_OSCURO

  return (
    <View style={[estilosError.contenedor, { backgroundColor: colores.background }]}>
      <Image source={LOGO_MARCA} style={estilosError.logo} resizeMode="contain" />
      <Text style={[estilosError.titulo, { color: colores.foreground }]}>Qué Pinta Salta</Text>
      <Text style={[estilosError.mensaje, { color: colores.foreground }]}>Algo salió mal.</Text>
      <Text style={[estilosError.submensaje, { color: colores.mutedForeground }]}>
        Volvé a intentar en un momento.
      </Text>
      <Pressable
        onPress={retry}
        accessibilityRole="button"
        style={[estilosError.boton, { backgroundColor: colores.primary }]}
      >
        <Text style={[estilosError.textoBoton, { color: colores.primaryForeground }]}>Reintentar</Text>
      </Pressable>
    </View>
  )
}

const estilosError = StyleSheet.create({
  contenedor: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  logo: { width: 96, height: 96, marginBottom: 8 },
  titulo: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  mensaje: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  submensaje: { fontSize: 14, textAlign: 'center', marginBottom: 12 },
  boton: { borderRadius: 8, paddingVertical: 12, paddingHorizontal: 24 },
  textoBoton: { fontSize: 15, fontWeight: '600' },
})

function RootLayout() {
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
      {/* Ronda 41 (41-c/41-d): `PushProvider` lee `useSession()` por dentro,
          así que va adentro de `SessionProvider`. */}
      <PushProvider>
        <ThemeProvider value={TEMA_OSCURO}>
          {/* D1 (QPS-148): barra de estado clara (íconos blancos) sobre el
              fondo oscuro, fija en "light" porque la app arranca siempre
              oscura (no hay selector de tema todavía). El día que exista un
              selector de tema, este `style` tiene que dejar de ser fijo y
              seguir a ese tema (igual que `TEMA_OSCURO`, arriba). */}
          <StatusBar style="light" />
          {/* Sin interfaz propia: registra el handler de avisos en primer
              plano y navega a la ficha cuando se toca un push (41-d). */}
          <ManejadorTapPush />
          <Stack>
            <Stack.Screen name="bienvenida" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack>
        </ThemeProvider>
      </PushProvider>
    </SessionProvider>
  )
}

export default sentryActivo ? Sentry.wrap(RootLayout) : RootLayout
