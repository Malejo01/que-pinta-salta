'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Dispara la impresión (o "Guardar como PDF") del reporte. Se oculta a sí mismo al imprimir. */
export function PrintButton() {
  return (
    <Button
      type="button"
      onClick={() => window.print()}
      size="sm"
      className="gap-2"
      data-print-hide
    >
      <Printer className="size-4" />
      Imprimir / guardar PDF
    </Button>
  )
}
