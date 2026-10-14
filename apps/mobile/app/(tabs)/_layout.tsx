import { Tabs } from 'expo-router'

// Las 4 pestañas (decisión 1 de Mauro, 13/10): Inicio · Buscar · Favoritos · Cuenta.
// Sin íconos todavía: [COMPLETAR: librería de íconos, pendiente del OK de Mauro].
export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: 'Inicio' }} />
      <Tabs.Screen name="buscar" options={{ title: 'Buscar' }} />
      <Tabs.Screen name="favoritos" options={{ title: 'Favoritos' }} />
      <Tabs.Screen name="cuenta" options={{ title: 'Cuenta' }} />
    </Tabs>
  )
}
