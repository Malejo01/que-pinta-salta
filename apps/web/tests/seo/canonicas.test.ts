// SEO (Search Console, 13/10): 6 páginas "duplicadas sin canónica".
// - La ficha con ?o=<origen> (la métrica de la R20) tiene la canónica SIN el parámetro.
// - Portada, /buscar, /cines y /flyer/<id> declaran la suya.
// - metadataBase en el layout: el host canónico es www.
// - Los links /go/ (salida a la ticketera) llevan rel="nofollow".
// Sin red ni base.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

vi.mock('@/lib/data', () => ({
  getEventById: async (id: string) => ({ id, title: 'Peña de prueba', description: 'Texto', image_url: null }),
  getCategories: async () => [],
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }))
vi.mock('@/components/event-detail-page', () => ({ EventDetailPage: () => null }))
vi.mock('next/font/google', () => {
  const font = () => ({ className: '', variable: '', style: {} })
  return { Montserrat: font, Yellowtail: font, Poppins: font }
})

import { generateMetadata } from '@/app/evento/[id]/page'
import { metadata as layoutMetadata } from '@/app/layout'

const ID = '12345678-1234-4234-8234-123456789abc'

describe('canónicas', () => {
  it('la ficha con ?o=hoy tiene la canónica sin el parámetro', async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ id: ID }),
      searchParams: Promise.resolve({ o: 'hoy' }),
    } as Parameters<typeof generateMetadata>[0])
    expect(meta.alternates?.canonical).toBe(`/evento/${ID}`)
    expect(String(meta.alternates?.canonical)).not.toContain('?')
  })

  it('metadataBase del layout es el host canónico (www) y resuelve la canónica completa', () => {
    expect(layoutMetadata.metadataBase?.toString()).toBe('https://www.quepintasalta.com.ar/')
    expect(new URL(`/evento/${ID}`, layoutMetadata.metadataBase!).toString()).toBe(
      `https://www.quepintasalta.com.ar/evento/${ID}`
    )
  })

  it('el layout no declara una canónica (la heredarían todas las páginas)', () => {
    expect(layoutMetadata.alternates?.canonical).toBeUndefined()
  })

  it.each([
    ['app/page.tsx', 'canonical: "/"'],
    ['app/buscar/page.tsx', 'canonical: "/buscar"'],
    ['app/cines/page.tsx', "canonical: '/cines'"],
    ['app/flyer/[id]/page.tsx', 'canonical: `/flyer/${id}`'],
  ])('%s declara su canónica', (file, expected) => {
    expect(read(file)).toContain(expected)
  })
})

describe('/go/ con nofollow', () => {
  function archivos(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name)
      return statSync(full).isDirectory() ? archivos(full) : /\.tsx$/.test(name) ? [full] : []
    })
  }

  it('cada <a href={goHref(...)}> lleva rel con nofollow', () => {
    const sinNofollow: string[] = []
    let total = 0
    for (const file of [...archivos(join(ROOT, 'app')), ...archivos(join(ROOT, 'components'))]) {
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(/<a\b[^>]*href=\{goHref\([^>]*>/g)) {
        total++
        if (!/rel="[^"]*\bnofollow\b[^"]*"/.test(m[0])) sinNofollow.push(relative(ROOT, file))
      }
    }
    expect(total).toBeGreaterThan(0)
    expect(sinNofollow).toEqual([])
  })
})
