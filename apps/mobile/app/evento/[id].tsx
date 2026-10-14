import { Redirect, useLocalSearchParams } from 'expo-router'
import { Pantalla } from '@/components/Pantalla'
import { esUuid } from '@/lib/links'

/**
 * Ficha de un evento (el contenido real llega en la noche 10). Si el `id`
 * de la ruta no es un uuid, vuelve a Inicio: no hay nada que mostrar ni que
 * pedir a la red.
 */
export default function EventoPorId() {
  const { id } = useLocalSearchParams<{ id: string }>()

  if (!esUuid(id)) {
    return <Redirect href="/" />
  }

  return <Pantalla titulo={`Evento ${id}`} />
}
