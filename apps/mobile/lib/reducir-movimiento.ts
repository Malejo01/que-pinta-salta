// A1 (nube Q1, ronda de correcciones): "Reducir movimiento" / "Quitar
// animaciones" del sistema, como hook compartido. Salió de
// `components/Esqueleto.tsx` para que lo use también `components/PillsAtajos.tsx`
// (el resaltado de la pill activa se movía con un spring con rebote aunque el
// ajuste estuviera prendido, y en Buscar se ve mientras carga el esqueleto).
//
// No es puro (importa `react-native`): no lo importa ningún test; los
// detectores de `tests/esqueletos.test.ts` lo leen como texto.
import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

/**
 * `true`/`false` según "Reducir movimiento" del sistema; `null` mientras la
 * consulta no resolvió. Quien lo usa trata `null` igual que `true` (sin
 * animar): así quien tiene el ajuste prendido no ve ni el primer cuadro de
 * una animación (ver `animacionEsqueleto` de `lib/esqueleto.ts`).
 *
 * Consulta `AccessibilityInfo.isReduceMotionEnabled()` al montar y escucha
 * `reduceMotionChanged` por si se cambia con la pantalla abierta. Mismo patrón
 * que el `isScreenReaderEnabled` de `components/Hero.tsx`: el `setState` va en
 * el callback de la promesa y en el del listener, nunca sincrónico en el
 * cuerpo del efecto (lint `react-hooks/set-state-in-effect`); `montado` evita
 * aplicar una respuesta que llega después del desmonte, y la suscripción se
 * saca en el cleanup.
 */
export function useReducirMovimiento(): boolean | null {
  const [reducir, setReducir] = useState<boolean | null>(null)

  useEffect(() => {
    let montado = true
    AccessibilityInfo.isReduceMotionEnabled()
      .then((valor) => {
        if (montado) setReducir(valor)
      })
      // Si la consulta falla, queda en `null`: sin animación (lo seguro).
      .catch(() => {})
    const suscripcion = AccessibilityInfo.addEventListener('reduceMotionChanged', (valor) => {
      if (montado) setReducir(valor)
    })
    return () => {
      montado = false
      suscripcion.remove()
    }
  }, [])

  return reducir
}
