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

// Tarea 57-q (QA, QPS-129): tres casos que hoy ya cubre la semántica de `URL` (WHATWG), pero que
// no estaban escritos como aserción. Se corrió el test y se dejó el resultado que da hoy la
// función, no el que "debería" dar a ojo.
describe('esDeNuestroStorage: semántica de URL sobre host (credenciales, puerto, mayúsculas)', () => {
  it('sí: credenciales en la URL (usuario:clave@host) — "host" en WHATWG nunca incluye el userinfo', () => {
    // El userinfo ("usuario:clave@") vive en `url.username`/`url.password`, aparte de `url.host`:
    // la URL spec lo separa del host en el paso de parseo, así que `esDeNuestroStorage` compara
    // exactamente el mismo host que sin credenciales. POSIBLE HALLAZGO DE SEGURIDAD (a reportar,
    // no a corregir acá: storage-url.ts no está entre los archivos permitidos de esta tarea): si
    // en algún punto esta URL con credenciales se usa tal cual como `src` o se le hace `fetch()`,
    // esas credenciales viajan igual aunque el chequeo de "¿es nuestro storage?" haya dado `true`
    // — el chequeo de host no protege contra eso, porque no es su trabajo.
    const url = `https://credencial-de-prueba:clave-de-prueba@proyecto-de-prueba.supabase.co${bucketPath('cines/afiche-de-prueba.jpg')}`
    expect(esDeNuestroStorage(url, SUPABASE_URL)).toBe(true)
  })

  it('sí: el mismo host con :443 explícito — WHATWG saca el puerto por defecto del protocolo de `host`', () => {
    // Para `https:`, 443 es el puerto por defecto: la URL spec no lo incluye en el serializado de
    // `host` (si no fuera el puerto por defecto, sí quedaría como "host:puerto" y la comparación
    // con `parsedSupabaseUrl.host`, sin puerto, fallaría).
    const url = `https://proyecto-de-prueba.supabase.co:443${bucketPath('cines/afiche-de-prueba.jpg')}`
    expect(esDeNuestroStorage(url, SUPABASE_URL)).toBe(true)
  })

  it('sí: el host en MAYÚSCULAS — WHATWG normaliza el host a minúsculas al parsear', () => {
    // El algoritmo de "host parsing" de la URL spec pasa el dominio por ASCII lowercase antes de
    // guardarlo: `new URL(...).host` ya sale en minúsculas sin que el código de
    // `esDeNuestroStorage` tenga que normalizar nada él mismo.
    const url = `https://PROYECTO-DE-PRUEBA.SUPABASE.CO${bucketPath('cines/afiche-de-prueba.jpg')}`
    expect(esDeNuestroStorage(url, SUPABASE_URL)).toBe(true)
  })

  it('no, en cambio: la ruta (pathname) SÍ es sensible a mayúsculas — host y path no se tratan igual', () => {
    // Contraste con los tres casos de arriba: a diferencia del host, WHATWG no toca la
    // capitalización del pathname. `PUBLIC_BUCKET_PREFIX` está en minúsculas, así que una ruta
    // con el bucket en mayúsculas no hace match de prefijo y la función da `false`.
    const url = `${SUPABASE_URL}${bucketPath('cines/afiche-de-prueba.jpg').toUpperCase()}`
    expect(esDeNuestroStorage(url, SUPABASE_URL)).toBe(false)
  })
})
