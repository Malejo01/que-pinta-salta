import type { Metadata } from "next"
import SignUpPage from "@/app/auth/sign-up/page"
import { idiomasAlternos } from "@/lib/i18n/seo"

// Q6-2: /auth/sign-up en inglés. La página es la misma (cliente); el idioma sale de la URL.
export const metadata: Metadata = {
  title: { absolute: "Create an account | Qué Pinta Salta" },
  alternates: { canonical: "/en/auth/sign-up", languages: idiomasAlternos("/auth/sign-up") },
  robots: { index: false, follow: true },
}

export default function SignUpPageEn() {
  return <SignUpPage />
}
