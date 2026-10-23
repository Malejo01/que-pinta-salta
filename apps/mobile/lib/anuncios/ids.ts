// R60/52-c: AdMob en la app, fase 2 de la R52 (la web ya tiene AdSense desde
// la R52 principal). Este módulo es puro: NO importa
// `react-native-google-mobile-ads` ni `expo-constants` — recibe el entorno y
// la plataforma ya resueltos (el componente que llama los lee), así queda
// testeable sin montar nada de React Native.
import type { Env } from '@/lib/env'
import { ENTORNOS_VALIDOS } from '@/lib/version'

export type LugarAnuncio = 'inicio' | 'buscar'

export interface OpcionesIdBloque {
  /** `Constants.expoConfig?.extra?.entorno` (ver `lib/version.ts`/`cuenta.tsx`),
   * tal cual lo entrega `expo-constants`, SIN resolver a string en el
   * llamador: este módulo es el único que decide qué cuenta como "no
   * producción" (vuelta 1 de revisión, hallazgo de seguridad — ver el
   * docstring de `idBloque`). */
  entorno: unknown
  /** `Platform.OS`, ya leído por quien llama. */
  plataforma: string
  env: Env
  /** `TestIds.ADAPTIVE_BANNER` del SDK, pasado por quien llama (este módulo no lo importa). */
  idPrueba: string
}

/** `true` si `valor` tiene forma de ID real de AdMob: empieza con
 * `ca-app-pub-` y contiene un `/` (separador entre el ID de la app/cuenta y
 * el del bloque). Un ID de prueba, o cualquier otra cosa, da `false`. */
function esIdReal(valor: string | null): valor is string {
  return valor !== null && valor.startsWith('ca-app-pub-') && valor.includes('/')
}

// Los entornos que NO son producción, derivados de `ENTORNOS_VALIDOS`
// (`lib/version.ts`, la misma lista cerrada que usa `cuenta.tsx` para no
// mostrar un valor inválido de `extra.entorno`) filtrando `'production'` —
// hoy: `'preview' | 'development' | 'local'`. Nunca se escribe la lista a
// mano acá para no duplicarla, pero OJO: si el día de mañana se agrega un
// entorno nuevo a `ENTORNOS_VALIDOS`, este filtro lo va a incluir como "no
// producción" automáticamente. Si ese entorno nuevo no debería habilitar el
// ID de prueba (por ejemplo, algo intermedio que sí llega a usuarios
// reales), hay que revisar esta lista a propósito en ese momento — no asumir
// que "no es production" ya alcanza.
const ENTORNOS_DE_PRUEBA = new Set<string>((ENTORNOS_VALIDOS as readonly string[]).filter((e) => e !== 'production'))

/** `true` solo si `valor` es exactamente uno de los strings de
 * `ENTORNOS_DE_PRUEBA`. Fail closed: `undefined`, `null`, un número, un
 * string vacío, mal escrito (`'produccion'`) o desconocido (`'staging'`) —
 * todos dan `false`, nunca `true` por descarte. */
function esEntornoDePrueba(valor: unknown): boolean {
  return typeof valor === 'string' && ENTORNOS_DE_PRUEBA.has(valor)
}

/**
 * El ID de unidad de anuncio para `lugar`, o `null` si no corresponde
 * mostrar nada ahí. Reglas, en este orden:
 *
 * 1. iOS (o cualquier plataforma que no sea Android): todavía no hay
 *    bloques para esa plataforma, siempre `null`.
 * 2. Si hay un ID real configurado para ese lugar (`admobBannerInicio`/
 *    `admobBannerBuscar`), se usa ese, sin importar el entorno.
 * 3. Sin ID real, con `entorno` EXACTAMENTE uno de `'preview'`,
 *    `'development'` o `'local'` (derivados de `ENTORNOS_VALIDOS` menos
 *    `'production'` — ver `ENTORNOS_DE_PRUEBA`, arriba): se usa el ID de
 *    prueba.
 * 4. Cualquier otro caso — `'production'`, un string desconocido o mal
 *    escrito, `undefined`, `null`, un número, lo que sea que no sea
 *    literalmente uno de los tres de la regla 3 — da `null`. Fail closed a
 *    propósito (vuelta 1 de revisión, hallazgo de seguridad): antes, un
 *    `entorno` que no fuera string (por ejemplo si `expo-constants` algún
 *    día no resuelve `extra`) cualificaba como "no production" y mostraba
 *    el ID de prueba en un build real. Nunca anuncios de prueba en
 *    producción — un ID de prueba mostrado a usuarios reales violaría las
 *    políticas de AdMob, y la ausencia de dato tiene que fallar del lado
 *    seguro, no del lado permisivo.
 */
export function idBloque(lugar: LugarAnuncio, opciones: OpcionesIdBloque): string | null {
  const { entorno, plataforma, env, idPrueba } = opciones

  if (plataforma !== 'android') return null

  const idConfigurado = lugar === 'inicio' ? env.admobBannerInicio : env.admobBannerBuscar
  if (esIdReal(idConfigurado)) return idConfigurado

  if (esEntornoDePrueba(entorno)) return idPrueba

  // Fail closed: cualquier otra cosa (incluida la ausencia de dato) es
  // tratada como producción. Nunca anuncios de prueba en producción.
  return null
}
