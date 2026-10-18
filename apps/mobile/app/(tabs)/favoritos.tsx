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
import { useCallback, useMemo, useState } from 'react'
import { Image, Pressable, RefreshControl, SectionList, Share, StyleSheet, View } from 'react-native'
import { useFocusEffect, useRouter, useTheme } from 'expo-router'
import { capitalizeFirst } from '@qps/core/event-display'
import { formatEventDate } from '@qps/core/date-format'
import { armarMensajeWhatsApp } from '@qps/core/favoritos/armar'
import type { DisplayEvent } from '@qps/core/home/types'
import LOGO_MARCA from '@/assets/logo-circular.png'
import { Cargando, ErrorCarga, Vacio } from '@/components/EstadoCarga'
import { Icono } from '@/components/Icono'
import { TarjetaEvento } from '@/components/TarjetaEvento'
import { Texto } from '@/components/Texto'
import { useColoresQPS } from '@/lib/colores'
import { obtenerFavoritos, rutaDeFavorito } from '@/lib/favoritos'
import { useSession } from '@/lib/session'

type EstadoLista =
  | { tipo: 'cargando' }
  | { tipo: 'error'; error: string }
  | { tipo: 'ok'; voy: DisplayEvent[]; eventos: DisplayEvent[] }

interface SeccionFavoritos {
  key: string
  titulo: string
  esFlexible: boolean
  data: DisplayEvent[][]
}

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

export default function Favoritos() {
  const { colors } = useTheme()
  const colores = useColoresQPS()
  const router = useRouter()
  const { session, cargando: cargandoSesion } = useSession()
  const userId = session?.user.id ?? null

  const [estado, setEstado] = useState<EstadoLista>({ tipo: 'cargando' })
  // Estado de refresco aparte del de carga (28-c): mientras se refresca, la
  // grilla sigue a la vista en vez de pasar a `Cargando`.
  const [refrescando, setRefrescando] = useState(false)

  const cargar = useCallback(async () => {
    if (!userId) return
    setEstado({ tipo: 'cargando' })
    const resultado = await obtenerFavoritos(userId)
    setEstado(
      resultado.ok
        ? { tipo: 'ok', voy: resultado.voy, eventos: resultado.eventos }
        : { tipo: 'error', error: resultado.error },
    )
  }, [userId])

  const refrescar = useCallback(async () => {
    if (!userId) return
    setRefrescando(true)
    const resultado = await obtenerFavoritos(userId)
    setEstado(
      resultado.ok
        ? { tipo: 'ok', voy: resultado.voy, eventos: resultado.eventos }
        : { tipo: 'error', error: resultado.error },
    )
    setRefrescando(false)
  }, [userId])

  useFocusEffect(
    useCallback(() => {
      if (cargandoSesion) return
      cargar()
    }, [cargandoSesion, cargar]),
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

  if (cargandoSesion) {
    return (
      <View style={[estilos.centrado, { backgroundColor: colors.background, flex: 1 }]}>
        <Cargando />
      </View>
    )
  }

  if (!userId) {
    // Sin sesión no hay nada propio que refrescar (28-c): esta rama no lleva
    // RefreshControl. Estado de la web (§3.10, "Vacíos"): logo al 30%, texto
    // y "Ingresar" (el mismo texto y destino que el botón de
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
      {estado.tipo === 'cargando' ? <Cargando /> : null}

      {estado.tipo === 'error' ? <ErrorCarga mensaje={estado.error} onReintentar={cargar} /> : null}

      {estado.tipo === 'ok' ? (
        <SectionList
          sections={secciones}
          keyExtractor={(fila, index) => (fila.length > 0 ? fila.map((item) => item.id).join('-') : `fila-${index}`)}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl refreshing={refrescando} onRefresh={refrescar} tintColor={colors.primary} colors={[colors.primary]} />
          }
          contentContainerStyle={estilos.lista}
          ListHeaderComponent={
            totalFavoritos > 0 ? (
              <View style={[estilos.encabezado, { borderBottomColor: colors.border }]}>
                <Texto peso="bold" style={estilos.titulo}>
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
            ) : null
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
                  <Texto peso="bold" style={[estilos.tituloSeccionDia, { color: colores.primary }]}>
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
          renderItem={({ item: fila }) => (
            <View style={estilos.filaGrilla}>
              {fila.map((item) => (
                <View key={item.id} style={estilos.celda}>
                  {item.isCinemaMovie || item.isInstagramFlyer ? (
                    // `TarjetaEvento` siempre navega a `/evento/<id>` (es la
                    // tarjeta de Inicio/Buscar, donde todo es un evento real):
                    // para una película o un flyer, un `Pressable` transparente
                    // por encima intercepta el toque y lleva a la ruta correcta
                    // (`/pelicula/<id>` o `/flyer/<id>`), sin tocar
                    // components/TarjetaEvento.tsx (R29-b, en paralelo).
                    <View style={estilos.celdaConToqueDistinto}>
                      <TarjetaEvento evento={item} />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={item.title}
                        onPress={() => router.push(rutaDeFavorito(item))}
                        style={StyleSheet.absoluteFill}
                      />
                    </View>
                  ) : (
                    <TarjetaEvento evento={item} />
                  )}
                </View>
              ))}
              {fila.length === 1 ? <View style={estilos.celda} /> : null}
            </View>
          )}
          ListEmptyComponent={<Vacio mensaje="Todavía no tenés nada en Mis eventos" />}
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
  botonWhatsApp: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#059669',
    paddingHorizontal: 20,
    paddingVertical: 12,
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
  celdaConToqueDistinto: { flex: 1, position: 'relative' },
})
