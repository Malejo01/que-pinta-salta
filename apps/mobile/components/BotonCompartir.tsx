// Botón de compartir (R29, 29-b: F14, ops/paridad-web-app.md §3.3 y §3.4).
// El armado del mensaje es el que tenía la ficha (`app/evento/[id].tsx`,
// 26-c), **movido sin cambiarlo**: siempre lleva `urlEvento(id, 'app')`
// (nunca datos de la sesión) — mismo detector de siempre,
// `tests/compartir-ficha.test.ts`. Se usa en la ficha (junto al corazón,
// 40, fondo `muted`) y en la tarjeta (32, fondo oscuro `bg-black/60`, la
// web no lo tiene en la ficha pero sí en la card).
import { Pressable, Share, StyleSheet } from 'react-native'
import { urlEvento } from '@qps/core/metricas/links'
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
}

export function BotonCompartir({ eventId, titulo, fecha, hora, lugar, tamanio = 40, fondo = 'muted' }: BotonCompartirProps) {
  const colores = useColoresQPS()

  async function compartir() {
    const url = urlEvento(eventId, 'app')
    if (!url) return
    const mensaje = `${titulo}\n${fecha}${hora ? ` · ${hora} hs` : ''} · ${lugar}\n${url}`
    try {
      await Share.share({ message: mensaje })
    } catch {
      // El usuario canceló o no hay con qué compartir: no es un error que mostrar.
    }
  }

  const fondoColor = fondo === 'oscuro' ? 'rgba(0,0,0,0.6)' : colores.muted
  const colorIcono = fondo === 'oscuro' ? '#fff' : colores.foreground

  return (
    <Pressable
      onPress={compartir}
      accessibilityRole="button"
      accessibilityLabel="Compartir"
      style={[estilos.boton, { width: tamanio, height: tamanio, borderRadius: tamanio / 2, backgroundColor: fondoColor }]}
    >
      <Icono nombre="Share2" tamanio={Math.round(tamanio * 0.45)} color={colorIcono} />
    </Pressable>
  )
}

const estilos = StyleSheet.create({
  boton: { alignItems: 'center', justifyContent: 'center' },
})
