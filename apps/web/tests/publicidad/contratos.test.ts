/**
 * R58, 58-q: los contratos entre tareas. Cada pieza de la ronda la escribió una
 * tarea distinta; estos tests fijan los acuerdos que las atan para que cambiar
 * una punta ponga la otra en rojo:
 *
 *  - `CUPOS_HERO` (58-b) es el `limit` de `selectCarouselEvents` (core);
 *  - los `id` de producto son los mismos en `precios.ts`, en `PRODUCTOS_CON_PRECIO`
 *    y en el `check` de la migración;
 *  - las columnas que leen y escriben 58-b, 58-c y 58-e existen en los tipos
 *    generados de `packages/db` (se mira lo que las funciones piden DE VERDAD, con
 *    el doble en memoria, no una lista copiada a mano);
 *  - el workflow y la ruta usan el mismo camino `/api/cron/publicidad`.
 *
 * Sin red ni base.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PRODUCTOS_CON_PRECIO } from '@qps/core/publicidad/formula'
import { TARIFARIO } from '@qps/core/publicidad/precios'
import { sembrar, type Fila, type Llamada } from './_soporte/doble-supabase'
import {
  SECRETO,
  crearFetch,
  fijarAhora,
  PUSH,
  reiniciar,
  sembrarDestacados,
  sembrarEscenarioPush,
} from './_soporte/entorno'

vi.mock('@/lib/supabase/server', async () => {
  const { servicio, sesion } = await import('./_soporte/entorno')
  return { createAdminClient: () => servicio(), createClient: async () => sesion() }
})
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { GET as cronPublicidad } from '@/app/api/cron/publicidad/route'
import { GET as cronNotificaciones } from '@/app/api/cron/notificaciones/route'
import {
  aprobarCiclo,
  cambiarAprobacionAutomatica,
  cargarAudienciaYTipoCambio,
  obtenerPanelPublicidad,
  reanudarPushPatrocinado,
} from '@/lib/admin/publicidad-actions'
import { CUPOS_HERO } from '@/lib/publicidad/ocupacion'

const APP = fileURLToPath(new URL('../../', import.meta.url))
const RAIZ = fileURLToPath(new URL('../../../../', import.meta.url))

/** El contenido entre la llave (o el paréntesis) que abre en `indice` y la que la cierra. */
function balanceado(texto: string, indice: number): string {
  const apertura = texto[indice]
  const cierre = apertura === '(' ? ')' : '}'
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

// ---------------------------------------------------------------------------
// 1. Los cupos del Hero
// ---------------------------------------------------------------------------

describe('contrato: los cupos del Hero', () => {
  it('CUPOS_HERO de lib/publicidad/ocupacion.ts es igual al limit de selectCarouselEvents (core)', () => {
    const texto = readFileSync(`${RAIZ}packages/core/src/home/carousel.ts`, 'utf8')
    const inicio = texto.indexOf('export function selectCarouselEvents')
    expect(inicio, 'selectCarouselEvents sigue en carousel.ts').toBeGreaterThan(-1)
    const cuerpo = texto.slice(inicio)
    const limite = /const limit\s*=\s*(\d+)/.exec(cuerpo)
    expect(limite, 'selectCarouselEvents sigue declarando "const limit = N"').not.toBeNull()
    expect(CUPOS_HERO).toBe(Number(limite?.[1]))
  })
})

// ---------------------------------------------------------------------------
// 2. Los id de producto
// ---------------------------------------------------------------------------

describe('contrato: los id de producto', () => {
  const migracion = (() => {
    const dir = `${RAIZ}supabase/migrations`
    const archivo = readdirSync(dir).find((f) => f.includes('r58_precios_publicidad') && f.endsWith('.sql'))
    return archivo ? readFileSync(`${dir}/${archivo}`, 'utf8') : ''
  })()

  const idsDeTarifario = TARIFARIO.map((p) => p.id).filter((id) => id !== 'basica')

  it('encuentra la migración de la R58', () => {
    expect(migracion).toContain('create table if not exists public.ad_prices')
  })

  it('precios.ts (sin "basica") y PRODUCTOS_CON_PRECIO tienen los mismos id', () => {
    expect(TARIFARIO.map((p) => p.id)).toContain('basica')
    expect([...PRODUCTOS_CON_PRECIO].sort()).toEqual([...idsDeTarifario].sort())
  })

  it('y el check ad_prices_producto_check de la migración también', () => {
    const check = /ad_prices_producto_check check \(\s*producto in \(([^)]*)\)\s*\)/.exec(migracion)
    expect(check, 'la migración declara ad_prices_producto_check').not.toBeNull()
    const enLaMigracion = [...(check?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(enLaMigracion.sort()).toEqual([...PRODUCTOS_CON_PRECIO].sort())
    expect(enLaMigracion).not.toContain('basica')
  })
})

// ---------------------------------------------------------------------------
// 3. Las columnas que leen y escriben 58-b, 58-c y 58-e
// ---------------------------------------------------------------------------

type Columnas = { todas: Set<string>; requeridas: Set<string> }

const TIPOS = readFileSync(`${RAIZ}packages/db/src/database.types.ts`, 'utf8')

/** Las columnas de `Row`, `Insert` o `Update` de una tabla en `packages/db`. Las requeridas son las que no llevan `?`. */
function columnasDeTipos(tabla: string, parte: 'Row' | 'Insert' | 'Update'): Columnas {
  const inicio = TIPOS.indexOf(`"${tabla}": {`)
  expect(inicio, `${tabla} está en packages/db`).toBeGreaterThan(-1)
  const desdeParte = TIPOS.indexOf(`${parte}: {`, inicio)
  const cuerpo = balanceado(TIPOS, TIPOS.indexOf('{', desdeParte))
  const todas = new Set<string>()
  const requeridas = new Set<string>()
  for (const m of cuerpo.matchAll(/"(\w+)"(\?)?:/g)) {
    todas.add(m[1])
    if (!m[2]) requeridas.add(m[1])
  }
  return { todas, requeridas }
}

const TABLAS_R58 = ['ad_price_cycles', 'ad_prices', 'ad_settings', 'ad_occupancy_daily', 'ad_campaign_reports', 'sponsored_campaigns']

/** Las columnas de un `select('a, b, alias:tabla(c)')` sin los embebidos. */
function columnasPedidas(texto: string): string[] {
  const partes: string[] = []
  let profundidad = 0
  let actual = ''
  for (const ch of texto) {
    if (ch === '(') profundidad += 1
    if (ch === ')') profundidad -= 1
    if (ch === ',' && profundidad === 0) {
      partes.push(actual.trim())
      actual = ''
    } else actual += ch
  }
  if (actual.trim()) partes.push(actual.trim())
  return partes.filter((p) => !p.includes('('))
}

describe('contrato: las columnas de 58-b, 58-c y 58-e existen en packages/db', () => {
  const entornoPrevio = { cron: process.env.CRON_SECRET, envioReal: process.env.PUSH_ENVIO_REAL }
  const red = crearFetch({ tipoCambio: 1530 })
  let llamadas: Llamada[] = []

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    process.env.CRON_SECRET = SECRETO
    process.env.PUSH_ENVIO_REAL = '1'
    vi.stubGlobal('fetch', red.fetch)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})

    const a = reiniciar()
    sembrarEscenarioPush(a, { destinatarios: 200, bajasEnVentana: 5 })
    // Destacados que terminaron hace poco y una campaña ya medida: los dos generan reportes (destacado y push).
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

    const encabezados = { authorization: `Bearer ${SECRETO}` }
    const publicidad = async (iso: string) => {
      fijarAhora(iso)
      return cronPublicidad(new Request('http://localhost.test/api/cron/publicidad', { headers: encabezados }))
    }

    // 58-b: la ocupación, el ciclo (propuesto), la medición de bajas con pausa y los reportes.
    expect((await publicidad(PUSH.AHORA)).status).toBe(200)

    // 58-c: carga manual, aprobación, el interruptor (el trigger lo rechaza con un solo ciclo aprobado) y la reanudación.
    await cargarAudienciaYTipoCambio({ ciclo: '2026-12-01', audienciaWeb28d: 490, tipoCambio: 1530 })
    await aprobarCiclo({ ciclo: '2026-12-01' })
    await cambiarAprobacionAutomatica({ activar: true })
    await reanudarPushPatrocinado()
    await obtenerPanelPublicidad()

    // 58-e: la ruta de notificaciones recuenta los destinatarios al mandar el patrocinado.
    fijarAhora('2026-12-13T00:35:00.000Z')
    await cronNotificaciones(new Request('http://localhost.test/api/cron/notificaciones', { headers: encabezados }))

    // 58-b con la aprobación automática prendida: el ciclo nuevo entra como "automatico" y sus precios "aprobado".
    a.tablas.ad_settings[0].aprobacion_automatica = true
    expect((await publicidad('2027-01-01T09:00:00.000Z')).status).toBe(200)

    llamadas = a.llamadas
  }, 60_000)

  afterAll(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    if (entornoPrevio.cron === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = entornoPrevio.cron
    if (entornoPrevio.envioReal === undefined) delete process.env.PUSH_ENVIO_REAL
    else process.env.PUSH_ENVIO_REAL = entornoPrevio.envioReal
  })

  const de = (tabla: string, op: Llamada['op']) => llamadas.filter((l) => l.tabla === tabla && l.op === op)
  const claves = (l: Llamada): string[] => {
    const filas = Array.isArray(l.valores) ? l.valores : l.valores ? [l.valores] : []
    return [...new Set(filas.flatMap((f: Fila) => Object.keys(f)))]
  }

  it('la corrida de la prueba ejercitó todas las escrituras de la ronda (si no, el resto sería vacío)', () => {
    expect(de('ad_price_cycles', 'insert')).toHaveLength(2)
    expect(de('ad_prices', 'insert')).toHaveLength(2)
    expect(de('ad_occupancy_daily', 'upsert').length).toBeGreaterThanOrEqual(2)
    expect(de('ad_campaign_reports', 'upsert').length).toBeGreaterThanOrEqual(1)
    expect(de('ad_price_cycles', 'update').length).toBeGreaterThanOrEqual(2)
    expect(de('ad_prices', 'update').length).toBeGreaterThanOrEqual(2)
    expect(de('ad_settings', 'update').length).toBeGreaterThanOrEqual(3)
    expect(de('sponsored_campaigns', 'update').length).toBeGreaterThanOrEqual(2)
    // Un ciclo automático con approved_at, y un reporte de cada tipo.
    expect(de('ad_price_cycles', 'insert').map((l) => (l.valores as Fila).estado)).toEqual(['propuesto', 'automatico'])
    const reportes = de('ad_campaign_reports', 'upsert').flatMap((l) => l.valores as Fila[])
    expect(new Set(reportes.map((r) => r.tipo))).toEqual(new Set(['destacado', 'push']))
  })

  it.each(TABLAS_R58)('%s: toda columna que se inserta o se actualiza existe en Insert/Update, y los inserts traen las requeridas', (tabla) => {
    const insert = columnasDeTipos(tabla, 'Insert')
    const update = columnasDeTipos(tabla, 'Update')
    for (const l of llamadas.filter((x) => x.tabla === tabla && x.op !== 'select' && x.op !== 'delete')) {
      if (l.op === 'update') {
        for (const c of claves(l)) expect(update.todas, `${tabla}.${c} (update)`).toContain(c)
      } else {
        const filas = Array.isArray(l.valores) ? l.valores : [l.valores as Fila]
        for (const fila of filas) {
          for (const c of Object.keys(fila)) expect(insert.todas, `${tabla}.${c} (insert)`).toContain(c)
          for (const requerida of insert.requeridas) expect(Object.keys(fila), `${tabla}: falta ${requerida}`).toContain(requerida)
        }
      }
    }
  })

  it.each(TABLAS_R58)('%s: toda columna que se lee con select existe en Row', (tabla) => {
    const fila = columnasDeTipos(tabla, 'Row')
    const lecturas = llamadas.filter((l) => l.tabla === tabla && l.columnas !== null)
    for (const l of lecturas) {
      for (const c of columnasPedidas(l.columnas as string)) {
        expect(c === '*' || fila.todas.has(c), `${tabla}: ${c}`).toBe(true)
      }
    }
  })

  it('ad_price_cycles tiene approved_by y approved_at (los escribe 58-c al aprobar y 58-b en el automático)', () => {
    const fila = columnasDeTipos('ad_price_cycles', 'Row')
    expect(fila.todas).toContain('approved_by')
    expect(fila.todas).toContain('approved_at')
    const aprobar = de('ad_price_cycles', 'update').find((l) => (l.valores as Fila).estado === 'aprobado')
    expect(aprobar && claves(aprobar).sort()).toEqual(['approved_at', 'approved_by', 'estado'])
    const automatico = de('ad_price_cycles', 'insert').find((l) => (l.valores as Fila).estado === 'automatico')
    expect(automatico && claves(automatico)).toEqual(expect.arrayContaining(['approved_at', 'approved_by']))
  })

  it('sponsored_campaigns tiene las tres columnas nuevas: destinatarios, bajas_48h y bajas_medidas_at', () => {
    const fila = columnasDeTipos('sponsored_campaigns', 'Row')
    for (const c of ['destinatarios', 'bajas_48h', 'bajas_medidas_at']) expect(fila.todas).toContain(c)
    const escritas = new Set(de('sponsored_campaigns', 'update').flatMap(claves))
    expect(escritas).toContain('destinatarios') // 58-e
    expect(escritas).toContain('bajas_48h') // 58-b
    expect(escritas).toContain('bajas_medidas_at') // 58-b
  })

  it('las tablas de la R58 no tienen columnas de personas más que los *_by que deja la base', () => {
    for (const tabla of TABLAS_R58.filter((t) => t.startsWith('ad_'))) {
      const fila = columnasDeTipos(tabla, 'Row')
      const sospechosas = [...fila.todas].filter((c) => /user_?id|e-?mail|name|nombre/i.test(c))
      expect(sospechosas, tabla).toEqual([])
    }
  })

  it('los estados del ciclo que escribe el código (propuesto, aprobado, automatico) son los del check de la migración', () => {
    const dir = `${RAIZ}supabase/migrations`
    const archivo = readdirSync(dir).find((f) => f.includes('r58_precios_publicidad')) as string
    const sql = readFileSync(`${dir}/${archivo}`, 'utf8')
    const permitidos = [...(/ad_price_cycles_estado_check check \(estado in \(([^)]*)\)\)/.exec(sql)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])
    const escritos = new Set(
      [...de('ad_price_cycles', 'insert'), ...de('ad_price_cycles', 'update')]
        .map((l) => (l.valores as Fila).estado)
        .filter((e): e is string => typeof e === 'string'),
    )
    expect(escritos.size).toBeGreaterThanOrEqual(3)
    for (const e of escritos) expect(permitidos).toContain(e)
  })
})

// ---------------------------------------------------------------------------
// 4. El workflow y la ruta
// ---------------------------------------------------------------------------

describe('contrato: el workflow y la ruta usan el mismo camino', () => {
  // De noche no se puede escribir en .github/: el contenido vive en ops/ hasta que el lead lo copia
  // (igual que tests/app/workflow-publicidad.test.ts). Si existe el real, se prefiere ese.
  const RUTA_GITHUB = `${RAIZ}.github/workflows/publicidad.yml`
  const RUTA_PROPUESTA = 'D:/Programacion/QuePintaSalta/que-pinta-salta/ops/rondas/58-precios-automaticos/publicidad.yml.propuesto'
  const RUTA = existsSync(RUTA_GITHUB) ? RUTA_GITHUB : existsSync(RUTA_PROPUESTA) ? RUTA_PROPUESTA : null

  const CAMINO_RUTA = '/api/cron/publicidad'

  it('la ruta vive en app/api/cron/publicidad/route.ts, que es el camino /api/cron/publicidad, y exporta GET', () => {
    const archivo = `${APP}app/api/cron/publicidad/route.ts`
    expect(existsSync(archivo)).toBe(true)
    expect(archivo.replace(/\\/g, '/')).toContain(`/app${CAMINO_RUTA}/route.ts`)
    expect(readFileSync(archivo, 'utf8')).toMatch(/export async function GET\(/)
  })

  it.skipIf(RUTA === null)('el workflow llama a ese camino, y solo a ese, y la ruta se documenta con el mismo', () => {
    const yaml = readFileSync(RUTA as string, 'utf8')
    const activas = yaml.split('\n').filter((l) => !/^\s*#/.test(l))
    const caminos = new Set(activas.flatMap((l) => [...l.matchAll(/\/api\/cron\/[a-z0-9-]+/g)].map((m) => m[0])))
    expect([...caminos]).toEqual([CAMINO_RUTA])
    // La ruta nombra el workflow y el camino que la dispara.
    const ruta = readFileSync(`${APP}app/api/cron/publicidad/route.ts`, 'utf8')
    expect(ruta).toContain(`GET ${CAMINO_RUTA}`)
    expect(ruta).toContain('publicidad.yml')
  })

  it.skipIf(RUTA === null)('el workflow manda el secreto como Bearer, que es lo que la ruta valida (CRON_SECRET)', () => {
    const yaml = readFileSync(RUTA as string, 'utf8')
    expect(yaml).toMatch(/Authorization:\s*Bearer\s+\$\{?CRON_SECRET\}?/)
    expect(readFileSync(`${APP}app/api/cron/publicidad/route.ts`, 'utf8')).toMatch(/hasBearerSecret\(request, 'CRON_SECRET'\)/)
  })

  it('la ruta está registrada como trabajo "publicidad" en job_runs y tiene maxDuration', () => {
    const jobs = readFileSync(`${APP}lib/job-runs.ts`, 'utf8')
    expect(jobs).toMatch(/JobKey = [^\n]*'publicidad'/)
    const ruta = readFileSync(`${APP}app/api/cron/publicidad/route.ts`, 'utf8')
    expect(ruta).toMatch(/withJobRun\('publicidad'/)
    expect(ruta).toMatch(/export const maxDuration = \d+/)
  })
})
