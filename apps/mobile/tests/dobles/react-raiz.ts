// La copia de React con la que se mide (A7, nube Q1): la de la RAÍZ del
// monorepo (`node_modules/react`, 19.2.6), la misma que trae `react-dom`.
//
// Por qué no la de la app: `apps/mobile/node_modules/react` es 19.2.3 (la que
// fija Expo) y en el repo no hay un `react-dom` 19.2.3 (ni
// `react-test-renderer` ni `react-reconciler`): `react-dom` 19.2.6 corta con
// "Incompatible React versions" si los componentes renderizan con otra copia,
// y con dos copias los hooks fallan ("Invalid hook call"). Así que
// `tests/renders-listas.test.ts` redirige `react`, `react/jsx-runtime` y
// `react/jsx-dev-runtime` de los componentes a ESTA copia con `vi.mock`, y
// `react-dom` (que se carga con el `require` de Node, sin pasar por Vite)
// resuelve sola la misma. Entre 19.2.3 y 19.2.6 no cambia nada de `memo`, de
// la reconciliación por `key` ni de los hooks que usan las pantallas.
//
// `createRequire` desde el `package.json` de la raíz: Node cachea el módulo
// por ruta, así que todos los `requerir('react')` devuelven el MISMO objeto
// que ve `react-dom`.
//
// El DOM: los tests de la app corren en `node` y NINGÚN archivo de
// `apps/mobile/tests/` puede pedir otro entorno por archivo
// (`tests/convencion-entorno.test.ts`, R61, sin excepciones). Por eso no se
// cambia el entorno: `crearRaiz` arma un documento con `jsdom` (la copia de la
// raíz, la que ya usan los tests de la web; no es una dependencia nueva) y lo
// cuelga de `globalThis` ANTES del primer `require('react-dom/client')`, que
// decide al cargarse si hay DOM. Solo lo llama el test de renders, y solo
// después de que corrieron los demás `import`.
//
// No termina en `.test.ts`: `vitest.config.ts` no lo recoge como test.
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const requerir = createRequire(resolve(dirname(fileURLToPath(import.meta.url)), '../../../../package.json'))

export const React: typeof import('react') = requerir('react')
export const jsxRuntime: Record<string, unknown> = requerir('react/jsx-runtime')
export const jsxDevRuntime: Record<string, unknown> = requerir('react/jsx-dev-runtime')
export const versionDeReact: string = requerir('react/package.json').version

export interface RaizDeReact {
  render: (elemento: unknown) => void
  unmount: () => void
}

let documento: { createElement: (etiqueta: string) => unknown } | null = null

function prepararDom() {
  if (documento) return documento
  const { JSDOM } = requerir('jsdom') as { JSDOM: new (html: string) => { window: Record<string, unknown> & { document: never } } }
  const { window } = new JSDOM('<!doctype html><html><body></body></html>')
  const global = globalThis as Record<string, unknown>
  // Lo que `react-dom` mira del entorno: `window`/`document` (si hay DOM) y
  // las clases que usa para el foco y los eventos.
  for (const nombre of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'HTMLIFrameElement', 'Event']) {
    global[nombre] = nombre === 'window' ? window : window[nombre]
  }
  documento = window.document
  return documento
}

/** Una raíz de React DOM sobre un `div` de jsdom (arma el DOM la primera vez). */
export function crearRaiz(): RaizDeReact {
  const doc = prepararDom()
  const { createRoot } = requerir('react-dom/client') as { createRoot: (contenedor: unknown) => RaizDeReact }
  return createRoot(doc.createElement('div'))
}
