"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useDonation } from "@/components/donation-context"
import { dispatchConsentEvent, writeConsent } from "@/lib/consent"
import type { User } from "@supabase/supabase-js"

// B3: las únicas partes del pie que necesitan el navegador. El resto de
// `components/footer.tsx` es un Server Component (no manda su JS al cliente
// ni se hidrata); estas hojas sí, y el marcado es el mismo que antes.

/**
 * "Agregar Evento": con sesión va directo a /nuevo-evento; sin sesión, al
 * ingreso con `next` y sin prefetch. La sesión se lee en el cliente, como
 * antes, para que el pie no vuelva dinámicas las páginas estáticas.
 */
export function EnlaceAgregarEvento() {
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
    }
    getSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <Link
      href={user ? "/nuevo-evento" : "/auth/login?next=/nuevo-evento"}
      prefetch={user ? undefined : false}
      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      Agregar Evento
    </Link>
  )
}

/** Borra la elección de cookies y vuelve a abrir el aviso. */
export function BotonPreferenciasCookies() {
  return (
    <button
      type="button"
      onClick={() => {
        writeConsent(window.localStorage, null)
        dispatchConsentEvent()
      }}
      className="text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      Preferencias de cookies
    </button>
  )
}

/** Botón "Hacer un aporte" del bloque de donaciones (solo con monetización prendida). */
export function BotonAporte() {
  const { openDonationModal } = useDonation()

  return (
    <button
      onClick={() => openDonationModal("Ayudanos a llevar Qué Pinta Salta a tu celular. Tu aporte es clave para el desarrollo de la App.")}
      className="shrink-0 rounded-xl bg-[#C12026] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-[#C12026]/20 transition-all hover:scale-105 hover:bg-[#A0191F]"
    >
      Hacer un aporte
    </button>
  )
}
