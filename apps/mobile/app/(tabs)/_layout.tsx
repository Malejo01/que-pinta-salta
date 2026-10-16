import { Tabs } from 'expo-router'
import type { ColorValue } from 'react-native'
import { Icono, type NombreIcono } from '@/components/Icono'

// Las 4 pestañas (decisión 1 de Mauro, 13/10): Inicio · Buscar · Favoritos · Cuenta.
// Íconos (QPS-125, decisión 4): siempre el nombre por plataforma, nunca un
// string suelto (con un string suelto Android no dibuja nada, según la doc
// de expo-symbols del SDK 57).
const ICONOS: Record<'inicio' | 'buscar' | 'favoritos' | 'cuenta', NombreIcono> = {
  inicio: { ios: 'house.fill', android: 'home' },
  buscar: { ios: 'magnifyingglass', android: 'search' },
  favoritos: { ios: 'heart.fill', android: 'favorite' },
  cuenta: { ios: 'person.circle.fill', android: 'account_circle' },
}

// Componente con nombre (no una flecha anónima): evita el warning de
// `react/display-name` (QPS-140, ítem 1). No cambia nada visible.
function crearTabBarIcon(nombre: NombreIcono) {
  function TabBarIcon({ color }: { color: ColorValue }) {
    return <Icono nombre={nombre} color={color} />
  }
  return TabBarIcon
}

export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: 'Inicio', tabBarIcon: crearTabBarIcon(ICONOS.inicio) }} />
      <Tabs.Screen name="buscar" options={{ title: 'Buscar', tabBarIcon: crearTabBarIcon(ICONOS.buscar) }} />
      <Tabs.Screen
        name="favoritos"
        options={{ title: 'Favoritos', tabBarIcon: crearTabBarIcon(ICONOS.favoritos) }}
      />
      <Tabs.Screen name="cuenta" options={{ title: 'Cuenta', tabBarIcon: crearTabBarIcon(ICONOS.cuenta) }} />
    </Tabs>
  )
}
