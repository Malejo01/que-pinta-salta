"use client"

import React, { createContext, useContext, useState, ReactNode } from "react"
import { DONATIONS_ENABLED } from "@/lib/config/monetization"

interface DonationContextProps {
  isOpen: boolean
  message: string
  openDonationModal: (message?: string) => void
  closeDonationModal: () => void
}

const DonationContext = createContext<DonationContextProps | undefined>(undefined)

export function DonationProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [message, setMessage] = useState("Apoyá a Qué Pinta Salta. Ayudanos a juntar fondos para lanzar la aplicación oficial de Android/iOS.")

  const openDonationModal = (customMessage?: string) => {
    // Con la monetización apagada no se abre: los "compartir" y favoritos
    // que la llaman siguen funcionando sin pedir donación.
    if (!DONATIONS_ENABLED) return
    if (customMessage) {
      setMessage(customMessage)
    } else {
      setMessage("Apoyá a Qué Pinta Salta. Ayudanos a juntar fondos para lanzar la aplicación oficial de Android/iOS.")
    }
    setIsOpen(true)
  }

  const closeDonationModal = () => {
    setIsOpen(false)
  }

  return (
    <DonationContext.Provider value={{ isOpen, message, openDonationModal, closeDonationModal }}>
      {children}
    </DonationContext.Provider>
  )
}

export function useDonation() {
  const context = useContext(DonationContext)
  if (!context) {
    throw new Error("useDonation must be used within a DonationProvider")
  }
  return context
}
