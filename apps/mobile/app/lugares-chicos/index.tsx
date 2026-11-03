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
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { ChipFiltroLugar } from '@/components/ChipFiltroLugar'
import { Cargando, ErrorCarga, Vacio } from '@/components/EstadoCarga'
import { Icono } from '@/components/Icono'
import { Texto } from '@/components/Texto'
import { anunciar } from '@/lib/anunciar'
import { useColoresQPS } from '@/lib/colores'
import { obtenerLugaresChicos } from '@/lib/datos/lugares-chicos'
import {
  LEYENDA_LUGARES,
  SIN_FILTROS_LUGARES,
  TITULO_LUGARES_CHICOS,
  lugaresParaMostrar,
  rutaLugarChicos,
  subtituloLugar,
  textoConteoLugares,
  type FiltrosLugares,
  type OrigenLugares,
} from '@/lib/lugares-chicos'
import { ubicacionSiYaConcedida } from '@/lib/ubicacion'
import { BARRIOS_SALTA_CAPITAL } from '@qps/core/datos/barrios'
import { ETIQUETA_ACCESO, ETIQUETA_TIPO, TIPOS_LUGAR, textoEdades, textoHorarioDeHoy } from '@qps/core/lugares/permanentes'
import type { LugarChicosMapa } from '@qps/core/mapa/lugares-chicos'

type Estado = { tipo: 'cargando' } | { tipo: 'error'; error: string } | { tipo: 'ok'; lugares: LugarChicosMapa[] }

export default function LugaresChicos() {
  const colores = useColoresQPS()
  const router = useRouter()
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
      setEstado(r.ok ? { tipo: 'ok', lugares: r.lugares } : { tipo: 'error', error: r.error })
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

  const cambiarFiltros = useCallback(
    (nuevos: FiltrosLugares) => {
      setFiltros(nuevos)
      if (estado.tipo === 'ok') anunciar(textoConteoLugares(lugaresParaMostrar(estado.lugares, nuevos, origen, ahora).length))
    },
    [estado, origen, ahora],
  )

  const elegirBarrio = (id: string | null) => {
    const barrio = BARRIOS_SALTA_CAPITAL.find((b) => b.id === id)
    setOrigen(barrio ? { tipo: 'barrio', id: barrio.id, nombre: barrio.nombre, lat: barrio.lat, lng: barrio.lng } : null)
    setVerBarrios(false)
    anunciar(barrio ? `Ordenados por cercanía a ${barrio.nombre}` : 'Sin ordenar por cercanía')
  }

  const encabezado = (
    <View style={estilos.encabezado}>
      <Texto peso="bold" accessibilityRole="header" style={estilos.titulo}>
        {TITULO_LUGARES_CHICOS}
      </Texto>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilos.filaChips}>
        <ChipFiltroLugar texto="Todos" activo={filtros.tipo === null} onPress={() => cambiarFiltros({ ...filtros, tipo: null })} etiqueta="Todos los tipos" />
        {TIPOS_LUGAR.map((tipo) => (
          <ChipFiltroLugar
            key={tipo}
            texto={ETIQUETA_TIPO.es[tipo]}
            activo={filtros.tipo === tipo}
            onPress={() => cambiarFiltros({ ...filtros, tipo: filtros.tipo === tipo ? null : tipo })}
          />
        ))}
      </ScrollView>
      <View style={estilos.filaChipsFija}>
        <ChipFiltroLugar texto="Gratis" activo={filtros.gratis} onPress={() => cambiarFiltros({ ...filtros, gratis: !filtros.gratis })} etiqueta="Solo lugares gratis" />
        <ChipFiltroLugar
          texto="Abierto ahora"
          activo={filtros.abiertoAhora}
          onPress={() => cambiarFiltros({ ...filtros, abiertoAhora: !filtros.abiertoAhora })}
        />
      </View>

      {origen?.tipo === 'ubicacion' ? (
        <Texto tono="secundario" style={estilos.nota}>
          Ordenados por cercanía a tu ubicación aproximada.
        </Texto>
      ) : (
        <View style={estilos.barrio}>
          <Pressable
            onPress={() => setVerBarrios((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: verBarrios }}
            accessibilityLabel={origen?.tipo === 'barrio' ? `Barrio: ${origen.nombre}. Cambiar` : 'Elegí tu barrio para ordenar por cercanía'}
            style={[estilos.botonBarrio, { borderColor: colores.border, backgroundColor: colores.card }]}
          >
            <Icono nombre="MapPin" tamanio={16} color={colores.foreground} />
            <Texto peso="semibold">{origen?.tipo === 'barrio' ? `Cerca de ${origen.nombre}` : 'Elegí tu barrio'}</Texto>
          </Pressable>
          {verBarrios ? (
            <View style={estilos.listaBarrios}>
              {origen ? <ChipFiltroLugar texto="Sin barrio" activo={false} onPress={() => elegirBarrio(null)} etiqueta="Sin ordenar por cercanía" /> : null}
              {BARRIOS_SALTA_CAPITAL.map((b) => (
                <ChipFiltroLugar key={b.id} texto={b.nombre} activo={origen?.tipo === 'barrio' && origen.id === b.id} onPress={() => elegirBarrio(b.id)} />
              ))}
            </View>
          ) : null}
          <Texto tono="secundario" style={estilos.nota}>
            El barrio se usa solo en el teléfono para ordenar la lista: no se guarda ni se manda.
          </Texto>
        </View>
      )}
      {estado.tipo === 'ok' ? (
        <Texto peso="semibold" style={estilos.nota}>
          {textoConteoLugares(lugares.length)}
        </Texto>
      ) : null}
    </View>
  )

  if (estado.tipo === 'cargando') return <Cargando />
  if (estado.tipo === 'error') {
    return (
      <ErrorCarga
        mensaje={estado.error}
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
          mensaje={estado.lugares.length === 0 ? 'Todavía no hay lugares verificados. Estamos cargando los primeros.' : 'No hay lugares con estos filtros.'}
          textoAccion={estado.lugares.length === 0 ? undefined : 'Quitar filtros'}
          onAccion={estado.lugares.length === 0 ? undefined : () => cambiarFiltros(SIN_FILTROS_LUGARES)}
        />
      }
      ListFooterComponent={
        <Texto tono="secundario" style={estilos.leyenda}>
          {LEYENDA_LUGARES}
        </Texto>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push(rutaLugarChicos(item.venueId))}
          accessibilityRole="button"
          accessibilityLabel={`${item.nombre}. ${subtituloLugar(item)}. ${textoHorarioDeHoy(item.horarios, ahora)}. ${ETIQUETA_ACCESO.es[item.acceso]}`}
          accessibilityHint="Abre la ficha del lugar"
          style={[estilos.tarjetaLugar, { backgroundColor: colores.card, borderColor: colores.border }]}
        >
          <Texto peso="bold" style={estilos.nombre}>
            {item.nombre}
          </Texto>
          <Texto tono="secundario">{subtituloLugar(item)}</Texto>
          <Texto>{textoHorarioDeHoy(item.horarios, ahora)}</Texto>
          <Texto tono="secundario">
            {ETIQUETA_ACCESO.es[item.acceso]} · {textoEdades(item.edadMin, item.edadMax)}
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
  },
  listaBarrios: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  nota: { fontSize: 13 },
  tarjetaLugar: { minHeight: 48, borderWidth: 1, borderRadius: 12, padding: 14, gap: 4 },
  nombre: { fontSize: 17 },
  leyenda: { fontSize: 12, marginTop: 8 },
})
