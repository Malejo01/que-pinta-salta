/**
 * Conversión pura de OKLCH (CSS Color 4) a hex sRGB.
 *
 * React Native no entiende `oklch()`, así que los tokens de
 * `apps/web/app/globals.css` (ver `lib/theme.ts`) se convierten acá antes de
 * llegar a cualquier componente. Sin imports de `react-native` ni `expo-*`:
 * el test de 24-c la corre en Vitest con entorno `node`.
 *
 * Fórmulas estándar OKLCH -> OKLab -> LMS -> sRGB lineal -> sRGB con gamma
 * (la matriz es la de Björn Ottosson / CSS Color 4), con recorte a [0, 1]
 * antes de pasar a 0-255.
 */

// `oklch(L C H)` o `oklch(L C H / A)`. L, C y H son números (L puede venir en
// porcentaje, p. ej. `98%`); el alfa se acepta para no rechazar el formato,
// pero no se usa: los componentes hex de esta app no llevan canal alfa.
const OKLCH_RE = /^oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+)(?:\s*\/\s*[\d.]+%?\s*)?\)$/i

function aFraccion(texto: string): number {
  if (texto.endsWith('%')) return parseFloat(texto) / 100
  return parseFloat(texto)
}

function recortar01(valor: number): number {
  return Math.min(1, Math.max(0, valor))
}

function recortarByte(valor: number): number {
  return Math.min(255, Math.max(0, valor))
}

/** sRGB lineal -> sRGB con gamma (recorta a [0, 1] antes de aplicar la curva). */
function gamma(componenteLineal: number): number {
  const v = recortar01(componenteLineal)
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
}

function aHexByte(valor: number): string {
  return recortarByte(Math.round(valor)).toString(16).padStart(2, '0')
}

/**
 * Convierte un color `oklch(...)` (el texto tal cual aparece en el CSS) a un
 * hex `#rrggbb`. Tira si el texto no tiene el formato esperado.
 */
export function oklchToHex(oklch: string): string {
  const coincidencia = OKLCH_RE.exec(oklch.trim())
  if (!coincidencia) {
    throw new Error(`oklchToHex: formato inválido: "${oklch}"`)
  }
  const [, lTexto, cTexto, hTexto] = coincidencia

  const l = aFraccion(lTexto)
  // El croma (C) de CSS Color 4 no usa porcentaje en los tokens de esta web,
  // pero se acepta igual por si el CSS lo escribiera así en el futuro.
  const c = aFraccion(cTexto)
  const hGrados = parseFloat(hTexto)
  const hRad = (hGrados * Math.PI) / 180

  // OKLCH -> OKLab
  const a = c * Math.cos(hRad)
  const b = c * Math.sin(hRad)

  // OKLab -> LMS (antes de elevar al cubo)
  const lPrima = l + 0.3963377774 * a + 0.2158037573 * b
  const mPrima = l - 0.1055613458 * a - 0.0638541728 * b
  const sPrima = l - 0.0894841775 * a - 1.2914855480 * b

  const lCubo = lPrima ** 3
  const mCubo = mPrima ** 3
  const sCubo = sPrima ** 3

  // LMS -> sRGB lineal
  const rLineal = 4.0767416621 * lCubo - 3.3077115913 * mCubo + 0.2309699292 * sCubo
  const gLineal = -1.2684380046 * lCubo + 2.6097574011 * mCubo - 0.3413193965 * sCubo
  const bLineal = -0.0041960863 * lCubo - 0.7034186147 * mCubo + 1.7076147010 * sCubo

  const r = aHexByte(gamma(rLineal) * 255)
  const g = aHexByte(gamma(gLineal) * 255)
  const bHex = aHexByte(gamma(bLineal) * 255)

  return `#${r}${g}${bHex}`
}
