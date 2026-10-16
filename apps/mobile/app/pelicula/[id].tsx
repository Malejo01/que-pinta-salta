// Ficha de una película en cartelera (28-g, F3; R29, 29-k: ops/paridad-web-app.md
// §3.8). Entran acá Favoritos y la fila de cine de la portada
// (`components/FilaCategoria.tsx`): a diferencia de la lista de
// `app/cines.tsx`, esas dos pantallas no tienen la tarjeta completa de la
// película a mano (solo el id), así que necesitan una ruta propia con "el
// mismo armado que la tarjeta abierta": el póster, el título y el acordeón
// por cine — igual que `MovieCard` de la web. Mismo patrón de estados que
// `app/cines.tsx` (cargando, error con "Reintentar"), más "no encontrada" (la
// película ya no está en cartelera o el id no es válido). Por cine
// (`funcionesPorCine` de `lib/datos/cines.ts`, reusada tal cual): nombre,
// formatos con sus horarios como chips y, si hay `booking_url`, "Comprar
// Entradas" (se abre solo si es `https`, nunca un esquema distinto, y con
// `catch`). Sin sinopsis, duración ni clasificación: no están en
// `cinema_movies` (decisión 4 de "Feedback del teléfono" en plan.md) — no se
// inventan.
//
// `BloqueCine` (el acordeón de un cine) está duplicado a propósito acá y en
// `app/cines.tsx`: no hay un componente compartido en los archivos
// permitidos de esta tarea.
import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import * as Linking from 'expo-linking'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { Afiche } from '@/components/Afiche'
import { Cargando, ErrorCarga, Vacio } from '@/components/EstadoCarga'
import { Icono } from '@/components/Icono'
import { Texto } from '@/components/Texto'
import { useColoresQPS, type ColoresQPS } from '@/lib/colores'
import {
  funcionesPorCine,
  obtenerPeliculaPorId,
  urlCompraCineSegura,
  type FuncionesDeCine,
  type Pelicula,
} from '@/lib/datos/cines'

type Estado = { tipo: 'cargando' } | { tipo: 'error'; error: string } | { tipo: 'no-encontrada' } | { tipo: 'ok'; pelicula: Pelicula }

export default function PeliculaPorId() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const colores = useColoresQPS()
  const router = useRouter()

  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  // Bandera de "reintento" (28-l): no se puede llamar, desde el efecto, a una
  // función que hace `setState` de forma sincrónica (lint
  // react-hooks/set-state-in-effect). La carga inicial va dentro del propio
  // efecto, con el `setState` recién en el callback de la promesa; "Volver a
  // intentar" cambia esta bandera para que el efecto se repita.
  const [intento, setIntento] = useState(0)

  // Si la pantalla se reutiliza con otro `id` sin desmontarse (deep link a
  // otra película con la ficha ya montada), hay que volver a "cargando" antes
  // de que el efecto de abajo dispare el fetch nuevo; si no, se siguen viendo
  // los datos (o el error, o "no encontrada") de la película anterior hasta
  // que resuelve. El ajuste va durante el render, no dentro de un efecto
  // (comparar-y-ajustar con `useState`, no con `useRef`: leer o escribir
  // `ref.current` durante el render lo marca `react-hooks/refs`), así que no
  // reintroduce el lint `react-hooks/set-state-in-effect`.
  const [idAnterior, setIdAnterior] = useState(id)
  if (idAnterior !== id) {
    setIdAnterior(id)
    setEstado({ tipo: 'cargando' })
  }

  useEffect(() => {
    let cancelado = false

    obtenerPeliculaPorId(id).then((resultado) => {
      if (!cancelado) setEstado(resultado)
    })

    return () => {
      cancelado = true
    }
  }, [id, intento])

  const cargar = useCallback(() => {
    setEstado({ tipo: 'cargando' })
    setIntento((valor) => valor + 1)
  }, [])

  return (
    <View style={[estilos.contenedor, { backgroundColor: colores.background }]}>
      <Stack.Screen options={{ title: 'Película' }} />

      {estado.tipo === 'cargando' ? (
        <View style={estilos.centrado}>
          <Cargando />
        </View>
      ) : null}

      {estado.tipo === 'error' ? (
        <View style={estilos.centrado}>
          <ErrorCarga mensaje={estado.error} onReintentar={cargar} />
        </View>
      ) : null}

      {estado.tipo === 'no-encontrada' ? (
        <View style={estilos.centrado}>
          <Vacio mensaje="Esta película ya no está en cartelera." textoAccion="Volver" onAccion={() => router.back()} />
        </View>
      ) : null}

      {estado.tipo === 'ok' ? <Ficha pelicula={estado.pelicula} colores={colores} /> : null}
    </View>
  )
}

/** El mismo armado que la tarjeta abierta de `app/cines.tsx`: el póster, el
 * título y el acordeón por cine. */
function Ficha({ pelicula, colores }: { pelicula: Pelicula; colores: ColoresQPS }) {
  const cines = funcionesPorCine(pelicula.showings)
  const [abierto, setAbierto] = useState<string | null>(null)

  return (
    <ScrollView contentContainerStyle={estilos.contenido}>
      <View style={estilos.contenedorAfiche}>
        <Afiche url={pelicula.poster_url} llenar />
      </View>

      <Texto peso="bold" style={estilos.titulo}>
        {pelicula.title}
      </Texto>

      {cines.length === 0 ? (
        <Texto tono="secundario" style={estilos.sinFunciones}>
          Sin funciones para hoy
        </Texto>
      ) : (
        cines.map((cine, indice) => (
          <BloqueCine
            key={`${cine.cine}-${indice}`}
            cine={cine}
            colores={colores}
            abierto={abierto === cine.cine}
            esUltimo={indice === cines.length - 1}
            onToggle={() => setAbierto((actual) => (actual === cine.cine ? null : cine.cine))}
          />
        ))
      )}
    </ScrollView>
  )
}

/** Un cine dentro del acordeón: el nombre como trigger y, abierto, los
 * formatos con sus horarios en chips y "Comprar Entradas". Mismo componente
 * (duplicado) en `app/cines.tsx`. */
function BloqueCine({
  cine,
  colores,
  abierto,
  esUltimo,
  onToggle,
}: {
  cine: FuncionesDeCine
  colores: ColoresQPS
  abierto: boolean
  esUltimo: boolean
  onToggle: () => void
}) {
  // Único origen válido para abrir una URL de compra (R28, 28-g): el
  // `booking_url` crudo (`cine.urlCompra`) nunca llega a `Linking.openURL`
  // directo — siempre pasa por `urlCompraCineSegura` (ver
  // `tests/aperturas-url.test.ts`).
  const urlCompra = urlCompraCineSegura(cine.urlCompra)

  return (
    <View style={[estilos.bloqueCine, !esUltimo && { borderBottomWidth: 1, borderColor: colores.border }]}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: abierto }} style={estilos.triggerCine}>
        <View style={estilos.triggerTexto}>
          <View style={[estilos.punto, { backgroundColor: colores.primary }]} />
          <Texto peso="semibold" style={estilos.nombreCine}>
            {cine.cine}
          </Texto>
        </View>
        <View style={abierto ? estilos.chevronAbierto : undefined}>
          <Icono nombre="ChevronDown" tamanio={18} color={colores.mutedForeground} />
        </View>
      </Pressable>

      {abierto ? (
        <View style={estilos.contenidoCine}>
          {cine.formatos.map((formato, indice) => (
            <View key={`${formato.tipo}-${indice}`} style={[estilos.cajaFormato, { backgroundColor: colores.muted, borderColor: colores.border }]}>
              <Texto tono="secundario" peso="semibold" style={estilos.tipoFormato}>
                {formato.tipo}
              </Texto>
              <View style={estilos.filaChips}>
                {formato.horarios.map((horario, indiceHorario) => (
                  <View key={`${horario}-${indiceHorario}`} style={[estilos.chip, { backgroundColor: colores.card, borderColor: colores.border }]}>
                    <Texto style={estilos.textoChip}>{horario}</Texto>
                  </View>
                ))}
              </View>
            </View>
          ))}

          {urlCompra ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => Linking.openURL(urlCompra).catch(() => {})}
              style={[estilos.botonComprar, { backgroundColor: colores.muted }]}
            >
              <Icono nombre="Ticket" tamanio={14} color={colores.primary} />
              <Texto peso="semibold" style={estilos.textoComprar}>
                Comprar Entradas
              </Texto>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1 },
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  contenido: { padding: 16, gap: 4 },
  contenedorAfiche: { width: '100%', aspectRatio: 2 / 3, borderRadius: 16, overflow: 'hidden' },
  titulo: { fontSize: 22, marginTop: 16, marginBottom: 8 },
  sinFunciones: { textAlign: 'center', fontStyle: 'italic', paddingVertical: 8 },
  bloqueCine: { paddingVertical: 4 },
  triggerCine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, paddingVertical: 4 },
  triggerTexto: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  punto: { width: 6, height: 6, borderRadius: 3 },
  nombreCine: { fontSize: 15, flexShrink: 1 },
  chevronAbierto: { transform: [{ rotate: '180deg' }] },
  contenidoCine: { gap: 8, paddingBottom: 10 },
  cajaFormato: { borderWidth: 1, borderRadius: 8, padding: 8, gap: 6 },
  tipoFormato: { fontSize: 12 },
  filaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  textoChip: { fontSize: 12 },
  botonComprar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 8, paddingVertical: 10 },
  textoComprar: { fontSize: 12 },
})
