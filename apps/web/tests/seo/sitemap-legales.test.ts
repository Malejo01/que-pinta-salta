// B2: el lastModified de /privacidad y /terminos en el sitemap es la fecha de
// vigencia de la versión (components/legal/vigencia.ts), no `now` en cada
// regeneración. Y las páginas privadas no se anuncian. Sin red ni base.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VIGENTE_DESDE } from '@/components/legal/vigencia'
import { fechaDeTextoEnCastellano } from '@/lib/seo/fecha-legal'

describe('fechaDeTextoEnCastellano', () => {
  it('lee «D de <mes> de AAAA» como las 00:00 de Salta', () => {
    expect(fechaDeTextoEnCastellano('23 de octubre de 2026')?.toISOString()).toBe('2026-10-23T03:00:00.000Z')
    expect(fechaDeTextoEnCastellano('1 de Enero de 2027')?.toISOString()).toBe('2027-01-01T03:00:00.000Z')
    expect(fechaDeTextoEnCastellano('5 de setiembre de 2026')?.toISOString()).toBe('2026-09-05T03:00:00.000Z')
  })

  it('null para lo que no es una fecha', () => {
    expect(fechaDeTextoEnCastellano('[COMPLETAR: fecha]')).toBeNull()
    expect(fechaDeTextoEnCastellano('23 de octubrr de 2026')).toBeNull()
    expect(fechaDeTextoEnCastellano('31 de febrero de 2026')).toBeNull()
    expect(fechaDeTextoEnCastellano('')).toBeNull()
  })

  it('la VIGENTE_DESDE de hoy se puede leer (si no, el sitemap vuelve a `now`)', () => {
    expect(fechaDeTextoEnCastellano(VIGENTE_DESDE)).not.toBeNull()
  })
})

describe('app/sitemap.ts', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('/privacidad y /terminos con la fecha de vigencia; sin /radar ni /favoritos', async () => {
    // Rama de respaldo (sin variables de Supabase): no toca la red.
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { default: sitemap } = await import('@/app/sitemap')
    const urls = await sitemap()
    const vigencia = fechaDeTextoEnCastellano(VIGENTE_DESDE)!
    const lastmod = (ruta: string) =>
      urls.find((u) => u.url === `https://www.quepintasalta.com.ar${ruta}`)?.lastModified

    expect(lastmod('/privacidad')).toEqual(vigencia)
    expect(lastmod('/terminos')).toEqual(vigencia)
    expect(urls.some((u) => /\/(radar|favoritos)\b/.test(u.url))).toBe(false)
  })
})
