/**
 * La hoja de "Compartir" con la vista previa de la tarjeta y los dos
 * botones (R42, 42-d; plan `ops/rondas/42-ficha-completa/plan.md`, decisión
 * 3). `Modal` de RN, `transparent`, `animationType="slide"`.
 *
 * CORRECCIÓN DEL LEAD (17/10): el encargo original tenía esta hoja armando
 * su propio llamado al `share` de RN con un `message: mensajeTexto`
 * recibido como prop. Pero `tests/compartir-ficha.test.ts` resuelve el
 * identificador de `message` buscando `` const|let <nombre> = `` EN EL
 * MISMO ARCHIVO — un `mensajeTexto` que llega por prop no tiene esa
 * definición acá, así que el detector reportaría "no encontré la
 * definición de mensajeTexto" y el test quedaría en rojo. Por eso esta hoja
 * NO llama a ese `share` en absoluto: recibe `compartirTexto`, la MISMA
 * función `compartir()` que ya tiene `BotonCompartir.tsx` (con su propio
 * llamado, con `mensaje` definido ahí con `mensajeCompartirEvento` — el
 * patrón que el detector sí acepta). Un solo prop hace las dos cosas que
 * pedía el encargo (el botón "Compartir link" Y la caída del orquestador
 * cuando no hay cómo compartir una imagen): "pueden ser la misma función".
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import { Icono } from '@/components/Icono'
import { Texto } from '@/components/Texto'
import { TarjetaCompartir } from '@/components/TarjetaCompartir'
import { useColoresQPS } from '@/lib/colores'
import { compartirTarjeta, type ResultadoCompartirTarjeta } from '@/lib/compartir-imagen/compartir'
import { depsDelDispositivo } from '@/lib/compartir-imagen/dispositivo'
import type { DatosTarjetaCompartir } from '@/lib/compartir'

/** Tope por si la imagen (el afiche o la marca) nunca avisa que está lista. */
const TOPE_LISTO_MS = 4000

export interface HojaCompartirTarjetaProps {
  visible: boolean
  datos: DatosTarjetaCompartir
  /** El `compartir()` de `BotonCompartir.tsx` (ver el comentario de arriba):
   * "Compartir link" lo llama directo, y es también la caída de
   * `compartirTarjeta` cuando no hay cómo compartir una imagen. */
  compartirTexto: () => Promise<void>
  onCerrar: () => void
}

export function HojaCompartirTarjeta({ visible, datos, compartirTexto, onCerrar }: HojaCompartirTarjetaProps) {
  const colores = useColoresQPS()
  // El ancho de la ventana se lee con `useWindowDimensions()`, nunca con
  // `Dimensions` a nivel de módulo (QPS-132).
  const { width } = useWindowDimensions()
  const anchoPreview = Math.min(width - 32, 360)
  const refTarjeta = useRef<View>(null)

  const [listo, setListo] = useState(false)
  const [compartiendo, setCompartiendo] = useState(false)
  const [resultado, setResultado] = useState<ResultadoCompartirTarjeta | null>(null)

  const marcarListo = useCallback(() => setListo(true), [])

  // Tope de 4s por si la tarjeta nunca avisa que está lista (sin esto,
  // "Compartir imagen" quedaría deshabilitado para siempre si algo falla
  // antes de que `TarjetaCompartir`/`Afiche` lleguen a avisar). Un solo
  // montaje: la hoja vive mientras exista el `tarjeta` de `BotonCompartir`,
  // así que reabrirla no hace falta esperar otra vez si ya quedó lista.
  useEffect(() => {
    const temporizador = setTimeout(marcarListo, TOPE_LISTO_MS)
    return () => clearTimeout(temporizador)
  }, [marcarListo])

  async function alCompartirImagen() {
    if (compartiendo) return
    setCompartiendo(true)
    // `try/finally` como defensa en profundidad: `compartirTarjeta` ya "nunca
    // tira" por diseño (ver `lib/compartir-imagen/compartir.ts`), pero el
    // botón no puede depender de que el orquestador cumpla esa promesa — si
    // alguna vez rechaza, `setCompartiendo(false)` tiene que correr igual, o
    // el botón queda deshabilitado para siempre.
    try {
      const r = await compartirTarjeta(depsDelDispositivo(refTarjeta, compartirTexto))
      setResultado(r)
    } finally {
      setCompartiendo(false)
    }
  }

  const mensaje =
    resultado?.tipo === 'nada'
      ? 'No pudimos compartir. Probá de nuevo.'
      : resultado?.tipo === 'texto' && resultado.motivo === 'captura'
        ? 'No pudimos armar la imagen; compartimos el link.'
        : null

  const deshabilitado = !listo || compartiendo

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCerrar}>
      <View style={estilos.fondoOscuro}>
        {/* `ScrollView` en vez de `View`: red de seguridad para que el
            contenido no se recorte (y "Cerrar" quede inalcanzable) en
            pantallas chicas o cuando aparece el mensaje de error. En una
            pantalla grande no cambia nada. */}
        <ScrollView
          style={estilos.hojaScroll}
          contentContainerStyle={[estilos.hoja, { backgroundColor: colores.background, borderColor: colores.border }]}
        >
          {/* Oculta la vista previa para lectores de pantalla: repite la
              marca, el título, la fecha, el lugar y el link, ya leídos en la
              ficha, antes de llegar a los botones. */}
          <View style={estilos.previa} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <TarjetaCompartir ref={refTarjeta} datos={datos} ancho={anchoPreview} alListo={marcarListo} />
          </View>

          {mensaje ? (
            <Texto tono="secundario" style={estilos.mensaje} accessibilityLiveRegion="polite">
              {mensaje}
            </Texto>
          ) : null}

          <Pressable
            onPress={alCompartirImagen}
            disabled={deshabilitado}
            accessibilityRole="button"
            accessibilityLabel="Compartir imagen"
            style={[estilos.ctaPrimario, { backgroundColor: colores.primary, opacity: deshabilitado ? 0.5 : 1 }]}
          >
            {compartiendo ? (
              <ActivityIndicator color={colores.primaryForeground} size="small" />
            ) : (
              <>
                <Icono nombre="Share2" tamanio={18} color={colores.primaryForeground} />
                <Texto peso="semibold" style={{ color: colores.primaryForeground }}>
                  Compartir imagen
                </Texto>
              </>
            )}
          </Pressable>

          <Pressable
            onPress={compartirTexto}
            accessibilityRole="button"
            accessibilityLabel="Compartir link"
            style={[estilos.ctaOutline, { borderColor: colores.border }]}
          >
            <Icono nombre="Share2" tamanio={18} color={colores.foreground} />
            <Texto peso="semibold">Compartir link</Texto>
          </Pressable>

          <Pressable onPress={onCerrar} accessibilityRole="button" accessibilityLabel="Cerrar" hitSlop={12} style={estilos.cerrar}>
            <Icono nombre="X" tamanio={20} color={colores.foreground} />
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  )
}

const estilos = StyleSheet.create({
  fondoOscuro: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  // `maxHeight: '100%'` (del espacio que le queda al `ScrollView` dentro de
  // `fondoOscuro`, que es `flex: 1`): sin un alto acotado, un `ScrollView`
  // crece con su contenido igual que un `View` y nunca llega a scrollear.
  hojaScroll: { maxHeight: '100%' },
  hoja: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, padding: 20, gap: 12, alignItems: 'center' },
  previa: { marginBottom: 8 },
  mensaje: { fontSize: 13, textAlign: 'center' },
  ctaPrimario: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, paddingVertical: 14, width: '100%' },
  ctaOutline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, paddingVertical: 14, borderWidth: 1, width: '100%' },
  cerrar: { paddingVertical: 8 },
})
