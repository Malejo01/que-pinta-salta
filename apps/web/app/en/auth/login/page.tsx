import type { Metadata } from "next"
import LoginPage from "@/app/auth/login/page"
import { idiomasAlternos } from "@/lib/i18n/seo"

// Q5-14: /auth/login en inglés. La página es la misma (cliente); el idioma sale de la URL.
export const metadata: Metadata = {
  title: { absolute: "Sign in | Qué Pinta Salta" },
  alternates: { canonical: "/en/auth/login", languages: idiomasAlternos("/auth/login") },
  robots: { index: false, follow: true },
}

export default function LoginPageEn() {
  return <LoginPage />
}
