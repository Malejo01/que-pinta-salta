# Peso de la app Android (Q7-5)

**Requiere build 10.** Este PR no cambia nada del build `production` de siempre: R8 y `shrinkResources` se prenden solo con el perfil nuevo `production-r8` de `apps/mobile/eas.json`, que define `QPS_R8=1`. Así se pueden comparar los dos builds.

## 1. Línea base: build 9

| Dato | Valor | De dónde sale |
|---|---|---|
| AAB del build 9 (`0.1.0 (9)`, commit `68ee51a`) | **96,5 MB** | Log del build en EAS (fase `UPLOAD_APPLICATION_ARCHIVE`) |
| R8 / minify | **Apagado** | En el log no hay ninguna tarea `minifyReleaseWithR8` (el build va de `bundleReleaseResources` a `packageReleaseBundle`) |
| ABIs | 4: `armeabi-v7a`, `arm64-v8a`, `x86`, `x86_64` | Tareas `buildCMakeRelWithDebInfo[...]` del log |
| Mapeo / source maps a Sentry | No se suben | El entorno `production` tiene `SENTRY_DISABLE_AUTO_UPLOAD=true` y no hay `SENTRY_AUTH_TOKEN` (sin token no entra el plugin de Sentry) |

**Medido en la nube** con `npx expo export --platform android` desde la base de esta tanda: el bundle de JS (bytecode de Hermes) pesa **6,8 MB** y los assets **2,7 MB**. De los assets, 971 KB son la fuente Material Symbols (viene de `expo-router` por `expo-symbols`), 1 MB son las tres Montserrat, 380 KB y 292 KB son dos PNG de Cuenta, y lo demás son íconos chicos de `expo-router`.

**Pendiente:** el desglose por partes (dex, `.so`, recursos y assets) y el tamaño de descarga por dispositivo. Desde la nube no se puede bajar el AAB, porque el proxy bloquea `expo.dev`. Para medirlo:

```
# Con el AAB del build 9 y bundletool (https://github.com/google/bundletool/releases):
java -jar bundletool.jar build-apks --bundle=build9.aab --output=build9.apks
java -jar bundletool.jar get-size total --apks=build9.apks --dimensions=ABI
```

También sirve Play Console → la versión → «Explorador de App Bundle»: muestra la descarga por dispositivo.

## 2. El cambio (perfil `production-r8`)

- **`expo-build-properties`** (`~57.0.22`), la única dependencia nueva que permite la tanda. Sus opciones:
  - `android.enableMinifyInReleaseBuilds: true`: R8 saca el código Java/Kotlin que no se usa;
  - `android.enableShrinkResourcesInReleaseBuilds: true`: saca los recursos sin usar;
  - `android.extraProguardRules`: suma las reglas de `REGLAS_PROGUARD` (en `app.config.ts`) a `android/app/proguard-rules.pro`.
- **Reglas propias.** Conservan enteras las librerías que se llaman por JNI o por reflexión y no traen reglas en su AAR:

  | Librería | Regla |
  |---|---|
  | MapLibre (SDK nativo y módulo de React Native) | `-keep class org.maplibre.android.**`, `org.maplibre.reactnative.**` y `-dontwarn org.maplibre.**` |
  | Sentry (puente de React Native) | `-keep class io.sentry.react.**`. El SDK de Android ya trae sus reglas |
  | Google Sign-In | `-keep class com.reactnativegooglesignin.**` |
  | expo-notifications | `-keep class expo.modules.notifications.**` (ya la trae; se repite) y el `FirebaseMessagingService` |
  | AdMob | `-keep class io.invertase.googlemobileads.**` y la UMP (`com.google.android.ump.**`) |
  | react-native-svg | `-keep public class com.horcrux.svg.**` (lo pide su README) |
  | react-native-view-shot, AsyncStorage | sus paquetes |

  React Native, Hermes y Reanimated ya están en el `proguard-rules.pro` que genera Expo. expo-modules-core, expo-notifications, react-native-svg y reanimated traen reglas de consumidor.
- **Mapeo de R8 en Sentry:**
  - **Con `SENTRY_AUTH_TOKEN`** en el entorno de EAS, entra el plugin de Gradle de Sentry (`experimental_android.enableAndroidGradlePlugin`) con `autoUploadProguardMapping`, y el mapeo se sube en cada build. Los símbolos nativos no se suben.
  - **Sin token**, las reglas suman `-dontobfuscate`: R8 igual saca código y recursos, pero no renombra clases, y los stack traces de Java en Sentry siguen legibles.
  - **Ojo:** para que el mapeo suba de verdad, en el entorno `production` de EAS hay que cargar `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` y `SENTRY_PROJECT`, y **sacar `SENTRY_DISABLE_AUTO_UPLOAD=true`** (o ponerlo en `false`). Si queda, el plugin no sube nada.
- **Verificado en la nube** (sin compilar, porque no hay SDK de Android):
  - `QPS_R8=1 npx expo prebuild --platform android --no-install` genera `android.enableMinifyInReleaseBuilds=true` y `android.enableShrinkResourcesInReleaseBuilds=true` en `gradle.properties`. `app/build.gradle` los lee (`minifyEnabled` y `shrinkResources`), y las reglas quedan al final de `proguard-rules.pro`.
  - Con un token falso, el prebuild suma `io.sentry.android.gradle` con `autoUploadProguardMapping`.

**Ahorro esperado de R8 + shrink:** típicamente entre 1 y 3 MB de dex y recursos en la descarga. La mayor parte del peso de este AAB son las librerías nativas (`.so`), que R8 no toca: ver el punto 3.

## 3. Propuestas (no se borra nada en este PR)

| Propuesta | Ahorro estimado | Riesgo |
|---|---|---|
| **Sacar `@maplibre/maplibre-react-native`** (dependencia y plugin). **Ningún archivo de la app lo importa**: entró con las dependencias de la etapa 2 (#79), pero el mapa de la app nunca se hizo nativo («Ver en el mapa» y «Cómo llegar» abren links) | **≈ 15,6 MB del AAB** (el AAR del SDK nativo 13.6.1 pesa 15,6 MB comprimido, con 41 MB de `.so` en 4 ABIs); **≈ 10,8 MB instalada en arm64** y unos 3 a 4 MB de descarga. Lo más grande de la lista | Bajo, porque no se usa. Hay que sacar también la regla de `REGLAS_PROGUARD` y revisar `tests/ubicacion-aproximada.test.ts`, que menciona su permiso |
| **Solo ABIs ARM** (`buildArchs: ['armeabi-v7a', 'arm64-v8a']` en `expo-build-properties`) | ≈ 40 % del peso nativo **del AAB** (x86 y x86_64). **No cambia la descarga** de un teléfono ARM: Play ya entrega solo su ABI | Emuladores x86 y algunos Chromebooks (muchos traducen ARM) |
| `expo-symbols` no lo importa la app, pero **`expo-router` depende de él** (pestañas nativas) y arrastra la fuente `MaterialSymbols_400Regular.ttf` (**971 KB** en el bundle). Sacarlo de `package.json` no cambia nada. Sacar la fuente obliga a tocar `expo-router` (por ejemplo, con un alias de Metro): no lo recomiendo por 1 MB | ≈ 1 MB, solo con un parche | Medio: actualizaciones de `expo-router` |
| `react-native-screens` y `expo-system-ui` **no se importan, pero se necesitan**: el primero es par de `expo-router` y el segundo hace falta para `userInterfaceStyle` en Android | — | No sacar |
| `assets/patron-claro.png` (380 KB, 717×333 RGBA) y `assets/titulo-horizontal.png` (292 KB, 972×234 RGBA), las dos solo en Cuenta: pasarlas a WebP o cuantizarlas | ≈ 450 KB | Revisar que se vean igual en claro y en oscuro |
| Montserrat 400, 600 y 700 (≈ 325 KB cada una): un subconjunto latino | ≈ 600 KB | Hace falta una herramienta (`pyftsubset`) fuera del build |

## 4. Prueba manual del build 10 (`production-r8`)

Para compilarlo: `eas build -p android --profile production-r8`. Antes de mandarlo a la prueba cerrada, compararlo con el `production` del mismo commit: el tamaño del AAB en el log de EAS (fase `UPLOAD_APPLICATION_ARCHIVE`) y la descarga en el Explorador de App Bundle.

- [ ] **Inicio:** abre sin cerrarse, con la agenda, las fuentes Montserrat y los íconos (lucide/SVG).
- [ ] **Mapa:** «Ver en el mapa» y «Cómo llegar» abren el link. Los lugares para chicos muestran «Cerca mío» (pide la ubicación aproximada) y «Elegí tu barrio».
- [ ] **Login con Google:** se elige la cuenta, vuelve logueado y cierra sesión.
- [ ] **Avisos:** activarlos, recibir uno de prueba (Firebase) y que al tocarlo abra el evento. Probar también la baja de patrocinados.
- [ ] **Anuncios:** aparece el formulario de consentimiento (UMP) y se ve un banner de AdMob.
- [ ] **Abrir un link `/evento`** desde el navegador o WhatsApp: abre la ficha en la app (App Links).
- [ ] **Compartir** un evento: la imagen se arma (view-shot) y se comparte.
- [ ] **Sentry:** forzar un error de prueba y confirmar que el stack trace de Java se lee, ofuscado y con el mapeo subido, o sin ofuscar si no hay token.

Si algo se cierra solo en el build con R8, el log de Sentry o de `adb logcat` dice qué clase falta. La arreglo con una regla `-keep` más en `REGLAS_PROGUARD`.
