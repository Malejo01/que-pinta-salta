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
const config: ExpoConfig = {
  name: 'Qué Pinta Salta',
  slug: 'que-pinta-salta',
  version: '0.1.0',
  scheme: 'quepintasalta',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  android: {
    package: 'ar.com.quepintasalta.app',
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
  plugins: ['expo-router', 'expo-secure-store', '@react-native-google-signin/google-signin', '@sentry/react-native/expo'],
  experiments: { typedRoutes: true },
  extra: {
    // [COMPLETAR: Project ID de EAS, paso 1 de "Lo que tenés que hacer vos" en el plan de la R24.]
    eas: { projectId: process.env.EAS_PROJECT_ID || undefined },
  },
}

export default config
