"use client"

import React, { useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Heart, ExternalLink, Coffee } from "lucide-react"
import { useDonation } from "./donation-context"
import { DONATION_CONFIG } from "@/lib/config/donations"
import { Button } from "./ui/button"

export function DonationModal() {
  const { isOpen, message, closeDonationModal } = useDonation()

  // Evitar scroll cuando el modal está abierto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = "unset"
    }
    return () => {
      document.body.style.overflow = "unset"
    }
  }, [isOpen])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay oscuro */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeDonationModal}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
          />

          {/* Contenedor del Modal para centrado */}
          <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none">
            {/* Modal en sí */}
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl pointer-events-auto"
            >
              {/* Encabezado con gradiente sutil */}
              <div className="relative border-b border-zinc-800 bg-zinc-900/50 p-6">
                <button
                  onClick={closeDonationModal}
                  className="absolute right-4 top-4 rounded-full p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                >
                  <X className="size-5" />
                </button>
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="flex size-12 items-center justify-center rounded-full bg-[#C12026]/10 text-[#C12026]">
                    <Coffee className="size-6" />
                  </div>
                  <h2 className="text-xl font-bold text-white">¡Invitá un Cafecito!</h2>
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    {message}
                  </p>
                </div>
              </div>

              {/* Opciones de monto */}
              <div className="p-6 space-y-4">
                <div className="grid gap-3">
                  <Button
                    asChild
                    className="w-full bg-[#C12026] hover:bg-[#A0191F] text-white font-bold py-6 text-lg rounded-xl shadow-lg shadow-[#C12026]/20 transition-all hover:scale-[1.02]"
                  >
                    <a href={DONATION_CONFIG.AMOUNT_2000} target="_blank" rel="noopener noreferrer">
                      $2.000 ARS
                    </a>
                  </Button>
                  <Button
                    asChild
                    className="w-full bg-[#C12026] hover:bg-[#A0191F] text-white font-bold py-6 text-lg rounded-xl shadow-lg shadow-[#C12026]/20 transition-all hover:scale-[1.02]"
                  >
                    <a href={DONATION_CONFIG.AMOUNT_5000} target="_blank" rel="noopener noreferrer">
                      $5.000 ARS
                    </a>
                  </Button>
                  <Button
                    asChild
                    className="w-full bg-[#C12026] hover:bg-[#A0191F] text-white font-bold py-6 text-lg rounded-xl shadow-lg shadow-[#C12026]/20 transition-all hover:scale-[1.02]"
                  >
                    <a href={DONATION_CONFIG.AMOUNT_10000} target="_blank" rel="noopener noreferrer">
                      $10.000 ARS
                    </a>
                  </Button>
                </div>

                <div className="pt-2 text-center">
                  <a
                    href={DONATION_CONFIG.AMOUNT_CUSTOM}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-medium text-zinc-400 transition-colors hover:text-white"
                  >
                    Elegir otro monto
                    <ExternalLink className="size-3.5" />
                  </a>
                </div>
              </div>

              {/* Footer del Modal */}
              <div className="bg-zinc-900/30 p-4 text-center">
                <p className="flex items-center justify-center gap-1 text-xs text-zinc-500">
                  Transacción segura procesada por Mercado Pago <Heart className="size-3 text-[#C12026] fill-[#C12026]" />
                </p>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
