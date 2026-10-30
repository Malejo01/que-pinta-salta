// B2: el lastModified de /privacidad y /terminos en el sitemap es la fecha de
// vigencia de la versión (components/legal/vigencia.ts), no `now` en cada
// regeneración; nunca en el futuro; y sin fecha real (/eliminar-cuenta, o
// una vigencia que no se puede leer) el campo no va. Se ejecuta la rama que
// sirve producción (con Supabase configurado), con un doble de
// @supabase/supabase-js que devuelve tablas vacías. Sin red ni base.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VIGENTE_DESDE } from '@/components/legal/vigencia'
import { ANUNCIANTES } from '@/lib/config/anunciantes'
import { fechaDeTextoEnCastellano } from '@/lib/seo/fecha-legal'

/** Query builder falso: cualquier cadena de select/eq/gte/order, y `await` da `{ data: [], error: null }`. */
function consultaVacia(): Record<string, unknown> {
  const consulta: Record<string, unknown> = {}
  const encadenar = () => consulta
  consulta.select = encadenar
  consulta.eq = encadenar
  consulta.gte = encadenar
  consulta.order = encadenar
  consulta.then = (ok?: (v: unknown) => unknown, error?: (e: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(ok, error)
  return consulta
}

const createClient = vi.fn(() => ({ from: () => consultaVacia() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => createClient() }))

const BASE = 'https://www.quepintasalta.com.ar'

/** Corre el sitemap con una VIGENTE_DESDE a elección (módulos frescos). */
async function sitemapCon(vigenteDesde: string) {
  vi.resetModules()
  vi.doMock('@/components/legal/vigencia', () => ({ VERSION_LEGAL: 1, VIGENTE_DESDE: vigenteDesde }))
  const { default: sitemap } = await import('@/app/sitemap')
  const urls = await sitemap()
  const entrada = (ruta: string) => urls.find((u) => u.url === `${BASE}${ruta}`)
  return { urls, entrada }
}

describe('fechaDeTextoEnCastellano', () => {
  it('lee «D de <mes> de AAAA» como las 00:00 de Salta', () => {
    expect(fechaDeTextoEnCastellano('23 de octubre de 2026')?.toISOString()).toBe('2026-10-23T03:00:00.000Z')
    expect(fechaDeTextoEnCastellano('1 de Enero de 2027')?.toISOString()).toBe('2027-01-01T03:00:00.000Z')
    expect(fechaDeTextoEnCastellano('5 de setiembre de 2026')?.toISOString()).toBe('2026-09-05T03:00:00.000Z')
  })

  it('acepta el ordinal del primer día (1° / 1º) y «del» antes del año', () => {
    expect(fechaDeTextoEnCastellano('1° de noviembre de 2026')?.toISOString()).toBe('2026-11-01T03:00:00.000Z')
    expect(fechaDeTextoEnCastellano('1º de noviembre de 2026')?.toISOString()).toBe('2026-11-01T03:00:00.000Z')
    expect(fechaDeTextoEnCastellano('23 de octubre del 2026')?.toISOString()).toBe('2026-10-23T03:00:00.000Z')
  })

  it('null para lo que no es una fecha', () => {
    expect(fechaDeTextoEnCastellano('[COMPLETAR: fecha]')).toBeNull()
    expect(fechaDeTextoEnCastellano('23 de octubrr de 2026')).toBeNull()
    expect(fechaDeTextoEnCastellano('31 de febrero de 2026')).toBeNull()
    expect(fechaDeTextoEnCastellano('23 de octubre dell 2026')).toBeNull()
    expect(fechaDeTextoEnCastellano('')).toBeNull()
  })

  it('la VIGENTE_DESDE de hoy se puede leer (si no, las legales quedan sin lastmod)', () => {
    expect(fechaDeTextoEnCastellano(VIGENTE_DESDE)).not.toBeNull()
  })
})

describe('app/sitemap.ts, rama con Supabase configurado', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proyecto-de-prueba.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'clave-anonima-de-prueba')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-27T15:00:00.000Z'))
    createClient.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.doUnmock('@/components/legal/vigencia')
  })

  it('/privacidad y /terminos con la fecha de vigencia; /eliminar-cuenta sin lastModified', async () => {
    const { entrada } = await sitemapCon('23 de octubre de 2026')
    expect(createClient).toHaveBeenCalled() // no cayó en la rama de respaldo
    const vigencia = new Date('2026-10-23T03:00:00.000Z')
    expect(entrada('/privacidad')?.lastModified).toEqual(vigencia)
    expect(entrada('/terminos')?.lastModified).toEqual(vigencia)
    expect(entrada('/eliminar-cuenta')).toBeDefined()
    expect(entrada('/eliminar-cuenta')).not.toHaveProperty('lastModified')
  })

  it('una vigencia futura no da un lastmod en el futuro: queda en ahora', async () => {
    const { entrada } = await sitemapCon('1° de enero de 2027')
    expect(entrada('/privacidad')?.lastModified).toEqual(new Date('2026-10-27T15:00:00.000Z'))
    expect(entrada('/terminos')?.lastModified).toEqual(new Date('2026-10-27T15:00:00.000Z'))
  })

  it('si la vigencia no se puede leer, las legales van sin lastModified (no `now`)', async () => {
    const { entrada } = await sitemapCon('[COMPLETAR: fecha]')
    expect(entrada('/privacidad')).toBeDefined()
    expect(entrada('/privacidad')).not.toHaveProperty('lastModified')
    expect(entrada('/terminos')).not.toHaveProperty('lastModified')
  })

  it('sin filas, el sitemap son exactamente las rutas públicas fijas (ni /radar ni /favoritos, que son privadas)', async () => {
    const { urls } = await sitemapCon('23 de octubre de 2026')
    expect(urls.map((u) => u.url.slice(BASE.length))).toEqual([
      '',
      '/en',
      '/cines',
      '/en/cines',
      '/buscar',
      '/en/buscar',
      '/mapa',
      '/en/mapa',
      '/privacidad',
      '/terminos',
      '/eliminar-cuenta',
      ...(ANUNCIANTES.publicada ? ['/anunciantes'] : []),
    ])
  })
})
