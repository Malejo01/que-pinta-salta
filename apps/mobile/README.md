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
