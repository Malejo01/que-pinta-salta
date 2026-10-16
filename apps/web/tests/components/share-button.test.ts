/**
 * `share-button.tsx` (30-a): compartir la ficha desde la web.
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
 *
 * Sin red ni base: todo mockeado, sin DOM (entorno `node` de vitest.config).
 */
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
})
