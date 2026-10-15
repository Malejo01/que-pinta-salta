# apps/mobile

La app Android de Qué Pinta Salta (Expo SDK 57, `expo-router`). Desde la noche 8 (R24).

- **Paquete:** `ar.com.quepintasalta.app`, el mismo que `apps/web/lib/config/app-links.ts` (lo controla `tests/config.test.ts`).
- **React:** 19.2.3 exacta, la que pide el SDK 57. La web usa la suya (19.2.6) y no se toca. El bundle de Android lleva una sola React (ver `metro.config.js`).
- **Lógica de dominio:** `@qps/core` (`packages/core`), la misma que la web.
- **Claves:** ninguna en el repo. La app lee `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` y `EXPO_PUBLIC_SENTRY_DSN`. Mauro las carga en EAS o en `apps/mobile/.env.local`. Sin la de Google, el botón no aparece; sin la de Sentry, no se inicializa.

## Scripts (desde la raíz: `npm --prefix apps/mobile run <script>`)

| Script | Qué hace |
|---|---|
| `typecheck` | `tsc --noEmit` |
| `test` | Vitest, solo lógica pura (`tests/`) |
| `export:android` | arma el bundle de Android en `dist/` (sin red ni teléfono) |
| `config:public` | la config pública, para comprobar que no tiene secretos |

`android/`, `ios/`, `dist/` y `.expo/` son generados y no se versionan.

## Builds con EAS (QPS-143)

- **Proyecto:** `extra.eas.projectId` está fijo en `app.config.ts` (es público). El `slug` (`que-pinta-salta`) tiene que coincidir con el del proyecto en expo.dev.
- **Perfiles (`eas.json`):** `preview` sale como `.apk` de distribución interna, para instalar directo en el teléfono, con las variables del entorno `preview` de EAS. `production` usa las del entorno `production`.
- **Build de prueba:** desde `apps/mobile`, `npx eas-cli@latest build --platform android --profile preview`. `eas-cli` no es dependencia: va con `npx`.
- **Sentry:** el plugin `@sentry/react-native/expo` entra solo si el entorno de EAS tiene `SENTRY_AUTH_TOKEN` (y en ese caso también hacen falta `SENTRY_ORG` y `SENTRY_PROJECT`). Sin token el build no intenta subir source maps. El SDK se inicializa igual con `EXPO_PUBLIC_SENTRY_DSN`.
- **Íconos:** `assets/icon.png` y `assets/adaptive-icon.png` salen de `assets/logo-circular.png` con `node apps/mobile/scripts/generar-iconos.mjs` (usa el `sharp` que ya trae Next). El original mide 160×160: para producción hace falta el logo en 1024 o en vector.
