// "Agregar al calendario" en la ficha (R42, 42-c; plan
// `ops/rondas/42-ficha-completa/plan.md`, corregido por el lead el 17/10:
// solo el camino B, sin `abrirPantallaDelSistema` — ver el comentario de
// `lib/calendario/agregar.ts`). El permiso se pide RECIÉN al tocar el
// botón: no hay ningún `useEffect` que llame a `agregarAlCalendario`,
// `pedirPermiso` ni toque el calendario. Mismo estilo visual que el CTA
// "Comprar tickets" (`ctaOutline`, borde `colores.border`) de
// `app/evento/[id].tsx`.
//
// Q6-1b: los textos salen del diccionario (`t.calendario`); `mensajePara`
// recibe el idioma al final (`'es'` por defecto).
import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import * as Linking from 'expo-linking'
import { agregarAlCalendario, type ResultadoAgregar } from '@/lib/calendario/agregar'
import { datosCalendario, puedeAgregarseAlCalendario, type EventoParaCalendario } from '@/lib/calendario/datos'
import { depsDelDispositivo } from '@/lib/calendario/dispositivo'
import { Icono } from '@/components/Icono'
import { Texto } from '@/components/Texto'
import { useColoresQPS } from '@/lib/colores'
import { useIdioma, useTextos } from '@/lib/i18n'
import type { Idioma } from '@/lib/i18n/idioma'
import { textosDe } from '@/lib/i18n/textos'

export interface BotonCalendarioProps {
  evento: EventoParaCalendario
}

export function mensajePara(resultado: ResultadoAgregar, idioma: Idioma = 'es'): string | null {
  const t = textosDe(idioma).calendario
  switch (resultado.tipo) {
    case 'agregado':
      return t.agregado
    case 'sin-permiso':
      return t.sinPermiso
    case 'sin-calendario':
      return t.sinCalendario
    case 'error':
      return t.error
  }
}

export function BotonCalendario({ evento }: BotonCalendarioProps) {
  const colores = useColoresQPS()
  const { idioma } = useIdioma()
  const t = useTextos().calendario
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

  const mensaje = resultado ? mensajePara(resultado, idioma) : null
  const puedeAbrirAjustes = resultado?.tipo === 'sin-permiso' && resultado.puedeAbrirAjustes

  return (
    <View>
      <Pressable
        onPress={alAgregar}
        disabled={cargando || agregado}
        accessibilityRole="button"
        accessibilityLabel={agregado ? t.enTuCalendario : t.agregar}
        style={[estilos.ctaOutline, { borderColor: colores.border }]}
      >
        {cargando ? (
          <ActivityIndicator color={colores.foreground} size="small" />
        ) : (
          <>
            <Icono nombre={agregado ? 'Check' : 'CalendarPlus'} tamanio={18} color={colores.foreground} />
            <Texto peso="semibold" style={estilos.textoCta}>
              {agregado ? t.enTuCalendario : t.agregar}
            </Texto>
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
          accessibilityLabel={t.abrirAjustes}
          hitSlop={10}
          style={estilos.botonAjustes}
        >
          {/* Ronda 49 (QPS-241, grupo 2): `primary` da 3,83 sobre `background`
              como texto chico, abajo de 4,5 — pasa a `foreground` (tono por
              defecto de `Texto`), subrayado para no perder la señal de que
              se toca (no tiene ícono ni borde propio). */}
          <Texto peso="semibold" style={estilos.textoAjustes}>
            {t.abrirAjustes}
          </Texto>
        </Pressable>
      ) : null}
    </View>
  )
}

const estilos = StyleSheet.create({
  ctaOutline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 12, borderWidth: 1 },
  // Q6-1b: con la letra al 200 %, el texto salta de línea (centrado) en vez
  // de pasarse del borde, como «Ver en el mapa de eventos» de la ficha.
  textoCta: { flexShrink: 1, textAlign: 'center' },
  mensaje: { marginTop: 6, fontSize: 13 },
  botonAjustes: { marginTop: 6, paddingVertical: 10, alignSelf: 'flex-start' },
  textoAjustes: { textDecorationLine: 'underline' },
})
