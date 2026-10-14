import type { MetadataRoute } from "next"

const DISALLOW = ["/admin/", "/api/", "/auth/"]

/**
 * Crawlers de motores de respuesta / LLM que queremos habilitar explícitamente.
 * El `allow: "/"` de `*` ya los cubriría, pero varios de estos bots buscan una
 * regla con su propio user-agent antes de caer en el comodín, así que la
 * declaramos igual para que la autorización sea inequívoca (AEO).
 */
const AI_CRAWLERS = [
  "GPTBot",          // OpenAI - entrenamiento
  "OAI-SearchBot",   // OpenAI - ChatGPT Search
  "ChatGPT-User",    // OpenAI - navegación en vivo
  "ClaudeBot",       // Anthropic - indexación
  "Claude-User",     // Anthropic - navegación en vivo
  "PerplexityBot",   // Perplexity
  "Google-Extended", // Google - Gemini / AI Overviews
  "Applebot-Extended",
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: DISALLOW,
      },
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: DISALLOW,
      })),
    ],
    sitemap: "https://www.quepintasalta.com.ar/sitemap.xml",
    host: "https://www.quepintasalta.com.ar",
  }
}
