// Ronda 29, tarea 29-d: pantalla propia del Radar (§3.6 de
// `ops/paridad-web-app.md`, F10 a F12), con paridad contra
// `apps/web/app/radar/page.tsx` + `apps/web/components/radar-form.tsx`. Las
// 3 cards de la web ("Frecuencia y Destinatario", "Categorías que te
// interesan" y "Lugares y Organizadores Preferidos"), el buscador unificado
// y las categorías en grilla de 2 con check — sin plegables ni "ver todos".
//
// El email es de solo lectura y sale de `useSession()` (nunca se manda
// `email_target`: lo pone la base, como en la web). El guardado sigue
// siendo `lib/radar.ts` (27-c), sin cambios: esta pantalla solo cambia cómo
// se ve y se edita.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import type { EmailFrequency } from '@qps/core/radar/preferencias'
import { CampoTexto } from '@/components/CampoTexto'
import { Cargando, ErrorCarga } from '@/components/EstadoCarga'
import { Icono } from '@/components/Icono'
import { Texto } from '@/components/Texto'
import { hitSlopPara } from '@/lib/accesibilidad'
import { useColoresQPS } from '@/lib/colores'
import { esAdminRadar, guardarRadar, obtenerRadar, probarEnvioRadar, type OpcionesRadar } from '@/lib/radar'
import {
  buscarSeguibles,
  hayCambios,
  resumenRadar,
  type EstadoRadarComparable,
  type Seguible,
} from '@/lib/radar-vista'
import { useSession } from '@/lib/session'

// Mismos colores que la web para los badges/chips (Tailwind emerald-400 y
// pink-400): no son tokens de `useColoresQPS()`, son decorativos y fijos,
// como el rojo del error en `CampoTexto.tsx`.
const COLOR_ESMERALDA = '#34d399'
const COLOR_ROSA = '#f472b6'

const OPCIONES_FRECUENCIA: { valor: EmailFrequency; etiqueta: string }[] = [
  { valor: 'weekly', etiqueta: 'Semanalmente (Todos los Jueves 18:00hs)' },
  { valor: 'biweekly', etiqueta: 'Cada 2 semanas (Quincenal)' },
  { valor: 'monthly', etiqueta: 'Mensualmente' },
  { valor: 'disabled', etiqueta: 'Desactivado (Pausar alertas)' },
]

interface EstadoOk {
  tipo: 'ok'
  opciones: OpcionesRadar
  original: EstadoRadarComparable
  frecuencia: EmailFrequency
  categoryIds: Set<string>
  venueIds: Set<string>
  instagramAccountIds: Set<string>
}

type Estado = { tipo: 'cargando' } | { tipo: 'error'; error: string } | EstadoOk

function alternarEnConjunto(conjunto: Set<string>, id: string): Set<string> {
  const nuevo = new Set(conjunto)
  if (nuevo.has(id)) nuevo.delete(id)
  else nuevo.add(id)
  return nuevo
}

export function PantallaRadar() {
  const colores = useColoresQPS()
  const router = useRouter()
  const { session, cargando: cargandoSesion } = useSession()
  const userId = session?.user.id ?? null
  const email = session?.user.email ?? ''

  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string; detalle?: string } | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [buscadorAbierto, setBuscadorAbierto] = useState(false)
  // G3 (R36, 36-c): "Enviar un email de prueba" solo para ADMIN. Ocultarlo
  // es solo comodidad — el que decide de verdad es el servidor, en
  // `POST /api/radar/prueba` (`esAdminRadar` lee `profiles.role` con RLS).
  const [esAdmin, setEsAdmin] = useState(false)
  const [enviandoPrueba, setEnviandoPrueba] = useState(false)
  // Cuenta de "reintentos" (mismo patrón que `app/pelicula/[id].tsx`, 28-l):
  // el efecto de carga no puede llamar, de forma sincrónica, a una función
  // que haga `setState` (lint react-hooks/set-state-in-effect). El fetch va
  // inline en el efecto de más abajo, con `.then()` (el `setState` queda
  // recién en el callback de la promesa, no en el cuerpo sincrónico del
  // efecto); "Reintentar" solo sube este contador para que el efecto se
  // repita.
  const [intento, setIntento] = useState(0)

  // Ícono `Radio` pulsante del encabezado (web: `className="animate-pulse"`
  // en los dos lugares que lo usa). Un único `Animated.Value` compartido:
  // no hace falta uno por card. `useState` con inicializador perezoso (no
  // `useRef(...).current`) para no leer un ref durante el render.
  const [pulso] = useState(() => new Animated.Value(1))
  useEffect(() => {
    const animacion = Animated.loop(
      Animated.sequence([
        Animated.timing(pulso, { toValue: 1.15, duration: 700, useNativeDriver: true }),
        Animated.timing(pulso, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    )
    animacion.start()
    return () => animacion.stop()
  }, [pulso])

  // Si `userId` cambia con la pantalla ya montada (por ejemplo, cerrar
  // sesión y entrar con otra cuenta sin desmontar), hay que volver a
  // "cargando" antes de que el efecto de abajo dispare el fetch nuevo — si
  // no, se ven los datos del Radar de la cuenta anterior hasta que resuelve.
  // El ajuste va durante el render, no dentro de un efecto (comparar-y-
  // ajustar con `useState`, no con `useRef`: leer o escribir `ref.current`
  // durante el render dispara el lint `react-hooks/refs`) — mismo patrón que
  // `app/pelicula/[id].tsx` con `idAnterior`.
  const [userIdAnterior, setUserIdAnterior] = useState(userId)
  if (userIdAnterior !== userId) {
    setUserIdAnterior(userId)
    setEstado({ tipo: 'cargando' })
    setEsAdmin(false)
  }

  // Rol de `userId` (solo para el botón de prueba): mismo patrón de arriba,
  // `setEsAdmin` solo dentro del `.then()`, nunca de forma sincrónica en el
  // cuerpo del efecto.
  useEffect(() => {
    if (cargandoSesion || !userId) return
    let cancelado = false

    esAdminRadar(userId).then((valor) => {
      if (!cancelado) setEsAdmin(valor)
    })

    return () => {
      cancelado = true
    }
  }, [cargandoSesion, userId])

  useEffect(() => {
    if (cargandoSesion || !userId) return
    let cancelado = false

    obtenerRadar(userId).then((resultado) => {
      if (cancelado) return
      if (!resultado.ok) {
        setEstado({ tipo: 'error', error: resultado.error })
        return
      }
      const original: EstadoRadarComparable = {
        email_frequency: resultado.preferencias.email_frequency,
        categoryIds: resultado.preferencias.categoryIds,
        venueIds: resultado.preferencias.venueIds,
        instagramAccountIds: resultado.preferencias.instagramAccountIds,
      }
      setEstado({
        tipo: 'ok',
        opciones: resultado.opciones,
        original,
        frecuencia: resultado.preferencias.email_frequency,
        categoryIds: new Set(resultado.preferencias.categoryIds),
        venueIds: new Set(resultado.preferencias.venueIds),
        instagramAccountIds: new Set(resultado.preferencias.instagramAccountIds),
      })
    })

    return () => {
      cancelado = true
    }
  }, [cargandoSesion, userId, intento])

  const cargar = useCallback(() => {
    setEstado({ tipo: 'cargando' })
    setIntento((valor) => valor + 1)
  }, [])

  function actualizarOk(cambio: (previo: EstadoOk) => EstadoOk) {
    setEstado((previo) => (previo.tipo === 'ok' ? cambio(previo) : previo))
  }

  // Hooks siempre llamados, aunque `estado` todavía no esté en `'ok'`
  // (listas vacías mientras tanto): evita condicionar `useMemo`.
  const opcionesActuales = estado.tipo === 'ok' ? estado.opciones : null
  const venueIdsActuales = estado.tipo === 'ok' ? estado.venueIds : null
  const instagramIdsActuales = estado.tipo === 'ok' ? estado.instagramAccountIds : null

  const lugaresDisponibles = useMemo(
    () => (opcionesActuales && venueIdsActuales ? opcionesActuales.lugares.filter((l) => !venueIdsActuales.has(l.id)) : []),
    [opcionesActuales, venueIdsActuales],
  )
  const cuentasDisponibles = useMemo(
    () =>
      opcionesActuales && instagramIdsActuales
        ? opcionesActuales.cuentasInstagram.filter((c) => !instagramIdsActuales.has(c.id))
        : [],
    [opcionesActuales, instagramIdsActuales],
  )
  const sugerencias = useMemo(
    () => buscarSeguibles(lugaresDisponibles, cuentasDisponibles, busqueda),
    [lugaresDisponibles, cuentasDisponibles, busqueda],
  )
  const lugaresSeleccionados = useMemo(
    () => (opcionesActuales && venueIdsActuales ? opcionesActuales.lugares.filter((l) => venueIdsActuales.has(l.id)) : []),
    [opcionesActuales, venueIdsActuales],
  )
  const cuentasSeleccionadas = useMemo(
    () =>
      opcionesActuales && instagramIdsActuales
        ? opcionesActuales.cuentasInstagram.filter((c) => instagramIdsActuales.has(c.id))
        : [],
    [opcionesActuales, instagramIdsActuales],
  )

  function elegirSeguible(item: Seguible) {
    actualizarOk((previo) => {
      if (item.tipo === 'lugar') {
        const nuevo = new Set(previo.venueIds)
        nuevo.add(item.id)
        return { ...previo, venueIds: nuevo }
      }
      const nuevo = new Set(previo.instagramAccountIds)
      nuevo.add(item.id)
      return { ...previo, instagramAccountIds: nuevo }
    })
    setBusqueda('')
    setBuscadorAbierto(false)
  }

  function quitarLugar(id: string) {
    actualizarOk((previo) => {
      const nuevo = new Set(previo.venueIds)
      nuevo.delete(id)
      return { ...previo, venueIds: nuevo }
    })
  }

  function quitarCuenta(id: string) {
    actualizarOk((previo) => {
      const nuevo = new Set(previo.instagramAccountIds)
      nuevo.delete(id)
      return { ...previo, instagramAccountIds: nuevo }
    })
  }

  async function guardar() {
    if (!userId || estado.tipo !== 'ok' || guardando) return
    const datos: EstadoRadarComparable = {
      email_frequency: estado.frecuencia,
      categoryIds: Array.from(estado.categoryIds),
      venueIds: Array.from(estado.venueIds),
      instagramAccountIds: Array.from(estado.instagramAccountIds),
    }
    setGuardando(true)
    setMensaje(null)
    const resultado = await guardarRadar(userId, datos)
    if (resultado.ok) {
      setMensaje({
        tipo: 'ok',
        texto: '¡Ya estás en el Radar! 📧',
        detalle: 'Vas a recibir los mejores eventos en tu correo.',
      })
      actualizarOk((previo) => ({ ...previo, original: datos }))
    } else {
      setMensaje({ tipo: 'error', texto: 'Error al guardar', detalle: resultado.error })
    }
    setGuardando(false)
  }

  async function enviarPrueba() {
    const token = session?.access_token
    if (!token || enviandoPrueba) return
    setEnviandoPrueba(true)
    setMensaje(null)
    const resultado = await probarEnvioRadar(token)
    if (resultado.ok) {
      setMensaje({ tipo: 'ok', texto: 'Prueba enviada', detalle: resultado.mensaje })
    } else {
      setMensaje({ tipo: 'error', texto: 'No se pudo enviar la prueba', detalle: resultado.mensaje })
    }
    setEnviandoPrueba(false)
  }

  const cambiosSinGuardar =
    estado.tipo === 'ok' &&
    hayCambios(estado.original, {
      email_frequency: estado.frecuencia,
      categoryIds: Array.from(estado.categoryIds),
      venueIds: Array.from(estado.venueIds),
      instagramAccountIds: Array.from(estado.instagramAccountIds),
    })

  let cuerpo: React.ReactNode
  if (cargandoSesion) {
    cuerpo = <Cargando />
  } else if (!userId) {
    cuerpo = (
      <Pressable
        onPress={() => router.push('/cuenta')}
        accessibilityRole="button"
        style={[estilos.botonPrimario, { backgroundColor: colores.primary }]}
      >
        <Texto peso="bold" style={{ color: colores.primaryForeground }}>
          Ingresar para armar tu Radar
        </Texto>
      </Pressable>
    )
  } else if (estado.tipo === 'cargando') {
    cuerpo = <Cargando />
  } else if (estado.tipo === 'error') {
    cuerpo = <ErrorCarga mensaje={estado.error} onReintentar={cargar} />
  } else {
    const { opciones, frecuencia, categoryIds } = estado
    cuerpo = (
      <>
        <Texto tono="secundario" style={estilos.resumen}>
          {resumenRadar(frecuencia, email)}
        </Texto>

        {/* Card 1: Frecuencia y Destinatario */}
        <View style={[estilos.card, { backgroundColor: colores.card, borderColor: colores.border }]}>
          <Texto peso="bold" accessibilityRole="header" style={estilos.tituloCard}>
            Frecuencia y Destinatario
          </Texto>

          <Texto peso="semibold" style={estilos.etiquetaCampo}>
            ¿Cada cuánto quieres recibir novedades?
          </Texto>
          <View style={estilos.listaFrecuencias}>
            {OPCIONES_FRECUENCIA.map((opcion) => {
              const seleccionada = frecuencia === opcion.valor
              return (
                <Pressable
                  key={opcion.valor}
                  onPress={() => actualizarOk((previo) => ({ ...previo, frecuencia: opcion.valor }))}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: seleccionada }}
                  style={[
                    estilos.filaFrecuencia,
                    { borderColor: seleccionada ? colores.primary : colores.border },
                    seleccionada && { backgroundColor: `${colores.primary}1A` },
                  ]}
                >
                  <Texto style={estilos.textoFrecuencia}>{opcion.etiqueta}</Texto>
                  {seleccionada ? <Icono nombre="Check" tamanio={18} color={colores.primary} /> : null}
                </Pressable>
              )
            })}
          </View>

          <Texto peso="semibold" style={estilos.etiquetaCampo}>
            Dirección de correo electrónico
          </Texto>
          <View style={[estilos.cajaEmail, { backgroundColor: colores.background, borderColor: colores.border }]}>
            <Texto style={{ color: colores.foreground }}>{email}</Texto>
          </View>
          <Texto tono="secundario" style={estilos.textoChico}>
            Te lo mandamos al email de tu cuenta.
          </Texto>
        </View>

        {/* Card 2: Categorías */}
        <View style={[estilos.card, { backgroundColor: colores.card, borderColor: colores.border }]}>
          <View style={estilos.filaTitulo}>
            <Animated.View style={{ transform: [{ scale: pulso }] }}>
              <Icono nombre="Radio" tamanio={20} color={colores.primary} />
            </Animated.View>
            <Texto peso="bold" accessibilityRole="header" style={estilos.tituloCard}>
              Categorías que te interesan
            </Texto>
          </View>
          <Texto tono="secundario" style={estilos.textoChico}>
            Recibirás alertas de todos los eventos que se clasifiquen en las categorías seleccionadas.
          </Texto>

          <View style={estilos.grillaCategorias}>
            {opciones.categorias.map((categoria) => {
              const seleccionada = categoryIds.has(categoria.id)
              return (
                <Pressable
                  key={categoria.id}
                  onPress={() =>
                    actualizarOk((previo) => ({ ...previo, categoryIds: alternarEnConjunto(previo.categoryIds, categoria.id) }))
                  }
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: seleccionada }}
                  style={[
                    estilos.itemCategoria,
                    { borderColor: seleccionada ? colores.primary : colores.border },
                    seleccionada && { backgroundColor: `${colores.primary}1A` },
                  ]}
                >
                  <Texto peso="semibold" style={estilos.textoCategoria} numberOfLines={1}>
                    {categoria.name}
                  </Texto>
                  {seleccionada ? <Icono nombre="Check" tamanio={18} color={colores.primary} /> : null}
                </Pressable>
              )
            })}
          </View>
        </View>

        {/* Card 3: Lugares y Organizadores */}
        <View style={[estilos.card, { backgroundColor: colores.card, borderColor: colores.border }]}>
          <View style={estilos.filaTitulo}>
            <Icono nombre="Search" tamanio={20} color={colores.primary} />
            <Texto peso="bold" accessibilityRole="header" style={estilos.tituloCard}>
              Lugares y Organizadores Preferidos
            </Texto>
          </View>
          <Texto tono="secundario" style={estilos.textoChico}>
            Sigue locales físicos o directamente a organizadores/boliches de Instagram (ej: La Metro, Sex Us Machina)
            para enterarte de sus novedades.
          </Texto>

          <CampoTexto
            label="Buscar"
            placeholder="Busca locales físicos o cuentas de Instagram (ej: Usina, Metro, Sex Us...)"
            value={busqueda}
            onChangeText={(texto) => {
              setBusqueda(texto)
              setBuscadorAbierto(true)
            }}
            onFocus={() => setBuscadorAbierto(true)}
            autoCapitalize="none"
          />

          {buscadorAbierto && busqueda.trim() ? (
            sugerencias.length > 0 ? (
              <View style={[estilos.sugerencias, { borderColor: colores.border, backgroundColor: colores.background }]}>
                {sugerencias.map((item) => (
                  <Pressable
                    key={`${item.tipo}-${item.id}`}
                    onPress={() => elegirSeguible(item)}
                    accessibilityRole="button"
                    style={estilos.filaSugerencia}
                  >
                    <View style={estilos.textoSugerencia}>
                      <Texto peso="semibold" numberOfLines={1}>
                        {item.nombre}
                      </Texto>
                      {item.tipo === 'instagram' ? (
                        <Texto tono="secundario" style={estilos.textoChico}>
                          @{item.usuario}
                        </Texto>
                      ) : null}
                    </View>
                    <View
                      style={[
                        estilos.badge,
                        { borderColor: item.tipo === 'instagram' ? COLOR_ROSA : COLOR_ESMERALDA },
                      ]}
                    >
                      <Texto style={[estilos.textoBadge, { color: item.tipo === 'instagram' ? COLOR_ROSA : COLOR_ESMERALDA }]}>
                        {item.tipo === 'instagram' ? 'Instagram' : 'Lugar'}
                      </Texto>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Texto tono="secundario" style={estilos.sinCoincidencias}>
                No se encontraron coincidencias.
              </Texto>
            )
          ) : null}

          {lugaresSeleccionados.length > 0 || cuentasSeleccionadas.length > 0 ? (
            <View style={estilos.chips}>
              {lugaresSeleccionados.map((venue) => (
                <View key={venue.id} style={[estilos.chip, { borderColor: COLOR_ESMERALDA }]}>
                  <Icono nombre="MapPin" tamanio={14} color={COLOR_ESMERALDA} />
                  <Texto style={[estilos.textoChip, { color: COLOR_ESMERALDA }]}>{venue.name}</Texto>
                  <Pressable
                    onPress={() => quitarLugar(venue.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Dejar de seguir ${venue.name}`}
                    // 46-c: el "X" no tiene estilo propio, mide lo que mide el
                    // ícono (14×14) — el chip que lo envuelve (`estilos.chip`,
                    // minHeight: 36) es un View, no el Pressable, así que el
                    // detector estático no ve este caso (documentado en el
                    // reporte de la tarea). hitSlopPara(14) listo lo acerca a
                    // 48; no se verificó contra chips vecinos muy angostos
                    // (riesgo anotado para 46-q).
                    hitSlop={hitSlopPara(14)}
                  >
                    <Icono nombre="X" tamanio={14} color={COLOR_ESMERALDA} />
                  </Pressable>
                </View>
              ))}
              {cuentasSeleccionadas.map((cuenta) => (
                <View key={cuenta.id} style={[estilos.chip, { borderColor: COLOR_ROSA }]}>
                  <Texto style={[estilos.textoChip, { color: COLOR_ROSA }]}>@{cuenta.username}</Texto>
                  <Pressable
                    onPress={() => quitarCuenta(cuenta.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Dejar de seguir @${cuenta.username}`}
                    hitSlop={hitSlopPara(14)}
                  >
                    <Icono nombre="X" tamanio={14} color={COLOR_ROSA} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <Texto tono="secundario" style={estilos.textoChico}>
              No estás siguiendo ningún local ni cuenta de Instagram aún. Escribe arriba para buscarlos y agregarlos.
            </Texto>
          )}
        </View>

        {cambiosSinGuardar ? (
          <Texto tono="secundario" style={estilos.avisoCambios}>
            Tenés cambios sin guardar
          </Texto>
        ) : null}

        {mensaje ? (
          <View
            style={[
              estilos.aviso,
              { borderColor: mensaje.tipo === 'error' ? '#f87171' : colores.primary },
            ]}
          >
            <Texto peso="semibold">{mensaje.texto}</Texto>
            {mensaje.detalle ? (
              <Texto tono="secundario" style={estilos.textoChico}>
                {mensaje.detalle}
              </Texto>
            ) : null}
          </View>
        ) : null}

        {esAdmin ? (
          <Pressable
            onPress={enviarPrueba}
            disabled={enviandoPrueba}
            accessibilityRole="button"
            style={[estilos.botonSecundario, { borderColor: colores.border, opacity: enviandoPrueba ? 0.7 : 1 }]}
          >
            <Texto peso="bold" style={{ color: colores.foreground }}>
              {enviandoPrueba ? 'Enviando prueba...' : 'Enviar un email de prueba'}
            </Texto>
          </Pressable>
        ) : null}

        <Pressable
          onPress={guardar}
          disabled={guardando}
          accessibilityRole="button"
          style={[estilos.botonPrimario, { backgroundColor: colores.primary, opacity: guardando ? 0.7 : 1 }]}
        >
          <Texto peso="bold" style={{ color: colores.primaryForeground }}>
            {guardando ? 'Guardando...' : 'Guardar Preferencias de Radar'}
          </Texto>
        </Pressable>
      </>
    )
  }

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={[estilos.contenedor, { backgroundColor: colores.background }]}
      contentContainerStyle={estilos.contenido}
    >
      <View style={estilos.encabezado}>
        <View
          style={[
            estilos.circuloIcono,
            { backgroundColor: `${colores.primary}1A`, borderColor: `${colores.primary}33` },
          ]}
        >
          <Animated.View style={{ transform: [{ scale: pulso }] }}>
            <Icono nombre="Radio" tamanio={28} color={colores.primary} />
          </Animated.View>
        </View>
        <Texto peso="bold" accessibilityRole="header" style={estilos.tituloEncabezado}>
          Mi Radar Salteño
        </Texto>
        <Texto tono="secundario" style={estilos.subtituloEncabezado}>
          Tú decides qué eventos ver y recibir. Suscríbete a tus categorías, locales u organizadores favoritos de
          Instagram y recibe alertas a tu correo sin spam.
        </Texto>
      </View>

      {cuerpo}
    </ScrollView>
  )
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1 },
  contenido: { paddingHorizontal: 16, paddingBottom: 32, gap: 16 },
  encabezado: { alignItems: 'center', gap: 8, paddingVertical: 8 },
  circuloIcono: {
    width: 56,
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tituloEncabezado: { fontSize: 26, textAlign: 'center' },
  subtituloEncabezado: { fontSize: 13, textAlign: 'center', lineHeight: 18, maxWidth: 360 },
  resumen: { fontSize: 13, textAlign: 'center' },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
  filaTitulo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tituloCard: { fontSize: 17 },
  etiquetaCampo: { fontSize: 13 },
  textoChico: { fontSize: 12 },
  listaFrecuencias: { gap: 8 },
  // 46-c: 44 -> 48 (AREA_TACTIL_MINIMA de lib/accesibilidad.ts) en las tres
  // filas/ítems de abajo (filaFrecuencia, itemCategoria, filaSugerencia): son
  // filas completas con padding vertical 12-14, los 4dp de más no se notan.
  filaFrecuencia: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 48,
  },
  textoFrecuencia: { flex: 1, fontSize: 14 },
  cajaEmail: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, minHeight: 44, justifyContent: 'center' },
  grillaCategorias: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  itemCategoria: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    minHeight: 48,
  },
  textoCategoria: { flex: 1, fontSize: 14 },
  sugerencias: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  filaSugerencia: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 48,
  },
  textoSugerencia: { flex: 1 },
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  textoBadge: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  sinCoincidencias: { fontSize: 12, textAlign: 'center', paddingVertical: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 36,
  },
  textoChip: { fontSize: 13, fontWeight: '600' },
  avisoCambios: { fontSize: 12, textAlign: 'center' },
  aviso: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  botonPrimario: { borderRadius: 12, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  botonSecundario: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
})
