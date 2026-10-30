/**
 * R58, 58-q: privacidad. Ninguna tabla nueva guarda datos personales y las bajas
 * del push patrocinado se CUENTAN, nunca se guarda ni se muestra quién.
 *
 * Dos clases de prueba:
 *  - detectores sobre el TEXTO de los archivos de producción (un cambio que
 *    pase un `user_id` a `console`, a `details`, a `errors` o a lo que devuelve
 *    la medición se pone en rojo aunque ningún otro test lo ejercite), y
 *  - corridas con ids inventados contra el doble en memoria, que buscan esos
 *    ids en TODO lo que sale (consola, respuesta, `job_runs`, lo que se guarda).
 *
 * Sin red ni base. Ids, tokens y títulos inventados.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { quitarComentarios as sinComentarios } from '@qps/core/tests/convencion-entorno'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sembrar, type Fila } from './_soporte/doble-supabase'
import {
  ADMIN_ID,
  PUSH,
  SECRETO,
  crearFetch,
  entorno,
  fijarAhora,
  idEvento,
  idUsuario,
  prohibiciones,
  reiniciar,
  sembrarDestacados,
  sembrarEscenarioPush,
  servicio,
} from './_soporte/entorno'

vi.mock('@/lib/supabase/server', async () => {
  const { servicio, sesion } = await import('./_soporte/entorno')
  return { createAdminClient: () => servicio(), createClient: async () => sesion() }
})
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

import { GET as cronPublicidad } from '@/app/api/cron/publicidad/route'
import ReportePage from '@/app/reporte/[token]/page'
import {
  aprobarCiclo,
  cambiarAprobacionAutomatica,
  cargarAudienciaYTipoCambio,
  obtenerPanelPublicidad,
  reanudarPushPatrocinado,
} from '@/lib/admin/publicidad-actions'
import { cargarTarifarioVigente } from '@/lib/anunciantes/precios'
import { medirBajas } from '@/lib/publicidad/bajas'

// ---------------------------------------------------------------------------
// Lectura de archivos de producción
// ---------------------------------------------------------------------------

const APP = fileURLToPath(new URL('../../', import.meta.url))
const RAIZ = fileURLToPath(new URL('../../../../', import.meta.url))

const leer = (rutaDesdeApp: string): string => readFileSync(`${APP}${rutaDesdeApp}`, 'utf8')

const DIR_PUBLICIDAD = 'lib/publicidad'
const RUTA_CRON = 'app/api/cron/publicidad/route.ts'
const ARCHIVOS_PUBLICIDAD = readdirSync(`${APP}${DIR_PUBLICIDAD}`)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => `${DIR_PUBLICIDAD}/${f}`)
const ARCHIVOS_DEL_CRON = [...ARCHIVOS_PUBLICIDAD, RUTA_CRON]

/** Sin comentarios (un `//` solo cuenta si va al principio o después de un espacio: no corta las URL de las cadenas). */


/** El texto entre el paréntesis (o llave) que abre en `indice` y el que lo cierra. */
function balanceado(texto: string, indice: number): string {
  const apertura = texto[indice]
  const cierre = apertura === '(' ? ')' : apertura === '{' ? '}' : ']'
  let profundidad = 0
  for (let i = indice; i < texto.length; i++) {
    if (texto[i] === apertura) profundidad += 1
    if (texto[i] === cierre) {
      profundidad -= 1
      if (profundidad === 0) return texto.slice(indice + 1, i)
    }
  }
  return texto.slice(indice + 1)
}

/** Todos los argumentos de las llamadas que empiezan con `prefijo` (por ejemplo `console.`). */
function argumentosDeLlamadas(texto: string, patron: RegExp): string[] {
  const salida: string[] = []
  const re = new RegExp(patron.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(texto)) !== null) {
    const abre = m.index + m[0].length - 1
    salida.push(balanceado(texto, abre))
  }
  return salida
}

/** Lo que huele a persona en un mensaje, un log o un `details`: un user_id, un correo, el mapa por usuario, o interpolar los envíos o las preferencias. */
const HUELE_A_PERSONA = /user_?id|e-?mail|porUsuario|\$\{[^}]*(?:envio|usuario|pref)/i

/** Lo mismo, más estricto, para los tipos que se exportan: ningún campo de personas, envíos ni preferencias. */
const HUELE_A_PERSONA_EN_TIPOS = /user_?id|\busuarios?\b|e-?mail|\benvios?\b|porUsuario|preferencias?/i

// ---------------------------------------------------------------------------
// 1. Detectores sobre el texto
// ---------------------------------------------------------------------------

describe('privacidad: lib/publicidad y la ruta del cron (detectores sobre el texto)', () => {
  it('encuentra los archivos que tiene que mirar (la prueba no puede pasar vacía)', () => {
    expect(ARCHIVOS_PUBLICIDAD.length).toBeGreaterThanOrEqual(5)
    for (const f of ['bajas', 'ciclo', 'fuentes', 'ocupacion', 'reportes']) {
      expect(ARCHIVOS_PUBLICIDAD).toContain(`${DIR_PUBLICIDAD}/${f}.ts`)
    }
    expect(existsSync(`${APP}${RUTA_CRON}`)).toBe(true)
  })

  it.each(ARCHIVOS_DEL_CRON)('%s: ningún console.* recibe un user_id, una persona ni un mensaje crudo de error', (archivo) => {
    const texto = sinComentarios(leer(archivo))
    for (const args of argumentosDeLlamadas(texto, /console\.\w+\(/)) {
      expect(args, `console en ${archivo}`).not.toMatch(HUELE_A_PERSONA)
      expect(args, `console en ${archivo}`).not.toMatch(/\.message\b/)
    }
  })

  it.each(ARCHIVOS_PUBLICIDAD)('%s: los mensajes de error son texto fijo (sin ids, sin el mensaje crudo de la base)', (archivo) => {
    const texto = sinComentarios(leer(archivo))
    for (const args of argumentosDeLlamadas(texto, /throw new Error\(/)) {
      expect(args, `throw en ${archivo}`).not.toMatch(HUELE_A_PERSONA)
      expect(args, `throw en ${archivo}`).not.toMatch(/\.message\b/)
      // Lo único que se interpola es una fecha de ciclo.
      for (const interpolado of args.matchAll(/\$\{([^}]*)\}/g)) {
        expect(interpolado[1], `interpolación en ${archivo}`).toMatch(/^(ciclo)$/)
      }
    }
  })

  it('la ruta: ni details ni errors llevan ids de personas', () => {
    const texto = sinComentarios(leer(RUTA_CRON))
    const bloques = [
      ...argumentosDeLlamadas(texto, /errores\.push\(/),
      ...argumentosDeLlamadas(texto, /errors\.push\(/),
    ]
    const details = /details:\s*\{/.exec(texto)
    expect(details, 'la ruta arma details').not.toBeNull()
    bloques.push(balanceado(texto, (details?.index ?? 0) + (details?.[0].length ?? 1) - 1))
    const errors = /errors:\s*\[?/.exec(texto)
    if (errors) bloques.push(texto.slice(errors.index, errors.index + 80))
    for (const b of bloques) expect(b).not.toMatch(HUELE_A_PERSONA)
    // La respuesta de la ruta tampoco devuelve la lista de errores: el detalle se queda en job_runs.
    const desdeGet = texto.slice(texto.indexOf('export async function GET'))
    const respuesta = /NextResponse\.json\(\{/.exec(desdeGet)
    expect(respuesta).not.toBeNull()
    const cuerpo = balanceado(desdeGet, (respuesta?.index ?? 0) + (respuesta?.[0].length ?? 1) - 1)
    expect(cuerpo).not.toMatch(/errores|errors\b/)
    expect(cuerpo).not.toMatch(HUELE_A_PERSONA)
  })

  it('nada fuera de bajas.ts nombra un user_id, y la ruta no lo nombra en ninguna parte', () => {
    for (const archivo of ARCHIVOS_DEL_CRON.filter((f) => f !== `${DIR_PUBLICIDAD}/bajas.ts`)) {
      expect(sinComentarios(leer(archivo)), archivo).not.toMatch(/user_?id/i)
    }
  })

  it('los tipos exportados de lib/publicidad no tienen campos de personas', () => {
    for (const archivo of ARCHIVOS_PUBLICIDAD) {
      const texto = sinComentarios(leer(archivo))
      const re = /export (?:interface|type) \w+[^{=]*[{=]/g
      let m: RegExpExecArray | null
      while ((m = re.exec(texto)) !== null) {
        const cuerpo = m[0].endsWith('{') ? balanceado(texto, m.index + m[0].length - 1) : texto.slice(m.index, m.index + 300)
        expect(cuerpo, `${archivo}: ${m[0]}`).not.toMatch(HUELE_A_PERSONA_EN_TIPOS)
      }
    }
  })

  it('medirBajas solo devuelve cantidades: el mapa de envíos (user_id -> fecha) no sale de la función', () => {
    const texto = sinComentarios(leer(`${DIR_PUBLICIDAD}/bajas.ts`))
    const inicio = texto.indexOf('export async function medirBajas')
    expect(inicio).toBeGreaterThan(-1)
    const abre = texto.indexOf('{', texto.indexOf(')', inicio) + 1)
    const cuerpo = balanceado(texto, abre)
    // La firma: una promesa del resultado numérico.
    expect(texto.slice(inicio, abre)).toMatch(/Promise<ResultadoBajas>/)
    expect(cuerpo).not.toMatch(/user_?id/i)
    // `envios` (los user_id de los destinatarios) solo se usa para contar y para pasárselo a quien cuenta.
    const usos = [...cuerpo.matchAll(/\benvios\b(?!\s*=)/g)].map((m) => cuerpo.slice(Math.max(0, m.index - 20), m.index + 12))
    expect(usos.length).toBeGreaterThan(0)
    for (const uso of usos) expect(uso).toMatch(/envios\.size|contarBajas\(admin, envios/)
    // Y el resultado declarado son números y un booleano, nada más.
    const resultado = /interface ResultadoBajas\s*\{/.exec(texto)
    expect(resultado).not.toBeNull()
    const campos = balanceado(texto, (resultado?.index ?? 0) + (resultado?.[0].length ?? 1) - 1)
    const tipos = [...campos.matchAll(/:\s*([^\n;]+)/g)].map((m) => m[1].trim())
    expect(tipos.length).toBeGreaterThan(0)
    for (const t of tipos) expect(t).toMatch(/^(number|boolean)$/)
  })
})

describe('privacidad: /reporte/[token] y /anunciantes no seleccionan columnas *_by', () => {
  const ARCHIVOS_PUBLICOS = [
    'app/reporte/[token]/page.tsx',
    'app/anunciantes/page.tsx',
    'lib/anunciantes/precios.ts',
    'lib/anunciantes/metricas.ts',
  ]

  function selects(archivo: string): string[] {
    const texto = sinComentarios(leer(archivo))
    return [...texto.matchAll(/\.select\(\s*(["'`])([\s\S]*?)\1/g)].map((m) => m[2])
  }

  it('encuentra las consultas que tiene que mirar', () => {
    expect(selects('app/reporte/[token]/page.tsx').length).toBeGreaterThan(0)
    expect(selects('lib/anunciantes/precios.ts').length).toBeGreaterThanOrEqual(2)
  })

  it.each(ARCHIVOS_PUBLICOS)('%s: ningún select pide approved_by, created_by, updated_by ni featured_set_by, ni "*"', (archivo) => {
    for (const columnas of selects(archivo)) {
      expect(columnas, archivo).not.toMatch(/_by\b/)
      expect(columnas.trim(), archivo).not.toBe('*')
    }
  })

  describe('en una corrida con datos que SÍ tienen esas columnas llenas', () => {
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
    })
    afterEach(() => vi.restoreAllMocks())

    it('el HTML del reporte y la lista de precios no traen el id del admin ni del creador, y las consultas no los piden', async () => {
      const a = reiniciar()
      const CREADOR = idUsuario(4242)
      sembrar(a, 'events', [
        { id: idEvento(1), title: 'Evento de Prueba', slug: 'evento-de-prueba', status: 'PUBLISHED', start_date: '2026-12-20T23:00:00.000Z', created_by: CREADOR },
      ])
      sembrar(a, 'ad_price_cycles', [
        {
          ciclo: '2026-12-01',
          audiencia_web_28d: 490,
          audiencia: 490,
          fuente_audiencia: 'manual',
          tramo_calculado: 500,
          tramo_vigente: 500,
          cambio_tramo_desde: '2027-01-01',
          tipo_cambio: 1530,
          fuente_tipo_cambio: 'dolarapi',
          factor_hero: 1,
          factor_push: 1,
          estado: 'aprobado',
          approved_at: '2026-12-01T10:00:00.000Z',
          approved_by: ADMIN_ID,
        },
      ])
      sembrar(a, 'ad_prices', [
        {
          ciclo: '2026-12-01',
          producto: 'destacado-7',
          tramo_ref: 500,
          precio_usd: 9.14,
          precio_ars: 14000,
          precio_fundador_ars: 10000,
          tipo_cambio: 1530,
          vigente_desde: '2026-12-01',
          estado: 'aprobado',
        },
      ])
      const TOKEN = 'cafe0000000000000000000000000001'
      sembrar(a, 'ad_campaign_reports', [
        {
          event_id: idEvento(1),
          tipo: 'destacado',
          sponsored_campaign_id: null,
          desde: '2026-12-01T12:00:00.000Z',
          hasta: '2026-12-08T12:00:00.000Z',
          metricas: { dias: 8, vistas: 600, clics: 30, alcanceEstimado: 93 },
          precio_ars: 14000,
          token: TOKEN,
          created_by: CREADOR,
        },
      ])

      const html = renderToStaticMarkup(await ReportePage({ params: Promise.resolve({ token: TOKEN }) }))
      const tarifario = await cargarTarifarioVigente(servicio(), '2026-12-15')

      for (const salida of [html, JSON.stringify(tarifario)]) {
        expect(salida).not.toContain(ADMIN_ID)
        expect(salida).not.toContain(CREADOR)
      }
      expect(tarifario.aviso).toBe('Desde el 1/1, los precios pasan al tramo de 500 personas.')

      // Lo que pidieron las páginas a las tablas ad_*: ninguna columna *_by.
      const pedidos = a.llamadas.filter((l) => l.tabla.startsWith('ad_') && l.op === 'select')
      expect(pedidos.length).toBeGreaterThanOrEqual(3)
      for (const p of pedidos) {
        expect(p.columnas, `${p.tabla}`).not.toBeNull()
        expect(p.columnas, `${p.tabla}`).not.toMatch(/_by\b|\*/)
      }
    })
  })
})

describe('privacidad: lib/admin/publicidad-actions.ts no usa la service key', () => {
  const ARCHIVO = 'lib/admin/publicidad-actions.ts'
  const CLAVE = /createAdminClient|SUPABASE_SERVICE_ROLE_KEY|service[_-]?role/i

  function importsDe(texto: string): Array<{ nombres: string; desde: string }> {
    return [...texto.matchAll(/import\s+(?:type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g)].map((m) => ({ nombres: m[1], desde: m[2] }))
  }

  /** Alias `@/` y `@qps/core/`, y rutas relativas, a un archivo del repositorio. `null` si es un paquete. */
  function resolver(desde: string, importador: string): string | null {
    let base: string
    if (desde.startsWith('@/')) base = `${APP}${desde.slice(2)}`
    else if (desde.startsWith('@qps/core/')) base = `${RAIZ}packages/core/src/${desde.slice('@qps/core/'.length)}`
    else if (desde.startsWith('.')) base = `${importador.replace(/[^/]*$/, '')}${desde}`
    else return null
    for (const candidato of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
      if (existsSync(candidato) && !candidato.endsWith('/')) {
        try {
          readFileSync(candidato, 'utf8')
          return candidato
        } catch {
          // es un directorio
        }
      }
    }
    return null
  }

  const texto = sinComentarios(leer(ARCHIVO))

  it('el texto no nombra la service key ni createAdminClient', () => {
    expect(texto).not.toMatch(CLAVE)
  })

  it('de lo que importa de @/lib/supabase/server, solo createClient', () => {
    const delServidor = importsDe(texto).filter((i) => i.desde === '@/lib/supabase/server')
    expect(delServidor).toHaveLength(1)
    expect(delServidor[0].nombres.replace(/[{}\s]/g, '')).toBe('createClient')
  })

  it('grafo de imports a un nivel: ningún archivo propio que importa saca o usa la service key', () => {
    const propios = importsDe(texto)
      .filter((i) => i.desde !== '@/lib/supabase/server')
      .map((i) => resolver(i.desde, `${APP}${ARCHIVO}`))
      .filter((r): r is string => r !== null)
    // Importa al menos la fórmula de core (la misma cuenta que el cron).
    expect(propios.some((p) => p.endsWith('publicidad/formula.ts'))).toBe(true)
    for (const archivo of propios) {
      expect(sinComentarios(readFileSync(archivo, 'utf8')), archivo).not.toMatch(CLAVE)
    }
  })

  describe('en funcionamiento: las cinco acciones andan con la service key prohibida', () => {
    afterEach(() => {
      prohibiciones.servicio = false
      vi.restoreAllMocks()
    })

    it('createAdminClient lanza y las acciones igual responden; todo lo que tocan lo toca el admin', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const a = reiniciar()
      sembrar(a, 'ad_price_cycles', [
        {
          ciclo: '2026-12-01',
          audiencia_web_28d: 0,
          audiencia: 0,
          fuente_audiencia: 'manual',
          tramo_calculado: 500,
          tramo_vigente: 500,
          tipo_cambio: 1530,
          fuente_tipo_cambio: 'dolarapi',
          factor_hero: 1,
          factor_push: 1,
          estado: 'propuesto',
        },
      ])
      sembrar(a, 'ad_prices', [
        { ciclo: '2026-12-01', producto: 'destacado-7', tramo_ref: 500, precio_usd: 9.14, precio_ars: 14000, precio_fundador_ars: 10000, tipo_cambio: 1530, vigente_desde: '2026-12-01', estado: 'propuesto' },
      ])
      prohibiciones.servicio = true
      const desde = a.llamadas.length

      expect(await cargarAudienciaYTipoCambio({ ciclo: '2026-12-01', audienciaWeb28d: 490 })).toMatchObject({ ok: true })
      expect(await aprobarCiclo({ ciclo: '2026-12-01' })).toEqual({ ok: true })
      expect(await cambiarAprobacionAutomatica({ activar: true })).toMatchObject({ ok: false, error: 'TRIGGER' })
      expect(await reanudarPushPatrocinado()).toEqual({ ok: true })
      expect(await obtenerPanelPublicidad()).not.toBeNull()

      const llamadas = a.llamadas.slice(desde)
      expect(llamadas.length).toBeGreaterThan(5)
      expect(llamadas.every((l) => l.rol === 'admin' || l.tabla === 'profiles')).toBe(true)
      expect(llamadas.some((l) => l.rol === 'servicio')).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// 2. Corridas con ids inventados
// ---------------------------------------------------------------------------

describe('privacidad: una corrida del cron con ids inventados no deja ninguno en lo que sale', () => {
  const IDS_DE_PERSONAS = /00000070-0000-4000-8000-[0-9a-f]{12}/g
  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  const entornoPrevio = { cron: process.env.CRON_SECRET }
  const red = crearFetch({ tipoCambio: 1530 })

  let consola: string[]

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    process.env.CRON_SECRET = SECRETO
    vi.stubGlobal('fetch', red.fetch)
    consola = []
    for (const metodo of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, metodo).mockImplementation((...args: unknown[]) => {
        consola.push(args.map((x) => (typeof x === 'string' ? x : x instanceof Error ? `${x.name}: ${x.message}` : JSON.stringify(x))).join(' '))
      })
    }
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    if (entornoPrevio.cron === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = entornoPrevio.cron
  })

  async function correr(iso: string): Promise<string> {
    fijarAhora(iso)
    const res = await cronPublicidad(
      new Request('http://localhost.test/api/cron/publicidad', { headers: { authorization: `Bearer ${SECRETO}` } }),
    )
    expect(res.status).toBe(200)
    return res.text()
  }

  function escenario() {
    const a = reiniciar()
    sembrarEscenarioPush(a, { destinatarios: 200, bajasEnVentana: 5 })
    // Destacados que terminaron hace poco (generan reportes) y una campaña vieja ya medida que también.
    sembrarDestacados(a, { cantidad: 2, hasta: '2026-12-12T10:00:00.000Z' })
    sembrar(a, 'sponsored_campaigns', [
      {
        id: '00000000-0000-4000-8000-0000000000c2',
        title: 'Campaña Anterior de Prueba',
        body: 'Cuerpo',
        event_id: PUSH.EVENTO_PATROCINADO,
        starts_at: '2026-12-05T00:00:00.000Z',
        ends_at: '2026-12-12T10:00:00.000Z',
        sent_at: '2026-12-05T15:00:00.000Z',
        destinatarios: 50,
        bajas_48h: 1,
        bajas_medidas_at: '2026-12-08T00:00:00.000Z',
      },
    ])
    return a
  }

  /** Todo lo que sale: la respuesta, la consola, lo que queda en job_runs y lo que se guarda de las bajas. */
  function salidas(respuesta: string): Record<string, string> {
    const a = entorno.almacen
    const rows = (t: string): Fila[] => a.tablas[t] ?? []
    return {
      respuesta,
      consola: consola.join('\n'),
      job_runs: JSON.stringify(rows('job_runs').map((r) => ({ details: r.details, errors: r.errors, status: r.status }))),
      ad_settings: JSON.stringify(rows('ad_settings')),
      bajas: JSON.stringify(rows('sponsored_campaigns').map((c) => ({ d: c.destinatarios, b: c.bajas_48h, m: c.bajas_medidas_at }))),
      reportes: JSON.stringify(rows('ad_campaign_reports').map((r) => r.metricas)),
      ocupacion: JSON.stringify(rows('ad_occupancy_daily')),
      ciclos: JSON.stringify([...rows('ad_price_cycles'), ...rows('ad_prices')]),
    }
  }

  it('la base de la prueba SÍ tiene esos ids (si no, buscar no probaría nada)', () => {
    const a = escenario()
    const todos = JSON.stringify(a.tablas)
    expect(todos.match(IDS_DE_PERSONAS)?.length ?? 0).toBeGreaterThan(400)
  })

  it('corrida normal (mide las bajas, pausa, crea reportes): ni un id de persona en la respuesta, la consola, job_runs ni lo guardado', async () => {
    escenario()
    const respuesta = await correr(PUSH.AHORA)
    const cuerpo = JSON.parse(respuesta) as Record<string, unknown>
    expect(cuerpo).toMatchObject({ bajasMedidas: 1, pausado: true })
    expect(cuerpo.reportes).toBeGreaterThan(0)
    const afuera = salidas(respuesta)
    for (const [donde, texto] of Object.entries(afuera)) {
      expect(texto.match(IDS_DE_PERSONAS), donde).toBeNull()
    }
    // La respuesta, la consola y job_runs no tienen ningún uuid, de nadie.
    for (const donde of ['respuesta', 'consola', 'job_runs', 'ad_settings', 'bajas']) {
      expect(afuera[donde], donde).not.toMatch(UUID)
    }
    // Y lo que se guardó de las bajas son números.
    expect(JSON.parse(afuera.bajas)).toContainEqual({ d: 200, b: 5, m: expect.any(String) })
    expect(entorno.almacen.tablas.ad_settings[0].push_patrocinado_pausa_motivo).toMatch(/^Bajas en 48 h: 5 de 200 \(umbral 2%\), campaña del 10\/12$/)
  })

  it('corrida con TODO fallando y mensajes de error que traen user_id: lo que sale es texto fijo', async () => {
    const a = escenario()
    a.fallar = (tabla, op) => {
      if (['notification_sends', 'notification_preferences', 'events', 'sponsored_campaigns', 'ad_occupancy_daily', 'ad_price_cycles', 'ad_settings'].includes(tabla)) {
        return {
          code: 'XX000',
          message: `Key (user_id)=(${idUsuario(1)}) y (${idUsuario(2)}) en ${tabla}/${op}; evento ${PUSH.EVENTO_PATROCINADO}`,
        }
      }
      return null
    }
    const respuesta = await correr(PUSH.AHORA)
    const cuerpo = JSON.parse(respuesta) as Record<string, unknown>
    expect(cuerpo.status).not.toBe('SUCCESS')
    expect(cuerpo.error).toBe('Algún paso falló (detalle en job_runs)')
    const afuera = salidas(respuesta)
    for (const [donde, texto] of Object.entries(afuera)) {
      expect(texto, donde).not.toContain(idUsuario(1))
      expect(texto, donde).not.toContain(idUsuario(2))
      expect(texto, donde).not.toContain(PUSH.EVENTO_PATROCINADO)
      expect(texto.match(IDS_DE_PERSONAS), donde).toBeNull()
    }
    for (const donde of ['respuesta', 'consola', 'job_runs']) {
      expect(afuera[donde], donde).not.toMatch(UUID)
      expect(afuera[donde], donde).not.toContain('user_id')
      expect(afuera[donde], donde).not.toContain('XX000')
    }
  })

  it('medirBajas devuelve exactamente { medidas, pausado, fallidas }: números y un booleano', async () => {
    escenario()
    const resultado = await medirBajas(servicio() as unknown as SupabaseClient, new Date(PUSH.AHORA))
    expect(Object.keys(resultado).sort()).toEqual(['fallidas', 'medidas', 'pausado'])
    expect(typeof resultado.medidas).toBe('number')
    expect(typeof resultado.fallidas).toBe('number')
    expect(typeof resultado.pausado).toBe('boolean')
    expect(JSON.stringify(resultado).match(IDS_DE_PERSONAS)).toBeNull()
    expect(resultado).toEqual({ medidas: 1, pausado: true, fallidas: 0 })
  })

  it('con una campaña que falla a mitad: el error no suelta ids ni nombra a nadie', async () => {
    const a = escenario()
    // La lectura de los envíos de la campaña falla: la medición queda como "fallida" sin detalle.
    a.fallar = (tabla) => (tabla === 'notification_sends' ? { code: 'XX000', message: `user_id ${idUsuario(7)}` } : null)
    const resultado = await medirBajas(servicio() as unknown as SupabaseClient, new Date(PUSH.AHORA))
    expect(resultado).toEqual({ medidas: 0, pausado: false, fallidas: 1 })
    expect(consola.join('\n')).not.toContain(idUsuario(7))
  })
})

afterAll(() => {
  prohibiciones.servicio = false
})
