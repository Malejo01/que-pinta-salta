// R60/52-c: `iniciarAnuncios`/`anunciosListos`/`suscribirse`
// (lib/anuncios/consentimiento.ts), con un doble del SDK de anuncios (sin
// red, sin montar nada de React Native).
//
// El doble se arma con `vi.hoisted` (mismo patrón que
// `tests/datos-cines.test.ts`) y NUNCA se reimporta el paquete real en este
// archivo (ni con `import ... from`, ni con `require(...)`): alcanza con los
// `vi.fn()` hoisteados para armar las aserciones. Esto es a propósito, no
// solo estilo — `tests/anuncios-sin-sdk.test.ts` (52-q, QA; no es un archivo
// permitido de esta tarea) barre TODO apps/mobile buscando exactamente ese
// patrón fuera de lib/anuncios/ y components/BannerAnuncio.tsx, y la carpeta
// tests/ no es una excepción; `vi.mock('react-native-google-mobile-ads', …)`
// no cae en ese patrón (no es un `from`/`require(`), así que mockear el
// paquete por su nombre es seguro — lo que hay que evitar es volver a
// IMPORTARLO desde este archivo.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  gatherConsent: vi.fn(),
  getConsentInfo: vi.fn(),
  showPrivacyOptionsForm: vi.fn(),
  initialize: vi.fn(),
  captureMessage: vi.fn(),
}))

const envEstado = vi.hoisted(() => ({ anunciosHabilitados: true, sentryDsn: null as string | null }))

vi.mock('react-native-google-mobile-ads', () => ({
  __esModule: true,
  default: () => ({ initialize: mocks.initialize }),
  AdsConsent: {
    gatherConsent: mocks.gatherConsent,
    getConsentInfo: mocks.getConsentInfo,
    showPrivacyOptionsForm: mocks.showPrivacyOptionsForm,
  },
  AdsConsentPrivacyOptionsRequirementStatus: {
    UNKNOWN: 'UNKNOWN',
    REQUIRED: 'REQUIRED',
    NOT_REQUIRED: 'NOT_REQUIRED',
  },
}))

vi.mock('@sentry/react-native', () => ({
  captureMessage: mocks.captureMessage,
}))

vi.mock('@/lib/env', () => ({
  leerEnv: () => ({ ...envEstado }),
}))

import {
  anunciosListos,
  iniciarAnuncios,
  mostrarOpcionesDePrivacidad,
  necesitaOpcionesDePrivacidad,
  reiniciarAnunciosParaTests,
  suscribirse,
} from '../lib/anuncios/consentimiento'

const INFO_OK = {
  status: 'OBTAINED',
  canRequestAds: true,
  privacyOptionsRequirementStatus: 'NOT_REQUIRED',
  isConsentFormAvailable: false,
}

const INFO_SIN_PERMISO = {
  status: 'REQUIRED',
  canRequestAds: false,
  privacyOptionsRequirementStatus: 'REQUIRED',
  isConsentFormAvailable: true,
}

/** Deja correr cualquier promesa ya resuelta/encadenada (varios `await` en
 * cadena dentro de `ejecutarFlujoDeConsentimiento`, que nunca se expone
 * directo): un macrotask alcanza para que todos los microtasks pendientes
 * ya se hayan procesado. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  reiniciarAnunciosParaTests()
  envEstado.anunciosHabilitados = true
  envEstado.sentryDsn = null
  mocks.gatherConsent.mockReset().mockResolvedValue(INFO_OK)
  mocks.getConsentInfo.mockReset().mockResolvedValue(INFO_OK)
  mocks.showPrivacyOptionsForm.mockReset().mockResolvedValue(INFO_OK)
  mocks.initialize.mockReset().mockResolvedValue([])
  mocks.captureMessage.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('iniciarAnuncios', () => {
  it('llama a gatherConsent antes que a initialize', async () => {
    iniciarAnuncios()
    await flush()

    expect(mocks.gatherConsent).toHaveBeenCalledTimes(1)
    expect(mocks.initialize).toHaveBeenCalledTimes(1)
    const ordenGather = mocks.gatherConsent.mock.invocationCallOrder[0]
    const ordenInitialize = mocks.initialize.mock.invocationCallOrder[0]
    expect(ordenGather).toBeLessThan(ordenInitialize)
  })

  it('si canRequestAds es false (getConsentInfo), no inicializa', async () => {
    mocks.getConsentInfo.mockResolvedValue(INFO_SIN_PERMISO)

    iniciarAnuncios()
    await flush()

    expect(mocks.getConsentInfo).toHaveBeenCalledTimes(1)
    expect(mocks.initialize).not.toHaveBeenCalled()
    expect(anunciosListos()).toBe(false)
  })

  it('si gatherConsent tira, sigue y consulta getConsentInfo (y, con canRequestAds, inicializa)', async () => {
    mocks.gatherConsent.mockRejectedValue(new Error('fallo de red inventado del doble'))

    iniciarAnuncios()
    await flush()

    expect(mocks.getConsentInfo).toHaveBeenCalledTimes(1)
    expect(mocks.initialize).toHaveBeenCalledTimes(1)
    expect(anunciosListos()).toBe(true)
  })

  it('dos llamadas inicializan una sola vez', async () => {
    iniciarAnuncios()
    iniciarAnuncios()
    await flush()

    expect(mocks.gatherConsent).toHaveBeenCalledTimes(1)
    expect(mocks.initialize).toHaveBeenCalledTimes(1)
  })

  it('con anunciosHabilitados en false, ni gatherConsent ni initialize', async () => {
    envEstado.anunciosHabilitados = false

    iniciarAnuncios()
    await flush()

    expect(mocks.gatherConsent).not.toHaveBeenCalled()
    expect(mocks.getConsentInfo).not.toHaveBeenCalled()
    expect(mocks.initialize).not.toHaveBeenCalled()
    expect(anunciosListos()).toBe(false)
  })

  // Vuelta 1 de revisión (bloqueante, revisor y seguridad): `initialize` era
  // el único de los tres pasos sin `try/catch`, y la función se dispara con
  // `void` — un rechazo sin manejar. Con DSN configurado, además, tiene que
  // registrarse (sin el mensaje crudo del SDK: `mocks.captureMessage` se
  // llama con el string fijo, nunca con el objeto Error).
  it('si initialize rechaza, no queda ningún rechazo sin manejar, anunciosListos() sigue en false, y se registra el error', async () => {
    envEstado.sentryDsn = 'https://clave-de-prueba@sentry.example.org/1'
    mocks.initialize.mockRejectedValue(new Error('fallo de init inventado del doble'))

    // Si `ejecutarFlujoDeConsentimiento` dejara el rechazo de `initialize`
    // sin capturar, este `unhandledrejection` listener lo vería.
    const rechazosSinManejar: unknown[] = []
    const onUnhandled = (razon: unknown) => rechazosSinManejar.push(razon)
    process.on('unhandledRejection', onUnhandled)

    try {
      iniciarAnuncios()
      await flush()

      expect(mocks.initialize).toHaveBeenCalledTimes(1)
      expect(anunciosListos()).toBe(false)
      expect(mocks.captureMessage).toHaveBeenCalledTimes(1)
      expect(mocks.captureMessage).toHaveBeenCalledWith('admob_consent_error')
      expect(rechazosSinManejar).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })
})

describe('anunciosListos / suscribirse', () => {
  it('anunciosListos() pasa a true recién después del initialize, y suscribirse avisa', async () => {
    expect(anunciosListos()).toBe(false)

    const avisos: boolean[] = []
    const desuscribirse = suscribirse(() => avisos.push(anunciosListos()))

    iniciarAnuncios()
    // Todavía no: el flujo es async, "fire and forget".
    expect(anunciosListos()).toBe(false)
    expect(avisos).toEqual([])

    await flush()

    expect(anunciosListos()).toBe(true)
    // Vuelta 1 de revisión: ahora hay DOS avisos en el camino feliz — uno
    // justo después de conocer el `AdsConsentInfo` (antes de intentar
    // `initialize`, con `anunciosListos()` todavía en `false`) y otro
    // después de que `initialize` resuelve. El último SIGUE siendo `true`.
    expect(avisos).toEqual([false, true])

    desuscribirse()
  })

  it('el desuscriptor de suscribirse corta el aviso', async () => {
    const cb = vi.fn()
    const desuscribirse = suscribirse(cb)
    desuscribirse()

    iniciarAnuncios()
    await flush()

    expect(cb).not.toHaveBeenCalled()
  })

  // Vuelta 1 de revisión (bloqueante, revisor): el test que hoy cubre
  // `canRequestAds: false` (más abajo) no suscribe nada — por eso no
  // atrapaba que, antes del arreglo, `avisarSuscriptores()` nunca se
  // llamaba para quien RECHAZA el consentimiento. Es justo la persona que
  // más necesita enterarse: tiene `privacyOptionsRequirementStatus:
  // REQUIRED` y necesita ver el formulario para cambiar de opinión
  // (exigencia de UMP).
  it('con canRequestAds false y privacyOptionsRequirementStatus REQUIRED, el suscriptor se entera y necesitaOpcionesDePrivacidad() ya da true dentro del callback', async () => {
    mocks.getConsentInfo.mockResolvedValue(INFO_SIN_PERMISO)

    const vistoDentroDelCallback: boolean[] = []
    const cb = vi.fn(() => {
      vistoDentroDelCallback.push(necesitaOpcionesDePrivacidad())
    })
    const desuscribirse = suscribirse(cb)

    iniciarAnuncios()
    await flush()

    expect(cb).toHaveBeenCalledTimes(1)
    expect(vistoDentroDelCallback).toEqual([true])
    expect(mocks.initialize).not.toHaveBeenCalled()
    expect(anunciosListos()).toBe(false)

    desuscribirse()
  })
})

describe('necesitaOpcionesDePrivacidad / mostrarOpcionesDePrivacidad', () => {
  it('antes de que termine iniciarAnuncios: false (sin info todavía)', () => {
    expect(necesitaOpcionesDePrivacidad()).toBe(false)
  })

  it('después de iniciarAnuncios, con privacyOptionsRequirementStatus REQUIRED: true', async () => {
    mocks.getConsentInfo.mockResolvedValue({ ...INFO_OK, privacyOptionsRequirementStatus: 'REQUIRED' })

    iniciarAnuncios()
    await flush()

    expect(necesitaOpcionesDePrivacidad()).toBe(true)
  })

  it('mostrarOpcionesDePrivacidad actualiza la info (y necesitaOpcionesDePrivacidad refleja el nuevo valor)', async () => {
    mocks.getConsentInfo.mockResolvedValue({ ...INFO_OK, privacyOptionsRequirementStatus: 'REQUIRED' })
    iniciarAnuncios()
    await flush()
    expect(necesitaOpcionesDePrivacidad()).toBe(true)

    mocks.showPrivacyOptionsForm.mockResolvedValue({ ...INFO_OK, privacyOptionsRequirementStatus: 'NOT_REQUIRED' })
    await mostrarOpcionesDePrivacidad()

    expect(necesitaOpcionesDePrivacidad()).toBe(false)
  })

  it('mostrarOpcionesDePrivacidad: si falla, no rompe (no actualiza la info)', async () => {
    mocks.getConsentInfo.mockResolvedValue({ ...INFO_OK, privacyOptionsRequirementStatus: 'REQUIRED' })
    iniciarAnuncios()
    await flush()

    mocks.showPrivacyOptionsForm.mockRejectedValue(new Error('fallo inventado del doble'))
    await expect(mostrarOpcionesDePrivacidad()).resolves.toBeUndefined()

    expect(necesitaOpcionesDePrivacidad()).toBe(true)
  })
})
