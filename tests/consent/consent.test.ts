import { describe, expect, it } from 'vitest'
import { CONSENT_STORAGE_KEY, readConsent, writeConsent, type ConsentStorage } from '@/lib/consent'

/** Storage falso en memoria, sin navegador. */
function createFakeStorage(initial: Record<string, string> = {}): ConsentStorage {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key) => (data.has(key) ? data.get(key)! : null),
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
  }
}

/** Storage que siempre tira, como localStorage en modo incógnito o con cookies bloqueadas. */
function createThrowingStorage(): ConsentStorage {
  return {
    getItem: () => {
      throw new Error('storage bloqueado')
    },
    setItem: () => {
      throw new Error('storage bloqueado')
    },
    removeItem: () => {
      throw new Error('storage bloqueado')
    },
  }
}

describe('readConsent / writeConsent', () => {
  it('sin nada guardado, devuelve null', () => {
    const storage = createFakeStorage()
    expect(readConsent(storage)).toBeNull()
  })

  it('escribe y lee "granted"', () => {
    const storage = createFakeStorage()
    writeConsent(storage, 'granted')
    expect(readConsent(storage)).toBe('granted')
  })

  it('escribe y lee "denied"', () => {
    const storage = createFakeStorage()
    writeConsent(storage, 'denied')
    expect(readConsent(storage)).toBe('denied')
  })

  it('usa la clave versionada', () => {
    const storage = createFakeStorage()
    writeConsent(storage, 'granted')
    expect(storage.getItem(CONSENT_STORAGE_KEY)).toBe('granted')
  })

  it('escribir null borra la clave (vuelve a "sin elegir")', () => {
    const storage = createFakeStorage({ [CONSENT_STORAGE_KEY]: 'granted' })
    writeConsent(storage, null)
    expect(storage.getItem(CONSENT_STORAGE_KEY)).toBeNull()
    expect(readConsent(storage)).toBeNull()
  })

  it('un valor guardado desconocido (basura) se lee como null', () => {
    const storage = createFakeStorage({ [CONSENT_STORAGE_KEY]: 'basura-cualquiera' })
    expect(readConsent(storage)).toBeNull()
  })

  it('un valor guardado de una versión vieja de la clave se lee como null', () => {
    const storage = createFakeStorage({ 'qps-consent-v0': 'granted' })
    expect(readConsent(storage)).toBeNull()
  })

  it('storage que tira al leer: readConsent devuelve null, sin lanzar', () => {
    const storage = createThrowingStorage()
    expect(() => readConsent(storage)).not.toThrow()
    expect(readConsent(storage)).toBeNull()
  })

  it('storage que tira al escribir: writeConsent no explota', () => {
    const storage = createThrowingStorage()
    expect(() => writeConsent(storage, 'granted')).not.toThrow()
  })
})
