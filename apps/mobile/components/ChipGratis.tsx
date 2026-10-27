// Chip "Gratis" de la portada (A2, nube Q1): un interruptor (prendido/apagado)
// aparte de la categoría elegida. Lo dibuja `ChipsCategorias` adelante de
// "Todas", con un separador vertical en el medio, solo si le pasan la prop
// `gratis` (la portada); Buscar no se la pasa y tiene su propio "Solo gratis".
//
// Se distingue de los chips de categoría por ser un filtro aparte: va primero
// y separado, prendido va RELLENO de `primary` (los de categoría van con tinte
// y contorno), y lleva su propio ícono. Mismo aspecto que el chip "Solo
// gratis" de `app/(tabs)/buscar.tsx` (relleno al prenderse), así el filtro se
// reconoce igual en las dos pantallas.
//
// Accesibilidad:
//   - `accessibilityRole="button"` con `accessibilityState={{ selected }}`,
//     como "Solo gratis" de Buscar y los demás chips: es la convención de la
//     app para un botón que se prende y se apaga (ver `tests/a11y/rol-estado.ts`;
//     "switch" haría que TalkBack lo lea como un interruptor de ajustes, y
//     acá es un chip más de la fila). Etiqueta "Solo eventos gratis": dice
//     qué hace, y contiene la palabra visible "Gratis" (control por voz).
//   - Área táctil: `minHeight: 48` en la clave de estilo del Pressable (la
//     mira el detector `area-chica`).
//   - Prendido se distingue por la forma y no solo por el color (R72, 72-c):
//     relleno en vez de contorno, contorno de 2 (apagado, de 1; el padding
//     compensa el borde para que el chip no salte de tamaño), texto en negrita
//     y el ícono cambia de la entrada (`Ticket`) al tilde (`Check`), los dos
//     de `components/Icono.tsx` y del mismo tamaño.
//   - Colores de `useColoresQPS()` y el borde apagado con `bordeChipInactivo`
//     (3:1 contra el fondo en claro y en oscuro, R69, 69-b).
import { Pressable, StyleSheet } from 'react-native'
import { Icono } from '@/components/Icono'
import { Texto } from '@/components/Texto'
import { bordeChipInactivo, useColoresQPS } from '@/lib/colores'

export interface ChipGratisProps {
  activo: boolean
  onCambiar: (activo: boolean) => void
}

export function ChipGratis({ activo, onCambiar }: ChipGratisProps) {
  const colores = useColoresQPS()
  const bordeInactivo = bordeChipInactivo(colores)

  return (
    <Pressable
      onPress={() => onCambiar(!activo)}
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      // A2, ronda de correcciones: "Gratis, botón" sonaba a una categoría más;
      // la etiqueta dice qué filtra (el texto visible sigue siendo "Gratis").
      accessibilityLabel="Solo eventos gratis"
      style={[
        estilos.chipGratis,
        // 2 + 15 = 1 + 16 y 2 + 9 = 1 + 10: mide lo mismo prendido y apagado.
        activo
          ? { backgroundColor: colores.primary, borderWidth: 2, borderColor: colores.primary, paddingHorizontal: 15, paddingVertical: 9 }
          : { backgroundColor: colores.card, borderWidth: 1, borderColor: bordeInactivo },
      ]}
    >
      <Icono nombre={activo ? 'Check' : 'Ticket'} tamanio={16} color={activo ? colores.primaryForeground : colores.foreground} />
      <Texto peso={activo ? 'bold' : 'semibold'} style={{ color: activo ? colores.primaryForeground : colores.foreground }}>
        Gratis
      </Texto>
    </Pressable>
  )
}

const estilos = StyleSheet.create({
  chipGratis: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 48,
  },
})
