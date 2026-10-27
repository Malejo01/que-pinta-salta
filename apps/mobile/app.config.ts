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
export type Plugin = string | [string, Record<string, unknown>]

/** `oklchToHex('oklch(0.59 0.2 25)')`, el primario del tema oscuro (73-a). */
export const COLOR_NOTIFICACION = '#db373a'

/**
 * Textos de permiso (chore/deps-app-v1, 17/10). En Android el diálogo de
 * notificaciones y el de calendario son del sistema; estos textos son los de
 * iOS, en español, para que nada quede con el inglés por defecto.
 */
export const TEXTO_PERMISO_CALENDARIO =
  'Qué Pinta Salta usa tu calendario solo para agregar los eventos que elegís.'

/**
 * expo-location (chore/deps-etapa-2, 18/10): solo "mientras se usa". El
 * permiso se pide recién al tocar "Cerca mío" (R55); nada de ubicación en
 * segundo plano. Este texto es el de iOS; en Android el diálogo es del sistema.
 */
export const TEXTO_PERMISO_UBICACION =
  'Qué Pinta Salta usa tu ubicación solo cuando tocás "Cerca mío", para mostrarte los eventos que tenés más cerca.'

/**
 * AdMob (chore/deps-etapa-2, 18/10). Los ID reales de la app los carga Mauro
 * en EAS como EXPO_PUBLIC_ADMOB_ANDROID_APP_ID / EXPO_PUBLIC_ADMOB_IOS_APP_ID.
 * Sin ellos van los ID de prueba oficiales de Google (developers.google.com/
 * admob/android/quick-start y /ios/quick-start): sin ningún ID, el SDK
 * nativo cierra la app al arrancar. Un ID de app no es un secreto (va en el
 * AndroidManifest de cualquier APK).
 */
export const ADMOB_ANDROID_APP_ID_PRUEBA = 'ca-app-pub-3940256099942544~3347511713'
export const ADMOB_IOS_APP_ID_PRUEBA = 'ca-app-pub-3940256099942544~1458002511'

export function admobAppIds(env: Record<string, string | undefined>): { androidAppId: string; iosAppId: string } {
  return {
    androidAppId: env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID?.trim() || ADMOB_ANDROID_APP_ID_PRUEBA,
    iosAppId: env.EXPO_PUBLIC_ADMOB_IOS_APP_ID?.trim() || ADMOB_IOS_APP_ID_PRUEBA,
  }
}

export function plugins(env: Record<string, string | undefined>): Plugin[] {
  const base: Plugin[] = [
    'expo-router',
    'expo-secure-store',
    '@react-native-google-signin/google-signin',
    // R41: avisos push. Sin ícono propio todavía (Android usa el de la app);
    // el color es el `primary` del tema oscuro (lib/theme.ts) en hex: la
    // config no importa lib/ (la evalúa EAS), y tests/config.test.ts exige
    // que coincidan.
    ['expo-notifications', { color: COLOR_NOTIFICACION }],
    // R42: "Agregar al calendario". Solo escribe: el permiso se pide al tocar.
    [
      'expo-calendar',
      { calendarPermission: TEXTO_PERMISO_CALENDARIO, writeOnlyCalendarPermission: TEXTO_PERMISO_CALENDARIO },
    ],
    // expo-sharing (R42) NO lleva plugin: el plugin es para RECIBIR lo que
    // otra app comparte (share extension / intent filters), y la app solo
    // comparte hacia afuera con shareAsync, que no lo necesita.
    // R54/R55: mapa con MapLibre. Sin opciones: motor de ubicación "default"
    // (el de MapLibre, sin Google Play Services de ubicación).
    '@maplibre/maplibre-react-native',
    // R55: "Cerca mío". Solo "mientras se usa": los textos de "siempre" se
    // borran del Info.plist (false) y en Android no entran
    // ACCESS_BACKGROUND_LOCATION ni el servicio en primer plano.
    [
      'expo-location',
      {
        locationWhenInUsePermission: TEXTO_PERMISO_UBICACION,
        locationAlwaysAndWhenInUsePermission: false,
        locationAlwaysPermission: false,
        motionUsagePermission: false,
        isIosBackgroundLocationEnabled: false,
        isAndroidBackgroundLocationEnabled: false,
        isAndroidForegroundServiceEnabled: false,
      },
    ],
    // R52: AdMob + UMP. delayAppMeasurementInit: la medición de Google no
    // arranca hasta que la app inicialice el SDK, después del consentimiento
    // UMP (lo recomienda la doc de la librería, "European user consent").
    ['react-native-google-mobile-ads', { ...admobAppIds(env), delayAppMeasurementInit: true }],
  ]
  return env.SENTRY_AUTH_TOKEN?.trim() ? [...base, '@sentry/react-native/expo'] : base
}

/**
 * `google-services.json` (Firebase, para el token de push de Android) no va
 * al repo: EAS lo monta desde la variable de tipo archivo
 * `GOOGLE_SERVICES_JSON` (ops/push-firebase-pasos.md). Sin la variable, el
 * build sale sin Firebase y la app anda igual: el registro del token falla
 * con gracia (R41).
 */
export function googleServicesFile(env: Record<string, string | undefined>): string | undefined {
  return env.GOOGLE_SERVICES_JSON?.trim() || undefined
}

const config: ExpoConfig = {
  name: 'Qué Pinta Salta',
  slug: 'que-pinta-salta',
  version: '0.1.0',
  scheme: 'quepintasalta',
  orientation: 'portrait',
  // D1 (29-g, decisión de Mauro): la app arranca siempre en oscuro, como la
  // web (apps/web/app/layout.tsx, defaultTheme="dark"). El selector de tema
  // va después; por ahora no hay 'automatic' ni modo claro.
  userInterfaceStyle: 'dark',
  icon: './assets/icon.png',
  android: {
    package: 'ar.com.quepintasalta.app',
    ...(googleServicesFile(process.env) ? { googleServicesFile: googleServicesFile(process.env) } : {}),
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
    // 28-c: EAS define `EAS_BUILD_PROFILE` en el build con el nombre del
    // perfil (`preview`/`production`); fuera de un build de EAS, 'local'.
    // Nada más entra en `extra`: `lib/version.ts` valida esto de nuevo
    // igual (nunca confía en que esto solo alcance).
    entorno: process.env.EAS_BUILD_PROFILE?.trim() || 'local',
  },
}

export default config
