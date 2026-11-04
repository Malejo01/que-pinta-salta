// Q5-4 · «Lugares para chicos» en la app: plazas, peloteros, salones de
// juegos y espacios culturales PUBLICADOS (verificados por el equipo), con
// filtros por tipo, «Gratis» y «Abierto ahora».
//
// Cerca de casa: la ubicación aproximada de Q4 (lib/ubicacion.ts) SOLO si el
// permiso ya estaba concedido — esta pantalla nunca lo pide. Si no está, se
// ofrece «Elegí tu barrio» (los mismos puntos aproximados que la web,
// @qps/core/datos/barrios). La posición y el barrio quedan en el estado de la
// pantalla: no se guardan ni se mandan.
//
// Se llega desde el acceso «Lugares para chicos» que aparece en Inicio y en
// Buscar con el chip «Para chicos» prendido (components/AccesoLugaresChicos).
import { useEffect, useMemo, useState } from 'react'
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { ChipFiltroLugar } from '@/components/ChipFiltroLugar'
import { Cargando, ErrorCarga, Vacio } from '@/components/EstadoCarga'
import { Icono } from '@/components/Icono'
import { Texto } from '@/components/Texto'
import { estadoAnunciableLugaresChicos } from '@/lib/anunciar-conteo'
import { useAnunciarConteo } from '@/lib/anunciar-conteo-hook'
import { useColoresQPS } from '@/lib/colores'
import { obtenerLugaresChicos } from '@/lib/datos/lugares-chicos'
import {
  SIN_FILTROS_LUGARES,
  lugaresParaMostrar,
  rutaLugarChicos,
  etiquetaTarjetaLugar,
  subtituloLugar,
  type FiltrosLugares,
  type OrigenLugares,
} from '@/lib/lugares-chicos'
import { useIdioma, useTextos } from '@/lib/i18n'
import { ubicacionSiYaConcedida } from '@/lib/ubicacion'
import { BARRIOS_SALTA_CAPITAL } from '@qps/core/datos/barrios'
import { ETIQUETA_ACCESO, ETIQUETA_TIPO, TIPOS_LUGAR, textoEdades, textoHorarioDeHoy } from '@qps/core/lugares/permanentes'
import type { LugarChicosMapa } from '@qps/core/mapa/lugares-chicos'

type Estado = { tipo: 'cargando' } | { tipo: 'error'; error: 'errorCarga' } | { tipo: 'ok'; lugares: LugarChicosMapa[] }

export default function LugaresChicos() {
  const colores = useColoresQPS()
  const router = useRouter()
  // Q5-11: pantalla migrada al diccionario (castellano / inglés).
  const { idioma } = useIdioma()
  const textosComunes = useTextos().comun
  const t = useTextos().lugaresChicos
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  const [intento, setIntento] = useState(0)
  const [filtros, setFiltros] = useState<FiltrosLugares>(SIN_FILTROS_LUGARES)
  const [origen, setOrigen] = useState<OrigenLugares | null>(null)
  const [verBarrios, setVerBarrios] = useState(false)
  // El reloj de «Abierto ahora» y «Hoy: …»: se fija al cargar (y al reintentar).
  const [ahora, setAhora] = useState(() => new Date())

  useEffect(() => {
    let cancelado = false
    obtenerLugaresChicos().then((r) => {
      if (cancelado) return
      setAhora(new Date())
      setEstado(r.ok ? { tipo: 'ok', lugares: r.lugares } : { tipo: 'error', error: 'errorCarga' })
    })
    // Solo si el permiso YA estaba concedido (nunca se pide acá).
    ubicacionSiYaConcedida().then((u) => {
      if (!cancelado && u.ok) setOrigen((previo) => previo ?? { tipo: 'ubicacion', lat: u.latitud, lng: u.longitud })
    })
    return () => {
      cancelado = true
    }
  }, [intento])

  const lugares = useMemo(
    () => (estado.tipo === 'ok' ? lugaresParaMostrar(estado.lugares, filtros, origen, ahora) : []),
    [estado, filtros, origen, ahora],
  )

  // Q6-6: el conteo («N lugares») se anuncia con el hook de siempre
  // (lib/anunciar-conteo-hook.ts), no a mano en el toque: en Android espera a
  // que TalkBack termine el «Seleccionado» del chip (o la relectura del foco
  // cuando la lista de barrios se cierra), no se repite y se calla si la
  // pantalla pierde el foco. Con barrio, suma «Ordenados por cercanía a …».
  useAnunciarConteo(
    estado.tipo === 'ok'
      ? estadoAnunciableLugaresChicos({ filtros, barrio: origen?.tipo === 'barrio' ? origen.nombre : null, cantidad: lugares.length, idioma })
      : null,
  )

  const cambiarFiltros = (nuevos: FiltrosLugares) => setFiltros(nuevos)

  const elegirBarrio = (id: string | null) => {
    const barrio = BARRIOS_SALTA_CAPITAL.find((b) => b.id === id)
    setOrigen(barrio ? { tipo: 'barrio', id: barrio.id, nombre: barrio.nombre, lat: barrio.lat, lng: barrio.lng } : null)
    setVerBarrios(false)
  }

  const encabezado = (
    <View style={estilos.encabezado}>
      <Texto peso="bold" accessibilityRole="header" style={estilos.titulo}>
        {t.titulo}
      </Texto>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilos.filaChips}>
        <ChipFiltroLugar texto={t.todos} activo={filtros.tipo === null} onPress={() => cambiarFiltros({ ...filtros, tipo: null })} etiqueta={t.todosLosTipos} />
        {TIPOS_LUGAR.map((tipo) => (
          <ChipFiltroLugar
            key={tipo}
            texto={ETIQUETA_TIPO[idioma][tipo]}
            activo={filtros.tipo === tipo}
            onPress={() => cambiarFiltros({ ...filtros, tipo: filtros.tipo === tipo ? null : tipo })}
          />
        ))}
      </ScrollView>
      <View style={estilos.filaChipsFija}>
        <ChipFiltroLugar texto={t.gratis} activo={filtros.gratis} onPress={() => cambiarFiltros({ ...filtros, gratis: !filtros.gratis })} etiqueta={t.soloGratis} />
        <ChipFiltroLugar
          texto={t.abiertoAhora}
          activo={filtros.abiertoAhora}
          onPress={() => cambiarFiltros({ ...filtros, abiertoAhora: !filtros.abiertoAhora })}
        />
      </View>

      {origen?.tipo === 'ubicacion' ? (
        <Texto tono="secundario" style={estilos.nota}>
          {t.ordenadosPorUbicacion}
        </Texto>
      ) : (
        <View style={estilos.barrio}>
          <Pressable
            onPress={() => setVerBarrios((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: verBarrios }}
            accessibilityLabel={origen?.tipo === 'barrio' ? t.barrioCambiar(origen.nombre) : t.elegiTuBarrioEtiqueta}
            style={[estilos.botonBarrio, { borderColor: colores.border, backgroundColor: colores.card }]}
          >
            <Icono nombre="MapPin" tamanio={16} color={colores.foreground} />
            {/* Q6-6: con la letra al 200 % el texto envuelve en vez de salirse del botón. */}
            <Texto peso="semibold" style={estilos.textoBarrio}>
              {origen?.tipo === 'barrio' ? t.cercaDe(origen.nombre) : t.elegiTuBarrio}
            </Texto>
          </Pressable>
          {verBarrios ? (
            <View style={estilos.listaBarrios}>
              {origen ? <ChipFiltroLugar texto={t.sinBarrio} activo={false} onPress={() => elegirBarrio(null)} etiqueta={t.sinOrdenar} /> : null}
              {BARRIOS_SALTA_CAPITAL.map((b) => (
                <ChipFiltroLugar key={b.id} texto={b.nombre} activo={origen?.tipo === 'barrio' && origen.id === b.id} onPress={() => elegirBarrio(b.id)} />
              ))}
            </View>
          ) : null}
          <Texto tono="secundario" style={estilos.nota}>
            {t.barrioPrivacidad}
          </Texto>
        </View>
      )}
      {estado.tipo === 'ok' ? (
        <Texto peso="semibold" style={estilos.nota}>
          {t.conteo(lugares.length)}
        </Texto>
      ) : null}
    </View>
  )

  if (estado.tipo === 'cargando') return <Cargando />
  if (estado.tipo === 'error') {
    return (
      <ErrorCarga
        mensaje={t.errorCarga}
        onReintentar={() => {
          setEstado({ tipo: 'cargando' })
          setIntento((n) => n + 1)
        }}
      />
    )
  }

  return (
    <FlatList
      style={{ backgroundColor: colores.background }}
      contentContainerStyle={estilos.contenido}
      data={lugares}
      keyExtractor={(l) => l.venueId}
      ListHeaderComponent={encabezado}
      ListEmptyComponent={
        <Vacio
          mensaje={estado.lugares.length === 0 ? t.vacioSinDatos : t.vacioConFiltros}
          textoAccion={estado.lugares.length === 0 ? undefined : textosComunes.quitarFiltros}
          onAccion={estado.lugares.length === 0 ? undefined : () => cambiarFiltros(SIN_FILTROS_LUGARES)}
        />
      }
      ListFooterComponent={
        <Texto tono="secundario" style={estilos.leyenda}>
          {t.leyenda}
        </Texto>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push(rutaLugarChicos(item.venueId))}
          accessibilityRole="button"
          accessibilityLabel={etiquetaTarjetaLugar(item, ahora, idioma)}
          accessibilityHint={t.abreLaFicha}
          style={[estilos.tarjetaLugar, { backgroundColor: colores.card, borderColor: colores.border }]}
        >
          <Texto peso="bold" style={estilos.nombre}>
            {item.nombre}
          </Texto>
          <Texto tono="secundario">{subtituloLugar(item, idioma)}</Texto>
          <Texto>{textoHorarioDeHoy(item.horarios, ahora, idioma)}</Texto>
          <Texto tono="secundario">
            {ETIQUETA_ACCESO[idioma][item.acceso]} · {textoEdades(item.edadMin, item.edadMax, idioma)}
          </Texto>
        </Pressable>
      )}
    />
  )
}

const estilos = StyleSheet.create({
  contenido: { padding: 16, gap: 12 },
  encabezado: { gap: 12, marginBottom: 4 },
  titulo: { fontSize: 22 },
  filaChips: { gap: 8, paddingRight: 16 },
  filaChipsFija: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  barrio: { gap: 8 },
  botonBarrio: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  textoBarrio: { flexShrink: 1 },
  listaBarrios: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  nota: { fontSize: 13 },
  tarjetaLugar: { minHeight: 48, borderWidth: 1, borderRadius: 12, padding: 14, gap: 4 },
  nombre: { fontSize: 17 },
  leyenda: { fontSize: 12, marginTop: 8 },
})
