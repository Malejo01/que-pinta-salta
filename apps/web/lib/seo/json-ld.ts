/**
 * Datos estructurados (schema.org en JSON-LD) del sitio, B2.
 *
 * Constructores puros, sin React: cada uno devuelve un nodo SIN `@context`.
 * Para publicarlo, o se juntan varios en un `@graph` (`grafoJsonLd`, como en
 * la portada) o se le pone el contexto a uno solo (`conContexto`). El
 * `<script>` lo dibuja `components/json-ld.tsx`.
 */
import { SITE_NAME, SITE_URL, urlAbsoluta } from './sitio'

export { SITE_NAME, SITE_URL } from './sitio'

const CONTEXTO = 'https://schema.org'

/** Un nodo de schema.org: objeto plano que termina en JSON. */
export type NodoJsonLd = Record<string, unknown>

export const ID_ORGANIZACION = `${SITE_URL}/#organizacion`
export const ID_SITIO = `${SITE_URL}/#sitio`

/**
 * Perfiles públicos del SITIO (no de la persona que lo hace). Hoy no hay
 * ninguno en el código: los links del pie (GitHub, LinkedIn) son del autor y
 * no corresponden acá. El día que exista la cuenta de Instagram del sitio, se
 * agrega y `sameAs` aparece solo.
 */
const PERFILES_DEL_SITIO: string[] = []

export function organizacionJsonLd(): NodoJsonLd {
  return {
    '@type': 'Organization',
    '@id': ID_ORGANIZACION,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    // 160×160: el mismo logo del navbar y del pie (Google pide al menos 112×112).
    logo: urlAbsoluta('/brand/logo-circular.png'),
    ...(PERFILES_DEL_SITIO.length > 0 && { sameAs: PERFILES_DEL_SITIO }),
  }
}

export function sitioWebJsonLd(): NodoJsonLd {
  return {
    '@type': 'WebSite',
    '@id': ID_SITIO,
    url: `${SITE_URL}/`,
    name: SITE_NAME,
    inLanguage: 'es-AR',
    publisher: { '@id': ID_ORGANIZACION },
    // La búsqueda apunta a la portada con `?search=` y no a /buscar: hoy
    // /buscar no lee ningún parámetro de la URL (abre siempre vacío), y la
    // portada sí (`components/home-content.tsx` inicializa el filtro con
    // `searchParams.get("search")`). /buscar es de otra sesión; la propuesta
    // es que lea `?q=` y entonces mudar esto a `/buscar?q={search_term_string}`.
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/?search={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }
}

/** Migas de pan: el orden del array es el de la ruta (la primera, la portada). */
export function migasJsonLd(items: { nombre: string; url: string }[]): NodoJsonLd {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((miga, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: miga.nombre,
      item: urlAbsoluta(miga.url),
    })),
  }
}

/**
 * Un elemento de `listaJsonLd`: o un link a una página propia (una ficha:
 * `url` + `nombre`), o un nodo embebido (por ejemplo una `Movie`, que no
 * tiene página en el sitio).
 */
export type ElementoDeLista = { url: string; nombre?: string } | { item: NodoJsonLd }

export function listaJsonLd(
  elementos: ElementoDeLista[],
  opciones: { nombre?: string; url?: string } = {}
): NodoJsonLd {
  return {
    '@type': 'ItemList',
    ...(opciones.nombre && { name: opciones.nombre }),
    ...(opciones.url && { url: urlAbsoluta(opciones.url) }),
    numberOfItems: elementos.length,
    itemListElement: elementos.map((elemento, i) =>
      'item' in elemento
        ? { '@type': 'ListItem', position: i + 1, item: elemento.item }
        : {
            '@type': 'ListItem',
            position: i + 1,
            url: urlAbsoluta(elemento.url),
            ...(elemento.nombre && { name: elemento.nombre }),
          }
    ),
  }
}

/** Varios nodos en un solo bloque; se referencian entre sí por `@id`. */
export function grafoJsonLd(nodos: NodoJsonLd[]): NodoJsonLd {
  return { '@context': CONTEXTO, '@graph': nodos }
}

/** Un nodo suelto, listo para publicar en su propio `<script>`. */
export function conContexto(nodo: NodoJsonLd): NodoJsonLd {
  return { '@context': CONTEXTO, ...nodo }
}

/**
 * JSON para meter dentro de `<script type="application/ld+json">`. Cada `<`
 * va como `<`: un título con "</script>" cerraría el script antes de
 * tiempo y el resto del texto quedaría como HTML. Para el JSON es el mismo
 * carácter, así que `JSON.parse` devuelve el texto original.
 */
export function serializarJsonLd(data: NodoJsonLd | NodoJsonLd[]): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
