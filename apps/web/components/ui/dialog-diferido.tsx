"use client"

/**
 * Q6-5 · Las piezas de `./dialog` (Radix Dialog, con react-remove-scroll,
 * focus-scope y aria-hidden: ~50 KB sin comprimir), cargadas con
 * `next/dynamic`. Para diálogos que viven en el layout raíz y casi nunca se
 * abren, como el modal de ingreso (`auth-modal.tsx`): el módulo se pide recién
 * cuando se renderiza `<PiezasDeDialogo>`, y quien lo usa lo renderiza recién
 * al abrir.
 *
 * Es UN solo componente diferido que le pasa todas las piezas a su hijo (una
 * función), y no una pieza diferida por componente: así el diálogo entero
 * (contenido, título y descripción) aparece en el mismo render, y el
 * `aria-labelledby` del contenido nunca apunta a un título que todavía no
 * está. Sin SSR: un diálogo cerrado no pinta nada en el servidor.
 */
import type { ReactNode } from "react"
import dynamic from "next/dynamic"

type Piezas = typeof import("./dialog")

export const PiezasDeDialogo = dynamic(
  () =>
    import("./dialog").then((piezas) => {
      function ConPiezas({ children }: { children: (piezas: Piezas) => ReactNode }) {
        return <>{children(piezas)}</>
      }
      return ConPiezas
    }),
  { ssr: false },
)
