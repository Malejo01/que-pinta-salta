"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { useDonation } from "./donation-context"

/**
 * Q6-5 · El modal de donación vive en el layout raíz, pero casi nunca se abre
 * (y con las donaciones apagadas, nunca). Antes importaba framer-motion de
 * forma estática, así que su animación viajaba en el JavaScript inicial de
 * TODAS las páginas. Ahora el contenido (`donation-modal-contenido.tsx`, con
 * framer-motion) se pide recién la primera vez que se abre y queda montado
 * después, para que `AnimatePresence` pueda animar el cierre.
 */
const DonationModalContenido = dynamic(() => import("./donation-modal-contenido"), { ssr: false })

export function DonationModal() {
  const { isOpen } = useDonation()
  const [seAbrio, setSeAbrio] = useState(false)
  // Estado derivado durante el render (patrón de React para «recordar» un
  // valor de las props): una vez abierto, el contenido queda montado.
  if (isOpen && !seAbrio) setSeAbrio(true)

  return seAbrio ? <DonationModalContenido /> : null
}
