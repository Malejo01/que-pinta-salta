'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { useToast } from '@/hooks/use-toast'

/**
 * Q6-5 · El Toaster vive en el layout raíz, pero casi ninguna visita ve un
 * aviso. Radix Toast (con su colección y presencia) viajaba en el JavaScript
 * inicial de todas las páginas; ahora este componente solo escucha el estado
 * de `@/hooks/use-toast` y pide `toaster-contenido.tsx` (el de siempre) con el
 * primer aviso. Después queda montado, así los siguientes salen al instante y
 * la animación de salida no se corta.
 */
const ToasterContenido = dynamic(() => import('./toaster-contenido'), { ssr: false })

export function Toaster() {
  const { toasts } = useToast()
  const [hubo, setHubo] = useState(false)
  // Estado derivado durante el render: con el primer aviso queda montado.
  if (toasts.length > 0 && !hubo) setHubo(true)

  return hubo ? <ToasterContenido /> : null
}
