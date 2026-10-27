// Chip "Para chicos" de la portada (A3, nube Q1): un interruptor (prendido/
// apagado) aparte de la categoría elegida y de "Gratis". Lo dibuja
// `ChipsCategorias` después de "Gratis" y antes del separador, solo si le pasan
// la prop `paraChicos` (la portada); Buscar no se la pasa y tiene su propio
// chip "Para chicos" al lado de "Solo gratis".
//
// Mismo patrón que `components/ChipGratis.tsx` (A2), a propósito copiado y no
// generalizado en un `ChipFiltro`: A2 todavía no está mergeado y sus
// detectores (`tests/portada-gratis.test.ts`) leen ChipGratis.tsx tal cual;
// generalizarlo ahora reescribiría su chip y sus tests en dos ramas a la vez.
// Si se suma un tercer filtro, ahí sí conviene un `ChipFiltro`.
//
// Accesibilidad (las mismas reglas que "Gratis"):
//   - `accessibilityRole="button"` con `accessibilityState={{ selected }}`
//     (la convención de la app para un botón que se prende y se apaga, ver
//     `tests/a11y/rol-estado.ts`). Etiqueta "Solo eventos para chicos": dice
//     qué filtra y contiene las palabras visibles "Para chicos" (control por voz).
//   - Área táctil: `minHeight: 48` en la clave de estilo del Pressable (la
//     mira el detector `area-chica`).
//   - Prendido se distingue por la forma y no solo por el color (R72, 72-c):
//     relleno, contorno de 2 (apagado, de 1; el padding compensa el borde),
//     negrita y el ícono cambia de `Baby` (el mismo de la categoría Infantil,
//     así el chip se asocia con lo infantil) al tilde (`Check`), los dos de
//     `components/Icono.tsx` y del mismo tamaño.
//   - Colores de `useColoresQPS()` y el borde apagado con `bordeChipInactivo`
//     (3:1 contra el fondo en claro y en oscuro, R69, 69-b).
import { Pressable, StyleSheet } from 'react-native'
import { Icono } from '@/components/Icono'
import { Texto } from '@/components/Texto'
import { bordeChipInactivo, useColoresQPS } from '@/lib/colores'

export interface ChipParaChicosProps {
  activo: boolean
  onCambiar: (activo: boolean) => void
}

export function ChipParaChicos({ activo, onCambiar }: ChipParaChicosProps) {
  const colores = useColoresQPS()
  const bordeInactivo = bordeChipInactivo(colores)

  return (
    <Pressable
      onPress={() => onCambiar(!activo)}
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      accessibilityLabel="Solo eventos para chicos"
      style={[
        estilos.chipParaChicos,
        // 2 + 15 = 1 + 16 y 2 + 9 = 1 + 10: mide lo mismo prendido y apagado.
        activo
          ? { backgroundColor: colores.primary, borderWidth: 2, borderColor: colores.primary, paddingHorizontal: 15, paddingVertical: 9 }
          : { backgroundColor: colores.card, borderWidth: 1, borderColor: bordeInactivo },
      ]}
    >
      <Icono nombre={activo ? 'Check' : 'Baby'} tamanio={16} color={activo ? colores.primaryForeground : colores.foreground} />
      <Texto peso={activo ? 'bold' : 'semibold'} style={{ color: activo ? colores.primaryForeground : colores.foreground }}>
        Para chicos
      </Texto>
    </Pressable>
  )
}

const estilos = StyleSheet.create({
  chipParaChicos: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 48,
  },
})
