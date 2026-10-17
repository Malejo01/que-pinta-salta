/**
 * `notificaciones/expo-push.ts` (R39, tarea 39-c): cliente HTTP de la API de
 * Expo Push sin SDK. Ninguna llamada real: `fetch` siempre es un doble
 * (`vi.fn`). Si algún test llegara a pegarle a la red de verdad, es un bug
 * del test, no algo a arreglar acá.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EXPO_PUSH_BATCH_SIZE,
  enviarLote,
  esTokenExpoValido,
  leerReceipts,
  tokensInvalidos,
  type ExpoPushTicket,
} from '@/lib/notificaciones/expo-push'

/** Un `Response` fetch de mentira, con lo mínimo que usa el módulo. */
function respuestaFalsa(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } as Response
}

function tokenFalso(n: number): string {
  return `ExponentPushToken[token-${n}]`
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('esTokenExpoValido', () => {
  it('acepta un token con forma válida', () => {
    expect(esTokenExpoValido('ExponentPushToken[abc123]')).toBe(true)
  })

  it.each(['no-es-un-token', '', 'ExponentPushToken'])('rechaza "%s"', (token) => {
    expect(esTokenExpoValido(token)).toBe(false)
  })

  it('rechaza los corchetes vacíos', () => {
    expect(esTokenExpoValido('ExponentPushToken[]')).toBe(false)
  })
})

describe('enviarLote: tokens inválidos', () => {
  it('descarta antes de mandar y no llama a fetch si no queda ninguno válido', async () => {
    const fetchImpl = vi.fn()
    const resultado = await enviarLote(
      [{ to: 'no-es-un-token' }, { to: '' }, { to: 'ExponentPushToken' }],
      fetchImpl as unknown as typeof fetch,
    )

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(resultado.descartados).toBe(3)
    expect(resultado.tickets).toEqual([])
    expect(resultado.erroresLote).toEqual([])
  })

  it('manda solo los válidos y cuenta los descartados', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      respuestaFalsa({ data: [{ status: 'ok', id: 'ticket-1' }] }),
    )
    const resultado = await enviarLote(
      [{ to: tokenFalso(1) }, { to: 'invalido' }],
      fetchImpl as unknown as typeof fetch,
    )

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(resultado.descartados).toBe(1)
    expect(resultado.tickets).toEqual([{ token: tokenFalso(1), ticket: { status: 'ok', id: 'ticket-1' } }])
  })
})

describe('enviarLote: loteo', () => {
  it('250 mensajes son 3 llamadas (100, 100, 50), cada una con su porción', async () => {
    const mensajes = Array.from({ length: 250 }, (_, i) => ({ to: tokenFalso(i) }))
    const fetchImpl = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as Array<{ to: string }>
      return respuestaFalsa({ data: body.map((_, i) => ({ status: 'ok', id: `ticket-${i}` })) })
    })

    const resultado = await enviarLote(mensajes, fetchImpl as unknown as typeof fetch)

    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(EXPO_PUSH_BATCH_SIZE).toBe(100)

    const tamañosDeLote = (fetchImpl.mock.calls as Array<[string, RequestInit]>).map(
      ([, init]) => (JSON.parse(init.body as string) as unknown[]).length,
    )
    expect(tamañosDeLote).toEqual([100, 100, 50])

    // La primera llamada lleva los primeros 100 tokens, en orden.
    const [, primerInit] = fetchImpl.mock.calls[0] as [string, RequestInit]
    const primerCuerpo = JSON.parse(primerInit.body as string) as Array<{ to: string }>
    expect(primerCuerpo[0].to).toBe(tokenFalso(0))
    expect(primerCuerpo[99].to).toBe(tokenFalso(99))

    // La tercera lleva los últimos 50.
    const [, tercerInit] = fetchImpl.mock.calls[2] as [string, RequestInit]
    const tercerCuerpo = JSON.parse(tercerInit.body as string) as Array<{ to: string }>
    expect(tercerCuerpo).toHaveLength(50)
    expect(tercerCuerpo[0].to).toBe(tokenFalso(200))

    expect(resultado.tickets).toHaveLength(250)
    expect(resultado.erroresLote).toEqual([])
  })

  it('pega al endpoint correcto con los headers correctos', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respuestaFalsa({ data: [{ status: 'ok', id: 'x' }] }))
    await enviarLote([{ to: tokenFalso(1), title: 't', body: 'b' }], fetchImpl as unknown as typeof fetch)

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://exp.host/--/api/v2/push/send')
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json')
    expect((init.headers as Record<string, string>)['accept']).toBe('application/json')
    expect(init.method).toBe('POST')
  })
})

describe('enviarLote: emparejamiento ticket↔token', () => {
  it('un DeviceNotRegistered en el medio del lote marca justo ese token, no el de al lado', async () => {
    const mensajes = [1, 2, 3, 4, 5].map((n) => ({ to: tokenFalso(n) }))
    const tickets: ExpoPushTicket[] = [
      { status: 'ok', id: 'ticket-1' },
      { status: 'ok', id: 'ticket-2' },
      { status: 'error', message: 'no registrado', details: { error: 'DeviceNotRegistered' } },
      { status: 'ok', id: 'ticket-4' },
      { status: 'ok', id: 'ticket-5' },
    ]
    const fetchImpl = vi.fn().mockResolvedValue(respuestaFalsa({ data: tickets }))

    const resultado = await enviarLote(mensajes, fetchImpl as unknown as typeof fetch)

    expect(resultado.tickets).toEqual(
      mensajes.map((m, i) => ({ token: m.to, ticket: tickets[i] })),
    )

    const invalidos = tokensInvalidos(resultado.tickets, {})
    expect(invalidos).toEqual([tokenFalso(3)])
  })

  it('si Expo devuelve menos tickets que mensajes, descarta el lote entero en vez de emparejar mal', async () => {
    const mensajes = [1, 2, 3].map((n) => ({ to: tokenFalso(n) }))
    const fetchImpl = vi.fn().mockResolvedValue(
      respuestaFalsa({ data: [{ status: 'ok', id: 'ticket-1' }] }),
    )

    const resultado = await enviarLote(mensajes, fetchImpl as unknown as typeof fetch)

    expect(resultado.tickets).toEqual(mensajes.map((m) => ({ token: m.to, ticket: null })))
    expect(resultado.erroresLote).toHaveLength(1)
  })
})

describe('tokensInvalidos: receipts diferidos', () => {
  it('un receipt con DeviceNotRegistered marca su token, cruzando por ticket.id', () => {
    const tickets = [
      { token: tokenFalso(1), ticket: { status: 'ok', id: 'ticket-1' } as ExpoPushTicket },
      { token: tokenFalso(2), ticket: { status: 'ok', id: 'ticket-2' } as ExpoPushTicket },
    ]
    const receipts = {
      'ticket-1': { status: 'ok' as const },
      'ticket-2': { status: 'error' as const, message: 'no registrado', details: { error: 'DeviceNotRegistered' } },
    }

    expect(tokensInvalidos(tickets, receipts)).toEqual([tokenFalso(2)])
  })

  it('un receipt de error que no es DeviceNotRegistered no marca nada', () => {
    const tickets = [{ token: tokenFalso(1), ticket: { status: 'ok', id: 'ticket-1' } as ExpoPushTicket }]
    const receipts = { 'ticket-1': { status: 'error' as const, message: 'otro error' } }

    expect(tokensInvalidos(tickets, receipts)).toEqual([])
  })

  it('junta los dos caminos: DeviceNotRegistered en el ticket y en el receipt', () => {
    const tickets = [
      {
        token: tokenFalso(1),
        ticket: { status: 'error', message: 'x', details: { error: 'DeviceNotRegistered' } } as ExpoPushTicket,
      },
      { token: tokenFalso(2), ticket: { status: 'ok', id: 'ticket-2' } as ExpoPushTicket },
    ]
    const receipts = {
      'ticket-2': { status: 'error' as const, message: 'x', details: { error: 'DeviceNotRegistered' } },
    }

    expect(tokensInvalidos(tickets, receipts).sort()).toEqual([tokenFalso(1), tokenFalso(2)].sort())
  })
})

describe('enviarLote: fallas que no revientan', () => {
  it('timeout (AbortError): no tira, lo informa en erroresLote', async () => {
    const error = new Error('The operation was aborted')
    error.name = 'AbortError'
    const fetchImpl = vi.fn().mockRejectedValue(error)

    const resultado = await enviarLote([{ to: tokenFalso(1) }], fetchImpl as unknown as typeof fetch)

    expect(resultado.erroresLote).toHaveLength(1)
    expect(resultado.erroresLote[0]).toMatch(/AbortError/)
    expect(resultado.tickets).toEqual([{ token: tokenFalso(1), ticket: null }])
  })

  it('error de red (TypeError): no tira, lo informa en erroresLote', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'))

    const resultado = await enviarLote([{ to: tokenFalso(1) }], fetchImpl as unknown as typeof fetch)

    expect(resultado.erroresLote).toHaveLength(1)
    expect(resultado.erroresLote[0]).toMatch(/TypeError/)
    expect(resultado.tickets).toEqual([{ token: tokenFalso(1), ticket: null }])
  })

  it('HTTP 400 con errors[]: no tira, lo informa y no emparejan tickets', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      respuestaFalsa({ errors: [{ code: 'VALIDATION_ERROR', message: 'algo estaba mal' }] }, { ok: false, status: 400 }),
    )

    const resultado = await enviarLote([{ to: tokenFalso(1) }, { to: tokenFalso(2) }], fetchImpl as unknown as typeof fetch)

    expect(resultado.erroresLote).toHaveLength(1)
    expect(resultado.erroresLote[0]).toMatch(/400/)
    expect(resultado.tickets).toEqual([
      { token: tokenFalso(1), ticket: null },
      { token: tokenFalso(2), ticket: null },
    ])
  })

  it('un lote caído no se lleva puesta la tanda entera: el resto sigue normal', async () => {
    const mensajes = Array.from({ length: 150 }, (_, i) => ({ to: tokenFalso(i) }))
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(
        respuestaFalsa({ data: Array.from({ length: 50 }, (_, i) => ({ status: 'ok', id: `t-${i}` })) }),
      )

    const resultado = await enviarLote(mensajes, fetchImpl as unknown as typeof fetch)

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(resultado.erroresLote).toHaveLength(1)
    expect(resultado.tickets).toHaveLength(150)
    expect(resultado.tickets.slice(0, 100).every((t) => t.ticket === null)).toBe(true)
    expect(resultado.tickets.slice(100).every((t) => t.ticket?.status === 'ok')).toBe(true)
  })
})

describe('leerReceipts', () => {
  it('pega a getReceipts con { ids } y devuelve el objeto indexado', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      respuestaFalsa({ data: { 'ticket-1': { status: 'ok' }, 'ticket-2': { status: 'ok' } } }),
    )

    const resultado = await leerReceipts(['ticket-1', 'ticket-2'], fetchImpl as unknown as typeof fetch)

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://exp.host/--/api/v2/push/getReceipts')
    expect(JSON.parse(init.body as string)).toEqual({ ids: ['ticket-1', 'ticket-2'] })
    expect(resultado.receipts).toEqual({ 'ticket-1': { status: 'ok' }, 'ticket-2': { status: 'ok' } })
    expect(resultado.erroresLote).toEqual([])
  })

  it('sin ids no llama a fetch', async () => {
    const fetchImpl = vi.fn()
    const resultado = await leerReceipts([], fetchImpl as unknown as typeof fetch)

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(resultado).toEqual({ receipts: {}, erroresLote: [] })
  })

  it('timeout: no tira, lo informa', async () => {
    const error = new Error('aborted')
    error.name = 'AbortError'
    const fetchImpl = vi.fn().mockRejectedValue(error)

    const resultado = await leerReceipts(['ticket-1'], fetchImpl as unknown as typeof fetch)

    expect(resultado.receipts).toEqual({})
    expect(resultado.erroresLote).toHaveLength(1)
  })
})

describe('ningún token aparece en lo que se loguea', () => {
  it('ni en escenarios de token inválido, DeviceNotRegistered, timeout, red o HTTP 400', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const tokenSensible = tokenFalso(999)

    // Token inválido descartado.
    await enviarLote([{ to: 'no-es-un-token' }], vi.fn() as unknown as typeof fetch)

    // DeviceNotRegistered en el ticket.
    await enviarLote(
      [{ to: tokenSensible }],
      vi.fn().mockResolvedValue(
        respuestaFalsa({ data: [{ status: 'error', message: 'x', details: { error: 'DeviceNotRegistered' } }] }),
      ) as unknown as typeof fetch,
    )

    // Timeout.
    const abortError = new Error('aborted')
    abortError.name = 'AbortError'
    await enviarLote([{ to: tokenSensible }], vi.fn().mockRejectedValue(abortError) as unknown as typeof fetch)

    // Error de red.
    await enviarLote([{ to: tokenSensible }], vi.fn().mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch)

    // HTTP 400 con errors[].
    await enviarLote(
      [{ to: tokenSensible }],
      vi.fn().mockResolvedValue(respuestaFalsa({ errors: [{ message: 'mal' }] }, { ok: false, status: 400 })) as unknown as typeof fetch,
    )

    const todoLoLogueado = [...errorSpy.mock.calls, ...warnSpy.mock.calls].flat().map((arg) => JSON.stringify(arg))
    expect(todoLoLogueado.some((texto) => texto.includes(tokenSensible))).toBe(false)
    expect(todoLoLogueado.some((texto) => texto.includes('token-999'))).toBe(false)

    // El propio módulo no logueó nada: toda la información va en los
    // valores de retorno, para que quien llame decida qué hacer con ella.
    expect(errorSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
