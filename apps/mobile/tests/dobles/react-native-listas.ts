// Doble de `react-native` para contar renders de las listas (A7, nube Q1).
// Lo usa SOLO `tests/renders-listas.test.ts`, con `vi.mock('react-native', …)`
// en ese archivo: el resto de los tests sigue sin React Native (ver
// `vitest.config.ts`). No termina en `.test.ts`: no se recoge como test.
//
// Qué imita y qué no (para que los números signifiquen algo):
//
// - `FlatList`/`SectionList` son `memo` (shallow), como los reales, que son
//   `PureComponent`: si el padre vuelve a dibujarse y TODAS las props de la
//   lista son las mismas referencias, la lista no se vuelve a dibujar.
// - Si la lista se dibuja, se vuelven a dibujar todas sus celdas (`Celda`, sin
//   memo): en el real, `FlatList._renderer` arma un `renderItem` nuevo en cada
//   render y el `CellRenderer` (PureComponent) lo recibe distinto, así que
//   también se dibuja. Lo que decide si `TarjetaEvento` se dibuja es su propio
//   `memo`, igual que en el teléfono.
// - Ventana inicial: dibuja `initialNumToRender` elementos (10 por omisión,
//   el default de `VirtualizedList`) y nada más. Con `numColumns > 1` cuenta
//   FILAS (como el real: `getItemCount` = ceil(n / numColumns)). En
//   `SectionList` cuenta, como `VirtualizedSectionList`, un elemento por
//   encabezado, uno por fila y uno por pie de cada sección.
// - Claves: las mismas que arma el real. `FlatList` con `numColumns > 1`
//   une las claves de la fila con ':' (`FlatList._keyExtractor`) y adentro
//   cada columna va en un `Fragment key={kk}`; `SectionList` antepone
//   `section.key + ':'`. Así los remontajes por cambio de clave son los del
//   teléfono.
//
// NO simula: el layout (no hay medidas), el scroll, la expansión de la
// ventana a `windowSize` ni los lotes de `maxToRenderPerBatch` (los dos
// pasan después del primer layout, en el teléfono), ni `getItemLayout`. O sea:
// mide el primer pantallazo y los re-renders, no el costo de scrollear.
import { React } from './react-raiz'

const { createElement, Fragment, isValidElement, memo, useImperativeHandle } = React

type Nodo = unknown
type Props = { children?: Nodo; [clave: string]: unknown }

/** Último `onRefresh` visto (de `refreshControl`): el test lo llama para "tirar para refrescar". */
export const registroListas: { refrescar: null | (() => unknown) } = { refrescar: null }

function capturarRefresco(props: Props) {
  const control = props.refreshControl
  if (isValidElement(control)) {
    const alRefrescar = (control.props as { onRefresh?: () => unknown }).onRefresh
    if (alRefrescar) registroListas.refrescar = alRefrescar
  }
}

function contenedor(etiqueta: string) {
  function Doble(props: Props) {
    const hijos = typeof props.children === 'function' ? (props.children as (e: { pressed: boolean }) => Nodo)({ pressed: false }) : props.children
    return createElement(etiqueta, null, hijos as never)
  }
  Doble.displayName = `Doble(${etiqueta})`
  return Doble
}

export const View = contenedor('div')
export const Text = contenedor('span')
export const Pressable = contenedor('div')
export const TouchableOpacity = contenedor('div')
export const SafeAreaView = contenedor('div')
export const KeyboardAvoidingView = contenedor('div')
export function Image() {
  return null
}
export function ActivityIndicator() {
  return null
}
export function TextInput() {
  return null
}
export function RefreshControl() {
  return null
}

// Inicio guarda un `ref` y llama `scrollTo` al cambiar de pill o de chip.
export function ScrollView({ ref, children, ...resto }: Props & { ref?: unknown }) {
  capturarRefresco(resto)
  useImperativeHandle(ref as never, () => ({ scrollTo() {}, scrollToEnd() {} }), [])
  return createElement('div', null, children as never)
}

function Celda(props: { children?: Nodo }) {
  return createElement('div', null, props.children as never)
}

function aElemento(componente: unknown): Nodo {
  if (componente == null || componente === false) return null
  if (isValidElement(componente)) return componente
  if (typeof componente === 'function') return createElement(componente as never)
  return null
}

type RenderItem = (info: { item: unknown; index: number; separators: object; section?: unknown }) => Nodo
type KeyExtractor = (item: unknown, index: number) => string
const SEPARADORES = { highlight() {}, unhighlight() {}, updateProps() {} }

function FlatListDoble(props: Props) {
  capturarRefresco(props)
  const data = (props.data as unknown[] | null | undefined) ?? []
  const columnas = (props.numColumns as number | undefined) ?? 1
  const ventana = (props.initialNumToRender as number | undefined) ?? 10
  const renderItem = props.renderItem as RenderItem
  const keyExtractor = (props.keyExtractor as KeyExtractor | undefined) ?? ((_item: unknown, indice: number) => String(indice))

  const filas: unknown[][] = []
  for (let i = 0; i < data.length; i += columnas) filas.push(data.slice(i, i + columnas))

  const celdas = filas.slice(0, ventana).map((fila, indiceFila) => {
    if (columnas === 1) {
      const item = fila[0]
      return createElement(Celda, { key: keyExtractor(item, indiceFila) }, renderItem({ item, index: indiceFila, separators: SEPARADORES }) as never)
    }
    const clave = fila.map((item, kk) => keyExtractor(item, indiceFila * columnas + kk)).join(':')
    const columnasDeLaFila = fila.map((item, kk) =>
      createElement(Fragment, { key: kk }, renderItem({ item, index: indiceFila * columnas + kk, separators: SEPARADORES }) as never),
    )
    return createElement(Celda, { key: clave }, columnasDeLaFila)
  })

  return createElement(
    'div',
    null,
    aElemento(props.ListHeaderComponent) as never,
    (data.length === 0 ? aElemento(props.ListEmptyComponent) : celdas) as never,
    aElemento(props.ListFooterComponent) as never,
  )
}

interface SeccionDoble {
  key?: string
  data: unknown[]
}

function SectionListDoble(props: Props) {
  capturarRefresco(props)
  const secciones = (props.sections as SeccionDoble[] | undefined) ?? []
  const ventana = (props.initialNumToRender as number | undefined) ?? 10
  const renderItem = props.renderItem as RenderItem
  const renderSectionHeader = props.renderSectionHeader as ((info: { section: unknown }) => Nodo) | undefined
  const keyExtractor = (props.keyExtractor as KeyExtractor | undefined) ?? ((_item: unknown, indice: number) => String(indice))

  const elementos: Nodo[] = []
  secciones.forEach((seccion, indiceSeccion) => {
    const claveSeccion = seccion.key || String(indiceSeccion)
    elementos.push(createElement(Celda, { key: `${claveSeccion}:header` }, (renderSectionHeader ? renderSectionHeader({ section: seccion }) : null) as never))
    seccion.data.forEach((item, indice) => {
      elementos.push(
        createElement(
          Celda,
          { key: `${claveSeccion}:${keyExtractor(item, indice)}` },
          renderItem({ item, index: indice, section: seccion, separators: SEPARADORES }) as never,
        ),
      )
    })
    elementos.push(createElement(Celda, { key: `${claveSeccion}:footer` }))
  })

  const total = secciones.reduce((suma, seccion) => suma + seccion.data.length, 0)
  return createElement(
    'div',
    null,
    aElemento(props.ListHeaderComponent) as never,
    (total === 0 && secciones.length === 0 ? aElemento(props.ListEmptyComponent) : elementos.slice(0, ventana)) as never,
    aElemento(props.ListFooterComponent) as never,
  )
}

export const FlatList = memo(FlatListDoble)
export const SectionList = memo(SectionListDoble)

export const StyleSheet = {
  create<T>(estilos: T): T {
    return estilos
  },
  flatten(estilo: unknown) {
    return estilo
  },
  hairlineWidth: 1,
  absoluteFill: {},
  absoluteFillObject: {},
}

export const Platform = { OS: 'android', select: (opciones: Record<string, unknown>) => opciones.android ?? opciones.default }
export const AccessibilityInfo = { announceForAccessibility() {} }
export const Share = { share: async () => ({ action: 'dismissedAction' }) }
export const Linking = { openURL: async () => undefined }
export const AppState = { addEventListener: () => ({ remove() {} }), currentState: 'active' }
export function useWindowDimensions() {
  return { width: 360, height: 800, scale: 2, fontScale: 1 }
}
export function useColorScheme() {
  return 'dark'
}
