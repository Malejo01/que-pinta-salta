/**
 * Tokens de color de la web (`apps/web/app/globals.css`), convertidos a hex
 * para React Native. Los textos `oklch(...)` de abajo están copiados tal
 * cual del CSS (`:root` para claro, `.dark` para oscuro): el test de 24-c
 * compara token por token contra ese archivo, carácter por carácter.
 *
 * Puro: no importa `react-native` ni `expo-*`. `construirTema` tampoco los
 * importa — recibe el tema base (`DarkTheme`/`DefaultTheme` de
 * `expo-router`) como parámetro, así que la extensión del tema de
 * navegación queda separada de estos exports y el test puede importar los
 * tokens sin arrastrar React Native.
 */
import { oklchToHex } from './color'

export interface ColoresQPS {
  background: string
  foreground: string
  card: string
  primary: string
  primaryForeground: string
  muted: string
  mutedForeground: string
  border: string
}

/** `:root` de `apps/web/app/globals.css`, texto `oklch(...)` tal cual. */
export const TOKENS_CLARO: ColoresQPS = {
  background: 'oklch(0.98 0 0)',
  foreground: 'oklch(0.145 0 0)',
  card: 'oklch(1 0 0)',
  primary: 'oklch(0.45 0.18 25)',
  primaryForeground: 'oklch(1 0 0)',
  muted: 'oklch(0.93 0 0)',
  mutedForeground: 'oklch(0.45 0 0)',
  border: 'oklch(0.9 0 0)',
}

/** `.dark` de `apps/web/app/globals.css`, texto `oklch(...)` tal cual. */
export const TOKENS_OSCURO: ColoresQPS = {
  background: 'oklch(0.1 0 0)',
  foreground: 'oklch(0.95 0 0)',
  card: 'oklch(0.15 0 0)',
  primary: 'oklch(0.55 0.2 25)',
  primaryForeground: 'oklch(1 0 0)',
  muted: 'oklch(0.2 0 0)',
  mutedForeground: 'oklch(0.6 0 0)',
  border: 'oklch(0.25 0 0)',
}

function convertir(tokens: ColoresQPS): ColoresQPS {
  return {
    background: oklchToHex(tokens.background),
    foreground: oklchToHex(tokens.foreground),
    card: oklchToHex(tokens.card),
    primary: oklchToHex(tokens.primary),
    primaryForeground: oklchToHex(tokens.primaryForeground),
    muted: oklchToHex(tokens.muted),
    mutedForeground: oklchToHex(tokens.mutedForeground),
    border: oklchToHex(tokens.border),
  }
}

/** Los mismos tokens que `TOKENS_CLARO`, ya convertidos a hex. */
export const COLORES_CLARO: ColoresQPS = convertir(TOKENS_CLARO)

/** Los mismos tokens que `TOKENS_OSCURO`, ya convertidos a hex. */
export const COLORES_OSCURO: ColoresQPS = convertir(TOKENS_OSCURO)

/**
 * Los tokens de color (ya en hex) según el esquema de color del sistema
 * (QPS-126): `'dark'` da los oscuros; cualquier otro valor (`'light'`,
 * `null`, `undefined`) da los claros. Pura: no importa `react-native` ni
 * `expo-*` — la usa `useColoresQPS` (`lib/colores.ts`), que es la que lee
 * `useColorScheme()`.
 */
export function coloresSegunEsquema(esquema: 'light' | 'dark' | null | undefined): ColoresQPS {
  return esquema === 'dark' ? COLORES_OSCURO : COLORES_CLARO
}

/**
 * Forma mínima de un tema de navegación (react-navigation / expo-router):
 * solo lo que se necesita para fusionar colores, sin importar el tipo real
 * (`Theme` de `expo-router`) y así no arrastrar React Native a este módulo.
 */
interface TemaDeNavegacion {
  colors: Record<string, unknown>
}

/**
 * Extiende un tema de navegación (`DarkTheme`/`DefaultTheme` de
 * `expo-router`, pasado por quien llama) con los colores de la web. Pura:
 * no importa `expo-router`, solo opera sobre el objeto que le pasan.
 */
export function construirTema<T extends TemaDeNavegacion>(base: T, colores: ColoresQPS): T {
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: colores.primary,
      background: colores.background,
      card: colores.card,
      text: colores.foreground,
      border: colores.border,
    },
  }
}
