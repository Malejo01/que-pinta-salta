// Sección del Radar en Cuenta (R27, 27-b): frecuencia del email + las tres
// listas de seguidos (categorías, lugares, cuentas de Instagram). Solo se
// muestra con sesión (lo decide `app/(tabs)/cuenta.tsx`); el `userId` sale
// de `useSession()` adentro de este componente, nunca de una prop.
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTheme } from 'expo-router'
import { FRECUENCIAS_RADAR, type EmailFrequency } from '@qps/core/radar/preferencias'
import {
  ETIQUETAS_FRECUENCIA,
  guardarRadar,
  obtenerRadar,
  type OpcionesRadar,
} from '@/lib/radar'
import { useSession } from '@/lib/session'

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'error'; error: string }
  | {
      tipo: 'ok'
      opciones: OpcionesRadar
      frecuencia: EmailFrequency
      categoryIds: Set<string>
      venueIds: Set<string>
      instagramAccountIds: Set<string>
    }

function alternarEnConjunto(conjunto: Set<string>, id: string): Set<string> {
  const nuevo = new Set(conjunto)
  if (nuevo.has(id)) nuevo.delete(id)
  else nuevo.add(id)
  return nuevo
}

export function SeccionRadar() {
  const { colors } = useTheme()
  const { session } = useSession()
  const userId = session?.user.id ?? null

  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const cargar = useCallback(async () => {
    if (!userId) return
    setEstado({ tipo: 'cargando' })
    const resultado = await obtenerRadar(userId)
    if (!resultado.ok) {
      setEstado({ tipo: 'error', error: resultado.error })
      return
    }
    setEstado({
      tipo: 'ok',
      opciones: resultado.opciones,
      frecuencia: resultado.preferencias.email_frequency,
      categoryIds: new Set(resultado.preferencias.categoryIds),
      venueIds: new Set(resultado.preferencias.venueIds),
      instagramAccountIds: new Set(resultado.preferencias.instagramAccountIds),
    })
  }, [userId])

  useEffect(() => {
    cargar()
  }, [cargar])

  if (!userId) return null

  if (estado.tipo === 'cargando') {
    return <ActivityIndicator style={estilos.espaciado} />
  }

  if (estado.tipo === 'error') {
    return (
      <View style={estilos.seccion}>
        <Text style={{ color: colors.text }}>{estado.error}</Text>
        <Pressable onPress={cargar} style={[estilos.boton, { borderColor: colors.border, marginTop: 8 }]}>
          <Text style={[estilos.textoBoton, { color: colors.text }]}>Reintentar</Text>
        </Pressable>
      </View>
    )
  }

  const { opciones, frecuencia, categoryIds, venueIds, instagramAccountIds } = estado

  async function guardar() {
    if (!userId || guardando) return
    setGuardando(true)
    setMensaje(null)
    const resultado = await guardarRadar(userId, {
      email_frequency: frecuencia,
      categoryIds: Array.from(categoryIds),
      venueIds: Array.from(venueIds),
      instagramAccountIds: Array.from(instagramAccountIds),
    })
    setMensaje(
      resultado.ok
        ? { tipo: 'ok', texto: 'Guardamos tu Radar.' }
        : { tipo: 'error', texto: resultado.error }
    )
    setGuardando(false)
  }

  return (
    <View style={estilos.seccion}>
      <Text style={[estilos.titulo, { color: colors.text }]}>Radar</Text>

      <Text style={[estilos.subtitulo, { color: colors.text }]}>Frecuencia del email</Text>
      <View style={estilos.filaChips}>
        {FRECUENCIAS_RADAR.map((valor) => {
          const seleccionada = frecuencia === valor
          return (
            <Pressable
              key={valor}
              onPress={() => setEstado({ ...estado, frecuencia: valor })}
              style={[estilos.chip, { borderColor: colors.border }, seleccionada && { backgroundColor: colors.primary }]}
            >
              <Text style={[estilos.textoChip, { color: seleccionada ? '#fff' : colors.text }]}>
                {ETIQUETAS_FRECUENCIA[valor]}
              </Text>
            </Pressable>
          )
        })}
      </View>

      <Text style={[estilos.subtitulo, { color: colors.text }]}>Categorías</Text>
      <View style={estilos.filaChips}>
        {opciones.categorias.map((categoria) => {
          const seleccionada = categoryIds.has(categoria.id)
          return (
            <Pressable
              key={categoria.id}
              onPress={() => setEstado({ ...estado, categoryIds: alternarEnConjunto(categoryIds, categoria.id) })}
              style={[estilos.chip, { borderColor: colors.border }, seleccionada && { backgroundColor: colors.primary }]}
            >
              <Text style={[estilos.textoChip, { color: seleccionada ? '#fff' : colors.text }]}>{categoria.name}</Text>
            </Pressable>
          )
        })}
        {opciones.categorias.length === 0 ? (
          <Text style={{ color: colors.border }}>No hay categorías todavía.</Text>
        ) : null}
      </View>

      <Text style={[estilos.subtitulo, { color: colors.text }]}>Lugares</Text>
      <View style={estilos.filaChips}>
        {opciones.lugares.map((lugar) => {
          const seleccionado = venueIds.has(lugar.id)
          return (
            <Pressable
              key={lugar.id}
              onPress={() => setEstado({ ...estado, venueIds: alternarEnConjunto(venueIds, lugar.id) })}
              style={[estilos.chip, { borderColor: colors.border }, seleccionado && { backgroundColor: colors.primary }]}
            >
              <Text style={[estilos.textoChip, { color: seleccionado ? '#fff' : colors.text }]}>{lugar.name}</Text>
            </Pressable>
          )
        })}
        {opciones.lugares.length === 0 ? (
          <Text style={{ color: colors.border }}>No hay lugares todavía.</Text>
        ) : null}
      </View>

      <Text style={[estilos.subtitulo, { color: colors.text }]}>Cuentas de Instagram</Text>
      <View style={estilos.filaChips}>
        {opciones.cuentasInstagram.map((cuenta) => {
          const seleccionada = instagramAccountIds.has(cuenta.id)
          return (
            <Pressable
              key={cuenta.id}
              onPress={() =>
                setEstado({ ...estado, instagramAccountIds: alternarEnConjunto(instagramAccountIds, cuenta.id) })
              }
              style={[estilos.chip, { borderColor: colors.border }, seleccionada && { backgroundColor: colors.primary }]}
            >
              <Text style={[estilos.textoChip, { color: seleccionada ? '#fff' : colors.text }]}>
                {cuenta.display_name}
              </Text>
            </Pressable>
          )
        })}
        {opciones.cuentasInstagram.length === 0 ? (
          <Text style={{ color: colors.border }}>No hay cuentas todavía.</Text>
        ) : null}
      </View>

      {mensaje ? (
        <Text style={{ color: mensaje.tipo === 'error' ? '#dc2626' : colors.text }}>{mensaje.texto}</Text>
      ) : null}

      <Pressable
        onPress={guardar}
        disabled={guardando}
        style={[estilos.boton, { borderColor: colors.border, backgroundColor: colors.primary, marginTop: 8 }]}
      >
        {guardando ? <ActivityIndicator color="#fff" /> : <Text style={[estilos.textoBoton, { color: '#fff' }]}>Guardar Radar</Text>}
      </Pressable>
    </View>
  )
}

const estilos = StyleSheet.create({
  seccion: { width: '100%', gap: 8, paddingVertical: 16 },
  titulo: { fontSize: 16, fontWeight: '700' },
  subtitulo: { fontWeight: '600', marginTop: 8 },
  espaciado: { marginTop: 16 },
  filaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  textoChip: { fontWeight: '600' },
  boton: { borderWidth: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  textoBoton: { fontWeight: '600' },
})
