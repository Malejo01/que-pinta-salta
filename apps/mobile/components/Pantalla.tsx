import { Text, View } from 'react-native'

/** Pantalla de lugar del esqueleto: el contenido real llega en las noches 9 a 11. */
export function Pantalla({ titulo }: { titulo: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>{titulo}</Text>
    </View>
  )
}
