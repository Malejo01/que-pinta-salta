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
/**
 * Q4-8: permisos que el manifiesto final NO puede tener. La ubicación precisa
 * (FINE) y la de segundo plano: alcanza con ACCESS_COARSE_LOCATION.
 */
export const PERMISOS_BLOQUEADOS = [
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
]

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

/**
 * Q7-5 · Peso de la app: R8 (minify) y `shrinkResources` en el build de
 * release, con `expo-build-properties`. R8 puede romper librerías nativas en
 * release y no hay forma de validarlo sin un build, así que va DETRÁS de una
 * variable: solo con `QPS_R8=1`, que pone el perfil `production-r8` de
 * `eas.json`. El perfil `production` sale igual que el build 9, para
 * comparar los dos.
 */
export function r8Activado(env: Record<string, string | undefined>): boolean {
  return env.QPS_R8?.trim() === '1'
}

/**
 * Reglas de R8 que se suman a `android/app/proguard-rules.pro` (que ya trae
 * las de React Native y Hermes). Cada librería que se llama por JNI o por
 * reflexión desde el puente de React Native y NO trae reglas de consumidor en
 * su AAR se conserva entera; las que sí traen (expo-modules-core,
 * expo-notifications, react-native-svg, reanimated, los SDK de Google Play
 * Services y el de Sentry para Android) se repiten acá solo cuando la
 * librería lo recomienda en su documentación. Mejor unos KB de más que un
 * cierre en release.
 */
export const REGLAS_PROGUARD = [
  '# Q7-5 · reglas propias (apps/mobile/app.config.ts, REGLAS_PROGUARD)',
  '# MapLibre: el SDK nativo usa JNI; maplibre-react-native no trae reglas de consumidor.',
  '-keep class org.maplibre.android.** { *; }',
  '-keep class org.maplibre.reactnative.** { *; }',
  '-dontwarn org.maplibre.**',
  '# Sentry: el puente de React Native (el SDK de Android ya trae sus reglas).',
  '-keep class io.sentry.react.** { *; }',
  '# Google Sign-In: el módulo de React Native.',
  '-keep class com.reactnativegooglesignin.** { *; }',
  '# expo-notifications (ya trae esta regla; se repite por si cambia) y el servicio de Firebase.',
  '-keep class expo.modules.notifications.** { *; }',
  '-keep class com.google.firebase.messaging.FirebaseMessagingService { *; }',
  '# AdMob: el módulo de React Native y la UMP (consentimiento).',
  '-keep class io.invertase.googlemobileads.** { *; }',
  '-keep class com.google.android.ump.** { *; }',
  '# react-native-svg (lo pide su README) y react-native-view-shot.',
  '-keep public class com.horcrux.svg.** { *; }',
  '-keep class fr.greweb.reactnativeviewshot.** { *; }',
  '# AsyncStorage.',
  '-keep class com.reactnativecommunity.asyncstorage.** { *; }',
].join('\n')

/**
 * Sin `SENTRY_AUTH_TOKEN` no se puede subir el mapeo de R8 a Sentry: en ese
 * caso los nombres no se ofuscan (`-dontobfuscate`), así los stack traces de
 * Java siguen legibles. Se pierde una parte del ahorro (el de los nombres
 * cortos), no el de sacar código y recursos sin usar.
 */
export function reglasProguard(env: Record<string, string | undefined>): string {
  return env.SENTRY_AUTH_TOKEN?.trim()
    ? REGLAS_PROGUARD
    : `${REGLAS_PROGUARD}\n# Sin SENTRY_AUTH_TOKEN no se sube el mapeo: sin ofuscar, los stack traces siguen legibles.\n-dontobfuscate`
}

/**
 * El plugin de Sentry. Con R8 y token, suma el plugin de Gradle de Sentry
 * para que el mapeo de R8 se suba solo en cada build (`autoUploadProguardMapping`).
 * Los símbolos nativos no se suben (no hacen falta para leer los de Java).
 */
export function pluginSentry(env: Record<string, string | undefined>): Plugin {
  if (!r8Activado(env)) return '@sentry/react-native/expo'
  return [
    '@sentry/react-native/expo',
    {
      experimental_android: {
        enableAndroidGradlePlugin: true,
        includeProguardMapping: true,
        autoUploadProguardMapping: true,
        uploadNativeSymbols: false,
        autoUploadNativeSymbols: false,
        includeNativeSources: false,
      },
    },
  ]
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
  // Q7-5: R8 y shrinkResources solo con QPS_R8=1 (perfil production-r8).
  const conR8: Plugin[] = r8Activado(env)
    ? [
        ...base,
        [
          'expo-build-properties',
          {
            android: {
              enableMinifyInReleaseBuilds: true,
              enableShrinkResourcesInReleaseBuilds: true,
              extraProguardRules: reglasProguard(env),
            },
          },
        ],
      ]
    : base
  return env.SENTRY_AUTH_TOKEN?.trim() ? [...conR8, pluginSentry(env)] : conR8
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
    // Q4-8 (política de Play del 27/01/2027): la app pide SOLO la ubicación
    // aproximada. expo-location y MapLibre declaran ACCESS_FINE_LOCATION en
    // sus manifiestos; esto la saca del manifiesto final (tools:node="remove").
    // Lo fija tests/ubicacion-aproximada.test.ts. Ver docs/play/ubicacion.md.
    blockedPermissions: PERMISOS_BLOQUEADOS,
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
