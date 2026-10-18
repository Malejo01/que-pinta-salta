// "Agregar al calendario" en la ficha (R42, 42-c; plan
// `ops/rondas/42-ficha-completa/plan.md`, corregido por el lead el 17/10:
// solo el camino B, sin `abrirPantallaDelSistema` — ver el comentario de
// `lib/calendario/agregar.ts`). El permiso se pide RECIÉN al tocar el
// botón: no hay ningún `useEffect` que llame a `agregarAlCalendario`,
// `pedirPermiso` ni toque el calendario. Mismo estilo visual que el CTA
// "Comprar tickets" (`ctaOutline`, borde `colores.border`) de
// `app/evento/[id].tsx`.
import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import * as Linking from 'expo-linking'
import { agregarAlCalendario, type ResultadoAgregar } from '@/lib/calendario/agregar'
import { datosCalendario, puedeAgregarseAlCalendario, type EventoParaCalendario } from '@/lib/calendario/datos'
import { depsDelDispositivo } from '@/lib/calendario/dispositivo'
import { Icono } from '@/components/Icono'
import { Texto } from '@/components/Texto'
import { useColoresQPS } from '@/lib/colores'

export interface BotonCalendarioProps {
  evento: EventoParaCalendario
}

function mensajePara(resultado: ResultadoAgregar): string | null {
  switch (resultado.tipo) {
    case 'agregado':
      return 'Listo, lo agregamos a tu calendario.'
    case 'sin-permiso':
      return 'Sin permiso para usar el calendario.'
    case 'sin-calendario':
      return 'No encontramos un calendario donde guardarlo.'
    case 'error':
      return 'No pudimos agregarlo al calendario. Probá de nuevo.'
  }
}

export function BotonCalendario({ evento }: BotonCalendarioProps) {
  const colores = useColoresQPS()
  const [cargando, setCargando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoAgregar | null>(null)

  const datos = datosCalendario(evento)
  const puedeAgregarse = puedeAgregarseAlCalendario(evento, new Date())

  // El botón no se muestra si el evento ya terminó o si no hay datos
  // válidos para armar el evento del calendario (42-a).
  if (!puedeAgregarse || !datos) return null

  const agregado = resultado?.tipo === 'agregado'

  async function alAgregar() {
    if (cargando || agregado) return
    // Se recalcula acá (en vez de capturar `datos` del render de arriba) para
    // que TS no tenga que confiar en que una `const` narrowed siga siéndolo
    // dentro de un closure: `datosCalendario` es pura, así que da lo mismo.
    const datosActuales = datosCalendario(evento)
    if (!datosActuales) return
    setCargando(true)
    const r = await agregarAlCalendario(datosActuales, depsDelDispositivo())
    setResultado(r)
    setCargando(false)
  }

  const mensaje = resultado ? mensajePara(resultado) : null
  const puedeAbrirAjustes = resultado?.tipo === 'sin-permiso' && resultado.puedeAbrirAjustes

  return (
    <View>
      <Pressable
        onPress={alAgregar}
        disabled={cargando || agregado}
        accessibilityRole="button"
        accessibilityLabel={agregado ? 'En tu calendario' : 'Agregar al calendario'}
        style={[estilos.ctaOutline, { borderColor: colores.border }]}
      >
        {cargando ? (
          <ActivityIndicator color={colores.foreground} size="small" />
        ) : (
          <>
            <Icono nombre={agregado ? 'Check' : 'CalendarPlus'} tamanio={18} color={colores.foreground} />
            <Texto peso="semibold">{agregado ? 'En tu calendario' : 'Agregar al calendario'}</Texto>
          </>
        )}
      </Pressable>

      {mensaje ? (
        <Texto tono="secundario" style={estilos.mensaje} accessibilityLiveRegion="polite">
          {mensaje}
        </Texto>
      ) : null}

      {puedeAbrirAjustes ? (
        <Pressable
          onPress={() => Linking.openSettings()}
          accessibilityRole="button"
          accessibilityLabel="Abrir Ajustes"
          hitSlop={10}
          style={estilos.botonAjustes}
        >
          <Texto peso="semibold" style={{ color: colores.primary }}>
            Abrir Ajustes
          </Texto>
        </Pressable>
      ) : null}
    </View>
  )
}

const estilos = StyleSheet.create({
  ctaOutline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, paddingVertical: 14, borderWidth: 1 },
  mensaje: { marginTop: 6, fontSize: 13 },
  botonAjustes: { marginTop: 6, paddingVertical: 10, alignSelf: 'flex-start' },
})
