import { StyleSheet, type ColorValue } from 'react-native'
import { Tabs } from 'expo-router'
import { Encabezado } from '@/components/Encabezado'
import { EtiquetaPestana } from '@/components/EtiquetaPestana'
import { Icono, type NombreIcono } from '@/components/Icono'
import { useColoresQPS } from '@/lib/colores'

// Las 4 pestañas de la barra de abajo de la web (ops/paridad-web-app.md §2
// punto 8 y §3.1; inventario-web-mobile.md "Navegación"): Inicio · Buscar ·
// Radar · Favoritos, mismos íconos lucide que `mobile-nav.tsx`. Cuenta sigue
// existiendo como ruta (`/cuenta`, con `href: null` más abajo) pero ya no es
// una pestaña: entra desde el header (`components/Encabezado.tsx`).
const ICONOS: Record<'inicio' | 'buscar' | 'radar' | 'favoritos', NombreIcono> = {
  inicio: 'Home',
  buscar: 'Search',
  radar: 'Radio',
  favoritos: 'Heart',
}

// Componente con nombre (no una flecha anónima): evita el warning de
// `react/display-name` (QPS-140, ítem 1). El ícono activo va en `primary`
// con el relleno al 20% (`fill-primary/20` en la web, acá `${hexPrimary}33`);
// inactivo, sin relleno. `colorHexActivo` es el hex de `colores.primary`
// (fijo, de `useColoresQPS`), no el `color` que manda react-navigation
// (puede ser un `ColorValue` opaco, no siempre un string con el que armar
// un sufijo de opacidad).
function crearTabBarIcon(nombre: NombreIcono, colorHexActivo: string) {
  function TabBarIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Icono nombre={nombre} color={color} fill={focused ? `${colorHexActivo}33` : 'none'} tamanio={20} />
  }
  return TabBarIcon
}

export default function TabsLayout() {
  const colores = useColoresQPS()

  return (
    <Tabs
      screenOptions={{
        header: () => <Encabezado />,
        // QPS-241 (grupo 2): el activo pasa de `primary` a `foreground` —
        // más contraste contra el fondo oscuro de la barra. El inactivo
        // sigue en `mutedForeground` (no son el mismo tono, así que la
        // pestaña activa se sigue distinguiendo por el color del texto,
        // además del relleno del ícono de `crearTabBarIcon`).
        tabBarActiveTintColor: colores.foreground,
        tabBarInactiveTintColor: colores.mutedForeground,
        tabBarLabel: ({ color, children }) => <EtiquetaPestana color={color}>{children}</EtiquetaPestana>,
        tabBarStyle: {
          backgroundColor: `${colores.background}E6`,
          borderTopColor: colores.border,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Inicio', tabBarIcon: crearTabBarIcon(ICONOS.inicio, colores.primary) }}
      />
      <Tabs.Screen
        name="buscar"
        options={{ title: 'Buscar', tabBarIcon: crearTabBarIcon(ICONOS.buscar, colores.primary) }}
      />
      <Tabs.Screen
        name="radar"
        options={{ title: 'Radar', tabBarIcon: crearTabBarIcon(ICONOS.radar, colores.primary) }}
      />
      <Tabs.Screen
        name="favoritos"
        options={{ title: 'Mis eventos', tabBarIcon: crearTabBarIcon(ICONOS.favoritos, colores.primary) }}
      />
      {/* Cuenta sale de la barra (decisión A de Mauro) pero conserva su ruta: se
          llega desde el header, nunca desde acá. */}
      <Tabs.Screen name="cuenta" options={{ title: 'Cuenta', href: null }} />
    </Tabs>
  )
}
