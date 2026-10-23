/**
 * tests/reporte/pagina.test.ts (R58-d): `/reporte/[token]`. El token se valida
 * antes de crear el cliente; inválido e inexistente dan el mismo 404; la
 * página muestra solo cantidades y el nombre del evento, y no se indexa.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createAdminClient, notFound, maybeSingle, eq } = vi.hoisted(() => {
  const maybeSingle = vi.fn()
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  return {
    maybeSingle,
    eq,
    createAdminClient: vi.fn(() => ({ from })),
    notFound: vi.fn(() => {
      throw new Error('NEXT_NOT_FOUND')
    }),
  }
})

vi.mock('@/lib/supabase/server', () => ({ createAdminClient }))
vi.mock('next/navigation', () => ({ notFound }))

import ReportePage, { metadata, dynamic } from '@/app/reporte/[token]/page'

const TOKEN = '0123456789abcdef0123456789abcdef'

async function render(token: string): Promise<string> {
  const el = await ReportePage({ params: Promise.resolve({ token }) })
  return renderToStaticMarkup(el)
}

function reporte(extra: Record<string, unknown> = {}) {
  return {
    tipo: 'destacado',
    desde: '2026-12-01T03:00:00Z',
    hasta: '2026-12-08T02:59:00Z',
    metricas: { dias: 7, vistas: 1234, clics: 50, alcanceEstimado: 817 },
    precio_ars: 14000,
    event: { title: 'Peña de los Gauchos' },
    ...extra,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('/reporte/[token]: el token', () => {
  it.each([
    ['xyz'],
    ['0123456789abcdef0123456789abcde'], // 31
    ['0123456789abcdef0123456789abcdef0'], // 33
    ['0123456789ABCDEF0123456789ABCDEF'], // mayúsculas
    ['../'],
    [''],
  ])('"%s" da notFound sin crear el cliente', async (token) => {
    await expect(render(token)).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalledTimes(1)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('un token válido que no existe da el mismo notFound', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })
    await expect(render(TOKEN)).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalledTimes(1)
    expect(eq).toHaveBeenCalledWith('token', TOKEN)
  })
})

describe('/reporte/[token]: lo que muestra', () => {
  it('el título, las cantidades y la comparación con Meta, sin ningún uuid', async () => {
    maybeSingle.mockResolvedValue({ data: reporte(), error: null })
    const html = await render(TOKEN)
    expect(html).toContain('Peña de los Gauchos')
    expect(html).toContain('Destacado en la portada')
    expect(html).toContain('1.234')
    expect(html).toContain('817')
    expect(html).toContain('Alcance estimado del sitio')
    expect(html).toContain('No se midió en tu evento')
    expect(html).toContain('Como referencia')
    expect(html).toContain('No es una comparación directa')
    expect(html).toContain('precio de lista de la campaña ($ 14.000)')
    expect(html).toContain('$ 280 por clic')
    expect(html).toContain('$ 290')
    expect(html).toContain('referencia del estudio de precios, octubre 2026')
    expect(html).toContain('la mediana publicada de Meta Ads en Argentina ronda $ 290 por clic (dato de terceros, muy variable')
    expect(html).toContain('(precio de lista)')
    expect(html).toContain('Quedó por debajo de esa referencia.')
    expect(html).not.toContain('Salió más barato')
    expect(html).not.toContain('Clics a entradas del evento en el período')
    expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i)
    expect(html).not.toContain(TOKEN)
  })

  it('con 0 clics dice "sin clics todavía" y no compara', async () => {
    maybeSingle.mockResolvedValue({
      data: reporte({ metricas: { dias: 7, vistas: 10, clics: 0, alcanceEstimado: 817 } }),
      error: null,
    })
    const html = await render(TOKEN)
    expect(html).toContain('sin clics todavía')
    expect(html).not.toContain('mediana de Meta')
    expect(html).not.toContain('Como referencia')
    expect(html).not.toContain('No es una comparación directa')
    expect(html).not.toContain('precio de lista')
    expect(html).toContain('text-base text-muted-foreground')
  })

  it('las cifras medidas van antes del alcance estimado, que lleva borde punteado', async () => {
    maybeSingle.mockResolvedValue({ data: reporte(), error: null })
    const html = await render(TOKEN)
    const vistas = html.indexOf('Vistas de la ficha del evento')
    const clics = html.indexOf('Clics a entradas')
    const alcance = html.indexOf('Alcance estimado del sitio')
    expect(vistas).toBeGreaterThan(-1)
    expect(clics).toBeGreaterThan(vistas)
    expect(alcance).toBeGreaterThan(clics)
    expect(html).toContain('border-dashed')
    expect(html).toContain('min-h-dvh')
    expect(html).not.toContain('Personas alcanzadas')
  })

  it('el push muestra a cuántas personas llegó', async () => {
    maybeSingle.mockResolvedValue({
      data: reporte({
        tipo: 'push',
        metricas: { dias: 1, vistas: 10, clics: 2, alcanceEstimado: 100, destinatarios: 321, bajas48h: 1 },
      }),
      error: null,
    })
    const html = await render(TOKEN)
    expect(html).toContain('Push patrocinado')
    expect(html).toContain('321')
    expect(html).toContain('Personas a las que llegó el aviso')
    expect(html).toContain('Clics a entradas del evento en el período')
    expect(html).toContain('Calculado con los clics del evento en el período.')
  })

  it.each([
    [{ dias: 7, vistas: 'mucho', clics: 3 }],
    [{ dias: 7, vistas: 10, clics: -1 }],
    [{ dias: 7, vistas: 10, clics: 3, token: 'x' }],
    [[1, 2]],
    ['texto'],
    [{}],
  ])('metricas inválidas (%j): "El reporte todavía no tiene datos" y nada más', async (metricas) => {
    maybeSingle.mockResolvedValue({ data: reporte({ metricas }), error: null })
    const html = await render(TOKEN)
    expect(html).toContain('El reporte todavía no tiene datos')
    expect(html).not.toContain('Clics a entradas')
    expect(html).not.toContain('por clic')
  })

  it('sin links externos: ni un <a>', async () => {
    maybeSingle.mockResolvedValue({ data: reporte(), error: null })
    const html = await render(TOKEN)
    expect(html).not.toMatch(/<a[\s>]/i)
    expect(html).not.toMatch(/https?:\/\//i)
  })

  it('un error de lectura no se disfraza de 404', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'boom' } })
    await expect(render(TOKEN)).rejects.toThrow('XX000')
    expect(notFound).not.toHaveBeenCalled()
  })
})

describe('/reporte/[token]: sin indexar', () => {
  it('metadata.robots es noindex/nofollow y la página es dinámica', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
    expect(dynamic).toBe('force-dynamic')
  })

  it('app/sitemap.ts no menciona /reporte', () => {
    const ruta = fileURLToPath(new URL('../../app/sitemap.ts', import.meta.url))
    expect(readFileSync(ruta, 'utf8')).not.toContain('/reporte')
  })

  it('la consulta pide solo las columnas del reporte (sin created_by, event_id ni token)', () => {
    const ruta = fileURLToPath(new URL('../../app/reporte/[token]/page.tsx', import.meta.url))
    const fuente = readFileSync(ruta, 'utf8')
    const select = /\.select\("([^"]+)"\)/.exec(fuente)?.[1] ?? ''
    expect(select).toBe('tipo, desde, hasta, metricas, precio_ars, event:events(title)')
    expect(fuente).not.toMatch(/created_by|sponsored_campaign_id/)
  })
})
