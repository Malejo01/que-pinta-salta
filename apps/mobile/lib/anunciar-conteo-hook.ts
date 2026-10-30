// A8 (nube Q1, QPS-339): el hook delgado que conecta `lib/anunciar-conteo.ts`
// (la decisión pura de qué y cuándo anunciar) con el lector de pantalla, a
// través del envoltorio único `anunciar` (`lib/anunciar.ts`). Vive aparte
// porque importa `react-native` y `expo-router`, que Vitest no puede
// transformar (mismo motivo que `lib/metricas-hook.ts`); se prueba con
// detectores sobre el fuente (`tests/anunciar-conteos.test.ts`).
//
// Anuncia SIEMPRE a mano, en Android y en iOS (antes, QPS-354, Android
// dependía de `accessibilityLiveRegion` para los cambios): las pantallas que lo
// usan sacan la live region del conteo y de los vacíos que anuncia.
//
// Ronda de correcciones de A8:
//   - La plataforma (`Platform.OS`) se le pasa al anunciador puro, que decide
//     la demora de los toques (400 ms en Android, que ignora `queue`; 0 en
//     iOS): acá no hay ninguna rama por plataforma.
//   - Al perder el foco la pestaña (`useIsFocused`; Buscar y Cines siguen
//     montadas debajo), se cancela lo pendiente y se asienta sin anunciar.
//   - Texto que llega por un toque: la pantalla cambia el nonce `toque` del
//     `EstadoAnunciable` (Buscar y Cines lo hacen con `onSubmitEditing`) y se
//     anuncia sin la espera del tipeo y sin doble anuncio. AL INTEGRAR A5
//     (`origin/nube/q1-busquedas-recientes`): `repetirBusqueda` de
//     `app/(tabs)/buscar.tsx` tiene que DEJAR su
//     `AccessibilityInfo.announceForAccessibility(textoResultados(…))` y, en su
//     lugar, subir el mismo nonce (`setToqueTexto((n) => n + 1)`) junto con
//     `setTexto(busqueda)`: el hook dice el resultado una sola vez. Su aviso
//     de «borraste tus búsquedas» pasa a `anunciar` (`lib/anunciar.ts`).
//
// Lint: un anuncio no es `setState` (`react-hooks/set-state-in-effect`); el
// anunciador se crea una sola vez (inicializador de `useState`, sin leer refs
// en el render) y su temporizador se cancela al desmontar.
import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { useIsFocused } from 'expo-router'
import { anunciar } from '@/lib/anunciar'
import { crearAnunciadorDeConteo, type EstadoAnunciable } from '@/lib/anunciar-conteo'

/**
 * Anuncia el conteo de la pantalla cuando cambia por un filtro (reglas en
 * `lib/anunciar-conteo.ts`). `estado: null` = la pantalla todavía no tiene
 * nada (cargando o error). El efecto depende de los campos, no del objeto
 * (que es nuevo en cada render).
 */
export function useAnunciarConteo(estado: EstadoAnunciable | null): void {
  const enFoco = useIsFocused()
  const [anunciador] = useState(() =>
    crearAnunciadorDeConteo({ anunciar: (texto) => anunciar(texto), reloj: { setTimeout, clearTimeout }, plataforma: Platform.OS }),
  )
  const listo = estado !== null
  const clave = estado?.clave ?? ''
  const texto = estado?.texto ?? ''
  const toque = estado?.toque ?? null
  const titulo = estado?.titulo ?? null
  const conteo = estado?.conteo ?? null
  const alSalir = estado?.alSalir ?? null

  useEffect(() => {
    const actual = listo ? { clave, texto, toque: toque ?? undefined, titulo, conteo, alSalir } : null
    if (enFoco) anunciador.observar(actual)
    else anunciador.asentarEnSilencio(actual)
  }, [anunciador, enFoco, listo, clave, texto, toque, titulo, conteo, alSalir])

  useEffect(() => () => anunciador.cancelar(), [anunciador])
}
