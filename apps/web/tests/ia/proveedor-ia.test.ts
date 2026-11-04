// Q6-3 · Capa de proveedor de IA intercambiable. Sin red y sin gasto: fetch y
// el cliente de Gemini son dobles; claves y textos inventados.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { crearProveedorClaude, perfilModeloClaude, tipoImagenClaude, CLAUDE_URL } from '@/lib/ia/claude'
import { crearProveedorGemini, GEMINI_MODEL, type ClienteGemini } from '@/lib/ia/gemini'
import { controlarRespuesta, normalizarEsquema, validarContraEsquema } from '@/lib/ia/esquema'
import { crearProveedorDesdeEntorno, elegirProveedor, modeloClaude, proveedorYModeloActivos } from '@/lib/ia/seleccion'
import {
  conRegistro,
  crearRegistradorSupabase,
  registradorPorDefecto,
  type RegistroLlamadaIA,
} from '@/lib/ia/registro'
import { ErrorIA, type ProveedorIA } from '@/lib/ia/tipos'
import { extractEventFromFlyer, generarJsonDeTexto } from '@/lib/ai/llamadas-ia'

const CLAVE = 'clave-falsa-de-prueba-123'
const PROMPT_SENSIBLE = 'Texto del evento que no tiene que aparecer en logs'

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Dobles
// ---------------------------------------------------------------------------

function respuestaJson(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } })
}

function fetchDoble(...respuestas: Array<Response | Error>) {
  const llamadas: Array<{ url: string; init: RequestInit; cuerpo: Record<string, unknown> }> = []
  let i = 0
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    llamadas.push({ url, init, cuerpo: JSON.parse(String(init.body)) })
    const r = respuestas[Math.min(i++, respuestas.length - 1)]
    if (r instanceof Error) throw r
    return r
  })
  return { fn, llamadas }
}

function relojDe(...marcas: number[]) {
  let i = 0
  return () => marcas[Math.min(i++, marcas.length - 1)]
}

function clienteGeminiDoble(respuesta: unknown | Error) {
  const generateContent = vi.fn(async (params: Record<string, unknown>) => {
    void params
    if (respuesta instanceof Error) throw respuesta
    return respuesta as { text?: string }
  })
  return { cliente: { models: { generateContent } } as ClienteGemini, generateContent }
}

const ESQUEMA_GEMINI = {
  type: 'OBJECT',
  properties: {
    title_en: { type: 'STRING' },
    description_en: { type: 'STRING', nullable: true },
  },
  required: ['title_en'],
}

const usoClaude = { input_tokens: 321, output_tokens: 45 }
const herramienta = (input: unknown) => ({
  content: [{ type: 'tool_use', id: 'toolu_x', name: 'responder', input }],
  stop_reason: 'tool_use',
  usage: usoClaude,
})

// ---------------------------------------------------------------------------
// Selección
// ---------------------------------------------------------------------------

describe('selección de proveedor (IA_PROVEEDOR)', () => {
  it('por defecto es gemini, con el mismo modelo de siempre', () => {
    expect(elegirProveedor({})).toEqual({ nombre: 'gemini' })
    expect(elegirProveedor({ IA_PROVEEDOR: '' })).toEqual({ nombre: 'gemini' })
    expect(elegirProveedor({ IA_PROVEEDOR: 'gemini' })).toEqual({ nombre: 'gemini' })
    const p = crearProveedorDesdeEntorno({ GEMINI_API_KEY: CLAVE })
    expect(p.nombre).toBe('gemini')
    expect(p.modelo).toBe('gemini-3.5-flash-lite')
    expect(GEMINI_MODEL).toBe('gemini-3.5-flash-lite')
    expect(proveedorYModeloActivos({})).toEqual({ proveedor: 'gemini', modelo: 'gemini-3.5-flash-lite' })
  })

  it('claude (sin importar mayúsculas ni espacios) elige Claude con claude-haiku-4-5 por defecto', () => {
    expect(elegirProveedor({ IA_PROVEEDOR: ' Claude ' })).toEqual({ nombre: 'claude' })
    const p = crearProveedorDesdeEntorno({ IA_PROVEEDOR: 'claude', ANTHROPIC_API_KEY: CLAVE })
    expect(p.nombre).toBe('claude')
    expect(p.modelo).toBe('claude-haiku-4-5')
    expect(proveedorYModeloActivos({ IA_PROVEEDOR: 'claude' })).toEqual({ proveedor: 'claude', modelo: 'claude-haiku-4-5' })
  })

  it('IA_MODELO_CLAUDE cambia el modelo; un valor raro vuelve al de por defecto con aviso', () => {
    expect(modeloClaude({ IA_MODELO_CLAUDE: 'claude-sonnet-4-6' })).toEqual({ modelo: 'claude-sonnet-4-6' })
    const raro = modeloClaude({ IA_MODELO_CLAUDE: 'gpt-4; drop' })
    expect(raro.modelo).toBe('claude-haiku-4-5')
    expect(raro.aviso).toBeTruthy()
  })

  it('un valor desconocido cae a gemini con aviso (sin repetir el valor)', () => {
    const r = elegirProveedor({ IA_PROVEEDOR: 'openai-secreto' })
    expect(r.nombre).toBe('gemini')
    expect(r.aviso).toMatch(/no reconocido/)
    expect(r.aviso).not.toMatch(/openai-secreto/)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(crearProveedorDesdeEntorno({ IA_PROVEEDOR: 'otro-valor', GEMINI_API_KEY: CLAVE }).nombre).toBe('gemini')
    expect(warn).toHaveBeenCalled()
  })

  it('claude sin ANTHROPIC_API_KEY: error sin_clave claro y NO se usa Gemini en su lugar', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { fn } = fetchDoble(respuestaJson({}))
    const { cliente, generateContent } = clienteGeminiDoble({ text: '{}' })
    const p = crearProveedorDesdeEntorno(
      { IA_PROVEEDOR: 'claude', GEMINI_API_KEY: CLAVE },
      { fetch: fn, clienteGemini: cliente },
    )
    expect(p.nombre).toBe('claude')
    const r = await p.generarTexto({ prompt: 'hola', maxTokens: 10 })
    expect(r.ok).toBe(false)
    expect(r.error?.codigo).toBe('sin_clave')
    expect(r.error?.mensaje).toMatch(/ANTHROPIC_API_KEY/)
    expect(fn).not.toHaveBeenCalled()
    expect(generateContent).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Claude: forma del pedido
// ---------------------------------------------------------------------------

describe('Claude: pedido bien formado', () => {
  it('texto: URL, headers, modelo, max_tokens, system, temperature y messages', async () => {
    const { fn, llamadas } = fetchDoble(
      respuestaJson({ content: [{ type: 'text', text: 'Hola' }], stop_reason: 'end_turn', usage: usoClaude }),
    )
    const p = crearProveedorClaude({ apiKey: CLAVE, fetch: fn, reloj: relojDe(1000, 1250) })
    const r = await p.generarTexto({ sistema: 'Sos breve.', prompt: 'Decí hola', maxTokens: 50, temperatura: 0.1 })
    expect(r).toEqual({
      ok: true,
      texto: 'Hola',
      uso: { proveedor: 'claude', modelo: 'claude-haiku-4-5', tokensEntrada: 321, tokensSalida: 45, latenciaMs: 250 },
    })
    expect(llamadas).toHaveLength(1)
    const { url, init, cuerpo } = llamadas[0]
    expect(url).toBe(CLAUDE_URL)
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({
      'x-api-key': CLAVE,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    })
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(cuerpo).toEqual({
      model: 'claude-haiku-4-5',
      max_tokens: 50,
      system: 'Sos breve.',
      temperature: 0.1,
      messages: [{ role: 'user', content: 'Decí hola' }],
    })
  })

  it('JSON: tool use con input_schema normalizado y tool_choice forzado (Haiku 4.5)', async () => {
    const { fn, llamadas } = fetchDoble(respuestaJson(herramienta({ title_en: 'Folk night', description_en: null })))
    const p = crearProveedorClaude({ apiKey: CLAVE, fetch: fn })
    const r = await p.generarJson({ sistema: 'Traducí.', prompt: 'Peña', maxTokens: 300, esquema: ESQUEMA_GEMINI })
    expect(r.ok).toBe(true)
    expect(r.datos).toEqual({ title_en: 'Folk night', description_en: null })
    const { cuerpo } = llamadas[0]
    expect(cuerpo.tools).toEqual([
      {
        name: 'responder',
        description: expect.any(String),
        input_schema: {
          type: 'object',
          properties: { title_en: { type: 'string' }, description_en: { type: ['string', 'null'] } },
          required: ['title_en'],
        },
      },
    ])
    expect(cuerpo.tool_choice).toEqual({ type: 'tool', name: 'responder' })
    expect(cuerpo.system).toBe('Traducí.')
  })

  it('modelos nuevos: sin temperature ni tool_choice forzado (auto + instrucción)', async () => {
    expect(perfilModeloClaude('claude-haiku-4-5')).toEqual({ herramientaForzada: true, temperatura: true })
    expect(perfilModeloClaude('claude-opus-4-8')).toEqual({ herramientaForzada: true, temperatura: false })
    expect(perfilModeloClaude('claude-haiku-5-5')).toEqual({ herramientaForzada: false, temperatura: false })
    const { fn, llamadas } = fetchDoble(respuestaJson(herramienta({ title_en: 'x' })))
    const p = crearProveedorClaude({ apiKey: CLAVE, modelo: 'claude-opus-5-5', fetch: fn })
    const r = await p.generarJson({ sistema: 'Traducí.', prompt: 'Peña', maxTokens: 300, temperatura: 0.1, esquema: ESQUEMA_GEMINI })
    expect(r.ok).toBe(true)
    const { cuerpo } = llamadas[0]
    expect(cuerpo.model).toBe('claude-opus-5-5')
    expect(cuerpo).not.toHaveProperty('temperature')
    expect(cuerpo.tool_choice).toEqual({ type: 'auto' })
    expect(String(cuerpo.system)).toMatch(/^Traducí\.\n\n.*`responder`/)
  })

  it('imagen: bloque image base64 antes del texto; tipo por los bytes si el declarado no sirve', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
    const { fn, llamadas } = fetchDoble(respuestaJson(herramienta({ title_en: 'x' })))
    const p = crearProveedorClaude({ apiKey: CLAVE, fetch: fn })
    const r = await p.generarJsonDesdeImagen({
      prompt: 'Caption',
      maxTokens: 100,
      esquema: ESQUEMA_GEMINI,
      imagen: { datos: jpeg, mimeType: 'binary/octet-stream' },
    })
    expect(r.ok).toBe(true)
    expect((llamadas[0].cuerpo.messages as unknown[])[0]).toEqual({
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') } },
        { type: 'text', text: 'Caption' },
      ],
    })
    expect(tipoImagenClaude({ datos: new Uint8Array([1]), mimeType: 'image/JPG; charset=x' })).toBe('image/jpeg')
    expect(tipoImagenClaude({ datos: Buffer.from('RIFF0000WEBP'), mimeType: '' })).toBe('image/webp')
    expect(tipoImagenClaude({ datos: new Uint8Array([1, 2, 3]), mimeType: 'image/heic' })).toBeNull()
  })

  it('imagen no soportada o de más de 5 MB: solicitud_invalida sin llamar (ni gastar)', async () => {
    const { fn } = fetchDoble(respuestaJson({}))
    const p = crearProveedorClaude({ apiKey: CLAVE, fetch: fn })
    const base = { prompt: 'x', maxTokens: 10, esquema: ESQUEMA_GEMINI }
    const raro = await p.generarJsonDesdeImagen({ ...base, imagen: { datos: new Uint8Array([1, 2, 3]), mimeType: 'image/heic' } })
    expect(raro.error?.codigo).toBe('solicitud_invalida')
    const grande = new Uint8Array(5 * 1024 * 1024 + 1)
    grande.set([0xff, 0xd8, 0xff])
    const enorme = await p.generarJsonDesdeImagen({ ...base, imagen: { datos: grande, mimeType: 'image/jpeg' } })
    expect(enorme.error?.codigo).toBe('solicitud_invalida')
    expect(fn).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Claude: errores normalizados
// ---------------------------------------------------------------------------

describe('Claude: errores normalizados y sin filtrar nada', () => {
  const casos: Array<[string, Response | Error, string]> = [
    ['401', respuestaJson({ type: 'error', error: { type: 'authentication_error', message: `invalid x-api-key ${CLAVE}` } }, 401), 'no_autorizado'],
    ['402', respuestaJson({ type: 'error', error: { type: 'billing_error', message: 'pay' } }, 402), 'sin_credito'],
    ['400 sin saldo', respuestaJson({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low' } }, 400), 'sin_credito'],
    ['400 común', respuestaJson({ type: 'error', error: { type: 'invalid_request_error', message: PROMPT_SENSIBLE } }, 400), 'solicitud_invalida'],
    ['404 modelo', respuestaJson({ type: 'error', error: { type: 'not_found_error', message: 'model' } }, 404), 'solicitud_invalida'],
    ['429', respuestaJson({ type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }, 429), 'limite'],
    ['500', respuestaJson({ type: 'error', error: { type: 'api_error', message: 'boom' } }, 500), 'error_proveedor'],
    ['529', respuestaJson({ type: 'error', error: { type: 'overloaded_error', message: 'busy' } }, 529), 'error_proveedor'],
    ['500 sin JSON', new Response('<html>caído</html>', { status: 500 }), 'error_proveedor'],
    ['timeout', new DOMException('The operation was aborted due to timeout', 'TimeoutError'), 'timeout'],
    ['red', new TypeError('fetch failed'), 'red'],
    ['200 sin JSON', new Response('no es json', { status: 200 }), 'respuesta_invalida'],
  ]
  for (const [nombre, respuesta, codigo] of casos) {
    it(`${nombre} → ${codigo}`, async () => {
      const { fn } = fetchDoble(respuesta)
      const p = crearProveedorClaude({ apiKey: CLAVE, fetch: fn })
      const r = await p.generarJson({ prompt: PROMPT_SENSIBLE, maxTokens: 10, esquema: ESQUEMA_GEMINI })
      expect(r.ok).toBe(false)
      expect(r.error?.codigo).toBe(codigo)
      expect(r.error?.mensaje).toMatch(/^IA claude: /)
      expect(r.error?.mensaje).not.toContain(CLAVE)
      expect(r.error?.mensaje).not.toContain(PROMPT_SENSIBLE)
      expect(r.uso.proveedor).toBe('claude')
    })
  }

  it('respuesta sin la herramienta, fuera del esquema, cortada o rechazada → respuesta_invalida', async () => {
    const cuerpos = [
      { content: [{ type: 'text', text: '{"title_en":"x"}' }], stop_reason: 'end_turn', usage: usoClaude },
      herramienta({ title_en: 42 }),
      herramienta({ description_en: 'falta el título' }),
      { ...herramienta({ title_en: 'x' }), stop_reason: 'max_tokens' },
      { content: [], stop_reason: 'refusal', usage: usoClaude },
    ]
    for (const c of cuerpos) {
      const { fn } = fetchDoble(respuestaJson(c))
      const r = await crearProveedorClaude({ apiKey: CLAVE, fetch: fn }).generarJson({ prompt: 'x', maxTokens: 10, esquema: ESQUEMA_GEMINI })
      expect(r.error?.codigo).toBe('respuesta_invalida')
      // El consumo se lee igual: la llamada se cobró.
      expect(r.uso.tokensEntrada).toBe(321)
    }
  })

  it('generarJsonDeTexto tira ErrorIA con el código, para que quien llama decida', async () => {
    const { fn } = fetchDoble(respuestaJson({ type: 'error', error: { type: 'rate_limit_error', message: 'x' } }, 429))
    const ia = crearProveedorClaude({ apiKey: CLAVE, fetch: fn })
    const error = await generarJsonDeTexto('s', PROMPT_SENSIBLE, ESQUEMA_GEMINI, { uso: 'traduccion', ia }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ErrorIA)
    expect((error as ErrorIA).codigo).toBe('limite')
    expect((error as ErrorIA).estado).toBe(429)
    expect((error as ErrorIA).message).toBe('IA claude: límite de uso alcanzado (HTTP 429)')
  })
})

// ---------------------------------------------------------------------------
// Esquema
// ---------------------------------------------------------------------------

describe('esquema: normalización y validación', () => {
  it('pasa el dialecto de Gemini a JSON Schema común sin tocar el original', () => {
    const original = JSON.parse(JSON.stringify(ESQUEMA_GEMINI))
    const n = normalizarEsquema({
      type: 'OBJECT',
      properties: {
        cat: { type: 'STRING', enum: ['a', 'b'], nullable: true, description: 'd' },
        lista: { type: 'ARRAY', items: { type: 'STRING' } },
      },
    })
    expect(n).toEqual({
      type: 'object',
      properties: {
        cat: { type: ['string', 'null'], enum: ['a', 'b', null], description: 'd' },
        lista: { type: 'array', items: { type: 'string' } },
      },
    })
    normalizarEsquema(ESQUEMA_GEMINI)
    expect(ESQUEMA_GEMINI).toEqual(original)
  })

  it('valida tipos, nullables, enum, requeridos, enteros y listas, sin copiar valores', () => {
    const esquema = {
      type: 'object',
      properties: {
        n: { type: 'integer', nullable: true },
        e: { type: 'string', enum: ['x'] },
        l: { type: 'array', items: { type: 'string' } },
      },
      required: ['n', 'e'],
    }
    expect(validarContraEsquema({ n: null, e: 'x', l: ['a'] }, esquema)).toEqual([])
    expect(validarContraEsquema({ n: 3, e: 'x' }, esquema)).toEqual([])
    const problemas = validarContraEsquema({ n: 2.5, e: 'secreto', l: ['a', 7] }, esquema)
    expect(problemas).toEqual([
      '$.n: se esperaba integer o null y vino number',
      '$.e: fuera de los valores permitidos',
      '$.l[1]: se esperaba string y vino number',
    ])
    expect(problemas.join(' ')).not.toContain('secreto')
    expect(validarContraEsquema({ e: 'x' }, esquema)).toEqual(['$.n: falta'])
  })

  it('validación "forma": solo exige un objeto', () => {
    expect(controlarRespuesta({ n: 'cualquier cosa' }, { type: 'object', required: ['otra'] }, 'forma')).toEqual({ ok: true })
    expect(controlarRespuesta([1], { type: 'object' }, 'forma').ok).toBe(false)
    expect(controlarRespuesta({}, { type: 'object', required: ['otra'] }).ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Gemini: el mismo pedido de antes
// ---------------------------------------------------------------------------

describe('Gemini: sin cambios de comportamiento', () => {
  it('flyer: el pedido es el mismo de antes de Q6-3 (modelo, contents, systemInstruction, temperature, JSON y esquema)', async () => {
    const extraido = {
      title: 'Peña de prueba',
      date: '2026-11-07',
      start_time: null,
      flyer_text: null,
      price: null,
      venue_name: 'Lugar de Prueba',
      category_slug: 'penas',
      artists: [],
    }
    const { cliente, generateContent } = clienteGeminiDoble({
      text: JSON.stringify(extraido),
      usageMetadata: { promptTokenCount: 1500, candidatesTokenCount: 80, thoughtsTokenCount: 20 },
    })
    const registros: RegistroLlamadaIA[] = []
    const ia = conRegistro(
      crearProveedorGemini({ apiKey: CLAVE, cliente, reloj: relojDe(0, 900) }),
      'flyers',
      (r) => {
        registros.push(r)
      },
    )
    const imagen = Buffer.from([0xff, 0xd8, 0xff, 9, 9])
    const r = await extractEventFromFlyer(imagen, 'image/jpeg', 'Caption de prueba', 'cuenta_prueba', ia)
    expect(r).toEqual(extraido)

    expect(generateContent).toHaveBeenCalledTimes(1)
    const params = generateContent.mock.calls[0][0] as Record<string, unknown>
    expect(Object.keys(params)).toEqual(['model', 'contents', 'config'])
    expect(params.model).toBe('gemini-3.5-flash-lite')
    expect(params.contents).toEqual([
      { inlineData: { data: imagen.toString('base64'), mimeType: 'image/jpeg' } },
      'Texto descriptivo de la publicación (Caption):\nCaption de prueba',
    ])
    const config = params.config as Record<string, unknown>
    // Las mismas claves que antes, en el mismo orden: sin maxOutputTokens ni timeout nuevos.
    expect(Object.keys(config)).toEqual(['systemInstruction', 'temperature', 'responseMimeType', 'responseSchema'])
    expect(config.temperature).toBe(0.1)
    expect(config.responseMimeType).toBe('application/json')
    expect(String(config.systemInstruction)).toContain('publicado por la cuenta de Instagram: @cuenta_prueba')
    const esquema = config.responseSchema as { type: string; required: string[]; properties: Record<string, { enum?: string[] }> }
    expect(esquema.type).toBe('OBJECT')
    expect(esquema.required).toEqual(['title', 'date', 'start_time', 'flyer_text', 'price', 'venue_name', 'category_slug', 'artists'])
    expect(esquema.properties.category_slug.enum).toContain('penas')

    expect(registros).toEqual([
      {
        uso: 'flyers',
        proveedor: 'gemini',
        modelo: 'gemini-3.5-flash-lite',
        tokensEntrada: 1500,
        tokensSalida: 100,
        latenciaMs: 900,
        ok: true,
        errorCodigo: null,
      },
    ])
  })

  it('flyer: un campo fuera del esquema NO se rechaza en la capa (lo controla process-flyer-ai, como antes)', async () => {
    const { cliente } = clienteGeminiDoble({ text: JSON.stringify({ title: 'x', category_slug: 'inventada', price: 'null' }) })
    const ia = crearProveedorGemini({ apiKey: CLAVE, cliente })
    const r = await extractEventFromFlyer(Buffer.from([1]), 'image/png', null, null, ia)
    expect(r).toEqual({ title: 'x', category_slug: 'inventada', price: 'null' })
  })

  it('texto JSON (traducción / clasificación): contents [texto] y el esquema tal cual', async () => {
    const { cliente, generateContent } = clienteGeminiDoble({ text: '{"slug":"teatro"}' })
    const ia = crearProveedorGemini({ apiKey: CLAVE, cliente })
    const esquema = { type: 'object', properties: { slug: { type: 'string', enum: ['teatro'] } }, required: ['slug'] }
    await expect(generarJsonDeTexto('Clasificá.', 'Título: x', esquema, { uso: 'clasificacion', ia })).resolves.toEqual({ slug: 'teatro' })
    expect(generateContent.mock.calls[0][0]).toEqual({
      model: 'gemini-3.5-flash-lite',
      contents: ['Título: x'],
      config: { systemInstruction: 'Clasificá.', temperature: 0.1, responseMimeType: 'application/json', responseSchema: esquema },
    })
    expect((generateContent.mock.calls[0][0] as { config: { responseSchema: unknown } }).config.responseSchema).toBe(esquema)
  })

  it('sin clave, vacía, no JSON o error del SDK: ErrorIA con mensaje seguro (la cola va al camino de falla como antes)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const sinClave = await extractEventFromFlyer(Buffer.from([1]), 'image/png', null, null, crearProveedorGemini({ apiKey: undefined }))
      .catch((e: unknown) => e)
    expect(sinClave).toBeInstanceOf(ErrorIA)
    expect((sinClave as ErrorIA).codigo).toBe('sin_clave')
    expect((sinClave as ErrorIA).message).toMatch(/GEMINI_API_KEY no está configurada/)

    const casos: Array<[unknown, string]> = [
      [{ text: '' }, 'respuesta_invalida'],
      [{ text: 'no es json' }, 'respuesta_invalida'],
      [Object.assign(new Error(`quota ${PROMPT_SENSIBLE}`), { status: 429 }), 'limite'],
      [Object.assign(new Error('Your prepayment credits are depleted'), { status: 429 }), 'sin_credito'],
      [Object.assign(new Error('API key not valid. Please pass a valid API key.'), { status: 400 }), 'no_autorizado'],
      [Object.assign(new Error('forbidden'), { status: 403 }), 'no_autorizado'],
      [Object.assign(new Error('internal'), { status: 503 }), 'error_proveedor'],
      [new TypeError('fetch failed'), 'red'],
      [Object.assign(new Error('aborted'), { name: 'AbortError' }), 'timeout'],
    ]
    for (const [respuesta, codigo] of casos) {
      const { cliente } = clienteGeminiDoble(respuesta)
      const e = await extractEventFromFlyer(Buffer.from([1]), 'image/png', null, null, crearProveedorGemini({ apiKey: CLAVE, cliente }))
        .catch((x: unknown) => x)
      expect(e, codigo).toBeInstanceOf(ErrorIA)
      expect((e as ErrorIA).codigo).toBe(codigo)
      expect((e as ErrorIA).message).not.toContain(PROMPT_SENSIBLE)
      expect((e as ErrorIA).message).not.toContain(CLAVE)
    }
  })
})

// ---------------------------------------------------------------------------
// Registro
// ---------------------------------------------------------------------------

describe('registro por llamada (best-effort)', () => {
  const proveedorFijo = (ok: boolean): ProveedorIA => {
    const uso = { proveedor: 'claude' as const, modelo: 'claude-haiku-4-5', tokensEntrada: 10, tokensSalida: 2, latenciaMs: 5 }
    const r = ok
      ? { ok: true as const, datos: { a: 1 }, uso }
      : { ok: false as const, error: { codigo: 'limite' as const, mensaje: 'IA claude: límite' }, uso }
    return {
      nombre: 'claude',
      modelo: 'claude-haiku-4-5',
      generarTexto: async () => (ok ? { ok: true, texto: 't', uso } : { ok: false, error: r.error!, uso }),
      generarJson: async <T>() => r as never as Awaited<ReturnType<ProveedorIA['generarJson']>> & { datos?: T },
      generarJsonDesdeImagen: async () => r,
    } as ProveedorIA
  }

  it('registra uso, proveedor, modelo, tokens, latencia y código; nunca el prompt ni la respuesta', async () => {
    const registros: RegistroLlamadaIA[] = []
    const ia = conRegistro(proveedorFijo(false), 'traduccion', (r) => {
      registros.push(r)
    })
    const r = await ia.generarJson({ prompt: PROMPT_SENSIBLE, maxTokens: 10, esquema: {} })
    expect(r.ok).toBe(false)
    expect(registros).toEqual([
      { uso: 'traduccion', proveedor: 'claude', modelo: 'claude-haiku-4-5', tokensEntrada: 10, tokensSalida: 2, latenciaMs: 5, ok: false, errorCodigo: 'limite' },
    ])
    expect(JSON.stringify(registros)).not.toContain(PROMPT_SENSIBLE)
  })

  it('si el registro falla (rechazo o throw sincrónico), la llamada vuelve igual', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const conRechazo = conRegistro(proveedorFijo(true), 'flyers', async () => {
      throw new Error(`base caída ${CLAVE}`)
    })
    await expect(conRechazo.generarJson({ prompt: 'x', maxTokens: 1, esquema: {} })).resolves.toMatchObject({ ok: true, datos: { a: 1 } })
    const conThrow = conRegistro(proveedorFijo(true), 'flyers', () => {
      throw new Error('sync')
    })
    await expect(conThrow.generarTexto({ prompt: 'x', maxTokens: 1 })).resolves.toMatchObject({ ok: true, texto: 't' })
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn.mock.calls.flat().join(' ')).not.toContain(CLAVE)
  })

  it('crearRegistradorSupabase inserta solo las columnas de ia_llamadas', async () => {
    const insert = vi.fn(async () => ({ error: null }))
    const from = vi.fn(() => ({ insert }))
    await crearRegistradorSupabase({ from })({
      uso: 'clasificacion',
      proveedor: 'gemini',
      modelo: 'gemini-3.5-flash-lite',
      tokensEntrada: null,
      tokensSalida: null,
      latenciaMs: 12,
      ok: false,
      errorCodigo: 'timeout',
    })
    expect(from).toHaveBeenCalledWith('ia_llamadas')
    expect(insert).toHaveBeenCalledWith({
      uso: 'clasificacion',
      proveedor: 'gemini',
      modelo: 'gemini-3.5-flash-lite',
      tokens_entrada: null,
      tokens_salida: null,
      latencia_ms: 12,
      ok: false,
      error_codigo: 'timeout',
    })
  })

  it('el registrador por defecto no hace nada sin las variables de Supabase', async () => {
    await expect(
      registradorPorDefecto({})({ uso: 'prueba', proveedor: 'gemini', modelo: 'm', tokensEntrada: 1, tokensSalida: 1, latenciaMs: 1, ok: true, errorCodigo: null }),
    ).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Detector: todo pasa por la capa
// ---------------------------------------------------------------------------

describe('todas las llamadas a la IA pasan por lib/ia', () => {
  it('ningún archivo fuera de lib/ia usa el SDK de Gemini ni las URLs de los proveedores', () => {
    const raiz = process.cwd()
    const archivos: string[] = []
    const recorrer = (dir: string) => {
      for (const nombre of readdirSync(dir)) {
        if (nombre === 'node_modules' || nombre === '.next' || nombre === 'tests' || nombre.startsWith('.')) continue
        const ruta = join(dir, nombre)
        if (statSync(ruta).isDirectory()) recorrer(ruta)
        else if (/\.(ts|tsx|mjs|js)$/.test(nombre)) archivos.push(ruta)
      }
    }
    for (const d of ['app', 'lib', 'scripts', 'components']) recorrer(join(raiz, d))
    const fuera = archivos
      .filter((a) => !relative(raiz, a).startsWith(join('lib', 'ia')))
      .filter((a) => /@google\/genai|generativelanguage\.googleapis|api\.anthropic\.com/.test(readFileSync(a, 'utf8')))
      .map((a) => relative(raiz, a))
    expect(fuera).toEqual([])
  })
})
