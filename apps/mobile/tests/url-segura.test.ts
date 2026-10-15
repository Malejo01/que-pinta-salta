// 28-e, F2: `fuentesDeImagen` (lib/imagenes/url-segura.ts) es el único punto
// por el que puede pasar una URL de imagen antes de llegar a un `<Image>` de
// la app. Reemplaza a `urlDeImagenSegura` (25-c): ahora, en vez de un único
// resultado o `null`, da la lista ordenada de URLs a intentar (variante →
// original → nada), con la misma regla que usa la web — incluidos los
// buckets `flyers`/`flyers_ig` de nuestro Storage y los hosts de ticketeras
// y cines que ya acepta la CSP de la web (`img-src` de
// `apps/web/next.config.mjs`). Esto revierte la decisión de la R25 ("sin
// pedirle nada al host del tercero"): el bucket `flyers` (las peñas) ahora
// da `[original]` en vez de `null`, y los hosts de ticketeras/cines también
// dan `[original]` en vez de `[]`. Sin red: todo parsea con `URL`, nunca
// hace fetch.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { fuentesDeImagen, siguienteFuente } from '../lib/imagenes/url-segura'
import { INSTAGRAM_ENGINE_CONFIG } from '@qps/core/instagram-config'
import { HOSTS_IMAGENES_TERCEROS } from '@qps/core/images/hosts-imagenes'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const SUPABASE_URL = 'https://proyecto-de-prueba.supabase.co'
const BUCKET_IG = INSTAGRAM_ENGINE_CONFIG.STORAGE_BUCKET // 'flyers_ig'
const PATH_JPG = `/storage/v1/object/public/${BUCKET_IG}/cuenta-de-prueba/post.jpg`
const URL_JPG = `${SUPABASE_URL}${PATH_JPG}`
const URL_JPG_400 = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_IG}/cuenta-de-prueba/post.w400.webp`

describe('fuentesDeImagen', () => {
  describe('bucket flyers_ig (nuestro Storage, Instagram)', () => {
    it('.jpg: [variante 400, original]', () => {
      expect(fuentesDeImagen(URL_JPG, SUPABASE_URL)).toEqual([URL_JPG_400, URL_JPG])
    })

    it('.jpg con query string: conserva la query en ambas', () => {
      const conQuery = `${URL_JPG}?v=2`
      expect(fuentesDeImagen(conQuery, SUPABASE_URL)).toEqual([`${URL_JPG_400}?v=2`, conQuery])
    })

    it('otra extensión (.webp, de una fuente externa archivada): [original], sin variante', () => {
      const urlWebp = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_IG}/externas/post.webp`
      expect(fuentesDeImagen(urlWebp, SUPABASE_URL)).toEqual([urlWebp])
    })

    it('.png: [original]', () => {
      const urlPng = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_IG}/cuenta-de-prueba/post.png`
      expect(fuentesDeImagen(urlPng, SUPABASE_URL)).toEqual([urlPng])
    })
  })

  describe('bucket flyers (nuestro Storage, peñas y admin) — el cambio de la R28: antes null, ahora [original]', () => {
    it('flyers/penas/x.webp: [original]', () => {
      const urlPena = `${SUPABASE_URL}/storage/v1/object/public/flyers/penas/balderrama.webp`
      expect(fuentesDeImagen(urlPena, SUPABASE_URL)).toEqual([urlPena])
    })

    it('flyers/<cualquier cosa>.jpg: [original] (no se le aplica la regla de variante de flyers_ig)', () => {
      const urlFlyer = `${SUPABASE_URL}/storage/v1/object/public/flyers/admin/afiche.jpg`
      expect(fuentesDeImagen(urlFlyer, SUPABASE_URL)).toEqual([urlFlyer])
    })
  })

  describe('hosts de ticketeras y cines permitidos (el cambio de la R28: antes [], ahora [original])', () => {
    it.each(HOSTS_IMAGENES_TERCEROS)('%s: [original]', (host) => {
      const url = `https://${host}/media/flyer-de-prueba.jpg`
      expect(fuentesDeImagen(url, SUPABASE_URL)).toEqual([url])
    })

    it('un subdominio de una ticketera de la lista: [original]', () => {
      const url = 'https://contenidos.entradauno.com/media/destacada.jpg'
      expect(fuentesDeImagen(url, SUPABASE_URL)).toEqual([url])
    })

    it('funciona también sin supabaseUrl configurado (la ticketera no depende de nuestro Storage)', () => {
      const url = 'https://norteticket.com/media/mixtape.png'
      expect(fuentesDeImagen(url, null)).toEqual([url])
      expect(fuentesDeImagen(url, undefined)).toEqual([url])
      expect(fuentesDeImagen(url, '')).toEqual([url])
    })
  })

  describe('casos que siguen dando []', () => {
    it('sin URL: []', () => {
      expect(fuentesDeImagen(null, SUPABASE_URL)).toEqual([])
      expect(fuentesDeImagen(undefined, SUPABASE_URL)).toEqual([])
      expect(fuentesDeImagen('', SUPABASE_URL)).toEqual([])
    })

    it('una URL inválida (texto cualquiera): [], sin explotar', () => {
      expect(fuentesDeImagen('no-es-una-url', SUPABASE_URL)).toEqual([])
      expect(fuentesDeImagen('javascript:alert(1)', SUPABASE_URL)).toEqual([])
    })

    it('http (sin "s"), incluso contra nuestro propio host: []', () => {
      expect(fuentesDeImagen(`http://proyecto-de-prueba.supabase.co${PATH_JPG}`, SUPABASE_URL)).toEqual([])
    })

    it('http contra una ticketera permitida: [] (la regla exige https)', () => {
      expect(fuentesDeImagen('http://entradauno.com/media/x.jpg', SUPABASE_URL)).toEqual([])
    })

    it('otro bucket del mismo host que nuestro Supabase: []', () => {
      expect(
        fuentesDeImagen(`${SUPABASE_URL}/storage/v1/object/public/otro-bucket-de-prueba/post.jpg`, SUPABASE_URL)
      ).toEqual([])
    })

    it('otro host (no es ni nuestro Storage ni una ticketera permitida): []', () => {
      expect(fuentesDeImagen(`https://otro-sitio-de-prueba.com.ar${PATH_JPG}`, SUPABASE_URL)).toEqual([])
    })

    it('flyers_ig o flyers en otro host (no el de nuestro Supabase): [] (no es ticketera permitida)', () => {
      expect(fuentesDeImagen(`https://otro-sitio-de-prueba.com.ar${PATH_JPG}`, SUPABASE_URL)).toEqual([])
      expect(
        fuentesDeImagen('https://otro-sitio-de-prueba.com.ar/storage/v1/object/public/flyers/x.webp', SUPABASE_URL)
      ).toEqual([])
    })

    it('bucket flyers_ig/flyers de nuestro Storage, pero sin supabaseUrl configurado: []', () => {
      expect(fuentesDeImagen(URL_JPG, null)).toEqual([])
      expect(fuentesDeImagen(URL_JPG, undefined)).toEqual([])
      expect(fuentesDeImagen(URL_JPG, '')).toEqual([])
      expect(
        fuentesDeImagen(`${SUPABASE_URL}/storage/v1/object/public/flyers/penas/x.webp`, null)
      ).toEqual([])
    })
  })

  // -------------------------------------------------------------------------
  // Bypasses de host que la R25 ya probaba contra `esDeNuestroStorage`
  // (packages/core/src/images/storage-url.ts) y que tienen que seguir dando
  // []: acá el "host legítimo" relevante es el de Supabase (para el storage)
  // y los de HOSTS_IMAGENES_TERCEROS (para las ticketeras); ninguno de los
  // dos se deja engañar por un host parecido.
  // -------------------------------------------------------------------------
  describe('bypasses de host (R25): ninguno cuela, ni contra nuestro Storage ni contra una ticketera', () => {
    it('host que "contiene" el nuestro pero no es igual (falso subdominio, sufijo): []', () => {
      expect(fuentesDeImagen(`https://proyecto-de-prueba.supabase.co.evil-de-prueba.com${PATH_JPG}`, SUPABASE_URL)).toEqual([])
      expect(fuentesDeImagen(`https://evil-de-prueba.com/x${PATH_JPG}`, SUPABASE_URL)).toEqual([])
    })

    it('ticketera con sufijo falso (entradauno.com.evil.io): []', () => {
      expect(fuentesDeImagen('https://entradauno.com.evil.io/media/x.jpg', SUPABASE_URL)).toEqual([])
    })

    it('ticketera con prefijo falso, sin punto (evilentradauno.com): []', () => {
      expect(fuentesDeImagen('https://evilentradauno.com/media/x.jpg', SUPABASE_URL)).toEqual([])
    })

    it('"@" en la autoridad (userinfo) para disfrazar el host real: []', () => {
      expect(fuentesDeImagen('https://entradauno.com@evil-de-prueba.com/media/x.jpg', SUPABASE_URL)).toEqual([])
      expect(fuentesDeImagen(`https://proyecto-de-prueba.supabase.co@evil-de-prueba.com${PATH_JPG}`, SUPABASE_URL)).toEqual([])
    })

    it('subdominio falso que termina en el host legítimo como palabra pero no como dominio (sin punto): []', () => {
      expect(fuentesDeImagen('https://xentradauno.com/media/x.jpg', SUPABASE_URL)).toEqual([])
    })

    it('barra invertida en vez de barra: NO es un bypass — el WHATWG URL de Node normaliza "\\\\" a "/" para esquemas especiales (https incluido), así que esto resuelve al host legítimo entradauno.com y tiene que seguir dando [original]', () => {
      // Antes se esperaba [] (asumiendo que confundía al parser), pero
      // `new URL('https:\\entradauno.com\media\x.jpg').host` da
      // 'entradauno.com': es el mismo host real, no uno falso. No hay nada
      // que arreglar en el código; era una expectativa incorrecta del test.
      const urlConBarraInvertida = 'https:\\\\entradauno.com\\media\\x.jpg'
      expect(fuentesDeImagen(urlConBarraInvertida, SUPABASE_URL)).toEqual([urlConBarraInvertida])
    })

    it('doble barra extra antes del host (URL con autoridad vacía / host distinto): []', () => {
      expect(fuentesDeImagen('https://evil-de-prueba.com//entradauno.com/media/x.jpg', SUPABASE_URL)).toEqual([])
    })

    it('mayúsculas en el host no esquivan la validación (case-insensitive, pero sigue siendo el host real)', () => {
      // Esto SÍ tiene que pasar: es el mismo host, solo con otra capitalización.
      expect(fuentesDeImagen('https://ENTRADAUNO.COM/media/x.jpg', SUPABASE_URL)).toEqual(['https://ENTRADAUNO.COM/media/x.jpg'])
      // Pero un host distinto en mayúsculas sigue sin colar.
      expect(fuentesDeImagen('https://EVILENTRADAUNO.COM/media/x.jpg', SUPABASE_URL)).toEqual([])
    })

    it('puerto distinto en el host (no es el mismo origin): []', () => {
      expect(fuentesDeImagen('https://entradauno.com:8443/media/x.jpg', SUPABASE_URL)).toEqual([])
      expect(fuentesDeImagen(`https://proyecto-de-prueba.supabase.co:8443${PATH_JPG}`, SUPABASE_URL)).toEqual([])
    })

    it('"%2e" (punto codificado) para intentar armar un host distinto: []', () => {
      expect(fuentesDeImagen('https://entradauno%2e com.evil-de-prueba.com/media/x.jpg', SUPABASE_URL)).toEqual([])
      expect(fuentesDeImagen('https://evil-de-prueba.com/%2e%2e/entradauno.com/media/x.jpg', SUPABASE_URL)).toEqual([])
    })
  })
})

describe('siguienteFuente', () => {
  it('da la fuente del índice siguiente', () => {
    const fuentes = ['a', 'b', 'c']
    expect(siguienteFuente(fuentes, -1)).toBe('a')
    expect(siguienteFuente(fuentes, 0)).toBe('b')
    expect(siguienteFuente(fuentes, 1)).toBe('c')
  })

  it('null cuando no quedan fuentes (el índice actual es el último)', () => {
    expect(siguienteFuente(['a', 'b'], 1)).toBeNull()
  })

  it('lista vacía: null', () => {
    expect(siguienteFuente([], -1)).toBeNull()
    expect(siguienteFuente([], 0)).toBeNull()
  })

  it('índice muy negativo: null (no da la vuelta al array)', () => {
    expect(siguienteFuente(['a', 'b'], -5)).toBeNull()
  })

  it('índice fuera de rango (más allá del final): null', () => {
    expect(siguienteFuente(['a', 'b'], 5)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Prueba de rotura 4 del plan: todo host de HOSTS_IMAGENES_TERCEROS tiene que
// aparecer en el `img-src` del CSP de la web, para que lo que la app acepta
// pedirle a un tercero sea un subconjunto de lo que el navegador de la web ya
// puede pedir. Se parsea `apps/web/next.config.mjs` como texto (no se
// importa: tiene `process.env` a nivel de módulo y arma el array de forma
// condicional según `ADS_ENABLED`, así que evaluarlo en el test dependería de
// variables de entorno; la sección de `img-src` que nos interesa no es
// condicional, así que un recorte de texto + regex es confiable para esto).
//
// Nota de ruta: la tarea menciona `apps/web/next.config.ts`, pero el archivo
// real en este worktree es `apps/web/next.config.mjs` (no hay `next.config.ts`).
// ---------------------------------------------------------------------------
describe('HOSTS_IMAGENES_TERCEROS contra el img-src de la web', () => {
  const NEXT_CONFIG_PATH = fileURLToPath(new URL('../../web/next.config.mjs', import.meta.url))
  const nextConfigSrc = readFileSync(NEXT_CONFIG_PATH, 'utf8')

  // Recorte del array de `'img-src': [ ... ]` dentro del objeto `csp`.
  const imgSrcMatch = nextConfigSrc.match(/'img-src':\s*\[([\s\S]*?)\]/)

  it('encuentra la sección img-src en next.config.mjs', () => {
    expect(imgSrcMatch).not.toBeNull()
  })

  const imgSrcSection = imgSrcMatch ? imgSrcMatch[1] : ''
  // Todas las URLs https:// literales dentro de esa sección (exactas y con
  // wildcard `*.`), como las ve el navegador en el header real.
  const imgSrcHosts = new Set(
    Array.from(imgSrcSection.matchAll(/https:\/\/(\*\.)?([a-z0-9.-]+)/gi)).map((m) => m[2].toLowerCase())
  )

  it.each(HOSTS_IMAGENES_TERCEROS)('%s está en el img-src de la web (exacto o como *.%s)', (host) => {
    expect(imgSrcHosts.has(host.toLowerCase())).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Barrido (25-c, se conserva en la R28): ninguna otra forma de armar una
// URI de imagen remota en la app — tiene que pasar por `fuentesDeImagen`
// (vía `Afiche.tsx`, el único componente aprobado para construir
// `source={{ uri: ... }}`).
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

describe('app/, components/ y lib/: ninguna otra URI de imagen remota sin pasar por fuentesDeImagen', () => {
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
      // archivo, hay una imagen armada sin pasar por fuentesDeImagen/Afiche.
      expect(src).not.toMatch(/\buri\s*:/)
    }
  )
})
