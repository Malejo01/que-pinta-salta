import { Redirect } from 'expo-router'

/** Cualquier ruta que no existe vuelve a Inicio. */
export default function NoEncontrado() {
  return <Redirect href="/" />
}
