// Chip "Para chicos" de la portada (A3, nube Q1): un interruptor (prendido/
// apagado) aparte de la categoría elegida y de "Gratis". Va después de
// "Gratis" en la fila de filtros fija de la cabecera de la portada
// (`filaFiltros` de `app/(tabs)/index.tsx`, ronda de correcciones de A3: antes
// iba adentro de la fila con scroll de `ChipsCategorias`). Buscar tiene su
// propio chip "Para chicos" al lado de "Solo gratis".
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
//     negrita y el ícono cambia del globo (`Balloon`) al tilde (`Check`), los
//     dos de `components/Icono.tsx` y del mismo tamaño. Ronda de correcciones
//     de A3: antes era `Baby`, que sonaba a bebés y repetía el ícono de la
//     categoría Infantil.
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
      <Icono nombre={activo ? 'Check' : 'Balloon'} tamanio={16} color={activo ? colores.primaryForeground : colores.foreground} />
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
