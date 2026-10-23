// /admin/publicidad (R58, 58-c): la protección de la página, lo que muestra
// (la marca del tipo de cambio 'anterior', el interruptor, la pausa, los links
// de reporte) y el menú. Sin red ni base: se mockean next/navigation y el
// cliente de Supabase (para la sesión), y la lectura del panel
// (obtenerPanelPublicidad) devuelve lo que arma cada test. La página se llama
// como función async de servidor y su resultado se renderiza a HTML estático.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// El diálogo de confirmación está cerrado en el HTML estático: se renderiza inline para leer su texto.
vi.mock('@/components/ui/alert-dialog', () => {
  const pasa = ({ children }: { children?: unknown }) => children
  return {
    AlertDialog: pasa,
    AlertDialogTrigger: pasa,
    AlertDialogContent: pasa,
    AlertDialogHeader: pasa,
    AlertDialogFooter: pasa,
    AlertDialogTitle: pasa,
    AlertDialogDescription: pasa,
    AlertDialogAction: pasa,
    AlertDialogCancel: pasa,
  }
})

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error('redirect: ' + url)
  },
  useRouter: () => ({ refresh: vi.fn() }),
}))

type Ciclo = {
  ciclo: string
  estado: string
  audiencia: number
  audiencia_web_28d: number
  fuente_audiencia: string
  tramo_calculado: number
  tramo_vigente: number
  cambio_tramo_desde: string | null
  tipo_cambio: number
  fuente_tipo_cambio: string
  factor_hero: number
  factor_push: number
  approved_at: string | null
}

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  role: null as string | null,
  panel: null as unknown,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from() {
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: state.role ? { role: state.role } : null }) }),
        }),
      }
    },
  }),
}))

vi.mock('@/lib/admin/publicidad-actions', () => ({
  obtenerPanelPublicidad: async () => state.panel,
  aprobarCiclo: vi.fn(),
  cambiarAprobacionAutomatica: vi.fn(),
  cargarAudienciaYTipoCambio: vi.fn(),
  reanudarPushPatrocinado: vi.fn(),
}))

import AdminPublicidadPage from '@/app/admin/publicidad/page'

const TOKEN = 'abcdef0123456789abcdef0123456789'

function ciclo(extra: Partial<Ciclo> = {}): Ciclo {
  return {
    ciclo: '2026-11-01',
    estado: 'propuesto',
    audiencia: 490,
    audiencia_web_28d: 490,
    fuente_audiencia: 'manual',
    tramo_calculado: 500,
    tramo_vigente: 500,
    cambio_tramo_desde: null,
    tipo_cambio: 1530,
    fuente_tipo_cambio: 'bna',
    factor_hero: 1,
    factor_push: 1,
    approved_at: null,
    ...extra,
  }
}

function panel(extra: Record<string, unknown> = {}) {
  return {
    propuesto: {
      ciclo: ciclo(),
      precios: [
        { producto: 'destacado-7', precio_usd: 9.14, precio_ars: 14500, precio_fundador_ars: 10000, estado: 'propuesto' },
      ],
    },
    vigente: {
      ciclo: ciclo({ ciclo: '2026-10-01', estado: 'aprobado' }),
      precios: [
        { producto: 'destacado-7', precio_usd: 9.14, precio_ars: 14000, precio_fundador_ars: 10000, estado: 'aprobado' },
      ],
    },
    ciclosAprobados: 3,
    ajustes: {
      aprobacion_automatica: false,
      push_patrocinado_pausado_at: null,
      push_patrocinado_pausa_motivo: null,
      umbral_bajas_push: 0.02,
    },
    ocupacion: [],
    reportes: [],
    ...extra,
  }
}

async function renderizar(): Promise<string> {
  return renderToStaticMarkup(await AdminPublicidadPage())
}

/** El `<button ...>` del interruptor, para mirar si está deshabilitado. */
function botonInterruptor(html: string): string {
  const m = /<button[^>]*id="interruptor-automatico"[^>]*>/.exec(html)
  expect(m, 'no se encontró el botón del interruptor').not.toBeNull()
  return m![0]
}

beforeEach(() => {
  state.user = { id: 'admin-de-prueba' }
  state.role = 'ADMIN'
  state.panel = panel()
})

describe('/admin/publicidad: protección', () => {
  it('sin usuario: redirige a /auth/login?redirect=/admin/publicidad', async () => {
    state.user = null
    await expect(AdminPublicidadPage()).rejects.toThrow('redirect: /auth/login?redirect=/admin/publicidad')
  })

  it('sin rol ADMIN: redirige a /?error=unauthorized', async () => {
    state.role = 'USER'
    await expect(AdminPublicidadPage()).rejects.toThrow('redirect: /?error=unauthorized')
  })

  it('si el panel viene vacío (sin admin en la acción): redirige', async () => {
    state.panel = null
    await expect(AdminPublicidadPage()).rejects.toThrow('redirect: /?error=unauthorized')
  })
})

describe('/admin/publicidad: el ciclo propuesto', () => {
  it('muestra el mes, la audiencia con su fuente, los precios y la diferencia contra el vigente', async () => {
    const html = await renderizar()
    expect(html).toContain('noviembre de 2026')
    expect(html).toContain('fuente: cargada a mano')
    expect(html).toContain('Destacado 7 días')
    expect(html).toContain('$ 14.500')
    expect(html).toContain('+$ 500')
    expect(html).toContain('visitantes únicos de 28 días de Vercel Analytics')
    expect(html).toContain('Aprobar')
  })

  it('con el tipo de cambio "anterior" aparece la marca de advertencia', async () => {
    state.panel = panel({
      propuesto: { ciclo: ciclo({ fuente_tipo_cambio: 'anterior', audiencia_web_28d: 520 }), precios: [] },
    })
    const html = await renderizar()
    expect(html).toContain('fuente: del mes anterior')
    expect(html).toContain('Es el del mes anterior')
    expect(html).toContain('border-amber-500')
    expect(html).toContain('falta cargar el dólar del mes anterior')
  })

  it('con la audiencia igual a la del ciclo vigente, avisa que falta cargarla y lo suma a "Antes de aprobar"', async () => {
    const html = await renderizar() // propuesto 490 = vigente 490
    expect(html).toContain('Es la audiencia del mes anterior: cargala a mano antes de aprobar.')
    expect(html).toContain('falta cargar la audiencia del mes anterior')
  })

  it('con la audiencia en 0 también avisa', async () => {
    state.panel = panel({
      propuesto: { ciclo: ciclo({ audiencia_web_28d: 0, audiencia: 0 }), precios: [] },
      vigente: null,
    })
    const html = await renderizar()
    expect(html).toContain('Es la audiencia del mes anterior')
  })

  it('con la audiencia cargada y el dólar al día: sin avisos y "Todo cargado"', async () => {
    state.panel = panel({
      propuesto: { ciclo: ciclo({ audiencia_web_28d: 520, audiencia: 520 }), precios: [] },
    })
    const html = await renderizar()
    expect(html).not.toContain('Es la audiencia del mes anterior')
    expect(html).toContain('Todo cargado')
    expect(html).not.toContain('Todavía falta cargar')
  })

  it('el diálogo de Aprobar muestra en negrita lo que falta cargar', async () => {
    state.panel = panel({
      propuesto: { ciclo: ciclo({ fuente_tipo_cambio: 'anterior' }), precios: [] }, // audiencia 490 = vigente, dólar anterior
    })
    const html = await renderizar()
    expect(html).toContain(
      '<strong class="font-semibold text-foreground">Todavía falta cargar la audiencia del mes anterior y el dólar del mes anterior.</strong>',
    )
  })

  it('traduce las fuentes a texto legible', async () => {
    state.panel = panel({
      propuesto: { ciclo: ciclo({ audiencia_web_28d: 520, fuente_audiencia: 'vercel', fuente_tipo_cambio: 'dolarapi' }), precios: [] },
    })
    const html = await renderizar()
    expect(html).toContain('fuente: Vercel Analytics')
    expect(html).toContain('fuente: dolarapi (BNA vendedor)')
  })

  it('con el tipo de cambio del BNA no hay marca', async () => {
    const html = await renderizar()
    expect(html).not.toContain('Es el del mes anterior')
  })

  it('con un cambio de tramo anunciado, muestra la fecha y el tramo nuevo', async () => {
    state.panel = panel({
      propuesto: { ciclo: ciclo({ cambio_tramo_desde: '2026-12-01', tramo_calculado: 1000 }), precios: [] },
    })
    const html = await renderizar()
    expect(html).toContain('Cambio de tramo anunciado')
    expect(html).toContain('diciembre de 2026')
  })

  it('sin ciclo propuesto, lo dice', async () => {
    state.panel = panel({ propuesto: null })
    const html = await renderizar()
    expect(html).toContain('No hay un ciclo propuesto')
  })
})

describe('/admin/publicidad: el interruptor de aprobación automática', () => {
  it('con 2 ciclos aprobados está deshabilitado y dice cuántos van', async () => {
    state.panel = panel({ ciclosAprobados: 2 })
    const html = await renderizar()
    expect(botonInterruptor(html)).toContain('disabled=""')
    expect(html).toContain('Se puede prender después de 3 ciclos aprobados a mano (van 2)')
  })

  it('con 3 ciclos aprobados está habilitado', async () => {
    const html = await renderizar()
    expect(botonInterruptor(html)).not.toContain('disabled=""')
  })
})

describe('/admin/publicidad: el push patrocinado', () => {
  it('pausado: muestra la fecha, el motivo y "Reanudar"', async () => {
    state.panel = panel({
      ajustes: {
        aprobacion_automatica: false,
        push_patrocinado_pausado_at: '2026-10-20T15:00:00.000Z',
        push_patrocinado_pausa_motivo: 'Bajas del 3% en 48 h',
        umbral_bajas_push: 0.02,
      },
    })
    const html = await renderizar()
    expect(html).toContain('Reanudar')
    expect(html).toContain('20/10')
    expect(html).toContain('Bajas del 3% en 48 h')
  })

  it('activo: dice "Activo" y el umbral como porcentaje, sin "Reanudar"', async () => {
    const html = await renderizar()
    expect(html).toContain('Activo')
    expect(html).toContain('2%')
    expect(html).not.toContain('Reanudar')
  })
})

describe('/admin/publicidad: ocupación y reportes', () => {
  it('muestra el promedio de cada mes', async () => {
    state.panel = panel({
      ocupacion: [
        { day: '2026-10-01', hero_ocupados: 5, hero_cupos: 10, push_cupos_usados: 1, push_cupos: 1 },
        { day: '2026-10-02', hero_ocupados: 3, hero_cupos: 10, push_cupos_usados: 0, push_cupos: 1 },
      ],
    })
    const html = await renderizar()
    expect(html).toContain('octubre de 2026: Hero 40%')
    expect(html).toContain('Push 50%')
  })

  it('los links de reporte son /reporte/<token> y se aclara que no se mandan mails', async () => {
    state.panel = panel({
      reportes: [
        { id: 'r1', tipo: 'destacado', desde: '2026-10-01T03:00:00Z', hasta: '2026-10-08T03:00:00Z', token: TOKEN, titulo: 'Fiesta' },
      ],
    })
    const html = await renderizar()
    expect(html).toContain(`/reporte/${TOKEN}`)
    expect(html).toContain('Fiesta')
    expect(html).toContain('Copiar link')
    expect(html).toContain('esta pantalla no manda mails')
  })
})

describe('el menú de /admin tiene "Publicidad" y conserva lo de antes', () => {
  const leer = (relativa: string) => readFileSync(fileURLToPath(new URL(relativa, import.meta.url)), 'utf8')

  it('navItems de layout.tsx', () => {
    const fuente = leer('../../app/admin/layout.tsx')
    expect(fuente).toMatch(/href:\s*["']\/admin\/publicidad["']/)
    expect(fuente).toMatch(/label:\s*["']Publicidad["']/)
    for (const href of ['aliases', 'users', 'pendientes', 'instagram', 'revision', 'duplicados', 'lugares', 'destacados', 'avisos']) {
      expect(fuente, href).toMatch(new RegExp(`href:\\s*["']/admin/${href}["']`))
    }
  })

  it('adminSections de page.tsx', () => {
    const fuente = leer('../../app/admin/page.tsx')
    expect(fuente).toMatch(/href:\s*['"]\/admin\/publicidad['"]/)
    expect(fuente).toMatch(/title:\s*['"]Publicidad['"]/)
    for (const href of ['scrape', 'clasificacion', 'revision', 'lugares', 'destacados', 'avisos']) {
      expect(fuente, href).toMatch(new RegExp(`href:\\s*['"]/admin/${href}['"]`))
    }
  })
})
