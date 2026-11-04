// Q4-7: traducción de eventos al inglés. Sin red, sin base y SIN llamar al
// modelo: el traductor se inyecta; `@/lib/ai/llamadas-ia` se mockea para que un
// descuido no termine en una llamada paga.
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@google/genai'

const generarJsonDeTexto = vi.fn(async () => {
  throw new Error('no se llama al modelo en los tests')
})
// Q6-3: las llamadas a la IA pasaron de lib/ai/gemini.ts a lib/ai/llamadas-ia.ts (capa lib/ia);
// el doble sigue reemplazando la única puerta a la IA, así que el test sigue sin red ni gasto.
vi.mock('@/lib/ai/llamadas-ia', () => ({ generarJsonDeTexto: (...a: unknown[]) => generarJsonDeTexto(...(a as [])) }))

import {
  cupoDeLaCorrida,
  descripcionParaTraducir,
  nombresProtegidosEnTitulo,
  textoEnIdioma,
  topeDiario,
  validarTraduccion,
  validarTraduccionConMotivo,
  LARGO_MAXIMO_DESCRIPCION_ORIGINAL,
  TOPE_DIARIO_POR_DEFECTO,
} from '@qps/core/events/traduccion'
import { textoParaElModelo, traducirEvento, traducirEventoConMotivo } from '@/lib/ai/traducir-evento'
import { codigoDelFallo } from '@/lib/traduccion/motivos'
import { traducirPendientes, LOTE_POR_CORRIDA } from '@/lib/traduccion/traducir-pendientes'

const EVENTO = {
  id: 'e1',
  title: 'Los Nocheros en el Teatro Provincial',
  description: 'Una noche de folklore con Los Nocheros.',
  venueName: 'Teatro Provincial',
  artists: ['Los Nocheros'],
}

describe('núcleo (core)', () => {
  it('tope diario: por defecto 100, 0 apaga, inválido vuelve al default, techo 1000', () => {
    expect(topeDiario(undefined)).toBe(TOPE_DIARIO_POR_DEFECTO)
    expect(TOPE_DIARIO_POR_DEFECTO).toBe(100)
    expect(topeDiario('0')).toBe(0)
    expect(topeDiario('25')).toBe(25)
    expect(topeDiario('-3')).toBe(100)
    expect(topeDiario('abc')).toBe(100)
    expect(topeDiario('99999')).toBe(1000)
  })

  it('cupo de la corrida: lo que queda del día, sin pasar el lote', () => {
    expect(cupoDeLaCorrida({ tope: 100, traducidosHoy: 0, lote: 10 })).toBe(10)
    expect(cupoDeLaCorrida({ tope: 100, traducidosHoy: 95, lote: 10 })).toBe(5)
    expect(cupoDeLaCorrida({ tope: 100, traducidosHoy: 120, lote: 10 })).toBe(0)
    expect(cupoDeLaCorrida({ tope: 0, traducidosHoy: 0, lote: 10 })).toBe(0)
  })

  it('nombres protegidos: el lugar y los artistas que aparecen en el título', () => {
    expect(nombresProtegidosEnTitulo(EVENTO).sort()).toEqual(['Los Nocheros', 'Teatro Provincial'])
    expect(nombresProtegidosEnTitulo({ ...EVENTO, title: 'Peña de los viernes' })).toEqual([])
  })

  it('valida: acepta si conserva los nombres; descarta si los traduce', () => {
    expect(validarTraduccion(EVENTO, { title_en: 'Los Nocheros at the Teatro Provincial', description_en: 'A folk night with Los Nocheros.' })).toEqual({
      title_en: 'Los Nocheros at the Teatro Provincial',
      description_en: 'A folk night with Los Nocheros.',
    })
    expect(validarTraduccion(EVENTO, { title_en: 'The Night Ones at the Provincial Theater' })).toBeNull()
    expect(validarTraduccion(EVENTO, { title_en: '' })).toBeNull()
    expect(validarTraduccion(EVENTO, { title_en: 'x'.repeat(300) })).toBeNull()
    expect(validarTraduccion(EVENTO, 'no es objeto')).toBeNull()
    // Sin descripción original, nunca se inventa una.
    expect(validarTraduccion({ ...EVENTO, description: null }, { title_en: 'Los Nocheros at the Teatro Provincial', description_en: 'Invented' })).toEqual({
      title_en: 'Los Nocheros at the Teatro Provincial',
      description_en: null,
    })
  })

  it('la descripción que va al modelo se recorta (costo acotado)', () => {
    const larga = 'a'.repeat(LARGO_MAXIMO_DESCRIPCION_ORIGINAL + 500)
    expect(descripcionParaTraducir(larga)!.length).toBe(LARGO_MAXIMO_DESCRIPCION_ORIGINAL + 1)
    expect(descripcionParaTraducir('  ')).toBeNull()
  })

  it('textoEnIdioma: en castellano el original; en inglés la traducción o el original marcado', () => {
    expect(textoEnIdioma('Peña', 'Folk night', 'es')).toEqual({ texto: 'Peña', lang: 'es', enCastellano: false })
    expect(textoEnIdioma('Peña', 'Folk night', 'en')).toEqual({ texto: 'Folk night', lang: 'en', enCastellano: false })
    expect(textoEnIdioma('Peña', null, 'en')).toEqual({ texto: 'Peña', lang: 'es', enCastellano: true })
    expect(textoEnIdioma('Peña', '  ', 'en')).toEqual({ texto: 'Peña', lang: 'es', enCastellano: true })
  })
})

describe('traducirEvento (con traductor inyectado)', () => {
  it('le dice al modelo qué nombres no traducir', () => {
    const texto = textoParaElModelo(EVENTO)
    expect(texto).toContain('Do not translate these names: "Teatro Provincial", "Los Nocheros"')
    expect(texto).toContain('Title (Spanish): Los Nocheros en el Teatro Provincial')
  })

  it('devuelve la traducción validada, o null si el traductor falla (sin loguear el texto)', async () => {
    const ok = await traducirEvento(EVENTO, async () => ({ title_en: 'Los Nocheros at the Teatro Provincial', description_en: null }))
    expect(ok?.title_en).toBe('Los Nocheros at the Teatro Provincial')
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await traducirEvento(EVENTO, async () => { throw new Error(`fallo con ${EVENTO.title}`) })).toBeNull()
    expect(JSON.stringify(errores.mock.calls)).not.toContain('Nocheros')
    errores.mockRestore()
    expect(generarJsonDeTexto).not.toHaveBeenCalled()
  })
})

describe('traducirPendientes (proceso con tope)', () => {
  function admin(opts: { traducidosHoy: number; pendientes: number }) {
    const updates: Array<{ valores: Record<string, unknown>; id: unknown }> = []
    const filas = Array.from({ length: opts.pendientes }, (_, i) => ({
      id: `ev-${i}`,
      title: `Peña ${i}`,
      description: null,
      short_description: null,
      ai_metadata: { artists: ['Los Chalchaleros'] },
      venue: { name: 'La Casona del Molino' },
    }))
    let limite = Infinity
    const cliente = {
      from: () => {
        const q: Record<string, unknown> = {}
        let esConteo = false
        q.select = (_c: string, o?: { head?: boolean }) => {
          esConteo = !!o?.head
          return q
        }
        q.eq = () => q
        q.is = () => q
        q.gte = () => (esConteo ? Promise.resolve({ count: opts.traducidosHoy, error: null }) : q)
        q.order = () => q
        q.limit = (n: number) => {
          limite = n
          return Promise.resolve({ data: filas.slice(0, limite), error: null })
        }
        q.update = (valores: Record<string, unknown>) => ({
          eq: (_c: string, id: unknown) => ({
            is: () => {
              updates.push({ valores, id })
              return Promise.resolve({ error: null })
            },
          }),
        })
        return q
      },
    }
    return { cliente: cliente as never, updates }
  }

  it('con tope 0 no hace nada (ni lee)', async () => {
    const { cliente, updates } = admin({ traducidosHoy: 0, pendientes: 5 })
    const r = await traducirPendientes(cliente, { ahora: new Date(), topeTexto: '0', traductor: async () => ({}) })
    expect(r).toMatchObject({ tope: 0, intentados: 0 })
    expect(updates).toEqual([])
  })

  it('traduce como mucho un lote, marca cada intento y avisa si quedan', async () => {
    const { cliente, updates } = admin({ traducidosHoy: 0, pendientes: 25 })
    const r = await traducirPendientes(cliente, {
      ahora: new Date(),
      topeTexto: undefined,
      traductor: async (texto) => ({ title_en: `${/Title \(Spanish\): (.*)/.exec(texto)![1].replace('Peña', 'Folk night')}` }),
    })
    expect(r).toMatchObject({ intentados: LOTE_POR_CORRIDA, traducidos: LOTE_POR_CORRIDA, quedan: true })
    expect(updates).toHaveLength(LOTE_POR_CORRIDA)
    expect(updates[0].valores).toMatchObject({ title_en: 'Folk night 0', description_en: null })
    expect(updates[0].valores.traducido_en_at).toEqual(expect.any(String))
    // Nunca toca el título ni la descripción originales.
    for (const u of updates) expect(Object.keys(u.valores)).not.toContain('title')
  })

  it('respeta lo que queda del tope del día', async () => {
    const { cliente, updates } = admin({ traducidosHoy: 97, pendientes: 25 })
    const r = await traducirPendientes(cliente, { ahora: new Date(), topeTexto: '100', traductor: async () => null })
    expect(r).toMatchObject({ intentados: 3, descartados: 3, traducidos: 0, quedan: false })
    // Un descartado igual queda marcado (no se reintenta) y sin title_en.
    expect(updates.every((u) => !('title_en' in u.valores) && typeof u.valores.traducido_en_at === 'string')).toBe(true)
  })
})

// Q6-10: el 3/11 en producción las 100 llamadas tiraron (los logs de Vercel
// muestran 100 «la traducción falló», una cada ~180 ms) y la corrida las contó
// como 100 «descartados», marcadas para no reintentarse. El doble reproduce lo
// que tira `@google/genai` con la cuenta sin crédito: un ApiError con status 402.
const ERROR_402 = () =>
  new ApiError({
    message:
      '{"error":{"code":402,"message":"Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.","status":"RESOURCE_EXHAUSTED"}}',
    status: 402,
  })

describe('Q6-10: descartes con motivo (core)', () => {
  it('dice por qué descarta', () => {
    expect(validarTraduccionConMotivo(EVENTO, 'texto')).toEqual({ ok: false, motivo: 'no_es_objeto' })
    expect(validarTraduccionConMotivo(EVENTO, [])).toEqual({ ok: false, motivo: 'no_es_objeto' })
    expect(validarTraduccionConMotivo(EVENTO, {})).toEqual({ ok: false, motivo: 'sin_titulo' })
    expect(validarTraduccionConMotivo(EVENTO, { title_en: '   ' })).toEqual({ ok: false, motivo: 'sin_titulo' })
    expect(validarTraduccionConMotivo(EVENTO, { title_en: 'x'.repeat(300) })).toEqual({ ok: false, motivo: 'titulo_largo' })
    expect(validarTraduccionConMotivo(EVENTO, { title_en: 'Los Nocheros at the Provincial Theater' })).toEqual({ ok: false, motivo: 'nombre_cambiado' })
    expect(validarTraduccionConMotivo(EVENTO, { title_en: 'Los Nocheros at the Teatro Provincial' })).toMatchObject({ ok: true })
  })

  it('el título igual al original se acepta (no es motivo de descarte)', () => {
    const r = validarTraduccionConMotivo({ ...EVENTO, title: 'Los Nocheros' }, { title_en: 'Los Nocheros' })
    expect(r).toEqual({ ok: true, traduccion: { title_en: 'Los Nocheros', description_en: null } })
  })
})

describe('Q6-10: el fallo de la llamada, en códigos fijos', () => {
  it('reconoce el ApiError de @google/genai por su status', () => {
    expect(codigoDelFallo(ERROR_402())).toBe('sin_credito')
    expect(codigoDelFallo(new ApiError({ message: 'x', status: 429 }))).toBe('limite')
    expect(codigoDelFallo(new ApiError({ message: 'x', status: 403 }))).toBe('no_autorizado')
    expect(codigoDelFallo(new ApiError({ message: 'x', status: 404 }))).toBe('solicitud_invalida')
    expect(codigoDelFallo(new ApiError({ message: 'x', status: 503 }))).toBe('error_proveedor')
  })

  it('reconoce el ErrorIA de lib/ia (#187) por su código', () => {
    expect(codigoDelFallo(Object.assign(new Error('IA gemini: sin crédito (HTTP 402)'), { name: 'ErrorIA', codigo: 'sin_credito', estado: 402 }))).toBe('sin_credito')
    expect(codigoDelFallo(Object.assign(new Error('x'), { codigo: 'respuesta_invalida' }))).toBe('respuesta_invalida')
  })

  it('clave faltante, respuesta vacía, JSON roto, red y lo desconocido', () => {
    expect(codigoDelFallo(new Error('GEMINI_API_KEY no está configurada. Verifica las variables de entorno.'))).toBe('sin_clave')
    expect(codigoDelFallo(new Error('Gemini devolvió una respuesta vacía'))).toBe('respuesta_invalida')
    expect(codigoDelFallo(new SyntaxError('Unexpected token'))).toBe('respuesta_invalida')
    expect(codigoDelFallo(new TypeError('fetch failed'))).toBe('red')
    expect(codigoDelFallo(new Error('otra cosa'))).toBe('desconocido')
    expect(codigoDelFallo('texto')).toBe('desconocido')
  })

  it('traducirEventoConMotivo: el 402 es error del proveedor (no un descarte) y se loguea solo el código', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await traducirEventoConMotivo(EVENTO, async () => { throw ERROR_402() })).toEqual({ tipo: 'error_proveedor', codigo: 'sin_credito' })
    expect(await traducirEventoConMotivo(EVENTO, async () => { throw new SyntaxError('bad json') })).toEqual({ tipo: 'descartado', motivo: 'respuesta_invalida' })
    expect(await traducirEventoConMotivo(EVENTO, async () => ({ title_en: 'The Night Ones' }))).toEqual({ tipo: 'descartado', motivo: 'nombre_cambiado' })
    const logs = JSON.stringify(errores.mock.calls)
    expect(logs).toContain('sin_credito')
    expect(logs).not.toContain('prepayment')
    expect(logs).not.toContain('Nocheros')
    errores.mockRestore()
    expect(generarJsonDeTexto).not.toHaveBeenCalled()
  })
})

describe('Q6-10: traducirPendientes ante un error del proveedor', () => {
  function admin(pendientes: number) {
    const updates: Array<Record<string, unknown>> = []
    const filas = Array.from({ length: pendientes }, (_, i) => ({
      id: `ev-${i}`,
      title: i % 2 === 0 ? `Peña en Balderrama ${i}` : `Muestra ${i}`,
      description: 'Una noche de folklore.',
      short_description: null,
      ai_metadata: null,
      venue: { name: 'Balderrama' },
    }))
    const cliente = {
      from: () => {
        const q: Record<string, unknown> = {}
        let esConteo = false
        q.select = (_c: string, o?: { head?: boolean }) => {
          esConteo = !!o?.head
          return q
        }
        q.eq = () => q
        q.is = () => q
        q.gte = () => (esConteo ? Promise.resolve({ count: 0, error: null }) : q)
        q.order = () => q
        q.limit = (n: number) => Promise.resolve({ data: filas.slice(0, n), error: null })
        q.update = (valores: Record<string, unknown>) => ({
          eq: () => ({
            is: () => {
              updates.push(valores)
              return Promise.resolve({ error: null })
            },
          }),
        })
        return q
      },
    }
    return { cliente: cliente as never, updates }
  }

  it('reproduce el 3/11: con 402 no marca ningún evento, no cuenta descartados y corta en la primera llamada', async () => {
    const { cliente, updates } = admin(25)
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    const traductor = vi.fn(async () => {
      throw ERROR_402()
    })
    const r = await traducirPendientes(cliente, { ahora: new Date(), topeTexto: undefined, traductor })
    errores.mockRestore()
    expect(traductor).toHaveBeenCalledTimes(1)
    expect(r).toMatchObject({
      intentados: 0,
      traducidos: 0,
      descartados: 0,
      errorProveedor: 'sin_credito',
      sinIntentar: LOTE_POR_CORRIDA,
      quedan: false,
      descartesPorMotivo: {},
    })
    // Sin marcar: mañana (o cuando haya crédito) se reintentan y no gastaron el tope.
    expect(updates).toEqual([])
  })

  it('si el 402 llega a mitad de lote, guarda lo traducido y corta ahí', async () => {
    const { cliente, updates } = admin(25)
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    let n = 0
    const r = await traducirPendientes(cliente, {
      ahora: new Date(),
      topeTexto: undefined,
      traductor: async () => {
        n += 1
        if (n > 3) throw ERROR_402()
        return { title_en: 'Folk night at Balderrama' }
      },
    })
    errores.mockRestore()
    expect(r).toMatchObject({ intentados: 3, traducidos: 3, descartados: 0, errorProveedor: 'sin_credito', sinIntentar: 7, quedan: false })
    // Solo los tres que el modelo contestó quedan marcados; los 7 restantes esperan.
    expect(updates).toHaveLength(3)
    expect(updates.every((u) => u.title_en === 'Folk night at Balderrama')).toBe(true)
  })

  it('cuenta los descartes por motivo (sin títulos)', async () => {
    const { cliente } = admin(4)
    const r = await traducirPendientes(cliente, {
      ahora: new Date(),
      topeTexto: undefined,
      traductor: async (texto) => (texto.includes('Balderrama 0') ? { title_en: 'Folk night at Old Station' } : texto.includes('Muestra 1') ? {} : { title_en: 'Show at Balderrama' }),
    })
    expect(r).toMatchObject({ intentados: 4, traducidos: 2, descartados: 2, errorProveedor: null, descartesPorMotivo: { nombre_cambiado: 1, sin_titulo: 1 } })
    expect(JSON.stringify(r)).not.toContain('Peña')
  })
})
