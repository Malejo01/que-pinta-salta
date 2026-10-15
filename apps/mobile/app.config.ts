import type { ExpoConfig } from 'expo/config'

/**
 * Configuración de la app (R24, fase 0). Ninguna clave va escrita acá: lo que
 * la app necesita en tiempo de ejecución entra por EXPO_PUBLIC_* (las carga
 * Mauro en EAS o en apps/mobile/.env.local). `config:public` no puede mostrar
 * ningún secreto: lo controla tests/config.test.ts.
 *
 * El paquete de Android es el de la R23 (apps/web/lib/config/app-links.ts,
 * ANDROID_PACKAGE). Es para siempre: tests/config.test.ts exige que coincidan.
 */

/** Proyecto de EAS (expo.dev, slug `que-pinta-salta`). Es público (QPS-143). */
export const EAS_PROJECT_ID = '3250542d-0b86-496f-832d-e4d19457070b'

/** El crema del fondo de assets/logo-circular.png. */
const CREMA_LOGO = '#FCF4EA'

/**
 * El plugin de Sentry engancha `sentry.gradle`, que sube los source maps al
 * final del build y lo tumba si no hay token. Entra solo cuando el entorno de
 * EAS tiene `SENTRY_AUTH_TOKEN` (y entonces también `SENTRY_ORG` y
 * `SENTRY_PROJECT`, que el plugin lee como respaldo). Sin el plugin, el SDK
 * igual se inicializa con `EXPO_PUBLIC_SENTRY_DSN`: lo único que falta son los
 * source maps (QPS-143).
 */
export function plugins(env: Record<string, string | undefined>): string[] {
  const base = ['expo-router', 'expo-secure-store', '@react-native-google-signin/google-signin']
  return env.SENTRY_AUTH_TOKEN?.trim() ? [...base, '@sentry/react-native/expo'] : base
}

const config: ExpoConfig = {
  name: 'Qué Pinta Salta',
  slug: 'que-pinta-salta',
  version: '0.1.0',
  scheme: 'quepintasalta',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  android: {
    package: 'ar.com.quepintasalta.app',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: CREMA_LOGO,
    },
    // App Links: Android abre estos links en la app recién cuando
    // /.well-known/assetlinks.json tenga la huella del certificado (R23).
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: 'www.quepintasalta.com.ar', pathPrefix: '/evento/' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  plugins: plugins(process.env),
  experiments: { typedRoutes: true },
  extra: {
    // Fijo y no por variable: en el build remoto la config se evalúa en el
    // servidor de EAS, donde no hay ningún EAS_PROJECT_ID.
    eas: { projectId: EAS_PROJECT_ID },
  },
}

export default config
