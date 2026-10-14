// 25-c, punto 4: `urlDeImagenSegura` (lib/imagenes/url-segura.ts) es el único
// punto por el que puede pasar una URL de imagen antes de llegar a un
// `<Image>` de la app. Host exacto de nuestro Storage sí; cualquier otro
// caso (otro host, un host que "contiene" el nuestro, http, otro bucket,
// sin URL) da `null`. Cuando da algo, es siempre la variante WebP 400. Sin
// red: `esDeNuestroStorage` (@qps/core/images/storage-url) parsea con `URL`,
// no hace ningún fetch.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { urlDeImagenSegura } from '../lib/imagenes/url-segura'
import { INSTAGRAM_ENGINE_CONFIG } from '@qps/core/instagram-config'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const SUPABASE_URL = 'https://proyecto-de-prueba.supabase.co'
const BUCKET = INSTAGRAM_ENGINE_CONFIG.STORAGE_BUCKET
const PATH_OK = `/storage/v1/object/public/${BUCKET}/cuenta-de-prueba/post.jpg`
const URL_OK = `${SUPABASE_URL}${PATH_OK}`
const URL_OK_400 = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/cuenta-de-prueba/post.w400.webp`

describe('urlDeImagenSegura', () => {
  it('host exacto de nuestro Storage: la variante WebP 400', () => {
    expect(urlDeImagenSegura(URL_OK, SUPABASE_URL)).toBe(URL_OK_400)
  })

  it('otro host: null', () => {
    expect(urlDeImagenSegura(`https://otro-sitio-de-prueba.com.ar${PATH_OK}`, SUPABASE_URL)).toBeNull()
  })

  it('host que "contiene" el nuestro pero no es igual (falso subdominio): null', () => {
    expect(urlDeImagenSegura(`https://proyecto-de-prueba.supabase.co.evil-de-prueba.com${PATH_OK}`, SUPABASE_URL)).toBeNull()
    expect(urlDeImagenSegura(`https://evil-de-prueba.com/x${PATH_OK}`, SUPABASE_URL)).toBeNull()
  })

  it('http (sin "s"): null', () => {
    expect(urlDeImagenSegura(`http://proyecto-de-prueba.supabase.co${PATH_OK}`, SUPABASE_URL)).toBeNull()
  })

  it('otro bucket del mismo host: null', () => {
    expect(
      urlDeImagenSegura(`${SUPABASE_URL}/storage/v1/object/public/otro-bucket-de-prueba/post.jpg`, SUPABASE_URL)
    ).toBeNull()
  })

  it('url null, undefined o vacía: null', () => {
    expect(urlDeImagenSegura(null, SUPABASE_URL)).toBeNull()
    expect(urlDeImagenSegura(undefined, SUPABASE_URL)).toBeNull()
    expect(urlDeImagenSegura('', SUPABASE_URL)).toBeNull()
  })

  it('sin supabaseUrl configurado: null, aunque la url sea la de nuestro storage', () => {
    expect(urlDeImagenSegura(URL_OK, null)).toBeNull()
    expect(urlDeImagenSegura(URL_OK, undefined)).toBeNull()
    expect(urlDeImagenSegura(URL_OK, '')).toBeNull()
  })

  it('una url que no es ni siquiera una URL válida (texto cualquiera): null, sin explotar', () => {
    expect(urlDeImagenSegura('no-es-una-url', SUPABASE_URL)).toBeNull()
    expect(urlDeImagenSegura('javascript:alert(1)', SUPABASE_URL)).toBeNull()
  })

  it('cuando devuelve algo, siempre es la variante .w400.webp (nunca la original ni la .w800)', () => {
    const resultado = urlDeImagenSegura(URL_OK, SUPABASE_URL)
    expect(resultado).not.toBeNull()
    expect(resultado).toMatch(/\.w400\.webp(\?.*)?$/)
    expect(resultado).not.toMatch(/\.w800\.webp/)
    expect(resultado).not.toBe(URL_OK)
  })

  it('conserva la query string al armar la variante', () => {
    const conQuery = `${URL_OK}?v=2`
    expect(urlDeImagenSegura(conQuery, SUPABASE_URL)).toBe(`${URL_OK_400}?v=2`)
  })
})

// ---------------------------------------------------------------------------
// Barrido: ninguna otra forma de armar una URI de imagen en la app.
// ---------------------------------------------------------------------------
const ARCHIVO_APROBADO = join('components', 'Afiche.tsx')
const MODULO_APROBADO = join('lib', 'imagenes', 'url-segura.ts')

function listarTsxYTs(root: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(root)) {
    const full = join(root, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      out.push(...listarTsxYTs(full))
    } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

describe('app/, components/ y lib/: ninguna otra URI de imagen remota sin pasar por urlDeImagenSegura', () => {
  const dirs = ['app', 'components', 'lib'].map((d) => join(MOBILE_ROOT, d))
  const archivos = dirs.flatMap((d) => listarTsxYTs(d))

  it('encuentra archivos para analizar, incluido el componente Afiche', () => {
    expect(archivos.length).toBeGreaterThan(0)
    expect(archivos.some((f) => relative(MOBILE_ROOT, f) === ARCHIVO_APROBADO)).toBe(true)
  })

  it.each(archivos.map((file) => [relative(MOBILE_ROOT, file), file] as const))(
    '%s no construye un source={{ uri: ... }} fuera de components/Afiche.tsx',
    (label, file) => {
      if (label === ARCHIVO_APROBADO || label === MODULO_APROBADO) return
      const src = readFileSync(file, 'utf8')
      // "uri:" es la única forma en que <Image> de React Native acepta una
      // URL remota (`source={{ uri }}`): si aparece en cualquier otro
      // archivo, hay una imagen armada sin pasar por urlDeImagenSegura/Afiche.
      expect(src).not.toMatch(/\buri\s*:/)
    }
  )
})
