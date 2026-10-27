import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { medirBajas } from '@/lib/publicidad/bajas'

// --- Doble del cliente de Supabase: respeta los filtros (eq, is, not, gt(e), lt(e), in, range). ---
type Fila = Record<string, unknown>
function crearFake(datos: Record<string, Fila[]>, falla: (tabla: string, op: string) => boolean = () => false) {
  const llamadas: Array<{ tabla: string; op: string; payload?: unknown }> = []
  const traza = { ins: [] as number[], rangos: [] as Array<[number, number]> }
  const cmp = (a: unknown, b: unknown) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0)
  function from(tabla: string) {
    const filtros: Array<(f: Fila) => boolean> = []
    let op: string | null = null
    let payload: unknown
    let head = false
    let rango: [number, number] | null = null
    let orden: { col: string; asc: boolean } | null = null
    let tope: number | null = null
    const b: Record<string, unknown> = {
      select(_c?: string, o?: { head?: boolean }) {
        if (op === null) op = 'select'
        head = o?.head === true
        return b
      },
      update(p: unknown) { op = 'update'; payload = p; return b },
      eq(c: string, v: unknown) { filtros.push((f) => f[c] === v); return b },
      is(c: string, v: unknown) { filtros.push((f) => (f[c] ?? null) === v); return b },
      not(c: string, _o: string, v: unknown) { filtros.push((f) => (f[c] ?? null) !== v); return b },
      gt(c: string, v: unknown) { filtros.push((f) => f[c] != null && cmp(f[c], v) > 0); return b },
      gte(c: string, v: unknown) { filtros.push((f) => f[c] != null && cmp(f[c], v) >= 0); return b },
      lt(c: string, v: unknown) { filtros.push((f) => f[c] != null && cmp(f[c], v) < 0); return b },
      lte(c: string, v: unknown) { filtros.push((f) => f[c] != null && cmp(f[c], v) <= 0); return b },
      in(c: string, v: unknown[]) { traza.ins.push(v.length); filtros.push((f) => v.includes(f[c])); return b },
      order(col: string, o?: { ascending?: boolean }) { orden = { col, asc: o?.ascending !== false }; return b },
      range(d: number, h: number) { traza.rangos.push([d, h]); rango = [d, h]; return b },
      limit(n: number) { tope = n; return b },
      then(resolve: (r: unknown) => unknown) {
        llamadas.push({ tabla, op: op ?? 'select', payload })
        if (falla(tabla, op ?? 'select')) return resolve({ data: null, count: null, error: { message: 'falla inventada' } })
        const tablaDatos = (datos[tabla] ??= [])
        const coincide = (f: Fila) => filtros.every((p) => p(f))
        if (op === 'update') {
          for (const f of tablaDatos.filter(coincide)) Object.assign(f, payload)
          return resolve({ data: null, count: null, error: null })
        }
        let filas = tablaDatos.filter(coincide)
        const total = filas.length
        if (orden) { const o = orden as { col: string; asc: boolean }; filas = [...filas].sort((x, y) => (o.asc ? 1 : -1) * cmp(x[o.col], y[o.col])) }
        if (rango) filas = filas.slice((rango as [number, number])[0], (rango as [number, number])[1] + 1)
        if (tope !== null) filas = filas.slice(0, tope)
        return resolve({ data: head ? null : filas, count: total, error: null })
      },
    }
    return b
  }
  return { cliente: { from } as unknown as SupabaseClient, datos, llamadas, traza }
}

const AHORA = new Date('2026-10-23T15:00:00Z')
const H = 3_600_000
const hace = (horas: number) => new Date(AHORA.getTime() - horas * H).toISOString()
const idUsuario = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
const PREFIJO_ID = '00000000-0000-4000-8000-'

const AJUSTES = { id: true, umbral_bajas_push: 0.02, push_patrocinado_pausado_at: null, push_patrocinado_pausa_motivo: null }

/** Una campaña enviada hace `horas`, con `n` destinatarios y las bajas indicadas (en horas desde el envío). */
function escenario(opts: { n: number; bajasEn: number[]; horas?: number; vecesPorUsuario?: number; extra?: Fila }) {
  const horas = opts.horas ?? 60
  const enviado = hace(horas)
  const sends: Fila[] = []
  for (let i = 0; i < opts.n; i++) {
    for (let v = 0; v < (opts.vecesPorUsuario ?? 1); v++) sends.push({ id: `s-${i}-${v}`, user_id: idUsuario(i), campaign_id: 'camp-1', sent_at: enviado })
  }
  const prefs: Fila[] = Array.from({ length: opts.n }, (_, i) => ({
    user_id: idUsuario(i),
    sponsored: i < opts.bajasEn.length ? false : true,
    updated_at: i < opts.bajasEn.length ? new Date(Date.parse(enviado) + opts.bajasEn[i] * H).toISOString() : hace(500),
  }))
  return crearFake({
    sponsored_campaigns: [{ id: 'camp-1', sent_at: enviado, bajas_medidas_at: null, ...opts.extra }],
    notification_sends: sends,
    notification_preferences: prefs,
    ad_settings: [{ ...AJUSTES }],
  })
}

afterEach(() => vi.restoreAllMocks())

describe('medirBajas', () => {
  it('200 destinatarios, 5 bajas en las 48 h y 3 fuera: bajas_48h = 5 y pausa con umbral 0,02', async () => {
    // Dentro: 1, 10, 20, 47, 48 h. Fuera: antes del envío (-2 h), a las 49 h y a las 50 h.
    const f = escenario({ n: 200, bajasEn: [1, 10, 20, 47, 48, -2, 49, 50] })
    const r = await medirBajas(f.cliente, AHORA)
    expect(r).toEqual({ medidas: 1, pausado: true, fallidas: 0 })
    expect(f.datos.sponsored_campaigns[0]).toMatchObject({ bajas_48h: 5, bajas_medidas_at: AHORA.toISOString() })
    const ajustes = f.datos.ad_settings[0]
    expect(ajustes.push_patrocinado_pausado_at).toBe(AHORA.toISOString())
    expect(ajustes.push_patrocinado_pausa_motivo).toMatch(/5 de 200/)
  })

  it('con 4 bajas (2%, no supera el umbral) mide pero no pausa', async () => {
    const f = escenario({ n: 200, bajasEn: [1, 2, 3, 4] })
    expect(await medirBajas(f.cliente, AHORA)).toEqual({ medidas: 1, pausado: false, fallidas: 0 })
    expect(f.datos.sponsored_campaigns[0].bajas_48h).toBe(4)
    expect(f.datos.ad_settings[0].push_patrocinado_pausado_at).toBeNull()
  })

  it('una campaña ya medida no se vuelve a medir (ni en una segunda corrida)', async () => {
    const yaMedida = escenario({ n: 10, bajasEn: [1], extra: { bajas_medidas_at: hace(1), bajas_48h: 0 } })
    expect((await medirBajas(yaMedida.cliente, AHORA)).medidas).toBe(0)
    expect(yaMedida.datos.sponsored_campaigns[0].bajas_48h).toBe(0)

    const f = escenario({ n: 10, bajasEn: [1] })
    expect((await medirBajas(f.cliente, AHORA)).medidas).toBe(1)
    expect((await medirBajas(f.cliente, AHORA)).medidas).toBe(0)
  })

  it.each([30, 80])('una campaña enviada hace %i h no se mide (fuera de 48 a 72 h)', async (horas) => {
    const f = escenario({ n: 10, bajasEn: [1], horas })
    expect(await medirBajas(f.cliente, AHORA)).toEqual({ medidas: 0, pausado: false, fallidas: 0 })
    expect(f.datos.sponsored_campaigns[0].bajas_medidas_at).toBeNull()
  })

  it('con la pausa ya activa no la pisa', async () => {
    const f = escenario({ n: 100, bajasEn: [1, 2, 3, 4, 5, 6, 7, 8] })
    f.datos.ad_settings[0].push_patrocinado_pausado_at = hace(100)
    f.datos.ad_settings[0].push_patrocinado_pausa_motivo = 'motivo previo'
    expect(await medirBajas(f.cliente, AHORA)).toMatchObject({ medidas: 1, pausado: false })
    expect(f.datos.ad_settings[0].push_patrocinado_pausa_motivo).toBe('motivo previo')
  })

  it('si falla el update de ad_settings, la campaña no se marca como medida y cuenta como fallida', async () => {
    const f = escenario({ n: 200, bajasEn: [1, 2, 3, 4, 5, 6] })
    const roto = crearFake(f.datos, (t, op) => t === 'ad_settings' && op === 'update')
    const r = await medirBajas(roto.cliente, AHORA)
    expect(r).toEqual({ medidas: 0, pausado: false, fallidas: 1 })
    expect(f.datos.sponsored_campaigns[0].bajas_medidas_at).toBeNull()
  })

  it('con la pausa ya activa no se vuelve a pausar y la campaña se marca como medida', async () => {
    const f = escenario({ n: 100, bajasEn: [1, 2, 3, 4, 5, 6, 7, 8] })
    f.datos.ad_settings[0].push_patrocinado_pausado_at = hace(100)
    const espia = crearFake(f.datos)
    const r = await medirBajas(espia.cliente, AHORA)
    expect(r).toEqual({ medidas: 1, pausado: false, fallidas: 0 })
    expect(espia.llamadas.filter((l) => l.tabla === 'ad_settings' && l.op === 'update')).toHaveLength(0)
    expect(f.datos.sponsored_campaigns[0].bajas_medidas_at).toBe(AHORA.toISOString())
  })

  it('450 destinatarios y 2.250 envíos: cada .in tiene 200 ids como mucho y se pagina con range', async () => {
    const f = escenario({ n: 450, bajasEn: [1, 2], vecesPorUsuario: 5 })
    const r = await medirBajas(f.cliente, AHORA)
    expect(r.medidas).toBe(1)
    expect(f.traza.ins).toEqual([200, 200, 50])
    expect(Math.max(...f.traza.ins)).toBeLessThanOrEqual(200)
    expect(f.traza.rangos).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
    // Cuenta personas distintas, no envíos: 2 bajas sobre 450 no llega al 2%.
    expect(f.datos.sponsored_campaigns[0].bajas_48h).toBe(2)
    expect(r.pausado).toBe(false)
  })

  it('una campaña que falla no frena a las otras y se cuenta en fallidas', async () => {
    const f = escenario({ n: 10, bajasEn: [1] })
    f.datos.sponsored_campaigns.push({ id: 'camp-2', sent_at: hace(60), bajas_medidas_at: null })
    let llamadas = 0
    const roto = crearFake(f.datos, (t) => t === 'notification_sends' && ++llamadas === 1)
    const r = await medirBajas(roto.cliente, AHORA)
    expect(r.fallidas).toBe(1)
    expect(r.medidas).toBe(1)
  })

  it('nada de lo que sale de la función contiene un user_id: ni el retorno, ni los update, ni la consola, ni los errores', async () => {
    const consola = [vi.spyOn(console, 'log'), vi.spyOn(console, 'info'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'debug')]
    for (const espia of consola) espia.mockImplementation(() => {})

    // Una corrida que mide y pausa.
    const f = escenario({ n: 200, bajasEn: [1, 2, 3, 4, 5, 6] })
    const r = await medirBajas(f.cliente, AHORA)
    const updates = f.llamadas.filter((l) => l.op === 'update').map((l) => l.payload)
    expect(updates.length).toBeGreaterThan(0)

    // Una corrida donde falla la lectura de preferencias.
    const g = escenario({ n: 20, bajasEn: [1] })
    const rota = crearFake(g.datos, (t) => t === 'notification_preferences')
    const rr = await medirBajas(rota.cliente, AHORA)

    // Una donde falla la lectura de campañas (lanza).
    let mensajeDeError = ''
    try {
      await medirBajas(crearFake({}, (t) => t === 'sponsored_campaigns').cliente, AHORA)
    } catch (err) {
      mensajeDeError = String(err instanceof Error ? err.message : err)
    }

    const salida = JSON.stringify({ r, updates, rr, mensajeDeError, consola: consola.map((c) => c.mock.calls) })
    expect(salida).not.toContain(PREFIJO_ID)
    expect(Object.keys(r).sort()).toEqual(['fallidas', 'medidas', 'pausado'])
    expect(Object.values(r).every((v) => typeof v === 'number' || typeof v === 'boolean')).toBe(true)
  })
})
