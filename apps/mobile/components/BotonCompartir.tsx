// Botón de compartir (R29, 29-b: F14, ops/paridad-web-app.md §3.3 y §3.4).
// El armado del mensaje es el que tenía la ficha (`app/evento/[id].tsx`,
// 26-c), **movido sin cambiarlo**: siempre lleva `urlEvento(id, 'app')`
// (nunca datos de la sesión) — mismo detector de siempre,
// `tests/compartir-ficha.test.ts`. Se usa en la ficha (junto al corazón,
// 40, fondo `muted`) y en la tarjeta (32, fondo oscuro `bg-black/60`, la
// web no lo tiene en la ficha pero sí en la card).
//
// R42, 42-b: el armado del texto se movió a `mensajeCompartirEvento`
// (`lib/compartir.ts`), **sin cambiarlo** — es la tercera forma válida del
// mismo detector.
//
// R42, 42-d: prop opcional `tarjeta` — con ella, tocar abre
// `HojaCompartirTarjeta` (la vista previa 4:5 con "Compartir imagen" y
// "Compartir link") en vez de compartir el texto directo. `compartir()`
// sigue siendo la MISMA función de siempre (sin cambiarla, mismo
// `Share.share` que acepta el detector): la hoja la recibe como
// `compartirTexto` y la usa para "Compartir link" y para la caída cuando no
// hay cómo compartir una imagen (ver el comentario de `HojaCompartirTarjeta.tsx`).
// Sin la prop (las tarjetas de Inicio y Buscar), nada cambia.
import { useState } from 'react'
import { Pressable, Share, StyleSheet } from 'react-native'
import { mensajeCompartirEvento, type DatosTarjetaCompartir } from '@/lib/compartir'
import { HojaCompartirTarjeta } from '@/components/HojaCompartirTarjeta'
import { Icono } from '@/components/Icono'
import { useColoresQPS } from '@/lib/colores'

export interface BotonCompartirProps {
  eventId: string
  titulo: string
  fecha: string
  hora?: string | null
  lugar: string
  /** 40 por defecto (junto al corazón de la ficha); la tarjeta pasa 32. */
  tamanio?: number
  /** `'muted'` por defecto (ficha); la tarjeta pasa `'oscuro'` (`bg-black/60`). */
  fondo?: 'muted' | 'oscuro'
  /** Solo la ficha la pasa (42-d): con ella, tocar abre la hoja de
   * "Compartir imagen"/"Compartir link" en vez de compartir el texto. */
  tarjeta?: DatosTarjetaCompartir
}

export function BotonCompartir({ eventId, titulo, fecha, hora, lugar, tamanio = 40, fondo = 'muted', tarjeta }: BotonCompartirProps) {
  const colores = useColoresQPS()
  const [hojaVisible, setHojaVisible] = useState(false)

  async function compartir() {
    const mensaje = mensajeCompartirEvento({ eventId, titulo, fecha, hora, lugar })
    if (!mensaje) return
    try {
      await Share.share({ message: mensaje })
    } catch {
      // El usuario canceló o no hay con qué compartir: no es un error que mostrar.
    }
  }

  function alTocar() {
    if (tarjeta) {
      setHojaVisible(true)
    } else {
      compartir()
    }
  }

  const fondoColor = fondo === 'oscuro' ? 'rgba(0,0,0,0.6)' : colores.muted
  const colorIcono = fondo === 'oscuro' ? '#fff' : colores.foreground

  return (
    <>
      <Pressable
        onPress={alTocar}
        accessibilityRole="button"
        accessibilityLabel="Compartir"
        style={[estilos.boton, { width: tamanio, height: tamanio, borderRadius: tamanio / 2, backgroundColor: fondoColor }]}
      >
        <Icono nombre="Share2" tamanio={Math.round(tamanio * 0.45)} color={colorIcono} />
      </Pressable>

      {tarjeta ? (
        <HojaCompartirTarjeta visible={hojaVisible} datos={tarjeta} compartirTexto={compartir} onCerrar={() => setHojaVisible(false)} />
      ) : null}
    </>
  )
}

const estilos = StyleSheet.create({
  boton: { alignItems: 'center', justifyContent: 'center' },
})
