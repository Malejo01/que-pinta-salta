/**
 * `images/storage-url.ts`: ¿esta URL es de nuestro Storage? Host exacto
 * (nada de `includes()`), protocolo `https:` y la ruta del bucket de flyers.
 * Fixtures inventadas, sin red ni base.
 */
import { describe, expect, it } from 'vitest'
import { esDeNuestroStorage } from '@qps/core/images/storage-url'
import { INSTAGRAM_ENGINE_CONFIG } from '@qps/core/instagram-config'

const SUPABASE_URL = 'https://proyecto-de-prueba.supabase.co'
const BUCKET = INSTAGRAM_ENGINE_CONFIG.STORAGE_BUCKET

const bucketPath = (path: string) => `/storage/v1/object/public/${BUCKET}/${path}`
const ourUrl = (path = 'cines/afiche-de-prueba.jpg') => `${SUPABASE_URL}${bucketPath(path)}`

describe('esDeNuestroStorage', () => {
  it('sí: el host exacto con la ruta del bucket', () => {
    expect(esDeNuestroStorage(ourUrl(), SUPABASE_URL)).toBe(true)
  })

  it('no: otro host', () => {
    const url = `https://otro-proyecto.supabase.co${bucketPath('cines/afiche-de-prueba.jpg')}`
    expect(esDeNuestroStorage(url, SUPABASE_URL)).toBe(false)
  })

  it('no: un host que contiene el nuestro como subdominio (<nuestro>.evil.com)', () => {
    const url = `https://proyecto-de-prueba.supabase.co.evil.com${bucketPath('cines/afiche-de-prueba.jpg')}`
    expect(esDeNuestroStorage(url, SUPABASE_URL)).toBe(false)
  })

  it('no: un host que contiene el nuestro en la ruta, no en el host (evil.com/<nuestro>)', () => {
    const url = `https://evil.com/proyecto-de-prueba.supabase.co${bucketPath('cines/afiche-de-prueba.jpg')}`
    expect(esDeNuestroStorage(url, SUPABASE_URL)).toBe(false)
  })

  it('no: http en vez de https, mismo host y ruta', () => {
    const url = `http://proyecto-de-prueba.supabase.co${bucketPath('cines/afiche-de-prueba.jpg')}`
    expect(esDeNuestroStorage(url, SUPABASE_URL)).toBe(false)
  })

  it('no: otro bucket', () => {
    const url = `${SUPABASE_URL}/storage/v1/object/public/otro-bucket/cines/afiche-de-prueba.jpg`
    expect(esDeNuestroStorage(url, SUPABASE_URL)).toBe(false)
  })

  it('no: la ruta del bucket va en la query, no en el path', () => {
    const url = `${SUPABASE_URL}/algo-cualquiera?u=${encodeURIComponent(bucketPath('cines/afiche-de-prueba.jpg'))}`
    expect(esDeNuestroStorage(url, SUPABASE_URL)).toBe(false)
  })

  it('no: null', () => {
    expect(esDeNuestroStorage(null, SUPABASE_URL)).toBe(false)
  })

  it('no: vacío', () => {
    expect(esDeNuestroStorage('', SUPABASE_URL)).toBe(false)
  })

  it('no: undefined', () => {
    expect(esDeNuestroStorage(undefined, SUPABASE_URL)).toBe(false)
  })
})
