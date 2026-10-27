"use client"

import { useState } from "react"

/**
 * B4: devolver el foco a la tarjeta al cerrar un modal de ruta interceptada
 * (`app/@modal/(.)evento`, `app/@modal/(.)flyer`).
 *
 * Radix devuelve el foco al `DialogTrigger` al cerrar, pero estos modales no
 * tienen trigger: se abren navegando (el click en la tarjeta es un link). En
 * el recorrido con teclado de B4, después de Escape el foco quedaba en el
 * <body> y había que volver a recorrer toda la página desde arriba.
 *
 * El elemento con foco se lee en el primer render del modal, antes de que
 * Radix mueva el foco adentro: es el link de la tarjeta, que sigue montado
 * debajo (la portada no se desmonta con el slot `@modal`). Al cerrar, si
 * sigue en la página, vuelve ahí; si no (se llegó directo a la URL), Radix
 * hace lo de siempre.
 *
 * Se pasa a `onCloseAutoFocus` de `DialogContent`.
 */
export function useVolverAlFocoDeOrigen(): (evento: Event) => void {
  const [origen] = useState<HTMLElement | null>(() => {
    if (typeof document === "undefined") return null
    const activo = document.activeElement
    return activo instanceof HTMLElement && activo !== document.body ? activo : null
  })

  return (evento: Event) => {
    if (origen?.isConnected) {
      evento.preventDefault()
      origen.focus()
    }
  }
}
