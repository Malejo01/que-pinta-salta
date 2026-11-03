// Q5-14: /en/auth/login. La página es la misma que /auth/login (cliente; el
// idioma sale de la URL), con sus textos en el diccionario `paginaIngreso`.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { en } from '@/lib/i18n/diccionarios/en'
import { es } from '@/lib/i18n/diccionarios/es'
import { RUTAS_EN_INGLES } from '@/lib/i18n/rutas'

const ROOT = process.cwd()
const pagina = readFileSync(join(ROOT, 'app', 'auth', 'login', 'page.tsx'), 'utf8')
const paginaEn = readFileSync(join(ROOT, 'app', 'en', 'auth', 'login', 'page.tsx'), 'utf8')

describe('/en/auth/login', () => {
  it('renderiza la misma página, sin indexar, con canonical y alternos', () => {
    expect(paginaEn).toContain('import LoginPage from "@/app/auth/login/page"')
    expect(paginaEn).toContain('robots: { index: false, follow: true }')
    expect(paginaEn).toContain('canonical: "/en/auth/login"')
    expect(paginaEn).toContain('idiomasAlternos("/auth/login")')
    expect(RUTAS_EN_INGLES).toContain('/auth/login')
  })

  it('los textos de la página salen del diccionario (no quedan literales en castellano)', () => {
    for (const texto of ['Volver a inicio', 'Eventos en Salta Capital', 'Iniciar sesión', 'O continuar con', '¿No tenés cuenta?', 'Registrate']) {
      expect(pagina, texto).not.toContain(`>${texto}<`)
      expect(pagina, texto).not.toContain(`\n              ${texto}\n`)
    }
    expect(pagina).toContain('{t.titulo}')
    expect(pagina).toContain('{t.registrate}')
  })

  it('las dos versiones tienen las mismas claves y el inglés está traducido', () => {
    expect(Object.keys(en.paginaIngreso).sort()).toEqual(Object.keys(es.paginaIngreso).sort())
    expect(en.paginaIngreso.titulo).toBe('Sign in')
    expect(en.paginaIngreso.olvidaste).toBe('Forgot your password?')
    // Los legales existen solo en castellano: el link lo avisa (hrefLang y el cierre del texto).
    expect(en.paginaIngreso.cierreLegales).toContain('in Spanish')
    expect(pagina).toContain("hrefLang={langLegales ? 'es-AR' : undefined}")
  })

  it('en inglés, el regreso después del ingreso va a la versión en inglés si existe', () => {
    expect(pagina).toContain("const next = idioma === 'en' ? rutaEn('en', destino) : destino")
  })
})
