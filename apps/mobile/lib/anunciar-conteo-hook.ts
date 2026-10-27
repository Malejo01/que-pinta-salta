// A8 (nube Q1, QPS-339): el hook delgado que conecta `lib/anunciar-conteo.ts`
// (la decisión pura de qué y cuándo anunciar) con el lector de pantalla. Vive
// aparte porque importa `react-native`, que Vitest no puede transformar (mismo
// motivo que `lib/metricas-hook.ts`); se prueba con detectores sobre las
// pantallas (`tests/anunciar-conteos.test.ts`).
//
// Anuncia SIEMPRE a mano, en Android y en iOS (antes, QPS-354, Android
// dependía de `accessibilityLiveRegion` para los cambios): las pantallas que lo
// usan sacan la live region de esos nodos, para no leer dos veces.
// `announceForAccessibilityWithOptions` con `queue: true`: en iOS el anuncio
// espera a que VoiceOver termine de decir el chip que se acaba de tocar en vez
// de cortarlo; en Android la opción no existe y TalkBack lo encola igual.
//
// Lint: un anuncio no es `setState` (`react-hooks/set-state-in-effect`), y el
// único temporizador (la espera del texto tipeado) se cancela en la limpieza
// del efecto, o sea antes de cada cambio y al desmontar.
import { useEffect, useRef } from 'react'
import { AccessibilityInfo } from 'react-native'
import { crearAnunciadorDeConteo, type AnunciadorDeConteo, type EstadoAnunciable } from '@/lib/anunciar-conteo'

function anunciarConLector(texto: string): void {
  AccessibilityInfo.announceForAccessibilityWithOptions(texto, { queue: true })
}

/**
 * Anuncia el conteo de la pantalla cuando cambia por un filtro (reglas en
 * `lib/anunciar-conteo.ts`). `estado: null` = la pantalla todavía no tiene
 * nada (cargando o error). El efecto depende de los campos, no del objeto
 * (que es nuevo en cada render).
 */
export function useAnunciarConteo(estado: EstadoAnunciable | null): void {
  const anunciador = useRef<AnunciadorDeConteo | null>(null)
  const listo = estado !== null
  const clave = estado?.clave ?? ''
  const texto = estado?.texto ?? ''
  const titulo = estado?.titulo ?? null
  const conteo = estado?.conteo ?? null
  const alSalir = estado?.alSalir ?? null

  useEffect(() => {
    const actual = anunciador.current ?? crearAnunciadorDeConteo({ anunciar: anunciarConLector, reloj: { setTimeout, clearTimeout } })
    anunciador.current = actual
    actual.observar(listo ? { clave, texto, titulo, conteo, alSalir } : null)
    return () => actual.cancelar()
  }, [listo, clave, texto, titulo, conteo, alSalir])
}
