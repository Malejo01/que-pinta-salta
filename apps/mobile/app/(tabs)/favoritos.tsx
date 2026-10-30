// Favoritos (R27, tarea 27-b; grilla R28, 28-f; paridad R29, 29-a: F13; layout
// de la web R29, 29-i: §3.7). Sin sesión, invita a entrar desde Cuenta; con
// sesión, el layout de la web (apps/web/app/favoritos/favoritos-list.tsx):
// título + botón verde "Compartir agenda por WhatsApp", "Plan flexible / Sin
// fecha definida" (películas y flyers) y después los grupos por día, cada
// uno con su separador, en una grilla de 2 con `TarjetaEvento`. El `userId`
// sale de `useSession()`, nunca de un parámetro de pantalla.
//
// R47, tarea 47-g (QPS-197): la ruta y el archivo siguen siendo
// "favoritos.tsx" (no cambian), pero la pantalla pasa a llamarse "Mis
// eventos" (el título en pantalla; la pestaña de la barra se renombra en
// `app/(tabs)/_layout.tsx`, archivo de esta misma tarea). `obtenerFavoritos`
// (`lib/favoritos.ts`, 47-e) ahora devuelve `{ voy, eventos }`: la
// `SectionList` arranca con la sección "Voy" (`seccionVoy`, en el orden que
// ya trae core — no se reordena) y sigue con "Guardados"
// (`agruparFavoritosParaSecciones`, sobre `eventos`). Las dos listas ya
// vienen separadas sin repetidos (core, `separarMisEventos`): esta pantalla
// no vuelve a filtrar nada entre ellas, solo las concatena.
//
// Recarga: `useFocusEffect` (en vez de `useEffect`) vuelve a leer cada vez
// que la pestaña toma foco (ya no se queda con la lectura vieja al volver de
// marcar/desmarcar un favorito en otra pantalla — causa de F13, "Sushi
// Libre" no aparecía hasta recargar la app entera). Como `useFocusEffect` ya
// corre también al montar (la pestaña está en foco desde el principio), no
// hace falta un `useEffect` aparte: así no se dispara la carga dos veces
// (tests/favoritos-armar.test.ts cuenta las veces que se invoca a la función
// de carga en todo el archivo, sin contar su propia declaración, y espera
// exactamente una: por eso `refrescar`, más abajo, repite el mismo cuerpo en
// vez de llamar a esa función).
//
// `lib/favoritos.ts` (29-a; reescrito en 47-e) ya devuelve `eventos` como
// lista plana en el orden de `armarFavoritos` (flexibles primero, después
// por día): no es un archivo permitido de esta tarea, así que
// `agruparFavoritosParaSecciones`, acá abajo, no vuelve a filtrar ni a
// ordenar nada — solo separa esa misma lista por tipo
// (`isCinemaMovie`/`isInstagramFlyer`) y por `date` (ya agrupada y ordenada
// por el core) para dársela a `SectionList` en la forma que pide. `voy`
// nunca tiene películas ni flyers (`separarMisEventos`, core), así que
// `seccionVoy` no necesita ese mismo agrupado: es un solo grupo, ya ordenado
// por fecha.
//
// El mensaje de WhatsApp es `armarMensajeWhatsApp`
// (`@qps/core/favoritos/armar`, de 29-a — ver el comentario ahí sobre por
// qué se movió a core): se manda con `Share.share`, no con `Linking` a
// `whatsapp://send?text=` (la otra alternativa que permite la tarea):
// `tests/aperturas-url.test.ts` exige que todo uso de `openURL` en
// `app/`/`components/` venga de `urlGo`, `urlComoLlegar` o
// `urlCompraCineSegura`, y un link armado a mano para WhatsApp no entra en
// esos tres — ese test no es un archivo permitido de esta tarea.
//
// `tests/compartir-ficha.test.ts` tiene una segunda regla, además de
// `urlEvento(id, 'app')`, justamente para este caso (agenda entera, no un
// evento puntual): acepta que `message` salga de `armarMensajeWhatsApp(...)`,
// como acá abajo.
//
// A7 (nube Q1), rendimiento: la clave de cada fila de 2 era la unión de sus
// ids (`fila.map(id).join('-')`), que cambia con cualquier cambio de la fila.
// Ahora la fila se identifica por el id de su PRIMER evento (`claveDeFila`) y
// cada tarjeta, adentro, por el suyo. Lo que gana es poco y conviene decirlo
// (vuelta 1): solo la fila cuyo primer evento no cambió sigue montada (y esa
// tarjeta con ella). Sacar un favorito corre todas las filas siguientes un
// lugar, así que cambian de primer evento y se remontan igual que antes. En la
// medición (`tests/renders-listas.test.ts`, escenario (c)) casi toda la baja
// de 26 renders / 7 montajes a 5 / 5 viene de la ventana más chica
// (`VENTANA_FAVORITOS`) y del `memo` de la tarjeta; la clave aporta un
// montaje (6 -> 5). No hay `index` en la clave. No se pasó a `FlatList` con
// `numColumns={2}`: esta pantalla necesita las secciones (Voy, flexibles y
// los días) y, además, `FlatList` con columnas une las claves de la fila con
// ':' por dentro, o sea el mismo problema. `renderItem` es una función de
// módulo y la ventana es `VENTANA_FAVORITOS`. Sin `getItemLayout`: los
// encabezados de sección y la cabecera de "Mis eventos" cambian de alto con
// la escala de fuente, y la `SectionList` cuenta encabezados y pies como
// elementos: un `offset` fijo sería falso.
//
// A6 (nube Q1) · Vacíos y sin conexión. (1) Un error de carga distingue "no
// hay conexión y todavía no hay nada guardado" de un error del servidor
// (`mensajeErrorCarga`, `lib/vacios.ts`; `cargarFavoritosConCache` ahora trae
// `sinConexion` en la rama de error). (2) El vacío dice por qué y ofrece "Ver
// la agenda" (Inicio); mostrando lo guardado, que los eventos que ya pasaron
// no se muestran (también como línea de más en el aviso). (3) Con lo guardado
// a la vista, "Reintentar" al lado del aviso (`refrescar`), y si vuelve a caer
// en lo guardado, "Seguimos sin conexión" (`decidirRefresco`, anunciado). (4)
// Sin sesión porque no se pudo confirmar por falta de red (`sinConexion` de
// `useSession()`) y sin nada guardado, ya no dice "Entrá…"/"Ingresar": dice
// que no hay conexión y ofrece "Reintentar" (`reintentarSesion`, que vuelve a
// probar la sesión, más una relectura de lo guardado). `decidirVistaFavoritos`
// NO cambia (el test tiene una copia literal): la diferencia se resuelve al
// dibujar la vista 'invitar'.
//
// Integración (R76): los avisos de A6 pasan por `anunciar` (`lib/anunciar.ts`),
// no por `AccessibilityInfo`. Esta pantalla no tiene conteo de A8, así que no
// hay anuncio duplicado. La lista sigue siendo la de A7 (`dibujarFila` y
// `claveDeFila` de módulo); el vacío es el de A6.
import { useCallback, useMemo, useRef, useState } from 'react'
import { Image, Pressable, RefreshControl, SectionList, Share, StyleSheet, View, type SectionListRenderItem } from 'react-native'
import { useFocusEffect, useRouter, useTheme } from 'expo-router'
import { capitalizeFirst } from '@qps/core/event-display'
import { formatEventDate } from '@qps/core/date-format'
import { armarMensajeWhatsApp } from '@qps/core/favoritos/armar'
import type { DisplayEvent } from '@qps/core/home/types'
import LOGO_MARCA from '@/assets/logo-circular.png'
import { AvisoNoSeActualizo, AvisoSinConexion } from '@/components/AvisoSinConexion'
import { AvisoActivarPush } from '@/components/AvisoActivarPush'
import { BotonReintentar, Cargando, ErrorCarga, Vacio } from '@/components/EstadoCarga'
import { Icono } from '@/components/Icono'
import { TarjetaEvento } from '@/components/TarjetaEvento'
import { Texto } from '@/components/Texto'
import { anunciar } from '@/lib/anunciar'
import { useColoresQPS } from '@/lib/colores'
import { esperarBorradoDeCache, reintentarSesion, useSession } from '@/lib/session'
import { TITULO_SIN_CONEXION } from '@/lib/sin-conexion/aviso'
import { cargarFavoritosConCache, leerFavoritosGuardados } from '@/lib/sin-conexion/favoritos'
import {
  anuncioDeReintento,
  avisoReintentoSesion,
  decidirRefresco,
  detalleAvisoFavoritos,
  mensajeErrorCarga,
  SIN_CONEXION_POR_PANTALLA,
  VACIO_FAVORITOS_SIN_CONEXION,
} from '@/lib/vacios'

// R43, 43-c: `desdeCache` en la rama 'ok' (cuándo se guardó lo que se está
// mostrando, `null` con una carga fresca) y una variante nueva, 'invitar',
// para la pantalla de "Entrá para guardar tus favoritos" — antes era una
// decisión tomada ANTES de mirar `estado` (`if (!userId) return <...>`), lo
// que no dejaba lugar para mostrar la caché sin sesión (ver
// `decidirVistaFavoritos`, más abajo).
type EstadoLista =
  | { tipo: 'cargando' }
  // A6: `error` ya es el texto para la pantalla (`mensajeErrorCarga`).
  | { tipo: 'error'; error: string; sinConexion?: boolean }
  // A6: `seOcultaronPasados`, mostrando la copia, si se sacaron eventos que ya
  // pasaron (solo entonces el aviso lo dice).
  | {
      tipo: 'ok'
      voy: DisplayEvent[]
      eventos: DisplayEvent[]
      desdeCache: { guardadoEn: Date } | null
      seOcultaronPasados?: boolean
    }
  | { tipo: 'invitar' }

interface SeccionFavoritos {
  key: string
  titulo: string
  esFlexible: boolean
  data: DisplayEvent[][]
}

/**
 * Ventana de la lista (A7, nube Q1). La `SectionList` cuenta un elemento por
 * encabezado, uno por fila de 2 y uno por pie de cada sección: 6 alcanza para
 * el primer pantallazo (cabecera de "Mis eventos", un encabezado y 2 filas de
 * ~249 dp en 360×800) con reserva; antes eran 10 (hasta 13 tarjetas). Lotes de
 * 4 y `windowSize: 7` en vez de 21. `removeClippedSubviews` no hace falta
 * apagarlo acá: a diferencia de `FlatList` (que lo prende por omisión en
 * Android), `SectionList` no le pone valor y el `ScrollView` lo deja apagado.
 */
export const VENTANA_FAVORITOS = { initialNumToRender: 6, maxToRenderPerBatch: 4, windowSize: 7 } as const

/**
 * Clave de una fila de 2 (A7, nube Q1): el id de su primer evento. Una fila
 * nunca está vacía (`enFilasDeDos` corta de a 2 sobre una lista con algo) y
 * un evento no se repite dentro de una sección, así que es única; la
 * `SectionList` le antepone la clave de la sección.
 */
export function claveDeFila(fila: DisplayEvent[]): string {
  return fila[0].id
}

// A7 (nube Q1): de módulo (solo usa `estilos`): la misma función en cada render.
const dibujarFila: SectionListRenderItem<DisplayEvent[], SeccionFavoritos> = ({ item: fila }) => (
  <View style={estilos.filaGrilla}>
    {fila.map((item) => (
      <View key={item.id} style={estilos.celda}>
        {/* R67, 67-a: `TarjetaEvento` ya navega a la ficha de
            película o de flyer (lib/rutas.ts): sin capa encima. */}
        <TarjetaEvento evento={item} />
      </View>
    ))}
    {fila.length === 1 ? <View style={estilos.celda} /> : null}
  </View>
)

function enFilasDeDos(items: DisplayEvent[]): DisplayEvent[][] {
  const filas: DisplayEvent[][] = []
  for (let i = 0; i < items.length; i += 2) filas.push(items.slice(i, i + 2))
  return filas
}

/**
 * Reconstruye, para `SectionList`, la forma que ya tiene `armarFavoritos`
 * (flexibles + grupos por día) a partir de la lista plana que devuelve
 * `obtenerFavoritos`: separa por tipo y por `date` (string "YYYY-MM-DD" que
 * ya puso `formatDateInSalta` en core), sin volver a filtrar ni a ordenar —
 * el orden de entrada ya es el correcto (flexibles primero, después cada día
 * en orden, y cada grupo ya viene ordenado). Exportada para probarla con
 * fixtures en `tests/favoritos-pantalla.test.ts`.
 */
export function agruparFavoritosParaSecciones(eventos: DisplayEvent[]): SeccionFavoritos[] {
  const flexibles = eventos.filter((item) => item.isCinemaMovie || item.isInstagramFlyer)

  const porDia = new Map<string, DisplayEvent[]>()
  for (const item of eventos) {
    if (item.isCinemaMovie || item.isInstagramFlyer) continue
    const items = porDia.get(item.date)
    if (items) items.push(item)
    else porDia.set(item.date, [item])
  }

  const secciones: SeccionFavoritos[] = []

  if (flexibles.length > 0) {
    secciones.push({
      key: 'flexibles',
      titulo: `Plan flexible / Sin fecha definida (${flexibles.length})`,
      esFlexible: true,
      data: enFilasDeDos(flexibles),
    })
  }

  for (const [dia, items] of porDia) {
    secciones.push({
      key: dia,
      titulo: `${capitalizeFirst(formatEventDate(dia))} (${items.length})`,
      esFlexible: false,
      data: enFilasDeDos(items),
    })
  }

  return secciones
}

/**
 * La sección "Voy" (R47, tarea 47-g, QPS-197): un solo grupo con los
 * eventos de `voy` (los que llegan con ✓ Voy), ya ordenados por fecha por
 * `separarMisEventos` (core) — no se reordenan acá. `null` si no hay
 * ninguno: la pantalla no dibuja ni el grupo ni su encabezado. Exportada
 * para probarla en `tests/favoritos-pantalla.test.ts`.
 */
export function seccionVoy(voy: DisplayEvent[]): SeccionFavoritos | null {
  if (voy.length === 0) return null
  return { key: 'voy', titulo: `Voy (${voy.length})`, esFlexible: false, data: enFilasDeDos(voy) }
}

export type VistaFavoritos = 'cargando-sesion' | 'invitar' | 'contenido'

/**
 * Pura (R43, 43-c, punto 5 del encargo). Qué pantalla mostrar: el estado de
 * la sesión manda primero (`cargandoSesion`); sin usuario y sin `sinConexion`
 * (de `useSession()`, 43-d) es siempre 'invitar' — nunca se intenta leer la
 * caché de favoritos con sesión ausente y red disponible (o sin haberse
 * resuelto si hay red: ver el comentario de `useFocusEffect`, más abajo).
 * Con usuario, siempre 'contenido' (el bloque que ya sabe mostrar
 * cargando/error/ok según `estado`, sin cambios de 36-a/28-c para acá). Sin
 * usuario pero con `sinConexion`, `estado.tipo === 'invitar'` es lo que deja
 * la lectura de la caché (`leerFavoritosGuardados`) cuando no encontró nada
 * guardado: ahí también es 'invitar'; si encontró algo, `estado` ya es
 * `{ tipo: 'ok', ... }` y cae en 'contenido'.
 */
export function decidirVistaFavoritos({
  cargandoSesion,
  hayUsuario,
  sinConexion,
  estado,
}: {
  cargandoSesion: boolean
  hayUsuario: boolean
  sinConexion: boolean
  estado: EstadoLista
}): VistaFavoritos {
  if (cargandoSesion) return 'cargando-sesion'
  if (!hayUsuario) {
    if (!sinConexion) return 'invitar'
    if (estado.tipo === 'invitar') return 'invitar'
  }
  return 'contenido'
}

export default function Favoritos() {
  const { colors } = useTheme()
  const colores = useColoresQPS()
  const router = useRouter()
  // R43 (43-c, con sinConexion de 43-d): sin sesión y sin red para refrescar
  // el token, Favoritos puede mostrar la caché en vez de "Entrá…" (ver
  // `useFocusEffect` y `decidirVistaFavoritos`, arriba).
  const { session, cargando: cargandoSesion, sinConexion } = useSession()
  const userId = session?.user.id ?? null

  const [estado, setEstado] = useState<EstadoLista>({ tipo: 'cargando' })
  // Estado de refresco aparte del de carga (28-c): mientras se refresca, la
  // grilla sigue a la vista en vez de pasar a `Cargando`.
  const [refrescando, setRefrescando] = useState(false)
  // A6: lo que pasó con el último refresco/reintento ("Probamos de nuevo y
  // seguimos sin conexión.", "No pudimos actualizar…"), o `null`.
  const [notaRefresco, setNotaRefresco] = useState<string | null>(null)
  // A6 (ronda de correcciones): número de la última carga pedida. Cada
  // carga (`cargar`, `refrescar`, la lectura de la copia del foco) toma el
  // suyo, y el `useFocusEffect` lo sube cuando cambia la sesión: una
  // respuesta que llega con un número viejo (por ejemplo, un refresco de la
  // cuenta A que vuelve después de que entró la cuenta B) se descarta en vez
  // de pisar lo de ahora. Un ref y no estado: no tiene que dibujar nada.
  const cargaVigenteRef = useRef(0)
  // A6: el último error que se mostró, para anunciar un "Reintentar" que
  // vuelve a dar error (`anuncioDeReintento`).
  const ultimoErrorRef = useRef<string | null>(null)

  // R43, 43-c: `cargarFavoritosConCache` en vez de `obtenerFavoritos` — si
  // falla por red, muestra la última caché buena (`desdeCache` distinto de
  // `null`). `esperarBorradoDeCache` (antes de leer la caché, `@/lib/session`,
  // 43-d) evita mostrarle a esta cuenta la caché de OTRA que todavía no
  // terminó de borrarse tras un cambio de sesión.
  const cargar = useCallback(async () => {
    if (!userId) return
    const estaCarga = ++cargaVigenteRef.current
    const habiaError = ultimoErrorRef.current !== null
    setEstado({ tipo: 'cargando' })
    setNotaRefresco(null)
    await esperarBorradoDeCache()
    const resultado = await cargarFavoritosConCache(userId)
    if (cargaVigenteRef.current !== estaCarga) return
    const nuevo: EstadoLista =
      resultado.tipo === 'ok'
        ? {
            tipo: 'ok',
            voy: resultado.voy,
            eventos: resultado.eventos,
            desdeCache: resultado.desdeCache,
            seOcultaronPasados: resultado.seOcultaronPasados,
          }
        : { tipo: 'error', error: mensajeErrorCarga('favoritos', resultado), sinConexion: resultado.sinConexion }
    setEstado(nuevo)
    ultimoErrorRef.current = nuevo.tipo === 'error' ? nuevo.error : null
    // A6: Android no anuncia la live region del aviso al montarse (R69) e
    // iOS las ignora: se anuncia acá. Y un "Reintentar" de `ErrorCarga` que
    // vuelve a dar error, también.
    if (resultado.tipo === 'ok' && resultado.desdeCache) anunciar(TITULO_SIN_CONEXION)
    const anuncioError = anuncioDeReintento(habiaError, nuevo)
    if (anuncioError) anunciar(anuncioError)
  }, [userId])

  // Repite el cuerpo de `cargar` en vez de llamarla (ver el comentario de
  // cabecera sobre `tests/favoritos-armar.test.ts`, que cuenta los llamados a
  // la función de carga en todo el archivo y espera exactamente uno).
  //
  // R43, 43-c (vuelta 2): sin userId pero con sinConexion, la vista
  // 'contenido' dibuja el SectionList con su RefreshControl (ver `vista`,
  // más abajo) — antes `refrescar` cortaba con un `if (!userId) return` sin
  // prender `refrescando` ni hacer nada, así que tirar para refrescar no
  // tenía ningún efecto visible. Ahora, en ese caso puntual, vuelve a LEER
  // LA CACHÉ (no prueba la red: no hay sesión con la que pedirle nada al
  // servidor). La sesión se recupera sola cuando el refresco automático del
  // token de Supabase (`startAutoRefresh`, cableado al `AppState` en
  // `lib/supabase.ts`) lo logra, y recién ahí, al cambiar `userId`, esta
  // pantalla vuelve a pedir por red (vía `cargar`, en el próximo foco) y el
  // aviso de `AvisoSinConexion` desaparece. Sin sinConexion (vista
  // 'invitar', sin RefreshControl) sigue sin hacer nada, como antes.
  //
  // A6: es también el "Reintentar" del aviso y de la vista sin sesión por
  // falta de red. Sin sesión, PRIMERO vuelve a probar la sesión
  // (`reintentarSesion`): si volvió, sale — cambia `userId` y el
  // `useFocusEffect` de abajo carga por red solo —; si no, recién ahí espera
  // `esperarBorradoDeCache()` y relee la copia. Ese orden es la garantía de
  // `lib/sin-conexion/favoritos.ts` (los dos llamadores de la lectura
  // esperan el borrado justo antes): si el token fue revocado,
  // `reintentarSesion` dispara un `SIGNED_OUT` que puede borrar la copia, y
  // la lectura no puede correr en paralelo con ese borrado. Solo con
  // `'sin-red'` se avisa "Probamos de nuevo y seguimos sin conexión." Con
  // sesión, `decidirRefresco` conserva lo que se veía (`estado`, por eso
  // está en las dependencias) si el refresco falla, y descarta la respuesta
  // si mientras tanto cambió la sesión (`cargaVigenteRef`).
  const refrescar = useCallback(async () => {
    if (!userId) {
      if (!sinConexion) return
      setRefrescando(true)
      const estaCarga = ++cargaVigenteRef.current
      try {
        const resultadoSesion = await reintentarSesion()
        const avisoSesion = avisoReintentoSesion(resultadoSesion)
        if (resultadoSesion === 'volvio') {
          setNotaRefresco(null)
          if (avisoSesion.anuncio) anunciar(avisoSesion.anuncio)
          return
        }
        await esperarBorradoDeCache()
        const cache = await leerFavoritosGuardados()
        if (cargaVigenteRef.current !== estaCarga) return
        const nuevo: EstadoLista = cache
          ? {
              tipo: 'ok',
              voy: cache.voy,
              eventos: cache.eventos,
              desdeCache: { guardadoEn: cache.guardadoEn },
              seOcultaronPasados: cache.seOcultaronPasados,
            }
          : { tipo: 'invitar' }
        const decision = decidirRefresco(estado, nuevo, notaRefresco)
        setEstado(decision.estado)
        // Sin copia (vista sin sesión): la nota es la del reintento de la sesión.
        const nota = decision.nota ?? (cache ? null : avisoSesion.nota)
        setNotaRefresco(nota)
        const anuncio = decision.anuncio ?? (cache ? null : avisoSesion.anuncio)
        if (anuncio) anunciar(anuncio)
      } finally {
        // Si `leerFavoritosGuardados` tirara, el spinner no puede quedar
        // girando (misma familia de bloqueante que R41/R42).
        setRefrescando(false)
      }
      return
    }
    setRefrescando(true)
    const estaCarga = ++cargaVigenteRef.current
    await esperarBorradoDeCache()
    const resultado = await cargarFavoritosConCache(userId)
    if (cargaVigenteRef.current !== estaCarga) {
      setRefrescando(false)
      return
    }
    const decision = decidirRefresco<EstadoLista>(
      estado,
      resultado.tipo === 'ok'
        ? {
            tipo: 'ok',
            voy: resultado.voy,
            eventos: resultado.eventos,
            desdeCache: resultado.desdeCache,
            seOcultaronPasados: resultado.seOcultaronPasados,
          }
        : { tipo: 'error', error: mensajeErrorCarga('favoritos', resultado), sinConexion: resultado.sinConexion },
      notaRefresco,
    )
    setEstado(decision.estado)
    setNotaRefresco(decision.nota)
    if (decision.anuncio) anunciar(decision.anuncio)
    setRefrescando(false)
  }, [userId, sinConexion, estado, notaRefresco])

  useFocusEffect(
    useCallback(() => {
      if (cargandoSesion) return
      // A6: cambió la sesión (o volvió el foco): lo que estaba en vuelo ya no vale.
      const estaCarga = ++cargaVigenteRef.current

      if (userId) {
        cargar()
        return
      }

      // Sin sesión: solo se intenta la caché con `sinConexion` (el token
      // venció y no hay red para refrescarlo, 43-d) — con red disponible
      // nunca se lee la caché de favoritos (punto 2 del encargo de 43-c).
      if (!sinConexion) {
        setEstado({ tipo: 'invitar' })
        return
      }

      // Mismo arranque que `cargar` (trampa 6): "cargando" antes de leer la
      // caché, para no mostrar un parpadeo de "Entrá…" mientras se lee.
      setEstado({ tipo: 'cargando' })
      void (async () => {
        await esperarBorradoDeCache()
        const cache = await leerFavoritosGuardados()
        if (cargaVigenteRef.current !== estaCarga) return
        setEstado(
          cache
            ? {
                tipo: 'ok',
                voy: cache.voy,
                eventos: cache.eventos,
                desdeCache: { guardadoEn: cache.guardadoEn },
                seOcultaronPasados: cache.seOcultaronPasados,
              }
            : { tipo: 'invitar' },
        )
      })()
    }, [cargandoSesion, userId, sinConexion, cargar]),
  )

  // "Voy" primero (en el orden que ya trae core), después "Guardados": las
  // dos listas ya vienen separadas sin repetidos (separarMisEventos, core).
  const secciones = useMemo(() => {
    if (estado.tipo !== 'ok') return []
    const voy = seccionVoy(estado.voy)
    const guardados = agruparFavoritosParaSecciones(estado.eventos)
    return voy ? [voy, ...guardados] : guardados
  }, [estado])

  const compartirPorWhatsApp = useCallback(async () => {
    if (estado.tipo !== 'ok') return
    // Las dos listas juntas, sin repetir (ya vienen sin repetidos de core):
    // el mensaje incluye tanto lo que Voy como lo Guardado.
    const mensaje = armarMensajeWhatsApp([...estado.voy, ...estado.eventos])
    try {
      await Share.share({ message: mensaje })
    } catch {
      // El usuario canceló el share: no es un error que mostrar.
    }
  }, [estado])

  // R43, 43-c: qué pantalla mostrar ya no es "si hay userId" a secas (eso
  // nunca dejaba ver la caché sin sesión) — `decidirVistaFavoritos` (arriba,
  // pura) mira también `sinConexion` y el `estado` que dejó la lectura de la
  // caché.
  const vista = decidirVistaFavoritos({ cargandoSesion, hayUsuario: userId !== null, sinConexion, estado })

  if (vista === 'cargando-sesion') {
    return (
      <View style={[estilos.centrado, { backgroundColor: colors.background, flex: 1 }]}>
        <Cargando />
      </View>
    )
  }

  if (vista === 'invitar' && sinConexion) {
    // A6: sin sesión porque no se pudo confirmar por falta de red, y sin nada
    // guardado: "Entrá…"/"Ingresar" mentía (la persona puede tener sesión).
    // Texto propio + "Reintentar" (`refrescar`, que vuelve a probar la
    // sesión) + la nota del último intento.
    return (
      <View style={[estilos.centrado, { backgroundColor: colors.background, flex: 1 }]}>
        <Image source={LOGO_MARCA} style={estilos.logoVacio} resizeMode="contain" />
        <Texto tono="secundario" style={estilos.mensajeVacio}>
          {SIN_CONEXION_POR_PANTALLA.favoritos}
        </Texto>
        <BotonReintentar onReintentar={refrescar} reintentando={refrescando} />
        {notaRefresco ? (
          <Texto tono="secundario" style={estilos.mensajeVacio}>
            {notaRefresco}
          </Texto>
        ) : null}
      </View>
    )
  }

  if (vista === 'invitar') {
    // Sin sesión y sin caché que mostrar (o con red, nunca se la lee):
    // pantalla de siempre, sin RefreshControl (28-c: no hay nada propio que
    // refrescar). Estado de la web (§3.10, "Vacíos"): logo al 30%, texto y
    // "Ingresar" (el mismo texto y destino que el botón de
    // components/Encabezado.tsx, copiado ahí de apps/web/components/navbar.tsx).
    return (
      <View style={[estilos.centrado, { backgroundColor: colors.background, flex: 1 }]}>
        <Image source={LOGO_MARCA} style={estilos.logoVacio} resizeMode="contain" />
        <Texto tono="secundario" style={estilos.mensajeVacio}>
          Entrá para guardar tus favoritos
        </Texto>
        <Pressable
          onPress={() => router.push('/cuenta')}
          accessibilityRole="button"
          accessibilityLabel="Ingresar"
          style={[estilos.botonIngresar, { backgroundColor: colores.primary }]}
        >
          <Icono nombre="LogIn" color={colores.primaryForeground} tamanio={18} />
          <Texto peso="semibold" style={{ color: colores.primaryForeground }}>
            Ingresar
          </Texto>
        </Pressable>
      </View>
    )
  }

  // El total cuenta las dos listas (Voy + Guardados): nunca se repiten entre
  // ellas (core ya las separó sin solaparse).
  const totalFavoritos = estado.tipo === 'ok' ? estado.voy.length + estado.eventos.length : 0

  return (
    <View style={[estilos.contenedor, { backgroundColor: colors.background }]}>
      {/* Ronda 41, 41-e: el aviso para activar push, arriba de la lista.
          Solo llega acá con sesión (la rama sin userId ya retornó antes);
          no agrega ninguna lectura ni toca useFocusEffect/cargar. Sin
          wrapper con padding propio: `AvisoActivarPush` devuelve `null` en
          casi todos los estados, y un `View` con padding alrededor dejaría
          un hueco vacío aunque no haya nada que mostrar. */}
      <AvisoActivarPush variante="favoritos" />

      {estado.tipo === 'cargando' ? <Cargando /> : null}

      {estado.tipo === 'error' ? <ErrorCarga mensaje={estado.error} onReintentar={cargar} /> : null}

      {estado.tipo === 'ok' ? (
        <SectionList
          sections={secciones}
          keyExtractor={claveDeFila}
          initialNumToRender={VENTANA_FAVORITOS.initialNumToRender}
          maxToRenderPerBatch={VENTANA_FAVORITOS.maxToRenderPerBatch}
          windowSize={VENTANA_FAVORITOS.windowSize}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl refreshing={refrescando} onRefresh={refrescar} tintColor={colors.primary} colors={[colors.primary]} />
          }
          contentContainerStyle={estilos.lista}
          ListHeaderComponent={
            <>
              {/* R43, 43-c: arriba del encabezado "Mis eventos" y
                  también con la lista vacía (`totalFavoritos === 0`) — por
                  eso va afuera del `totalFavoritos > 0` de abajo. */}
              {estado.tipo === 'ok' && estado.desdeCache ? (
                <AvisoSinConexion
                  guardadoEn={estado.desdeCache.guardadoEn}
                  detalle={detalleAvisoFavoritos(estado.seOcultaronPasados === true)}
                  onReintentar={refrescar}
                  reintentando={refrescando}
                  nota={notaRefresco}
                />
              ) : null}
              {/* A6: un refresco que falló con una carga fresca a la vista:
                  se conserva y se avisa. */}
              {estado.tipo === 'ok' && estado.desdeCache === null && notaRefresco ? (
                <AvisoNoSeActualizo texto={notaRefresco} onReintentar={refrescar} reintentando={refrescando} />
              ) : null}
              {totalFavoritos > 0 ? (
                <View style={[estilos.encabezado, { borderBottomColor: colors.border }]}>
                  <Texto peso="bold" accessibilityRole="header" style={estilos.titulo}>
                    Mis eventos
                  </Texto>
                  <Texto tono="secundario" style={estilos.subtitulo}>
                    Tenés {totalFavoritos} {totalFavoritos === 1 ? 'elemento guardado' : 'elementos guardados'} organizados
                    para tu salida.
                  </Texto>
                  <Pressable
                    onPress={compartirPorWhatsApp}
                    accessibilityRole="button"
                    accessibilityLabel="Compartir agenda por WhatsApp"
                    style={estilos.botonWhatsApp}
                  >
                    <Icono nombre="Share2" tamanio={18} color="#fff" />
                    <Texto peso="semibold" style={estilos.textoBotonWhatsApp}>
                      Compartir agenda por WhatsApp
                    </Texto>
                  </Pressable>
                </View>
              ) : null}
            </>
          }
          renderSectionHeader={({ section }) => (
            <View style={estilos.encabezadoSeccion}>
              <View
                style={[
                  estilos.lineaSeccion,
                  { backgroundColor: section.esFlexible ? colores.border : `${colores.primary}33` },
                ]}
              />
              {section.esFlexible ? (
                <Texto peso="bold" tono="secundario" style={estilos.tituloSeccionFlexible}>
                  {section.titulo}
                </Texto>
              ) : (
                <View
                  style={[
                    estilos.pildoraSeccion,
                    { backgroundColor: `${colores.primary}0D`, borderColor: `${colores.primary}1A` },
                  ]}
                >
                  {/* Ronda 49 (QPS-241, grupo 2): `primary` da 3,83 sobre
                      `background` como texto chico, abajo de 4,5 — el título
                      pasa a `foreground` (tono por defecto de `Texto`, sin
                      estilo de color propio). El fondo/borde de la píldora
                      (arriba) sigue en `primary`: ahí es un componente
                      decorativo, no texto. */}
                  <Texto peso="bold" style={estilos.tituloSeccionDia}>
                    {section.titulo}
                  </Texto>
                </View>
              )}
              <View
                style={[
                  estilos.lineaSeccion,
                  { backgroundColor: section.esFlexible ? colores.border : `${colores.primary}33` },
                ]}
              />
            </View>
          )}
          renderItem={dibujarFila}
          // A6: porqué + acción (rellena: es la única salida). Mostrando la
          // copia sin conexión, `VACIO_FAVORITOS_SIN_CONEXION` (sin hablar de
          // los pasados: eso va solo en el aviso, y solo si se sacaron); con
          // red, el literal de siempre con "Mis eventos" (lo fija
          // tests/favoritos-pantalla.test.ts; espejo en `VACIO_FAVORITOS`).
          ListEmptyComponent={
            estado.tipo === 'ok' && estado.desdeCache ? (
              <Vacio
                mensaje={VACIO_FAVORITOS_SIN_CONEXION.mensaje}
                textoAccion={VACIO_FAVORITOS_SIN_CONEXION.textoAccion}
                onAccion={() => router.push('/')}
                accionPrincipal
              />
            ) : (
              <Vacio
                mensaje="Todavía no guardaste ningún evento en Mis eventos. Tocá el corazón o “Voy” en un evento y aparece acá."
                textoAccion="Ver la agenda"
                onAccion={() => router.push('/')}
                accionPrincipal
              />
            )
          }
        />
      ) : null}
    </View>
  )
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1 },
  centrado: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  logoVacio: { width: 72, height: 72, opacity: 0.3, marginBottom: 4 },
  mensajeVacio: { textAlign: 'center' },
  // minWidth 115, como "Ingresar" en navbar.tsx/components/Encabezado.tsx.
  botonIngresar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minWidth: 115,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 4,
  },
  lista: { paddingHorizontal: 16, paddingBottom: 16 },
  encabezado: { gap: 10, paddingTop: 16, paddingBottom: 20, borderBottomWidth: StyleSheet.hairlineWidth },
  titulo: { fontSize: 24 },
  subtitulo: { fontSize: 13 },
  // bg-emerald-600 de la web: color fijo (no es un token de ColoresQPS),
  // igual que el verde de "gratis" en components/TarjetaEvento.tsx.
  // 46-d: el contraste (3,77) quedó como excepción documentada en
  // tests/contraste.test.ts (decisión de Mauro) — acá solo se sumó
  // `minHeight: 48` (paddingVertical 12 + el ícono/texto de adentro daban
  // ~42dp de alto real, por debajo del mínimo táctil).
  // Ronda 49 (QPS-241, grupo 3, decisión de Mauro): pasa a `#047857`, que da
  // ≈5,48 con blanco (`contraste`, en tests/contraste.test.ts), arriba de 4,5
  // — la excepción de 46-d se saca. Ojo con la paridad: el botón equivalente
  // de la web sigue en `bg-emerald-600`
  // (`apps/web/app/favoritos/favoritos-list.tsx`), así que a partir de acá los
  // dos verdes DIFIEREN a propósito: la decisión de QPS-241 alcanza solo a la
  // app, y los textos y estilos de la web quedaron fuera de esta ronda. Si
  // algún día se quiere la paridad, el cambio es del lado de la web.
  // Después de este cambio `#059669` no queda en ningún otro lugar del código
  // de producción de la app (verificado con Grep sobre app/, components/ y
  // lib/); lo que aparece en `tests/colores-texto.test.ts` es una fixture.
  botonWhatsApp: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#047857',
    paddingHorizontal: 20,
    paddingVertical: 12,
    minHeight: 48,
    borderRadius: 12,
    marginTop: 4,
  },
  textoBotonWhatsApp: { color: '#fff', fontSize: 14 },
  encabezadoSeccion: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  lineaSeccion: { flex: 1, height: 1 },
  tituloSeccionFlexible: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  pildoraSeccion: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  tituloSeccionDia: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  filaGrilla: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  // Ver el comentario del mismo nombre en app/(tabs)/index.tsx: evita que la
  // última celda de un número impar de eventos se estire a todo el ancho.
  celda: { flex: 1, maxWidth: '50%' },
})
