/**
 * `share-button.tsx` (30-a, y 35-c QPS-159): compartir la ficha desde la web.
 *  - `buildShareData`: título + URL, siempre la de `urlEvento` (`@qps/core`,
 *    vía `@/lib/metricas/links`), nunca armada a mano. Se mockea
 *    `urlEvento` con un valor "centinela" (no un string que alguien podría
 *    reproducir a mano con `SITIO + '/evento/' + id`): si `buildShareData`
 *    dejara de llamar a `urlEvento` y armara la URL por su cuenta, el test
 *    falla porque no devolvería el centinela.
 *  - `shareEvent`: con `navigator.share` disponible, lo llama con
 *    `{ title, url }`; sin él, copia el link con `clipboard.writeText` y
 *    avisa con el toast "Link copiado"; si el usuario cancela el diálogo
 *    nativo (`AbortError`), no hay toast de error.
 *  - 35-c: `shareEvent` acepta un `onShared` opcional en `ShareDeps` (lo que
 *    en el componente `ShareButton` representa a `navigator.share`/
 *    `navigator.clipboard.writeText`, igual que `share`/`writeText` más
 *    arriba) y lo llama solo si se compartió de verdad o se copió el link;
 *    nunca con un `AbortError` ni si falló el copiado. `event-card.tsx` ya
 *    no arma a mano un link de WhatsApp: usa `<ShareButton>`.
 *
 * Sin red ni base: todo mockeado, sin DOM (entorno `node` de vitest.config).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const urlEventoMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/metricas/links', () => ({
  urlEvento: (...args: unknown[]) => urlEventoMock(...args),
}))

import { buildShareData, shareEvent } from '@/components/share-button'

type ShareData = { title: string; url: string }

const ID = '11111111-1111-4111-8111-111111111111'
const TITLE = 'Peña en el Boliche'
const CENTINELA = 'https://centinela.invalido/no-deberia-armarse-a-mano'

describe('buildShareData', () => {
  beforeEach(() => {
    urlEventoMock.mockReset()
  })

  it('llama a urlEvento(eventId) y usa exactamente lo que devuelve', () => {
    urlEventoMock.mockReturnValue(CENTINELA)

    expect(buildShareData(ID, TITLE)).toEqual({ title: TITLE, url: CENTINELA })
    expect(urlEventoMock).toHaveBeenCalledWith(ID)
  })

  it('si urlEvento devuelve null (id no es uuid), buildShareData también: no hay respaldo armado a mano', () => {
    urlEventoMock.mockReturnValue(null)

    expect(buildShareData('no-es-un-uuid', TITLE)).toBeNull()
  })
})

describe('shareEvent', () => {
  const data: ShareData = { title: TITLE, url: CENTINELA }

  it('con navigator.share: se llama con { title, url }', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const writeText = vi.fn().mockResolvedValue(undefined)
    const toast = vi.fn()

    await shareEvent(data, { share, writeText, toast })

    expect(share).toHaveBeenCalledWith({ title: TITLE, url: CENTINELA })
    expect(writeText).not.toHaveBeenCalled()
    expect(toast).not.toHaveBeenCalled()
  })

  it('sin navigator.share: copia el link con clipboard.writeText y avisa', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const toast = vi.fn()

    await shareEvent(data, { writeText, toast })

    expect(writeText).toHaveBeenCalledWith(CENTINELA)
    expect(toast).toHaveBeenCalledWith({ title: 'Link copiado' })
  })

  it('con AbortError (cancela el diálogo nativo): no aparece ningún toast', async () => {
    const abortError = new Error('The user aborted a request.')
    abortError.name = 'AbortError'
    const share = vi.fn().mockRejectedValue(abortError)
    const writeText = vi.fn().mockResolvedValue(undefined)
    const toast = vi.fn()

    await shareEvent(data, { share, writeText, toast })

    expect(share).toHaveBeenCalledWith({ title: TITLE, url: CENTINELA })
    expect(writeText).not.toHaveBeenCalled()
    expect(toast).not.toHaveBeenCalled()
  })

  it('con otro error de compartir (no AbortError): tampoco muestra un toast de error', async () => {
    const share = vi.fn().mockRejectedValue(new Error('algo falló'))
    const toast = vi.fn()

    await shareEvent(data, { share, toast })

    expect(toast).not.toHaveBeenCalled()
  })

  it('sin navigator.share ni clipboard: no hace nada (no revienta)', async () => {
    const toast = vi.fn()

    await expect(shareEvent(data, { toast })).resolves.toBeUndefined()
    expect(toast).not.toHaveBeenCalled()
  })

  it('si el portapapeles se niega: no revienta y avisa que no se pudo copiar (no dice "Link copiado")', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'))
    const toast = vi.fn()

    await expect(shareEvent(data, { writeText, toast })).resolves.toBeUndefined()
    expect(toast).toHaveBeenCalledTimes(1)
    expect(toast).toHaveBeenCalledWith({ title: 'No se pudo copiar el link', variant: 'destructive' })
  })

  // Q3: en /en, ShareButton le pasa los textos del diccionario en inglés.
  it('con los textos en inglés: "Link copied" y "Could not copy the link"', async () => {
    const { en } = await import('@/lib/i18n/diccionarios/en')
    const toast = vi.fn()
    await shareEvent(data, { writeText: vi.fn().mockResolvedValue(undefined), toast, textos: en.compartir })
    expect(toast).toHaveBeenCalledWith({ title: 'Link copied' })

    toast.mockClear()
    await shareEvent(data, { writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')), toast, textos: en.compartir })
    expect(toast).toHaveBeenCalledWith({ title: 'Could not copy the link', variant: 'destructive' })
  })

  it('ShareButton le pasa a shareEvent los textos del idioma de la página', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'components', 'share-button.tsx'), 'utf8')
    expect(src).toMatch(/const textos = useTextos\(\)\.compartir/)
    expect(src).toMatch(/shareEvent\(data, \{[\s\S]*?\btextos,[\s\S]*?\}\)/)
    expect(src).toMatch(/aria-label=\{textos\.compartirEvento\}/)
  })
})

// ---------------------------------------------------------------------------
// 35-c (QPS-159): onShared — se llama solo si se compartió de verdad o se
// copió el link, nunca si se canceló el diálogo nativo ni si falló el
// copiado. `share`/`writeText` acá representan a `navigator.share` y
// `navigator.clipboard.writeText`, mockeados como deps (mismo patrón que el
// resto del archivo: entorno `node`, sin DOM real).
// ---------------------------------------------------------------------------
describe('shareEvent: onShared (QPS-159)', () => {
  const data: ShareData = { title: TITLE, url: CENTINELA }

  it('con navigator.share exitoso: se llama a onShared', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const onShared = vi.fn()
    const toast = vi.fn()

    await shareEvent(data, { share, toast, onShared })

    expect(onShared).toHaveBeenCalledTimes(1)
  })

  it('con AbortError (el usuario cancela el diálogo nativo): NO se llama a onShared', async () => {
    const abortError = new Error('The user aborted a request.')
    abortError.name = 'AbortError'
    const share = vi.fn().mockRejectedValue(abortError)
    const onShared = vi.fn()
    const toast = vi.fn()

    await shareEvent(data, { share, toast, onShared })

    expect(onShared).not.toHaveBeenCalled()
  })

  it('con otro error de compartir (no AbortError): tampoco se llama a onShared (no hay certeza de que se compartió)', async () => {
    const share = vi.fn().mockRejectedValue(new Error('algo falló'))
    const onShared = vi.fn()
    const toast = vi.fn()

    await shareEvent(data, { share, toast, onShared })

    expect(onShared).not.toHaveBeenCalled()
  })

  it('sin navigator.share, copiando el link con éxito: se llama a onShared', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const onShared = vi.fn()
    const toast = vi.fn()

    await shareEvent(data, { writeText, toast, onShared })

    expect(onShared).toHaveBeenCalledTimes(1)
  })

  it('si falla el copiado: NO se llama a onShared', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'))
    const onShared = vi.fn()
    const toast = vi.fn()

    await shareEvent(data, { writeText, toast, onShared })

    expect(onShared).not.toHaveBeenCalled()
  })

  it('sin navigator.share ni clipboard disponibles: NO se llama a onShared', async () => {
    const onShared = vi.fn()
    const toast = vi.fn()

    await shareEvent(data, { toast, onShared })

    expect(onShared).not.toHaveBeenCalled()
  })

  it('sin onShared (prop opcional, como en event-detail-page.tsx/event-modal-wrapper.tsx): no revienta', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const toast = vi.fn()

    await expect(shareEvent(data, { share, toast })).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 35-c (QPS-159): un solo "compartir" — event-card.tsx usa <ShareButton> y
// ya no arma a mano un link a api.whatsapp.com. Detector sobre el fuente con
// `fs`; si la ruta no existiera, `readFileSync` tira y el test falla
// ruidosamente (nunca un "no hay nada que revisar").
// ---------------------------------------------------------------------------
describe('event-card.tsx: un solo mecanismo de compartir (QPS-159)', () => {
  // apps/web/tests/components -> apps/web/tests -> apps/web
  const EVENT_CARD_PATH = join(__dirname, '..', '..', 'components', 'event-card.tsx')
  const source = readFileSync(EVENT_CARD_PATH, 'utf8')

  it('no arma a mano un link a api.whatsapp.com', () => {
    expect(source).not.toMatch(/api\.whatsapp\.com/)
  })

  it('importa ShareButton desde @/components/share-button', () => {
    expect(source).toMatch(/import\s*\{[^}]*ShareButton[^}]*\}\s*from\s*['"]@\/components\/share-button['"]/)
  })

  it('usa <ShareButton', () => {
    expect(source).toMatch(/<ShareButton\b/)
  })
})
