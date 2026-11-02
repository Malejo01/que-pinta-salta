// Q4-8 (política de Play del 27/01/2027): la ubicación de la app es SIEMPRE
// aproximada. El manifiesto solo tiene ACCESS_COARSE_LOCATION
// (`blockedPermissions` en app.config.ts) y toda lectura de la posición pasa
// por acá, con precisión `Balanced` (≈100 m: alcanza para «qué hay cerca»).
// `tests/ubicacion-aproximada.test.ts` impide que alguien pida la precisa.
//
// Hoy ninguna pantalla lee la ubicación («Cerca mío» todavía no está en la
// app y el mapa no dibuja la posición): esto queda listo para cuando se use.
// Reglas: el permiso se pide solo por una acción de la persona (nunca en
// frío), solo «mientras se usa», y nunca tira.
import * as Location from 'expo-location'

/** `Location.Accuracy.Balanced` (3). Nunca High (4), Highest (5) ni BestForNavigation (6). */
export const PRECISION_UBICACION = Location.Accuracy.Balanced

/** Redondeo a ~1 km para lo que se guarda o se manda (nunca la posición exacta). */
export function redondearCoordenada(valor: number): number {
  return Math.round(valor * 100) / 100
}

export type ResultadoUbicacion =
  | { ok: true; latitud: number; longitud: number }
  | { ok: false; motivo: 'sin-permiso' | 'no-disponible' }

/** Pide el permiso «mientras se usa» (aproximado) y lee la posición con precisión Balanced. */
export async function ubicacionAproximada(): Promise<ResultadoUbicacion> {
  try {
    const permiso = await Location.requestForegroundPermissionsAsync()
    if (permiso.status !== 'granted') return { ok: false, motivo: 'sin-permiso' }
    const posicion = await Location.getCurrentPositionAsync({ accuracy: PRECISION_UBICACION })
    return {
      ok: true,
      latitud: redondearCoordenada(posicion.coords.latitude),
      longitud: redondearCoordenada(posicion.coords.longitude),
    }
  } catch {
    return { ok: false, motivo: 'no-disponible' }
  }
}
